import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OwnerProfile } from '../src/shared/types.js';
import { demoProfile } from '../src/matchmaking/index.js';
import * as communityApi from '../src/communities/index.js';
import {
  assessCircle,
  applyToCircle,
  transitionCircleApplication,
  profileFingerprint,
  circleFingerprint,
  validateCircleApplication,
  validateCircle,
  type Circle,
  type CircleApplication,
} from '../src/communities/index.js';
import { circleCatalog } from '../src/communities/infrastructure/index.js';

const coffee = circleCatalog.find((circle) => circle.id === 'brooklyn-coffee-circle')!;
const makers = circleCatalog.find((circle) => circle.id === 'makers-exchange')!;
const owner = (): OwnerProfile => structuredClone(demoProfile());
const failure = (profile: OwnerProfile, circle: Circle, label: string) => {
  const assessment = assessCircle(profile, circle);
  assert.equal(assessment.eligible, false);
  assert.equal(assessment.checks.find((check) => check.label === label)?.passed, false);
  assert.throws(() => applyToCircle(profile, circle), /admission requirements/);
};

test('fictional circle fixtures are valid, deeply frozen, and infrastructure-only', () => {
  assert.equal(circleCatalog.length, 4);
  assert.equal('circleCatalog' in communityApi, false);
  assert.ok(Object.isFrozen(circleCatalog));
  for (const circle of circleCatalog) {
    assert.deepEqual(validateCircle(circle), circle);
    assert.ok(Object.isFrozen(circle));
    assert.ok(Object.isFrozen(circle.interests));
    assert.ok(Object.isFrozen(circle.availability));
  }
  assert.throws(() => coffee.interests.push('Film'), TypeError);
  assert.equal(assessCircle(owner(), coffee).eligible, true);
});

test('city, adult age, pause and purpose gates cannot be outweighed by perfect overlap', () => {
  const profile = owner();
  profile.interests = [...coffee.interests];
  profile.availability = [...coffee.availability];
  failure({ ...profile, city: 'Boston' }, coffee, 'City');
  failure({ ...profile, age: 20 }, { ...coffee, minimumAge: 21 }, 'Adult admission');
  failure({ ...profile, paused: true }, coffee, 'Agent available');
  failure({ ...profile, intents: ['collaboration'] }, coffee, 'Purpose');
  assert.equal(assessCircle({ ...profile, city: '  NEW   YORK  ' }, coffee).eligible, true);
  assert.equal(assessCircle({ ...profile, age: 21 }, { ...coffee, minimumAge: 21 }).eligible, true);
});

test('missing or malformed adult facts fail closed even when callers bypass TypeScript', () => {
  for (const malformed of [
    { age: undefined },
    { age: 17 },
    { age: '29' },
    { city: '' },
    { city: undefined },
    { intents: [] },
    { availability: [] },
    { interests: [] },
    { agentName: 'unsafe@example.com' },
  ]) {
    failure({ ...owner(), ...malformed } as OwnerProfile, coffee, 'Complete owner policy');
  }
  failure(owner(), { ...coffee, paid: undefined } as unknown as Circle, 'Circle policy');
});

test('shared interests and a real common availability window are both mandatory', () => {
  failure({ ...owner(), interests: ['Hiking'] }, coffee, 'Shared interests');
  failure({ ...owner(), availability: ['weekday-days'] }, coffee, 'Meeting window');
  assert.equal(
    assessCircle({ ...owner(), interests: ['Coffee'], availability: ['weekends'] }, coffee)
      .eligible,
    true,
  );
});

test('credential and paid clubs stay closed without a self-attestation bypass', () => {
  const profile = {
    ...owner(),
    intents: ['friendship', 'collaboration'],
    interests: ['Technology', 'Coffee', 'Books', 'Art & design'],
    credential: 'professional-membership',
    verified: true,
    paid: true,
  } as OwnerProfile;
  const founders = circleCatalog.find((circle) => circle.id === 'founders-table')!;
  const members = circleCatalog.find((circle) => circle.id === 'members-club')!;
  failure(profile, founders, 'Verified access');
  failure(profile, members, 'Paid access');
  failure(
    profile,
    { ...makers, paid: true, requiredCredential: 'professional-membership' },
    'Paid access',
  );
});

