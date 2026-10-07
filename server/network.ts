import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, createPublicKey, ECDH, randomBytes, randomUUID, verify } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { agentCapsuleSchema, agentRegistrationIdSchema } from '../src/shared/agent-capsule.js';
import type { Intent } from '../src/shared/types.js';
import {
  NETWORK_VERSION,
  type AgentCapsule,
  type EncryptedPacket,
  type NetworkConversation,
  type NetworkIdentity,
  type NetworkInbox,
} from '../src/shared/network-types.js';
import { syncDirectory } from './network-durability.js';
import {
  RELAY_RETENTION,
  retentionActivity,
  sweepRelayState,
  type RetentionActivity,
} from './retention.js';

type Attestation = { signedText: string; signature: string };
type Identity = NetworkIdentity & { attestation: Attestation };
type Conversation = NetworkConversation & { decisionAttestations: Record<string, Attestation> };
interface RelayState {
  version: 1;
  identities: Record<string, Identity>;
  conversations: Record<string, Conversation>;
  packets: Record<string, EncryptedPacket>;
  blocks: Array<{ pairHash: string; blockerId: string }>;
  blockedPairs?: string[]; // Read-only migration of earlier prototype stores.
  agentPacketCounts: Record<string, number>;
  retentionActivity?: RetentionActivity;
}
const emptyState = (): RelayState => ({
  version: 1,
  identities: {},
  conversations: {},
  packets: {},
  blocks: [],
  agentPacketCounts: {},
});
const MAX_AGENTS = 200,
  MAX_CHALLENGES = 1000,
  MAX_CONVERSATIONS = 2000,
  MAX_PACKETS = 2000;
const CHALLENGE_TTL = 120_000;
class RelayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function assert(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new RelayError(status, message);
}
const base64url = /^[A-Za-z0-9_-]+$/;
function canonicalBytes(value: string, length?: number): boolean {
  if (!base64url.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return (
    decoded.toString('base64url') === value && (length === undefined || decoded.length === length)
  );
}
const coordinate = z
  .string()
  .length(43)
  .refine((value) => canonicalBytes(value, 32), 'Use a canonical 32-byte public coordinate.');
const publicKeySchema = z
  .object({
    kty: z.literal('EC'),
    crv: z.literal('P-256'),
    x: coordinate,
    y: coordinate,
    ext: z.boolean().optional(),
    key_ops: z
      .array(z.enum(['verify', 'deriveBits', 'deriveKey']))
      .max(2)
      .optional(),
    use: z.enum(['sig', 'enc']).optional(),
    alg: z.enum(['ES256', 'ECDH-ES']).optional(),
  })
  .strict();
const registrationSchema = z
  .object({
    signingKey: publicKeySchema,
    exchangeKey: publicKeySchema,
    capsule: agentCapsuleSchema,
    registrationNonce: agentRegistrationIdSchema,
  })
  .strict();
const agentIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
const uuidSchema = z.string().uuid();
const signedRequestSchema = z
  .object({
    agentId: agentIdSchema,
    challengeId: uuidSchema,
    payload: z.record(z.string(), z.unknown()),
    signature: z
      .string()
      .length(86)
      .refine((value) => canonicalBytes(value, 64), 'Use a P256 IEEE-P1363 signature.'),
  })
  .strict();
const conversationSchema = z.object({ peerId: agentIdSchema }).strict();
const referenceSchema = z.object({ conversationId: uuidSchema }).strict();
const messageSchema = z
  .object({
    conversationId: uuidSchema,
    kind: z.enum(['agent', 'chat']),
    ciphertext: z
      .string()
      .min(22)
      .max(16_000)
      .refine(
        (value) => canonicalBytes(value) && Buffer.from(value, 'base64url').length >= 16,
        'Use an authenticated encrypted payload.',
      ),
    iv: z
      .string()
      .length(16)
      .refine((value) => canonicalBytes(value, 12), 'Use a 12-byte encryption IV.'),
  })
  .strict();
const decisionSchema = z
  .object({
    conversationId: uuidSchema,
    decision: z.enum(['approve', 'decline', 'block']),
    registrationIds: z
      .record(agentIdSchema, uuidSchema)
      .refine(
        (ids) => Object.keys(ids).length === 2,
        'Approval must bind both registration epochs.',
      )
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === 'approve' && !value.registrationIds)
      ctx.addIssue({
        code: 'custom',
        path: ['registrationIds'],
        message: 'Approval must bind both current registration epochs.',
      });
  });
