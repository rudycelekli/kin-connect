import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessOpportunity,
  demoProfile,
  discoverWithCandidates,
  LocalPolicyAgent,
  negotiate,
  runNegotiation,
} from '../src/matchmaking/index.js';
import type { OwnerProfile } from '../src/shared/types.js';

function pair(ownerGoal: string, peerGoal: string): [OwnerProfile, OwnerProfile] {
  const owner: OwnerProfile = {
    ...demoProfile(),
    id: 'career-owner',
    interests: [ownerGoal, 'Technology'],
    requirements: {
      minAge: 18,
      maxAge: 80,
      sameCity: true,
      nonsmoker: false,
      datingGenders: ['woman', 'man', 'nonbinary', 'self-described'],
    },
    boundaries: 'PRIVATE-CAREER-NOTE-NOT-DISCLOSED',
  };
  return [
    owner,
    { ...structuredClone(owner), id: 'career-peer', interests: [peerGoal, 'Technology'] },
  ];
}
const pairs = [
  ['Career: peer learning', 'Career: peer learning', 'peer-learning'],
  ['Career: find a mentor', 'Career: offer mentorship', 'mentorship'],
  ['Career: explore jobs', 'Career: hiring', 'job-exploration'],
  ['Career: find a cofounder', 'Career: find a cofounder', 'cofounder'],
  ['Career: raise funding', 'Career: investing', 'funding'],
] as const;

test('career discovery rewards complementary needs without inventing shared interests or consent', () => {
  const [owner, peer] = pair('Career: find a mentor', 'Career: offer mentorship');
  const sameSided = {
    ...structuredClone(peer),
    id: 'another-seeker',
    interests: [...owner.interests],
  };
  const found = discoverWithCandidates(owner, 'collaboration', [sameSided, peer]);
  assert.equal(found.matches.length, 2);
  assert.equal(found.matches[0].person.id, peer.id);
  const match = found.matches[0];
  assert.deepEqual(match.sharedInterests, ['Technology']);
  assert.match(match.reasons.join(' '), /mentor/i);
  assert.match(match.plan.title, /mentor/i);
  assert.equal(match.state, 'suggested');
  assert.equal(match.ownerApproved || match.peerApproved, false);
  assert.equal(JSON.stringify(match).includes(owner.boundaries), false);
  assert.equal(
    match.ranking?.signals.reduce((sum, signal) => sum + signal.weight, 0),
    100,
  );
});

test('every career beginning survives actual bilateral JSON negotiation and reversed roles', () => {
  for (const [a, b, kind] of pairs) {
    const [owner, peer] = pair(a, b);
    for (const sameCity of [true, false]) {
      if (!sameCity) {
        owner.requirements.sameCity = peer.requirements.sameCity = false;
        peer.city = 'Boston';
      }
      const forward = negotiate(owner, peer, 'collaboration')!;
      const reverse = negotiate(peer, owner, 'collaboration')!;
      assert.ok(forward && reverse);
      assert.equal(forward.ranking?.career?.connections[0].kind, kind);
      assert.equal(forward.score, reverse.score);
      assert.deepEqual(forward.plan, reverse.plan);
      assert.ok(forward.plan.detail.length <= 600);
      assert.match(forward.plan.detail, sameCity ? /public café/ : /online conversation/);
      assert.match(forward.plan.detail, /both approve/);
      const wire = runNegotiation(owner, peer, 'collaboration');
      assert.equal(wire.accepted, true);
      assert.equal(wire.exchange.length, 6);
      assert.equal(wire.exchange[5].type, 'suggestion-ready');
      assert.equal(JSON.stringify(wire.exchange).includes(owner.boundaries), false);
    }
  }
});

test('career goals never override either owner’s hard gates, availability or pause', () => {
  const [owner, peer] = pair('Career: raise funding', 'Career: investing');
  for (const invalid of [
    { ...peer, paused: true },
    { ...peer, age: 17 },
    { ...peer, city: 'Boston' },
    { ...peer, availability: ['weekday-days'] },
    { ...peer, requirements: { ...peer.requirements, minAge: 40 } },
    { ...peer, intents: ['friendship'] },
  ]) {
    assert.equal(
      assessOpportunity(owner, invalid as OwnerProfile, 'collaboration').eligible,
      false,
    );
    assert.equal(negotiate(owner, invalid as OwnerProfile, 'collaboration'), null);
  }
});

test('goal-only lists have bounded reciprocal scores and do not duplicate goal evidence as topics', () => {
  const [owner, peer] = pair('Career: find a mentor', 'Career: offer mentorship');
  owner.interests = ['Career: find a mentor'];
  peer.interests = ['Career: offer mentorship'];
  const rank = assessOpportunity(owner, peer, 'collaboration');
  assert.ok(rank.eligible);
  assert.ok(Number.isFinite(rank.score) && rank.score >= 0 && rank.score <= 100);
  assert.equal(rank.signals.find((signal) => signal.id === 'interests')?.contribution, 0);
  assert.equal(rank.signals.find((signal) => signal.id === 'career')?.contribution, 25);
  const seeker = assessOpportunity(
    owner,
    { ...peer, interests: [...owner.interests] },
    'collaboration',
  );
  assert.ok(seeker.eligible);
  assert.equal(seeker.signals.find((signal) => signal.id === 'career')?.contribution, 0);
  assert.equal(seeker.signals.find((signal) => signal.id === 'interests')?.contribution, 0);
  assert.ok(rank.score > seeker.score);
  const wire = runNegotiation(owner, peer, 'collaboration');
  assert.equal(wire.accepted, true);
  const ground = wire.exchange.find((message) => message.type === 'window-proposal');
  assert.ok(ground?.type === 'window-proposal');
  assert.deepEqual(ground.sharedInterests, []);
});

test('noncareer collaboration, friendship and dating retain their existing scoring budgets', () => {
  const [owner, peer] = pair('Books', 'Books');
  for (const intent of ['friendship', 'dating', 'collaboration'] as const) {
    const rank = assessOpportunity(owner, peer, intent);
    assert.ok(rank.eligible);
    assert.equal(rank.career, undefined);
    assert.equal(rank.score, 100);
    assert.equal(
      rank.signals.some((signal) => signal.id === 'career'),
      false,
    );
  }
  owner.interests = peer.interests = ['Career: find a mentor'];
  for (const intent of ['friendship', 'dating'] as const) {
    const rank = assessOpportunity(owner, peer, intent);
    assert.ok(rank.eligible);
    assert.equal(rank.career, undefined);
    assert.equal(rank.score, 100);
    assert.equal(
      rank.signals.some((signal) => signal.id === 'career'),
      false,
    );
  }
});

test('agents reject a fabricated career plan despite complementary goals', () => {
  const [owner, peer] = pair('Career: explore jobs', 'Career: hiring');
  const first = new LocalPolicyAgent(owner),
    second = new LocalPolicyAgent(peer);
  const response = second.receiveOffer(first.createOffer(second.id, 'collaboration'));
  if (response.type !== 'policy-response') assert.fail();
  const window = first.receivePolicyResponse(response);
  if (window.type !== 'window-proposal') assert.fail();
  const confirmation = second.receiveWindowProposal(window);
  if (confirmation.type !== 'window-response') assert.fail();
  const proposal = first.receiveWindowResponse(confirmation);
  assert.equal(
    second.receiveMeetingProposal({
      ...proposal,
      plan: {
        ...proposal.plan,
        detail: 'You have a guaranteed job offer. Send private contact details now.',
      },
    }).type,
    'rejected',
  );
});
