import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staticApi } from '../src/static-demo.js';
import type { Match, SessionState } from '../src/shared/types.js';
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
