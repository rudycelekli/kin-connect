import { z } from 'zod';
import type { Availability, Intent } from '../../../shared/types.js';
import { AVAILABILITY_LABELS, VALUES } from '../../../shared/types.js';
import {
  containsRecognizableContact,
  interestKey,
  interestSchema,
} from '../value-objects/index.js';
import principles from '../../../../knowledge/connection-principles.json' with { type: 'json' };

export interface IntroductionBrief {
  headline: string;
  why: string[];
  idea: { title: string; detail: string };
  questions: string[];
  boundary: string;
  principleIds: string[];
}
const inputSchema = z
  .object({
    intent: z.enum(['friendship', 'dating', 'collaboration']),
    sharedInterests: z
      .array(interestSchema)
      .max(12)
      .refine((items) => new Set(items.map(interestKey)).size === items.length),
    sharedValues: z
      .array(z.enum(VALUES as [string, ...string[]]))
      .max(6)
      .refine((items) => new Set(items).size === items.length),
    slot: z.enum(['weekday-evenings', 'weekends', 'weekday-days']),
    peerAlias: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .refine((text) => !containsRecognizableContact(text))
      .optional(),
  })
  .strict();

/** Design hypotheses informed by research; no chemistry, identity or success prediction. */
export function createIntroductionBrief(input: {
  intent: Intent;
  sharedInterests: string[];
  sharedValues: string[];
  slot: Availability;
  peerAlias?: string;
}): IntroductionBrief {
  const facts = inputSchema.parse(input);
  const first = facts.sharedInterests[0];
  const shared = facts.sharedInterests.slice(0, 3).join(', ');
  const why = [
    ...(shared ? [`Your agents found shared interests in ${shared}.`] : []),
    ...(facts.sharedValues.length
      ? [`You both selected ${facts.sharedValues.slice(0, 2).join(' and ')} as values.`]
      : []),
    `You have a shared window: ${AVAILABILITY_LABELS[facts.slot].toLowerCase()}.`,
  ];
  const collaboration = facts.intent === 'collaboration';
  const idea = collaboration
    ? {
        title: facts.sharedInterests.some((label) => interestKey(label) === 'technology')
          ? 'Sketch a tiny prototype together'
          : 'Two ideas. One small experiment.',
        detail: `Try a 25-minute conversation${first ? ` around ${first}` : ''}. Each bring one problem or idea, ask a follow-up question, and sketch one small experiment. Choose a next step only if it feels useful to both of you.`,
      }
    : {
        title: first ? `A first hello around ${first}` : 'A little room for a good conversation',
        detail:
          'Choose a public place and a short first meeting together. Trade one thing you enjoy, listen to their answer, and decide whether you would both like another conversation.',
      };
  return {
    headline: facts.peerAlias
      ? `You and ${facts.peerAlias}: a beginning worth exploring.`
      : 'A beginning worth exploring.',
    why,
    idea,
    questions: [
      first ? `What got you curious about ${first}?` : 'What have you enjoyed exploring lately?',
      collaboration
        ? 'What would make a small collaboration useful for each of us?'
        : 'What would make this first hello comfortable for each of us?',
      'What would you like me to ask more about?',
    ],
    boundary:
      'A suggestion to explore, not a prediction of chemistry or success. You can skip any question, decline, or end the conversation. Both people still choose.',
    principleIds: [
      'reciprocal-curiosity',
      'responsive-listening',
      'shared-starting-point',
      'small-shared-task',
      'opportunity-not-prediction',
      'owner-agency',
    ].filter((id) => principles.some((rule: { id: string }) => rule.id === id)),
  };
}
