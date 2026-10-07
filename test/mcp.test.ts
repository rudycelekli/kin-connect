import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createApp } from '../server/app.js';

test('an actual MCP client can read/update owner policy and suggest, but cannot approve', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kin-mcp-'));
  const app = createApp({ dataDirectory: directory });
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  const client = new Client({ name: 'kin-integration-test', version: '1.0.0' });
  let transport: StdioClientTransport | undefined;
  try {
    const demo = await fetch(base + '/api/demo', { method: 'POST' });
    const cookie = demo.headers.get('set-cookie')!.split(';')[0];
    const state = await demo.json();
    const pair = await fetch(base + '/api/agent-connection', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    const config = (await pair.json()).config.mcpServers.kin;
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve('node_modules/tsx/dist/cli.mjs'), resolve('server/mcp.ts')],
      env: {
        ...(Object.fromEntries(
          Object.entries(process.env).filter(([, v]) => v !== undefined),
        ) as Record<string, string>),
        ...config.env,
      },
      stderr: 'pipe',
    });
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((t) => t.name).sort(),
      ['kin_decline_or_block', 'kin_discover', 'kin_owner_get', 'kin_owner_update'].sort(),
    );
    const read = await client.callTool({ name: 'kin_owner_get', arguments: {} });
    const readContent = read.content as Array<{ type: string; text: string }>;
    assert.equal(JSON.parse(readContent[0].text).profile.name, state.profile.name);
    const edit = await client.callTool({
      name: 'kin_owner_update',
      arguments: { profile: { ...state.profile, agentName: 'Scout' } },
    });
    assert.ok(!edit.isError);
    const visible = await fetch(base + '/api/session', { headers: { Cookie: cookie } });
    assert.equal((await visible.json()).profile.agentName, 'Scout');
    const search = await client.callTool({
      name: 'kin_discover',
      arguments: { intent: 'friendship' },
    });
    assert.ok(!search.isError);
    const matches = JSON.parse((search.content as Array<{ text: string }>)[0].text).matches;
    assert.ok(matches.length > 0);
    const approval = await fetch(base + `/api/matches/${matches[0].id}/actions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.env.KIN_CONNECTION_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'approve' }),
    });
    assert.equal(approval.status, 403);
    const ownerApproval = await fetch(base + `/api/matches/${matches[0].id}/actions`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
    assert.equal(ownerApproval.status, 200);
    const peerApproval = await fetch(base + `/api/matches/${matches[0].id}/actions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.env.KIN_CONNECTION_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'peer-approve' }),
    });
    assert.equal(peerApproval.status, 403);
    const secondPair = await fetch(base + '/api/agent-connection', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    assert.equal(secondPair.status, 200);
    const oldRead = await client.callTool({ name: 'kin_owner_get', arguments: {} });
    assert.equal(oldRead.isError, true);
  } finally {
    await client.close();
    await transport?.close();
    await new Promise<void>((r) => app.close(() => r()));
    await rm(directory, { recursive: true, force: true });
  }
});
