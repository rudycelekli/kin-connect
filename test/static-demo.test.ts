import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staticApi } from '../src/static-demo.js';
import type { Match, SessionState } from '../src/shared/types.js';
import { circleCatalog } from '../src/communities/infrastructure/index.js';
const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  },
  configurable: true,
});

test('browser-only demo preserves consent and blocks every intention without HTTP', async () => {
  const state = await staticApi<SessionState>('/api/demo', 'POST');
  assert.ok(state.profile);
  const friendship = (
    await staticApi<{ matches: Match[] }>('/api/discover', 'POST', { intent: 'friendship' })
  ).matches;
  const dating = (
    await staticApi<{ matches: Match[] }>('/api/discover', 'POST', { intent: 'dating' })
  ).matches;
  const f = friendship.find((f) => dating.some((d) => d.person.id === f.person.id))!,
    d = dating.find((d) => d.person.id === f.person.id)!;
  await staticApi(`/api/matches/${d.id}/actions`, 'POST', { action: 'approve' });
  await staticApi(`/api/matches/${f.id}/actions`, 'POST', { action: 'block' });
  await assert.rejects(
    staticApi(`/api/matches/${d.id}/actions`, 'POST', { action: 'peer-approve' }),
    /blocked/,
  );
  const blocked = await staticApi<SessionState>('/api/session');
  assert.ok(
    blocked.matches.filter((m) => m.person.id === f.person.id).every((m) => m.state === 'blocked'),
  );
  await staticApi('/api/profile', 'PUT', { ...state.profile!, bio: 'A new introduction.' });
  for (const intent of state.profile!.intents) {
    const result = await staticApi<{ matches: Match[] }>('/api/discover', 'POST', { intent });
    assert.ok(!result.matches.some((m) => m.person.id === f.person.id));
  }
  await staticApi('/api/session', 'DELETE');
  assert.equal((await staticApi<SessionState>('/api/session')).profile, null);
  await assert.rejects(staticApi('/api/agent-connection', 'POST'), /Run Kin locally/);
});

test('circle applications stay local, require a second demo approval, export and delete', async () => {
  values.clear();
  const circle = circleCatalog.find((item) => item.id === 'brooklyn-coffee-circle')!;
  assert.ok(circle);
  const path = `/api/circles/${circle.id}/applications`;
  await assert.rejects(staticApi(path, 'POST'), /Meet your agent/);
  const initial = await staticApi<SessionState>('/api/demo', 'POST');
  const privateNote = 'Private note: never share owner@example.com.';
  await staticApi('/api/profile', 'PUT', { ...initial.profile!, boundaries: privateNote });
  const pending = await staticApi<SessionState>(path, 'POST', { organizerApproved: true });
  const application = pending.circleApplications![0];
  assert.equal(application.state, 'pending-organizer');
  assert.equal(application.ownerApproved, true);
  assert.equal(application.organizerApproved, false);
  assert.equal(application.disclosures.alias, initial.profile!.agentName);
  const serialized = JSON.stringify(application);
  assert.ok(!serialized.includes(privateNote));
  assert.ok(!serialized.includes('owner@example.com'));
  assert.ok(!serialized.includes('boundaries'));
  assert.ok(!serialized.includes('datingGenders'));
  await assert.rejects(staticApi(path, 'POST'), /active application/);
  const member = await staticApi<SessionState>(
    `/api/circle-applications/${application.id}/actions`,
    'POST',
    { action: 'simulate-organizer-approval' },
  );
  assert.equal(member.circleApplications![0].state, 'member');
  assert.equal(member.circleApplications![0].organizerApproved, true);
  const exported = await staticApi<SessionState>('/api/export');
  assert.equal(exported.circleApplications![0].id, application.id);
  await staticApi('/api/profile', 'PUT', { ...member.profile!, bio: 'Changed preferences.' });
  assert.deepEqual((await staticApi<SessionState>('/api/session')).circleApplications, []);
  await staticApi(path, 'POST');
  await staticApi('/api/session', 'DELETE');
  assert.deepEqual((await staticApi<SessionState>('/api/session')).circleApplications, []);
  assert.equal(values.has('kin-local-demo-v1'), false);
});

test('stale or malformed circle approvals are removed without losing the profile', async () => {
  values.clear();
  await staticApi('/api/demo', 'POST');
  const circle = circleCatalog.find((item) => item.id === 'brooklyn-coffee-circle')!;
  const pending = await staticApi<SessionState>(`/api/circles/${circle.id}/applications`, 'POST');
  const application = pending.circleApplications![0];
  values.set(
    'kin-local-demo-v1',
    JSON.stringify({
      ...pending,
      circleApplications: [{ ...application, state: 'member', organizerApproved: false }],
    }),
  );
  const invalid = await staticApi<SessionState>('/api/session');
  assert.equal(invalid.profile?.id, pending.profile!.id);
  assert.deepEqual(invalid.circleApplications, []);
  values.set(
    'kin-local-demo-v1',
    JSON.stringify({
      ...pending,
      circleApplications: [{ ...application, circleFingerprint: 'outdated-host-policy' }],
    }),
  );
  assert.deepEqual((await staticApi<SessionState>('/api/session')).circleApplications, []);
  values.set(
    'kin-local-demo-v1',
    JSON.stringify({
      ...pending,
      profile: { ...pending.profile!, boundaries: 'Changed local policy.' },
    }),
  );
  assert.deepEqual((await staticApi<SessionState>('/api/session')).circleApplications, []);
  await staticApi('/api/session', 'DELETE');
});

test('private saved connections hold only a bookmark and follow export, removal and deletion', async () => {
  values.clear();
  const demo = await staticApi<SessionState>('/api/demo', 'POST');
  const bookmark = {
    peerId: 'a'.repeat(64),
    alias: 'Orbit',
    conversationId: crypto.randomUUID(),
    relayURL: 'https://relay.example',
  };
  const saved = await staticApi<SessionState>('/api/saved-connections', 'POST', bookmark);
  assert.equal(saved.savedConnections!.length, 1);
  assert.deepEqual(Object.keys(saved.savedConnections![0]).sort(), [
    'alias',
    'conversationId',
    'peerId',
    'relayURL',
    'savedAt',
  ]);
  await assert.rejects(
    staticApi('/api/saved-connections', 'POST', { ...bookmark, transcript: 'private chat' }),
  );
  await assert.rejects(
    staticApi('/api/saved-connections', 'POST', { ...bookmark, alias: 'person@example.com' }),
  );
  await assert.rejects(
    staticApi('/api/saved-connections', 'POST', { ...bookmark, relayURL: 'javascript:alert(1)' }),
  );
  await staticApi('/api/saved-connections', 'POST', { ...bookmark, alias: 'Updated alias' });
  assert.equal((await staticApi<SessionState>('/api/export')).savedConnections!.length, 1);
  await staticApi('/api/profile', 'PUT', {
    ...demo.profile!,
    bio: 'Changed profile, same private bookmarks.',
  });
  assert.equal((await staticApi<SessionState>('/api/session')).savedConnections!.length, 1);
  await staticApi(`/api/saved-connections/${bookmark.peerId}`, 'DELETE');
  assert.deepEqual((await staticApi<SessionState>('/api/session')).savedConnections, []);
  await staticApi('/api/saved-connections', 'POST', bookmark);
  await staticApi('/api/session', 'DELETE');
  assert.deepEqual((await staticApi<SessionState>('/api/session')).savedConnections, []);
});
