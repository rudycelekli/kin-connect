import { z } from 'zod';
import type { Availability, Intent, Match } from '../../../shared/types.js';
import { AVAILABILITY_LABELS, VALUES } from '../../../shared/types.js';
import {
  containsRecognizableContact,
  interestKey,
  interestSchema,
  normalizedCity,
  ownerProfileSchema,
} from '../value-objects/index.js';
import type { PolicyCard } from './agent-protocol.js';
import { assessCareerGoals, isCareerGoal, type CareerGoal } from './career-goals.js';
import { commonGround, sameDeclaredSet } from './common-ground.js';
import { proposeMeeting } from './meeting-plan.js';
import principles from '../../../../knowledge/connection-principles.json' with { type: 'json' };

export interface IntroductionBrief {
  headline: string;
  why: string[];
  idea: { title: string; detail: string };
  questions: string[];
  boundary: string;
  principleIds: string[];
}
export interface IntroductionContext {
  owner: PolicyCard;
  peer: PolicyCard;
  plan?: Match['plan'];
}
export interface IntroductionBriefInput {
  intent: Intent;
  sharedInterests: string[];
  sharedValues: string[];
  slot: Availability;
  peerAlias?: string;
  context?: IntroductionContext;
}

// Build the same public allowlist from shared validators without a runtime import
// of agent-protocol: agents call this service, so that import would create a cycle.
const fields = ownerProfileSchema.shape;
const contextCardSchema = z
  .object({
    id: fields.id,
    name: fields.name,
    agentName: fields.agentName,
    age: fields.age,
    city: fields.city,
    gender: fields.gender,
    intents: fields.intents,
    smoking: fields.smoking,
    interests: fields.interests,
    values: fields.values,
    availability: fields.availability,
    energy: fields.energy,
  })
  .strict();
const publicPlanText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((text) => !containsRecognizableContact(text));
const contextSchema = z
  .object({
    owner: contextCardSchema,
    peer: contextCardSchema,
    plan: z
      .object({
        title: publicPlanText(200),
        detail: publicPlanText(600),
        availability: z.enum(['weekday-evenings', 'weekends', 'weekday-days']),
      })
      .strict()
      .optional(),
  })
  .strict();
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
    context: contextSchema.optional(),
  })
  .strict();

const careerQuestions: Record<CareerGoal, readonly [string, string]> = {
  'Career: peer learning': [
    'What question would make a short learning session useful?',
    'What could we try together without making a larger commitment?',
  ],
  'Career: find a mentor': [
    'What learning question would I like to explore, and what support would help?',
    'What experience, time and boundaries should we clarify before considering mentorship?',
  ],
  'Career: offer mentorship': [
    'What support am I willing to discuss, and within what limits?',
    'What learning question and expectations should we clarify before considering mentorship?',
  ],
  'Career: explore jobs': [
    'What kind of work am I interested in exploring?',
    'What should we clarify about any actual role and application process?',
  ],
  'Career: hiring': [
    'Is there an actual role I can describe, and what questions should we clarify?',
    'What would make a short work conversation useful before any next step?',
  ],
  'Career: find a cofounder': [
    'What small problem could we sketch together?',
    'What would we each want to learn before considering a partnership?',
  ],
  'Career: raise funding': [
    'What project question and information would I want to discuss?',
    'What should we clarify before considering a funding conversation further?',
  ],
  'Career: investing': [
    'What information would help me decide whether another conversation is useful?',
    'What scope and boundaries should we clarify without implying funding or a deal?',
  ],
};

