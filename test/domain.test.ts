import test from 'node:test';
import assert from 'node:assert/strict';
import {
  demoProfile,
  discover,
  discoverWithCandidates,
  evaluateEligibility,
  FIXTURES,
  LocalPolicyAgent,
  negotiate,
  PROTOCOL_VERSION,
  protocolMessageSchema,
  runNegotiation,
  toPublicPerson,
  transitionMatch,
  validateProfile,
} from '../src/matchmaking/index.js';
import type { OwnerProfile } from '../src/shared/types.js';

const owner = () => demoProfile();
const peer = (): OwnerProfile =>
  structuredClone(FIXTURES.find((profile) => profile.id === 'maya')!);

test('all demo people are explicitly fictional, valid adults', () => {
  assert.ok(FIXTURES.length >= 9);
  assert.equal(new Set(FIXTURES.map((profile) => profile.id)).size, FIXTURES.length);
  for (const profile of FIXTURES) assert.deepEqual(validateProfile(profile), profile);
  assert.deepEqual(validateProfile(owner()), owner());
});

test('hard age requirements win even with every preference aligned', () => {
  const first = owner();
  const second = peer();
  second.age = first.requirements.minAge - 1;
  second.interests = [...first.interests];
  second.values = [...first.values];
  second.energy = first.energy;
  assert.deepEqual(evaluateEligibility(first, second, 'friendship'), {
    accepted: false,
    reason: 'age-range',
  });
  second.age = first.requirements.maxAge + 1;
  assert.equal(evaluateEligibility(first, second, 'friendship').accepted, false);
});

test('peer age policy is independently enforced in both directions', () => {
  const first = owner();
  const second = peer();
  second.requirements.minAge = first.age + 1;
  assert.deepEqual(evaluateEligibility(first, second, 'friendship'), {
    accepted: false,
    reason: 'age-range',
  });
  second.requirements.minAge = 18;
  second.requirements.maxAge = first.age - 1;
  assert.equal(evaluateEligibility(first, second, 'friendship').accepted, false);
});

test('same-city and non-smoking requirements are bilateral', () => {
  const first = owner();
  const second = peer();
  first.requirements.sameCity = false;
  second.city = 'Boston';
  assert.deepEqual(evaluateEligibility(first, second, 'friendship'), {
    accepted: false,
    reason: 'city',
  });
  second.city = 'New York';
  first.requirements.nonsmoker = false;
  first.smoking = true;
  assert.deepEqual(evaluateEligibility(first, second, 'friendship'), {
    accepted: false,
    reason: 'smoking',
  });
  first.smoking = false;
  first.requirements.nonsmoker = true;
  second.requirements.nonsmoker = false;
  second.smoking = true;
  assert.equal(evaluateEligibility(first, second, 'friendship').accepted, false);
});

test('city comparison normalizes whitespace, case, and compatible unicode', () => {
  const first = owner();
  const second = peer();
  second.city = '  NEW   YORK  ';
  assert.equal(evaluateEligibility(first, second, 'friendship').accepted, true);
});

test('intent must be selected by both owners', () => {
  const first = owner();
  const second = peer();
  second.intents = ['friendship'];
  assert.deepEqual(evaluateEligibility(first, second, 'dating'), {
    accepted: false,
    reason: 'intent',
  });
  second.intents = ['dating'];
  first.intents = ['friendship'];
  assert.equal(evaluateEligibility(first, second, 'dating').accepted, false);
});

test('dating gender preferences apply bilaterally only to dating', () => {
  const first = owner();
  const second = peer();
  second.gender = 'man';
  assert.deepEqual(evaluateEligibility(first, second, 'dating'), {
    accepted: false,
    reason: 'dating-gender',
  });
  assert.equal(evaluateEligibility(first, second, 'friendship').accepted, true);
  second.gender = 'woman';
  second.requirements.datingGenders = ['man'];
  assert.equal(evaluateEligibility(first, second, 'dating').accepted, false);
  assert.equal(evaluateEligibility(first, second, 'collaboration').accepted, true);
});

test('pause and absent shared availability prevent proposals', () => {
  const first = owner();
  const second = peer();
  second.paused = true;
  assert.deepEqual(evaluateEligibility(first, second, 'friendship'), {
    accepted: false,
    reason: 'paused',
  });
  second.paused = false;
  second.availability = ['weekday-days'];
  assert.deepEqual(evaluateEligibility(first, second, 'friendship'), {
    accepted: false,
    reason: 'availability',
  });
  first.paused = true;
  assert.equal(discover(first, 'friendship').matches.length, 0);
});

