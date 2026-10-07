import type { OwnerProfile, PublicPerson } from '../../../shared/types.js';
import { validateProfile } from '../value-objects/index.js';

const illustrations: PublicPerson['illustration'][] = [
  'sun',
  'flower',
  'waves',
  'moon',
  'mountain',
  'spark',
];
const colors = ['#f4cd78', '#d7e6bc', '#b5d6e1', '#cbc4e6', '#e8bba5', '#efb6c4'];

/** Explicit allowlist. Never spread an owner profile into a network payload. */
export function toPublicPerson(input: OwnerProfile, variant = 0): PublicPerson {
  const profile = validateProfile(input);
  const index = Math.abs(variant) % illustrations.length;
  return {
    id: profile.id,
    name: profile.name,
    age: profile.age,
    city: profile.city,
    bio: profile.bio,
    agentName: profile.agentName,
    interests: [...profile.interests],
    color: colors[index],
    initials: profile.name
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .slice(0, 2)
      .join('')
      .toUpperCase(),
    illustration: illustrations[index],
  };
}
