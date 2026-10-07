import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAREER_GOALS,
  assessCareerGoals,
  isCareerGoal,
} from '../src/matchmaking/domain/services/career-goals.js';

test('career connections require explicitly selected complementary goals in either direction', () => {
  const pairs = [
    ['Career: peer learning', 'Career: peer learning', 'peer-learning'],
    ['Career: find a mentor', 'Career: offer mentorship', 'mentorship'],
    ['Career: explore jobs', 'Career: hiring', 'job-exploration'],
    ['Career: find a cofounder', 'Career: find a cofounder', 'cofounder'],
    ['Career: raise funding', 'Career: investing', 'funding'],
  ];
  for (const [ownerGoal, peerGoal, kind] of pairs) {
    const result = assessCareerGoals([ownerGoal], [peerGoal]);
    assert.equal(result.ownerCoverage, 1);
    assert.equal(result.peerCoverage, 1);
    assert.equal(result.ownerSupportedGoalCount, 1);
    assert.equal(result.peerSupportedGoalCount, 1);
    assert.equal(result.connections.length, 1);
    assert.equal(result.connections[0].kind, kind);
    assert.equal(result.connections[0].ownerGoal, ownerGoal);
    assert.equal(result.connections[0].peerGoal, peerGoal);
    assert.ok(result.connections[0].reason.includes(`You selected “${ownerGoal}”`));
    assert.ok(result.connections[0].reason.includes(`your peer selected “${peerGoal}”`));
    assert.match(result.connections[0].reason, /not a verified role or promised outcome/);

    const reversed = assessCareerGoals([peerGoal], [ownerGoal]);
    assert.equal(reversed.connections[0].ownerGoal, peerGoal);
    assert.equal(reversed.connections[0].peerGoal, ownerGoal);
    assert.equal(reversed.connections[0].kind, kind);
    assert.deepEqual(
      [
        reversed.connections[0].title,
        reversed.connections[0].detail,
        reversed.connections[0].questions,
      ],
      [result.connections[0].title, result.connections[0].detail, result.connections[0].questions],
    );
  }
});

test('competing same-sided mentor, hiring and funding goals have no career coverage', () => {
  for (const goal of [
    'Career: find a mentor',
    'Career: offer mentorship',
    'Career: explore jobs',
    'Career: hiring',
    'Career: raise funding',
    'Career: investing',
  ]) {
    const result = assessCareerGoals([goal, 'Books'], [goal, 'Books']);
    assert.equal(result.ownerGoalCount, 1);
    assert.equal(result.peerGoalCount, 1);
    assert.equal(result.ownerCoverage, 0);
    assert.equal(result.peerCoverage, 0);
    assert.deepEqual(result.connections, []);
  }
  assert.deepEqual(
    assessCareerGoals(['Career: find a mentor'], ['Career: investing']).connections,
    [],
  );
});

test('coverage is directional fraction of declared goals, not a count or topical similarity', () => {
  const owner = [
    'Career: find a mentor',
    'Career: raise funding',
    'Career: find a cofounder',
    'Books',
  ];
  const peer = ['Career: offer mentorship', 'Books'];
  const result = assessCareerGoals(owner, peer);
  assert.equal(result.ownerGoalCount, 3);
  assert.equal(result.peerGoalCount, 1);
  assert.equal(result.ownerSupportedGoalCount, 1);
  assert.equal(result.peerSupportedGoalCount, 1);
  assert.equal(result.ownerCoverage, 1 / 3);
  assert.equal(result.peerCoverage, 1);
  const swapped = assessCareerGoals(peer, owner);
  assert.equal(swapped.ownerCoverage, result.peerCoverage);
  assert.equal(swapped.peerCoverage, result.ownerCoverage);
});

test('all goals remain bounded, ordered independently of input, and symmetric in neutral plan text', () => {
  const first = [...CAREER_GOALS, 'Books', 'Coffee'];
  const second = [...CAREER_GOALS].reverse();
  const result = assessCareerGoals(first, second);
  assert.equal(result.ownerGoalCount, 8);
  assert.equal(result.peerGoalCount, 8);
  assert.equal(result.ownerSupportedGoalCount, 8);
  assert.equal(result.peerSupportedGoalCount, 8);
  assert.equal(result.ownerCoverage, 1);
  assert.equal(result.peerCoverage, 1);
  assert.equal(result.connections.length, 8);
  assert.deepEqual(assessCareerGoals([...first].reverse(), [...second].reverse()), result);

  const swapped = assessCareerGoals(second, first);
  const roles = result.connections
    .map(({ kind, ownerGoal, peerGoal }) => JSON.stringify([kind, peerGoal, ownerGoal]))
    .sort();
  assert.deepEqual(
    swapped.connections
      .map(({ kind, ownerGoal, peerGoal }) => JSON.stringify([kind, ownerGoal, peerGoal]))
      .sort(),
    roles,
  );
  assert.deepEqual(
    swapped.connections.map(({ kind, title, detail, questions }) => ({
      kind,
      title,
      detail,
      questions,
    })),
    result.connections.map(({ kind, title, detail, questions }) => ({
      kind,
      title,
      detail,
      questions,
    })),
  );
  assert.equal(result.connections[0].kind, 'peer-learning');
});

