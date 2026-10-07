import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  diffieHellman,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  verify,
} from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createNetworkRouter } from '../server/network.js';
import type { NetworkConversation, NetworkIdentity } from '../src/shared/network-types.js';

const fingerprint = (key: JsonWebKey) =>
  createHash('sha256')
    .update(JSON.stringify({ kty: 'EC', crv: 'P-256', x: key.x, y: key.y }))
    .digest('hex');
function owner(alias: string) {
  const signing = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const exchange = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const signingKey = signing.publicKey.export({ format: 'jwk' });
  const exchangeKey = exchange.publicKey.export({ format: 'jwk' });
  return {
    id: fingerprint(signingKey),
    signing,
    exchange,
    registration: {
      signingKey,
      exchangeKey,
      registrationNonce: randomUUID(),
      capsule: {
        alias,
        intents: ['friendship'],
        interests: ['Books', 'Coffee'],
        purpose: 'Meet people for thoughtful weekend conversations.',
      },
    },
  };
}
type TestOwner = ReturnType<typeof owner>;
async function harness(existingDirectory?: string) {
  const directory = existingDirectory ?? (await mkdtemp(join(tmpdir(), 'kin-relay-')));
  const router = createNetworkRouter({ directory, allowedOrigins: ['https://kin.example'] });
  const server = createServer(async (req, res) => {
    if (!(await router(req, res, new URL(req.url!, 'http://localhost')))) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function request(
    path: string,
    method = 'GET',
    payload?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(payload ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const body = response.status === 204 ? null : await response.json();
    return { status: response.status, body, headers: response.headers };
  }
  async function envelope(
    agent: TestOwner,
    path: string,
    payload: Record<string, unknown>,
    signingOwner = agent,
  ) {
    const challenge = await request(`/api/network/challenge?agentId=${agent.id}`);
    assert.equal(challenge.status, 200, JSON.stringify(challenge.body));
    const { challengeId, nonce } = challenge.body;
    const signedText = JSON.stringify({ path, challengeId, nonce, payload });
    const signature = sign('sha256', Buffer.from(signedText), {
      key: signingOwner.signing.privateKey,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url');
    return { request: { agentId: agent.id, challengeId, payload, signature }, signedText };
  }
  async function post(
    agent: TestOwner,
    route: string,
    payload: Record<string, unknown> = {},
    signingOwner = agent,
  ) {
    const path = `/api/network/${route}`;
    const signed = await envelope(agent, path, payload, signingOwner);
    return request(path, 'POST', signed.request);
  }
  async function register(agent: TestOwner) {
    agent.registration.registrationNonce = randomUUID();
    const registered = await post(agent, 'register', agent.registration);
    assert.equal(registered.status, 200, JSON.stringify(registered.body));
    return registered.body;
  }
  async function close(cleanup = true) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (cleanup) await rm(directory, { recursive: true, force: true });
  }
  return { directory, base, request, envelope, post, register, close };
}
test('signed public capsules accept bounded custom interests and reject contact or duplicate labels', async () => {
  const relay = await harness();
  try {
    const person = owner('Custom interests agent');
    person.registration.capsule.interests = ['Urban gardening', 'AI ethics'];
    const registered = await relay.register(person);
    assert.deepEqual(registered.capsule.interests, ['Urban gardening', 'AI ethics']);
    for (const interests of [
      ['person@example.com'],
      ['AI ethics', 'ai  ethics'],
      ['x'.repeat(49)],
    ]) {
      const invalid = owner('Invalid interest agent');
      invalid.registration.capsule.interests = interests;
      const response = await relay.post(invalid, 'register', invalid.registration);
      assert.equal(response.status, 400);
    }
  } finally {
    await relay.close();
  }
});
function encrypted(
  from: TestOwner,
  to: TestOwner,
  conversationId: string,
  kind: 'agent' | 'chat',
  plaintext: string,
) {
  const secret = diffieHellman({
    privateKey: from.exchange.privateKey,
    publicKey: to.exchange.publicKey,
  });
  const iv = randomBytes(12);
  const aad = Buffer.from(JSON.stringify({ conversationId, from: from.id, to: to.id, kind }));
  const cipher = createCipheriv('aes-256-gcm', secret, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return {
    conversationId,
    kind,
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
  };
}
function decrypt(
  to: TestOwner,
  from: TestOwner,
  packet: { conversationId: string; kind: string; iv: string; ciphertext: string },
): string {
  const secret = diffieHellman({
    privateKey: to.exchange.privateKey,
    publicKey: from.exchange.publicKey,
  });
  const ciphertext = Buffer.from(packet.ciphertext, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', secret, Buffer.from(packet.iv, 'base64url'));
  decipher.setAAD(
    Buffer.from(
      JSON.stringify({
        conversationId: packet.conversationId,
        from: from.id,
        to: to.id,
        kind: packet.kind,
      }),
    ),
  );
  decipher.setAuthTag(ciphertext.subarray(-16));
  return Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]).toString();
}

test('registration authenticates P256 key ownership and exposes independently verifiable public attestation', async () => {
  const relay = await harness();
  try {
    const a = owner('Robin'),
      b = owner('Sam');
    const identity = await relay.register(a);
    assert.equal(identity.id, fingerprint(identity.signingKey));
    assert.equal(
      verify(
        'sha256',
        Buffer.from(identity.attestation.signedText),
        { key: a.signing.publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(identity.attestation.signature, 'base64url'),
      ),
      true,
    );
    assert.deepEqual(JSON.parse(identity.attestation.signedText).payload, a.registration);
    await relay.register(b);
    const directory = await relay.post(a, 'directory');
    assert.equal(directory.status, 200);
    assert.deepEqual(
      directory.body.peers.map((peer: NetworkIdentity) => peer.id),
      [b.id],
    );
    assert.deepEqual(
      Object.keys(directory.body.peers[0]).sort(),
      ['id', 'registrationId', 'signingKey', 'exchangeKey', 'capsule', 'attestation'].sort(),
    );
    const raw = await readFile(join(relay.directory, 'relay.json'), 'utf8');
    assert.equal(raw.includes('PRIVATE KEY'), false);
    assert.equal(raw.includes('boundaries'), false);
    assert.equal((await stat(relay.directory)).mode & 0o777, 0o700);
    assert.equal((await stat(join(relay.directory, 'relay.json'))).mode & 0o777, 0o600);
  } finally {
    await relay.close();
  }
});

test('signed endpoint challenges are single-use, path-bound, and reject wrong-key or changed payload signatures', async () => {
  const relay = await harness();
  try {
    const a = owner('Robin'),
      b = owner('Sam');
    await relay.register(a);
    const signed = await relay.envelope(a, '/api/network/directory', {});
    assert.equal(
      (await relay.request('/api/network/directory', 'POST', signed.request)).status,
      200,
    );
    assert.equal(
      (await relay.request('/api/network/directory', 'POST', signed.request)).status,
      401,
    );
    assert.equal((await relay.post(a, 'directory', {}, b)).status, 401);
    const wrongPath = await relay.envelope(a, '/api/network/directory', {});
    assert.equal(
      (await relay.request('/api/network/inbox', 'POST', wrongPath.request)).status,
      401,
    );
    const changed = await relay.envelope(a, '/api/network/conversations', { peerId: b.id });
    changed.request.payload.peerId = a.id;
    assert.equal(
      (await relay.request('/api/network/conversations', 'POST', changed.request)).status,
      401,
    );
    const wrongIdentity = await relay.envelope(a, '/api/network/directory', {});
    wrongIdentity.request.agentId = b.id;
    assert.equal(
      (await relay.request('/api/network/directory', 'POST', wrongIdentity.request)).status,
      401,
    );
  } finally {
    await relay.close();
  }
});

test('isolated inboxes route actual encrypted packets only to participants and recipients control acknowledgment', async () => {
  const relay = await harness();
  try {
    const a = owner('Robin'),
      b = owner('Sam'),
      c = owner('Other owner');
    await relay.register(a);
    await relay.register(b);
    await relay.register(c);
    const created = await relay.post(a, 'conversations', { peerId: b.id });
    const conversation = created.body as NetworkConversation;
    assert.equal((await relay.post(b, 'conversations', { peerId: a.id })).body.id, conversation.id);
    const content = 'PRIVATE POLICY: I prefer a calm first meeting and keep this encrypted.';
    const packet = await relay.post(
      a,
      'messages',
      encrypted(a, b, conversation.id, 'agent', content),
    );
    assert.equal(packet.status, 200);
    assert.equal(decrypt(b, a, packet.body), content);
    const sender = await relay.post(a, 'inbox');
    const recipient = await relay.post(b, 'inbox');
    const stranger = await relay.post(c, 'inbox');
    assert.equal(sender.body.packets.length, 0);
    assert.equal(recipient.body.packets.length, 1);
    assert.equal(stranger.body.packets.length, 0);
    assert.equal(stranger.body.conversations.length, 0);
    assert.deepEqual(
      recipient.body.peers.map((peer: NetworkIdentity) => peer.id),
      [a.id],
    );
    assert.equal(
      (await relay.post(c, 'messages', encrypted(c, a, conversation.id, 'agent', 'forged'))).status,
      404,
    );
    assert.equal((await relay.post(c, 'ready', { conversationId: conversation.id })).status, 404);
    assert.equal(
      (
        await relay.post(c, 'decisions', {
          conversationId: conversation.id,
          decision: 'approve',
          registrationIds: conversation.registrationIds,
        })
      ).status,
      404,
    );
    assert.equal((await relay.post(a, 'ack', { packetIds: [packet.body.id] })).status, 403);
    assert.equal((await relay.post(b, 'ack', { packetIds: [packet.body.id] })).body.removed, 1);
    assert.equal((await relay.post(b, 'inbox')).body.packets.length, 0);
    const raw = await readFile(join(relay.directory, 'relay.json'), 'utf8');
    assert.equal(raw.includes(content), false);
  } finally {
    await relay.close();
  }
});

test('human chat requires both agents ready and two separate signed owner approvals', async () => {
  const relay = await harness();
  try {
    const a = owner('Robin'),
      b = owner('Sam');
    await relay.register(a);
    await relay.register(b);
    const conversation = (await relay.post(a, 'conversations', { peerId: b.id })).body;
    const message = encrypted(a, b, conversation.id, 'chat', 'A human hello after two yeses.');
    assert.equal((await relay.post(a, 'messages', message)).status, 409);
    assert.equal(
      (
        await relay.post(a, 'decisions', {
          conversationId: conversation.id,
          decision: 'approve',
          registrationIds: conversation.registrationIds,
        })
      ).status,
      409,
    );
    assert.equal(
      (await relay.post(a, 'ready', { conversationId: conversation.id })).body.state,
      'negotiating',
    );
    assert.equal(
      (
        await relay.post(a, 'decisions', {
          conversationId: conversation.id,
          decision: 'approve',
          registrationIds: conversation.registrationIds,
        })
      ).status,
      409,
    );
    assert.equal(
      (await relay.post(b, 'ready', { conversationId: conversation.id })).body.state,
      'awaiting-approval',
    );
    const firstApproval = await relay.post(a, 'decisions', {
      conversationId: conversation.id,
      decision: 'approve',
      registrationIds: conversation.registrationIds,
    });
    assert.equal(firstApproval.body.state, 'awaiting-approval');
    assert.equal(firstApproval.body.approvals[a.id], true);
    assert.equal(firstApproval.body.approvals[b.id], false);
    assert.equal((await relay.post(a, 'messages', message)).status, 409);
    const secondApproval = await relay.post(b, 'decisions', {
      conversationId: conversation.id,
      decision: 'approve',
      registrationIds: conversation.registrationIds,
    });
    assert.equal(secondApproval.body.state, 'connected');
    for (const agent of [a, b]) {
      const receipt = secondApproval.body.decisionAttestations[agent.id];
      const signed = JSON.parse(receipt.signedText);
      assert.equal(signed.path, '/api/network/decisions');
      assert.equal(signed.payload.conversationId, conversation.id);
      assert.equal(signed.payload.decision, 'approve');
      assert.deepEqual(signed.payload.registrationIds, conversation.registrationIds);
      assert.equal(
        verify(
          'sha256',
          Buffer.from(receipt.signedText),
          { key: agent.signing.publicKey, dsaEncoding: 'ieee-p1363' },
          Buffer.from(receipt.signature, 'base64url'),
        ),
        true,
      );
    }
    const packet = await relay.post(a, 'messages', message);
    assert.equal(packet.status, 200);
    assert.equal(decrypt(b, a, packet.body), 'A human hello after two yeses.');
  } finally {
    await relay.close();
  }
});

test('decline revokes queued messages, block is pair-wide terminal, and leave cannot resurrect old consent', async () => {
  const relay = await harness();
  try {
    const a = owner('Robin'),
      b = owner('Sam');
    await relay.register(a);
    await relay.register(b);
    const first = (await relay.post(a, 'conversations', { peerId: b.id })).body;
    await relay.post(a, 'messages', encrypted(a, b, first.id, 'agent', 'old negotiation'));
    assert.equal(
      (await relay.post(b, 'decisions', { conversationId: first.id, decision: 'decline' })).body
        .state,
      'declined',
    );
    assert.equal((await relay.post(b, 'inbox')).body.packets.length, 0);
    assert.equal((await relay.post(a, 'ready', { conversationId: first.id })).status, 409);
    const second = (await relay.post(a, 'conversations', { peerId: b.id })).body;
    assert.notEqual(second.id, first.id);
    await relay.post(a, 'messages', encrypted(a, b, second.id, 'agent', 'another negotiation'));
    await relay.post(a, 'ready', { conversationId: second.id });
    await relay.post(b, 'ready', { conversationId: second.id });
    await relay.post(a, 'decisions', {
      conversationId: second.id,
      decision: 'approve',
      registrationIds: second.registrationIds,
    });
    await relay.post(b, 'decisions', {
      conversationId: second.id,
      decision: 'approve',
      registrationIds: second.registrationIds,
    });
    const blocked = await relay.post(a, 'decisions', {
      conversationId: second.id,
      decision: 'block',
    });
    assert.equal(blocked.body.state, 'blocked');
    assert.equal(Object.values(blocked.body.approvals).some(Boolean), false);
    const inbox = await relay.post(b, 'inbox');
    assert.ok(
      inbox.body.conversations.every(
        (conversation: NetworkConversation) => conversation.state === 'blocked',
      ),
    );
    assert.equal(inbox.body.packets.length, 0);
    assert.equal((await relay.post(b, 'conversations', { peerId: a.id })).status, 409);
    assert.equal(
      (
        await relay.post(b, 'decisions', {
          conversationId: first.id,
          decision: 'approve',
          registrationIds: first.registrationIds,
        })
      ).status,
      409,
    );
    assert.equal(
      (await relay.post(b, 'messages', encrypted(b, a, second.id, 'chat', 'blocked'))).status,
      409,
    );
    assert.equal((await relay.post(a, 'leave')).body.ok, true);
    assert.equal((await relay.post(a, 'inbox')).status, 401);
    assert.equal((await relay.post(b, 'inbox')).body.conversations.length, 0);
    await relay.register(a);
    const fresh = (await relay.post(a, 'conversations', { peerId: b.id })).body;
    assert.equal(fresh.state, 'negotiating');
    assert.equal(Object.values(fresh.approvals).some(Boolean), false);
    assert.notEqual(fresh.id, second.id);
  } finally {
    await relay.close();
  }
});

test('strict registration rejects private keys, invalid curve points, contact capsules, and malformed ciphertext', async () => {
  const relay = await harness();
  try {
    const a = owner('Robin'),
      b = owner('Sam');
    const privateKey = a.signing.privateKey.export({ format: 'jwk' });
    assert.equal(
      (await relay.post(a, 'register', { ...a.registration, signingKey: privateKey })).status,
      400,
    );
    assert.equal(
      (
        await relay.post(a, 'register', {
          ...a.registration,
          exchangeKey: {
            ...a.registration.exchangeKey,
            x: Buffer.alloc(32).toString('base64url'),
            y: Buffer.alloc(32).toString('base64url'),
          },
        })
      ).status,
      400,
    );
    for (const purpose of [
      'Email robin@example.invalid',
      'Call +1 (212) 555-0100',
      'See https://example.invalid',
    ]) {
      assert.equal(
        (
          await relay.post(a, 'register', {
            ...a.registration,
            capsule: { ...a.registration.capsule, purpose },
          })
        ).status,
        400,
      );
    }
    assert.equal(
      (
        await relay.post(a, 'register', {
          ...a.registration,
          capsule: { ...a.registration.capsule, boundaries: 'private notes' },
        })
      ).status,
      400,
    );
    await relay.register(a);
    await relay.register(b);
    const conversation = (await relay.post(a, 'conversations', { peerId: b.id })).body;
    assert.equal((await relay.post(a, 'conversations', { peerId: a.id })).status, 400);
    const encryptedMessage = encrypted(a, b, conversation.id, 'agent', 'a valid message');
    assert.equal(
      (
        await relay.post(a, 'messages', {
          ...encryptedMessage,
          plaintext: 'must never be accepted',
        })
      ).status,
      400,
    );
    assert.equal(
      (await relay.post(a, 'messages', { ...encryptedMessage, ciphertext: 'plaintext' })).status,
      400,
    );
    assert.equal(
      (
        await relay.post(a, 'messages', {
          ...encryptedMessage,
          iv: randomBytes(8).toString('base64url'),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await relay.post(a, 'messages', {
          ...encryptedMessage,
          ciphertext: randomBytes(12_100).toString('base64url'),
        })
      ).status,
      400,
    );
    const malformed = await fetch(`${relay.base}/api/network/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{nope',
    });
    assert.equal(malformed.status, 400);
    const oversized = await relay.request('/api/network/register', 'POST', {
      huge: 'x'.repeat(33_000),
    });
    assert.equal(oversized.status, 413);
  } finally {
    await relay.close();
  }
});

test('relay persists only ciphertext/public metadata and consent across restarts', async () => {
  const first = await harness();
  const a = owner('Robin'),
    b = owner('Sam');
  let second: Awaited<ReturnType<typeof harness>> | undefined;
  try {
    await first.register(a);
    await first.register(b);
    const conversation = (await first.post(a, 'conversations', { peerId: b.id })).body;
    await first.post(a, 'ready', { conversationId: conversation.id });
    await first.post(b, 'ready', { conversationId: conversation.id });
    await first.post(a, 'decisions', {
      conversationId: conversation.id,
      decision: 'approve',
      registrationIds: conversation.registrationIds,
    });
    await first.post(b, 'decisions', {
      conversationId: conversation.id,
      decision: 'approve',
      registrationIds: conversation.registrationIds,
    });
    await first.post(
      a,
      'messages',
      encrypted(a, b, conversation.id, 'chat', 'PRIVATE-MESSAGE-NOT-IN-RELAY-FILE'),
    );
    await first.close(false);
    second = await harness(first.directory);
    const restored = await second.post(b, 'inbox');
    assert.equal(restored.status, 200);
    assert.equal(restored.body.conversations[0].state, 'connected');
    assert.equal(decrypt(b, a, restored.body.packets[0]), 'PRIVATE-MESSAGE-NOT-IN-RELAY-FILE');
    const raw = await readFile(join(first.directory, 'relay.json'), 'utf8');
    assert.equal(raw.includes('PRIVATE-MESSAGE-NOT-IN-RELAY-FILE'), false);
  } finally {
    if (second) await second.close();
    else await first.close();
  }
});

test('exact origin CORS, challenge IP limits, and unsigned methods fail closed', async () => {
  const relay = await harness();
  try {
    const a = owner('Robin');
    assert.equal((await relay.request('/api/network/health')).body.protocol, 'kin-relay/0.1');
    const preflight = await relay.request('/api/network/directory', 'OPTIONS', undefined, {
      Origin: 'https://kin.example',
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://kin.example');
    assert.equal(
      (
        await relay.request('/api/network/health', 'GET', undefined, {
          Origin: 'https://evil.example',
        })
      ).status,
      403,
    );
    assert.equal((await relay.request('/api/network/directory', 'GET')).status, 404);
    assert.equal((await relay.request('/api/network/directory', 'POST', {})).status, 400);
    assert.equal((await relay.request('/api/network/challenge?agentId=bad')).status, 400);
    for (let index = 0; index < 300; index += 1)
      assert.equal((await relay.request(`/api/network/challenge?agentId=${a.id}`)).status, 200);
    assert.equal((await relay.request(`/api/network/challenge?agentId=${a.id}`)).status, 429);
  } finally {
    await relay.close();
  }
});

test('fresh registration revokes prior consent and signed approval epochs cannot transfer to a new introduction', async () => {
  const relay = await harness();
  try {
    const a = owner('Robin'),
      b = owner('Sam');
    const originalIdentity = await relay.register(a);
    assert.equal(
      (await relay.post(a, 'register', a.registration)).status,
      409,
      'A reused client nonce must not refresh registration.',
    );
    assert.equal(
      (await relay.post(a, 'register', { ...a.registration, registrationNonce: 'not-a-uuid' }))
        .status,
      400,
    );
    await relay.register(b);
    const original = (await relay.post(a, 'conversations', { peerId: b.id })).body;
    await relay.post(a, 'ready', { conversationId: original.id });
    await relay.post(b, 'ready', { conversationId: original.id });
    await relay.post(a, 'decisions', {
      conversationId: original.id,
      decision: 'approve',
      registrationIds: original.registrationIds,
    });
    await relay.post(b, 'decisions', {
      conversationId: original.id,
      decision: 'approve',
      registrationIds: original.registrationIds,
    });
    await relay.post(
      a,
      'messages',
      encrypted(a, b, original.id, 'chat', 'queued under old consent'),
    );
    const refreshed = await relay.register(a);
    assert.notEqual(refreshed.registrationId, originalIdentity.registrationId);
    assert.equal(
      refreshed.registrationId,
      JSON.parse(refreshed.attestation.signedText).payload.registrationNonce,
    );
    const inbox = (await relay.post(b, 'inbox')).body;
    assert.equal(inbox.conversations[0].state, 'declined');
    assert.equal(Object.values(inbox.conversations[0].approvals).some(Boolean), false);
    assert.equal(Object.values(inbox.conversations[0].agentReady).some(Boolean), false);
    assert.deepEqual(inbox.conversations[0].decisionAttestations, {});
    assert.equal(inbox.packets.length, 0);
    const fresh = (await relay.post(a, 'conversations', { peerId: b.id })).body;
    await relay.post(a, 'ready', { conversationId: fresh.id });
    await relay.post(b, 'ready', { conversationId: fresh.id });
    assert.equal(
      (await relay.post(a, 'decisions', { conversationId: fresh.id, decision: 'approve' })).status,
      400,
    );
    assert.equal(
      (
        await relay.post(a, 'decisions', {
          conversationId: fresh.id,
          decision: 'approve',
          registrationIds: original.registrationIds,
        })
      ).status,
      409,
    );
    const valid = await relay.post(a, 'decisions', {
      conversationId: fresh.id,
      decision: 'approve',
      registrationIds: fresh.registrationIds,
    });
    assert.equal(valid.status, 200);
    assert.equal(valid.body.state, 'awaiting-approval');
    assert.equal(
      (await relay.post(a, 'messages', encrypted(a, b, fresh.id, 'chat', 'one new yes'))).status,
      409,
    );
  } finally {
    await relay.close();
  }
});

test('a blocked peer cannot erase another owner’s block through same-key leave and rejoin', async () => {
  const relay = await harness();
  try {
    const a = owner('Block owner'),
      b = owner('Blocked peer');
    await relay.register(a);
    await relay.register(b);
    const conversation = (await relay.post(a, 'conversations', { peerId: b.id })).body;
    await relay.post(a, 'decisions', { conversationId: conversation.id, decision: 'block' });
    await relay.post(b, 'leave');
    const stored = await readFile(join(relay.directory, 'relay.json'), 'utf8');
    assert.equal(
      stored.includes(b.id),
      false,
      'The retained protection must not contain the deleted peer’s direct identity.',
    );
    const block = JSON.parse(stored).blocks[0];
    assert.equal(block.blockerId, a.id);
    assert.equal(
      block.pairHash,
      createHash('sha256').update([a.id, b.id].sort().join(':')).digest('hex'),
    );
    await relay.register(b);
    assert.equal((await relay.post(b, 'conversations', { peerId: a.id })).status, 409);
    assert.equal((await relay.post(a, 'conversations', { peerId: b.id })).status, 409);
    await relay.post(a, 'leave');
    await relay.register(a);
    assert.equal(
      (await relay.post(a, 'conversations', { peerId: b.id })).status,
      200,
      'The block owner can delete their own protection.',
    );
  } finally {
    await relay.close();
  }
});

test('an atomic publication failure does not acknowledge or retain the failed mutation and the queue recovers', async () => {
  const relay = await harness();
  try {
    const a = owner('Existing owner'),
      b = owner('Failed registration');
    await relay.register(a);
    const path = join(relay.directory, 'relay.json'),
      backup = join(relay.directory, 'previous.json');
    const previous = await readFile(path, 'utf8');
    await rename(path, backup);
    await mkdir(path); // Deterministically obstruct rename after the temporary file is flushed.
    const failed = await relay.post(b, 'register', b.registration);
    assert.equal(failed.status, 500);
    assert.equal(await readFile(backup, 'utf8'), previous);
    assert.equal(
      (await readdir(relay.directory)).some((name) => name.endsWith('.tmp')),
      false,
    );
    await rm(path, { recursive: true });
    await rename(backup, path);
    assert.equal((await relay.post(a, 'directory')).body.peers.length, 0);
    await relay.register(b);
    assert.equal((await relay.post(a, 'directory')).body.peers[0].id, b.id);
  } finally {
    await relay.close();
  }
});

test('corrupted startup storage fails health closed without resetting records or emitting an unhandled rejection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kin-corrupt-relay-'));
  const corrupt = '{"version":1,"DO_NOT_RESET":"operator must recover this file"';
  await writeFile(join(directory, 'relay.json'), corrupt);
  const unhandled: unknown[] = [];
  const listener = (error: unknown) => unhandled.push(error);
  process.on('unhandledRejection', listener);
  const relay = await harness(directory);
  try {
    assert.equal((await relay.request('/api/network/health')).status, 500);
    assert.equal(await readFile(join(directory, 'relay.json'), 'utf8'), corrupt);
    assert.deepEqual(unhandled, []);
    const a = owner('Owner cannot register into corrupt state');
    assert.equal((await relay.post(a, 'register', a.registration)).status, 500);
    assert.equal(await readFile(join(directory, 'relay.json'), 'utf8'), corrupt);
  } finally {
    process.off('unhandledRejection', listener);
    await relay.close();
  }
});
