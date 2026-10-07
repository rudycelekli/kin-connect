import type { CircleApplication } from '../entities/index.js';

export type CircleApplicationAction = 'simulate-organizer-approval' | 'decline' | 'withdraw';
export interface CircleApplicationChanged {
  type: 'CircleApplicationChanged';
  applicationId: string;
  action: CircleApplicationAction;
  state: CircleApplication['state'];
}
