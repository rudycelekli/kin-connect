import type { Intent, Match, OwnerProfile, SearchResult } from '../../shared/types.js';
import { toPublicPerson } from '../domain/entities/index.js';
import { proposeMeeting, runNegotiation, simulateConversation } from '../domain/services/index.js';
import {
  normalizedCity,
  ownerProfileSchema,
  validateProfile,
  interestKey,
} from '../domain/value-objects/index.js';
import { FictionalCandidateRepository } from '../infrastructure/index.js';

const candidates = new FictionalCandidateRepository();

/** Exported as application demo data; no infrastructure class is in the public API. */
export const FIXTURES = candidates.listCandidates();

export function demoProfile(): OwnerProfile {
  return {
    id: 'owner-demo',
    name: 'Alex',
    age: 29,
    city: 'New York',
    agentName: 'Nova',
    bio: 'A little art, a good book, a long walk. Looking for people to share the small good things with.',
    gender: 'nonbinary',
    intents: ['friendship', 'dating', 'collaboration'],
    interests: ['Art & design', 'Coffee', 'Books', 'Hiking'],
    values: ['Curiosity', 'Kindness', 'Creativity'],
    availability: ['weekday-evenings', 'weekends'],
    energy: 'balanced',
    requirements: {
      minAge: 25,
      maxAge: 36,
      sameCity: true,
      nonsmoker: true,
      datingGenders: ['woman', 'nonbinary'],
    },
    smoking: false,
    boundaries:
      'Keep my private notes and contact information private. Ask me before any introduction.',
    paused: false,
  };
}

/** No model calls. Hard constraints are evaluated before a deterministic ranking. */
export function discover(input: OwnerProfile, intent: Intent): SearchResult {
  return discoverWithCandidates(input, intent, candidates.listCandidates());
}

/** Adapter seam for independently supplied owner-agent profiles. No fixture coupling. */
export function discoverWithCandidates(
  input: OwnerProfile,
  intent: Intent,
  supplied: readonly OwnerProfile[],
): SearchResult {
  const owner = validateProfile(input);
  if (!['friendship', 'dating', 'collaboration'].includes(intent))
    throw new Error('Unknown introduction intention.');
  const pool = supplied.filter((candidate) => candidate.id !== owner.id);
  const matches: Match[] = [];
  for (const [index, peer] of pool.entries()) {
    const match = negotiate(owner, peer, intent, index);
    if (match) matches.push(match);
  }
  matches.sort((a, b) => b.score - a.score || a.person.id.localeCompare(b.person.id));
  return { matches, considered: pool.length, excluded: pool.length - matches.length };
}

/** Two private owner agents negotiate over local JSON. Returns an unapproved suggestion. */
export function negotiate(
  input: OwnerProfile,
  candidate: OwnerProfile,
  intent: Intent,
  variant = 0,
): Match | null {
  const owner = validateProfile(input);
  if (!['friendship', 'dating', 'collaboration'].includes(intent))
    throw new Error('Unknown introduction intention.');
  const parsedPeer = ownerProfileSchema.safeParse(candidate);
  if (!parsedPeer.success) return null;
  const peer = parsedPeer.data as OwnerProfile;
  const negotiation = runNegotiation(owner, peer, intent);
  if (!negotiation.accepted) return null;
  const commonAvailability = owner.availability.filter((slot) => peer.availability.includes(slot));
  const sharedInterests = owner.interests.filter((interest) =>
    peer.interests.some((label) => interestKey(label) === interestKey(interest)),
  );
  const sharedValues = owner.values.filter((value) => peer.values.includes(value));
  const sameCity = normalizedCity(owner.city) === normalizedCity(peer.city);
  const energyScore =
    owner.energy === peer.energy
      ? 3
      : owner.energy === 'balanced' || peer.energy === 'balanced'
        ? 2
        : 0;
  const score =
    52 +
    Math.min(sharedInterests.length * 6, 24) +
    Math.min(sharedValues.length * 4, 12) +
    Math.min(commonAvailability.length * 2, 4) +
    (sameCity ? 3 : 0) +
    energyScore;
  const reasons: string[] = [];
  if (sharedInterests.length)
    reasons.push(
      `${sharedInterests.length} shared interest${sharedInterests.length === 1 ? '' : 's'} to start a conversation`,
    );
  if (sharedValues.length)
    reasons.push(
      `${sharedValues.length} shared value${sharedValues.length === 1 ? '' : 's'} for common ground`,
    );
  if (sameCity) reasons.push(`Both in ${peer.city}`);
  reasons.push('Both owners’ hard requirements passed');
  reasons.push('A shared window to meet');
  const slot = commonAvailability[0];
  const plan = proposeMeeting(intent, sharedInterests, slot);
  return {
    id: `match-${owner.id}-${peer.id}-${intent}`,
    person: toPublicPerson(peer, variant),
    intent,
    score,
    reasons,
    sharedInterests,
    sharedValues,
    commonAvailability,
    messages: simulateConversation(
      owner,
      peer,
      intent,
      sharedInterests,
      sharedValues,
      slot,
      plan,
      negotiation.exchange,
    ),
    plan,
    state: 'suggested',
    ownerApproved: false,
    peerApproved: false,
  };
}
