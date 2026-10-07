import {
  AVAILABILITY_LABELS,
  type AgentMessage,
  type Availability,
  type Intent,
  type Match,
  type OwnerProfile,
} from '../../../shared/types.js';
import { assessCareerGoals } from './career-goals.js';
import { evaluateOwnerPolicy } from './policy.js';
import { runNegotiation, type ProtocolMessage } from './agent-protocol.js';
export { proposeMeeting } from './meeting-plan.js';

function lowerList(items: string[]): string {
  return items.map((item) => item.toLowerCase()).join(', ');
}

/** Scripted, deterministic policy agents. This is not an LLM or live peer network. */
export function simulateConversation(
  owner: OwnerProfile,
  peer: OwnerProfile,
  intent: Intent,
  interests: string[],
  values: string[],
  slot: Availability,
  plan: Match['plan'],
  exchanged?: ProtocolMessage[],
): AgentMessage[] {
  const firstPolicy = evaluateOwnerPolicy(owner, peer, intent);
  const secondPolicy = evaluateOwnerPolicy(peer, owner, intent);
  if (!firstPolicy.accepted || !secondPolicy.accepted)
    throw new Error('A policy-rejected peer cannot enter the proposal protocol.');
  const exchange = exchanged ?? runNegotiation(owner, peer, intent).exchange;
  if (exchange.length !== 6 || exchange[5].type !== 'suggestion-ready')
    throw new Error('The agents did not complete a proposal handshake.');
  const career =
    intent === 'collaboration' ? assessCareerGoals(owner.interests, peer.interests) : undefined;
  const careerReason = career?.connections.map((connection) => connection.reason).join(' ');
  const lines: Array<[boolean, AgentMessage['kind'], string]> = [
    [
      true,
      'discover',
      `Policy-agent simulation: I represent ${owner.name} for ${intent}. I sent a kin/0.1 offer with only the facts needed to check an introduction.`,
    ],
    [
      false,
      'requirements',
      `I represent ${peer.name}. I independently checked my owner's hard requirements: passed. Your policy agent also returned passed. We share this intention; private requirements and notes stay private.`,
    ],
    [
      true,
      'interests',
      careerReason
        ? `${careerReason} These are declared goals, not verified credentials or commitments.`
        : interests.length
          ? `Our public cards overlap on ${lowerList(interests)}.${values.length ? ` We also share ${lowerList(values)}.` : ''} Those are conversation starters, not proof of chemistry.`
          : `No shared listed interests yet.${values.length ? ` Our owners share ${lowerList(values)}.` : ''} A short conversation could still be worthwhile.`,
    ],
    [
      false,
      'availability',
      `Both owners selected ${AVAILABILITY_LABELS[slot].toLowerCase()}. I propose that window only; it is availability, not a reservation.`,
    ],
    [
      true,
      'proposal',
      `Suggestion: ${plan.title}. ${plan.detail} I will ask ${owner.name} whether they want this introduction.`,
    ],
    [
      false,
      'decision',
      `Ready to show as a suggestion. ${peer.name}'s approval is still required separately. Neither agent has approved for an owner; no contact details have been shared.`,
    ],
  ];
  return lines.map(([outgoing, kind, text], index) => ({
    id: `msg-${owner.id}-${peer.id}-${intent}-${index + 1}`,
    from: outgoing ? owner.agentName : peer.agentName,
    to: outgoing ? peer.agentName : owner.agentName,
    kind,
    text,
    // Fixed simulation time makes the protocol reproducible, not a fabricated live event.
    at: `2026-10-07T12:00:${String(index).padStart(2, '0')}.000Z`,
  }));
}
