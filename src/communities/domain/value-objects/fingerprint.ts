import { validateProfile } from '../../../matchmaking/index.js';
import type { OwnerProfile } from '../../../shared/types.js';
import type { Circle } from '../entities/index.js';
import { validateCircle } from './validation.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Compact, deterministic local change detector. This is not a cryptographic identity or proof. */
function digest(value: unknown): string {
  const text = canonical(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index++) {
    first = Math.imul(first ^ text.charCodeAt(index), 0x01000193);
    second = Math.imul(second ^ text.charCodeAt(index), 0x85ebca6b);
  }
  return [first, second].map((part) => (part >>> 0).toString(16).padStart(8, '0')).join('');
}

/** Private fields affect change detection but the exportable result never contains their text. */
export function profileFingerprint(profile: OwnerProfile): string {
  return `local-profile-v1-${digest(validateProfile(profile))}`;
}

export function circleFingerprint(circle: Circle): string {
  return `local-circle-v1-${digest(validateCircle(circle))}`;
}
