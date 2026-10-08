import { z } from 'zod';

const workedLabels = {
  'shared-topics': 'I enjoyed having shared topics.',
  'complementary-goals': 'I enjoyed exploring complementary goals.',
  'clear-beginning': 'A clear first conversation helped me.',
  'comfortable-pace': 'The pace felt comfortable to me.',
} as const;
const changeLabels = {
  'shorter-beginning': 'I would prefer a shorter first conversation.',
  'clearer-goal': 'I would prefer a clearer shared purpose.',
  'more-common-topics': 'I would like more common topics to explore.',
  'more-variety': 'I would like to explore a wider variety of topics.',
  'slower-pace': 'I would prefer a slower introduction pace.',
} as const;
const distinct = (values: string[]) => new Set(values).size === values.length;
const reflectionSchema = z
  .object({
    source: z.enum(['live-owner-self-report', 'fictional-demo-feedback']),
    intent: z.enum(['friendship', 'dating', 'collaboration']),
    worked: z
      .array(
        z.enum(
          Object.keys(workedLabels) as [
            keyof typeof workedLabels,
            ...Array<keyof typeof workedLabels>,
          ],
        ),
      )
      .max(3)
      .refine(distinct),
    change: z
      .array(
        z.enum(
          Object.keys(changeLabels) as [
            keyof typeof changeLabels,
            ...Array<keyof typeof changeLabels>,
          ],
        ),
      )
      .max(3)
      .refine(distinct),
  })
  .strict()
  .refine((value) => value.worked.length + value.change.length > 0)
  .refine(
    (value) =>
      !(value.change.includes('more-common-topics') && value.change.includes('more-variety')),
  );
export type OwnerReflectionInput = z.infer<typeof reflectionSchema>;
export interface OwnerReflectionPreview {
  readonly text: string;
  readonly processing: 'selected-current-conversation-ai';
}
const drafts = new WeakMap<OwnerReflectionPreview, { createdAt: number }>();
const PREVIEW_LIFETIME_MS = 5 * 60_000;

/** Strict selected self-reflection only. No peer information, free text or transcript. */
export function prepareOwnerReflection(
  input: OwnerReflectionInput,
  now = Date.now(),
): OwnerReflectionPreview {
  const facts = reflectionSchema.parse(input);
  if (!Number.isFinite(now) || now < 0) throw new Error('Invalid reflection clock.');
  const text = [
    'Help me reflect on my own Kin connection preferences.',
    'I reviewed and chose to share this summary with the AI in this conversation and its provider.',
    facts.source === 'fictional-demo-feedback'
      ? 'This is feedback about a fictional demo, not an actual human meeting.'
      : 'This is my voluntary self-report, not an independently verified outcome.',
    `My selected intention: ${facts.intent}.`,
    ...facts.worked.map((tag) => workedLabels[tag]),
    ...facts.change.map((tag) => changeLabels[tag]),
    'Ask a useful follow-up question and suggest editable preferences for my review.',
    'Do not infer sensitive traits, judge the other person, or claim that my feedback proves effectiveness.',
    'Do not change hard requirements, publish information, contact anyone, or approve an introduction. I decide what to save.',
  ].join('\n');
  const preview = Object.freeze({ text, processing: 'selected-current-conversation-ai' as const });
  drafts.set(preview, { createdAt: now });
  return preview;
}

/** Only prepares a shared-MCP Apps ui/message argument; never invokes a host or persists data. */
export function approveOwnerReflection(
  preview: OwnerReflectionPreview,
  approval: { approved: true; reviewedText: string },
  now = Date.now(),
): { role: 'user'; content: [{ type: 'text'; text: string }] } {
  const draft = drafts.get(preview);
  const accepted = z
    .object({ approved: z.literal(true), reviewedText: z.string().max(2400) })
    .strict()
    .safeParse(approval);
  if (
    !draft ||
    !accepted.success ||
    accepted.data.reviewedText !== preview.text ||
    !Number.isFinite(now) ||
    now < draft.createdAt ||
    now - draft.createdAt >= PREVIEW_LIFETIME_MS
  )
    throw new Error('Review a fresh reflection and explicitly approve its exact text.');
  drafts.delete(preview);
  const content: [{ type: 'text'; text: string }] = [
    Object.freeze({ type: 'text', text: preview.text }),
  ];
  Object.freeze(content);
  return Object.freeze({ role: 'user', content });
}
export function discardOwnerReflection(preview: OwnerReflectionPreview): void {
  drafts.delete(preview);
}
