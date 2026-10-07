import { NETWORK_VERSION, type NetworkIdentity } from '../shared/network-types';

export const IDENTITY_STORAGE_KEY = 'kin-network-identity-v1';
export interface DeviceIdentity {
  id: string;
  signingKey: JsonWebKey;
  exchangeKey: JsonWebKey;
  signingPrivate: JsonWebKey;
  exchangePrivate: JsonWebKey;
}
const encoder = new TextEncoder();
export function canonicalKey(key: JsonWebKey): JsonWebKey {
  if (key.kty !== 'EC' || key.crv !== 'P-256' || !key.x || !key.y || key.d)
    throw new Error('The relay supplied an invalid public key.');
  return { kty: 'EC', crv: 'P-256', x: key.x, y: key.y };
}
export function base64url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
export function unbase64url(input: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) throw new Error('Invalid encrypted message encoding.');
  const binary = atob(input.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
export async function identityId(signingKey: JsonWebKey): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(JSON.stringify(canonicalKey(signingKey))),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function createDeviceIdentity(): Promise<DeviceIdentity> {
  const signing = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const exchange = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const signingKey = canonicalKey(await crypto.subtle.exportKey('jwk', signing.publicKey));
  const exchangeKey = canonicalKey(await crypto.subtle.exportKey('jwk', exchange.publicKey));
  return {
    id: await identityId(signingKey),
    signingKey,
    exchangeKey,
    signingPrivate: await crypto.subtle.exportKey('jwk', signing.privateKey),
    exchangePrivate: await crypto.subtle.exportKey('jwk', exchange.privateKey),
  };
}
export async function loadDeviceIdentity(
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): Promise<DeviceIdentity> {
  const saved = storage.getItem(IDENTITY_STORAGE_KEY);
  if (saved) {
    const candidate = JSON.parse(saved) as DeviceIdentity;
    if (
      candidate.id !== (await identityId(candidate.signingKey)) ||
      !candidate.signingPrivate.d ||
      !candidate.exchangePrivate.d
    )
      throw new Error(
        'Your saved device identity is damaged. Forget it to create a fresh identity.',
      );
    canonicalKey(candidate.exchangeKey);
    await crypto.subtle.importKey(
      'jwk',
      candidate.signingPrivate,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    await crypto.subtle.importKey(
      'jwk',
      candidate.exchangePrivate,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
    return candidate;
  }
  const identity = await createDeviceIdentity();
  storage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  return identity;
}
export async function signText(identity: DeviceIdentity, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'jwk',
    identity.signingPrivate,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  return base64url(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(text)),
  );
}
export async function verifyPeerIdentity(
  peer: NetworkIdentity & {
    attestation?: { signedText: string; signature: string };
    registrationId?: string;
  },
): Promise<void> {
  if (peer.id !== (await identityId(peer.signingKey)))
    throw new Error('A peer’s signing identity could not be verified.');
  canonicalKey(peer.exchangeKey);
  if (!peer.attestation) throw new Error('A peer has no signed registration proof.');
  const proof = JSON.parse(peer.attestation.signedText) as {
    path?: string;
    challengeId?: string;
    payload?: {
      signingKey?: JsonWebKey;
      exchangeKey?: JsonWebKey;
      capsule?: unknown;
      registrationNonce?: string;
    };
  };
  if (
    proof.path !== '/api/network/register' ||
    typeof peer.registrationId !== 'string' ||
    peer.registrationId !== proof.payload?.registrationNonce ||
    !proof.payload?.signingKey ||
    !proof.payload.exchangeKey
  )
    throw new Error('A peer’s registration proof is invalid.');
  if (
    JSON.stringify(canonicalKey(proof.payload.signingKey)) !==
      JSON.stringify(canonicalKey(peer.signingKey)) ||
    JSON.stringify(canonicalKey(proof.payload.exchangeKey)) !==
      JSON.stringify(canonicalKey(peer.exchangeKey)) ||
    JSON.stringify(proof.payload.capsule) !== JSON.stringify(peer.capsule)
  )
    throw new Error('A peer’s directory information does not match its signed registration.');
  const signing = await crypto.subtle.importKey(
    'jwk',
    canonicalKey(peer.signingKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    signing,
    unbase64url(peer.attestation.signature),
    encoder.encode(peer.attestation.signedText),
  );
  if (!verified) throw new Error('A peer’s registration signature could not be verified.');
}
export async function deriveChannelKey(
  identity: DeviceIdentity,
  peerKey: JsonWebKey,
  conversationId: string,
): Promise<CryptoKey> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    identity.exchangePrivate,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    canonicalKey(peerKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const secret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256,
  );
  const keyMaterial = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  const salt = await crypto.subtle.digest('SHA-256', encoder.encode(conversationId));
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(`${NETWORK_VERSION} channel`) },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export interface ChannelEnvelope {
  conversationId: string;
  from: string;
  to: string;
  kind: 'agent' | 'chat';
}
export function channelAAD(envelope: ChannelEnvelope): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    JSON.stringify({
      version: NETWORK_VERSION,
      conversationId: envelope.conversationId,
      from: envelope.from,
      to: envelope.to,
      kind: envelope.kind,
    }),
  );
}
export async function encryptMessage(
  key: CryptoKey,
  envelope: ChannelEnvelope,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: channelAAD(envelope), tagLength: 128 },
    key,
    encoder.encode(plaintext),
  );
  return { ciphertext: base64url(ciphertext), iv: base64url(iv) };
}
export async function decryptMessage(
  key: CryptoKey,
  envelope: ChannelEnvelope,
  packet: { ciphertext: string; iv: string },
): Promise<string> {
  const iv = unbase64url(packet.iv);
  if (iv.byteLength !== 12) throw new Error('Invalid encrypted message IV.');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: channelAAD(envelope), tagLength: 128 },
    key,
    unbase64url(packet.ciphertext),
  );
  return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
}

