import type { Match } from '../../shared/types.js';

/** Refresh unapproved suggestions; reviewed or terminal proposals retain their facts and decisions. */
export function refreshSuggestion(previous: Match | undefined, latest: Match): Match {
  if (!previous) return latest;
  if (
    previous.id !== latest.id ||
    previous.person.id !== latest.person.id ||
    previous.intent !== latest.intent
  )
    throw new Error('Cannot carry decisions between different introductions.');
  return previous.state === 'suggested' && !previous.ownerApproved && !previous.peerApproved
    ? latest
    : previous;
}
