import type { DeviceIdentity } from './crypto';
import { signText } from './crypto';

export function normalizeRelayURL(input: string): string {
  const url = new URL(input.trim());
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    url.hostname === '::1';
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Use an HTTPS relay address, or HTTP on localhost.');
  return url.origin + url.pathname.replace(/\/$/, '');
}
export class RelayRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export const RELAYS_STORAGE_KEY = 'kin-network-relays-v1';
export function rememberedRelays(): string[] {
  const raw = localStorage.getItem(RELAYS_STORAGE_KEY);
  if (!raw) return [];
  const decoded = JSON.parse(raw);
  if (!Array.isArray(decoded) || decoded.some((item) => typeof item !== 'string'))
    throw new Error(
      'Remembered relay addresses are damaged. Keep your device keys until your relay registrations are resolved.',
    );
  return [...new Set(decoded.map(normalizeRelayURL))];
}
export function rememberRelay(url: string): void {
  localStorage.setItem(
    RELAYS_STORAGE_KEY,
    JSON.stringify([...new Set([...rememberedRelays(), normalizeRelayURL(url)])]),
  );
}
export function forgetRelay(url: string): void {
  const remaining = rememberedRelays().filter((item) => item !== normalizeRelayURL(url));
  if (remaining.length) localStorage.setItem(RELAYS_STORAGE_KEY, JSON.stringify(remaining));
  else localStorage.removeItem(RELAYS_STORAGE_KEY);
}

export class RelayClient {
  readonly url: string;
  constructor(
    url: string,
    private identity: DeviceIdentity,
  ) {
    this.url = normalizeRelayURL(url);
  }
  async request<T>(
    path: string,
    payload: Record<string, unknown> = {},
    beforePost?: () => void,
  ): Promise<T> {
    if (!/^\/api\/network\/[a-z-]+$/.test(path)) throw new Error('Invalid relay endpoint.');
    const response = await fetch(
      `${this.url}/api/network/challenge?agentId=${encodeURIComponent(this.identity.id)}`,
      { mode: 'cors', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(12000) },
    );
    const challenge = await response.json();
    if (
      !response.ok ||
      typeof challenge.challengeId !== 'string' ||
      typeof challenge.nonce !== 'string'
    )
      throw new Error(
        typeof challenge.error === 'string' ? challenge.error : 'Could not reach the relay.',
      );
    const signedText = JSON.stringify({
      path,
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      payload,
    });
    const signature = await signText(this.identity, signedText);
    // Challenge fetching and signing are asynchronous: the owner may revoke while they run.
    beforePost?.();
    const result = await fetch(`${this.url}${path}`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: this.identity.id,
        challengeId: challenge.challengeId,
        payload,
        signature,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok)
      throw new RelayRequestError(
        result.status,
        typeof data.error === 'string' ? data.error : 'The relay could not complete that request.',
      );
    if (
      path === '/api/network/register' &&
      (data.attestation?.signedText !== signedText ||
        data.attestation?.signature !== signature ||
        typeof payload.registrationNonce !== 'string' ||
        data.registrationId !== payload.registrationNonce)
    )
      throw new Error('The relay returned a stale or altered registration receipt.');
    return data as T;
  }
}
