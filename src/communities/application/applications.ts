import type { OwnerProfile } from '../../shared/types.js';
import {
  assessCircle,
  circleFingerprint,
  profileFingerprint,
  validateCircleApplication,
  type Circle,
  type CircleApplication,
  type CircleApplicationAction,
} from '../domain/index.js';

/** Call only after an explicit owner Apply action. This never approves the organizer’s side. */
export function applyToCircle(profile: OwnerProfile, circle: Circle): CircleApplication {
  const assessment = assessCircle(profile, circle);
  if (!assessment.eligible) throw new Error('Circle admission requirements are not satisfied.');
  return validateCircleApplication({
    id: globalThis.crypto.randomUUID(),
    circleId: circle.id,
    profileFingerprint: profileFingerprint(profile),
    circleFingerprint: circleFingerprint(circle),
    state: 'pending-organizer',
    ownerApproved: true,
    organizerApproved: false,
    disclosures: assessment.disclosures,
  });
}

/** Organizer approval is explicitly simulated; it is not a shared or verified membership. */
export function transitionCircleApplication(
  profile: OwnerProfile,
  circle: Circle,
  application: CircleApplication,
  action: CircleApplicationAction,
): CircleApplication {
  const current = validateCircleApplication(application);
  if (current.circleId !== circle.id)
    throw new Error('This application belongs to a different circle.');
  if (
    current.profileFingerprint !== profileFingerprint(profile) ||
    current.circleFingerprint !== circleFingerprint(circle)
  )
    throw new Error('The owner or circle policy changed. Make a fresh application.');
  if (current.state === 'declined' || current.state === 'withdrawn')
    throw new Error('A closed application cannot be reopened.');
  const assessment = assessCircle(profile, circle);
  if (!assessment.eligible) throw new Error('Circle admission requirements are not satisfied.');
  if (
    current.disclosures.alias !== assessment.disclosures.alias ||
    current.disclosures.purpose !== assessment.disclosures.purpose ||
    current.disclosures.city !== assessment.disclosures.city ||
    JSON.stringify(current.disclosures.interests) !==
      JSON.stringify(assessment.disclosures.interests)
  )
    throw new Error('Application disclosures do not match the approved owner facts.');
  if (action === 'simulate-organizer-approval') {
    if (current.state !== 'pending-organizer' || !current.ownerApproved)
      throw new Error('Organizer approval requires an existing owner-approved application.');
    return validateCircleApplication({ ...current, state: 'member', organizerApproved: true });
  }
  if (action !== 'decline' && action !== 'withdraw')
    throw new Error('Unknown circle application action.');
  return validateCircleApplication({
    ...current,
    state: action === 'decline' ? 'declined' : 'withdrawn',
    ownerApproved: false,
    organizerApproved: false,
  });
}
