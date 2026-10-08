import { z } from 'zod';
import type { Availability, Intent, OwnerProfile } from '../../../shared/types.js';
import {
  interestKey,
  normalizedCity,
  ownerProfileSchema,
  validateProfile,
} from '../value-objects/index.js';
import { proposeMeeting } from './meeting-plan.js';
import { evaluateDisclosedPolicy } from './policy.js';
import { commonGround, sameDeclaredSet } from './common-ground.js';
import { createIntroductionBrief, type IntroductionBrief } from './introduction.js';

export const PROTOCOL_VERSION = 'kin/0.1' as const;

// Only the attributes required for bilateral policy and an explainable proposal.
// Freeform notes, private requirements, and contact fields are deliberately absent.
const fields = ownerProfileSchema.shape;
export const policyCardSchema = z
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
export type PolicyCard = z.infer<typeof policyCardSchema>;

const envelope = {
  version: z.literal(PROTOCOL_VERSION),
  conversationId: z.string().trim().min(1).max(300),
  from: fields.id,
  to: fields.id,
};
const rejectionSchema = z
  .object({
    ...envelope,
    type: z.literal('rejected'),
    reason: z.enum(['policy-declined', 'no-common-window', 'invalid-proposal']),
  })
  .strict();
const offerSchema = z
  .object({
    ...envelope,
    type: z.literal('offer'),
    intent: z.enum(['friendship', 'dating', 'collaboration']),
    card: policyCardSchema,
  })
  .strict();
const responseSchema = z
  .object({
    ...envelope,
    type: z.literal('policy-response'),
    card: policyCardSchema,
    policyPassed: z.literal(true),
  })
  .strict();
// Intersection arrays may be empty even though each owner's preference lists are not.
// Rebuilding the array avoids inheriting the owner's minimum-one refinement.
const sharedInterestsSchema = z
  .array(fields.interests.element)
  .max(12)
  .refine(
    (items) => new Set(items.map(interestKey)).size === items.length,
    'Shared interests must be unique regardless of capitalization.',
  );
const sharedValuesSchema = z
  .array(fields.values.element)
  .max(6)
  .refine((items) => new Set(items).size === items.length, 'Shared values must be unique.');
const windowSchema = z
  .object({
    ...envelope,
    type: z.literal('window-proposal'),
    sharedInterests: sharedInterestsSchema,
    sharedValues: sharedValuesSchema,
    slot: z.enum(['weekday-evenings', 'weekends', 'weekday-days']),
  })
  .strict();
const windowResponseSchema = z
  .object({
    ...envelope,
    type: z.literal('window-response'),
    slot: z.enum(['weekday-evenings', 'weekends', 'weekday-days']),
    accepted: z.literal(true),
  })
  .strict();
const planSchema = z
  .object({
    title: z.string().min(1).max(200),
    detail: z.string().min(1).max(600),
    availability: z.enum(['weekday-evenings', 'weekends', 'weekday-days']),
  })
  .strict();
const meetingSchema = z
  .object({ ...envelope, type: z.literal('meeting-proposal'), plan: planSchema })
  .strict();
const readySchema = z
  .object({
    ...envelope,
    type: z.literal('suggestion-ready'),
    humanApprovalRequired: z.literal(true),
    contactShared: z.literal(false),
  })
  .strict();
export const protocolMessageSchema = z.discriminatedUnion('type', [
  offerSchema,
  responseSchema,
  windowSchema,
  windowResponseSchema,
  meetingSchema,
  readySchema,
  rejectionSchema,
]);
export type ProtocolMessage = z.infer<typeof protocolMessageSchema>;
type Offer = z.infer<typeof offerSchema>;
type PolicyResponse = z.infer<typeof responseSchema>;
type WindowProposal = z.infer<typeof windowSchema>;
type WindowResponse = z.infer<typeof windowResponseSchema>;
type MeetingProposal = z.infer<typeof meetingSchema>;
type SuggestionReady = z.infer<typeof readySchema>;
type Rejection = z.infer<typeof rejectionSchema>;
type Conversation = {
  id: string;
  peerId: string;
  intent: Intent;
  peer?: PolicyCard;
  slot?: Availability;
  stage: 'offered' | 'policy' | 'window' | 'proposal' | 'ready' | 'rejected';
};

export function toPolicyCard(profile: OwnerProfile): PolicyCard {
  const {
    id,
    name,
    agentName,
    age,
    city,
    gender,
    intents,
    smoking,
    interests,
    values,
    availability,
    energy,
  } = profile;
  return policyCardSchema.parse({
    id,
    name,
    agentName,
    age,
    city,
    gender,
    intents,
    smoking,
    interests,
    values,
    availability,
    energy,
  });
}

