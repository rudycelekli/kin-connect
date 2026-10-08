import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveOwnerPreferences,
  personalizeCapsuleShortlist,
  proposeOwnerPreferences,
  type ApprovedOwnerPreferences,
} from '../src/network/personalization.js';
import { shortlistCapsules, type CapsuleShortlistInput } from '../src/network/discovery.js';
import type { NetworkIdentity } from '../src/shared/network-types.js';
import type { Intent } from '../src/shared/types.js';

const id = (value: number) => value.toString(16).padStart(64, '0');
// Synthetic unsigned fixtures; authenticating signatures remains the caller's responsibility.
function peer(value: number, interests: string[], intent: Intent = 'friendship'): NetworkIdentity {
  return {
    id: id(value),
    registrationId: '00000000-0000-4000-8000-000000000001',
    signingKey: {},
    exchangeKey: {},
    capsule: {
      alias: `Fictional capsule ${value}`,
      purpose: 'Exploring a conversation.',
      interests,
      intents: [intent],
    },
  };
}
function discovery(overrides: Partial<CapsuleShortlistInput> = {}): CapsuleShortlistInput {
  return {
    ownerId: id(1),
    intent: 'friendship',
    interests: ['Books', 'Coffee'],
    peers: [peer(2, ['Books']), peer(3, ['Coffee'])],
    blockedPeerIds: [],
    limit: 10,
    ...overrides,
  };
}
function preferences(
  preferredInterests: string[] = ['Coffee'],
  lessPreferredInterests: string[] = [],
  intent: Intent = 'friendship',
): ApprovedOwnerPreferences {
  return approveOwnerPreferences(
    proposeOwnerPreferences({ intent, preferredInterests, lessPreferredInterests }),
    true,
  );
}

test('proposals normalize only selected labels and require a separate literal approval', () => {
  const input = {
    intent: 'friendship',
    preferredInterests: ['  coffee ', 'Urban   Gardening'],
    lessPreferredInterests: ['Books'],
  };
  const before = structuredClone(input);
  const proposal = proposeOwnerPreferences(input);
  assert.deepEqual(proposal.preferredInterests, ['Coffee', 'Urban Gardening']);
  assert.equal(proposal.reviewRequired, true);
  for (const confirmation of [undefined, false, 1, 'true', { approved: true }])
    assert.throws(() => approveOwnerPreferences(proposal, confirmation));
  assert.throws(() =>
    personalizeCapsuleShortlist({ discovery: discovery(), preferences: proposal as never }),
  );
  const approved = approveOwnerPreferences(proposal, true);
  assert.equal(approved.approved, true);
  assert.equal('reviewRequired' in approved, false);
  approved.preferredInterests.push('Cycling');
  assert.deepEqual(proposal.preferredInterests, ['Coffee', 'Urban Gardening']);
  assert.deepEqual(input, before);
});

test('normalized duplicates, cross-priority overlap, contacts and oversize proposals fail closed', () => {
  for (const [preferredInterests, lessPreferredInterests] of [
    [['Books', ' books '], []],
    [['Books', 'Ｂｏｏｋｓ'], []],
    [[], ['Urban Gardening', ' urban   gardening ']],
    [['Books'], ['books']],
    [['person@example.com'], []],
    [[], ['https://example.com']],
    [['+1 202 555 0100'], []],
    [['x'.repeat(49)], []],
    [Array.from({ length: 13 }, (_, i) => `Topic ${i}`), []],
    [
      Array.from({ length: 7 }, (_, i) => `Topic ${i}`),
      Array.from({ length: 6 }, (_, i) => `Other ${i}`),
    ],
  ] as [string[], string[]][])
    assert.throws(() =>
      proposeOwnerPreferences({ intent: 'friendship', preferredInterests, lessPreferredInterests }),
    );
  const valid = proposeOwnerPreferences({
    intent: 'friendship',
    preferredInterests: Array.from({ length: 12 }, (_, i) => `Topic ${i}`),
    lessPreferredInterests: [],
  });
  assert.equal(valid.preferredInterests.length, 12);
});

