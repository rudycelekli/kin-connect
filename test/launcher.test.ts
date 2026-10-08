import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:net';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { constants, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
interface Fixture {
  root: string;
  openerLog: string;
  probeLog: string;
  run: (
    source: string,
    options?: {
      args?: string[];
      port?: number;
      probes?: Record<string, 'busy' | 'available'>;
      publicOrigin?: string;
    },
  ) => Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }>;
}

/** Real launcher and child subprocesses in a disposable package; never launches a user's browser. */
async function isolated(work: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'kin-launcher-test-'));
  const owned = new Set<ChildProcess>();
  try {
    await mkdir(join(root, 'bin'));
    await mkdir(join(root, 'server'));
    await copyFile(join(repository, 'bin/kin.mjs'), join(root, 'bin/kin.mjs'));
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ type: 'module', version: '0.0.0-fixture' }),
    );
    await symlink(
      join(repository, 'node_modules'),
      join(root, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const openerLog = join(root, 'opener.json');
    const probeLog = join(root, 'probes.json');
    const run: Fixture['run'] = async (source, options = {}) => {
      await writeFile(join(root, 'server/index.ts'), source);
      await rm(openerLog, { force: true });
      await rm(probeLog, { force: true });
      // Intercept only browser opening; the launcher's Node child still runs as a real subprocess.
      // Controlled net probes exercise fixed upper-bound ports without binding another user's port.
      await writeFile(
        join(root, 'preload.mjs'),
        `
        import childProcess from 'node:child_process';
        import net from 'node:net';
        import { EventEmitter } from 'node:events';
        import { writeFileSync } from 'node:fs';
        import { syncBuiltinESMExports } from 'node:module';
        const realSpawn = childProcess.spawn;
        const calls = [];
        childProcess.spawn = (command, args, options) => {
          if (['open', 'xdg-open', 'cmd'].includes(command)) {
            calls.push({ command, args });
            writeFileSync(${JSON.stringify(openerLog)}, JSON.stringify(calls));
            const opener = new EventEmitter();
            opener.unref = () => {};
            return opener;
          }
          return realSpawn(command, args, options);
        };
        const probes = ${JSON.stringify(options.probes ?? null)};
        if (probes) {
          const seen = [];
          net.createServer = () => {
            const probe = new EventEmitter();
            probe.listen = (port, host, ready) => {
              seen.push(port);
              writeFileSync(${JSON.stringify(probeLog)}, JSON.stringify(seen));
              queueMicrotask(() => {
                if (host !== '127.0.0.1' || !(port in probes)) {
                  const error = new Error('Unexpected or out-of-range probe: ' + port);
                  error.code = 'UNEXPECTED_PROBE';
                  probe.emit('error', error);
                } else if (probes[port] === 'busy') {
                  const error = new Error('Fixture occupied loopback port');
                  error.code = 'EADDRINUSE';
                  probe.emit('error', error);
                } else ready();
              });
            };
            probe.close = (closed) => queueMicrotask(closed);
            return probe;
          };
        }
        syncBuiltinESMExports();
      `,
      );
      const child = spawn(
        process.execPath,
        [
          '--import',
          join(root, 'preload.mjs'),
          join(root, 'bin/kin.mjs'),
          ...(options.args ?? ['--no-open']),
        ],
        {
          cwd: root,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            TEMP: tmpdir(),
            TMP: tmpdir(),
            PORT: String(options.port ?? 4318),
            KIN_DATA_DIR: join(root, 'data'),
            ...(options.publicOrigin ? { KIN_PUBLIC_ORIGIN: options.publicOrigin } : {}),
          },
        },
      );
      owned.add(child);
      let stdout = '';
      let stderr = '';
      child.stdout!.on('data', (data) => {
        stdout += data.toString();
      });
      child.stderr!.on('data', (data) => {
        stderr += data.toString();
      });
      return await new Promise((accept, reject) => {
        const timeout = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error('Isolated launcher timed out.'));
        }, 10_000);
        child.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once('close', (code, signal) => {
          clearTimeout(timeout);
          owned.delete(child);
          accept({ code, signal, stdout, stderr });
        });
      });
    };
    await work({ root, openerLog, probeLog, run });
  } finally {
    for (const child of owned) child.kill('SIGTERM');
    await Promise.all(
      [...owned].map((child) => new Promise<void>((accept) => child.once('close', () => accept()))),
    );
    await rm(root, { recursive: true, force: true });
  }
}

async function occupiedLoopback(
  work: (port: number, server: Server) => Promise<void>,
): Promise<void> {
  const server = createServer((socket) => socket.end('fixture remains alive'));
  try {
    await new Promise<void>((accept, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', accept);
    });
    await work((server.address() as { port: number }).port, server);
  } finally {
    await new Promise<void>((accept) => server.close(() => accept()));
  }
}

