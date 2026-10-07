import { assessCareerGoals } from './career-goals.js';
import {
  AVAILABILITY_LABELS,
  type Availability,
  type Intent,
  type Match,
} from '../../../shared/types.js';

export function proposeMeeting(
  intent: Intent,
  interests: string[],
  slot: Availability,
  context: { sameCity?: boolean; declaredInterests?: { owner: string[]; peer: string[] } } = {},
): Match['plan'] {
  const timing = AVAILABILITY_LABELS[slot].toLowerCase();
  const career =
    intent === 'collaboration' && context.declaredInterests
      ? assessCareerGoals(context.declaredInterests.owner, context.declaredInterests.peer)
          .connections[0]
      : undefined;
  if (career)
    return {
      title: career.title,
      detail: `${career.detail} Try a short ${context.sameCity === false ? 'online conversation' : 'conversation at a public café'} during ${timing}. Choose how to connect after both approve; no role, offer, or commitment is implied.`,
      availability: slot,
    };
  if (context.sameCity === false)
    return {
      title:
        intent === 'collaboration'
          ? 'A small idea, from wherever you are'
          : 'A first hello, from wherever you are',
      detail: `Try a short online conversation during ${timing}${intent === 'collaboration' ? ', bringing one idea each' : ''}. Choose how to connect after you both approve; decide together before making travel plans.`,
      availability: slot,
    };
  if (intent === 'collaboration')
    return {
      title: 'A little idea, a good conversation',
      detail: `Try a 30-minute brainstorm at a public café during ${timing}. Pick one small project together after you both approve.`,
      availability: slot,
    };
  if (interests.includes('Books'))
    return {
      title: 'Coffee & a bookstore wander',
      detail: `Start with coffee, then trade book picks in a public bookstore during ${timing}. A relaxed first hello, around 45 minutes.`,
      availability: slot,
    };
  if (interests.includes('Art & design'))
    return {
      title: 'A gallery, then a good coffee',
      detail: `Browse a public gallery together during ${timing}. Keep the first hello short, with a coffee stop if you both feel like it.`,
      availability: slot,
    };
  if (interests.includes('Hiking') || interests.includes('Running'))
    return {
      title: 'A walk with room to talk',
      detail: `Meet for a 30-minute walk in a busy public park during ${timing}. Choose the place together once you both approve.`,
      availability: slot,
    };
  if (interests.includes('Board games'))
    return {
      title: 'One game, one new connection',
      detail: `Try a casual game at a public board-game café during ${timing}. Start with something quick and easy to learn.`,
      availability: slot,
    };
  return {
    title: 'Coffee & a first hello',
    detail: `Try a 30-minute conversation at a public café during ${timing}. Choose the place together after you both approve.`,
    availability: slot,
  };
}