test('demographics, private feedback, approvals and free-text interpretation are unsupported inputs', () => {
  const base = { intent: 'friendship', preferredInterests: ['Books'], lessPreferredInterests: [] };
  for (const key of ['gender', 'age', 'notes', 'chat', 'rating', 'approveConnection', 'approved'])
    assert.throws(() => proposeOwnerPreferences({ ...base, [key]: 'unsupported' }));
  assert.throws(() => proposeOwnerPreferences({ ...base, intent: 'employment' }));
  const proposal = proposeOwnerPreferences(base);
  assert.throws(() => approveOwnerPreferences({ ...proposal, notes: 'PRIVATE' }, true));
  const approved = preferences();
  for (const extra of [
    { approved: false },
    { ownerAge: 18 },
    { peerRating: 5 },
    { version: 'future' },
  ])
    assert.throws(() =>
      personalizeCapsuleShortlist({
        discovery: discovery(),
        preferences: { ...approved, ...extra } as never,
      }),
    );
  assert.throws(() =>
    personalizeCapsuleShortlist({
      discovery: discovery(),
      preferences: approved,
      transcript: 'PRIVATE',
    } as never),
  );
});

test('absent priorities or priorities for a different intention preserve every baseline rank and reason', () => {
  const source = discovery();
  const baseline = shortlistCapsules(source);
  for (const approved of [undefined, preferences(['Coffee'], [], 'dating')]) {
    const result = personalizeCapsuleShortlist({ discovery: source, preferences: approved });
    assert.deepEqual(
      result.map(
        ({ baselineScore, preferenceContribution, effectivePreferenceContribution, ...rest }) =>
          rest,
      ),
      baseline,
    );
    assert.deepEqual(
      result.map((row) => [
        row.baselineScore,
        row.preferenceContribution,
        row.effectivePreferenceContribution,
      ]),
      baseline.map((row) => [row.score, 0, 0]),
    );
  }
});

test('reviewed priorities re-rank selective public topics without rewriting source declarations or scores', () => {
  const source = discovery();
  const approved = preferences([' Coffee '], ['Books']);
  const before = structuredClone({ source, approved });
  const result = personalizeCapsuleShortlist({ discovery: source, preferences: approved });
  assert.deepEqual(
    result.map((row) => [row.peerId, row.baselineScore, row.preferenceContribution, row.score]),
    [
      [id(3), 66.67, 10, 76.67],
      [id(2), 66.67, -10, 56.67],
    ],
  );
  assert.deepEqual(result[0].personalization?.preferredMatches, ['Coffee']);
  assert.deepEqual(result[1].personalization?.lessPreferredMatches, ['Books']);
  assert.match(result[0].reasons.at(-1)!, /not private requirements or an outcome prediction/);
  assert.equal(result[0].personalization?.learnedModel, false);
  assert.deepEqual({ source, approved }, before);
  result[0].sharedInterests.push('Mutated result only');
  result[0].personalization!.preferredMatches.push('Mutated result only');
  assert.deepEqual({ source, approved }, before);
});

test('contributions stay bounded, report clamping and use the fraction of reviewed choices', () => {
  const source = discovery({
    interests: ['Books'],
    peers: [peer(2, ['Books']), peer(3, ['Coffee']), peer(4, [])],
  });
  const positive = personalizeCapsuleShortlist({
    discovery: source,
    preferences: preferences(['Books']),
  });
  assert.equal(positive[0].baselineScore, 100);
  assert.equal(positive[0].preferenceContribution, 10);
  assert.equal(positive[0].effectivePreferenceContribution, 0);
  assert.equal(positive[0].score, 100);
  const negative = personalizeCapsuleShortlist({
    discovery: source,
    preferences: preferences([], ['Coffee']),
  });
  const zero = negative.find((row) => row.peerId === id(3))!;
  assert.equal(zero.preferenceContribution, -10);
  assert.equal(zero.effectivePreferenceContribution, 0);
  assert.equal(zero.score, 0);
  const partial = personalizeCapsuleShortlist({
    discovery: source,
    preferences: preferences(['Coffee', 'Music']),
  });
  assert.equal(partial.find((row) => row.peerId === id(3))!.preferenceContribution, 5);
  const cancel = personalizeCapsuleShortlist({
    discovery: discovery({ peers: [peer(2, ['Books', 'Coffee'])] }),
    preferences: preferences(['Coffee'], ['Books']),
  });
  assert.equal(cancel[0].preferenceContribution, 0);
  for (const row of [...positive, ...negative, ...partial, ...cancel]) {
    assert.ok(Number.isFinite(row.score) && row.score >= 0 && row.score <= 100);
    assert.ok(Math.abs(row.preferenceContribution) <= 10);
    assert.ok(Math.abs(row.effectivePreferenceContribution) <= 10);
  }
});