const acknowledgmentSchema = z
  .object({
    packetIds: z
      .array(uuidSchema)
      .max(200)
      .refine((list) => new Set(list).size === list.length),
  })
  .strict();
const noPayloadSchema = z.object({}).strict();
const attestationSchema = z
  .object({
    signedText: z.string().min(1).max(32768),
    signature: signedRequestSchema.shape.signature,
  })
  .strict();
const attestedRegistrationSchema = z
  .object({
    path: z.literal('/api/network/register'),
    challengeId: uuidSchema,
    nonce: coordinate,
    payload: registrationSchema,
  })
  .strict();
const attestedApprovalSchema = z
  .object({
    path: z.literal('/api/network/decisions'),
    challengeId: uuidSchema,
    nonce: coordinate,
    payload: decisionSchema,
  })
  .strict();
const storedIdentitySchema = z
  .object({
    id: agentIdSchema,
    registrationId: uuidSchema,
    signingKey: publicKeySchema,
    exchangeKey: publicKeySchema,
    capsule: agentCapsuleSchema,
    attestation: attestationSchema,
  })
  .strict();
const storedConversationSchema = z
  .object({
    id: uuidSchema,
    participants: z.tuple([agentIdSchema, agentIdSchema]),
    registrationIds: z.record(agentIdSchema, uuidSchema),
    approvals: z.record(agentIdSchema, z.boolean()),
    agentReady: z.record(agentIdSchema, z.boolean()),
    state: z.enum(['negotiating', 'awaiting-approval', 'connected', 'declined', 'blocked']),
    createdAt: z.iso.datetime(),
    decisionAttestations: z.record(agentIdSchema, attestationSchema),
  })
  .strict();
const storedPacketSchema = messageSchema
  .extend({ id: uuidSchema, from: agentIdSchema, to: agentIdSchema, createdAt: z.iso.datetime() })
  .strict();
