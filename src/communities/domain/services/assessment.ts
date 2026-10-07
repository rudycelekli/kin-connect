import { interestKey, normalizedCity, ownerProfileSchema } from '../../../matchmaking/index.js';
import type { OwnerProfile } from '../../../shared/types.js';
import type { Circle, CircleAssessment } from '../entities/index.js';
import { circleSchema } from '../value-objects/index.js';

/** Fictional local policy simulation: no organizer is contacted and no credentials are verified. */
export function assessCircle(profile: OwnerProfile, circle: Circle): CircleAssessment {
  const ownerResult = ownerProfileSchema.safeParse(profile);
  const circleResult = circleSchema.safeParse(circle);
  const owner = ownerResult.success ? ownerResult.data : null;
  const host = circleResult.success ? circleResult.data : null;
  const sharedInterests =
    owner && host
      ? owner.interests.filter((interest) =>
          host.interests.some((label) => interestKey(label) === interestKey(interest)),
        )
      : [];
  const commonAvailability =
    owner && host ? owner.availability.filter((slot) => host.availability.includes(slot)) : [];
  const checks: CircleAssessment['checks'] = [];
  const check = (label: string, passed: boolean, yes: string, no: string) =>
    checks.push({ label, passed, detail: passed ? yes : no });

  check(
    'Complete owner policy',
    Boolean(owner),
    'The owner supplied a valid adult profile.',
    'Complete a valid adult profile before applying.',
  );
  check(
    'Circle policy',
    Boolean(host),
    'The fictional circle has a valid admission policy.',
    'Circle policy is missing or malformed.',
  );
  check(
    'Agent available',
    Boolean(owner && !owner.paused),
    'The owner’s agent is active.',
    'Resume the owner’s agent before applying.',
  );
  check(
    'Adult admission',
    Boolean(owner && host && owner.age >= host.minimumAge),
    'The circle’s adult admission rule is satisfied.',
    'The owner does not satisfy the adult admission rule.',
  );
  check(
    'City',
    Boolean(
      owner &&
        host &&
        (host.city === null || normalizedCity(owner.city) === normalizedCity(host.city)),
    ),
    'The circle’s city rule is satisfied.',
    'A valid matching city is required for this circle.',
  );
  check(
    'Purpose',
    Boolean(
      owner &&
        host &&
        (host.requiredIntent === null || owner.intents.includes(host.requiredIntent)),
    ),
    'The owner selected a compatible purpose.',
    'The owner has not selected the circle’s required purpose.',
  );
  check(
    'Shared interests',
    sharedInterests.length > 0,
    'At least one selected interest overlaps.',
    'Select a shared interest before applying.',
  );
  check(
    'Meeting window',
    commonAvailability.length > 0,
    'A selected meeting window overlaps.',
    'A shared meeting window is required.',
  );
  check(
    'Verified access',
    Boolean(host && host.requiredCredential === null),
    'This circle does not require a verified credential.',
    'Credential verification is not implemented; access remains closed.',
  );
  check(
    'Paid access',
    Boolean(host && !host.paid),
    'This circle does not require payment.',
    'Billing is not implemented; paid access remains closed.',
  );

  const eligible = checks.every((item) => item.passed);
  const alias = owner?.agentName ?? 'Owner agent';
  const hostAlias = host?.hostAgentName ?? 'Circle agent';
  const disclosures: CircleAssessment['disclosures'] = {
    alias,
    purpose: host?.requiredIntent
      ? `Explore ${host.requiredIntent} in a fictional circle.`
      : 'Explore a fictional circle.',
    interests: [...sharedInterests],
    ...(eligible && host?.city !== null && owner ? { city: owner.city } : {}),
  };
  return {
    eligible,
    checks,
    disclosures,
    messages: [
      {
        from: alias,
        text: 'Local simulation: check the circle’s admission rules using the owner’s selected facts.',
      },
      {
        from: hostAlias,
        text: 'Local simulation: check adult admission, city, purpose, shared interests and meeting windows. Credential and paid access stay closed.',
      },
      {
        from: alias,
        text: eligible
          ? 'The rules pass. An application can disclose only my agent alias, circle purpose, shared interests and a required city.'
          : 'An admission rule did not pass. No application has been sent.',
      },
      {
        from: hostAlias,
        text: eligible
          ? 'The owner must choose Apply. Organizer approval remains a separate fictional simulation.'
          : 'This fictional circle cannot accept an application under the current rules.',
      },
    ],
  };
}
