import type { Intent } from './types';
export interface AgentCapsule {
  alias: string;
  intents: Intent[];
  interests: string[];
  purpose: string;
}
export interface NetworkIdentity {
  registrationId: string;
  id: string;
  signingKey: JsonWebKey;
  exchangeKey: JsonWebKey;
  capsule: AgentCapsule;
  attestation?: { signedText: string; signature: string };
}
export interface NetworkConversation {
  registrationIds: Record<string, string>;
  id: string;
  participants: [string, string];
  approvals: Record<string, boolean>;
  agentReady: Record<string, boolean>;
  state: 'negotiating' | 'awaiting-approval' | 'connected' | 'declined' | 'blocked';
  createdAt: string;
  decisionAttestations?: Record<string, { signedText: string; signature: string }>;
}
export interface EncryptedPacket {
  id: string;
  conversationId: string;
  from: string;
  to: string;
  kind: 'agent' | 'chat';
  ciphertext: string;
  iv: string;
  createdAt: string;
}
export interface SignedRequest {
  agentId: string;
  challengeId: string;
  payload: Record<string, unknown>;
  signature: string;
}
export interface NetworkInbox {
  identity: NetworkIdentity;
  conversations: NetworkConversation[];
  packets: EncryptedPacket[];
  peers: NetworkIdentity[];
}
export const NETWORK_VERSION = 'kin-relay/0.1';
