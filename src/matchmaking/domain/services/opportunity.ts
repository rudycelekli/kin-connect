import type { Intent, OwnerProfile } from '../../../shared/types.js';
import { normalizedCity, ownerProfileSchema } from '../value-objects/index.js';
import { evaluateEligibility } from './policy.js';
import { commonGround } from './common-ground.js';

export const OPPORTUNITY_VERSION = 'kin-opportunity/0.2' as const;
type Signal = 'interests' | 'values' | 'availability' | 'location' | 'energy';
// Product hypotheses, not learned or scientifically calibrated weights.
const weights: Record<Intent, Record<Signal, number>> = {
  friendship: { interests: 40, values: 25, availability: 20, location: 10, energy: 5 },
  dating: { interests: 25, values: 40, availability: 20, location: 10, energy: 5 },
  collaboration: { interests: 50, values: 15, availability: 25, location: 5, energy: 5 },
};
export interface OpportunityAssessment {
  eligible: true;
  version: typeof OPPORTUNITY_VERSION;
  score: number;
  scoreMeaning: 'declared-opportunity-heuristic-not-outcome-probability';
  ownerScore: number;
  peerScore: number;
  signals: Array<{
    id: Signal;
    weight: number;
    ownerCoverage: number;
    peerCoverage: number;
    contribution: number;
  }>;
  sharedInterests: string[];
  sharedValues: string[];
  commonAvailability: OwnerProfile['availability'];
  sameCity: boolean;
  limits: string[];
}
export type OpportunityResult = OpportunityAssessment | { eligible: false; reason: string };
const round = (value: number) => Math.round(value * 100) / 100;
const harmonic = (a: number, b: number) => (a + b === 0 ? 0 : (2 * a * b) / (a + b));

/** Bilateral eligibility always precedes scoring. Nothing here grants consent. */
export function assessOpportunity(
  input: OwnerProfile,
  candidate: OwnerProfile,
  intent: Intent,
): OpportunityResult {
  if (!Object.hasOwn(weights, intent)) throw new Error('Unknown introduction intention.');
  const ownerInput = ownerProfileSchema.safeParse(input);
  const peerInput = ownerProfileSchema.safeParse(candidate);
  if (!ownerInput.success || !peerInput.success)
    return { eligible: false, reason: 'invalid-profile' };
  const owner = ownerInput.data;
  const peer = peerInput.data;
  const eligibility = evaluateEligibility(owner, peer, intent);
  if (!eligibility.accepted) return { eligible: false, reason: eligibility.reason };
  const ground = commonGround(owner, peer);
  const sameCity = normalizedCity(owner.city) === normalizedCity(peer.city);
  const energy =
    owner.energy === peer.energy
      ? 1
      : owner.energy === 'balanced' || peer.energy === 'balanced'
        ? 0.5
        : 0;
  const availability = Math.min(ground.commonAvailability.length, 2) / 2;
  const coverage: Record<Signal, [number, number]> = {
    interests: [
      ground.sharedInterests.length / owner.interests.length,
      ground.sharedInterests.length / peer.interests.length,
    ],
    values: [
      ground.sharedValues.length / owner.values.length,
      ground.sharedValues.length / peer.values.length,
    ],
    availability: [availability, availability],
    location: [sameCity ? 1 : 0, sameCity ? 1 : 0],
    energy: [energy, energy],
  };
  let ownerScore = 0;
  let peerScore = 0;
  const signals = (Object.keys(weights[intent]) as Signal[]).map((id) => {
    const weight = weights[intent][id];
    const [a, b] = coverage[id];
    ownerScore += weight * a;
    peerScore += weight * b;
    return {
      id,
      weight,
      ownerCoverage: round(a),
      peerCoverage: round(b),
      contribution: round(weight * harmonic(a, b)),
    };
  });
  return {
    eligible: true,
    version: OPPORTUNITY_VERSION,
    // Per-signal reciprocal coverage prevents strengths in one direction from hiding
    // missing common ground in another. Reported contributions sum to this score.
    score: round(signals.reduce((sum, signal) => sum + signal.contribution, 0)),
    scoreMeaning: 'declared-opportunity-heuristic-not-outcome-probability',
    ownerScore: round(ownerScore),
    peerScore: round(peerScore),
    signals,
    ...ground,
    sameCity,
    limits: [
      'Uses selected labels and broad availability, not verified interests or character.',
      'Intention weights are product hypotheses; no human-outcome calibration exists.',
      'Different interests can still make a useful connection. A low score does not make an eligible person ineligible.',
      'No inference from names, age, gender, private notes, or chat history enters the preference score.',
    ],
  };
}
