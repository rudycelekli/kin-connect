import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPilotFeedback,
  savePilotFeedback,
  readPilotFeedback,
  deletePilotFeedback,
  exportPilotFeedback,
  FEEDBACK_STORAGE_KEY,
} from '../src/pilot-feedback.js';
const storage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
};
const sample = {
  source: 'live-owner-self-report' as const,
  intent: 'collaboration' as const,
  answers: {
    met: 'yes' as const,
    useful: 'yes' as const,
    comfortable: 'yes' as const,
    shareApproved: true,
  },
  consent: true as const,
};

test('feedback requires explicit consent, rejects private payloads and remains on the chosen storage', () => {
  const vault = storage();
  assert.throws(() => createPilotFeedback({ ...sample, consent: false } as never));
  assert.throws(() => createPilotFeedback({ ...sample, transcript: 'PRIVATE-CHAT' } as never));
  assert.throws(() =>
    createPilotFeedback({
      ...sample,
      answers: { ...sample.answers, email: 'person@example.com' },
    } as never),
  );
  const record = createPilotFeedback(sample);
  savePilotFeedback(vault, record);
  assert.deepEqual(readPilotFeedback(vault), [record]);
  assert.throws(() => savePilotFeedback(vault, record), /already saved/);
  assert.doesNotMatch(JSON.stringify(record), /name|peer|conversation|email|transcript/i);
  deletePilotFeedback(vault);
  assert.deepEqual(readPilotFeedback(vault), []);
});

test('export excludes unapproved and fictional records and discloses the self-report limits', () => {
  const vault = storage();
  savePilotFeedback(vault, createPilotFeedback(sample));
  savePilotFeedback(vault, createPilotFeedback({ ...sample, source: 'fictional-demo-feedback' }));
  savePilotFeedback(
    vault,
    createPilotFeedback({ ...sample, answers: { ...sample.answers, shareApproved: false } }),
  );
  savePilotFeedback(
    vault,
    createPilotFeedback({
      ...sample,
      intent: 'friendship',
      answers: {
        met: 'not-yet',
        useful: 'prefer-not-to-say',
        comfortable: 'no',
        shareApproved: true,
      },
    }),
  );
  const result = exportPilotFeedback(vault);
  assert.equal(result.byIntent.collaboration.responses, 1);
  assert.equal(result.byIntent.collaboration.useful, 1);
  assert.equal(result.byIntent.friendship.met, 0);
  assert.equal(result.byIntent.friendship.uncomfortable, 1);
  assert.equal(result.uniquePeopleVerified, false);
  assert.doesNotMatch(JSON.stringify(result), /recordedAt|"id"|live-owner-self-report/);
  assert.match(result.limits, /unverified meetings/);
  assert.throws(
    () => createPilotFeedback({ ...sample, answers: { ...sample.answers, met: 'not-yet' } }),
    /only after/,
  );
});

test('feedback retention is bounded, malformed evidence fails closed, and deletion still works', () => {
  const vault = storage();
  for (let i = 0; i < 55; i++) savePilotFeedback(vault, createPilotFeedback(sample));
  assert.equal(readPilotFeedback(vault).length, 50);
  vault.setItem(
    FEEDBACK_STORAGE_KEY,
    JSON.stringify([{ ...readPilotFeedback(vault)[0], unknown: true }]),
  );
  assert.throws(() => readPilotFeedback(vault));
  vault.setItem(
    FEEDBACK_STORAGE_KEY,
    JSON.stringify([{ ...createPilotFeedback(sample), met: 'not-yet' }]),
  );
  assert.throws(() => readPilotFeedback(vault));
  deletePilotFeedback(vault);
  assert.deepEqual(readPilotFeedback(vault), []);
});
