import { z } from 'zod';
import { agentCapsuleSchema, agentRegistrationIdSchema } from '../shared/agent-capsule.js';
import type { NetworkConversation, NetworkIdentity } from '../shared/network-types.js';
import {
  canonicalKey,
  verifyConversationApprovals,
  verifyPeerIdentity,
  type ChannelEnvelope,
} from './crypto.js';

/** A short-lived preview window, not a promise about relay or recipient retention. */
export const DISCLOSURE_PREVIEW_TTL_MS = 5 * 60 * 1000;
type Clock = () => number;

export type DisclosureField =
  | { kind: 'display-name'; value: string }
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string }
  | { kind: 'link'; value: string }
  | { kind: 'information'; value: string };

export interface DisclosureSelection {
  fields: DisclosureField[];
  consent: true;
}

/**
 * The caller supplies a current, trusted runtime snapshot; this service does not fetch relay state.
 * validUntil is its freshness/expiry deadline, capped to five minutes. Revocation and block data
 * must come from that runtime, never from an AI tool's proposed arguments or a saved preview.
 */
export interface DisclosureConnectionContext {
  owner: { id: string; registrationId: string };
  conversation: NetworkConversation;
  identities: ReadonlyMap<string, NetworkIdentity>;
  blockedPeerIds: readonly string[];
  revokedRegistrationIds: readonly string[];
  validUntil: number;
}

declare const verifiedConnection: unique symbol;
export interface DisclosureConnection {
  readonly [verifiedConnection]: true;
}

export interface DisclosureDraft {
  readonly id: string;
  readonly conversationId: string;
  readonly ownerId: string;
  readonly recipientId: string;
  readonly ownerRegistrationId: string;
  readonly recipientRegistrationId: string;
  readonly fields: readonly Readonly<DisclosureField>[];
  readonly previewText: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export interface DisclosureApproval {
  draftId: string;
  previewText: string;
  consent: true;
}

export interface PreparedDisclosureMessage {
  envelope: ChannelEnvelope;
  plaintext: string;
  expiresAt: number;
}

const idSchema = z.string().regex(/^[a-f0-9]{64}$/);
const noUnsafeControls = (value: string) =>
  !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/u.test(value);
const text = (max: number, multiline = false) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(noUnsafeControls)
    .refine((value) => multiline || !/[\r\n\t]/u.test(value));
const safeLink = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      value.startsWith('https://') &&
      !value.includes('\\') &&
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (!url.port || url.port === '443') &&
      /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,63}$/i.test(url.hostname) &&
      !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
};
const fieldSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('display-name'), value: text(80) }).strict(),
  z.object({ kind: z.literal('email'), value: text(254).pipe(z.email()) }).strict(),
  z.object({ kind: z.literal('phone'), value: text(16).regex(/^\+[1-9]\d{6,14}$/) }).strict(),
  z.object({ kind: z.literal('link'), value: text(500).refine(safeLink) }).strict(),
  z.object({ kind: z.literal('information'), value: text(600, true) }).strict(),
]);
const selectionSchema = z
  .object({
    fields: z
      .array(fieldSchema)
      .min(1)
      .max(5)
      .refine((fields) => new Set(fields.map((field) => field.kind)).size === fields.length),
    consent: z.literal(true),
  })
  .strict();
const approvalSchema = z
  .object({
    draftId: z.string().uuid(),
    previewText: z.string().min(1).max(2000),
    consent: z.literal(true),
  })
  .strict();
const keySchema = z
  .object({
    kty: z.literal('EC'),
    crv: z.literal('P-256'),
    x: z.string().regex(/^[a-zA-Z\d_-]{43}$/),
    y: z.string().regex(/^[a-zA-Z\d_-]{43}$/),
    ext: z.boolean().optional(),
    key_ops: z
      .array(z.enum(['verify', 'deriveBits', 'deriveKey']))
      .max(2)
      .optional(),
    use: z.enum(['sig', 'enc']).optional(),
    alg: z.enum(['ES256', 'ECDH-ES']).optional(),
  })
  .strict();
const receiptSchema = z
  .object({
    signedText: z.string().min(1).max(8192),
    signature: z.string().regex(/^[a-zA-Z\d_-]{86}$/),
  })
  .strict();
const identitySchema = z
  .object({
    id: idSchema,
    registrationId: agentRegistrationIdSchema,
    signingKey: keySchema,
    exchangeKey: keySchema,
    capsule: agentCapsuleSchema,
    attestation: receiptSchema,
  })
  .strict();
