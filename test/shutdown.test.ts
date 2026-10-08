import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { shutdownServer } from '../server/shutdown.js';
import { SessionStore } from '../server/store.js';
import type { SessionState } from '../src/shared/types.js';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
};

test('shutdown drains a disconnected handler before its session write can finish', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kin-shutdown-'));
  const app = createApp({ dataDirectory: directory });
  const entered = deferred(),
    allowWrite = deferred();
  const original = SessionStore.prototype.update;
  SessionStore.prototype.update = async function <T>(
    token: string,
    mutate: (
      state: SessionState,
    ) => { state: SessionState; result: T } | Promise<{ state: SessionState; result: T }>,
  ) {
    entered.resolve();
    await allowWrite.promise;
    return original.call(this, token, mutate) as Promise<T>;
  };
  let shutdown: Promise<void> | undefined;
  try {
    await app.initialize();
    await new Promise<void>((done) => app.listen(0, '127.0.0.1', done));
    const port = (app.address() as AddressInfo).port;
    const req = request({
      host: '127.0.0.1',
      port,
      path: '/api/demo',
      method: 'POST',
      headers: { Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json' },
    });
    req.on('error', () => {});
    req.end(JSON.stringify({ intent: 'friendship' }));
    await entered.promise;
    req.destroy();
    let drained = false;
    shutdown = shutdownServer(app, 50).then(() => {
      drained = true;
    });
    await new Promise<void>((done) => app.once('close', done));
    await new Promise<void>((done) => setImmediate(done));
    assert.equal(drained, false, 'Socket closure must not release pending async work.');
    allowWrite.resolve();
    await shutdown;
    assert.equal(drained, true);
    assert.equal((await readdir(directory)).filter((name) => name.endsWith('.json')).length, 1);
  } finally {
    allowWrite.resolve();
    SessionStore.prototype.update = original;
    await (shutdown ?? shutdownServer(app, 50));
    await rm(directory, { recursive: true, force: true });
  }
});

test('shutdown closes incomplete bodies within socket grace instead of request timeout', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kin-shutdown-body-'));
  const app = createApp({ dataDirectory: directory });
  try {
    await app.initialize();
    await new Promise<void>((done) => app.listen(0, '127.0.0.1', done));
    const client = connect((app.address() as AddressInfo).port, '127.0.0.1');
    client.on('error', () => {});
    await new Promise<void>((done) => client.once('connect', done));
    // Wait until Node has dispatched the request, leaving its body incomplete.
    const received = new Promise<void>((done) => app.once('request', () => done()));
    client.write(
      'POST /api/network/inbox HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{',
    );
    await received;
    const started = Date.now();
    await shutdownServer(app, 75);
    assert.ok(
      Date.now() - started < 2_000,
      'The 30-second request timeout must not delay shutdown.',
    );
    client.destroy();
  } finally {
    await shutdownServer(app, 50);
    await rm(directory, { recursive: true, force: true });
  }
});

test('shutdown admission denies new owner requests without creating a session', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kin-shutdown-admission-'));
  const app = createApp({ dataDirectory: directory });
  try {
    await app.initialize();
    await new Promise<void>((done) => app.listen(0, '127.0.0.1', done));
    app.stopAcceptingRequests();
    const res = await fetch(`http://127.0.0.1:${(app.address() as AddressInfo).port}/api/session`);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('set-cookie'), null);
    await res.body?.cancel();
  } finally {
    await shutdownServer(app, 50);
    await rm(directory, { recursive: true, force: true });
  }
});

test('steady health probes validate readiness without cloning the ciphertext store', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kin-health-barrier-'));
  const app = createApp({ dataDirectory: directory });
  const original = globalThis.structuredClone;
  let clones = 0;
  try {
    await app.initialize();
    await new Promise<void>((done) => app.listen(0, '127.0.0.1', done));
    globalThis.structuredClone = function (...args) {
      clones += 1;
      return original(...args);
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(
        `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/network/health`,
      );
      assert.equal(res.status, 200);
      assert.equal((await res.json()).ok, true);
    }
    assert.equal(clones, 0);
  } finally {
    globalThis.structuredClone = original;
    await shutdownServer(app, 50);
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  'held owner requests have bounded admission without cookies on overflow',
  { timeout: 10_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kin-admission-cap-'));
    const app = createApp({ dataDirectory: directory });
    const reachedCapacity = deferred(),
      releaseReads = deferred();
    const original = SessionStore.prototype.read;
    let held = 0;
    SessionStore.prototype.read = async function (token) {
      if (++held === 128) reachedCapacity.resolve();
      await releaseReads.promise;
      return original.call(this, token);
    };
    const requests: Promise<Response>[] = [];
    try {
      await app.initialize();
      await new Promise<void>((done) => app.listen(0, '127.0.0.1', done));
      const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/session`;
      for (let i = 0; i < 128; i++) requests.push(fetch(url));
      await reachedCapacity.promise;
      const overflow = await fetch(url);
      assert.equal(overflow.status, 503);
      assert.equal(overflow.headers.get('set-cookie'), null);
      assert.equal(overflow.headers.get('retry-after'), '1');
      await overflow.body?.cancel();
      releaseReads.resolve();
      for (const response of await Promise.all(requests)) {
        assert.equal(response.status, 200);
        await response.body?.cancel();
      }
      const recovered = await fetch(url);
      assert.equal(recovered.status, 200);
      await recovered.body?.cancel();
    } finally {
      releaseReads.resolve();
      SessionStore.prototype.read = original;
      await Promise.allSettled(requests);
      await shutdownServer(app, 50);
      await rm(directory, { recursive: true, force: true });
    }
  },
);

for (const kind of ['relay', 'session'] as const) {
  test(`entrypoint rejects corrupt ${kind} state before announcing readiness and releases its lock`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kin-corrupt-startup-'));
    const subdir = join(directory, kind === 'relay' ? 'network' : 'sessions');
    await mkdir(subdir);
    const file = join(subdir, kind === 'relay' ? 'relay.json' : `${'a'.repeat(64)}.json`);
    const sentinel = '{"private-sentinel":"do-not-print"';
    await writeFile(file, sentinel);
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      env: {
        ...process.env,
        KIN_DATA_DIR: directory,
        PORT: '4318',
        KIN_PUBLIC_ORIGIN: '',
        RAILWAY_PUBLIC_DOMAIN: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const deadline = setTimeout(() => child.kill('SIGKILL'), 10_000);
    try {
      const code = await new Promise<number | null>((done, reject) => {
        child.once('error', reject);
        child.once('exit', done);
      });
      assert.equal(code, 1);
      assert.doesNotMatch(output, /Kin is ready|private-sentinel|do-not-print/);
      assert.match(output, /could not validate its saved data/);
      assert.equal(await readFile(file, 'utf8'), sentinel);
      await assert.rejects(readFile(join(directory, '.kin-process.lock')), { code: 'ENOENT' });
    } finally {
      clearTimeout(deadline);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await rm(directory, { recursive: true, force: true });
    }
  });
}
