import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import { SessionStore } from '../server/store.js';
import { IntakeRequestBudget, loadIntakeSettings } from '../server/intake-settings.js';

const proposal = {
  proposedInterests: ['Career: find a mentor'],
  questions: ['What would you like to learn?'],
};
async function isolated(
  work: (base: string, requests: () => number) => Promise<void>,
  publicMode = false,
  beforeResponse?: () => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), 'kin-intake-route-'));
  let count = 0;
  const app = createApp({
    dataDirectory: directory,
    ...(publicMode ? { publicOrigin: 'http://127.0.0.1' } : {}),
    intakeSettings: { openai: { apiKey: 'synthetic-test-key', model: 'test-model' } },
    intakeFetch: async () => {
      count++;
      await beforeResponse?.();
      return new Response(
        JSON.stringify({
          object: 'response',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: JSON.stringify(proposal) }],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });
  try {
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
    await work(`http://127.0.0.1:${(app.address() as AddressInfo).port}`, () => count);
  } finally {
    app.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      app.close((error) => (error ? reject(error) : resolve())),
    );
    await app.drainMaintenance();
    await rm(directory, { recursive: true, force: true });
  }
}
const payload = {
  provider: 'openai',
  text: 'I would like to find a mentor in technology.',
  approved: true,
};

test('optional intake is disabled by default and always disabled for public relays', () => {
  const enabled = {
    KIN_INTAKE_ENABLED: 'true',
    OPENAI_API_KEY: 'synthetic-key',
    KIN_OPENAI_INTAKE_MODEL: 'test-model',
  };
  assert.equal(loadIntakeSettings({}, false), undefined);
  assert.equal(loadIntakeSettings(enabled, true), undefined);
  assert.deepEqual(Object.keys(loadIntakeSettings(enabled, false)!), ['openai']);
  for (const config of [
    { ...enabled, OPENAI_API_KEY: 'short' },
    { ...enabled, OPENAI_API_KEY: 'x'.repeat(513) },
    { ...enabled, KIN_OPENAI_INTAKE_MODEL: 'x'.repeat(101) },
    { ...enabled, KIN_OPENAI_INTAKE_MODEL: 'invalid/model' },
  ])
    assert.throws(() => loadIntakeSettings(config, false), /Invalid/);
  assert.throws(
    () => loadIntakeSettings({ KIN_INTAKE_ENABLED: 'true', OPENAI_API_KEY: 'secret' }, false),
    /key and model/,
  );
  assert.throws(
    () => loadIntakeSettings({ ...enabled, KIN_OPENAI_INTAKE_MODEL: 'bad\nmodel' }, false),
    /Invalid/,
  );
});

test('intake attempts are capped and serial even on backward clocks and idempotent release', () => {
  let now = 100;
  const budget = new IntakeRequestBudget(() => now);
  for (let i = 0; i < 10; i++) {
    const release = budget.acquire();
    assert.ok(release);
    assert.equal(budget.acquire(), undefined);
    release();
    release();
  }
  assert.equal(budget.acquire(), undefined);
  now = 0;
  assert.equal(budget.acquire(), undefined);
  now = 3_600_100;
  assert.ok(budget.acquire());
});

test('human intake proposals preserve profile/consent and deny paired agents and cross-site calls', async () => {
  await isolated(async (base, calls) => {
    const demo = await fetch(base + '/api/demo', { method: 'POST' });
    const cookie = demo.headers.get('set-cookie')!.split(';')[0];
    const before = await demo.json();
    const request = (body: unknown, headers: Record<string, string> = {}) =>
      fetch(base + '/api/intake/suggestions', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    for (const bad of [
      { ...payload, approved: false },
      { ...payload, text: 'person@example.com' },
      { ...payload, requirements: { minAge: 10 } },
    ])
      assert.equal((await request(bad)).status, 400);
    assert.equal((await request(payload, { Origin: 'https://evil.example' })).status, 403);
    const pair = await (
      await fetch(base + '/api/agent-connection', { method: 'POST', headers: { Cookie: cookie } })
    ).json();
    assert.equal(
      (
        await request(payload, {
          Authorization: `Bearer ${pair.config.mcpServers.kin.env.KIN_CONNECTION_TOKEN}`,
        })
      ).status,
      403,
    );
    assert.equal(calls(), 0);
    const result = await request(payload);
    assert.equal(result.status, 200);
    const suggestions = await result.json();
    assert.equal(suggestions.reviewRequired, true);
    assert.deepEqual(suggestions.proposedInterests, proposal.proposedInterests);
    const after = await (
      await fetch(base + '/api/session', { headers: { Cookie: cookie } })
    ).json();
    assert.deepEqual(after, before);
    assert.equal(calls(), 1);
    assert.equal((await request({ ...payload, provider: 'anthropic' })).status, 503);
    for (let i = 0; i < 9; i++) assert.equal((await request(payload)).status, 200);
    assert.equal((await request(payload)).status, 429);
    assert.equal(calls(), 10);
  });
});

test('public mode denies private intake before any provider request or owner cookie', async () => {
  await isolated(async (base, calls) => {
    for (const path of ['/api/intake/providers', '/api/intake/suggestions']) {
      const response = await fetch(base + path, {
        method: path.endsWith('providers') ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: path.endsWith('providers') ? undefined : JSON.stringify(payload),
      });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('set-cookie'), null);
    }
    assert.equal(calls(), 0);
  }, true);
});

test('intake result is suppressed if the owner pauses or deletes their session while provider runs', async () => {
  for (const action of ['pause', 'delete'] as const) {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    await isolated(
      async (base) => {
        const initial = await fetch(base + '/api/demo', { method: 'POST' });
        const cookie = initial.headers.get('set-cookie')!.split(';')[0];
        const state = await initial.json();
        const pending = fetch(base + '/api/intake/suggestions', {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        await started;
        const changed = await fetch(
          base + (action === 'delete' ? '/api/session' : '/api/profile'),
          {
            method: action === 'delete' ? 'DELETE' : 'PUT',
            headers: { Cookie: cookie, 'Content-Type': 'application/json' },
            body:
              action === 'delete' ? undefined : JSON.stringify({ ...state.profile, paused: true }),
          },
        );
        assert.equal(changed.status, 200);
        release();
        const response = await pending;
        assert.equal(response.status, 409);
        assert.doesNotMatch(await response.text(), /proposedInterests|synthetic-test-key/);
      },
      false,
      async () => {
        entered();
        await gate;
      },
    );
  }
});

test('revocation during either asynchronous session read cannot start or publish intake', async (t) => {
  for (const heldRead of [1, 2]) {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let reads = 0;
    const original = SessionStore.prototype.read;
    const mocked = t.mock.method(
      SessionStore.prototype,
      'read',
      async function (this: SessionStore, token: string) {
        const result = await original.call(this, token);
        if (++reads === heldRead) {
          entered();
          await gate;
        }
        return result;
      },
    );
    try {
      await isolated(async (base, calls) => {
        const initial = await fetch(base + '/api/demo', { method: 'POST' });
        const cookie = initial.headers.get('set-cookie')!.split(';')[0];
        const pending = fetch(base + '/api/intake/suggestions', {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        await started;
        assert.equal(
          (await fetch(base + '/api/session', { method: 'DELETE', headers: { Cookie: cookie } }))
            .status,
          200,
        );
        release();
        assert.equal((await pending).status, 409);
        assert.equal(calls(), heldRead === 1 ? 0 : 1);
      });
    } finally {
      release();
      mocked.mock.restore();
    }
  }
});
