import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertOwnRegistration,
  assertPeerRegistration,
  canonicalKey,
  createDeviceIdentity,
  decryptMessage,
  deriveChannelKey,
  encryptMessage,
  identityId,
  loadDeviceIdentity,
  signText,
  verifyConversationApprovals,
  verifyPeerIdentity,
  type DeviceIdentity,
} from '../src/network/crypto.js';
import { normalizeRelayURL, RelayClient } from '../src/network/relay-client.js';
import type { NetworkConversation, NetworkIdentity } from '../src/shared/network-types.js';

async function registered(device: DeviceIdentity, alias: string): Promise<NetworkIdentity> {
  const capsule = {
    alias,
    intents: ['friendship' as const],
    interests: [],
    purpose: 'A thoughtful connection',
  };
  const registrationId = crypto.randomUUID();
  const signedText = JSON.stringify({
    path: '/api/network/register',
    challengeId: crypto.randomUUID(),
    nonce: 'test-nonce',
    payload: {
      signingKey: device.signingKey,
      exchangeKey: device.exchangeKey,
      capsule,
      registrationNonce: registrationId,
    },
  });
  return {
    id: device.id,
    registrationId,
    signingKey: device.signingKey,
    exchangeKey: device.exchangeKey,
    capsule,
    attestation: { signedText, signature: await signText(device, signedText) },
  };
}
test('device identities have independent public signing/exchange keys and reuse browser storage', async () => {
  const records = new Map<string, string>();
  const storage = {
    getItem: (key: string) => records.get(key) || null,
    setItem: (key: string, value: string) => records.set(key, value),
  };
  const first = await loadDeviceIdentity(storage),
    second = await loadDeviceIdentity(storage);
  assert.equal(first.id, second.id);
  assert.match(first.id, /^[a-f0-9]{64}$/);
  assert.equal(await identityId(first.signingKey), first.id);
  assert.notEqual(first.signingKey.x, first.exchangeKey.x);
  assert.equal(first.signingKey.d, undefined);
  assert.equal(first.exchangeKey.d, undefined);
  assert.ok(first.signingPrivate.d);
  assert.ok(first.exchangePrivate.d);
  assert.throws(
    () => canonicalKey({ ...first.signingKey, d: first.signingPrivate.d }),
    /public key/,
  );
});
test('directory proof rejects substituted exchange keys, aliases and forged signing identities', async () => {
  const first = await createDeviceIdentity(),
    other = await createDeviceIdentity();
  const peer = await registered(first, 'Clover');
  await verifyPeerIdentity(peer);
  await assert.rejects(
    verifyPeerIdentity({ ...peer, exchangeKey: other.exchangeKey }),
    /does not match/,
  );
  await assert.rejects(
    verifyPeerIdentity({ ...peer, capsule: { ...peer.capsule, alias: 'Injected alias' } }),
    /does not match/,
  );
  await assert.rejects(verifyPeerIdentity({ ...peer, id: other.id }), /signing identity/);
  await assert.rejects(
    verifyPeerIdentity({ ...peer, attestation: undefined }),
    /no signed registration/,
  );
});
test('ECDH channels decrypt only for both peers and authenticate conversation, sender, recipient and kind', async () => {
  const first = await createDeviceIdentity(),
    second = await createDeviceIdentity(),
    stranger = await createDeviceIdentity();
  const conversationId = crypto.randomUUID();
  const firstKey = await deriveChannelKey(first, second.exchangeKey, conversationId),
    secondKey = await deriveChannelKey(second, first.exchangeKey, conversationId),
    strangerKey = await deriveChannelKey(stranger, first.exchangeKey, conversationId);
  const envelope = { conversationId, from: first.id, to: second.id, kind: 'chat' as const };
  const packet = await encryptMessage(firstKey, envelope, 'Private hello');
  assert.equal(await decryptMessage(secondKey, envelope, packet), 'Private hello');
  assert.equal(packet.iv.length, 16);
  assert.notEqual((await encryptMessage(firstKey, envelope, 'Private hello')).iv, packet.iv);
  await assert.rejects(decryptMessage(strangerKey, envelope, packet));
  for (const mutated of [
    { ...envelope, conversationId: crypto.randomUUID() },
    { ...envelope, from: second.id },
    { ...envelope, to: stranger.id },
    { ...envelope, kind: 'agent' as const },
  ])
    await assert.rejects(decryptMessage(secondKey, mutated, packet));
  const changed = packet.ciphertext.slice(0, -1) + (packet.ciphertext.at(-1) === 'A' ? 'B' : 'A');
  await assert.rejects(decryptMessage(secondKey, envelope, { ...packet, ciphertext: changed }));
});
test('chat approval verification requires two owner signatures bound to this conversation', async () => {
  const first = await createDeviceIdentity(),
    second = await createDeviceIdentity();
  const identities = new Map([
    [first.id, await registered(first, 'Clover')],
    [second.id, await registered(second, 'Orbit')],
  ]);
  const id = crypto.randomUUID();
  const registrationIds = Object.fromEntries(
    [...identities].map(([id, identity]) => [id, identity.registrationId]),
  );
  const receipts: Record<string, { signedText: string; signature: string }> = {};
  for (const owner of [first, second]) {
    const signedText = JSON.stringify({
      path: '/api/network/decisions',
      challengeId: crypto.randomUUID(),
      nonce: 'test-nonce',
      payload: { conversationId: id, decision: 'approve', registrationIds },
    });
    receipts[owner.id] = { signedText, signature: await signText(owner, signedText) };
  }
  const conversation: NetworkConversation = {
    id,
    registrationIds,
    participants: [first.id, second.id],
    approvals: { [first.id]: true, [second.id]: true },
    agentReady: { [first.id]: true, [second.id]: true },
    state: 'connected',
    createdAt: new Date().toISOString(),
    decisionAttestations: receipts,
  };
  assert.equal(await verifyConversationApprovals(conversation, identities), true);
  assert.equal(
    await verifyConversationApprovals(
      { ...conversation, decisionAttestations: { [first.id]: receipts[first.id] } },
      identities,
    ),
    false,
  );
  assert.equal(
    await verifyConversationApprovals({ ...conversation, id: crypto.randomUUID() }, identities),
    false,
  );
  assert.equal(
    await verifyConversationApprovals({ ...conversation, state: 'blocked' }, identities),
    false,
  );
  const refreshed = new Map(identities);
  refreshed.set(second.id, await registered(second, 'Orbit'));
  assert.equal(await verifyConversationApprovals(conversation, refreshed), false);
  assert.equal(
    await verifyConversationApprovals(
      { ...conversation, registrationIds: { ...registrationIds, [first.id]: crypto.randomUUID() } },
      identities,
    ),
    false,
  );
});
test('relay URL policy permits HTTPS and loopback HTTP only', () => {
  assert.equal(normalizeRelayURL('http://127.0.0.1:4318/'), 'http://127.0.0.1:4318');
  assert.equal(normalizeRelayURL('https://relay.example'), 'https://relay.example');
  for (const address of [
    'http://remote.example',
    'https://user:password@relay.example',
    'javascript:alert(1)',
    'https://relay.example?token=secret',
    'https://relay.example#secret',
  ])
    assert.throws(() => normalizeRelayURL(address));
});

