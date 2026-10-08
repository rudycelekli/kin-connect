import type { Intent, Match, OwnerProfile, SearchResult } from '../../shared/types.js';
import { toPublicPerson } from '../domain/entities/index.js';
import {
  assessOpportunity,
  createIntroductionBrief,
  toPolicyCard,
  runNegotiation,
  simulateConversation,
} from '../domain/services/index.js';
import { ownerProfileSchema, validateProfile } from '../domain/value-objects/index.js';
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
  const pool = supplied
    .map((candidate) => ownerProfileSchema.safeParse(candidate))
    .filter((candidate) => !candidate.success || candidate.data.id !== owner.id);
  const identityCounts = new Map<string, number>();
  for (const candidate of pool)
    if (candidate.success)
      identityCounts.set(candidate.data.id, (identityCounts.get(candidate.data.id) ?? 0) + 1);
  const matches: Match[] = [];
  for (const [index, peer] of pool.entries()) {
    // Ambiguous identity records cannot share proposal IDs or consent state.
    if (!peer.success || identityCounts.get(peer.data.id)! > 1) continue;
    const match = negotiate(owner, peer.data, intent, index);
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
  const ranking = assessOpportunity(owner, peer, intent);
  if (!ranking.eligible) return null;
  const negotiation = runNegotiation(owner, peer, intent);
  if (!negotiation.accepted) return null;
  const { commonAvailability, sharedInterests, sharedValues, sameCity, score } = ranking;
  const reasons: string[] =
    ranking.career?.connections.map((connection) => connection.reason) ?? [];
  if (sharedInterests.length)
    reasons.push(
      `${sharedInterests.length} shared interest${sharedInterests.length === 1 ? '' : 's'} to start a conversation`,
    );
  if (sharedValues.length)
    reasons.push(
      `${sharedValues.length} shared value${sharedValues.length === 1 ? '' : 's'} for common ground`,
    );
  if (sameCity) reasons.push(`Both in ${peer.city}`);
  else reasons.push('Different cities: start with an online conversation');
  reasons.push(
    ranking.career
      ? 'Ranking weighs complementary career goals, shared topics, and values from both people’s selections'
      : 'Ranking weighs shared interests and values from both people’s selected lists',
  );
  reasons.push('Both owners’ hard requirements passed');
  reasons.push('A shared window to meet');
  const proposal = negotiation.exchange.find((message) => message.type === 'meeting-proposal');
  if (!proposal || proposal.type !== 'meeting-proposal') return null;
  const plan = proposal.plan;
  const slot = plan.availability;
  return {
    id: `match-${owner.id}-${peer.id}-${intent}`,
    person: toPublicPerson(peer, variant),
    intent,
    score,
    ranking,
    introduction: createIntroductionBrief({
      intent,
      sharedInterests,
      sharedValues,
      slot,
      context: { owner: toPolicyCard(owner), peer: toPolicyCard(peer), plan },
    }),
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
