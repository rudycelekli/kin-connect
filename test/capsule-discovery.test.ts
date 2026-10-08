import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPSULE_SCORE_MEANING,
  shortlistCapsules,
  type CapsuleShortlistInput,
} from '../src/network/discovery.js';
import { CAREER_GOALS } from '../src/matchmaking/domain/services/career-goals.js';
import type { NetworkIdentity } from '../src/shared/network-types.js';
import type { Intent } from '../src/shared/types.js';

const id = (value: number) => value.toString(16).padStart(64, '0');
// Synthetic metadata fixtures: cryptographic authentication belongs to the caller, not ranking.
function peer(
  value: number,
  interests: string[] = ['Books'],
  intent: Intent = 'friendship',
): NetworkIdentity {
  return {
    id: id(value),
    registrationId: '00000000-0000-4000-8000-000000000001',
    signingKey: {},
    exchangeKey: {},
    capsule: {
      alias: `Fictional capsule ${value}`,
      purpose: 'An owner-declared intention to explore a conversation.',
      intents: [intent],
      interests,
    },
  };
}
function input(overrides: Partial<CapsuleShortlistInput> = {}): CapsuleShortlistInput {
  return {
    ownerId: id(1),
    intent: 'friendship',
    interests: ['Books'],
    peers: [],
    blockedPeerIds: [],
    limit: 10,
    ...overrides,
  };
}

test('shortlist rejects invalid owner configuration and requires an integer limit from one to ten', () => {
  for (const limit of [0, 11, 1.5, NaN, Infinity])
    assert.throws(() => shortlistCapsules(input({ limit })));
  assert.throws(() => shortlistCapsules(input({ ownerId: 'not-a-network-identity' })));
  assert.throws(() => shortlistCapsules(input({ blockedPeerIds: ['malformed-block-id'] })));
  assert.throws(() =>
    shortlistCapsules(input({ peers: Array.from({ length: 201 }, (_, index) => peer(index + 2)) })),
  );
  assert.throws(() =>
    shortlistCapsules(
      input({ blockedPeerIds: Array.from({ length: 2001 }, (_, index) => id(index + 2)) }),
    ),
  );
  assert.throws(() => shortlistCapsules(input({ interests: ['Books', ' books '] })));
  assert.throws(() => shortlistCapsules(input({ interests: ['person@example.com'] })));
  assert.throws(() =>
    shortlistCapsules(input({ interests: Array.from({ length: 13 }, (_, i) => `Topic ${i}`) })),
  );
  assert.throws(() => shortlistCapsules(input({ intent: 'employment' as Intent })));
  assert.throws(() =>
    shortlistCapsules({ ...input(), boundaries: 'Private owner notes' } as never),
  );
});

test('self, blocks, malformed capsules and ambiguous normalized identities cannot enter the shortlist', () => {
  const duplicate = peer(171);
  const malformedCopy = {
    ...duplicate,
    id: ` ${duplicate.id.toUpperCase()} `,
    capsule: { ...duplicate.capsule, interests: ['person@example.com'] },
  };
  const unsupportedFields = peer(5);
  const records = [
    peer(2),
    { ...peer(1), id: ` ${id(1)} ` },
    peer(187),
    duplicate,
    malformedCopy,
    { ...peer(4), id: 'a forged display identity' },
    { ...peer(6), registrationId: 'forged-registration-epoch' },
    {
      ...unsupportedFields,
      capsule: { ...unsupportedFields.capsule, requirements: { sameCity: false } },
    },
    peer(7, ['Books', ' books ']),
    peer(8, ['Books'], 'dating'),
    { ...peer(9), capsule: { ...peer(9).capsule, purpose: '' } },
    null,
  ] as NetworkIdentity[];
  const result = shortlistCapsules(
    input({ peers: records, blockedPeerIds: [` ${id(187).toUpperCase()} `] }),
  );
  assert.deepEqual(
    result.map((suggestion) => suggestion.peerId),
    [id(2)],
  );
  assert.deepEqual(
    shortlistCapsules(input({ peers: [...records].reverse(), blockedPeerIds: [id(187)] })),
    result,
  );
});

test('empty public labels remain low-evidence candidates and alias or purpose text creates no inferred signal', () => {
  const minimal = peer(2, [], 'collaboration');
  minimal.capsule.alias = 'Self-described verified mentor';
  minimal.capsule.purpose = 'I enjoy Books and offer mentorship for career growth.';
  const result = shortlistCapsules(
    input({
      intent: 'collaboration',
      interests: ['Career: find a mentor', 'Books'],
      peers: [minimal],
    }),
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].score, 0);
  assert.equal(result[0].career, undefined);
  assert.deepEqual(result[0].sharedInterests, []);
  assert.equal(result[0].scoreMeaning, CAPSULE_SCORE_MEANING);
  assert.match(result[0].reasons.join(' '), /private requirements have not been checked/);
  const noDeclarations = shortlistCapsules(input({ interests: [], peers: [peer(3), peer(2, [])] }));
  assert.deepEqual(
    noDeclarations.map((suggestion) => [suggestion.peerId, suggestion.score]),
    [
      [id(2), 0],
      [id(3), 0],
    ],
  );
});

test('exact reciprocal topic evidence favors focused overlap without fuzzy matching or label padding', () => {
  const focused = peer(2);
  const broad = peer(3, ['Books', 'Coffee']);
  const fuzzy = peer(4, ['Book']);
  const result = shortlistCapsules(input({ peers: [broad, fuzzy, focused] }));
  assert.deepEqual(
    result.map((suggestion) => suggestion.score),
    [100, 66.67, 0],
  );
  assert.equal(result[0].peerId, focused.id);
  assert.deepEqual(result[2].sharedInterests, []);
  const normalized = shortlistCapsules(
    input({
      interests: [' Books ', 'Urban   Gardening'],
      peers: [peer(2, ['urban gardening', 'books'])],
    }),
  );
  assert.equal(normalized[0].score, 100);
  assert.deepEqual(normalized[0].sharedInterests, ['Books', 'Urban Gardening']);
});