const storedRelaySchema = z
  .object({
    version: z.literal(1),
    identities: z.record(agentIdSchema, storedIdentitySchema),
    conversations: z.record(uuidSchema, storedConversationSchema),
    packets: z.record(uuidSchema, storedPacketSchema),
    blocks: z
      .array(z.object({ pairHash: agentIdSchema, blockerId: agentIdSchema }).strict())
      .max(50000)
      .optional(),
    blockedPairs: z.array(z.string().regex(/^[a-f0-9]{64}:[a-f0-9]{64}$/)).optional(),
    agentPacketCounts: z.record(uuidSchema, z.number().int().min(0).max(60)),
    retentionActivity: z
      .object({
        identities: z.record(agentIdSchema, z.number().finite().nonnegative()),
        conversations: z.record(uuidSchema, z.number().finite().nonnegative()),
        pendingDeadlines: z.record(uuidSchema, z.number().finite().nonnegative()).optional(),
        packetDeadlines: z.record(uuidSchema, z.number().finite().nonnegative()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const paths = new Set(
  [
    'register',
    'directory',
    'conversations',
    'messages',
    'inbox',
    'ready',
    'decisions',
    'ack',
    'leave',
  ].map((name) => `/api/network/${name}`),
);

function keyFingerprint(key: z.infer<typeof publicKeySchema>): string {
  return createHash('sha256')
    .update(JSON.stringify({ kty: 'EC', crv: 'P-256', x: key.x, y: key.y }))
    .digest('hex');
}
function validatePublicKey(key: z.infer<typeof publicKeySchema>, role: 'signing' | 'exchange') {
  const allowed = role === 'signing' ? ['verify'] : ['deriveBits', 'deriveKey'];
  assert(
    !key.key_ops || key.key_ops.every((op) => allowed.includes(op)),
    400,
    'Public key operations do not match their role.',
  );
  assert(
    !key.use || key.use === (role === 'signing' ? 'sig' : 'enc'),
    400,
    'Public key use does not match its role.',
  );
  assert(
    !key.alg || key.alg === (role === 'signing' ? 'ES256' : 'ECDH-ES'),
    400,
    'Public key algorithm does not match its role.',
  );
  try {
    const point = Buffer.concat([
      Buffer.from([4]),
      Buffer.from(key.x, 'base64url'),
      Buffer.from(key.y, 'base64url'),
    ]);
    ECDH.convertKey(point, 'prime256v1');
    return createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: key.x, y: key.y }, format: 'jwk' });
  } catch {
    throw new RelayError(400, 'Use a valid P256 public key.');
  }
}
function verifyStoredAttestation(attestation: Attestation, signingKey: JsonWebKey): boolean {
  return verify(
    'sha256',
    Buffer.from(attestation.signedText),
    {
      key: validatePublicKey(publicKeySchema.parse(signingKey), 'signing'),
      dsaEncoding: 'ieee-p1363',
    },
    Buffer.from(attestation.signature, 'base64url'),
  );
}
function validateStoredIdentity(identity: Identity): void {
  try {
    const proof = attestedRegistrationSchema.parse(JSON.parse(identity.attestation.signedText));
    validatePublicKey(publicKeySchema.parse(identity.exchangeKey), 'exchange');
    assert(
      proof.payload.registrationNonce === identity.registrationId &&
        isDeepStrictEqual(proof.payload.signingKey, identity.signingKey) &&
        isDeepStrictEqual(proof.payload.exchangeKey, identity.exchangeKey) &&
        isDeepStrictEqual(proof.payload.capsule, identity.capsule) &&
        verifyStoredAttestation(identity.attestation, identity.signingKey),
      500,
      'Relay identity storage is invalid.',
    );
  } catch {
    throw new RelayError(500, 'Relay identity storage is invalid.');
  }
}
function validateStoredConnection(
  conversation: Conversation,
  identities: RelayState['identities'],
) {
  try {
    for (const id of conversation.participants) {
      const identity = identities[id];
      const receipt = conversation.decisionAttestations[id];
      assert(
        identity.registrationId === conversation.registrationIds[id] && receipt,
        500,
        'Relay consent storage is invalid.',
      );
      const proof = attestedApprovalSchema.parse(JSON.parse(receipt.signedText));
      assert(
        proof.payload.decision === 'approve' &&
          proof.payload.conversationId === conversation.id &&
          conversation.participants.every(
            (participant) =>
              proof.payload.registrationIds?.[participant] ===
              conversation.registrationIds[participant],
          ) &&
          verifyStoredAttestation(receipt, identity.signingKey),
        500,
        'Relay consent storage is invalid.',
      );
    }
  } catch {
    throw new RelayError(500, 'Relay consent storage is invalid.');
  }
}
function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}
function pairHash(a: string, b: string): string {
  return createHash('sha256').update(pairKey(a, b)).digest('hex');
}
function blocked(state: RelayState, a: string, b: string): boolean {
  const hash = pairHash(a, b);
  return state.blocks.some((record) => record.pairHash === hash);
}
const isTerminal = (conversation: NetworkConversation) =>
  conversation.state === 'blocked' || conversation.state === 'declined';
function ownConversation(state: RelayState, id: string, agentId: string): Conversation {
  const conversation = state.conversations[id];
  assert(conversation?.participants.includes(agentId), 404, 'Conversation not found.');
  return conversation;
}
function bothReady(conversation: NetworkConversation): boolean {
  return conversation.participants.every((id) => conversation.agentReady[id] === true);
}
function bothApproved(conversation: NetworkConversation): boolean {
  return conversation.participants.every((id) => conversation.approvals[id] === true);
}
function purgePackets(state: RelayState, conversationId: string): void {
  for (const [id, packet] of Object.entries(state.packets))
    if (packet.conversationId === conversationId) delete state.packets[id];
}

/** Serialized, atomic local metadata/ciphertext store. Owner profiles and private keys never belong here. */
class RelayStore {
  #queue: Promise<unknown> = Promise.resolve();
  #state: Promise<RelayState>;
  #path: string;
  #directory: string;
  constructor(directory: string) {
    const root = resolve(directory);
    this.#directory = root;
    const path = join(root, 'relay.json');
    this.#path = path;
    this.#state = (async () => {
      await mkdir(root, { recursive: true, mode: 0o700 });
      await chmod(root, 0o700);
      try {
        const state: RelayState = JSON.parse(await readFile(path, 'utf8'));
        assert(
          storedRelaySchema.safeParse(state).success &&
            (Array.isArray(state.blocks) || Array.isArray(state.blockedPairs)) &&
            Object.keys(state.identities).length <= MAX_AGENTS &&
            Object.keys(state.conversations).length <= MAX_CONVERSATIONS &&
            Object.keys(state.packets).length <= MAX_PACKETS,
          500,
          'Relay storage is invalid.',
        );
        for (const [id, identity] of Object.entries(state.identities)) {
          assert(
            identity.id === id && keyFingerprint(publicKeySchema.parse(identity.signingKey)) === id,
            500,
            'Relay identity storage is invalid.',
          );
          validateStoredIdentity(identity);
        }
        for (const [id, conversation] of Object.entries(state.conversations)) {
          const actors = new Set(conversation.participants);
          assert(
            id === conversation.id &&
              actors.size === 2 &&
              conversation.participants.every((actor) => state.identities[actor]) &&
              [conversation.approvals, conversation.agentReady, conversation.registrationIds].every(
                (records) =>
                  Object.keys(records).length === 2 &&
                  Object.keys(records).every((actor) => actors.has(actor)),
              ) &&
              Object.keys(conversation.decisionAttestations).every((actor) => actors.has(actor)),
            500,
            'Relay conversation storage is invalid.',
          );
          if (conversation.state === 'connected') {
            assert(
              bothApproved(conversation) && bothReady(conversation),
              500,
              'Relay consent storage is invalid.',
            );
            validateStoredConnection(conversation, state.identities);
          }
        }
        for (const [id, packet] of Object.entries(state.packets)) {
          const conversation = state.conversations[packet.conversationId];
          assert(
            id === packet.id &&
              conversation &&
              packet.from !== packet.to &&
              conversation.participants.includes(packet.from) &&
              conversation.participants.includes(packet.to),
            500,
            'Relay packet storage is invalid.',
          );
        }
        if (!state.blocks) {
          state.blocks = [];
          for (const pair of state.blockedPairs ?? []) {
            const [a, b] = pair.split(':');
            if (!a || !b) continue;
            const actors = new Set<string>();
            for (const conversation of Object.values(state.conversations))
              if (pairKey(...conversation.participants) === pair) {
                for (const [id, receipt] of Object.entries(
                  conversation.decisionAttestations ?? {},
                )) {
                  try {
                    if (JSON.parse(receipt.signedText).payload?.decision === 'block')
                      actors.add(id);
                  } catch {
                    /* Invalid historical receipt does not grant consent. */
                  }
                }
              }
            // Legacy stores lacked explicit ownership: retain both choices rather than lose protection.
            for (const blockerId of actors.size ? actors : [a, b])
              state.blocks.push({ pairHash: pairHash(a, b), blockerId });
          }
        }
        delete state.blockedPairs;
        await chmod(path, 0o600);
        return state;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
        throw error;
      }
    })();
    // Retain the failure for health/authenticated requests without an unhandled startup rejection.
    void this.#state.catch(() => {});
  }
  async transaction<T>(
    mutate: (state: RelayState) => T,
    write: boolean | ((result: T) => boolean) = true,
  ): Promise<T> {
    const previous = this.#queue;
    const current = previous
      .catch(() => {})
      .then(async () => {
        const original = await this.#state;
        const state = structuredClone(original);
        const result = mutate(state);
        if (typeof write === 'function' ? write(result) : write) {
          const temporary = `${this.#path}.${randomUUID()}.tmp`;
          try {
            await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flush: true });
            await rename(temporary, this.#path);
            await syncDirectory(this.#directory);
            // Keep prior memory until publication is durable, so a failed sync can be retried.
            this.#state = Promise.resolve(state);
          } finally {
            await rm(temporary, { force: true });
          }
        }
        return result;
      });
    this.#queue = current;
    return current;
  }
}

