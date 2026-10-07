import type { Availability, Intent, OwnerProfile } from '../../../shared/types.js';
import { normalizedCity, ownerProfileSchema } from '../value-objects/index.js';

export type PolicyCheck = { accepted: true } | { accepted: false; reason: string };
export type Eligibility =
  | { accepted: true; commonAvailability: Availability[] }
  | { accepted: false; reason: string };
type DisclosedPolicyFacts = Pick<
  OwnerProfile,
  'id' | 'age' | 'city' | 'gender' | 'intents' | 'smoking'
>;

/** A policy agent checks its own owner's requirements, independently of the peer. */
export function evaluateOwnerPolicy(
  owner: OwnerProfile,
  peer: OwnerProfile,
  intent: Intent,
): PolicyCheck {
  if (!ownerProfileSchema.safeParse(owner).success || !ownerProfileSchema.safeParse(peer).success)
    return { accepted: false, reason: 'invalid-profile' };
  if (peer.paused) return { accepted: false, reason: 'paused' };
  return evaluateDisclosedPolicy(owner, peer, intent);
}

/** Internal rule evaluator. Callers validate owner and disclosed facts at their boundary. */
export function evaluateDisclosedPolicy(
  owner: OwnerProfile,
  peer: DisclosedPolicyFacts,
  intent: Intent,
): PolicyCheck {
  if (owner.paused) return { accepted: false, reason: 'paused' };
  if (owner.id === peer.id) return { accepted: false, reason: 'self' };
  if (!owner.intents.includes(intent) || !peer.intents.includes(intent))
    return { accepted: false, reason: 'intent' };
  if (peer.age < owner.requirements.minAge || peer.age > owner.requirements.maxAge)
    return { accepted: false, reason: 'age-range' };
  if (owner.requirements.sameCity && normalizedCity(owner.city) !== normalizedCity(peer.city))
    return { accepted: false, reason: 'city' };
  if (owner.requirements.nonsmoker && peer.smoking) return { accepted: false, reason: 'smoking' };
  if (intent === 'dating' && !owner.requirements.datingGenders.includes(peer.gender))
    return { accepted: false, reason: 'dating-gender' };
  return { accepted: true };
}

/** Both owners' hard requirements gate scoring; preferences can never override them. */
export function evaluateEligibility(
  owner: OwnerProfile,
  peer: OwnerProfile,
  intent: Intent,
): Eligibility {
  const ownerCheck = evaluateOwnerPolicy(owner, peer, intent);
  if (!ownerCheck.accepted) return ownerCheck;
  const peerCheck = evaluateOwnerPolicy(peer, owner, intent);
  if (!peerCheck.accepted) return peerCheck;
  const commonAvailability = owner.availability.filter((slot) => peer.availability.includes(slot));
  if (!commonAvailability.length) return { accepted: false, reason: 'availability' };
  return { accepted: true, commonAvailability };
}
