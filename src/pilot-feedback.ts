import { z } from 'zod';
import type { Intent } from './shared/types.js';

export const FEEDBACK_STORAGE_KEY = 'kin-private-feedback-v1';
const feedbackSchema = z
  .object({
    id: z.string().uuid(),
    source: z.enum(['live-owner-self-report', 'fictional-demo-feedback']),
    intent: z.enum(['friendship', 'dating', 'collaboration']),
    recordedAt: z.string().datetime(),
    met: z.enum(['yes', 'not-yet', 'prefer-not-to-say']),
    useful: z.enum(['yes', 'somewhat', 'no', 'prefer-not-to-say']),
    comfortable: z.enum(['yes', 'no', 'prefer-not-to-say']),
    shareApproved: z.boolean(),
  })
  .strict()
  .superRefine((record, ctx) => {
    if (record.met !== 'yes' && record.useful !== 'prefer-not-to-say')
      ctx.addIssue({
        code: 'custom',
        message: 'Meeting usefulness is available only after a self-reported meeting.',
      });
  });
export type PilotFeedback = z.infer<typeof feedbackSchema>;
export type FeedbackAnswers = Pick<
  PilotFeedback,
  'met' | 'useful' | 'comfortable' | 'shareApproved'
>;
const MAX_RECORDS = 50;

/** Minimal owner self-report. No identity, conversation ID, free text or transcript. */
export function createPilotFeedback(
  input: {
    source: PilotFeedback['source'];
    intent: Intent;
    answers: FeedbackAnswers;
    consent: true;
  },
  now: Date = new Date(),
): PilotFeedback {
  const parsed = z
    .object({
      source: feedbackSchema.shape.source,
      intent: feedbackSchema.shape.intent,
      answers: z
        .object({
          met: feedbackSchema.shape.met,
          useful: feedbackSchema.shape.useful,
          comfortable: feedbackSchema.shape.comfortable,
          shareApproved: feedbackSchema.shape.shareApproved,
        })
        .strict(),
      consent: z.literal(true),
    })
    .strict()
    .parse(input);
  if (parsed.answers.met !== 'yes' && parsed.answers.useful !== 'prefer-not-to-say')
    throw new Error('Meeting usefulness is available only after a self-reported meeting.');
  return feedbackSchema.parse({
    id: crypto.randomUUID(),
    source: parsed.source,
    intent: parsed.intent,
    recordedAt: now.toISOString(),
    ...parsed.answers,
  });
}

export function readPilotFeedback(storage: Pick<Storage, 'getItem'>): PilotFeedback[] {
  const raw = storage.getItem(FEEDBACK_STORAGE_KEY);
  if (!raw) return [];
  // Malformed/oversized records fail closed, without silently rewriting evidence.
  if (raw.length > 32_768) throw new Error('Private feedback data is too large.');
  return z.array(feedbackSchema).max(MAX_RECORDS).parse(JSON.parse(raw));
}
export function savePilotFeedback(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  input: PilotFeedback,
): void {
  const record = feedbackSchema.parse(input);
  const existing = readPilotFeedback(storage);
  if (existing.some((item) => item.id === record.id)) throw new Error('Feedback already saved.');
  storage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify([...existing, record].slice(-MAX_RECORDS)));
}
export function deletePilotFeedback(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(FEEDBACK_STORAGE_KEY);
}

/** Explicitly approved live aggregates only; no synthetic records or individual records. */
export function exportPilotFeedback(storage: Pick<Storage, 'getItem'>) {
  const records = readPilotFeedback(storage).filter(
    (record) => record.shareApproved && record.source === 'live-owner-self-report',
  );
  return {
    version: 'kin-pilot-feedback/0.1',
    scope: 'voluntary-self-reported-local-aggregate',
    uniquePeopleVerified: false,
    outcomesIndependentlyVerified: false,
    byIntent: Object.fromEntries(
      (['friendship', 'dating', 'collaboration'] as const).map((intent) => {
        const items = records.filter((record) => record.intent === intent);
        return [
          intent,
          {
            responses: items.length,
            met: items.filter((record) => record.met === 'yes').length,
            useful: items.filter((record) => record.met === 'yes' && record.useful === 'yes')
              .length,
            somewhatUseful: items.filter(
              (record) => record.met === 'yes' && record.useful === 'somewhat',
            ).length,
            uncomfortable: items.filter((record) => record.comfortable === 'no').length,
          },
        ];
      }),
    ),
    limits:
      'Self-selected feedback, repeated responses and unverified meetings cannot establish population efficacy or safety.',
  };
}
