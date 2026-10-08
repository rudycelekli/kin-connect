import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNetworkRouter } from '../server/network.js';
import { agentCapsuleSchema } from '../src/shared/agent-capsule.js';
import { createDeviceIdentity, unbase64url, type DeviceIdentity } from '../src/network/crypto.js';
import {
  RelayClient,
  RelayRequestError,
  RELAY_REQUEST_TIMEOUT_MS,
  RELAY_RESPONSE_LIMITS,
} from '../src/network/relay-client.js';
import type { NetworkIdentity, NetworkInbox } from '../src/shared/network-types.js';

const sentinel = 'PRIVATE-RELAY-ERROR-CONTENT';
const nonce = Buffer.alloc(32, 7).toString('base64url');
const challenge = () => ({ challengeId: crypto.randomUUID(), nonce });
const json = (value: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(value), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...init.headers },
  });
const client = async () => new RelayClient('https://relay.example', await createDeviceIdentity());
async function withFetch<T>(fake: typeof fetch, work: () => Promise<T>): Promise<T> {
  const previous = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    return await work();
  } finally {
    globalThis.fetch = previous;
  }
}
function fixedError(status?: number, pattern?: RegExp) {
  return (error: unknown) => {
    assert.ok(error instanceof RelayRequestError);
    if (status !== undefined) assert.equal(error.status, status);
    if (pattern) assert.match(error.message, pattern);
    assert.equal(error.message.includes(sentinel), false);
    assert.equal(JSON.stringify(error).includes(sentinel), false);
    assert.equal('cause' in error, false);
    return true;
  };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test('hardened client registers, discovers, opens and reads an inbox against the actual loopback router', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kin-client-transport-'));
  const router = createNetworkRouter({ directory, allowedOrigins: [] });
  const server = createServer(async (req, res) => {
    await router(req, res, new URL(req.url!, 'http://localhost'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const devices = [await createDeviceIdentity(), await createDeviceIdentity()];
    const clients = devices.map((device) => new RelayClient(address, device));
    for (const [i, device] of devices.entries()) {
      const registered = await clients[i].request<NetworkIdentity>('/api/network/register', {
        signingKey: device.signingKey,
        exchangeKey: device.exchangeKey,
        registrationNonce: crypto.randomUUID(),
        capsule: {
          alias: `Garden friend ${i}`,
          interests: ['Gardening'],
          intents: ['friendship'],
          purpose: 'Thoughtful introductions',
        },
      });
      assert.equal(registered.id, device.id);
    }
    const directoryResponse = await clients[0].request<{ peers: NetworkIdentity[] }>(
      '/api/network/directory',
    );
    assert.equal(directoryResponse.peers[0].id, devices[1].id);
    const opened = await clients[0].request<{ id: string }>('/api/network/conversations', {
      peerId: devices[1].id,
    });
    const inbox = await clients[1].request<NetworkInbox>('/api/network/inbox');
    assert.equal(inbox.conversations[0].id, opened.id);
    assert.deepEqual(inbox.packets, []);
    assert.equal(inbox.identity.id, devices[1].id);
    assert.deepEqual(await clients[0].request('/api/network/leave'), { ok: true });
  } finally {
    await router.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('challenge and POST prohibit redirects, omit credentials and share a single abort signal', async () => {
  const device = await createDeviceIdentity();
  const current = challenge();
  let signal: AbortSignal | undefined;
  let calls = 0;
  await withFetch(
    async (url, init) => {
      calls += 1;
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.mode, 'cors');
      assert.equal(init?.cache, 'no-store');
      assert.ok(init?.signal instanceof AbortSignal);
      if (calls === 1) {
        signal = init.signal;
        assert.equal(
          String(url),
          `https://relay.example/api/network/challenge?agentId=${device.id}`,
        );
        return json(current);
      }
      assert.equal(init.signal, signal);
      assert.equal(init.method, 'POST');
      assert.equal(new Headers(init.headers).get('Content-Type'), 'application/json');
      const body = JSON.parse(String(init.body));
      const signedText = JSON.stringify({
        path: '/api/network/messages',
        ...current,
        payload: body.payload,
      });
      const key = await crypto.subtle.importKey(
        'jwk',
        device.signingKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
      assert.equal(
        await crypto.subtle.verify(
          { name: 'ECDSA', hash: 'SHA-256' },
          key,
          unbase64url(body.signature),
          new TextEncoder().encode(signedText),
        ),
        true,
      );
      return json({ ok: true });
    },
    async () =>
      assert.deepEqual(
        await new RelayClient('https://relay.example', device).request('/api/network/messages', {
          text: 'Selected ciphertext stand-in',
        }),
        { ok: true },
      ),
  );
  assert.equal(calls, 2);
});

test('strict challenge validation rejects malformed UUIDs, weak or noncanonical nonces and extra fields before POST', async () => {
  const relay = await client();
  const valid = challenge();
  const bad = [
    {},
    { ...valid, challengeId: 'not-a-uuid' },
    { ...valid, challengeId: '00000000-0000-0000-0000-000000000000' },
    { ...valid, nonce: 'short-nonce' },
    { ...valid, nonce: `${'A'.repeat(42)}B` },
    { ...valid, nonce: `${nonce}=` },
    { ...valid, nonce: 'A'.repeat(42) },
    { ...valid, error: sentinel },
    null,
    [],
  ];
  for (const value of bad) {
    let calls = 0;
    await withFetch(
      async () => {
        calls++;
        return json(value);
      },
      async () => {
        await assert.rejects(relay.request('/api/network/directory'), fixedError(0, /invalid/));
      },
    );
    assert.equal(calls, 1);
  }
});

test('redirect statuses, followed redirects and substituted response URLs fail closed at either stage', async () => {
  const relay = await client();
  for (const stage of [1, 2]) {
    for (const kind of ['status', 'redirected', 'url']) {
      let calls = 0;
      await withFetch(
        async () => {
          if (++calls !== stage) return json(challenge());
          const response = json(
            { ok: true },
            kind === 'status'
              ? { status: 302, headers: { Location: 'https://other.example' } }
              : {},
          );
          if (kind === 'redirected') Object.defineProperty(response, 'redirected', { value: true });
          if (kind === 'url')
            Object.defineProperty(response, 'url', { value: 'https://other.example/private' });
          return response;
        },
        async () => {
          await assert.rejects(
            relay.request('/api/network/directory'),
            fixedError(undefined, /unsupported redirect/),
          );
        },
      );
      assert.equal(calls, stage);
    }
  }
});

test('HTTP failures preserve status with fixed messages and rate-limit backoff text without reflecting relay errors', async () => {
  const relay = await client();
  for (const stage of [1, 2]) {
    for (const status of [400, 401, 403, 404, 409, 413, 429, 500, 503]) {
      let calls = 0;
      await withFetch(
        async () => (++calls === stage ? json({ error: sentinel }, { status }) : json(challenge())),
        async () => {
          await assert.rejects(
            relay.request('/api/network/directory'),
            fixedError(status, status === 429 ? /rate limit/ : undefined),
          );
        },
      );
      assert.equal(calls, stage);
    }
  }
});

test('leave retains only the exact existing 401 absence compatibility message', async () => {
  const relay = await client();
  const safe = 'Register this identity before using the relay.';
  for (const text of [safe, `${safe} ${sentinel}`, sentinel]) {
    let calls = 0;
    await withFetch(
      async () => (++calls === 1 ? json(challenge()) : json({ error: text }, { status: 401 })),
      async () => {
        await assert.rejects(relay.request('/api/network/leave'), (error: unknown) => {
          fixedError(401)(error);
          assert.equal((error as Error).message === safe, text === safe);
          return true;
        });
      },
    );
  }
});

test('fetch and guard failures never expose underlying error text or retry a signed write', async () => {
  const relay = await client();
  for (const stage of [1, 2]) {
    let calls = 0;
    await withFetch(
      async () => {
        if (++calls === stage) throw new Error(sentinel);
        return json(challenge());
      },
      async () => {
        await assert.rejects(
          relay.request('/api/network/ack'),
          fixedError(0, /could not be reached/),
        );
      },
    );
    assert.equal(calls, stage);
  }
  let calls = 0;
  await withFetch(
    async () => {
      calls++;
      return json(challenge());
    },
    async () => {
      await assert.rejects(
        relay.request('/api/network/ack', {}, () => {
          throw new Error(sentinel);
        }),
        fixedError(0, /cancelled before sending/),
      );
    },
  );
  assert.equal(calls, 1);
});

test('successful HTTP status cannot turn malformed, nonobject or non-JSON bodies into an empty success', async () => {
  const relay = await client();
  for (const body of ['{broken-json', 'null', '[]', 'true', '"secret text"']) {
    let calls = 0;
    await withFetch(
      async () =>
        ++calls === 1
          ? json(challenge())
          : new Response(body, { headers: { 'Content-Type': 'application/json' } }),
      async () => {
        await assert.rejects(relay.request('/api/network/ack'), fixedError(0, /invalid JSON/));
      },
    );
  }
  for (const contentType of ['text/html', 'text/plain', 'application/problem+json', '']) {
    let calls = 0;
    await withFetch(
      async () =>
        ++calls === 1
          ? json(challenge())
          : new Response(JSON.stringify({ error: sentinel }), {
              headers: { 'Content-Type': contentType },
            }),
      async () => {
        await assert.rejects(relay.request('/api/network/ack'), fixedError(0, /invalid JSON/));
      },
    );
  }
});

test('declared oversized and malformed lengths are rejected for every route-specific bound', async () => {
  const relay = await client();
  for (const [path, limit] of [
    ['/api/network/challenge', RELAY_RESPONSE_LIMITS.challenge],
    ['/api/network/ack', RELAY_RESPONSE_LIMITS.write],
    ['/api/network/directory', RELAY_RESPONSE_LIMITS.directory],
    ['/api/network/inbox', RELAY_RESPONSE_LIMITS.inbox],
  ] as const) {
    let calls = 0;
    await withFetch(
      async () => {
        calls++;
        if (path !== '/api/network/challenge' && calls === 1) return json(challenge());
        return json({}, { headers: { 'Content-Length': String(limit + 1) } });
      },
      async () => {
        await assert.rejects(
          relay.request(path === '/api/network/challenge' ? '/api/network/ack' : path),
          fixedError(0, /size limit/),
        );
      },
    );
  }
  for (const length of ['-1', 'NaN', '1.5', '999999999999999999999']) {
    await withFetch(
      async () => json(challenge(), { headers: { 'Content-Length': length } }),
      async () => {
        await assert.rejects(relay.request('/api/network/ack'), fixedError(0, /invalid JSON/));
      },
    );
  }
});

test('streamed UTF-8 bytes enforce bounds even with a false small length and cancel oversize readers', async () => {
  const relay = await client();
  for (const [stage, limit] of [
    [1, RELAY_RESPONSE_LIMITS.challenge],
    [2, RELAY_RESPONSE_LIMITS.write],
  ]) {
    let calls = 0;
    let cancelled = false;
    const bytes = new TextEncoder().encode(`{"text":"${'🌱'.repeat(Math.ceil(limit / 4))}"}`);
    await withFetch(
      async () => {
        if (++calls !== stage) return json(challenge());
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(bytes);
            },
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { 'Content-Type': 'application/json', 'Content-Length': '1' } },
        );
      },
      async () => {
        await assert.rejects(relay.request('/api/network/ack'), fixedError(0, /size limit/));
      },
    );
    assert.equal(cancelled, true);
  }
});

test('UTF-8 decoding rejects malformed byte sequences and accepts a valid character split across chunks', async () => {
  const relay = await client();
  for (const bytes of [Uint8Array.of(0xc3, 0x28), Uint8Array.of(0xf0, 0x9f)]) {
    let calls = 0;
    await withFetch(
      async () =>
        ++calls === 1
          ? json(challenge())
          : new Response(bytes, { headers: { 'Content-Type': 'application/json' } }),
      async () => {
        await assert.rejects(relay.request('/api/network/ack'), fixedError(0, /invalid JSON/));
      },
    );
  }
  let calls = 0;
  const bytes = new TextEncoder().encode(JSON.stringify({ message: 'Hello 🌱' }));
  await withFetch(
    async () =>
      ++calls === 1
        ? json(challenge())
        : new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
                controller.close();
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
    async () => {
      assert.deepEqual(await relay.request('/api/network/ack'), { message: 'Hello 🌱' });
    },
  );
});

test('the total deadline bounds a challenge fetch that ignores abort and prevents late POST', async (t) => {
  const relay = await client();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveFetch!: (response: Response) => void;
  let signal: AbortSignal | undefined;
  let calls = 0;
  await withFetch(
    async (_url, init) => {
      calls++;
      signal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    },
    async () => {
      const rejected = assert.rejects(relay.request('/api/network/ack'), fixedError(0, /deadline/));
      assert.equal(signal?.aborted, false);
      t.mock.timers.tick(RELAY_REQUEST_TIMEOUT_MS);
      await rejected;
      assert.equal(signal?.aborted, true);
      resolveFetch(json(challenge()));
      await tick();
      assert.equal(calls, 1);
    },
  );
});

test('the deadline remains active through a stalled challenge response body and cancels its reader', async (t) => {
  const relay = await client();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started!: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  let cancelled = false;
  let calls = 0;
  await withFetch(
    async () => {
      calls++;
      return new Response(
        new ReadableStream<Uint8Array>({
          pull() {
            started();
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    },
    async () => {
      const rejected = assert.rejects(relay.request('/api/network/ack'), fixedError(0, /deadline/));
      await reading;
      await tick();
      t.mock.timers.tick(RELAY_REQUEST_TIMEOUT_MS);
      await rejected;
      assert.equal(cancelled, true);
      assert.equal(calls, 1);
    },
  );
});

test('challenge time and stalled POST body share the same deadline rather than resetting it', async (t) => {
  const relay = await client();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let releaseChallenge!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseChallenge = resolve;
  });
  let reading!: () => void;
  const postReading = new Promise<void>((resolve) => {
    reading = resolve;
  });
  let calls = 0;
  let cancelled = false;
  let signal: AbortSignal | undefined;
  await withFetch(
    async (_url, init) => {
      signal = init?.signal ?? undefined;
      if (++calls === 1) {
        await gate;
        return json(challenge());
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          pull() {
            reading();
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    },
    async () => {
      const rejected = assert.rejects(relay.request('/api/network/ack'), fixedError(0, /deadline/));
      t.mock.timers.tick(12_000);
      releaseChallenge();
      await postReading;
      await tick();
      t.mock.timers.tick(RELAY_REQUEST_TIMEOUT_MS - 12_000 - 1);
      assert.equal(signal?.aborted, false);
      t.mock.timers.tick(1);
      await rejected;
      assert.equal(signal?.aborted, true);
      assert.equal(cancelled, true);
      assert.equal(calls, 2);
    },
  );
});

test('a stalled POST fetch is bounded and never automatically retried', async (t) => {
  const relay = await client();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started!: () => void;
  const posting = new Promise<void>((resolve) => {
    started = resolve;
  });
  let calls = 0;
  await withFetch(
    async () => {
      if (++calls === 1) return json(challenge());
      started();
      return new Promise<Response>(() => {});
    },
    async () => {
      const rejected = assert.rejects(relay.request('/api/network/ack'), fixedError(0, /deadline/));
      await posting;
      t.mock.timers.tick(RELAY_REQUEST_TIMEOUT_MS);
      await rejected;
      assert.equal(calls, 2);
    },
  );
});

test('payload and device mutations during challenge retrieval or the pre-POST guard cannot change signed bytes', async () => {
  const device = await createDeviceIdentity();
  const original = structuredClone(device);
  const current = challenge();
  const registrationNonce = crypto.randomUUID();
  const payload = { registrationNonce, nested: { selected: 'original' } };
  let calls = 0;
  await withFetch(
    async (_url, init) => {
      if (++calls === 1) {
        payload.registrationNonce = crypto.randomUUID();
        payload.nested.selected = 'changed during challenge';
        device.id = 'f'.repeat(64);
        device.signingPrivate.d = sentinel;
        return json(current);
      }
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.payload, { registrationNonce, nested: { selected: 'original' } });
      assert.equal(body.agentId, original.id);
      const signedText = JSON.stringify({
        path: '/api/network/register',
        ...current,
        payload: body.payload,
      });
      const key = await crypto.subtle.importKey(
        'jwk',
        original.signingKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
      assert.equal(
        await crypto.subtle.verify(
          { name: 'ECDSA', hash: 'SHA-256' },
          key,
          unbase64url(body.signature),
          new TextEncoder().encode(signedText),
        ),
        true,
      );
      return json({
        registrationId: registrationNonce,
        attestation: { signedText, signature: body.signature },
      });
    },
    async () => {
      await new RelayClient('https://relay.example', device).request(
        '/api/network/register',
        payload,
        () => {
          payload.nested.selected = 'changed in guard';
        },
      );
    },
  );
  assert.equal(calls, 2);
});

test('mutations while signing is awaited cannot replace the payload after the signature is produced', async (t) => {
  const relay = await client();
  const payload = { nested: { selected: 'original' } };
  const originalSign = crypto.subtle.sign.bind(crypto.subtle);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let signing!: () => void;
  const started = new Promise<void>((resolve) => {
    signing = resolve;
  });
  t.mock.method(crypto.subtle, 'sign', async (...args: Parameters<SubtleCrypto['sign']>) => {
    const signature = await originalSign(...args);
    signing();
    await gate;
    return signature;
  });
  let calls = 0;
  await withFetch(
    async (_url, init) => {
      if (++calls === 1) return json(challenge());
      assert.deepEqual(JSON.parse(String(init?.body)).payload, {
        nested: { selected: 'original' },
      });
      return json({ ok: true });
    },
    async () => {
      const pending = relay.request('/api/network/ack', payload);
      await started;
      payload.nested.selected = 'changed while awaiting signature';
      release();
      await pending;
    },
  );
});

test('timed-out signing cannot send a write after the cryptographic operation eventually finishes', async (t) => {
  const relay = await client();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const originalSign = crypto.subtle.sign.bind(crypto.subtle);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let signing!: () => void;
  const started = new Promise<void>((resolve) => {
    signing = resolve;
  });
  t.mock.method(crypto.subtle, 'sign', async (...args: Parameters<SubtleCrypto['sign']>) => {
    const signature = await originalSign(...args);
    signing();
    await gate;
    return signature;
  });
  let calls = 0;
  await withFetch(
    async () => {
      calls++;
      return json(challenge());
    },
    async () => {
      const rejected = assert.rejects(relay.request('/api/network/ack'), fixedError(0, /deadline/));
      await started;
      t.mock.timers.tick(RELAY_REQUEST_TIMEOUT_MS);
      await rejected;
      release();
      await tick();
      assert.equal(calls, 1);
    },
  );
});

test('invalid, cyclic, unrepresentable and oversized payloads fail before requesting any challenge', async () => {
  const relay = await client();
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const values = [
    null,
    [],
    cyclic,
    { value: 1n },
    { value: 'x'.repeat(32_768) },
    {
      toJSON() {
        throw new Error(sentinel);
      },
    },
  ];
  let calls = 0;
  await withFetch(
    async () => {
      calls++;
      return json(challenge());
    },
    async () => {
      for (const payload of values)
        await assert.rejects(
          relay.request('/api/network/ack', payload as Record<string, unknown>),
          fixedError(0, /payload is invalid/),
        );
    },
  );
  assert.equal(calls, 0);
});

test('response caps accommodate conservative full-capacity directory and inbox contract fixtures', async () => {
  const device = await createDeviceIdentity();
  const key = { ...device.signingKey, ext: true, key_ops: ['verify'], use: 'sig', alg: 'ES256' };
  const capsule = {
    alias: '\u0000'.repeat(60),
    purpose: '\u0000'.repeat(240),
    interests: Array.from(
      { length: 12 },
      (_, i) => `${'\u0000'.repeat(46)}${String.fromCharCode(65 + i)}`,
    ),
    intents: ['friendship', 'dating', 'collaboration'],
  };
  agentCapsuleSchema.parse(capsule);
  const peers = Array.from({ length: 200 }, (_, i) => {
    const registrationId = crypto.randomUUID();
    return {
      id: i.toString(16).padStart(64, '0'),
      registrationId,
      signingKey: key,
      exchangeKey: device.exchangeKey,
      capsule,
      attestation: {
        signedText: JSON.stringify({
          path: '/api/network/register',
          ...challenge(),
          payload: {
            signingKey: key,
            exchangeKey: device.exchangeKey,
            capsule,
            registrationNonce: registrationId,
          },
        }),
        signature: 'A'.repeat(86),
      },
    };
  });
  const identity = peers[0];
  const other = peers[1];
  const conversations = Array.from({ length: 2000 }, () => {
    const id = crypto.randomUUID();
    const registrationIds = {
      [identity.id]: identity.registrationId,
      [other.id]: other.registrationId,
    };
    const receipts = Object.fromEntries(
      [identity, other].map((peer) => [
        peer.id,
        {
          signedText: JSON.stringify({
            path: '/api/network/decisions',
            ...challenge(),
            payload: { conversationId: id, decision: 'approve', registrationIds },
          }),
          signature: 'A'.repeat(86),
        },
      ]),
    );
    return {
      id,
      participants: [identity.id, other.id],
      registrationIds,
      approvals: { [identity.id]: true, [other.id]: true },
      agentReady: { [identity.id]: true, [other.id]: true },
      state: 'connected',
      createdAt: new Date().toISOString(),
      decisionAttestations: receipts,
    };
  });
  const packets = Array.from({ length: 2000 }, (_, i) => ({
    id: crypto.randomUUID(),
    conversationId: conversations[i].id,
    from: other.id,
    to: identity.id,
    kind: 'chat',
    ciphertext: 'A'.repeat(16_000),
    iv: 'A'.repeat(16),
    createdAt: new Date().toISOString(),
  }));
  const directory = { peers };
  const inbox = { identity, peers, conversations, packets };
  const directoryBytes = Buffer.byteLength(JSON.stringify(directory));
  const inboxBytes = Buffer.byteLength(JSON.stringify(inbox));
  assert.ok(directoryBytes < RELAY_RESPONSE_LIMITS.directory);
  assert.ok(inboxBytes < RELAY_RESPONSE_LIMITS.inbox);
  // This synthetic size fixture is not a valid signed population or a throughput benchmark.
  assert.ok(inboxBytes > 32 * 1024 * 1024);
  const relay = await client();
  for (const [path, body] of [
    ['/api/network/directory', directory],
    ['/api/network/inbox', inbox],
  ] as const) {
    let calls = 0;
    await withFetch(
      async () => (++calls === 1 ? json(challenge()) : json(body)),
      async () => {
        const response = await relay.request<Record<string, unknown[]>>(path);
        assert.equal(response.peers.length, 200);
        if (path.endsWith('/inbox')) assert.equal(response.packets.length, 2000);
      },
    );
  }
  console.log(
    `Synthetic relay size fixture: directory=${directoryBytes} bytes inbox=${inboxBytes} bytes.`,
  );
});
