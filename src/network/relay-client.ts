import type { DeviceIdentity } from './crypto';
import { base64url, signText, unbase64url } from './crypto';

/** One deadline includes challenge retrieval, signing, posting and response-body consumption. */
export const RELAY_REQUEST_TIMEOUT_MS = 24_000;
export const RELAY_RESPONSE_LIMITS = Object.freeze({
  challenge: 1024,
  directory: 4 * 1024 * 1024,
  inbox: 48 * 1024 * 1024,
  write: 64 * 1024,
});
// The current relay allows 200 identities, 2,000 conversations and 2,000 packets. An inbox may
// include all 2,000 16,000-character ciphertexts; its bound must accommodate legitimate traffic.
// These are defensive transport bounds for those contracts, not a scalability guarantee.
const messages = {
  invalidPayload: 'The relay request payload is invalid or too large.',
  unreachable: 'The relay could not be reached.',
  timeout: 'The relay request did not finish before the deadline.',
  redirect: 'The relay returned an unsupported redirect or response address.',
  invalidResponse: 'The relay returned an invalid JSON response.',
  tooLarge: 'The relay response exceeded the size limit.',
  invalidChallenge: 'The relay returned an invalid signing challenge.',
  signing: 'The device could not sign the relay request.',
  cancelled: 'The relay request was cancelled before sending.',
  rejected: 'The relay rejected this request. Check the selected information.',
  unauthorized: 'The relay could not authenticate this request.',
  absent: 'Register this identity before using the relay.',
  forbidden: 'The relay did not allow this request.',
  missing: 'The relay could not find the requested resource.',
  conflict: 'This connection may be closed or changed. Refresh and try again.',
  rateLimit: 'Relay rate limit reached. Try again in a minute.',
  failed: 'The relay could not complete that request.',
  receipt: 'The relay returned a stale or altered registration receipt.',
} as const;
const fixedMessages = new Set<string>(Object.values(messages));
const fail = (code: keyof typeof messages, status = 0) =>
  new RelayRequestError(status, messages[code]);
const encoder = new TextEncoder();

function cancelBody(response: Response): void {
  void response.body?.cancel().catch(() => {});
}

async function readBoundedJSON(
  response: Response,
  limit: number,
  signal: AbortSignal,
  checkDeadline: () => void,
): Promise<Record<string, unknown>> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
    cancelBody(response);
    throw fail('invalidResponse');
  }
  if (length !== null && Number(length) > limit) {
    cancelBody(response);
    throw fail('tooLarge');
  }
  if (
    response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
      'application/json' ||
    !response.body
  ) {
    cancelBody(response);
    throw fail('invalidResponse');
  }
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  let bytes = 0;
  // Coalesce decoded chunks: an adversarial stream of tiny chunks cannot grow an unbounded array.
  const parts: string[] = [];
  let pending = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    checkDeadline();
    for (;;) {
      const { value, done } = await reader.read();
      checkDeadline();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        cancel();
        throw fail('tooLarge');
      }
      pending += decoder.decode(value, { stream: true });
      if (pending.length >= 65_536) {
        parts.push(pending);
        pending = '';
      }
    }
    pending += decoder.decode();
    parts.push(pending);
    const result: unknown = JSON.parse(parts.join(''));
    checkDeadline();
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw fail('invalidResponse');
    return result as Record<string, unknown>;
  } catch (error) {
    cancel();
    checkDeadline();
    if (error instanceof RelayRequestError && fixedMessages.has(error.message)) throw error;
    throw fail('invalidResponse');
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

function validChallenge(value: Record<string, unknown>): value is {
  challengeId: string;
  nonce: string;
} {
  if (
    Object.keys(value).length !== 2 ||
    typeof value.challengeId !== 'string' ||
    !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value.challengeId) ||
    typeof value.nonce !== 'string' ||
    !/^[A-Za-z\d_-]{43}$/.test(value.nonce)
  )
    return false;
  try {
    const bytes = unbase64url(value.nonce);
    return bytes.byteLength === 32 && base64url(bytes) === value.nonce;
  } catch {
    return false;
  }
}

function statusError(status: number, absent = false): RelayRequestError {
  if (status === 429) return fail('rateLimit', status);
  if (status === 401) return fail(absent ? 'absent' : 'unauthorized', status);
  if (status === 403) return fail('forbidden', status);
  if (status === 404) return fail('missing', status);
  if (status === 409) return fail('conflict', status);
  if (status >= 400 && status < 500) return fail('rejected', status);
  return fail('failed', status);
}