async function readBody(req: IncomingMessage): Promise<z.infer<typeof signedRequestSchema>> {
  assert(
    req.headers['content-type']?.split(';')[0].trim().toLowerCase() === 'application/json',
    415,
    'Use application/json.',
  );
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    assert(size <= 32_768, 413, 'Request is too large.');
    chunks.push(bytes);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RelayError(400, 'Send a valid signed JSON object.');
  }
  return signedRequestSchema.parse(parsed);
}
function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}

/** A relay authenticates key possession, not real-world identity or the truth of owner claims. */
export function createNetworkRouter(options: {
  directory: string;
  allowedOrigins: string[];
  now?: () => number;
  maintenanceIntervalMs?: number;
}) {
  const store = new RelayStore(options.directory);
  const now = options.now ?? Date.now;
  const interval = options.maintenanceIntervalMs ?? RELAY_RETENTION.sweepIntervalMs;
  if (
    !Number.isSafeInteger(interval) ||
    interval < 10 ||
    interval > RELAY_RETENTION.sweepIntervalMs
  )
    throw new Error('Maintenance interval must be between 10 and 60000 milliseconds.');
  const activity = new Map<string, number>();
  let lastSweep = -Infinity;
  let sweepFailed = false;
  let sweeping: Promise<ReturnType<typeof sweepRelayState>> | undefined;
  let closed = false;
  function sweep(force = true) {
    if (sweeping) return sweeping;
    if (closed) return Promise.reject(new Error('Relay maintenance has stopped.'));
    if (!force && !sweepFailed && now() - lastSweep < interval) return Promise.resolve(undefined);
    const startedAt = now();
    let liveIdentities = new Set<string>();
    sweeping = store
      .transaction(
        (state) => {
          const result = sweepRelayState(state, now(), new Map(activity));
          liveIdentities = new Set(Object.keys(state.identities));
          return result;
        },
        (result) => result.changed,
      )
      .then((result) => {
        lastSweep = startedAt;
        sweepFailed = false;
        for (const id of activity.keys()) if (!liveIdentities.has(id)) activity.delete(id);
        return result;
      })
      .catch((error) => {
        sweepFailed = true;
        throw error;
      })
      .finally(() => {
        sweeping = undefined;
      });
    return sweeping;
  }
  const origins = new Set(
    options.allowedOrigins.map((value) => {
      const parsed = new URL(value);
      assert(
        ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === value,
        500,
        'Configure exact allowed origins.',
      );
      return parsed.origin;
    }),
  );
  const maintenance = setInterval(() => {
    void sweep(false).catch(() => {});
  }, interval);
  maintenance.unref();
  const challenges = new Map<string, { agentId: string; nonce: string; expiresAt: number }>();
  const rates = new Map<string, { startedAt: number; count: number }>();
  function rate(key: string, limit: number) {
    const now = Date.now();
    for (const [id, value] of rates) if (now - value.startedAt >= 60_000) rates.delete(id);
    assert(rates.has(key) || rates.size < 5000, 429, 'Relay is busy. Try again shortly.');
    const current = rates.get(key) ?? { startedAt: now, count: 0 };
    assert(current.count < limit, 429, 'Relay rate limit reached. Try again in a minute.');
    current.count += 1;
    rates.set(key, current);
  }
  const networkRouter = async function (
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    if (!url.pathname.startsWith('/api/network/')) return false;
    try {
      const origin = req.headers.origin;
      assert(!origin || origins.has(origin), 403, 'This origin is not allowed by the relay.');
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        assert(
          url.pathname === '/api/network/challenge' ||
            url.pathname === '/api/network/health' ||
            paths.has(url.pathname),
          404,
          'Relay route not found.',
        );
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '600',
        });
        res.end();
        return true;
      }
      if (req.method === 'GET' && url.pathname === '/api/network/health') {
        await sweep(false);
        await store.transaction(() => null, false);
        json(res, 200, {
          ok: true,
          protocol: NETWORK_VERSION,
          privacy: 'encrypted-payloads',
          retention: RELAY_RETENTION,
        });
        return true;
      }
      const ip = req.socket.remoteAddress ?? 'unknown';
      if (req.method === 'GET' && url.pathname === '/api/network/challenge') {
        const agentId = agentIdSchema.parse(url.searchParams.get('agentId'));
        rate(`challenge:${ip}`, 300);
        const now = Date.now();
        for (const [id, challenge] of challenges)
          if (challenge.expiresAt <= now) challenges.delete(id);
        assert(
          challenges.size < MAX_CHALLENGES,
          429,
          'Too many active challenges. Try again shortly.',
        );
        const challengeId = randomUUID(),
          nonce = randomBytes(32).toString('base64url');
        challenges.set(challengeId, { agentId, nonce, expiresAt: now + CHALLENGE_TTL });
        json(res, 200, { challengeId, nonce });
        return true;
      }
      assert(req.method === 'POST' && paths.has(url.pathname), 404, 'Relay route not found.');
      rate(`post:${ip}`, 300);
      await sweep(false);
      const request = await readBody(req);
      rate(`agent:${request.agentId}`, 60);
      const challenge = challenges.get(request.challengeId);
      // Consume before verification: even a rejected signed request cannot replay this challenge.
      challenges.delete(request.challengeId);
      assert(
        challenge && challenge.agentId === request.agentId && challenge.expiresAt > Date.now(),
        401,
        'Challenge expired, already used, or belongs to another identity.',
      );
      const signedText = JSON.stringify({
        path: url.pathname,
        challengeId: request.challengeId,
        nonce: challenge.nonce,
        payload: request.payload,
      });
      const attestation = { signedText, signature: request.signature };
      const registration =
        url.pathname === '/api/network/register'
          ? registrationSchema.parse(request.payload)
          : undefined;
      const response = await store.transaction((state) => {
        const identity = state.identities[request.agentId];
        if (!registration && !identity && url.pathname === '/api/network/leave') {
          // Nothing belonging to this key remains. Existing keys still require signature verification.
          noPayloadSchema.parse(request.payload);
          return { ok: true, alreadyAbsent: true };
        }
        assert(registration || identity, 401, 'Register this identity before using the relay.');
        const signingKey = registration?.signingKey ?? publicKeySchema.parse(identity!.signingKey);
        const publicKey = validatePublicKey(signingKey, 'signing');
        assert(
          keyFingerprint(signingKey) === request.agentId,
          401,
          'Identity does not match the signing key.',
        );
        assert(
          verify(
            'sha256',
            Buffer.from(signedText),
            { key: publicKey, dsaEncoding: 'ieee-p1363' },
            Buffer.from(request.signature, 'base64url'),
          ),
          401,
          'Invalid owner-agent signature.',
        );
        if (registration) {
          validatePublicKey(registration.exchangeKey, 'exchange');
          assert(
            identity || Object.keys(state.identities).length < MAX_AGENTS,
            429,
            'Relay identity capacity reached.',
          );
          if (identity)
            assert(
              JSON.stringify(identity.exchangeKey) === JSON.stringify(registration.exchangeKey),
              409,
              'Leave the relay before changing your exchange key.',
            );
          assert(
            !identity || identity.registrationId !== registration.registrationNonce,
            409,
            'Use a fresh client-generated registration nonce.',
          );
          if (identity) {
            // A fresh registration may represent a changed private policy. The relay
            // cannot inspect it, so old negotiations and approvals fail closed.
            for (const conversation of Object.values(state.conversations))
              if (
                conversation.participants.includes(request.agentId) &&
                !isTerminal(conversation)
              ) {
                conversation.state = 'declined';
                conversation.approvals = Object.fromEntries(
                  conversation.participants.map((id) => [id, false]),
                );
                conversation.agentReady = Object.fromEntries(
                  conversation.participants.map((id) => [id, false]),
                );
                conversation.decisionAttestations = {};
                purgePackets(state, conversation.id);
                retentionActivity(state).conversations[conversation.id] = now();
              }
          }
          const next: Identity = {
            id: request.agentId,
            registrationId: registration.registrationNonce,
            signingKey: registration.signingKey,
            exchangeKey: registration.exchangeKey,
            capsule: registration.capsule as AgentCapsule,
            attestation,
          };
          state.identities[request.agentId] = next;
          retentionActivity(state).identities[request.agentId] = now();
          return next;
        }
        const agentId = request.agentId;
        const route = url.pathname.slice('/api/network/'.length);
        if (route === 'directory') {
          noPayloadSchema.parse(request.payload);
          return { peers: Object.values(state.identities).filter((peer) => peer.id !== agentId) };
        }
        if (route === 'conversations') {
          const { peerId } = conversationSchema.parse(request.payload);
          assert(peerId !== agentId, 400, 'Choose another owner agent.');
          assert(state.identities[peerId], 404, 'Peer identity not found.');
          const pair = pairKey(agentId, peerId);
          assert(!blocked(state, agentId, peerId), 409, 'This connection is blocked.');
          const existing = Object.values(state.conversations).find(
            (conversation) =>
              pairKey(...conversation.participants) === pair && !isTerminal(conversation),
          );
          if (existing) return existing;
          assert(
            Object.keys(state.conversations).length < MAX_CONVERSATIONS,
            429,
            'Relay conversation capacity reached.',
          );
          assert(
            Object.values(state.conversations).filter(
              (conversation) =>
                conversation.participants.includes(agentId) && !isTerminal(conversation),
            ).length < 50,
            429,
            'Close an existing conversation first.',
          );
          const conversation: Conversation = {
            id: randomUUID(),
            participants: [agentId, peerId],
            registrationIds: {
              [agentId]: identity!.registrationId,
              [peerId]: state.identities[peerId].registrationId,
            },
            approvals: { [agentId]: false, [peerId]: false },
            agentReady: { [agentId]: false, [peerId]: false },
            state: 'negotiating',
            createdAt: new Date(now()).toISOString(),
            decisionAttestations: {},
          };
          state.conversations[conversation.id] = conversation;
          state.agentPacketCounts[conversation.id] = 0;
          retentionActivity(state).conversations[conversation.id] = now();
          retentionActivity(state).pendingDeadlines[conversation.id] =
            now() + RELAY_RETENTION.pendingIntroductionMs;
          return conversation;
        }
        if (route === 'inbox') {
          noPayloadSchema.parse(request.payload);
          const conversations = Object.values(state.conversations).filter((conversation) =>
            conversation.participants.includes(agentId),
          );
          const peerIds = new Set(
            conversations
              .flatMap((conversation) => conversation.participants)
              .filter((id) => id !== agentId),
          );
          return {
            identity: identity!,
            conversations,
            packets: Object.values(state.packets).filter((packet) => packet.to === agentId),
            peers: Object.values(state.identities).filter((peer) => peerIds.has(peer.id)),
          } satisfies NetworkInbox;
        }
        if (route === 'messages') {
          const input = messageSchema.parse(request.payload);
          const conversation = ownConversation(state, input.conversationId, agentId);
          assert(
            !isTerminal(conversation) && !blocked(state, ...conversation.participants),
            409,
            'This conversation is closed.',
          );
          if (input.kind === 'chat')
            assert(
              conversation.state === 'connected' &&
                bothApproved(conversation) &&
                bothReady(conversation),
              409,
              'Both owners must explicitly approve before human chat.',
            );
          else {
            assert(
              conversation.state === 'negotiating' || conversation.state === 'awaiting-approval',
              409,
              'Agent negotiation is complete.',
            );
            assert(
              (state.agentPacketCounts[conversation.id] ?? 0) < 60,
              429,
              'Agent negotiation message limit reached.',
            );
          }
          assert(
            Object.values(state.packets).filter(
              (packet) => packet.conversationId === conversation.id,
            ).length < 200 && Object.keys(state.packets).length < MAX_PACKETS,
            429,
            'Acknowledge delivered messages before sending more.',
          );
          const peerId = conversation.participants.find((id) => id !== agentId)!;
          const packet: EncryptedPacket = {
            id: randomUUID(),
            conversationId: conversation.id,
            from: agentId,
            to: peerId,
            kind: input.kind,
            ciphertext: input.ciphertext,
            iv: input.iv,
            createdAt: new Date(now()).toISOString(),
          };
          state.packets[packet.id] = packet;
          retentionActivity(state).packetDeadlines[packet.id] =
            now() + RELAY_RETENTION.queuedPacketMs;
          retentionActivity(state).conversations[conversation.id] = now();
          if (packet.kind === 'agent')
            state.agentPacketCounts[conversation.id] =
              (state.agentPacketCounts[conversation.id] ?? 0) + 1;
          return packet;
        }
        if (route === 'ready') {
          const { conversationId } = referenceSchema.parse(request.payload);
          const conversation = ownConversation(state, conversationId, agentId);
          assert(
            !isTerminal(conversation) && !blocked(state, ...conversation.participants),
            409,
            'This conversation is closed.',
          );
          conversation.agentReady[agentId] = true;
          retentionActivity(state).conversations[conversation.id] = now();
          if (bothReady(conversation) && conversation.state === 'negotiating')
            conversation.state = 'awaiting-approval';
          return conversation;
        }
        if (route === 'decisions') {
          const { conversationId, decision, registrationIds } = decisionSchema.parse(
            request.payload,
          );
          const conversation = ownConversation(state, conversationId, agentId);
          assert(
            !blocked(state, ...conversation.participants) && !isTerminal(conversation),
            409,
            'This conversation is closed.',
          );
          if (decision === 'approve') {
            assert(
              conversation.participants.every(
                (id) =>
                  registrationIds?.[id] === conversation.registrationIds[id] &&
                  registrationIds[id] === state.identities[id]?.registrationId,
              ),
              409,
              'An owner registration changed. Start a fresh introduction.',
            );
            assert(
              bothReady(conversation),
              409,
              'Both owner agents must be ready before approval.',
            );
            conversation.approvals[agentId] = true;
            conversation.decisionAttestations[agentId] = attestation;
            conversation.state = bothApproved(conversation) ? 'connected' : 'awaiting-approval';
            retentionActivity(state).conversations[conversation.id] = now();
          } else {
            const hash = pairHash(...conversation.participants);
            if (
              decision === 'block' &&
              !state.blocks.some(
                (record) => record.pairHash === hash && record.blockerId === agentId,
              )
            ) {
              assert(
                state.blocks.length < 50_000 &&
                  state.blocks.filter((record) => record.blockerId === agentId).length < 500,
                429,
                'Relay block-record capacity reached.',
              );
              state.blocks.push({ pairHash: hash, blockerId: agentId });
            }
            const targets =
              decision === 'block'
                ? Object.values(state.conversations).filter(
                    (candidate) =>
                      pairKey(...candidate.participants) === pairKey(...conversation.participants),
                  )
                : [conversation];
            for (const target of targets) {
              target.state = decision === 'block' ? 'blocked' : 'declined';
              target.approvals = Object.fromEntries(target.participants.map((id) => [id, false]));
              target.decisionAttestations[agentId] = attestation;
              purgePackets(state, target.id);
              retentionActivity(state).conversations[target.id] = now();
            }
          }
          return conversation;
        }
        if (route === 'ack') {
          const { packetIds } = acknowledgmentSchema.parse(request.payload);
          for (const id of packetIds)
            assert(
              !state.packets[id] || state.packets[id].to === agentId,
              403,
              'Only the recipient may acknowledge a message.',
            );
          let removed = 0;
          for (const id of packetIds)
            if (state.packets[id]) {
              delete state.packets[id];
              removed += 1;
            }
          return { ok: true, removed };
        }
        if (route === 'leave') {
          noPayloadSchema.parse(request.payload);
          delete state.identities[agentId];
          delete retentionActivity(state).identities[agentId];
          for (const conversation of Object.values(state.conversations))
            if (conversation.participants.includes(agentId)) {
              purgePackets(state, conversation.id);
              delete state.agentPacketCounts[conversation.id];
              delete state.conversations[conversation.id];
              delete retentionActivity(state).conversations[conversation.id];
            }
          // An identity may remove its own choices, never another owner's protection.
          state.blocks = state.blocks.filter((record) => record.blockerId !== agentId);
          return { ok: true };
        }
        throw new RelayError(404, 'Relay route not found.');
      }, !['/api/network/directory', '/api/network/inbox'].includes(url.pathname));
      if (url.pathname.endsWith('/leave')) activity.delete(request.agentId);
      else activity.set(request.agentId, now());
      json(res, 200, response);
    } catch (error) {
      if (error instanceof RelayError) json(res, error.status, { error: error.message });
      else if (error instanceof z.ZodError)
        json(res, 400, { error: error.issues[0]?.message ?? 'Invalid signed request.' });
      else json(res, 500, { error: 'Relay could not complete this request.' });
    }
    return true;
  };
  return Object.assign(networkRouter, {
    sweep,
    stop() {
      closed = true;
      clearInterval(maintenance);
    },
    async close() {
      closed = true;
      clearInterval(maintenance);
      await sweeping?.catch(() => {});
      // Wait behind any authenticated mutation already queued before shutdown.
      await store.transaction(
        (state) => sweepRelayState(state, now(), activity),
        (result) => result.changed,
      );
      activity.clear();
    },
  });
}
