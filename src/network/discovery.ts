import { z } from 'zod';
import { agentCapsuleSchema, agentRegistrationIdSchema } from '../shared/agent-capsule.js';
import type { NetworkIdentity } from '../shared/network-types.js';
import type { Intent } from '../shared/types.js';
import { interestKey, interestSchema } from '../matchmaking/domain/value-objects/index.js';
import {
  assessCareerGoals,
  isCareerGoal,
  type CareerGoalAssessment,
} from '../matchmaking/domain/services/career-goals.js';

export const CAPSULE_SCORE_MEANING =
  'declared-capsule-relevance-not-private-eligibility-or-outcome-probability' as const;

export interface CapsuleShortlistInput {
  ownerId: string;
  intent: Intent;
  interests: string[];
  peers: NetworkIdentity[];
  blockedPeerIds: string[];
  limit: number;
}

export interface CapsuleSuggestion {
  peerId: string;
  score: number;
  scoreMeaning: typeof CAPSULE_SCORE_MEANING;
  reasons: string[];
  sharedInterests: string[];
  career?: CareerGoalAssessment;
}

const idSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-f0-9]{64}$/);
const interestsSchema = z
  .array(interestSchema)
  .max(12)
  .refine(
    (labels) => new Set(labels.map(interestKey)).size === labels.length,
    'Choose each interest once, regardless of capitalization.',
  );
const inputSchema = z
  .object({
    ownerId: idSchema,
    intent: z.enum(['friendship', 'dating', 'collaboration']),
    interests: interestsSchema,
    peers: z.array(z.unknown()).max(200),
    blockedPeerIds: z.array(idSchema).max(2000),
    limit: z.number().int().min(1).max(10),
  })
  .strict();
// Strip everything outside the public capsule; authentication remains an upstream boundary.
const peerSchema = z.object({
  id: idSchema,
  registrationId: agentRegistrationIdSchema,
  capsule: agentCapsuleSchema,
});
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const round = (value: number) => Math.round(value * 100) / 100;
const harmonic = (a: number, b: number) => (a + b === 0 ? 0 : (2 * a * b) / (a + b));

function sharedLabels(first: string[], second: string[]): string[] {
  const peer = new Map(second.map((label) => [interestKey(label), label]));
  return first
    .filter((label) => peer.has(interestKey(label)))
    .map((label) => {
      const other = peer.get(interestKey(label))!;
      return compare(label, other) <= 0 ? label : other;
    })
    .sort((a, b) => compare(interestKey(a), interestKey(b)));
}

/**
 * Pure relevance shortlist of owner-selected public declarations, not eligibility or identity proof.
 * Callers authenticate identities before use. Private policy negotiation and separate human approvals
 * are still required; this function never reads private profiles or initiates a conversation.
 */
export function shortlistCapsules(input: CapsuleShortlistInput): CapsuleSuggestion[] {
  const facts = inputSchema.parse(input);
  const blocked = new Set(facts.blockedPeerIds);
  const ids = facts.peers.map((peer) => {
    if (!peer || typeof peer !== 'object' || Array.isArray(peer)) return undefined;
    const parsed = idSchema.safeParse((peer as { id?: unknown }).id);
    return parsed.success ? parsed.data : undefined;
  });
  const counts = new Map<string, number>();
  for (const id of ids) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  const suggestions: CapsuleSuggestion[] = [];
  for (const [index, raw] of facts.peers.entries()) {
    const id = ids[index];
    // Count identity ambiguity before capsule validation: a malformed copy cannot erase a conflict.
    if (!id || counts.get(id) !== 1 || id === facts.ownerId || blocked.has(id)) continue;
    const parsed = peerSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.capsule.intents.includes(facts.intent)) continue;
    const labels = parsed.data.capsule.interests;
    const sharedInterests = sharedLabels(facts.interests, labels);
    const assessment =
      facts.intent === 'collaboration' && facts.interests.length && labels.length
        ? assessCareerGoals(facts.interests, labels)
        : undefined;
    const career =
      assessment && (assessment.ownerGoalCount > 0 || assessment.peerGoalCount > 0)
        ? assessment
        : undefined;
    const ownerTopics = career
      ? facts.interests.filter((label) => !isCareerGoal(label))
      : facts.interests;
    const peerTopics = career ? labels.filter((label) => !isCareerGoal(label)) : labels;
    const sharedTopics = career
      ? sharedInterests.filter((label) => !isCareerGoal(label))
      : sharedInterests;
    const topicalWeight = career ? 50 : 100;
    const topical = round(
      topicalWeight *
        harmonic(
          ownerTopics.length ? sharedTopics.length / ownerTopics.length : 0,
          peerTopics.length ? sharedTopics.length / peerTopics.length : 0,
        ),
    );
    const careerContribution = career
      ? round(50 * harmonic(career.ownerCoverage, career.peerCoverage))
      : 0;
    const reasons = [
      `Both selected ${facts.intent} as an intention; private requirements have not been checked.`,
      ...(sharedTopics.length
        ? [`Shared selected topics: ${sharedTopics.join(', ')}.`]
        : [
            'No shared public topics are declared; there may still be a conversation worth exploring.',
          ]),
      `Reciprocal topic coverage contributes ${topical} of ${topicalWeight} available relevance points.`,
      ...(career
        ? [
            ...career.connections.map((connection) => connection.reason),
            `Reciprocal declared career goals contribute ${careerContribution} of 50 available relevance points.`,
          ]
        : []),
      'Capsule relevance does not verify a role, predict an outcome, pass private requirements, or grant an introduction. Both people still decide.',
    ];
    suggestions.push({
      peerId: id,
      score: round(topical + careerContribution),
      scoreMeaning: CAPSULE_SCORE_MEANING,
      reasons,
      sharedInterests,
      ...(career ? { career } : {}),
    });
  }
  return suggestions
    .sort((a, b) => b.score - a.score || compare(a.peerId, b.peerId))
    .slice(0, facts.limit);
}