test('disclosures and simulated transcripts exclude raw private profile fields and excess interests', () => {
  const profile = {
    ...owner(),
    name: 'PRIVATE NAME MARKER',
    bio: 'PRIVATE BIO MARKER',
    boundaries: 'PRIVATE NOTES MARKER private@example.com',
    agentName: 'Nova',
    interests: ['Coffee', 'Hiking', 'Books'],
  };
  const assessment = assessCircle(profile, coffee);
  assert.deepEqual(assessment.disclosures, {
    alias: 'Nova',
    purpose: 'Explore friendship in a fictional circle.',
    city: 'New York',
    interests: ['Coffee', 'Books'],
  });
  const visible = JSON.stringify(assessment);
  for (const forbidden of [
    'PRIVATE NAME',
    'PRIVATE BIO',
    'PRIVATE NOTES',
    'private@example.com',
    'datingGenders',
    'minAge',
    'Hiking',
  ]) {
    assert.equal(visible.includes(forbidden), false);
  }
  assert.equal(assessment.messages.length, 4);
  assert.ok(assessment.messages.some((message) => message.text.includes('Local simulation')));
  const globalAssessment = assessCircle(
    { ...profile, intents: ['collaboration'], interests: ['Technology'] },
    makers,
  );
  assert.equal(globalAssessment.eligible, true);
  assert.equal('city' in globalAssessment.disclosures, false);
  assert.equal('city' in assessCircle({ ...profile, city: 'Boston' }, coffee).disclosures, false);
});

test('explicit owner application precedes simulated organizer approval and transitions are immutable', () => {
  const profile = owner();
  const before = structuredClone(profile);
  const application = applyToCircle(profile, coffee);
  assert.equal(application.state, 'pending-organizer');
  assert.equal(application.ownerApproved, true);
  assert.equal(application.organizerApproved, false);
  assert.notEqual(application.id, applyToCircle(profile, coffee).id);
  const member = transitionCircleApplication(
    profile,
    coffee,
    application,
    'simulate-organizer-approval',
  );
  assert.equal(member.state, 'member');
  assert.equal(member.ownerApproved && member.organizerApproved, true);
  assert.equal(application.state, 'pending-organizer');
  assert.deepEqual(profile, before);
  assert.deepEqual(validateCircleApplication(JSON.parse(JSON.stringify(member))), member);
});

test('organizer approval cannot manufacture membership without an approved owner application', () => {
  const profile = owner();
  const application = applyToCircle(profile, coffee);
  for (const approvals of [
    { ownerApproved: false, organizerApproved: false },
    { ownerApproved: false, organizerApproved: true },
    { ownerApproved: true, organizerApproved: true },
  ]) {
    assert.throws(
      () =>
        transitionCircleApplication(
          profile,
          coffee,
          { ...application, ...approvals },
          'simulate-organizer-approval',
        ),
      /consent/,
    );
  }
  for (const approvals of [
    { ownerApproved: false, organizerApproved: false },
    { ownerApproved: false, organizerApproved: true },
    { ownerApproved: true, organizerApproved: false },
  ]) {
    assert.throws(
      () => validateCircleApplication({ ...application, state: 'member', ...approvals }),
      /consent/,
    );
  }
});

test('decline and withdraw revoke both approvals and remain terminal', () => {
  const profile = owner();
  const application = applyToCircle(profile, coffee);
  const member = transitionCircleApplication(
    profile,
    coffee,
    application,
    'simulate-organizer-approval',
  );
  for (const initial of [application, member]) {
    for (const action of ['decline', 'withdraw'] as const) {
      const closed = transitionCircleApplication(profile, coffee, initial, action);
      assert.equal(closed.state, action === 'decline' ? 'declined' : 'withdrawn');
      assert.equal(closed.ownerApproved || closed.organizerApproved, false);
      for (const followup of ['simulate-organizer-approval', 'decline', 'withdraw'] as const) {
        assert.throws(
          () => transitionCircleApplication(profile, coffee, closed, followup),
          /closed application/,
        );
      }
      assert.throws(() => validateCircleApplication({ ...closed, ownerApproved: true }), /consent/);
    }
  }
});

