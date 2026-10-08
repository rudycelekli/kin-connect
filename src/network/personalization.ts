import { z } from 'zod';
import { agentCapsuleSchema } from '../shared/agent-capsule.js';
import type { Intent } from '../shared/types.js';
import {
  shortlistCapsules,
  type CapsuleShortlistInput,
  type CapsuleSuggestion,
} from './discovery.js';
import { interestKey, interestSchema } from '../matchmaking/domain/value-objects/index.js';

export const OWNER_PREFERENCES_VERSION = 'kin-owner-preferences/0.1' as const;
export const MAX_PREFERENCE_CONTRIBUTION = 10;

const fields = {
  version: z.literal(OWNER_PREFERENCES_VERSION),
  intent: z.enum(['friendship', 'dating', 'collaboration']),
  preferredInterests: z.array(interestSchema).max(12),
  lessPreferredInterests: z.array(interestSchema).max(12),
};
type LabelPreferences = {
  preferredInterests: string[];
  lessPreferredInterests: string[];
};
function validateLabels(value: LabelPreferences, context: z.RefinementCtx): void {
  const labels = [...value.preferredInterests, ...value.lessPreferredInterests];
  if (labels.length > 12)
    context.addIssue({ code: 'custom', message: 'Choose at most twelve priorities in total.' });
  if (new Set(labels.map(interestKey)).size !== labels.length)
    context.addIssue({
      code: 'custom',
      message: 'Each normalized interest can have exactly one priority.',
    });
}
const inputSchema = z
  .object({
    intent: fields.intent,
    preferredInterests: fields.preferredInterests,
    lessPreferredInterests: fields.lessPreferredInterests,
  })
  .strict()
  .superRefine(validateLabels);
const proposalSchema = z
  .object({ ...fields, reviewRequired: z.literal(true) })
  .strict()
  .superRefine(validateLabels);
const approvedSchema = z
  .object({ ...fields, approved: z.literal(true) })
  .strict()
  .superRefine(validateLabels);

export type OwnerPreferenceProposal = z.infer<typeof proposalSchema>;
export type ApprovedOwnerPreferences = z.infer<typeof approvedSchema>;
export interface PersonalizedCapsuleSuggestion extends CapsuleSuggestion {
  baselineScore: number;
  /** Requested local contribution before the score is clamped to zero through one hundred. */
  preferenceContribution: number;
  effectivePreferenceContribution: number;
  personalization?: {
    intent: Intent;
    preferredMatches: string[];
    lessPreferredMatches: string[];
    scope: 'owner-approved-local-label-priorities';
    learnedModel: false;
  };
}

/**
 * A proposal contains only explicitly selected labels. Free-text/model feedback interpretation is
 * unimplemented: chats, rejections, ratings and self-reports never produce priorities here.
 */
export function proposeOwnerPreferences(input: unknown): OwnerPreferenceProposal {
  return proposalSchema.parse({
    ...inputSchema.parse(input),
    version: OWNER_PREFERENCES_VERSION,
    reviewRequired: true,
  });
}

/**
 * Call only after the owner reviews this exact proposal. The literal confirmation is a caller
 * boundary, not cryptographic proof of human consent; hosts must collect the real owner's action.
 * It approves local label priorities, never a connection, disclosure or private eligibility gate.
 */
export function approveOwnerPreferences(
  proposal: unknown,
  confirmation: unknown,
): ApprovedOwnerPreferences {
  z.literal(true).parse(confirmation);
  const reviewed = proposalSchema.parse(proposal);
  return approvedSchema.parse({
    version: reviewed.version,
    intent: reviewed.intent,
    preferredInterests: reviewed.preferredInterests,
    lessPreferredInterests: reviewed.lessPreferredInterests,
    approved: true,
  });
}

const round = (value: number) => Math.round(value * 100) / 100;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Re-rank the existing, at-most-ten capsule shortlist, using only its public interest declarations.
 * Upstream callers still authenticate directory signatures before calling: normalization, schemas
 * and ranks are not identity authentication. shortlistCapsules preserves its blocks, self/intent
 * exclusions and ambiguous-identity rejection. No preferences can add excluded candidates.
 *
 * Priorities are optional and intention-specific. Reset by omitting them. This pure function stores
 * nothing, leaves original interests and baseline scores intact, and grants no approval capability.
 * Contributions are bounded +/-10 relevance points, not outcome probabilities. Prediction quality,
 * personalization improvement and real-user outcomes are unmeasured; no global model is learned.
 */
export function personalizeCapsuleShortlist(input: {
  discovery: CapsuleShortlistInput;
  preferences?: ApprovedOwnerPreferences;
}): PersonalizedCapsuleSuggestion[] {
  const request = z
    .object({ discovery: z.unknown(), preferences: approvedSchema.optional() })
    .strict()
    .parse(input);
  const discovery = request.discovery as CapsuleShortlistInput;
  const baseline = shortlistCapsules(discovery);
  const preferences =
    request.preferences?.intent === discovery.intent ? request.preferences : undefined;

  return baseline
    .map((suggestion): PersonalizedCapsuleSuggestion => {
      const unchanged = {
        ...suggestion,
        baselineScore: suggestion.score,
        preferenceContribution: 0,
        effectivePreferenceContribution: 0,
      };
      if (!preferences) return unchanged;
      // Only IDs already accepted by the shortlist are read. Ambiguous IDs cannot reach this point.
      const peer = discovery.peers.find(
        (candidate) =>
          candidate &&
          typeof candidate.id === 'string' &&
          candidate.id.trim().toLowerCase() === suggestion.peerId,
      );
      const capsule = agentCapsuleSchema.parse(peer?.capsule);
      const declarations = new Set(capsule.interests.map(interestKey));
      const preferredMatches = preferences.preferredInterests.filter((label) =>
        declarations.has(interestKey(label)),
      );
      const lessPreferredMatches = preferences.lessPreferredInterests.filter((label) =>
        declarations.has(interestKey(label)),
      );
      const fraction = (matches: string[], choices: string[]) =>
        choices.length ? matches.length / choices.length : 0;
      const contribution = round(
        MAX_PREFERENCE_CONTRIBUTION *
          (fraction(preferredMatches, preferences.preferredInterests) -
            fraction(lessPreferredMatches, preferences.lessPreferredInterests)),
      );
      const score = round(Math.min(100, Math.max(0, suggestion.score + contribution)));
      return {
        ...unchanged,
        score,
        preferenceContribution: contribution,
        effectivePreferenceContribution: round(score - suggestion.score),
        reasons: [
          ...suggestion.reasons,
          `Owner-reviewed ${preferences.intent} topic priorities contribute ${contribution} relevance points before score clamping; these are not private requirements or an outcome prediction.`,
        ],
        personalization: {
          intent: preferences.intent,
          preferredMatches,
          lessPreferredMatches,
          scope: 'owner-approved-local-label-priorities',
          learnedModel: false,
        },
      };
    })
    .sort((a, b) => b.score - a.score || compare(a.peerId, b.peerId));
}
