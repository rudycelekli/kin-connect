import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect, type AddressInfo } from 'node:net';
import { request, type IncomingHttpHeaders } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';

async function isolated(work: (app: ReturnType<typeof createApp>, port: number) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'kin-http-'));
  const app = createApp({
    dataDirectory: directory,
    publicOrigin: 'https://www.kin.example',
    publicAliases: ['https://old.kin.example'],
  });
  try {
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
    await work(app, (app.address() as AddressInfo).port);
  } finally {
    app.closeAllConnections();
    await new Promise<void>((resolve, reject) => app.close((e) => (e ? reject(e) : resolve())));
    await app.drainMaintenance();
    await rm(directory, { recursive: true, force: true });
  }
}

function raw(port: number, request: string) {
  return new Promise<string>((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let response = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('HTTP guard did not close the incomplete request.'));
    }, 5000);
    socket.on('connect', () => socket.write(request));
    socket.on('data', (chunk) => {
      response += chunk.toString();
    });
    socket.on('error', reject);
    socket.on('close', () => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function hosted(port: number, path: string, host: string, origin?: string) {
  return new Promise<{ status: number | undefined; headers: IncomingHttpHeaders }>(
    (resolve, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          headers: { Host: host, ...(origin ? { Origin: origin } : {}) },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.end();
    },
  );
}

test('partial headers and an unfinished relay body time out on real sockets', async () => {
  await isolated(async (app, port) => {
    // Shorten only the deadlines; exercise the same production connection scanner.
    app.headersTimeout = 100;
    app.requestTimeout = 150;
    const headerResponse = await raw(
      port,
      'GET /api/health HTTP/1.1\r\nHost: www.kin.example\r\nX-Unfinished:',
    );
    assert.match(headerResponse, /^HTTP\/1\.1 408 /);
    assert.doesNotMatch(headerResponse, /Set-Cookie:|kin_session/i);
    const bodyResponse = await raw(
      port,
      'POST /api/network/inbox HTTP/1.1\r\nHost: www.kin.example\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{',
    );
    assert.match(bodyResponse, /^HTTP\/1\.1 408 /);
    assert.doesNotMatch(bodyResponse, /Set-Cookie:|kin_session/i);
    assert.equal(
      (await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Host: 'www.kin.example' } }))
        .status,
      200,
    );
  });
});

test('oversized headers reject before owner APIs and the server remains usable', async () => {
  await isolated(async (_app, port) => {
    const response = await raw(
      port,
      `GET /api/profile HTTP/1.1\r\nHost: www.kin.example\r\nX-Oversized: ${'x'.repeat(20000)}\r\nConnection: close\r\n\r\n`,
    );
    assert.match(response, /^HTTP\/1\.1 431 /);
    assert.doesNotMatch(response, /Set-Cookie:|kin_session/i);
    assert.equal(
      (await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Host: 'www.kin.example' } }))
        .status,
      200,
    );
  });
});

test('explicit old-origin alias keeps relay access while denying owner APIs and arbitrary hosts', async () => {
  await isolated(async (_app, port) => {
    for (const host of ['www.kin.example', 'old.kin.example']) {
      const health = await hosted(port, '/api/network/health', host, `https://${host}`);
      assert.equal(health.status, 200);
      assert.equal(health.headers['access-control-allow-origin'], `https://${host}`);
      const privateAPI = await hosted(port, '/api/profile', host);
      assert.equal(privateAPI.status, 403);
      assert.equal(privateAPI.headers['set-cookie'], undefined);
    }
    for (const host of [
      'old.kin.example.evil.example',
      'unconfigured.kin.example',
      'old.kin.example:444',
    ])
      assert.equal((await hosted(port, '/api/network/health', host)).status, 403);
  });
  for (const alias of [
    'http://old.kin.example',
    'https://old.kin.example/path',
    'https://user:password@old.kin.example',
  ])
    assert.throws(() =>
      createApp({ publicOrigin: 'https://www.kin.example', publicAliases: [alias] }),
    );
  assert.throws(() => createApp({ publicAliases: ['https://old.kin.example'] }));
});