test('empty choices reset contributions; equal rankings are stable across input order', () => {
  const source = discovery({ peers: [peer(3, ['Books']), peer(2, ['Books'])] });
  const approved = preferences([], []);
  const ranked = personalizeCapsuleShortlist({ discovery: source, preferences: approved });
  assert.deepEqual(
    ranked.map((row) => row.peerId),
    [id(2), id(3)],
  );
  assert.deepEqual(
    personalizeCapsuleShortlist({
      discovery: { ...source, peers: [...source.peers].reverse() },
      preferences: approved,
    }),
    ranked,
  );
  assert.ok(ranked.every((row) => row.preferenceContribution === 0));
  const reset = personalizeCapsuleShortlist({ discovery: source });
  assert.deepEqual(
    reset.map((row) => row.score),
    shortlistCapsules(source).map((row) => row.score),
  );
});

test('priority labels cannot reintroduce blocked, self, wrong-intent, forged or duplicate capsules', () => {
  const duplicate = peer(171, ['Coffee']);
  const peers = [
    peer(1, ['Coffee']),
    peer(2, ['Coffee']),
    peer(3, ['Books']),
    peer(4, ['Coffee'], 'dating'),
    duplicate,
    {
      ...duplicate,
      id: ` ${duplicate.id.toUpperCase()} `,
      capsule: { ...duplicate.capsule, interests: ['person@example.com'] },
    },
    { ...peer(5, ['Coffee']), registrationId: 'forged-epoch' },
    { ...peer(6, ['Coffee']), capsule: { ...peer(6, ['Coffee']).capsule, age: 19 } },
    null,
  ] as NetworkIdentity[];
  const source = discovery({ peers, blockedPeerIds: [id(2)] });
  const result = personalizeCapsuleShortlist({
    discovery: source,
    preferences: preferences(['Coffee']),
  });
  assert.deepEqual(
    result.map((row) => row.peerId),
    [id(3)],
  );
  assert.equal(result[0].preferenceContribution, 0);
  assert.throws(() =>
    personalizeCapsuleShortlist({
      discovery: {
        ...source,
        peers: Array.from({ length: 201 }, (_, i) => peer(i + 10, ['Coffee'])),
      },
      preferences: preferences(['Coffee']),
    }),
  );
});

test('only existing shortlist candidates are re-ranked; low-rank candidates are not silently added', () => {
  const source = discovery({
    peers: Array.from({ length: 12 }, (_, i) =>
      peer(i + 2, ['Books', ...(i === 11 ? ['Coffee'] : [])]),
    ),
    limit: 2,
  });
  const expectedIds = shortlistCapsules(source)
    .map((row) => row.peerId)
    .sort();
  const actualIds = personalizeCapsuleShortlist({
    discovery: source,
    preferences: preferences(['Coffee']),
  })
    .map((row) => row.peerId)
    .sort();
  assert.deepEqual(actualIds, expectedIds);
});

test('alias, purpose, private identity keys and notes never become priority signals or disclosures', () => {
  const candidate = peer(2, []);
  candidate.capsule.alias = 'Coffee expert';
  candidate.capsule.purpose = 'Coffee is mentioned in prose rather than selected labels.';
  candidate.signingKey = { d: 'PRIVATE-SIGNING-MATERIAL' };
  candidate.exchangeKey = { d: 'PRIVATE-EXCHANGE-MATERIAL' };
  const source = discovery({
    peers: [{ ...candidate, notes: 'PRIVATE-CHAT-NOTES' } as NetworkIdentity],
  });
  const result = personalizeCapsuleShortlist({
    discovery: source,
    preferences: preferences(['Coffee']),
  });
  assert.equal(result[0].score, 0);
  assert.equal(result[0].preferenceContribution, 0);
  const serialized = JSON.stringify(result);
  for (const hidden of [
    candidate.capsule.alias,
    candidate.capsule.purpose,
    'PRIVATE-SIGNING-MATERIAL',
    'PRIVATE-EXCHANGE-MATERIAL',
    'PRIVATE-CHAT-NOTES',
  ])
    assert.equal(serialized.includes(hidden), false);
  for (const forbidden of ['approved', 'eligibility', 'requirements', 'contact', 'canApprove'])
    assert.equal(forbidden in result[0], false);
});
