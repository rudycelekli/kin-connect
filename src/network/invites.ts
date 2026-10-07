import { normalizeRelayURL } from './relay-client';

const CLIENT_URL = 'https://rudycelekli.github.io/kin-connect/';
const INVALID_INVITE = 'This network invite is invalid.';
const MAX_RELAY_LENGTH = 2048;

/** An invite chooses a network address. Opening it never joins or publishes a capsule. */
export function readRelayInvite(pageURL: string): {
  relayURL: string | null;
  error: string | null;
} {
  try {
    const parameters = new URL(pageURL).searchParams;
    const addresses = parameters.getAll('relay');
    if (!addresses.length) return { relayURL: null, error: null };
    if (addresses.length !== 1 || !addresses[0].trim() || addresses[0].length > MAX_RELAY_LENGTH)
      return { relayURL: null, error: INVALID_INVITE };
    return { relayURL: normalizeRelayURL(addresses[0]), error: null };
  } catch {
    return { relayURL: null, error: INVALID_INVITE };
  }
}

/** Local invites stay on that device's app; HTTPS network invites use the public client. */
export function createRelayInviteURL(relayURL: string): string {
  if (relayURL.length > MAX_RELAY_LENGTH) throw new Error(INVALID_INVITE);
  const normalized = normalizeRelayURL(relayURL);
  const relay = new URL(normalized);
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(relay.hostname);
  const invite = new URL(loopback ? `${normalized}/` : CLIENT_URL);
  invite.searchParams.set('kin', 'network');
  invite.searchParams.set('relay', normalized);
  return invite.href;
}