test('implicit probing stops at port 65535 and reports occupied-port failure without overflow', async () => {
  await isolated(async ({ run, probeLog }) => {
    const result = await run('console.log("CHILD-MUST-NOT-START")', {
      port: 65535,
      probes: { 65535: 'busy' },
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /EADDRINUSE/);
    assert.doesNotMatch(result.stderr, /UNEXPECTED_PROBE|ERR_SOCKET_BAD_PORT|65536/);
    assert.equal(result.stdout.includes('CHILD-MUST-NOT-START'), false);
    assert.deepEqual(JSON.parse(await readFile(probeLog, 'utf8')), [65535]);
  });
});

test('implicit probing can use the last valid port when the preceding port is busy', async () => {
  await isolated(async ({ run, probeLog }) => {
    const result = await run('console.log("CHILD-PORT:" + process.env.PORT)', {
      port: 65534,
      probes: { 65534: 'busy', 65535: 'available' },
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /CHILD-PORT:65535/);
    assert.deepEqual(JSON.parse(await readFile(probeLog, 'utf8')), [65534, 65535]);
  });
});

test('explicit occupied loopback port fails without launching a child or disturbing its listener', async () => {
  await occupiedLoopback(async (port, listener) => {
    await isolated(async ({ run }) => {
      const result = await run('console.log("CHILD-MUST-NOT-START")', {
        args: ['--port', String(port), '--no-open'],
        port,
      });
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /EADDRINUSE/);
      assert.doesNotMatch(result.stdout, /CHILD-MUST-NOT-START/);
      assert.equal(listener.listening, true);
    });
  });
});

test('implicit occupied loopback port selects a nearby free port and isolated data directory', async () => {
  await occupiedLoopback(async (port, listener) => {
    await isolated(async ({ run, root }) => {
      const result = await run(
        'console.log(JSON.stringify({port:Number(process.env.PORT),data:process.env.KIN_DATA_DIR}))',
        { port },
      );
      assert.equal(result.code, 0, result.stderr);
      const output = JSON.parse(result.stdout.trim()) as { port: number; data: string };
      assert.ok(output.port > port && output.port <= Math.min(65535, port + 9));
      assert.equal(output.data, join(root, 'data'));
      assert.equal(listener.listening, true);
    });
  });
});

test('signal-killed server child produces a non-success conventional launcher exit status', async () => {
  await isolated(async ({ run }) => {
    const result = await run('process.kill(process.pid, "SIGTERM")', {
      probes: { 4318: 'available' },
    });
    assert.equal(result.signal, null);
    assert.notEqual(result.code, 0);
    if (process.platform !== 'win32') assert.equal(result.code, 128 + constants.signals.SIGTERM);
  });
});

test('ordinary child failure and success retain their exact exit codes', async () => {
  await isolated(async ({ run }) => {
    assert.equal((await run('process.exitCode=7', { probes: { 4318: 'available' } })).code, 7);
    assert.equal((await run('process.exitCode=0', { probes: { 4318: 'available' } })).code, 0);
  });
});

const splitReadiness = `
  process.stdout.write('prefix Ki');
  setTimeout(() => process.stdout.write('n is '), 100);
  setTimeout(() => process.stdout.write('ready\\n'), 200);
`;
test('readiness across separate stdout writes opens once with the selected loopback URL', async () => {
  await isolated(async ({ run, openerLog }) => {
    const result = await run(splitReadiness, { args: [], probes: { 4318: 'available' } });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /prefix Kin is ready\n/);
    const calls = JSON.parse(await readFile(openerLog, 'utf8')) as {
      command: string;
      args: string[];
    }[];
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args.at(-1), 'http://127.0.0.1:4318');
  });
});

test('repeated readiness markers do not launch additional browser processes', async () => {
  await isolated(async ({ run, openerLog }) => {
    const result = await run(
      'console.log("Kin is ready"); setTimeout(()=>console.log("Kin is ready again"), 100)',
      { args: [], probes: { 4318: 'available' } },
    );
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(await readFile(openerLog, 'utf8')).length, 1);
  });
});

test('split readiness never opens with --no-open or a configured public origin', async () => {
  await isolated(async ({ run, openerLog }) => {
    for (const options of [
      { args: ['--no-open'] },
      { args: [], publicOrigin: 'https://public.invalid' },
    ]) {
      const result = await run(splitReadiness, { ...options, probes: { 4318: 'available' } });
      assert.equal(result.code, 0, result.stderr);
      await assert.rejects(readFile(openerLog), { code: 'ENOENT' });
    }
  });
});
