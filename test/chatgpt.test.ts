import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../server/app.js';

async function publicApp() {
  const directory = await mkdtemp(join(tmpdir(), 'kin-chatgpt-'));
  const staticDirectory = join(directory, 'static');
  await mkdir(staticDirectory);
  await writeFile(
    join(staticDirectory, 'index.html'),
    '<!doctype html><html><head><script type="module" src="/assets/kin-trusted.js"></script><link href="./assets/kin-trusted.css" rel="stylesheet"></head><body><div id="root"></div></body></html>',
  );
  const server = createApp({
    dataDirectory: join(directory, 'owners'),
    networkDirectory: join(directory, 'relay'),
    staticDirectory,
    publicOrigin: 'https://kin.example',
    allowedOrigins: ['https://chatgpt.com'],
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('actual MCP HTTP SDK initializes, lists only public tools, calls, and reads a trusted private-workspace resource', async () => {
  const app = await publicApp();
  const client = new Client({ name: 'kin-public-sdk-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${app.base}/mcp`), {
    requestInit: { headers: { Origin: 'https://chatgpt.com' } },
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      'kin_explain_privacy',
      'kin_open_connections',
    ]);
    for (const tool of tools.tools) {
      assert.deepEqual(tool.inputSchema.properties ?? {}, {});
      assert.deepEqual(tool.inputSchema.required ?? [], []);
      assert.equal(tool.annotations?.readOnlyHint, true);
      assert.equal(tool.annotations?.destructiveHint, false);
      assert.equal(tool.annotations?.openWorldHint, false);
    }
    const opener = tools.tools.find((tool) => tool.name === 'kin_open_connections')!;
    assert.deepEqual(opener._meta?.ui, {
      resourceUri: 'ui://kin/connections.html',
      visibility: ['model', 'app'],
    });
    const opened = await client.callTool({ name: 'kin_open_connections', arguments: {} });
    assert.ok(!opened.isError);
    assert.deepEqual(opened.structuredContent, {
      workspace: 'kin',
      consent: 'both-owners-required',
    });
    const privacy = await client.callTool({ name: 'kin_explain_privacy', arguments: {} });
    assert.ok(!privacy.isError);
    assert.match(JSON.stringify(privacy.content), /no forward secrecy/i);
    const resources = await client.listResources();
    assert.deepEqual(
      resources.resources.map((resource) => resource.uri),
      ['ui://kin/connections.html'],
    );
    const resource = await client.readResource({ uri: 'ui://kin/connections.html' });
    const content = resource.contents[0];
    assert.equal(content.mimeType, 'text/html;profile=mcp-app');
    assert.ok('text' in content);
    assert.match(content.text, /src="https:\/\/kin\.example\/assets\/kin-trusted\.js"/);
    assert.match(content.text, /href="https:\/\/kin\.example\/assets\/kin-trusted\.css"/);
    assert.match(content.text, /window\.__KIN_WIDGET__=true/);
    assert.equal(content.text.includes('/api/profile'), false);
    const metadata = content._meta as {
      ui: { domain: string; csp: { connectDomains: string[]; resourceDomains: string[] } };
    };
    assert.equal(metadata.ui.domain, 'https://kin.example');
    assert.deepEqual(metadata.ui.csp.connectDomains, ['https://kin.example']);
    assert.deepEqual(metadata.ui.csp.resourceDomains, ['https://kin.example']);
    await assert.rejects(() => client.callTool({ name: 'kin_owner_get', arguments: {} }));
    await assert.rejects(() =>
      client.callTool({ name: 'kin_approve', arguments: { conversationId: 'anything' } }),
    );
  } finally {
    await client.close();
    await transport.close();
    await app.close();
  }
});

test('public MCP rejects foreign origins and oversized requests, while owner profile/session APIs stay local-only', async () => {
  const app = await publicApp();
  try {
    const foreign = await fetch(`${app.base}/mcp`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.headers.get('access-control-allow-origin'), null);
    const oversized = await fetch(`${app.base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privateProfile: 'x'.repeat(33_000) }),
    });
    assert.equal(oversized.status, 413);
    const preflight = await fetch(`${app.base}/mcp`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://chatgpt.com' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://chatgpt.com');
    for (const [path, method] of [
      ['/api/session', 'GET'],
      ['/api/profile', 'PUT'],
      ['/api/demo', 'POST'],
      ['/api/export', 'GET'],
      ['/api/agent-connection', 'POST'],
    ] as const) {
      const response = await fetch(`${app.base}${path}`, { method });
      assert.equal(response.status, 403, `${method} ${path}`);
      assert.equal(response.headers.get('set-cookie'), null);
    }
    assert.equal((await fetch(`${app.base}/api/health`)).status, 200);
    assert.equal((await fetch(`${app.base}/api/network/health`)).status, 200);
  } finally {
    await app.close();
  }
});

test('public app admits authenticated relay registration while denying unsigned private-profile writes', async () => {
  const app = await publicApp();
  try {
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const exchange = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const signingKey = keys.publicKey.export({ format: 'jwk' });
    const agentId = createHash('sha256')
      .update(JSON.stringify({ kty: 'EC', crv: 'P-256', x: signingKey.x, y: signingKey.y }))
      .digest('hex');
    const challengeResponse = await fetch(`${app.base}/api/network/challenge?agentId=${agentId}`, {
      headers: { Origin: 'https://chatgpt.com' },
    });
    assert.equal(challengeResponse.status, 200);
    const { challengeId, nonce } = await challengeResponse.json();
    const path = '/api/network/register';
    const payload = {
      signingKey,
      exchangeKey: exchange.publicKey.export({ format: 'jwk' }),
      registrationNonce: randomUUID(),
      capsule: {
        alias: 'Pseudonymous owner',
        intents: ['friendship'],
        interests: [],
        purpose: 'A thoughtful introduction.',
      },
    };
    const signedText = JSON.stringify({ path, challengeId, nonce, payload });
    const signature = sign('sha256', Buffer.from(signedText), {
      key: keys.privateKey,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url');
    const response = await fetch(`${app.base}${path}`, {
      method: 'POST',
      headers: { Origin: 'https://chatgpt.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, challengeId, payload, signature }),
    });
    assert.equal(response.status, 200);
    const identity = await response.json();
    assert.equal(identity.id, agentId);
    assert.equal(identity.registrationId, payload.registrationNonce);
    assert.equal(identity.attestation.signedText, signedText);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(
      (
        await fetch(`${app.base}/api/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'PRIVATE OWNER', boundaries: 'PRIVATE NOTES' }),
        })
      ).status,
      403,
    );
  } finally {
    await app.close();
  }
});