test('only exact normalized labels count; case, whitespace and NFKC normalization are consistent', () => {
  const result = assessCareerGoals(
    ['  Ｃａｒｅｅｒ：\tＦＩＮＤ a mentor  '],
    [' career:  OFFER mentorship '],
  );
  assert.equal(result.ownerCoverage, 1);
  assert.equal(result.connections[0].ownerGoal, 'Career: find a mentor');
  assert.equal(result.connections[0].peerGoal, 'Career: offer mentorship');
  assert.equal(isCareerGoal('  CAREER:  investing  '), true);
  for (const label of [
    'Mentoring',
    'Investor',
    'Career: verified investor',
    'Career: hiring soon',
    'Career: hiring at a verified firm',
    'Career: find a mentor please',
    'Career: hir\u200bing',
  ])
    assert.equal(isCareerGoal(label), false, label);
});

test('zero recognized goals and unsupported claims infer no roles or private facts', () => {
  const generic = assessCareerGoals(['Books', 'Investor', 'Mentoring'], ['Finance', 'Leadership']);
  assert.deepEqual(generic, {
    ownerCoverage: 0,
    peerCoverage: 0,
    ownerGoalCount: 0,
    peerGoalCount: 0,
    ownerSupportedGoalCount: 0,
    peerSupportedGoalCount: 0,
    connections: [],
  });
  const oneSided = assessCareerGoals(['Career: hiring'], ['Software engineering']);
  assert.equal(oneSided.ownerGoalCount, 1);
  assert.equal(oneSided.peerGoalCount, 0);
  assert.equal(oneSided.ownerCoverage, 0);
  assert.equal(oneSided.peerCoverage, 0);
  assert.deepEqual(oneSided.connections, []);
  const unknown = assessCareerGoals(['Career: verified investor'], ['Career: raise funding']);
  assert.deepEqual(unknown.connections, []);
  assert.doesNotMatch(JSON.stringify(unknown), /verified investor/);
});

test('plan text remains exploratory, bounded and free of fabricated qualifications or actions', () => {
  const result = assessCareerGoals(CAREER_GOALS, CAREER_GOALS);
  for (const connection of result.connections) {
    assert.ok(connection.detail.length <= 350);
    assert.equal(connection.questions.length, 2);
    assert.doesNotMatch(
      JSON.stringify(connection),
      /you are (?:qualified|verified|licensed)|guaranteed|we (?:approved|messaged|hired)|perfect match|your history|your bio/i,
    );
  }
  assert.match(
    result.connections.find((connection) => connection.kind === 'mentorship')!.detail,
    /do not verify expertise/,
  );
  assert.match(
    result.connections.find((connection) => connection.kind === 'job-exploration')!.detail,
    /do not establish a vacancy/,
  );
  assert.match(
    result.connections.find((connection) => connection.kind === 'cofounder')!.detail,
    /do not establish skills/,
  );
  assert.match(
    result.connections.find((connection) => connection.kind === 'funding')!.detail,
    /do not verify investor status/,
  );
});

test('malformed, contacting, duplicate and extra-field arrays cannot be assessed', () => {
  const malformed = [
    null,
    'Career: hiring',
    {},
    { interests: ['Career: offer mentorship'], verified: true, bio: 'Private facts' },
    [],
    [''],
    [42],
    [{ goal: 'Career: hiring', verified: true }],
    ['owner@example.com'],
    ['https://example.com'],
    ['+1 (212) 555-0199'],
    ['Career: hiring', ' career:  HIRING '],
    ['AI ethics', ' ai ETHICS '],
    ['x'.repeat(49)],
    Array.from({ length: 13 }, (_, index) => `Interest ${index}`),
    Object.assign(['Career: hiring'], { verified: true }),
    Object.assign(['Career: hiring'], { [Symbol('private')]: 'Private notes' }),
  ];
  for (const invalid of malformed) {
    assert.throws(() => assessCareerGoals(invalid, ['Career: explore jobs']));
    assert.throws(() => assessCareerGoals(['Career: explore jobs'], invalid));
  }
  assert.equal(assessCareerGoals(['x'.repeat(48)], ['Books']).ownerGoalCount, 0);
  assert.equal(
    assessCareerGoals(
      [...CAREER_GOALS, 'Books', 'Coffee', 'Technology', 'Art & design'],
      CAREER_GOALS,
    ).ownerGoalCount,
    8,
  );
});

test('assessment never mutates owner inputs or shares mutable plan arrays across calls', () => {
  const owner = Object.freeze(['  career: FIND a mentor ', 'Books']);
  const peer = Object.freeze(['Career: offer mentorship']);
  const result = assessCareerGoals(owner, peer);
  result.connections[0].questions.push('A caller mutation');
  assert.equal(assessCareerGoals(owner, peer).connections[0].questions.length, 2);
  assert.deepEqual(owner, ['  career: FIND a mentor ', 'Books']);
  assert.deepEqual(peer, ['Career: offer mentorship']);
  assert.equal(Object.isFrozen(CAREER_GOALS), true);
});
