import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { assertRelayHealth } from './relay-health-contract.mjs';

const RELEASE =
  'https://github.com/rudycelekli/kin-connect/releases/download/v0.2.1/kin-people-0.2.1.tgz';
const args = process.argv.slice(2);
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
  const option = args[index],
    value = args[index + 1];
  if (
    !['--package', '--expected-version', '--retention'].includes(option) ||
    !value ||
    options.has(option)
  )
    throw new Error(
      'Usage: node scripts/smoke-npx.mjs [--package URL-or-local.tgz] [--expected-version VERSION] [--retention required|optional]',
    );
  options.set(option, value);
}
const expectedVersion = options.get('--expected-version') || '0.2.1';
const retentionMode = options.get('--retention') || 'optional';
assert.ok(
  ['required', 'optional'].includes(retentionMode),
  'Retention mode must be required or optional.',
);
assert.match(
  expectedVersion,
  /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/,
  'Expected version must be an explicit release version.',
);
const source = options.get('--package') || RELEASE;
const packageURL = /^(?:https?:\/\/|file:)/i.test(source)
  ? new URL(source)
  : pathToFileURL(resolve(source));
assert.ok(
  packageURL.protocol === 'https:' ||
    (packageURL.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(packageURL.hostname)) ||
    (packageURL.protocol === 'file:' && !packageURL.host),
  'Use an HTTPS release URL, or a loopback/file URL for a test fixture.',
);
assert.ok(
  !packageURL.username && !packageURL.password && !packageURL.hash,
  'Package URLs must not contain credentials or fragments.',
);
const localArtifact = packageURL.protocol === 'file:' ? fileURLToPath(packageURL) : null;
if (localArtifact) {
  assert.match(localArtifact, /\.tgz$/i, 'Local package fixtures must be .tgz files.');
  await access(localArtifact);
}
const packageSpecifier = localArtifact || packageURL.href;
const [major, minor, patch] = expectedVersion.split(/[.-]/).map(Number);
const hasVersionCommand = major > 0 || minor > 2 || (minor === 2 && patch >= 1);
const runFile = promisify(execFile);

const temporary = await mkdtemp(join(tmpdir(), 'kin-public-npx-'));
const cache = join(temporary, 'npm-cache');
const outside = join(temporary, 'unrelated-working-directory');
const data = join(temporary, 'data');
const environment = { ...process.env };
for (const key of Object.keys(environment))
  if (
    /^KIN_/i.test(key) ||
    ['PORT', 'RAILWAY_PUBLIC_DOMAIN', 'NODE_PATH', 'NODE_OPTIONS'].includes(key.toUpperCase())
  )
    delete environment[key];
environment.KIN_DATA_DIR = data;
environment.npm_config_cache = cache;
environment.npm_config_audit = 'false';
environment.npm_config_fund = 'false';
const pathKey = Object.keys(environment).find((key) => key.toUpperCase() === 'PATH') || 'PATH';
environment[pathKey] = `${dirname(process.execPath)}${delimiter}${environment[pathKey] || ''}`;

let server;
let output = '';
let spawnError;
let closeResult;
let closed;
let base;
let interrupted;
let stopPromise;
const started = Date.now();
const onInterrupt = () => {
  interrupted = 'SIGINT';
};
const onTerminate = () => {
  interrupted = 'SIGTERM';
};
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onTerminate);