test('discovery returns reproducible scored suggestions and meaningful six-message simulations', () => {
  const first = owner();
  first.boundaries = 'SECRET-PRIVATE-OWNER-NOTE-DO-NOT-DISCLOSE';
  const result = discover(first, 'friendship');
  assert.deepEqual(result, discover(first, 'friendship'));
  assert.equal(result.considered, FIXTURES.length);
  assert.equal(result.excluded + result.matches.length, result.considered);
  assert.ok(result.matches.length >= 5);
  for (const [index, match] of result.matches.entries()) {
    assert.ok(match.score >= 0 && match.score <= 100);
    if (index) assert.ok(result.matches[index - 1].score >= match.score);
    assert.equal(match.messages.length, 6);
    assert.deepEqual(
      match.messages.map((message) => message.kind),
      ['discover', 'requirements', 'interests', 'availability', 'proposal', 'decision'],
    );
    assert.match(match.messages[0].text, /simulation/i);
    assert.match(match.messages[1].text, /independently checked/i);
    assert.ok(match.commonAvailability.includes(match.plan.availability));
    assert.equal(match.ownerApproved, false);
    assert.equal(match.peerApproved, false);
    assert.equal(match.state, 'suggested');
  }
  assert.equal(JSON.stringify(result).includes(first.boundaries), false);
  assert.equal(JSON.stringify(result).includes('Private owner note:'), false);
});

test('demo discovery exercises rejection cases and all three connection modes', () => {
  const friendship = discover(owner(), 'friendship');
  const ids = friendship.matches.map((match) => match.person.id);
  for (const blocked of ['tessa', 'lou', 'eve', 'remy', 'kian'])
    assert.equal(ids.includes(blocked), false, blocked);
  assert.ok(ids.includes('theo'));
  assert.ok(ids.includes('sage'));
  const datingIds = discover(owner(), 'dating').matches.map((match) => match.person.id);
  assert.equal(datingIds.includes('theo'), false);
  assert.equal(datingIds.includes('sage'), false);
  assert.ok(datingIds.includes('maya'));
  assert.ok(discover(owner(), 'collaboration').matches.some((match) => match.person.id === 'noor'));
});

test('public card is an allowlist and excludes contact, private notes, and policies', () => {
  const privateProfile = {
    ...peer(),
    phone: '+1 212 555 0100',
    email: 'fictional@example.invalid',
    address: 'Not a real address',
  };
  const card = toPublicPerson(privateProfile);
  assert.deepEqual(
    Object.keys(card).sort(),
    [
      'id',
      'name',
      'age',
      'city',
      'bio',
      'agentName',
      'interests',
      'color',
      'initials',
      'illustration',
    ].sort(),
  );
  const serialized = JSON.stringify(card);
  for (const privateText of [
    'phone',
    'email',
    'address',
    'boundaries',
    'requirements',
    'smoking',
    'datingGenders',
    '+1 212',
    'fictional@example.invalid',
  ])
    assert.equal(serialized.includes(privateText), false);
});

test('introduction requires two explicit owner consents and preserves the previous state', () => {
  const suggested = discover(owner(), 'friendship').matches[0];
  assert.throws(() => transitionMatch(suggested, 'peer-approve'), /first owner/i);
  const waiting = transitionMatch(suggested, 'approve');
  assert.equal(suggested.state, 'suggested');
  assert.equal(waiting.state, 'awaiting-peer');
  assert.equal(waiting.ownerApproved, true);
  assert.equal(waiting.peerApproved, false);
  const connected = transitionMatch(waiting, 'peer-approve');
  assert.equal(connected.state, 'connected');
  assert.equal(connected.ownerApproved && connected.peerApproved, true);
  assert.equal(waiting.state, 'awaiting-peer');
});

test('decline withdraws consent and block is terminal even after both approvals', () => {
  const waiting = transitionMatch(discover(owner(), 'friendship').matches[0], 'approve');
  const declined = transitionMatch(waiting, 'decline');
  assert.equal(declined.state, 'declined');
  assert.equal(declined.ownerApproved, false);
  assert.equal(declined.peerApproved, false);
  assert.throws(() => transitionMatch(declined, 'approve'), /declined/i);
  const connected = transitionMatch(waiting, 'peer-approve');
  const blocked = transitionMatch(connected, 'block');
  assert.equal(blocked.state, 'blocked');
  assert.equal(blocked.ownerApproved || blocked.peerApproved, false);
  for (const action of ['approve', 'peer-approve', 'decline', 'block'] as const)
    assert.throws(() => transitionMatch(blocked, action), /terminal/i);
});

