export { evaluateOwnerPolicy, evaluateEligibility } from './policy.js';
export type { PolicyCheck, Eligibility } from './policy.js';
export { proposeMeeting, simulateConversation } from './protocol.js';
export {
  PROTOCOL_VERSION,
  policyCardSchema,
  protocolMessageSchema,
  toPolicyCard,
  LocalPolicyAgent,
  runNegotiation,
} from './agent-protocol.js';
export type { PolicyCard, ProtocolMessage, NegotiationResult } from './agent-protocol.js';
export { createIntroductionBrief } from './introduction.js';
export type {
  IntroductionBrief,
  IntroductionBriefInput,
  IntroductionContext,
} from './introduction.js';
export { assessOpportunity, OPPORTUNITY_VERSION } from './opportunity.js';
export type { OpportunityAssessment, OpportunityResult } from './opportunity.js';

export { CAREER_GOALS, assessCareerGoals, isCareerGoal } from './career-goals.js';
export type { CareerGoal, CareerConnectionKind, CareerGoalAssessment } from './career-goals.js';
