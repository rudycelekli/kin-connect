import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  demoProfile,
  LocalPolicyAgent,
  protocolMessageSchema,
  toPolicyCard,
  type ProtocolMessage,
} from '../src/matchmaking/index.js';
import { createIntroductionBrief } from '../src/matchmaking/domain/services/introduction.js';
import type { Intent, OwnerProfile } from '../src/shared/types.js';

const careerPairs = [
  ['Career: peer learning', 'Career: peer learning', 'Learn one small thing together'],
  ['Career: find a mentor', 'Career: offer mentorship', 'Explore a mentoring conversation'],
  ['Career: explore jobs', 'Career: hiring', 'Explore a possible work conversation'],
  ['Career: find a cofounder', 'Career: find a cofounder', 'Try a small working session'],
  ['Career: raise funding', 'Career: investing', 'Explore a funding question'],
] as const;

function profiles(ownerInterests: string[], peerInterests: string[]): [OwnerProfile, OwnerProfile] {
  const owner: OwnerProfile = {
    ...demoProfile(),
    id: 'brief-owner',
    name: 'PRIVATE_OWNER_NAME',
    agentName: 'Owner public agent',
    bio: 'PRIVATE_OWNER_BIO',
    interests: ownerInterests,
    values: ['Curiosity'],
    availability: ['weekends', 'weekday-evenings'],
    requirements: {
      minAge: 18,
      maxAge: 80,
      sameCity: false,
      nonsmoker: false,
      datingGenders: ['woman', 'man', 'nonbinary', 'self-described'],
    },
    boundaries: 'PRIVATE_OWNER_NOTES owner@example.com',
  };
  return [
    owner,
    {
      ...structuredClone(owner),
      id: 'brief-peer',
      name: 'PRIVATE_PEER_NAME',
      agentName: 'Peer public agent',
      bio: 'PRIVATE_PEER_BIO',
      boundaries: 'PRIVATE_PEER_NOTES peer@example.com',
      interests: peerInterests,
      values: ['Kindness'],
    },
  ];
}

function proposalFor(owner: OwnerProfile, peer: OwnerProfile, intent: Intent = 'collaboration') {
  const first = new LocalPolicyAgent(owner);
  const second = new LocalPolicyAgent(peer);
  const wire = <T extends ProtocolMessage>(message: T): T =>
    protocolMessageSchema.parse(JSON.parse(JSON.stringify(message))) as T;
  const offer = wire(first.createOffer(second.id, intent));
  const response = wire(second.receiveOffer(offer));
  if (response.type !== 'policy-response') assert.fail('Expected independent policy acceptance.');
  const window = wire(first.receivePolicyResponse(response));
  if (window.type !== 'window-proposal') assert.fail('Expected a shared window.');
  const confirmation = wire(second.receiveWindowProposal(window));
  if (confirmation.type !== 'window-response') assert.fail('Expected verified common facts.');
  const proposal = wire(first.receiveWindowResponse(confirmation));
  return { first, second, offer, response, window, confirmation, proposal, wire };
}

test('each career brief uses the actual negotiated plan with zero hobbies, both cities and reversed roles', () => {
  for (const [ownerGoal, peerGoal, title] of careerPairs) {
    for (const differentCities of [false, true]) {
      const [owner, peer] = profiles([ownerGoal], [peerGoal]);
      if (differentCities) peer.city = 'Boston';
      const forward = proposalFor(owner, peer);
      const initiator = forward.first.readIntroductionBrief(forward.offer.conversationId);
      const ready = forward.second.receiveMeetingProposal(forward.wire(forward.proposal));
      assert.equal(ready.type, 'suggestion-ready');
      const recipient = forward.second.readIntroductionBrief(forward.offer.conversationId);
      for (const brief of [initiator, recipient]) {
        assert.deepEqual(brief.idea, {
          title: forward.proposal.plan.title,
          detail: forward.proposal.plan.detail,
        });
        assert.equal(brief.idea.title, title);
        assert.match(brief.idea.detail, differentCities ? /online conversation/ : /public café/);
        assert.match(brief.idea.detail, /both approve/);
        assert.equal(brief.questions.length, 2);
        assert.match(brief.boundary, /self-selected, not verified roles or credentials/);
        assert.equal(
          brief.why.some((line) => /found shared interests/.test(line)),
          false,
        );
        assert.doesNotMatch(
          JSON.stringify(brief),
          /Sketch a tiny prototype together|Two ideas\. One small experiment/,
        );
      }
      assert.ok(initiator.why[0].includes(`You selected “${ownerGoal}”`));
      assert.ok(recipient.why[0].includes(`You selected “${peerGoal}”`));
      assert.match(initiator.headline, /Peer public agent/);
      assert.match(recipient.headline, /Owner public agent/);
      if (ownerGoal !== peerGoal) assert.notDeepEqual(initiator.questions, recipient.questions);
      if (differentCities) assert.ok(initiator.why.some((line) => /cities differ/.test(line)));

      const reverse = proposalFor(peer, owner);
      assert.equal(
        reverse.second.receiveMeetingProposal(reverse.wire(reverse.proposal)).type,
        'suggestion-ready',
      );
      assert.deepEqual(reverse.proposal.plan, forward.proposal.plan);
      assert.deepEqual(
        reverse.first.readIntroductionBrief(reverse.offer.conversationId).idea,
        initiator.idea,
      );
    }
  }
});