test('compact fingerprints bind private owner facts and circle policy without exporting snapshots', () => {
  const profile = { ...owner(), boundaries: 'PRIVATE FINGERPRINT MARKER' };
  const hash = profileFingerprint(profile);
  assert.match(hash, /^local-profile-v1-[a-f0-9]{16}$/);
  assert.equal(hash, profileFingerprint(structuredClone(profile)));
  assert.equal(
    hash,
    profileFingerprint(
      Object.fromEntries(Object.entries(profile).reverse()) as unknown as OwnerProfile,
    ),
  );
  assert.notEqual(hash, profileFingerprint({ ...profile, boundaries: 'different private notes' }));
  assert.notEqual(
    hash,
    profileFingerprint({ ...profile, requirements: { ...profile.requirements, maxAge: 119 } }),
  );
  assert.match(circleFingerprint(coffee), /^local-circle-v1-[a-f0-9]{16}$/);
  assert.notEqual(circleFingerprint(coffee), circleFingerprint({ ...coffee, minimumAge: 21 }));
  const exported = JSON.stringify(applyToCircle(profile, coffee));
  assert.equal(exported.includes('PRIVATE FINGERPRINT'), false);
  assert.equal(exported.includes('requirements'), false);
});

test('owner or organizer policy changes invalidate old applications before consent replay', () => {
  const profile = owner();
  const application = applyToCircle(profile, coffee);
  for (const changed of [
    { ...profile, boundaries: 'new private rule' },
    { ...profile, agentName: 'New agent alias' },
    { ...profile, paused: true },
    { ...profile, requirements: { ...profile.requirements, maxAge: 119 } },
  ]) {
    assert.throws(
      () =>
        transitionCircleApplication(changed, coffee, application, 'simulate-organizer-approval'),
      /policy changed/,
    );
  }
  for (const changed of [
    { ...coffee, minimumAge: 21 },
    { ...coffee, paid: true },
    { ...coffee, requiredCredential: 'professional-membership' },
    { ...coffee, description: 'Changed organizer policy and description.' },
  ]) {
    assert.throws(
      () =>
        transitionCircleApplication(profile, changed, application, 'simulate-organizer-approval'),
      /policy changed/,
    );
  }
  assert.throws(
    () => transitionCircleApplication(profile, makers, application, 'withdraw'),
    /different circle/,
  );
});

test('persisted applications reject unknown fields, malformed flags and forged disclosures', () => {
  const profile = owner();
  const application = applyToCircle(profile, coffee);
  for (const invalid of [
    { ...application, ownerApproved: 'true' },
    { ...application, profileFingerprint: JSON.stringify(profile) },
    { ...application, circleFingerprint: '' },
    { ...application, id: 'not-a-uuid' },
    { ...application, credentialVerified: true },
    { ...application, disclosures: { ...application.disclosures, boundaries: 'private notes' } },
    { ...application, disclosures: { ...application.disclosures, alias: 'owner@example.com' } },
    { ...application, disclosures: { ...application.disclosures, interests: [] } },
  ])
    assert.throws(() => validateCircleApplication(invalid));
  const forged = {
    ...application,
    disclosures: { ...application.disclosures, interests: ['Hiking'] },
  };
  assert.throws(
    () => transitionCircleApplication(profile, coffee, forged, 'simulate-organizer-approval'),
    /disclosures/,
  );
  assert.throws(
    () => transitionCircleApplication(profile, coffee, application, 'join' as 'withdraw'),
    /Unknown/,
  );
  assert.equal(assessCircle(profile, coffee).eligible, true);
});

test('circle custom categories match by normalized key and remain bounded public labels', () => {
  const circle = { ...makers, interests: ['Electronic Music'] };
  const profile = {
    ...owner(),
    intents: ['collaboration'] as OwnerProfile['intents'],
    interests: [' electronic   MUSIC ', 'Urban Gardening'],
  };
  const assessment = assessCircle(profile, circle);
  assert.equal(assessment.eligible, true);
  assert.deepEqual(assessment.disclosures.interests, ['electronic MUSIC']);
  const application = applyToCircle(profile, circle);
  assert.equal(
    transitionCircleApplication(profile, circle, application, 'simulate-organizer-approval').state,
    'member',
  );
  assert.throws(() =>
    validateCircle({ ...circle, interests: ['Electronic Music', ' electronic MUSIC '] }),
  );
  assert.throws(() => validateCircle({ ...circle, interests: ['contact@example.com'] }));
  assert.throws(() =>
    validateCircleApplication({
      ...application,
      disclosures: { ...application.disclosures, interests: ['https://example.com'] },
    }),
  );
  failure({ ...profile, interests: ['Breadmaking'] }, circle, 'Shared interests');
});
