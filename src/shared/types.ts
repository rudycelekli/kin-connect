import type { CircleApplication } from '../communities';

export type Intent = 'friendship' | 'dating' | 'collaboration';
export type Availability = 'weekday-evenings' | 'weekends' | 'weekday-days';
export type Gender = 'woman' | 'man' | 'nonbinary' | 'self-described';
export interface OwnerProfile {
  id: string;
  name: string;
  age: number;
  city: string;
  bio: string;
  agentName: string;
  gender: Gender;
  intents: Intent[];
  interests: string[];
  values: string[];
  availability: Availability[];
  energy: 'quiet' | 'balanced' | 'outgoing';
  requirements: {
    minAge: number;
    maxAge: number;
    sameCity: boolean;
    nonsmoker: boolean;
    datingGenders: Gender[];
  };
  smoking: boolean;
  boundaries: string;
  paused: boolean;
}
export interface PublicPerson {
  id: string;
  name: string;
  age: number;
  city: string;
  bio: string;
  agentName: string;
  interests: string[];
  color: string;
  initials: string;
  illustration: 'sun' | 'flower' | 'waves' | 'moon' | 'mountain' | 'spark';
}
export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  kind: 'discover' | 'requirements' | 'interests' | 'availability' | 'proposal' | 'decision';
  text: string;
  at: string;
}
export interface Match {
  id: string;
  person: PublicPerson;
  intent: Intent;
  score: number;
  reasons: string[];
  sharedInterests: string[];
  sharedValues: string[];
  commonAvailability: Availability[];
  messages: AgentMessage[];
  plan: { title: string; detail: string; availability: Availability };
  state: 'suggested' | 'awaiting-peer' | 'connected' | 'declined' | 'blocked';
  ownerApproved: boolean;
  peerApproved: boolean;
}
export interface SessionState {
  profile: OwnerProfile | null;
  matches: Match[];
  demo: true;
  searchedAt: string | null;
  blockedPersonIds?: string[];
  circleApplications?: CircleApplication[];
  savedConnections?: SavedConnection[];
}
/** A private bookmark of a past approved introduction; it grants no network permission. */
export interface SavedConnection {
  peerId: string;
  alias: string;
  conversationId: string;
  relayURL: string;
  savedAt: string;
}
export interface SearchResult {
  matches: Match[];
  considered: number;
  excluded: number;
}
export const INTERESTS = [
  'Art & design',
  'Coffee',
  'Hiking',
  'Books',
  'Live music',
  'Cooking',
  'Photography',
  'Running',
  'Technology',
  'Film',
  'Travel',
  'Board games',
];
export const VALUES = ['Curiosity', 'Kindness', 'Creativity', 'Honesty', 'Adventure', 'Community'];
export const AVAILABILITY_LABELS: Record<Availability, string> = {
  'weekday-evenings': 'Weekday evenings',
  weekends: 'Weekends',
  'weekday-days': 'Weekday daytime',
};