test('limits and ties are stable across directory/list order and reciprocal scoring survives role reversal', () => {
  const peers = Array.from({ length: 12 }, (_, index) => peer(index + 2));
  const result = shortlistCapsules(input({ peers, limit: 3 }));
  assert.deepEqual(
    result.map((suggestion) => suggestion.peerId),
    [id(2), id(3), id(4)],
  );
  assert.deepEqual(shortlistCapsules(input({ peers: [...peers].reverse(), limit: 3 })), result);
  const ownerLabels = ['Coffee', 'Urban gardening'];
  const peerLabels = ['urban GARDENING', 'Books', 'Coffee'];
  const forwardInput = input({ interests: ownerLabels, peers: [peer(2, peerLabels)] });
  const before = structuredClone(forwardInput);
  const forward = shortlistCapsules(forwardInput)[0];
  const reverse = shortlistCapsules(
    input({
      ownerId: id(2),
      interests: [...peerLabels].reverse(),
      peers: [peer(1, [...ownerLabels].reverse())],
    }),
  )[0];
  assert.equal(forward.score, reverse.score);
  assert.deepEqual(forward.sharedInterests, reverse.sharedInterests);
  assert.deepEqual(
    forwardInput,
    before,
    'Ranking must not mutate identity metadata or declarations.',
  );
});

test('only collaboration uses complementary explicit career goals and contributions stay bounded', () => {
  const ownerLabels = ['Career: find a mentor', 'Technology'];
  const mentor = peer(2, ['Career: offer mentorship', 'Technology'], 'collaboration');
  const seeker = peer(3, ownerLabels, 'collaboration');
  const ranked = shortlistCapsules(
    input({ intent: 'collaboration', interests: ownerLabels, peers: [seeker, mentor] }),
  );
  assert.equal(ranked[0].peerId, mentor.id);
  assert.equal(ranked[0].score, 100);
  assert.equal(ranked[1].score, 50);
  assert.deepEqual(ranked[0].sharedInterests, ['Technology']);
  assert.equal(ranked[0].career?.connections[0].kind, 'mentorship');
  assert.match(ranked[0].reasons.join(' '), /not a verified role or promised outcome/);
  const reversed = shortlistCapsules(
    input({
      ownerId: mentor.id,
      intent: 'collaboration',
      interests: mentor.capsule.interests,
      peers: [peer(1, ownerLabels, 'collaboration')],
    }),
  )[0];
  assert.equal(reversed.score, ranked[0].score);
  assert.equal(reversed.career?.ownerCoverage, ranked[0].career?.peerCoverage);
  const allGoals = shortlistCapsules(
    input({
      intent: 'collaboration',
      interests: [...CAREER_GOALS],
      peers: [peer(2, [...CAREER_GOALS].reverse(), 'collaboration')],
    }),
  )[0];
  assert.equal(allGoals.score, 50, 'Goal evidence cannot also contribute topical points.');
  for (const intent of ['friendship', 'dating'] as const) {
    const ordinary = shortlistCapsules(
      input({ intent, interests: ownerLabels, peers: [peer(2, mentor.capsule.interests, intent)] }),
    )[0];
    assert.equal(ordinary.career, undefined);
    assert.equal(ordinary.score, 50);
  }
  const unknown = shortlistCapsules(
    input({
      intent: 'collaboration',
      interests: ['Career: find a mentor'],
      peers: [peer(2, ['Career: verified expert'], 'collaboration')],
    }),
  )[0];
  assert.equal(unknown.score, 0);
  assert.deepEqual(unknown.career?.connections, []);
  for (const suggestion of [...ranked, allGoals, unknown])
    assert.ok(
      Number.isFinite(suggestion.score) && suggestion.score >= 0 && suggestion.score <= 100,
    );
});

test('shortlist outputs contain no alias, purpose, identity keys, private notes or consent capabilities', () => {
  const candidate = {
    ...peer(2, ['Career: investing'], 'collaboration'),
    signingKey: { d: 'PRIVATE-SIGNING-MATERIAL' },
    exchangeKey: { d: 'PRIVATE-EXCHANGE-MATERIAL' },
    attestation: { signedText: 'RAW-REGISTRATION-RECEIPT', signature: 'RAW-SIGNATURE' },
    privateNotes: 'PRIVATE-NOTES-NOT-A-SIGNAL',
  };
  candidate.capsule.alias = 'ALIAS-NOT-RETURNED';
  candidate.capsule.purpose = 'PURPOSE-NOT-RETURNED';
  const result = shortlistCapsules(
    input({ intent: 'collaboration', interests: ['Career: raise funding'], peers: [candidate] }),
  );
  const serialized = JSON.stringify(result);
  for (const hidden of [
    candidate.capsule.alias,
    candidate.capsule.purpose,
    candidate.signingKey.d,
    candidate.exchangeKey.d,
    candidate.attestation.signedText,
    candidate.attestation.signature,
    candidate.privateNotes,
  ])
    assert.equal(serialized.includes(hidden), false, hidden);
  assert.deepEqual(Object.keys(result[0]).sort(), [
    'career',
    'peerId',
    'reasons',
    'score',
    'scoreMeaning',
    'sharedInterests',
  ]);
  assert.match(result[0].reasons.join(' '), /does not verify a role/);
  assert.match(result[0].reasons.join(' '), /Both people still decide/);
});