test('context verifies the complete common ground and shared window instead of accepting claimed fragments', () => {
  const [owner, peer] = profiles(['Books', 'Coffee'], ['Coffee', 'Books']);
  owner.values = peer.values = ['Curiosity', 'Kindness'];
  const pair = proposalFor(owner, peer, 'friendship');
  const facts = {
    intent: 'friendship' as const,
    sharedInterests: pair.window.sharedInterests,
    sharedValues: pair.window.sharedValues,
    slot: pair.window.slot,
    context: { owner: pair.offer.card, peer: pair.response.card, plan: pair.proposal.plan },
  };
  const truthful = createIntroductionBrief(facts);
  assert.deepEqual(truthful.idea, {
    title: pair.proposal.plan.title,
    detail: pair.proposal.plan.detail,
  });
  assert.deepEqual(
    createIntroductionBrief({
      ...facts,
      sharedInterests: ['coffee', 'books'],
      sharedValues: [...facts.sharedValues].reverse(),
    }),
    truthful,
  );
  for (const forged of [
    { ...facts, sharedInterests: [] },
    { ...facts, sharedInterests: ['Books'] },
    { ...facts, sharedInterests: ['Books', 'Coffee', 'Technology'] },
    { ...facts, sharedValues: [] },
    { ...facts, sharedValues: ['Curiosity'] },
    { ...facts, sharedValues: ['Honesty'] },
  ])
    assert.throws(() => createIntroductionBrief(forged), /complete declared common ground/);
  assert.throws(
    () => createIntroductionBrief({ ...facts, slot: 'weekday-days' }),
    /available to both owners/,
  );
  assert.throws(
    () => createIntroductionBrief({ ...facts, peerAlias: 'Fabricated peer' }),
    /alias must match/,
  );
  assert.throws(
    () =>
      createIntroductionBrief({
        ...facts,
        context: { ...facts.context, peer: { ...facts.context.peer, intents: ['collaboration'] } },
      }),
    /declared intention/,
  );
  assert.throws(
    () =>
      createIntroductionBrief({
        ...facts,
        context: { ...facts.context, peer: { ...facts.context.peer, id: facts.context.owner.id } },
      }),
    /two owners/,
  );
});

test('optional plan must exactly match canonical negotiated content and cannot add promises or travel', () => {
  const [owner, peer] = profiles(['Career: explore jobs'], ['Career: hiring']);
  peer.city = 'Boston';
  const pair = proposalFor(owner, peer);
  const facts = {
    intent: 'collaboration' as const,
    sharedInterests: pair.window.sharedInterests,
    sharedValues: pair.window.sharedValues,
    slot: pair.window.slot,
    context: { owner: pair.offer.card, peer: pair.response.card },
  };
  const canonical = createIntroductionBrief(facts);
  assert.deepEqual(
    createIntroductionBrief({ ...facts, context: { ...facts.context, plan: pair.proposal.plan } }),
    canonical,
  );
  for (const plan of [
    { ...pair.proposal.plan, title: 'A guaranteed job offer' },
    { ...pair.proposal.plan, detail: 'Travel to their office; your interview is confirmed.' },
    { ...pair.proposal.plan, availability: 'weekends' as const },
    { ...pair.proposal.plan, detail: `${pair.proposal.plan.detail} ` },
  ])
    assert.throws(
      () => createIntroductionBrief({ ...facts, context: { ...facts.context, plan } }),
      /canonical negotiated proposal/,
    );
  assert.match(canonical.idea.detail, /online conversation/);
  assert.doesNotMatch(canonical.idea.detail, /guaranteed|interview is confirmed/);
});

