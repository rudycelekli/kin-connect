import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessOpportunity,
  demoProfile,
  discoverWithCandidates,
  LocalPolicyAgent,
  negotiate,
  refreshSuggestion,
  runNegotiation,
  transitionMatch,
} from '../src/matchmaking/index.js';
import type { Intent, OwnerProfile } from '../src/shared/types.js';

const intents: Intent[] = ['friendship', 'dating', 'collaboration'];
function pair(): [OwnerProfile, OwnerProfile] {
  const first: OwnerProfile = {
    ...demoProfile(),
    interests: ['Books', 'Coffee'],
    values: ['Curiosity', 'Kindness'],
    requirements: {
      minAge: 18,
      maxAge: 80,
      sameCity: true,
      nonsmoker: false,
      datingGenders: ['woman', 'man', 'nonbinary', 'self-described'],
    },
  };
  return [first, { ...structuredClone(first), id: 'synthetic-peer', name: 'Fictional peer' }];
}
function score(first: OwnerProfile, second: OwnerProfile, intent: Intent) {
  const result = assessOpportunity(first, second, intent);
  assert.ok(result.eligible);
  return result;
}

test('reciprocal opportunity ranking favors focused common ground over broad label lists', () => {
  for (const intent of intents) {
    const [owner, peer] = pair();
    const focused = { ...peer, interests: ['Books'] };
    const broad = {
      ...peer,
      interests: [
        'Books',
        'Coffee',
        ...Array.from({ length: 10 }, (_, i) => `Unrelated topic ${i}`),
      ],
    };
    assert.ok(score(owner, focused, intent).score > score(owner, broad, intent).score);
    const padded = { ...focused, interests: ['Books', 'Unrelated topic'] };
    assert.ok(score(owner, padded, intent).score < score(owner, focused, intent).score);
  }
});

test('goal-specific ranking is explained with bounded contributions and reciprocal views', () => {
  const [owner, peer] = pair();
  const interests = { ...peer, values: ['Honesty'] };
  const values = { ...peer, interests: ['Board games'] };
  assert.ok(score(owner, interests, 'friendship').score > score(owner, values, 'friendship').score);
  assert.ok(score(owner, values, 'dating').score > score(owner, interests, 'dating').score);
  assert.ok(
    score(owner, interests, 'collaboration').score > score(owner, values, 'collaboration').score,
  );
  for (const intent of intents) {
    const ranking = score(owner, interests, intent);
    assert.equal(
      ranking.signals.reduce((sum, signal) => sum + signal.weight, 0),
      100,
    );
    assert.ok(
      Math.abs(ranking.score - ranking.signals.reduce((sum, s) => sum + s.contribution, 0)) < 0.01,
    );
    assert.match(ranking.scoreMeaning, /not-outcome-probability/);
    for (const signal of ranking.signals) {
      assert.ok(signal.ownerCoverage >= 0 && signal.ownerCoverage <= 1);
      assert.ok(signal.peerCoverage >= 0 && signal.peerCoverage <= 1);
    }
  }
});

test('scores and plans are invariant to role reversal and preference-list ordering', () => {
  const [owner, peer] = pair();
  peer.interests = ['Coffee', 'Film', 'Books'];
  peer.values = ['Kindness', 'Curiosity', 'Honesty'];
  peer.availability.reverse();
  for (const intent of intents) {
    const a = score(owner, peer, intent);
    const b = score(peer, owner, intent);
    assert.equal(a.score, b.score);
    assert.equal(a.ownerScore, b.peerScore);
    const shuffled = structuredClone(owner);
    shuffled.interests.reverse();
    shuffled.values.reverse();
    shuffled.availability.reverse();
    assert.equal(score(shuffled, peer, intent).score, a.score);
    assert.deepEqual(negotiate(owner, peer, intent)?.plan, negotiate(peer, shuffled, intent)?.plan);
  }
});

test('eligibility failure has no preference score; sparse common ground remains an option', () => {
  const [owner, peer] = pair();
  for (const rejected of [
    { ...peer, age: 17 },
    { ...peer, paused: true },
    { ...peer, availability: ['weekday-days'] },
    { ...peer, requirements: { ...peer.requirements, minAge: 40 } },
  ]) {
    const result = assessOpportunity(owner, rejected as OwnerProfile, 'friendship');
    assert.equal(result.eligible, false);
    assert.equal('score' in result, false);
  }
  const sparse = { ...peer, interests: ['Running'], values: ['Honesty'] };
  assert.ok(score(owner, sparse, 'friendship').eligible);
  assert.ok(negotiate(owner, sparse, 'friendship'));
});

test('preference scoring excludes identity, demographics and private advisory text', () => {
  const [owner, peer] = pair();
  const original = score(owner, peer, 'friendship');
  const altered = {
    ...peer,
    id: 'another-identity',
    name: 'Another alias',
    age: 50,
    gender: 'woman' as const,
    bio: 'A different public bio.',
    agentName: 'Another agent',
    boundaries: 'PRIVATE-NOTE-NOT-A-SIGNAL',
    smoking: true,
  };
  const next = score(owner, altered, 'friendship');
  assert.deepEqual(next, original);
  assert.equal(JSON.stringify(next).includes(altered.boundaries), false);
  assert.equal(JSON.stringify(next).includes(altered.name), false);
});