/** Design hypotheses informed by research; no chemistry, identity or success prediction. */
export function createIntroductionBrief(input: IntroductionBriefInput): IntroductionBrief {
  const facts = inputSchema.parse(input);
  const collaboration = facts.intent === 'collaboration';
  let declaredInterests = facts.sharedInterests;
  let declaredValues = facts.sharedValues;
  let peerAlias = facts.peerAlias;
  let canonicalPlan: Match['plan'] | undefined;
  let career;
  let differentCities = false;
  if (facts.context) {
    const { owner, peer, plan } = facts.context;
    if (
      owner.id === peer.id ||
      !owner.intents.includes(facts.intent) ||
      !peer.intents.includes(facts.intent)
    )
      throw new Error('Introduction context requires two owners with the declared intention.');
    const ground = commonGround(owner, peer);
    if (
      !sameDeclaredSet(facts.sharedInterests, ground.sharedInterests, interestKey) ||
      !sameDeclaredSet(facts.sharedValues, ground.sharedValues)
    )
      throw new Error('Introduction facts must equal the complete declared common ground.');
    if (!ground.commonAvailability.includes(facts.slot))
      throw new Error('Introduction window must be available to both owners.');
    if (peerAlias !== undefined && peerAlias !== peer.agentName)
      throw new Error('Introduction alias must match the declared peer agent.');
    peerAlias = peer.agentName;
    declaredInterests = ground.sharedInterests;
    declaredValues = ground.sharedValues;
    differentCities = normalizedCity(owner.city) !== normalizedCity(peer.city);
    canonicalPlan = proposeMeeting(facts.intent, ground.sharedInterests, facts.slot, {
      sameCity: !differentCities,
      declaredInterests: { owner: owner.interests, peer: peer.interests },
    });
    if (
      plan &&
      (plan.title !== canonicalPlan.title ||
        plan.detail !== canonicalPlan.detail ||
        plan.availability !== canonicalPlan.availability)
    )
      throw new Error('Introduction plan must match the canonical negotiated proposal.');
    if (collaboration) {
      career = assessCareerGoals(owner.interests, peer.interests).connections[0];
      declaredInterests = declaredInterests.filter((label) => !isCareerGoal(label));
    }
  }
  const first = declaredInterests[0];
  const shared = declaredInterests.slice(0, 3).join(', ');
  const why = [
    ...(career ? [career.reason] : []),
    ...(shared ? [`Your agents found shared interests in ${shared}.`] : []),
    ...(declaredValues.length
      ? [`You both selected ${declaredValues.slice(0, 2).join(' and ')} as values.`]
      : []),
    `You have a shared window: ${AVAILABILITY_LABELS[facts.slot].toLowerCase()}.`,
    ...(differentCities
      ? ['Your declared cities differ; start online before making travel plans.']
      : []),
  ];
  const idea = canonicalPlan
    ? { title: canonicalPlan.title, detail: canonicalPlan.detail }
    : collaboration
      ? {
          title: declaredInterests.some((label) => interestKey(label) === 'technology')
            ? 'Sketch a tiny prototype together'
            : 'Two ideas. One small experiment.',
          detail: `Try a 25-minute conversation${first ? ` around ${first}` : ''}. Each bring one problem or idea, ask a follow-up question, and sketch one small experiment. Choose a next step only if it feels useful to both of you.`,
        }
      : {
          title: first ? `A first hello around ${first}` : 'A little room for a good conversation',
          detail:
            'Choose a public place and a short first meeting together. Trade one thing you enjoy, listen to their answer, and decide whether you would both like another conversation.',
        };
  const questions = [
    first ? `What got you curious about ${first}?` : 'What have you enjoyed exploring lately?',
    collaboration
      ? 'What would make a small collaboration useful for each of us?'
      : 'What would make this first hello comfortable for each of us?',
    'What would you like me to ask more about?',
  ];
  return {
    headline: peerAlias
      ? `You and ${peerAlias}: a beginning worth exploring.`
      : 'A beginning worth exploring.',
    why,
    idea,
    questions: career
      ? [...careerQuestions[career.ownerGoal]]
      : facts.context
        ? questions.slice(0, 2)
        : questions,
    boundary: `${career ? 'Goal labels are self-selected, not verified roles or credentials. ' : ''}A suggestion to explore, not a prediction of chemistry or success. You can skip any question, decline, or end the conversation. Both people still choose.`,
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
