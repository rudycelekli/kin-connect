import type { Availability, Intent } from '../../../shared/types.js';

export interface Circle {
  id: string;
  name: string;
  kind: 'social' | 'networking' | 'creative';
  city: string | null;
  description: string;
  hostAgentName: string;
  interests: string[];
  availability: Availability[];
  minimumAge: number;
  requiredIntent: Intent | null;
  requiredCredential: string | null;
  paid: boolean;
}

export interface CircleAssessment {
  eligible: boolean;
  checks: { label: string; passed: boolean; detail: string }[];
  messages: { from: string; text: string }[];
  disclosures: { alias: string; purpose: string; city?: string; interests: string[] };
}

export interface CircleApplication {
  id: string;
  circleId: string;
  profileFingerprint: string;
  circleFingerprint: string;
  state: 'pending-organizer' | 'member' | 'declined' | 'withdrawn';
  ownerApproved: boolean;
  organizerApproved: boolean;
  disclosures: CircleAssessment['disclosures'];
}