test('conflicting duplicate candidate identities fail closed and do not duplicate proposals', () => {
  const [owner, peer] = pair();
  const other = { ...peer, id: 'different-peer' };
  const result = discoverWithCandidates(owner, 'friendship', [peer, { ...peer, age: 50 }, other]);
  assert.equal(result.considered, 3);
  assert.equal(result.excluded, 2);
  assert.deepEqual(
    result.matches.map((match) => match.person.id),
    ['different-peer'],
  );
  const normalized = discoverWithCandidates(owner, 'friendship', [
    peer,
    { ...peer, id: ` ${peer.id} ` },
    { ...owner, id: ` ${owner.id} ` },
    other,
  ]);
  assert.equal(normalized.considered, 3);
  assert.equal(normalized.excluded, 2);
  assert.deepEqual(
    normalized.matches.map((match) => match.person.id),
    ['different-peer'],
  );
});

test('agents reject omitted common ground and remember a rejected conversation', () => {
  for (const field of ['sharedInterests', 'sharedValues'] as const) {
    const [owner, peer] = pair();
    const first = new LocalPolicyAgent(owner),
      second = new LocalPolicyAgent(peer);
    const offer = first.createOffer(second.id, 'friendship');
    const response = second.receiveOffer(offer);
    if (response.type !== 'policy-response') assert.fail();
    const proposal = first.receivePolicyResponse(response);
    if (proposal.type !== 'window-proposal') assert.fail();
    assert.equal(second.receiveWindowProposal({ ...proposal, [field]: [] }).type, 'rejected');
    assert.throws(() => second.receiveOffer(offer), /replayed/);
  }
});

test('offer replay cannot overwrite an active stage; malformed offer IDs leave no state', () => {
  const [owner, peer] = pair();
  const first = new LocalPolicyAgent(owner),
    second = new LocalPolicyAgent(peer);
  const offer = first.createOffer(second.id, 'friendship');
  const response = second.receiveOffer(offer);
  if (response.type !== 'policy-response') assert.fail();
  const proposal = first.receivePolicyResponse(response);
  assert.throws(() => first.createOffer(second.id, 'friendship', offer.conversationId), /replayed/);
  assert.throws(
    () => first.createOffer(second.id, 'friendship', ` ${offer.conversationId} `),
    /replayed/,
  );
  assert.equal(second.receiveWindowProposal(proposal).type, 'window-response');
  const fresh = new LocalPolicyAgent(owner);
  assert.throws(() => fresh.createOffer(` ${owner.id} `, 'friendship'), /themselves/);
  assert.throws(() => fresh.createOffer('x'.repeat(101), 'friendship', 'test-valid-conversation'));
  assert.doesNotThrow(() => fresh.createOffer(second.id, 'friendship', 'test-valid-conversation'));
});

test('different-city plans require mutual willingness and independent plan validation', () => {
  const [owner, peer] = pair();
  peer.city = 'Boston';
  assert.equal(negotiate(owner, peer, 'collaboration'), null);
  owner.requirements.sameCity = false;
  assert.equal(negotiate(owner, peer, 'collaboration'), null);
  peer.requirements.sameCity = false;
  const match = negotiate(owner, peer, 'collaboration');
  assert.ok(match);
  assert.match(match.plan.detail, /online conversation/);
  assert.equal(match.ownerApproved || match.peerApproved, false);
  assert.equal(runNegotiation(owner, peer, 'collaboration').accepted, true);
  const first = new LocalPolicyAgent(owner),
    second = new LocalPolicyAgent(peer);
  const response = second.receiveOffer(first.createOffer(second.id, 'collaboration'));
  if (response.type !== 'policy-response') assert.fail();
  const window = first.receivePolicyResponse(response);
  if (window.type !== 'window-proposal') assert.fail();
  const confirmation = second.receiveWindowProposal(window);
  if (confirmation.type !== 'window-response') assert.fail();
  const plan = first.receiveWindowResponse(confirmation);
  assert.equal(
    second.receiveMeetingProposal({
      ...plan,
      plan: { ...plan.plan, detail: 'Travel to a café now.' },
    }).type,
    'rejected',
  );
});

test('engine refresh replaces unreviewed suggestions without changing existing decisions', () => {
  const [owner, peer] = pair();
  const latest = negotiate(owner, peer, 'friendship')!;
  const legacy = { ...latest, score: 52, ranking: undefined };
  assert.equal(refreshSuggestion(legacy, latest), latest);
  for (const previous of [
    transitionMatch(legacy, 'approve'),
    transitionMatch(transitionMatch(legacy, 'approve'), 'peer-approve'),
    transitionMatch(legacy, 'decline'),
    transitionMatch(legacy, 'block'),
  ])
    assert.equal(refreshSuggestion(previous, latest), previous);
  assert.throws(
    () =>
      refreshSuggestion(legacy, { ...latest, person: { ...latest.person, id: 'wrong-person' } }),
    /different introductions/,
  );
});