test('malformed profiles fail closed rather than coercing or weakening policy', () => {
  const badInputs = [
    { ...owner(), age: 17 },
    { ...owner(), age: '29' },
    { ...owner(), age: 121 },
    { ...owner(), name: '' },
    { ...owner(), intents: [] },
    { ...owner(), interests: ['Coffee', 'Coffee'] },
    { ...owner(), availability: [] },
    { ...owner(), smoking: 'false' },
    { ...owner(), requirements: { ...owner().requirements, minAge: 40, maxAge: 25 } },
    { ...owner(), requirements: { ...owner().requirements, minAge: 17 } },
    { ...owner(), requirements: { ...owner().requirements, datingGenders: [] } },
    { ...owner(), gender: 'unknown' },
    null,
  ];
  for (const input of badInputs) assert.throws(() => validateProfile(input));
  const invalidPeer = { ...peer(), age: 17 };
  assert.deepEqual(evaluateEligibility(owner(), invalidPeer, 'friendship'), {
    accepted: false,
    reason: 'invalid-profile',
  });
  assert.throws(() => discover({ ...owner(), age: 17 }, 'friendship'));
});

test('unknown input fields are stripped and ordinary text is trimmed', () => {
  const input = {
    ...owner(),
    name: '  Alex  ',
    email: 'private@example.invalid',
    contact: { phone: 'private' },
  };
  const validated = validateProfile(input);
  assert.equal(validated.name, 'Alex');
  assert.equal('email' in validated, false);
  assert.equal('contact' in validated, false);
});

test('injected external candidates negotiate without coupling to fixture identities', () => {
  const first = owner();
  const external = {
    ...peer(),
    id: 'external-owner-agent',
    name: 'External fictional adult',
    agentName: 'Independent local agent',
  };
  const result = discoverWithCandidates(first, 'friendship', [external]);
  assert.equal(result.considered, 1);
  assert.equal(result.excluded, 0);
  assert.equal(result.matches[0].person.id, external.id);
  assert.equal(negotiate(first, external, 'friendship')?.ownerApproved, false);
  external.requirements.minAge = first.age + 1;
  assert.equal(negotiate(first, external, 'friendship'), null);
  assert.equal(discoverWithCandidates(first, 'friendship', [external]).excluded, 1);
});

test('the local JSON handshake exchanges six typed messages and no private policy or contact fields', () => {
  const first = { ...owner(), boundaries: 'OWNER-SUPER-PRIVATE-NOTE', phone: 'PRIVATE-PHONE' };
  const second = { ...peer(), boundaries: 'PEER-SUPER-PRIVATE-NOTE', email: 'PRIVATE-EMAIL' };
  const result = runNegotiation(first, second, 'friendship');
  assert.equal(result.accepted, true);
  assert.deepEqual(
    result.exchange.map((message) => message.type),
    [
      'offer',
      'policy-response',
      'window-proposal',
      'window-response',
      'meeting-proposal',
      'suggestion-ready',
    ],
  );
  for (const message of result.exchange) {
    assert.equal(message.version, 'kin/0.1');
    assert.deepEqual(protocolMessageSchema.parse(message), message);
  }
  const wire = JSON.stringify(result.exchange);
  for (const privateText of [
    'boundaries',
    'requirements',
    'minAge',
    'maxAge',
    'datingGenders',
    'OWNER-SUPER-PRIVATE-NOTE',
    'PEER-SUPER-PRIVATE-NOTE',
    'PRIVATE-PHONE',
    'PRIVATE-EMAIL',
  ])
    assert.equal(wire.includes(privateText), false, privateText);
  const ready = result.exchange.at(-1)!;
  assert.equal(ready.type, 'suggestion-ready');
  if (ready.type === 'suggestion-ready') {
    assert.equal(ready.humanApprovalRequired, true);
    assert.equal(ready.contactShared, false);
  }
});

test('either policy agent can reject without disclosing the private rule', () => {
  const first = owner();
  const second = peer();
  second.requirements.minAge = first.age + 1;
  let result = runNegotiation(first, second, 'friendship');
  assert.equal(result.accepted, false);
  assert.equal(result.exchange.length, 2);
  assert.deepEqual(result.exchange.at(-1), {
    version: PROTOCOL_VERSION,
    conversationId: `conversation-${first.id}-${second.id}-friendship`,
    from: second.id,
    to: first.id,
    type: 'rejected',
    reason: 'policy-declined',
  });
  second.requirements.minAge = 18;
  second.smoking = true;
  second.requirements.nonsmoker = false;
  result = runNegotiation(first, second, 'friendship');
  assert.equal(result.accepted, false);
  assert.equal(result.exchange.length, 3);
  assert.equal(result.exchange.at(-1)?.from, first.id);
  assert.equal(result.exchange.at(-1)?.type, 'rejected');
});

