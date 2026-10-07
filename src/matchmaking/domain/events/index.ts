import type { Match } from '../../../shared/types.js';

export type MatchConsentAction = 'approve' | 'peer-approve' | 'decline' | 'block';
export interface MatchConsentChanged {
  type: 'MatchConsentChanged';
  matchId: string;
  action: MatchConsentAction;
  state: Match['state'];
}
