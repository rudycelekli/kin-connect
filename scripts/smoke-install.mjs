import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

// Run after `npm run build`. Exercise the actual tarball without prepare/install scripts,
// repository files, a package-local dependency tree, or the package as the launch cwd.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(join(tmpdir(), 'kin-installed-release-'));
const prefix = join(temporary, 'installation');
const outside = join(temporary, 'unrelated-working-directory');
const environment = { ...process.env, KIN_DATA_DIR: join(temporary, 'data') };
for (const key of [
  'KIN_PUBLIC_ORIGIN',
  'RAILWAY_PUBLIC_DOMAIN',
  'KIN_ALLOWED_ORIGINS',
  'KIN_DEV_ORIGIN',
  'KIN_URL',
  'KIN_CONNECTION_TOKEN',
  'PORT',
])
  delete environment[key];

let server;
let serverLog = '';
let client;
let transport;

function appendLog(previous, chunk) {
  return (previous + chunk.toString()).slice(-12_000);
}

function run(command, args, cwd) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 120_000);
    child.stdout.on('data', (chunk) => (stdout = appendLog(stdout, chunk)));
    child.stderr.on('data', (chunk) => (stderr = appendLog(stderr, chunk)));
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0)
        reject(new Error(`${command} failed (${signal ?? code}).\n${stderr}\n${stdout}`));
      else accept(stdout);
    });
  });
}

function npm(args, cwd) {
  // npm_execpath lets npm-run scripts use the same CLI even with a custom Node installation.
  return process.env.npm_execpath
    ? run(process.execPath, [process.env.npm_execpath, ...args], cwd)
    : run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, cwd);
}

async function freePort() {
  const probe = createServer();
  await new Promise((accept, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', accept);
  });
  const { port } = probe.address();
  await new Promise((accept, reject) => probe.close((error) => (error ? reject(error) : accept())));
  return port;
}

async function request(base, path, options) {
  const response = await fetch(new URL(path, base), {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.status, 200, `${path}: ${response.status}`);
  return response;
}

async function waitForServer(base) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Error(`Installed launcher exited before readiness.\n${serverLog}`);
    try {
      const response = await fetch(new URL('/api/health', base), {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return;
    } catch {
      // Starting the installed launcher and transpiler can take a moment on a cold CI runner.
    }
    await delay(100);
  }
  throw new Error(`Installed launcher did not become ready.\n${serverLog}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise((accept) => server.once('exit', accept));
  server.kill('SIGTERM');
  if (!(await Promise.race([exited.then(() => true), delay(5_000).then(() => false)]))) {
    server.kill('SIGKILL');
    await exited;
    throw new Error('Installed launcher did not shut down after SIGTERM.');
  }
  assert.equal(server.exitCode, 0, `Installed launcher shutdown failed.\n${serverLog}`);
}

try {
  await mkdir(outside);
  const packed = JSON.parse(
    await npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], project),
  );
  assert.equal(packed.length, 1);
  const tarball = join(temporary, packed[0].filename);
  await access(tarball);
  await npm(
    [
      'install',
      '--prefix',
      prefix,
      '--ignore-scripts',
      '--install-strategy=hoisted',
      '--no-audit',
      '--no-fund',
      tarball,
    ],
    outside,
  );

  const installed = await realpath(join(prefix, 'node_modules', packed[0].name));
  const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  const launcher = resolve(installed, manifest.bin.kin);
  await access(launcher);
  await access(join(prefix, 'node_modules', 'tsx', 'package.json'));
  await assert.rejects(access(join(installed, 'node_modules', 'tsx', 'package.json')));

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [launcher, '--no-open', '--port', String(port)], {
    cwd: outside,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => (serverLog = appendLog(serverLog, chunk)));
  server.stderr.on('data', (chunk) => (serverLog = appendLog(serverLog, chunk)));
  server.once('error', (error) => (serverLog = appendLog(serverLog, error.message)));
  await waitForServer(base);

  const health = await (await request(base, '/api/health')).json();
  assert.equal(health.ok, true);
  assert.equal(health.mode, 'local-demo');
  const networkHealth = await (await request(base, '/api/network/health')).json();
  assert.deepEqual(networkHealth, {
    ok: true,
    protocol: 'kin-relay/0.1',
    privacy: 'encrypted-payloads',
  });
  const html = await (await request(base, '/')).text();
  assert.match(html, /<title>Kin/);
  assert.match(html, /<div id="root">/);
  const assets = [...html.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css))"/g)].map(
    (match) => match[1],
  );
  assert.ok(
    assets.some((asset) => asset.endsWith('.js')),
    'Published build must contain its JS entry.',
  );
  assert.ok(
    assets.some((asset) => asset.endsWith('.css')),
    'Published build must contain its CSS.',
  );
  for (const asset of assets) {
    const response = await request(base, asset);
    assert.ok(
      !response.headers.get('content-type')?.includes('text/html'),
      `Missing asset ${asset}`,
    );
    assert.ok((await response.arrayBuffer()).byteLength > 0, `Empty asset ${asset}`);
  }

  // Pair only a fictional fixture. The generated configuration must launch the installed MCP
  // server with hoisted dependencies while the client remains in an unrelated directory.
  const demo = await request(base, '/api/demo', { method: 'POST' });
  const cookie = demo.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const demoState = await demo.json();
  const pair = await request(base, '/api/agent-connection', {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  const config = (await pair.json()).config.mcpServers.kin;
  assert.equal(config.command, process.execPath);
  assert.equal(config.args.length, 2);
  assert.ok(config.args[0].startsWith(await realpath(join(prefix, 'node_modules', 'tsx'))));
  assert.equal(config.args[1], join(installed, 'server', 'mcp.ts'));
  await Promise.all(config.args.map((path) => access(path)));
  assert.equal(config.env.KIN_URL, base);

  client = new Client({ name: 'kin-installed-release-smoke', version: '1.0.0' });
  transport = new StdioClientTransport({
    ...config,
    cwd: outside,
    env: { ...environment, ...config.env },
    stderr: 'pipe',
  });
  let mcpLog = '';
  transport.stderr.on('data', (chunk) => (mcpLog = appendLog(mcpLog, chunk)));
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      ['kin_decline_or_block', 'kin_discover', 'kin_owner_get', 'kin_owner_update'].sort(),
    );
    const read = await client.callTool({ name: 'kin_owner_get', arguments: {} });
    assert.ok(!read.isError);
    assert.equal(JSON.parse(read.content[0].text).profile.name, demoState.profile.name);
  } catch (error) {
    throw new Error(`Installed pairing configuration failed.\n${mcpLog}`, { cause: error });
  }
  console.log(
    'Packed release passed: hoisted installation, external launch cwd, HTTP/assets, relay health, and actual paired MCP client.',
  );
} finally {
  try {
    await client?.close();
  } finally {
    try {
      await transport?.close();
    } finally {
      try {
        await stopServer();
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
  }
}
