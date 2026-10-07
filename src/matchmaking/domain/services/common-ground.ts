import type { Availability, OwnerProfile } from '../../../shared/types.js';
import { interestKey } from '../value-objects/index.js';

type DeclaredPreferences = Pick<OwnerProfile, 'interests' | 'values' | 'availability'>;
const windows: Availability[] = ['weekday-evenings', 'weekends', 'weekday-days'];
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Callers validate cards/profiles first. List ordering is not a stated preference. */
export function commonGround(first: DeclaredPreferences, second: DeclaredPreferences) {
  const peerInterests = new Set(second.interests.map(interestKey));
  const peerValues = new Set(second.values);
  return {
    sharedInterests: first.interests
      .filter((label) => peerInterests.has(interestKey(label)))
      .sort((a, b) => compare(interestKey(a), interestKey(b))),
    sharedValues: first.values.filter((value) => peerValues.has(value)).sort(compare),
    commonAvailability: windows.filter(
      (slot) => first.availability.includes(slot) && second.availability.includes(slot),
    ),
  };
}

/** Complete semantic intersection; proposal order and custom-label casing are immaterial. */
export function sameDeclaredSet(
  proposed: readonly string[],
  expected: readonly string[],
  key: (label: string) => string = (label) => label,
): boolean {
  const actual = new Set(proposed.map(key));
  return actual.size === expected.length && expected.every((label) => actual.has(key(label)));
}