test('registration responses must echo the exact freshly signed registration receipt', async () => {
  const identity = await createDeviceIdentity(),
    old = await registered(identity, 'Previous capsule');
  const originalFetch = globalThis.fetch;
  let stale = false;
  const challengeId = crypto.randomUUID(),
    nonce = 'fresh-challenge-nonce';
  globalThis.fetch = (async (input, init) => {
    if (String(input).includes('/challenge?'))
      return new Response(JSON.stringify({ challengeId, nonce }), { status: 200 });
    const request = JSON.parse(String(init?.body));
    const fresh = {
      id: identity.id,
      registrationId: request.payload.registrationNonce,
      ...request.payload,
      attestation: {
        signedText: JSON.stringify({
          path: '/api/network/register',
          challengeId,
          nonce,
          payload: request.payload,
        }),
        signature: request.signature,
      },
    };
    return new Response(JSON.stringify(stale ? old : fresh), { status: 200 });
  }) as typeof fetch;
  try {
    const client = new RelayClient('http://127.0.0.1:4318', identity),
      payload = {
        signingKey: identity.signingKey,
        exchangeKey: identity.exchangeKey,
        capsule: { ...old.capsule, alias: 'Fresh capsule' },
        registrationNonce: crypto.randomUUID(),
      };
    const response = await client.request<NetworkIdentity>('/api/network/register', payload);
    assert.equal(response.registrationId, payload.registrationNonce);
    stale = true;
    await assert.rejects(
      client.request('/api/network/register', payload),
      /stale or altered registration/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a valid historical inbox identity cannot replace a fresh owner or pinned peer registration', async () => {
  const device = await createDeviceIdentity(),
    historical = await registered(device, 'Clover'),
    fresh = await registered(device, 'Clover');
  await verifyPeerIdentity(historical);
  await verifyPeerIdentity(fresh);
  assertOwnRegistration({ id: device.id, registrationId: fresh.registrationId }, fresh);
  assert.throws(
    () =>
      assertOwnRegistration({ id: device.id, registrationId: fresh.registrationId }, historical),
    /stale owner/,
  );
  assertPeerRegistration(historical, historical);
  assert.throws(
    () => assertPeerRegistration(historical, fresh),
    /registration or encryption key changed/,
  );
});