test('agent briefing is read-only and unavailable in unknown, policy, window and terminal stages', () => {
  const [owner, peer] = profiles(['Career: find a mentor'], ['Career: offer mentorship']);
  const first = new LocalPolicyAgent(owner),
    second = new LocalPolicyAgent(peer);
  assert.throws(() => first.readIntroductionBrief('unknown'), /active agreed proposal/);
  const offer = first.createOffer(second.id, 'collaboration');
  assert.throws(() => first.readIntroductionBrief(offer.conversationId), /active agreed proposal/);
  const response = second.receiveOffer(offer);
  if (response.type !== 'policy-response') assert.fail();
  assert.throws(() => second.readIntroductionBrief(offer.conversationId), /active agreed proposal/);
  const window = first.receivePolicyResponse(response);
  if (window.type !== 'window-proposal') assert.fail();
  assert.throws(() => first.readIntroductionBrief(offer.conversationId), /active agreed proposal/);
  const confirmation = second.receiveWindowProposal(window);
  if (confirmation.type !== 'window-response') assert.fail();
  assert.throws(() => second.readIntroductionBrief(offer.conversationId), /active agreed proposal/);
  const proposal = first.receiveWindowResponse(confirmation);
  const initial = first.readIntroductionBrief(offer.conversationId);
  initial.idea.title = 'Caller mutation';
  assert.equal(first.readIntroductionBrief(offer.conversationId).idea.title, proposal.plan.title);
  const rejected = second.receiveMeetingProposal({
    ...proposal,
    plan: { ...proposal.plan, detail: 'A forged commitment' },
  });
  assert.equal(rejected.type, 'rejected');
  assert.throws(() => second.readIntroductionBrief(offer.conversationId), /active agreed proposal/);
  assert.throws(() => second.receiveMeetingProposal(proposal), /stage/);

  const noConsent = proposalFor(owner, peer);
  noConsent.first.readIntroductionBrief(noConsent.offer.conversationId);
  const ready = noConsent.second.receiveMeetingProposal(noConsent.proposal);
  assert.equal(ready.type, 'suggestion-ready');
  if (ready.type === 'suggestion-ready') {
    assert.equal(ready.humanApprovalRequired, true);
    assert.equal(ready.contactShared, false);
  }
});

test('brief contexts reject private fields and contacts and never return raw cards, names or policies', () => {
  const [owner, peer] = profiles(['Career: raise funding'], ['Career: investing']);
  const beforeOwner = structuredClone(owner),
    beforePeer = structuredClone(peer);
  const pair = proposalFor(owner, peer);
  assert.equal(pair.second.receiveMeetingProposal(pair.proposal).type, 'suggestion-ready');
  const brief = pair.first.readIntroductionBrief(pair.offer.conversationId);
  for (const privateText of [
    owner.name,
    peer.name,
    owner.bio,
    peer.bio,
    owner.boundaries,
    peer.boundaries,
    owner.id,
    peer.id,
    'requirements',
    'smoking',
    'gender',
  ])
    assert.equal(JSON.stringify(brief).includes(privateText), false, privateText);
  assert.deepEqual(
    Object.keys(brief).sort(),
    ['headline', 'why', 'idea', 'questions', 'boundary', 'principleIds'].sort(),
  );
  assert.deepEqual(owner, beforeOwner);
  assert.deepEqual(peer, beforePeer);
  const facts = {
    intent: 'collaboration' as const,
    sharedInterests: pair.window.sharedInterests,
    sharedValues: pair.window.sharedValues,
    slot: pair.window.slot,
    context: { owner: toPolicyCard(owner), peer: toPolicyCard(peer) },
  };
  for (const card of [
    { ...facts.context.peer, boundaries: 'Private notes' },
    { ...facts.context.peer, requirements: peer.requirements },
    { ...facts.context.peer, bio: 'Private biography' },
    { ...facts.context.peer, verifiedInvestor: true },
    { ...facts.context.peer, agentName: 'peer@example.com' },
    { ...facts.context.peer, name: 'https://example.com' },
    { ...facts.context.peer, city: '+1 (212) 555-0199' },
    { ...facts.context.peer, interests: ['peer@example.com'] },
    { ...facts.context.peer, age: 17 },
  ])
    assert.throws(() =>
      createIntroductionBrief({ ...facts, context: { ...facts.context, peer: card } }),
    );
  assert.throws(() =>
    createIntroductionBrief({ ...facts, context: { ...facts.context, rawProfile: peer } } as never),
  );
  assert.throws(() =>
    createIntroductionBrief({
      ...facts,
      context: { ...facts.context, plan: { ...pair.proposal.plan, ownerApproved: true } },
    } as never),
  );
  assert.throws(() =>
    createIntroductionBrief({
      ...facts,
      context: {
        ...facts.context,
        plan: { ...pair.proposal.plan, detail: 'Call +1 (212) 555-0199' },
      },
    }),
  );
});

test('same-sided career labels do not fabricate a career connection or generic hobby evidence', () => {
  const [owner, peer] = profiles(['Career: find a mentor'], ['Career: find a mentor']);
  const pair = proposalFor(owner, peer);
  const brief = pair.first.readIntroductionBrief(pair.offer.conversationId);
  assert.deepEqual(brief.idea, {
    title: pair.proposal.plan.title,
    detail: pair.proposal.plan.detail,
  });
  assert.equal(
    brief.why.some((line) => /declared goals support|found shared interests/.test(line)),
    false,
  );
  assert.doesNotMatch(brief.why.join(' '), /expertise|verified mentor|Career: find a mentor/);
});