const conversationSchema = z
  .object({
    id: z.string().uuid(),
    participants: z.tuple([idSchema, idSchema]),
    registrationIds: z.record(idSchema, agentRegistrationIdSchema),
    approvals: z.record(idSchema, z.boolean()),
    agentReady: z.record(idSchema, z.boolean()),
    state: z.enum(['negotiating', 'awaiting-approval', 'connected', 'declined', 'blocked']),
    createdAt: z.iso.datetime(),
    decisionAttestations: z.record(idSchema, receiptSchema),
  })
  .strict();
const contextSchema = z
  .object({
    owner: z.object({ id: idSchema, registrationId: agentRegistrationIdSchema }).strict(),
    conversation: conversationSchema,
    identities: z.custom<ReadonlyMap<string, NetworkIdentity>>(
      (value) => value instanceof Map && value.size <= 200,
    ),
    blockedPeerIds: z.array(idSchema).max(2000),
    revokedRegistrationIds: z.array(agentRegistrationIdSchema).max(2000),
    validUntil: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

interface Binding {
  conversationId: string;
  ownerId: string;
  recipientId: string;
  ownerRegistrationId: string;
  recipientRegistrationId: string;
  keys: string;
  snapshot: string;
  verifiedAt: number;
  expiresAt: number;
}
const connections = new WeakMap<object, Binding>();
const drafts = new WeakMap<object, { binding: Binding; used: boolean }>();

function time(clock: Clock): number {
  const now = clock();
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid disclosure clock.');
  return now;
}

function readContext(input: DisclosureConnectionContext) {
  const parsed = contextSchema.parse(input);
  const { conversation, owner } = parsed;
  const [first, second] = conversation.participants;
  if (first === second || !conversation.participants.includes(owner.id))
    throw new Error('Disclosure requires two distinct participants including this owner.');
  for (const record of [
    conversation.registrationIds,
    conversation.approvals,
    conversation.agentReady,
    conversation.decisionAttestations,
  ])
    if (
      Object.keys(record).length !== 2 ||
      !conversation.participants.every((id) => Object.hasOwn(record, id))
    )
      throw new Error('Disclosure requires exact bilateral conversation records.');
  const identities = new Map<string, NetworkIdentity>();
  for (const id of conversation.participants) {
    // Check original signed capsule bytes; schema normalization cannot replace signed content.
    const raw = parsed.identities.get(id);
    identitySchema.parse(raw);
    if (!raw || raw.id !== id) throw new Error('Disclosure participant identity is invalid.');
    identities.set(id, structuredClone(raw));
  }
  const recipientId = owner.id === first ? second : first;
  if (
    owner.registrationId !== identities.get(owner.id)!.registrationId ||
    owner.registrationId !== conversation.registrationIds[owner.id]
  )
    throw new Error('Disclosure owner registration is stale.');
  const snapshot = {
    owner,
    conversation,
    identities: [...identities],
    blockedPeerIds: parsed.blockedPeerIds,
    revokedRegistrationIds: parsed.revokedRegistrationIds,
    validUntil: parsed.validUntil,
  };
  return { ...parsed, identities, recipientId, snapshot: JSON.stringify(snapshot) };
}

function assertUsable(context: ReturnType<typeof readContext>, now: number): void {
  if (context.validUntil <= now || context.validUntil - now > DISCLOSURE_PREVIEW_TTL_MS)
    throw new Error('Disclosure connection snapshot is expired or too far in the future.');
  if (Date.parse(context.conversation.createdAt) > now)
    throw new Error('Disclosure conversation timestamp is in the future.');
  if (context.blockedPeerIds.includes(context.recipientId))
    throw new Error('Disclosure is unavailable for a blocked connection.');
  if (
    context.conversation.participants.some((id) =>
      context.revokedRegistrationIds.includes(context.conversation.registrationIds[id]),
    )
  )
    throw new Error('Disclosure is unavailable for a revoked registration.');
}

/** Verifies registrations and both approval signatures; the result cannot be restored from JSON. */
export async function verifyDisclosureConnection(
  context: DisclosureConnectionContext,
  clock: Clock = Date.now,
): Promise<DisclosureConnection> {
  const startedAt = time(clock);
  const snapshot = readContext(context);
  assertUsable(snapshot, startedAt);
  try {
    for (const identity of snapshot.identities.values()) await verifyPeerIdentity(identity);
    if (!(await verifyConversationApprovals(snapshot.conversation, snapshot.identities)))
      throw new Error('Invalid approvals.');
  } catch {
    throw new Error('Disclosure requires verified current bilateral owner approvals.');
  }
  const finishedAt = time(clock);
  const current = readContext(context);
  if (finishedAt < startedAt || current.snapshot !== snapshot.snapshot)
    throw new Error('Disclosure context changed during verification.');
  assertUsable(current, finishedAt);
  const binding: Binding = {
    conversationId: current.conversation.id,
    ownerId: current.owner.id,
    recipientId: current.recipientId,
    ownerRegistrationId: current.conversation.registrationIds[current.owner.id],
    recipientRegistrationId: current.conversation.registrationIds[current.recipientId],
    keys: JSON.stringify(
      [current.owner.id, current.recipientId].map((id) => {
        const identity = current.identities.get(id)!;
        return [canonicalKey(identity.signingKey), canonicalKey(identity.exchangeKey)];
      }),
    ),
    snapshot: current.snapshot,
    verifiedAt: finishedAt,
    expiresAt: current.validUntil,
  };
  const capability = Object.freeze({}) as DisclosureConnection;
  connections.set(capability, binding);
  return capability;
}

const labels: Record<DisclosureField['kind'], string> = {
  'display-name': 'Name',
  email: 'Email',
  phone: 'Phone',
  link: 'Link',
  information: 'Information',
};

/** Only explicit owner-selected fields enter the preview; no profile or transcript is read. */
export function createDisclosureDraft(
  connection: DisclosureConnection,
  selection: DisclosureSelection,
  clock: Clock = Date.now,
): DisclosureDraft {
  const binding = connections.get(connection);
  if (!binding) throw new Error('Disclosure requires an in-memory verified connection.');
  const now = time(clock);
  if (now < binding.verifiedAt || now >= binding.expiresAt)
    throw new Error('Disclosure connection capability is expired.');
  const selected = selectionSchema.parse(selection);
  const fields = Object.freeze(selected.fields.map((field) => Object.freeze(field)));
  const draft: DisclosureDraft = Object.freeze({
    id: crypto.randomUUID(),
    conversationId: binding.conversationId,
    ownerId: binding.ownerId,
    recipientId: binding.recipientId,
    ownerRegistrationId: binding.ownerRegistrationId,
    recipientRegistrationId: binding.recipientRegistrationId,
    fields,
    previewText: `I am choosing to share:\n${fields
      .map((field) => `${labels[field.kind]}: ${field.value}`)
      .join('\n')}`,
    createdAt: now,
    expiresAt: binding.expiresAt,
  });
  drafts.set(draft, { binding, used: false });
  return draft;
}

/**
 * A send-boundary preparation seam: rechecks current signatures, epochs, blocks, expiry and exact
 * preview consent. A successful preparation consumes the preview; retrying requires a new preview.
 * The host still encrypts and sends through the existing chat channel and applies its transport
 * checks. Plaintext must be rendered as text, never interpreted as HTML or automatically linked.
 * Disclosure cannot retract copies already received by another person.
 */
export async function prepareDisclosureMessage(
  draft: DisclosureDraft,
  approval: DisclosureApproval,
  currentContext: DisclosureConnectionContext,
  clock: Clock = Date.now,
): Promise<PreparedDisclosureMessage> {
  const saved = drafts.get(draft);
  if (!saved || saved.used) throw new Error('Disclosure preview is unknown or already consumed.');
  const now = time(clock);
  if (now < draft.createdAt || now >= draft.expiresAt)
    throw new Error('Disclosure preview is expired.');
  const confirmed = approvalSchema.parse(approval);
  if (confirmed.draftId !== draft.id || confirmed.previewText !== draft.previewText)
    throw new Error('Disclosure approval does not match the exact preview.');
  const capability = await verifyDisclosureConnection(currentContext, clock);
  const current = connections.get(capability)!;
  const pinned = saved.binding;
  if (
    current.conversationId !== pinned.conversationId ||
    current.ownerId !== pinned.ownerId ||
    current.recipientId !== pinned.recipientId ||
    current.ownerRegistrationId !== pinned.ownerRegistrationId ||
    current.recipientRegistrationId !== pinned.recipientRegistrationId ||
    current.keys !== pinned.keys
  )
    throw new Error('Disclosure connection or registration changed after the preview.');
  const finishedAt = time(clock);
  const finalContext = readContext(currentContext);
  if (finalContext.snapshot !== current.snapshot)
    throw new Error('Disclosure context changed before message preparation.');
  assertUsable(finalContext, finishedAt);
  if (finishedAt < now || finishedAt >= draft.expiresAt || saved.used)
    throw new Error('Disclosure preview expired or was consumed during verification.');
  saved.used = true;
  return {
    envelope: {
      conversationId: pinned.conversationId,
      from: pinned.ownerId,
      to: pinned.recipientId,
      kind: 'chat',
    },
    plaintext: draft.previewText,
    expiresAt: Math.min(draft.expiresAt, current.expiresAt),
  };
}