function appendOutput(chunk) {
  output = (output + chunk.toString()).slice(-16_000);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function npmCLI() {
  // Invoke the npm JavaScript CLI through this Node executable. In particular, do not
  // pass URL arguments through a Windows cmd.exe shell: npm.cmd is a batch wrapper.
  if (
    process.env.npm_execpath &&
    /npm-cli\.(?:c?js|mjs)$/.test(process.env.npm_execpath) &&
    (await exists(process.env.npm_execpath))
  )
    return realpath(process.env.npm_execpath);
  const candidates = [
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    resolve(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const directory of (environment[pathKey] || '').split(delimiter).filter(Boolean)) {
    const location = directory.replace(/^"(.*)"$/, '$1');
    if (process.platform === 'win32')
      candidates.push(join(location, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    else {
      const executable = join(location, 'npm');
      if (await exists(executable)) candidates.push(await realpath(executable));
    }
  }
  for (const candidate of candidates)
    if (/\.(?:c?js|mjs)$/.test(candidate) && (await exists(candidate))) return candidate;
  throw new Error(
    'Could not locate npm-cli.js. Install Node.js with npm, or run through npm with npm_execpath set.',
  );
}

async function freePort(requested = 0) {
  const probe = createServer();
  await new Promise((accept, reject) => {
    probe.once('error', reject);
    probe.listen(requested, '127.0.0.1', accept);
  });
  const { port } = probe.address();
  await new Promise((accept, reject) => probe.close((error) => (error ? reject(error) : accept())));
  return port;
}

async function request(path) {
  const response = await fetch(new URL(path, base), {
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return response;
}

async function waitForServer() {
  const deadline = started + 180_000;
  while (Date.now() < deadline) {
    if (interrupted) throw new Error(`Interrupted by ${interrupted}.`);
    if (spawnError) throw spawnError;
    if (closeResult)
      throw new Error(
        `npm-exec exited before readiness (${closeResult.signal || closeResult.code}).\n${output}`,
      );
    try {
      const response = await fetch(new URL('/api/health', base), {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok && output.includes('Kin is ready')) return;
    } catch {
      /* A cold cache must download the release and production dependencies first. */
    }
    await delay(200);
  }
  throw new Error(`Public release did not become ready within 180 seconds.\n${output}`);
}

async function findInstalledRelease() {
  const executions = join(cache, '_npx');
  const installations = [];
  for (const entry of await readdir(executions, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packagePath = join(executions, entry.name, 'node_modules', 'kin-people');
    if (await exists(join(packagePath, 'package.json')))
      // npm writes relative file: lock entries against its lexical cache path. macOS
      // /var -> /private/var symlinks must not change the base used to resolve them.
      installations.push(packagePath);
  }
  assert.equal(
    installations.length,
    1,
    'Fresh npm cache must contain exactly one installed Kin release.',
  );
  return installations[0];
}

async function directoryBytes(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) bytes += await directoryBytes(path);
    else if (entry.isFile()) bytes += (await lstat(path)).size;
    // Do not follow .bin or dependency symlinks outside the measured directory.
  }
  return bytes;
}

async function portIsOpen() {
  if (!base) return false;
  try {
    await fetch(new URL('/api/health', base), { signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}

async function signalTree(force, target = server) {
  if (!target?.pid) return;
  if (process.platform !== 'win32') {
    try {
      process.kill(-target.pid, force ? 'SIGKILL' : 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    return;
  }
  // Node cannot deliver a POSIX SIGTERM to Windows console descendants. Use a
  // scoped process-tree cleanup, and report this limitation rather than claim graceful signals.
  await new Promise((accept, reject) => {
    const child = spawn('taskkill.exe', ['/PID', String(target.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    const deadline = setTimeout(() => {
      child.kill();
      reject(new Error('Windows process-tree cleanup did not finish within five seconds.'));
    }, 5_000);
    child.once('error', (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    child.once('close', () => {
      clearTimeout(deadline);
      accept();
    });
  });
}

function stopServer() {
  if (stopPromise) return stopPromise;
  stopPromise = (async () => {
    if (!server) return;
    await signalTree(false);
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      if (closeResult && !(await portIsOpen())) {
        if (process.platform !== 'win32')
          assert.ok(
            closeResult.code === 0 || closeResult.code === 143 || closeResult.signal === 'SIGTERM',
            `Unexpected npm-exec shutdown: ${JSON.stringify(closeResult)}.\n${output}`,
          );
        return;
      }
      await delay(100);
    }
    await signalTree(true);
    await Promise.race([closed, delay(3_000)]);
    assert.ok(
      !(await portIsOpen()),
      'Installed release is still listening after process-tree cleanup.',
    );
    throw new Error(
      'Installed release required forced shutdown instead of completing normal cleanup.',
    );
  })();
  return stopPromise;
}

async function checkDataDirectoryExclusion(installed, bin) {
  const marker = join(data, '.kin-process.lock');
  const originalMarker = await readFile(marker, 'utf8');
  const secondPort = await freePort();
  assert.notEqual(`http://127.0.0.1:${secondPort}`, base);
  const contender = spawn(
    process.execPath,
    [resolve(installed, bin), '--no-open', '--port', String(secondPort)],
    {
      cwd: outside,
      env: environment,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let contenderOutput = '';
  let contenderClosed = false;
  let deadline;
  const collect = (chunk) => {
    contenderOutput = (contenderOutput + chunk.toString()).slice(-16_000);
  };
  contender.stdout.on('data', collect);
  contender.stderr.on('data', collect);
  const completion = new Promise((accept, reject) => {
    contender.once('error', reject);
    contender.once('close', (code, signal) => {
      contenderClosed = true;
      accept({ code, signal });
    });
  });
  try {
    const result = await Promise.race([
      completion,
      new Promise((_, reject) => {
        deadline = setTimeout(
          () =>
            reject(
              new Error(
                `Second data-directory owner did not exit within five seconds.\n${contenderOutput}`,
              ),
            ),
          5_000,
        );
      }),
    ]);
    assert.ok(
      Number.isInteger(result.code) && result.code !== 0 && result.signal === null,
      `Second data-directory owner must refuse startup. ${JSON.stringify(result)}\n${contenderOutput}`,
    );
    assert.match(contenderOutput, /Kin data directory is already in use or has a stale lock/);
    // Binding the exact second port must succeed, even if a broken contender's
    // listener would not respond to HTTP health requests.
    await freePort(secondPort);
    assert.equal(
      await readFile(marker, 'utf8'),
      originalMarker,
      'Contender changed the live lock.',
    );
    assert.equal((await request('/api/health')).status, 200, 'Original owner must remain healthy.');
  } finally {
    clearTimeout(deadline);
    if (!contenderClosed) {
      await signalTree(true, contender);
      await Promise.race([
        completion.catch(() => undefined),
        delay(3_000, undefined, { ref: false }),
      ]);
      assert.ok(contenderClosed, 'Second process did not exit after scoped process-tree cleanup.');
    }
  }
}

try {
  await mkdir(cache);
  await mkdir(outside);
  assert.deepEqual(await readdir(cache), [], 'npm cache must start empty.');
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const cli = await npmCLI();
  const npmVersion = (
    await runFile(process.execPath, [cli, '--version'], {
      cwd: outside,
      env: environment,
      timeout: 5_000,
      maxBuffer: 16_000,
      windowsHide: true,
    })
  ).stdout.trim();
  server = spawn(
    process.execPath,
    [
      cli,
      'exec',
      '--yes',
      '--cache',
      cache,
      '--global=false',
      `--package=${packageSpecifier}`,
      '--',
      'kin',
      '--no-open',
      '--port',
      String(port),
    ],
    {
      cwd: outside,
      env: environment,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server.stdout.on('data', appendOutput);
  server.stderr.on('data', appendOutput);
  server.once('error', (error) => {
    spawnError = error;
  });
  closed = new Promise((accept) =>
    server.once('close', (code, signal) => {
      closeResult = { code, signal };
      accept(closeResult);
    }),
  );
  await waitForServer();
  const readySeconds = (Date.now() - started) / 1000;

  const installed = await findInstalledRelease();
  const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'kin-people');
  assert.equal(manifest.version, expectedVersion);
  await access(resolve(installed, manifest.bin.kin));
  if (hasVersionCommand) {
    // 0.2.0 predates --version. Newer packed releases must report the installed
    // manifest version without starting another server or opening a browser.
    const versionResult = await runFile(
      process.execPath,
      [resolve(installed, manifest.bin.kin), '--version'],
      {
        cwd: outside,
        env: environment,
        timeout: 5_000,
        maxBuffer: 16_000,
        windowsHide: true,
      },
    );
    assert.equal(versionResult.stdout.trim(), expectedVersion);
  }
  const lock = JSON.parse(
    await readFile(join(dirname(dirname(installed)), 'package-lock.json'), 'utf8'),
  );
  const kinRecord = Object.entries(lock.packages).find(
    ([key, value]) =>
      key.endsWith('/kin-people') ||
      value.name === manifest.name ||
      value.resolved === packageURL.href,
  );
  assert.ok(
    kinRecord,
    `npm-exec lockfile must identify Kin. Entries: ${JSON.stringify(Object.keys(lock.packages))}`,
  );
  const resolvedArtifact = kinRecord[1].resolved;
  if (localArtifact) {
    assert.match(resolvedArtifact, /^file:/, 'npm must install the requested local archive.');
    const resolvedPath = /^file:\/\//.test(resolvedArtifact)
      ? fileURLToPath(new URL(resolvedArtifact))
      : resolve(dirname(dirname(installed)), decodeURIComponent(resolvedArtifact.slice(5)));
    assert.equal(
      await realpath(resolvedPath),
      await realpath(localArtifact),
      'npm must install the requested local archive.',
    );
  } else
    assert.equal(resolvedArtifact, packageURL.href, 'npm must install the requested artifact.');
  const health = await (await request('/api/health')).json();
  assert.equal(health.ok, true);
  assert.equal(health.mode, 'local-demo');
  assertRelayHealth(await (await request('/api/network/health')).json(), {
    requireRetention: retentionMode === 'required',
  });
  const html = await (await request('/')).text();
  assert.match(html, /<title>Kin/);
  assert.match(html, /<div id="root">/);
  const assets = [...html.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css))"/g)].map(
    (match) => match[1],
  );
  assert.ok(
    assets.some((asset) => asset.endsWith('.js')),
    'Release must serve its built JavaScript.',
  );
  assert.ok(
    assets.some((asset) => asset.endsWith('.css')),
    'Release must serve its built CSS.',
  );
  for (const asset of assets) {
    const response = await request(asset);
    assert.ok(
      !response.headers.get('content-type')?.includes('text/html'),
      `Missing asset ${asset}`,
    );
    assert.ok((await response.arrayBuffer()).byteLength > 0, `Empty asset ${asset}`);
  }
  assert.ok((await lstat(data)).isDirectory(), 'Launcher must honor the isolated KIN_DATA_DIR.');
  assert.deepEqual(
    await readdir(outside),
    [],
    'npm-exec must not create a project in the unrelated working directory.',
  );
  if (hasVersionCommand) await checkDataDirectoryExclusion(installed, manifest.bin.kin);
  const cacheBytes = await directoryBytes(cache);
  const installedPackageBytes = await directoryBytes(installed);
  const builtAssetBytes = await directoryBytes(join(installed, 'dist'));
  await stopServer();
  if (hasVersionCommand && process.platform !== 'win32')
    assert.equal(
      await exists(join(data, '.kin-process.lock')),
      false,
      'SIGTERM left a stale data lock.',
    );
  console.log(
    JSON.stringify(
      {
        result: 'passed',
        package: packageURL.href,
        version: manifest.version,
        versionCommandChecked: hasVersionCommand,
        dataDirectoryExclusionChecked: hasVersionCommand,
        processLockRemovedAfterShutdown:
          hasVersionCommand && process.platform !== 'win32' ? true : null,
        node: process.versions.node,
        npm: npmVersion,
        platform: process.platform,
        architecture: process.arch,
        freshCache: true,
        externalWorkingDirectory: true,
        isolatedDataDirectory: true,
        assetsChecked: assets.length,
        readySeconds,
        totalSeconds: (Date.now() - started) / 1000,
        cacheBytes,
        installedPackageBytes,
        builtAssetBytes,
        shutdown:
          process.platform === 'win32'
            ? 'scoped Windows process-tree termination; POSIX graceful signal not tested'
            : 'SIGTERM process tree exited and listener closed without SIGKILL',
      },
      null,
      2,
    ),
  );
} finally {
  try {
    await stopServer();
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    if (interrupted) process.exitCode = interrupted === 'SIGINT' ? 130 : 143;
    // Only the directory created by this invocation is ever removed. No global npm cache,
    // owner data, repository checkout, or caller-provided path is a cleanup target.
    await rm(temporary, { recursive: true, force: true });
  }
}
