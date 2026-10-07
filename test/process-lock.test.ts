import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireDataDirectoryLock } from '../server/process-lock.js';

const lockPath = (directory: string) => join(directory, '.kin-process.lock');
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
const busy = (error: unknown) =>
  error instanceof Error &&
  error.message.startsWith('Kin data directory is already in use or has a stale lock.') &&
  error.message.includes('only after confirming no process uses it.');

async function temporaryDirectory() {
  return mkdtemp(join(tmpdir(), 'kin-process-lock-'));
}

test('another independent process cannot own the same data directory', async () => {
  const directory = await temporaryDirectory();
  const moduleURL = new URL('../server/process-lock.ts', import.meta.url).href;
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      String.raw`import { acquireDataDirectoryLock } from ${JSON.stringify(moduleURL)};
       const release = await acquireDataDirectoryLock(${JSON.stringify(directory)});
       process.stdout.write('held\n');
       process.stdin.once('data', async () => {
         await release();
         process.exit(0);
       });`,
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Lock holder did not start.')), 10_000);
      let stdout = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (stdout.includes('held\n')) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error(`Lock holder exited before readiness: ${stderr}`));
      });
    });
    const before = await readFile(lockPath(directory), 'utf8');
    const marker = JSON.parse(before);
    assert.equal(marker.pid, child.pid);
    assert.equal(typeof marker.token, 'string');
    await assert.rejects(acquireDataDirectoryLock(directory), busy);
    assert.equal(await readFile(lockPath(directory), 'utf8'), before);
    child.stdin.end('release\n');
    assert.equal(await exited, 0);
  } finally {
    if (child.exitCode === null) child.kill();
    await exited.catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});

test('different data directories can be held independently', async () => {
  const directory = await temporaryDirectory();
  let releaseFirst: (() => Promise<void>) | undefined;
  let releaseSecond: (() => Promise<void>) | undefined;
  try {
    releaseFirst = await acquireDataDirectoryLock(join(directory, 'first'));
    releaseSecond = await acquireDataDirectoryLock(join(directory, 'second'));
    assert.notEqual(
      JSON.parse(await readFile(lockPath(join(directory, 'first')), 'utf8')).token,
      JSON.parse(await readFile(lockPath(join(directory, 'second')), 'utf8')).token,
    );
  } finally {
    await releaseFirst?.();
    await releaseSecond?.();
    await rm(directory, { recursive: true, force: true });
  }
});

test('idempotent release permits reacquisition and cannot remove its successor', async () => {
  const directory = await temporaryDirectory();
  let releaseSecond: (() => Promise<void>) | undefined;
  try {
    const releaseFirst = await acquireDataDirectoryLock(directory);
    await Promise.all([releaseFirst(), releaseFirst()]);
    await assert.rejects(readFile(lockPath(directory)), missing);
    releaseSecond = await acquireDataDirectoryLock(directory);
    const secondMarker = await readFile(lockPath(directory), 'utf8');
    await releaseFirst();
    assert.equal(await readFile(lockPath(directory), 'utf8'), secondMarker);
  } finally {
    await releaseSecond?.();
    await rm(directory, { recursive: true, force: true });
  }
});

test('release preserves a replacement ownership token', async () => {
  const directory = await temporaryDirectory();
  try {
    const release = await acquireDataDirectoryLock(directory);
    const replacement = JSON.stringify({ token: 'replacement-owner', pid: process.pid }) + '\n';
    await writeFile(lockPath(directory), replacement, 'utf8');
    await release();
    assert.equal(await readFile(lockPath(directory), 'utf8'), replacement);
    await assert.rejects(acquireDataDirectoryLock(directory), busy);
  } finally {
    // This is an isolated test fixture; no server process holds its replacement.
    await rm(directory, { recursive: true, force: true });
  }
});

test('a stale existing marker fails closed without changing saved data', async () => {
  const directory = await temporaryDirectory();
  const stale = JSON.stringify({ token: 'stale-fixture', pid: 999_999_999 }) + '\n';
  const dataPath = join(directory, 'relay.json');
  const data = '{"private":"unchanged-fixture"}\n';
  try {
    await writeFile(lockPath(directory), stale, 'utf8');
    await writeFile(dataPath, data, 'utf8');
    await assert.rejects(acquireDataDirectoryLock(directory), (error) => {
      assert.ok(busy(error));
      assert.ok((error as Error).message.includes(lockPath(directory)));
      assert.ok(!(error as Error).message.includes('stale-fixture'));
      return true;
    });
    assert.equal(await readFile(lockPath(directory), 'utf8'), stale);
    assert.equal(await readFile(dataPath, 'utf8'), data);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an initial marker write failure cleans up its own exclusive file', async (context) => {
  const directory = await temporaryDirectory();
  const probe = await open(join(directory, 'handle-probe'), 'wx');
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const failure = new Error('Simulated marker write failure.');
  const write = context.mock.method(prototype, 'writeFile', async () => {
    throw failure;
  });
  let release: (() => Promise<void>) | undefined;
  try {
    await assert.rejects(acquireDataDirectoryLock(directory), (error) => error === failure);
    await assert.rejects(readFile(lockPath(directory)), missing);
    write.mock.restore();
    release = await acquireDataDirectoryLock(directory);
  } finally {
    write.mock.restore();
    await release?.();
    await rm(directory, { recursive: true, force: true });
  }
});