export async function verifyConversationApprovals(
  conversation: {
    id: string;
    participants: [string, string];
    approvals: Record<string, boolean>;
    state: string;
    decisionAttestations?: Record<string, { signedText: string; signature: string }>;
    registrationIds?: Record<string, string>;
  },
  identities: Map<string, NetworkIdentity>,
): Promise<boolean> {
  if (
    conversation.state !== 'connected' ||
    !conversation.participants.every((id) => conversation.approvals[id])
  )
    return false;
  for (const id of conversation.participants) {
    const receipt = conversation.decisionAttestations?.[id],
      identity = identities.get(id);
    if (!receipt || !identity || !conversation.registrationIds) return false;
    const registrationId = (identity as NetworkIdentity & { registrationId?: string })
      .registrationId;
    if (!registrationId || conversation.registrationIds[id] !== registrationId) return false;
    const proof = JSON.parse(receipt.signedText) as {
      path?: string;
      payload?: {
        conversationId?: string;
        decision?: string;
        registrationIds?: Record<string, string>;
      };
    };
    if (
      proof.path !== '/api/network/decisions' ||
      proof.payload?.conversationId !== conversation.id ||
      proof.payload.decision !== 'approve' ||
      !proof.payload.registrationIds ||
      Object.keys(proof.payload.registrationIds).length !== 2 ||
      !conversation.participants.every(
        (participant) =>
          proof.payload!.registrationIds![participant] ===
          conversation.registrationIds![participant],
      )
    )
      return false;
    const key = await crypto.subtle.importKey(
      'jwk',
      canonicalKey(identity.signingKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    if (
      !(await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        unbase64url(receipt.signature),
        encoder.encode(receipt.signedText),
      ))
    )
      return false;
  }
  return true;
}

export function assertOwnRegistration(
  expected: { id: string; registrationId: string },
  returned: NetworkIdentity,
): void {
  if (returned.id !== expected.id || returned.registrationId !== expected.registrationId)
    throw new Error('The relay returned a stale owner registration.');
}
export function assertPeerRegistration(
  pinned: NetworkIdentity | undefined,
  returned: NetworkIdentity,
): void {
  if (
    pinned &&
    (pinned.id !== returned.id ||
      pinned.registrationId !== returned.registrationId ||
      JSON.stringify(canonicalKey(pinned.exchangeKey)) !==
        JSON.stringify(canonicalKey(returned.exchangeKey)))
  )
    throw new Error(
      'This peer’s registration or encryption key changed. Start a new introduction.',
    );
}
