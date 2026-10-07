import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIntroductionBrief } from '../src/matchmaking/index.js';
import principles from '../knowledge/connection-principles.json' with { type: 'json' };

test('introduction briefs use only declared common ground and give a small optional next step', () => {
  const brief = createIntroductionBrief({
    intent: 'collaboration',
    sharedInterests: ['Technology', 'AI ethics'],
    sharedValues: ['Curiosity'],
    slot: 'weekends',
    peerAlias: 'Orbit',
  });
  assert.match(brief.headline, /Orbit/);
  assert.ok(brief.why.some((line) => line.includes('Technology, AI ethics')));
  assert.match(brief.idea.title, /prototype/);
  assert.match(brief.idea.detail, /25-minute/);
  assert.ok(brief.questions.some((question) => question.includes('each of us')));
  assert.match(brief.boundary, /not a prediction/);
  assert.equal(brief.principleIds.length, 6);
  assert.ok(
    brief.principleIds.every((id) => principles.some((rule: { id: string }) => rule.id === id)),
  );
  assert.doesNotMatch(
    JSON.stringify(brief),
    /perfect match|guaranteed|personality|compatibility probability/i,
  );
});
test('no-overlap brief invents no shared interests or personal traits', () => {
  const brief = createIntroductionBrief({
    intent: 'dating',
    sharedInterests: [],
    sharedValues: [],
    slot: 'weekday-evenings',
  });
  assert.equal(brief.why.length, 1);
  assert.doesNotMatch(JSON.stringify(brief), /Technology|Books|creative person|extrovert/);
  assert.match(brief.boundary, /skip any question/);
});
test('contacts, private profile fields and unsupported claims cannot enter an introduction brief', () => {
  const facts = {
    intent: 'friendship' as const,
    sharedInterests: ['Books'],
    sharedValues: [],
    slot: 'weekends' as const,
  };
  assert.throws(() =>
    createIntroductionBrief({ ...facts, sharedInterests: ['person@example.com'] }),
  );
  assert.throws(() => createIntroductionBrief({ ...facts, peerAlias: 'www.example.com' }));
  assert.throws(() => createIntroductionBrief({ ...facts, boundaries: 'Private notes' } as never));
  assert.throws(() => createIntroductionBrief({ ...facts, sharedValues: ['A verified investor'] }));
});
