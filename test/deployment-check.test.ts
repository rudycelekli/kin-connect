import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import { checkDeployment } from '../scripts/check-deployment.js';

const exec = promisify(execFile);
const CLIENT_ORIGIN = 'https://fixture-client.test';
const SECRET = 'RESPONSE_OR_COOKIE_MUST_NOT_BE_REPORTED';
type Fault = 'private-api' | 'intake-api' | 'redirect' | 'missing-asset';

async function fixture(fault?: Fault) {
  const directory = await mkdtemp(join(tmpdir(), 'kin-preflight-test-'));
  const staticDirectory = join(directory, 'static');
  await mkdir(join(staticDirectory, 'assets'), { recursive: true });
  await writeFile(
    join(staticDirectory, 'index.html'),
    '<!doctype html><html><head><script src="/assets/fixture.js"></script><link rel="stylesheet" href="./assets/fixture.css"></head><body><div id="root"></div></body></html>',
  );
  await writeFile(join(staticDirectory, 'assets/fixture.js'), 'export const fixture = true;');
  await writeFile(join(staticDirectory, 'assets/fixture.css'), 'body { margin: 0; }');
  let redirectedRequests = 0;
  const redirectTarget = createServer((_req, res) => {
    redirectedRequests++;
    res.end(SECRET);
  });
  await new Promise<void>((resolve) => redirectTarget.listen(0, '127.0.0.1', resolve));
  const requests: { method: string; path: string }[] = [];
  let app: ReturnType<typeof createApp>;
  const server = createServer((req, res) => {
    requests.push({ method: req.method ?? '', path: req.url ?? '' });
    if (fault === 'redirect' && req.url === '/api/health') {
      res.writeHead(302, {
        Location: `http://127.0.0.1:${(redirectTarget.address() as AddressInfo).port}/${SECRET}`,
      });
      res.end(SECRET);
    } else if (
      (fault === 'private-api' && req.url === '/api/session') ||
      (fault === 'intake-api' && req.url === '/api/intake/providers')
    ) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'session=' + SECRET });
      res.end(JSON.stringify({ privateProfile: SECRET }));
    } else if (fault === 'missing-asset' && req.url === '/assets/fixture.js') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(SECRET);
    } else app.emit('request', req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  app = createApp({
    publicOrigin: url,
    allowedOrigins: [CLIENT_ORIGIN],
    staticDirectory,
    dataDirectory: join(directory, 'owners'),
    networkDirectory: join(directory, 'relay'),
  });
  return {
    url,
    directory,
    requests,
    redirectedRequests: () => redirectedRequests,
    async close() {
      await Promise.all(
        [server, redirectTarget].map(
          (server) => new Promise<void>((resolve) => server.close(() => resolve())),
        ),
      );
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('public fixture passes the real SDK contract and writes a scoped CLI report', async () => {
  const app = await fixture();
  try {
    const output = join(app.directory, 'report.json');
    const result = await exec(
      process.execPath,
      [
        '--import',
        'tsx',
        resolve('scripts/check-deployment.ts'),
        '--url',
        app.url,
        '--origin',
        CLIENT_ORIGIN,
        '--allow-local',
        '--output',
        output,
      ],
      { timeout: 20_000, maxBuffer: 100_000 },
    );
    const report = JSON.parse(result.stdout);
    assert.equal(report.passed, true);
    assert.equal(report.scope, 'server-contract-only');
    assert.equal(report.fixtureMode, true);
    assert.equal(report.assetsChecked, 2);
    assert.equal(report.checks.length, 13);
    assert.ok(report.checks.every((check: { passed: boolean }) => check.passed));
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);
    assert.ok(
      app.requests.every(
        (request) =>
          ['GET', 'OPTIONS'].includes(request.method) ||
          (request.method === 'POST' && request.path === '/mcp'),
      ),
    );
    assert.ok(
      !app.requests.some((request) =>
        /challenge|register|messages|decisions|leave|ack/.test(request.path),
      ),
    );
  } finally {
    await app.close();
  }
});

test('exposed owner API fails without including its private response or cookie', async () => {
  const app = await fixture('private-api');
  try {
    await assert.rejects(
      exec(
        process.execPath,
        [
          '--import',
          'tsx',
          resolve('scripts/check-deployment.ts'),
          '--url',
          app.url,
          '--allow-local',
        ],
        { timeout: 20_000, maxBuffer: 100_000 },
      ),
      (error: unknown) => {
        const result = error as { code: number; stdout: string; stderr: string };
        assert.equal(result.code, 1);
        const report = JSON.parse(result.stdout);
        assert.equal(report.passed, false);
        assert.equal(
          report.checks.find((check: { id: string }) => check.id === 'private-session').passed,
          false,
        );
        assert.equal(
          report.checks.find((check: { id: string }) => check.id === 'public-no-cookies').passed,
          false,
        );
        assert.ok(!result.stdout.includes(SECRET));
        assert.ok(!result.stderr.includes(SECRET));
        return true;
      },
    );
  } finally {
    await app.close();
  }
});

test('checker rejects an exposed intake API without reading or reporting private provider data', async () => {
  const app = await fixture('intake-api');
  try {
    const report = await checkDeployment({ url: app.url, allowLocal: true });
    assert.equal(report.passed, false);
    assert.equal(
      report.checks.find((check) => check.id === 'private-intake/providers')!.passed,
      false,
    );
    assert.equal(report.checks.find((check) => check.id === 'private-session')!.passed, true);
    assert.equal(report.checks.find((check) => check.id === 'public-no-cookies')!.passed, false);
    assert.ok(!JSON.stringify(report).includes(SECRET));
  } finally {
    await app.close();
  }
});

test('redirect fails without requesting the redirected host or printing its body', async () => {
  const app = await fixture('redirect');
  try {
    const report = await checkDeployment({ url: app.url, allowLocal: true });
    assert.equal(report.passed, false);
    assert.equal(report.checks.find((check) => check.id === 'public-mode')!.passed, false);
    assert.equal(app.redirectedRequests(), 0);
    assert.ok(!JSON.stringify(report).includes(SECRET));
  } finally {
    await app.close();
  }
});

test('missing JavaScript fails even when its HTML resource and other checks are valid', async () => {
  const app = await fixture('missing-asset');
  try {
    const report = await checkDeployment({ url: app.url, allowLocal: true });
    assert.equal(report.passed, false);
    assert.equal(
      report.checks.find((check) => check.id === 'mcp-resource')!.failure,
      'expected-served-asset',
    );
    assert.ok(!JSON.stringify(report).includes(SECRET));
  } finally {
    await app.close();
  }
});

test('local, credentialed and placeholder origins are refused before any request', async () => {
  for (const url of [
    'http://127.0.0.1:4318',
    'https://127.0.0.2',
    'https://[::ffff:127.0.0.1]',
    `https://owner:${SECRET}@fixture.test`,
    'https://fixture.invalid',
    'https://fixture.test/path',
    `https://fixture.test?token=${SECRET}`,
  ]) {
    await assert.rejects(checkDeployment({ url }), (error) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(SECRET));
      return true;
    });
  }
});