export function normalizeRelayURL(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Use an HTTPS relay address, or HTTP on localhost.');
  }
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
    const controller = new AbortController();
    const expiresAt = performance.now() + RELAY_REQUEST_TIMEOUT_MS;
    const checkDeadline = () => {
      if (controller.signal.aborted || performance.now() >= expiresAt) {
        controller.abort();
        throw fail('timeout');
      }
    };
    let timer!: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(fail('timeout'));
      }, RELAY_REQUEST_TIMEOUT_MS);
    });
    const work = async (): Promise<T> => {
      let identity: DeviceIdentity;
      let snapshot: Record<string, unknown>;
      try {
        // Capture both payload bytes and device keys before any signing/network await. A caller's
        // later nested mutation cannot alter the signed request, POST body or receipt comparison.
        identity = structuredClone(this.identity);
        const serialized = JSON.stringify(payload);
        if (typeof serialized !== 'string' || encoder.encode(serialized).byteLength > 32_768)
          throw fail('invalidPayload');
        const parsed: unknown = JSON.parse(serialized);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw fail('invalidPayload');
        snapshot = parsed as Record<string, unknown>;
        if (!/^[a-f\d]{64}$/.test(identity.id)) throw fail('invalidPayload');
      } catch {
        throw fail('invalidPayload');
      }
      const fetchResponse = async (address: string, init: RequestInit): Promise<Response> => {
        checkDeadline();
        let response: Response;
        try {
          response = await fetch(address, {
            ...init,
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error',
            signal: controller.signal,
          });
        } catch {
          checkDeadline();
          throw fail('unreachable');
        }
        if (
          controller.signal.aborted ||
          response.redirected ||
          response.type === 'opaqueredirect' ||
          response.type === 'opaque' ||
          (response.url && response.url !== address) ||
          (response.status >= 300 && response.status < 400)
        ) {
          cancelBody(response);
          checkDeadline();
          throw fail('redirect', response.status);
        }
        checkDeadline();
        return response;
      };
      const response = await fetchResponse(
        `${this.url}/api/network/challenge?agentId=${encodeURIComponent(identity.id)}`,
        {},
      );
      if (!response.ok) {
        cancelBody(response);
        throw statusError(response.status);
      }
      const challenge = await readBoundedJSON(
        response,
        RELAY_RESPONSE_LIMITS.challenge,
        controller.signal,
        checkDeadline,
      );
      if (!validChallenge(challenge)) throw fail('invalidChallenge');
      const signedText = JSON.stringify({
        path,
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        payload: snapshot,
      });
      let signature: string;
      try {
        signature = await signText(identity, signedText);
      } catch {
        checkDeadline();
        throw fail('signing');
      }
      checkDeadline();
      // The owner may revoke during challenge retrieval or signing. Run their guard immediately
      // before POST, while keeping the already captured signed payload immutable.
      try {
        beforePost?.();
      } catch {
        throw fail('cancelled');
      }
      checkDeadline();
      const body = JSON.stringify({
        agentId: identity.id,
        challengeId: challenge.challengeId,
        payload: snapshot,
        signature,
      });
      if (encoder.encode(body).byteLength > 32_768) throw fail('invalidPayload');
      const result = await fetchResponse(`${this.url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!result.ok) {
        let absent = false;
        // Keep the existing deletion compatibility case using one exact allowlisted message;
        // never surface arbitrary relay text, including its JSON parser or signature errors.
        if (result.status === 401 && path === '/api/network/leave') {
          try {
            const error = await readBoundedJSON(
              result,
              RELAY_RESPONSE_LIMITS.challenge,
              controller.signal,
              checkDeadline,
            );
            absent = error.error === messages.absent;
          } catch {
            checkDeadline();
          }
        } else cancelBody(result);
        throw statusError(result.status, absent);
      }
      const data = await readBoundedJSON(
        result,
        path === '/api/network/inbox'
          ? RELAY_RESPONSE_LIMITS.inbox
          : path === '/api/network/directory'
            ? RELAY_RESPONSE_LIMITS.directory
            : RELAY_RESPONSE_LIMITS.write,
        controller.signal,
        checkDeadline,
      );
      const attestation = data.attestation as
        | { signedText?: unknown; signature?: unknown }
        | undefined;
      if (
        path === '/api/network/register' &&
        (attestation?.signedText !== signedText ||
          attestation?.signature !== signature ||
          typeof snapshot.registrationNonce !== 'string' ||
          data.registrationId !== snapshot.registrationNonce)
      )
        throw fail('receipt');
      return data as T;
    };
    try {
      return await Promise.race([work(), deadline]);
    } catch (error) {
      checkDeadline();
      if (error instanceof RelayRequestError && fixedMessages.has(error.message)) throw error;
      throw fail('unreachable');
    } finally {
      clearTimeout(timer);
    }
  }
}
