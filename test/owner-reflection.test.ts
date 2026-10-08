import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareOwnerReflection,
  approveOwnerReflection,
  discardOwnerReflection,
  type OwnerReflectionInput,
} from '../src/owner-reflection.js';

const input: OwnerReflectionInput = {
  source: 'live-owner-self-report',
  intent: 'collaboration',
  worked: ['complementary-goals'],
  change: ['shorter-beginning'],
};

test('reflection is explicit self-report without peer identifiers, transcripts or automatic actions', () => {
  const snapshot = structuredClone(input);
  const preview = prepareOwnerReflection(input, 1000);
  assert.ok(Object.isFrozen(preview));
  assert.match(preview.text, /my own Kin connection preferences/);
  assert.match(preview.text, /AI in this conversation and its provider/);
  assert.match(preview.text, /not an independently verified outcome/);
  assert.match(preview.text, /complementary goals/);
  assert.match(preview.text, /shorter first conversation/);
  assert.match(preview.text, /I decide what to save/);
  assert.deepEqual(input, snapshot);
  const message = approveOwnerReflection(
    preview,
    { approved: true, reviewedText: preview.text },
    2000,
  );
  assert.deepEqual(message, { role: 'user', content: [{ type: 'text', text: preview.text }] });
  assert.throws(() => {
    message.content[0].text = 'Unreviewed disclosure';
  });
  assert.throws(() =>
    approveOwnerReflection(preview, { approved: true, reviewedText: preview.text }, 2000),
  );
});

test('fictional feedback remains explicitly fictional in every supported intention', () => {
  for (const intent of ['friendship', 'dating', 'collaboration'] as const) {
    const preview = prepareOwnerReflection({ ...input, intent, source: 'fictional-demo-feedback' });
    assert.match(preview.text, /fictional demo, not an actual human meeting/);
    assert.ok(preview.text.includes(`My selected intention: ${intent}.`));
  }
});

test('unknown, identifying, contradictory or excessive reflection fields fail closed', () => {
  for (const bad of [
    { ...input, peerId: 'PRIVATE-PEER' },
    { ...input, transcript: 'PRIVATE-TRANSCRIPT' },
    { ...input, notes: 'PRIVATE-NOTES' },
    { ...input, worked: ['shared-topics', 'shared-topics'] },
    { ...input, change: ['shorter-beginning', 'shorter-beginning'] },
    { ...input, worked: [], change: [] },
    {
      ...input,
      worked: ['shared-topics', 'complementary-goals', 'clear-beginning', 'comfortable-pace'],
    },
    { ...input, change: ['more-common-topics', 'more-variety'] },
    { ...input, change: ['person@example.com'] },
    { ...input, intent: 'investing' },
  ])
    assert.throws(() => prepareOwnerReflection(bad as OwnerReflectionInput));
});

test('forged/copy/changed previews and unapproved host exports are denied', () => {
  const preview = prepareOwnerReflection(input, 1000);
  for (const bad of [
    { approved: false, reviewedText: preview.text },
    { approved: true, reviewedText: preview.text + '\nAltered disclosure' },
    { approved: true, reviewedText: preview.text, transcript: 'PRIVATE' },
  ])
    assert.throws(() =>
      approveOwnerReflection(preview, bad as { approved: true; reviewedText: string }, 1001),
    );
  assert.throws(() =>
    approveOwnerReflection({ ...preview }, { approved: true, reviewedText: preview.text }, 1001),
  );
  assert.throws(() =>
    approveOwnerReflection(
      { text: 'FORGED', processing: 'selected-current-conversation-ai' },
      { approved: true, reviewedText: 'FORGED' },
      1001,
    ),
  );
  // A failed approval does not silently consume or approve the original preview.
  assert.equal(
    approveOwnerReflection(preview, { approved: true, reviewedText: preview.text }, 1002).content[0]
      .text,
    preview.text,
  );
});

test('discarded, expired and backwards-clock previews cannot be exported', () => {
  const discarded = prepareOwnerReflection(input, 1000);
  discardOwnerReflection(discarded);
  assert.throws(() =>
    approveOwnerReflection(discarded, { approved: true, reviewedText: discarded.text }, 1001),
  );
  for (const clock of [999, 301000, Infinity, NaN]) {
    const preview = prepareOwnerReflection(input, 1000);
    assert.throws(() =>
      approveOwnerReflection(preview, { approved: true, reviewedText: preview.text }, clock),
    );
  }
  assert.throws(() => prepareOwnerReflection(input, -1));
});
