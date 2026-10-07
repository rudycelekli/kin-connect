import type { Match } from '../../shared/types.js';
import type { MatchConsentAction } from '../domain/events/index.js';

/** Consent is an owner action. An agent recommendation cannot approve an owner. */
export function transitionMatch(match: Match, action: MatchConsentAction): Match {
  if (match.state === 'blocked') throw new Error('Blocked introductions are terminal.');
  if (action === 'block')
    return { ...match, state: 'blocked', ownerApproved: false, peerApproved: false };
  if (match.state === 'declined')
    throw new Error('Declined introductions cannot be approved. Start a fresh search.');
  if (action === 'decline')
    return { ...match, state: 'declined', ownerApproved: false, peerApproved: false };
  if (action === 'approve') {
    if (match.state === 'connected') return { ...match };
    return {
      ...match,
      state: match.peerApproved ? 'connected' : 'awaiting-peer',
      ownerApproved: true,
    };
  }
  if (action === 'peer-approve') {
    if (!match.ownerApproved)
      throw new Error('The first owner must approve before requesting peer consent.');
    return { ...match, state: 'connected', peerApproved: true };
  }
  throw new Error('Unknown consent action.');
}