function acceptsCard(owner: OwnerProfile, peer: PolicyCard, intent: Intent): boolean {
  return evaluateDisclosedPolicy(owner, peer, intent).accepted;
}

/** Each instance retains its own private policy. Exchange plain JSON, never owner profiles. */
export class LocalPolicyAgent {
  #owner: OwnerProfile;
  #conversations = new Map<string, Conversation>();
  readonly id: string;

  constructor(profile: OwnerProfile) {
    this.#owner = structuredClone(validateProfile(profile));
    this.id = this.#owner.id;
  }

  createOffer(peerId: string, intent: Intent, conversationId?: string): Offer {
    if (this.#owner.paused || !this.#owner.intents.includes(intent))
      throw new Error('Owner policy does not authorize this search.');
    if (peerId === this.id) throw new Error('An owner cannot introduce themselves to themselves.');
    const id = conversationId ?? `conversation-${this.id}-${peerId}-${intent}`;
    const offer = offerSchema.parse({
      version: PROTOCOL_VERSION,
      conversationId: id,
      from: this.id,
      to: peerId,
      type: 'offer',
      intent,
      card: toPolicyCard(this.#owner),
    });
    if (offer.to === this.id)
      throw new Error('An owner cannot introduce themselves to themselves.');
    if (this.#conversations.has(offer.conversationId))
      throw new Error('Unexpected or replayed agent offer.');
    this.#conversations.set(offer.conversationId, {
      id: offer.conversationId,
      peerId: offer.to,
      intent,
      stage: 'offered',
    });
    return offer;
  }

  receiveOffer(input: unknown): PolicyResponse | Rejection {
    const offer = offerSchema.parse(input);
    this.#assertEnvelope(offer);
    if (offer.card.id !== offer.from || this.#conversations.has(offer.conversationId))
      throw new Error('Unexpected or replayed agent offer.');
    if (!acceptsCard(this.#owner, offer.card, offer.intent))
      return this.#reject(offer, 'policy-declined');
    this.#conversations.set(offer.conversationId, {
      id: offer.conversationId,
      peerId: offer.from,
      peer: offer.card,
      intent: offer.intent,
      stage: 'policy',
    });
    return responseSchema.parse({
      ...this.#reply(offer),
      type: 'policy-response',
      card: toPolicyCard(this.#owner),
      policyPassed: true,
    });
  }

  receivePolicyResponse(input: unknown): WindowProposal | Rejection {
    const response = responseSchema.parse(input);
    const conversation = this.#conversation(response, 'offered');
    if (
      response.card.id !== response.from ||
      !acceptsCard(this.#owner, response.card, conversation.intent)
    )
      return this.#reject(response, 'policy-declined');
    const ground = commonGround(this.#owner, response.card);
    const slot = ground.commonAvailability[0];
    if (!slot) return this.#reject(response, 'no-common-window');
    conversation.peer = response.card;
    conversation.slot = slot;
    conversation.stage = 'window';
    return windowSchema.parse({
      ...this.#reply(response),
      type: 'window-proposal',
      sharedInterests: ground.sharedInterests,
      sharedValues: ground.sharedValues,
      slot,
    });
  }

  receiveWindowProposal(input: unknown): WindowResponse | Rejection {
    const proposal = windowSchema.parse(input);
    const conversation = this.#conversation(proposal, 'policy');
    const peer = conversation.peer!;
    const ground = commonGround(this.#owner, peer);
    const honestInterests = sameDeclaredSet(
      proposal.sharedInterests,
      ground.sharedInterests,
      interestKey,
    );
    const honestValues = sameDeclaredSet(proposal.sharedValues, ground.sharedValues);
    if (
      !honestInterests ||
      !honestValues ||
      !this.#owner.availability.includes(proposal.slot) ||
      !peer.availability.includes(proposal.slot)
    )
      return this.#reject(proposal, 'invalid-proposal');
    conversation.slot = proposal.slot;
    conversation.stage = 'window';
    return windowResponseSchema.parse({
      ...this.#reply(proposal),
      type: 'window-response',
      slot: proposal.slot,
      accepted: true,
    });
  }

  receiveWindowResponse(input: unknown): MeetingProposal {
    const response = windowResponseSchema.parse(input);
    const conversation = this.#conversation(response, 'window');
    if (response.slot !== conversation.slot)
      throw new Error('Peer changed the agreed availability.');
    const interests = commonGround(this.#owner, conversation.peer!).sharedInterests;
    conversation.stage = 'proposal';
    return meetingSchema.parse({
      ...this.#reply(response),
      type: 'meeting-proposal',
      plan: proposeMeeting(conversation.intent, interests, response.slot, {
        sameCity: normalizedCity(this.#owner.city) === normalizedCity(conversation.peer!.city),
        declaredInterests: { owner: this.#owner.interests, peer: conversation.peer!.interests },
      }),
    });
  }

  receiveMeetingProposal(input: unknown): SuggestionReady | Rejection {
    const proposal = meetingSchema.parse(input);
    const conversation = this.#conversation(proposal, 'window');
    if (proposal.plan.availability !== conversation.slot)
      return this.#reject(proposal, 'invalid-proposal');
    const interests = commonGround(this.#owner, conversation.peer!).sharedInterests;
    const expected = proposeMeeting(conversation.intent, interests, conversation.slot!, {
      sameCity: normalizedCity(this.#owner.city) === normalizedCity(conversation.peer!.city),
      declaredInterests: { owner: this.#owner.interests, peer: conversation.peer!.interests },
    });
    if (proposal.plan.title !== expected.title || proposal.plan.detail !== expected.detail)
      return this.#reject(proposal, 'invalid-proposal');
    conversation.stage = 'ready';
    return readySchema.parse({
      ...this.#reply(proposal),
      type: 'suggestion-ready',
      humanApprovalRequired: true,
      contactShared: false,
    });
  }

  /** Read a bounded explanation of the agreed proposal; this grants no owner consent. */
  readIntroductionBrief(conversationId: string): IntroductionBrief {
    const conversation = this.#conversations.get(conversationId);
    if (
      !conversation ||
      !['proposal', 'ready'].includes(conversation.stage) ||
      !conversation.peer ||
      !conversation.slot
    )
      throw new Error('Introduction brief requires an active agreed proposal.');
    const owner = toPolicyCard(this.#owner);
    const ground = commonGround(owner, conversation.peer);
    return createIntroductionBrief({
      intent: conversation.intent,
      sharedInterests: ground.sharedInterests,
      sharedValues: ground.sharedValues,
      slot: conversation.slot,
      context: { owner, peer: conversation.peer },
    });
  }

  #assertEnvelope(message: ProtocolMessage): void {
    if (message.to !== this.id || message.from === this.id)
      throw new Error('Agent message is addressed to a different owner.');
  }
  #conversation(message: ProtocolMessage, expected: Conversation['stage']): Conversation {
    this.#assertEnvelope(message);
    const conversation = this.#conversations.get(message.conversationId);
    if (!conversation || conversation.peerId !== message.from || conversation.stage !== expected)
      throw new Error('Unexpected agent message or conversation stage.');
    return conversation;
  }
  #reply(message: ProtocolMessage) {
    return {
      version: PROTOCOL_VERSION,
      conversationId: message.conversationId,
      from: this.id,
      to: message.from,
    };
  }
  #reject(message: ProtocolMessage, reason: Rejection['reason']): Rejection {
    const previous = this.#conversations.get(message.conversationId);
    const intent = previous?.intent ?? (message.type === 'offer' ? message.intent : undefined);
    if (intent)
      this.#conversations.set(message.conversationId, {
        id: message.conversationId,
        peerId: message.from,
        intent,
        stage: 'rejected',
      });
    return rejectionSchema.parse({ ...this.#reply(message), type: 'rejected', reason });
  }
}

export interface NegotiationResult {
  accepted: boolean;
  exchange: ProtocolMessage[];
}

/** Local JSON transport intentionally serializes each message between two separate agents. */
export function runNegotiation(
  owner: OwnerProfile,
  peer: OwnerProfile,
  intent: Intent,
): NegotiationResult {
  const first = new LocalPolicyAgent(owner);
  const second = new LocalPolicyAgent(peer);
  const exchange: ProtocolMessage[] = [];
  if (owner.paused || !owner.intents.includes(intent) || owner.id === peer.id)
    return { accepted: false, exchange };
  const wire = <T extends ProtocolMessage>(message: T): T => {
    const serialized = JSON.stringify(message);
    const delivered = protocolMessageSchema.parse(JSON.parse(serialized)) as T;
    exchange.push(delivered);
    return delivered;
  };
  const offer = wire(first.createOffer(peer.id, intent));
  const response = wire(second.receiveOffer(offer));
  if (response.type === 'rejected') return { accepted: false, exchange };
  const window = wire(first.receivePolicyResponse(response));
  if (window.type === 'rejected') return { accepted: false, exchange };
  const windowResponse = wire(second.receiveWindowProposal(window));
  if (windowResponse.type === 'rejected') return { accepted: false, exchange };
  const proposal = wire(first.receiveWindowResponse(windowResponse));
  const ready = wire(second.receiveMeetingProposal(proposal));
  return { accepted: ready.type === 'suggestion-ready', exchange };
}