test('message schema and state machine reject private extras, wrong routing, replay, and tampered windows', () => {
  const first = new LocalPolicyAgent(owner());
  const second = new LocalPolicyAgent(peer());
  const offer = first.createOffer(second.id, 'friendship');
  assert.throws(() =>
    second.receiveOffer({
      ...offer,
      card: { ...offer.card, boundaries: 'malicious private field' },
    }),
  );
  assert.throws(() => second.receiveOffer({ ...offer, to: 'wrong-owner' }), /different owner/i);
  assert.throws(
    () => second.receiveOffer({ ...offer, card: { ...offer.card, id: 'different-sender' } }),
    /unexpected/i,
  );
  const response = second.receiveOffer(offer);
  assert.equal(response.type, 'policy-response');
  assert.throws(() => second.receiveOffer(offer), /replayed/i);
  if (response.type !== 'policy-response') assert.fail('Expected valid local peer response');
  const proposal = first.receivePolicyResponse(response);
  assert.equal(proposal.type, 'window-proposal');
  assert.throws(() => first.receivePolicyResponse(response), /stage/i);
  if (proposal.type !== 'window-proposal') assert.fail('Expected shared availability');
  const tampered = second.receiveWindowProposal({ ...proposal, slot: 'weekday-days' });
  assert.equal(tampered.type, 'rejected');
  if (tampered.type === 'rejected') assert.equal(tampered.reason, 'invalid-proposal');
});

test('search and negotiation do not mutate owners or frozen fixtures', () => {
  const first = owner();
  const second = peer();
  const firstBefore = structuredClone(first);
  const secondBefore = structuredClone(second);
  discoverWithCandidates(first, 'dating', [second]);
  runNegotiation(first, second, 'dating');
  assert.deepEqual(first, firstBefore);
  assert.deepEqual(second, secondBefore);
  assert.ok(Object.isFrozen(FIXTURES));
  assert.ok(Object.isFrozen(FIXTURES[0].requirements.datingGenders));
  assert.throws(() => {
    FIXTURES[0].interests.push('Film');
  }, TypeError);
});

test('public text rejects recognizable contact details while private notes stay private', () => {
  const contacts = [
    'Say hi at alex@example.invalid',
    'Call +1 (212) 555-0100',
    'Text 2125550100',
    'Visit https://example.invalid/alex',
    'Find me on www.example.invalid',
    'My site: example.com',
    'ａｌｅｘ＠ｅｘａｍｐｌｅ．ｃｏｍ',
  ];
  for (const field of ['name', 'bio', 'city', 'agentName'] as const) {
    for (const contact of contacts) {
      assert.throws(
        () => validateProfile({ ...owner(), [field]: contact }),
        /public profile fields/i,
        `${field}: ${contact}`,
      );
    }
  }
  const first = owner();
  first.boundaries = 'Private: alex@example.invalid; +1 (212) 555-0100; https://example.invalid';
  assert.equal(validateProfile(first).boundaries, first.boundaries);
  assert.equal(JSON.stringify(discover(first, 'friendship')).includes(first.boundaries), false);
  assert.doesNotThrow(() =>
    validateProfile({
      ...owner(),
      bio: 'I ran a 5 km race on 2026-10-07. I have 3 favorite books.',
    }),
  );
  assert.throws(
    () => toPublicPerson({ ...peer(), bio: 'Text +1 (212) 555-0100' }),
    /public profile fields/i,
  );
});

test('valid owners may negotiate and discover with zero shared interests or values', () => {
  const first: OwnerProfile = {
    ...owner(),
    name: 'Robin',
    gender: 'self-described',
    intents: ['friendship'],
    interests: ['Running'],
    values: ['Honesty'],
    availability: ['weekends'],
    requirements: { minAge: 18, maxAge: 80, sameCity: true, nonsmoker: false, datingGenders: [] },
  };
  const second = peer();
  const match = negotiate(first, second, 'friendship');
  assert.ok(match);
  assert.deepEqual(match.sharedInterests, []);
  assert.deepEqual(match.sharedValues, []);
  assert.equal(match.plan.availability, 'weekends');
  assert.equal(match.state, 'suggested');
  assert.equal(match.ownerApproved || match.peerApproved, false);
  const wire = runNegotiation(first, second, 'friendship');
  assert.equal(wire.accepted, true);
  const window = wire.exchange.find((message) => message.type === 'window-proposal');
  assert.ok(window && window.type === 'window-proposal');
  assert.deepEqual(window.sharedInterests, []);
  assert.deepEqual(window.sharedValues, []);
  assert.doesNotThrow(() => discover(first, 'friendship'));
  assert.ok(discover(first, 'friendship').matches.length > 0);
  // Reproduce the observed browser profile: some peers overlap only on interests.
  const observed = { ...first, interests: ['Books', 'Coffee'], values: ['Kindness'] };
  assert.doesNotThrow(() => discover(observed, 'friendship'));
  assert.ok(
    discover(observed, 'friendship').matches.some(
      (candidate) => candidate.person.id === 'jules' && candidate.sharedValues.length === 0,
    ),
  );
});
