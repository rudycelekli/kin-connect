import { z } from 'zod';
import { interestKey, interestSchema } from '../value-objects/index.js';

/** Owner-entered soft goals, never proof of a role, credential or opportunity. */
export const CAREER_GOALS = Object.freeze([
  'Career: peer learning',
  'Career: find a mentor',
  'Career: offer mentorship',
  'Career: explore jobs',
  'Career: hiring',
  'Career: find a cofounder',
  'Career: raise funding',
  'Career: investing',
] as const);

export type CareerGoal = (typeof CAREER_GOALS)[number];
export type CareerConnectionKind =
  | 'peer-learning'
  | 'mentorship'
  | 'job-exploration'
  | 'cofounder'
  | 'funding';

export interface CareerGoalConnection {
  kind: CareerConnectionKind;
  ownerGoal: CareerGoal;
  peerGoal: CareerGoal;
  reason: string;
  title: string;
  detail: string;
  questions: string[];
}

export interface CareerGoalAssessment {
  ownerCoverage: number;
  peerCoverage: number;
  ownerGoalCount: number;
  peerGoalCount: number;
  ownerSupportedGoalCount: number;
  peerSupportedGoalCount: number;
  connections: CareerGoalConnection[];
}

const goalByKey = new Map(CAREER_GOALS.map((goal) => [interestKey(goal), goal]));

/** Use only for collaboration's soft topical coverage, after ordinary policy gates. */
export function isCareerGoal(label: string): boolean {
  return goalByKey.has(interestKey(label));
}

const interestsSchema = z
  .array(interestSchema)
  .min(1)
  .max(12)
  .refine(
    (items) => new Set(items.map(interestKey)).size === items.length,
    'Choose each interest once, regardless of capitalization.',
  );

function parseInterests(input: unknown): string[] {
  if (
    Array.isArray(input) &&
    Reflect.ownKeys(input).some(
      (key) =>
        typeof key !== 'string' ||
        (key !== 'length' && (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= input.length)),
    )
  )
    throw new TypeError('Provide an interest label array without extra fields.');
  return interestsSchema.parse(input);
}

interface ConnectionDefinition {
  kind: CareerConnectionKind;
  goals: readonly [CareerGoal, CareerGoal];
  title: string;
  detail: string;
  questions: readonly string[];
}

// Stable order and neutral text let either policy agent derive the same plan.
// A directional explanation changes with the owner; it adds no inferred facts.
const definitions: readonly ConnectionDefinition[] = [
  {
    kind: 'peer-learning',
    goals: ['Career: peer learning', 'Career: peer learning'],
    title: 'Learn one small thing together',
    detail:
      'Choose one question or practice exercise for a 20-minute session. Share what each person wants to learn, compare approaches, and choose a next step only if it is useful to both. The labels do not establish experience or promise a learning outcome.',
    questions: [
      'What question would make a short learning session useful?',
      'What could we try together without making a larger commitment?',
    ],
  },
  {
    kind: 'mentorship',
    goals: ['Career: find a mentor', 'Career: offer mentorship'],
    title: 'Explore a mentoring conversation',
    detail:
      'Use a 20-minute conversation to explore one learning question and what support might help. Clarify experience, scope, time and boundaries together. These labels do not verify expertise or establish a mentoring commitment.',
    questions: [
      'What learning question could we explore in a short first conversation?',
      'What experience and boundaries would we each want to understand first?',
    ],
  },
  {
    kind: 'job-exploration',
    goals: ['Career: explore jobs', 'Career: hiring'],
    title: 'Explore a possible work conversation',
    detail:
      'Spend 20 minutes discussing an area of work and what each person hopes to learn. Clarify whether an actual role exists, its requirements and any next steps. The labels do not establish a vacancy, an application, or a job offer.',
    questions: [
      'What area of work would make this conversation useful?',
      'What should we clarify before either person takes a next step?',
    ],
  },
  {
    kind: 'cofounder',
    goals: ['Career: find a cofounder', 'Career: find a cofounder'],
    title: 'Try a small working session',
    detail:
      'Spend 25 minutes sketching one problem and a small experiment. Discuss how each person prefers to work and decide whether another session would help. This is exploratory; the labels do not establish skills, ownership, partnership, or a commitment.',
    questions: [
      'What small problem could we sketch together?',
      'What would we each want to learn before considering a partnership?',
    ],
  },
  {
    kind: 'funding',
    goals: ['Career: raise funding', 'Career: investing'],
    title: 'Explore a funding question',
    detail:
      'Use a 20-minute conversation to describe one project question and what information would help each person decide whether to talk again. The labels do not verify investor status, promise funding, establish a deal, or provide investment advice.',
    questions: [
      'What project question would make this conversation useful?',
      'What information and boundaries should we clarify before any next step?',
    ],
  },
];

/** Exact declared labels only. This assessment grants no contact or consent capability. */
export function assessCareerGoals(
  firstInterests: unknown,
  secondInterests: unknown,
): CareerGoalAssessment {
  const selectedGoals = (input: unknown) =>
    new Set(
      parseInterests(input)
        .map((label) => goalByKey.get(interestKey(label)))
        .filter((goal): goal is CareerGoal => goal !== undefined),
    );
  const ownerGoals = selectedGoals(firstInterests);
  const peerGoals = selectedGoals(secondInterests);
  const connections: CareerGoalConnection[] = [];
  const connect = (
    definition: ConnectionDefinition,
    ownerGoal: CareerGoal,
    peerGoal: CareerGoal,
  ) => {
    if (!ownerGoals.has(ownerGoal) || !peerGoals.has(peerGoal)) return;
    connections.push({
      kind: definition.kind,
      ownerGoal,
      peerGoal,
      reason: `You selected “${ownerGoal}”; your peer selected “${peerGoal}”. These declared goals support an optional conversation, not a verified role or promised outcome.`,
      title: definition.title,
      detail: definition.detail,
      questions: [...definition.questions],
    });
  };
  for (const definition of definitions) {
    const [first, second] = definition.goals;
    connect(definition, first, second);
    if (first !== second) connect(definition, second, first);
  }
  const ownerSupportedGoalCount = new Set(connections.map((connection) => connection.ownerGoal))
    .size;
  const peerSupportedGoalCount = new Set(connections.map((connection) => connection.peerGoal)).size;
  return {
    ownerCoverage: ownerGoals.size ? ownerSupportedGoalCount / ownerGoals.size : 0,
    peerCoverage: peerGoals.size ? peerSupportedGoalCount / peerGoals.size : 0,
    ownerGoalCount: ownerGoals.size,
    peerGoalCount: peerGoals.size,
    ownerSupportedGoalCount,
    peerSupportedGoalCount,
    connections,
  };
}
