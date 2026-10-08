#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { constants, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') {
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  console.log(manifest.version);
  process.exit(0);
}
if (args.includes('--help')) {
  console.log(
    'Kin — your agent, your people.\n\nUsage: kin [--port 4318] [--no-open]\n       kin --version\n\nYour profile stays in your browser. Local relay data: ~/.kin\nNode.js 22.19 or newer required.',
  );
  process.exit(0);
}
if (
  args.some(
    (value, index) => !['--no-open', '--port'].includes(value) && args[index - 1] !== '--port',
  )
)
  throw new Error('Unknown option. Use kin --help.');
const version = process.versions.node.split('.').map(Number);
if (version[0] < 22 || (version[0] === 22 && version[1] < 19))
  throw new Error('Kin needs Node.js 22.19 or newer.');
const portIndex = args.indexOf('--port');
const requested = Number(portIndex >= 0 ? args[portIndex + 1] : (process.env.PORT ?? 4318));
if (!Number.isInteger(requested) || requested < 1 || requested > 65535)
  throw new Error('Choose a port from 1 to 65535.');
async function available(port) {
  return new Promise((accept, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(() => accept(port)));
  });
}
let port = requested;
const probeAttempts = Math.min(10, 65536 - requested);
for (let offset = 0; offset < probeAttempts; offset++) {
  try {
    port = await available(requested + offset);
    break;
  } catch (error) {
    if (error.code !== 'EADDRINUSE' || portIndex >= 0 || offset === probeAttempts - 1) throw error;
  }
}
const child = spawn(
  process.execPath,
  ['--import', import.meta.resolve('tsx'), resolve(root, 'server/index.ts')],
  {
    cwd: root,
    stdio: ['inherit', 'pipe', 'inherit'],
    env: {
      ...process.env,
      PORT: String(port),
      KIN_DATA_DIR: process.env.KIN_DATA_DIR ?? resolve(homedir(), '.kin'),
    },
  },
);
let opened = false;
const readyMarker = 'Kin is ready';
let readinessTail = '';
child.stdout.on('data', (data) => {
  process.stdout.write(data);
  if (opened) return;
  const readinessText = readinessTail + data.toString();
  // Keep only enough characters to recognize a marker crossing stdout chunk boundaries.
  readinessTail = readinessText.slice(-(readyMarker.length - 1));
  if (readinessText.includes(readyMarker)) {
    opened = true;
    readinessTail = '';
    if (
      !args.includes('--no-open') &&
      !process.env.KIN_PUBLIC_ORIGIN &&
      !process.env.RAILWAY_PUBLIC_DOMAIN
    ) {
      const url = `http://127.0.0.1:${port}`;
      const command =
        process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
      const opener = spawn(
        command,
        process.platform === 'win32' ? ['/c', 'start', '', url] : [url],
        { stdio: 'ignore' },
      );
      opener.once('error', () => console.log(`Open ${url} in your browser.`));
      opener.unref();
    }
  }
});
child.once('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 128 + (constants.signals[signal] ?? 1) : 1);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
