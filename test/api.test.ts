import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import type { SessionState, Match } from '../src/shared/types.js';

let directory: string, base: string, server: ReturnType<typeof createApp>;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'kin-test-'));
  server = createApp({ dataDirectory: directory });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  await rm(directory, { recursive: true, force: true });
});
class Client {
  cookie = '';
  async request(path: string, method = 'GET', data?: unknown, extra: Record<string, string> = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(data ? { 'Content-Type': 'application/json' } : {}),
        ...extra,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const value = await res.json();
    return { res, value };
  }
}
test('owner sessions isolate private profile and require two explicit approvals', async () => {
  const a = new Client(),
    b = new Client();
  const demo = await a.request('/api/demo', 'POST');
  assert.equal(demo.res.status, 200);
  const state = demo.value as SessionState;
  assert.ok(state.profile);
  assert.ok(state.matches.length > 0);
  const cookie = demo.res.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal((await b.request('/api/session')).value.profile, null);
  const match = state.matches[0];
  assert.equal(
    (await b.request(`/api/matches/${match.id}/actions`, 'POST', { action: 'approve' })).res.status,
    409,
  );
  const approved = await a.request(`/api/matches/${match.id}/actions`, 'POST', {
    action: 'approve',
  });
  assert.equal(approved.value.state, 'awaiting-peer');
  assert.equal(approved.value.peerApproved, false);
  const connected = await a.request(`/api/matches/${match.id}/actions`, 'POST', {
    action: 'peer-approve',
  });
  assert.equal(connected.value.state, 'connected');
  assert.equal(connected.value.ownerApproved, true);
  assert.equal(connected.value.peerApproved, true);
  assert.ok(!JSON.stringify(connected.value).includes('email'));
});
test('cross-origin mutations, invalid intent and malformed profiles are rejected', async () => {
  const client = new Client();
  assert.equal(
    (await client.request('/api/demo', 'POST', undefined, { Origin: 'https://evil.example' })).res
      .status,
    403,
  );
  assert.equal(
    (await client.request('/api/discover', 'POST', { intent: 'anything' })).res.status,
    400,
  );
  assert.equal(
    (await client.request('/api/profile', 'PUT', { name: 'Child', age: 17 })).res.status,
    400,
  );
  const malformed = await fetch(base + '/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: '{nope',
  });
  assert.equal(malformed.status, 400);
  const array = await client.request('/api/profile', 'PUT', []);
  assert.equal(array.res.status, 400);
  const oversized = await client.request('/api/profile', 'PUT', { bio: 'x'.repeat(40_000) });
  assert.equal(oversized.res.status, 413);
});
test('blocking survives searches, profile changes and connection types; pause denies discovery', async () => {
  const client = new Client();
  const state = (await client.request('/api/demo', 'POST')).value as SessionState;
  const match = state.matches[0];
  await client.request(`/api/matches/${match.id}/actions`, 'POST', { action: 'block' });
  const rediscover = await client.request('/api/discover', 'POST', { intent: 'friendship' });
  assert.ok(!rediscover.value.matches.some((m: Match) => m.person.id === match.person.id));
  const profile = {
    ...state.profile!,
    intents: ['friendship', 'dating', 'collaboration'],
    bio: 'An updated bio',
  };
  const update = await client.request('/api/profile', 'PUT', profile);
  assert.equal(update.res.status, 200);
  assert.deepEqual(update.value.matches, []);
  for (const intent of profile.intents) {
    const search = await client.request('/api/discover', 'POST', { intent });
    assert.equal(search.res.status, 200);
    assert.ok(!search.value.matches.some((m: Match) => m.person.id === match.person.id));
  }
  await client.request('/api/profile', 'PUT', { ...profile, paused: true });
  assert.equal(
    (await client.request('/api/discover', 'POST', { intent: 'friendship' })).res.status,
    409,
  );
});
test('policy changes revoke previous approvals and export/delete are owner-scoped', async () => {
  const client = new Client();
  const state = (await client.request('/api/demo', 'POST')).value as SessionState;
  await client.request(`/api/matches/${state.matches[0].id}/actions`, 'POST', {
    action: 'approve',
  });
  const update = await client.request('/api/profile', 'PUT', {
    ...state.profile!,
    requirements: { ...state.profile!.requirements, nonsmoker: true },
  });
  assert.equal(update.value.matches.length, 0);
  const exported = await client.request('/api/export');
  assert.match(exported.res.headers.get('content-disposition')!, /attachment/);
  assert.equal(exported.value.profile.name, state.profile!.name);
  assert.equal((await client.request('/api/session', 'DELETE')).value.ok, true);
  const deleted = await client.request('/api/session');
  assert.equal(deleted.value.profile, null);
  assert.equal(deleted.value.matches.length, 0);
});
test('discovery preserves approval and declined states across repeat searches', async () => {
  const client = new Client();
  const state = (await client.request('/api/demo', 'POST')).value as SessionState;
  const match = state.matches[0];
  await client.request(`/api/matches/${match.id}/actions`, 'POST', { action: 'approve' });
  let found = (await client.request('/api/discover', 'POST', { intent: 'friendship' })).value;
  assert.equal(found.matches.find((m: Match) => m.id === match.id).state, 'awaiting-peer');
  await client.request(`/api/matches/${match.id}/actions`, 'POST', { action: 'decline' });
  found = (await client.request('/api/discover', 'POST', { intent: 'friendship' })).value;
  assert.ok(!found.matches.some((m: Match) => m.id === match.id));
});

test('blocking revokes every saved proposal for the same person across connection types', async () => {
  const client = new Client();
  await client.request('/api/demo', 'POST');
  const friendship = (await client.request('/api/discover', 'POST', { intent: 'friendship' })).value
    .matches as Match[];
  const dating = (await client.request('/api/discover', 'POST', { intent: 'dating' })).value
    .matches as Match[];
  const friend = friendship.find((f) => dating.some((d) => d.person.id === f.person.id))!;
  const date = dating.find((d) => d.person.id === friend.person.id)!;
  await client.request(`/api/matches/${date.id}/actions`, 'POST', { action: 'approve' });
  await client.request(`/api/matches/${friend.id}/actions`, 'POST', { action: 'block' });
  const blocked = (await client.request('/api/session')).value.matches.filter(
    (m: Match) => m.person.id === friend.person.id,
  );
  assert.ok(blocked.length >= 2);
  assert.ok(
    blocked.every((m: Match) => m.state === 'blocked' && !m.ownerApproved && !m.peerApproved),
  );
  assert.equal(
    (await client.request(`/api/matches/${date.id}/actions`, 'POST', { action: 'peer-approve' }))
      .res.status,
    409,
  );
  assert.equal(
    (await client.request(`/api/matches/${date.id}/actions`, 'POST', { action: 'approve' })).res
      .status,
    409,
  );
});
