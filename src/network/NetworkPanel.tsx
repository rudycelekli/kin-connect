import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCheck,
  CircleHelp,
  Code2,
  Copy,
  Globe2,
  KeyRound,
  LockKeyhole,
  LogOut,
  MessageCircle,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  AgentCapsule,
  EncryptedPacket,
  NetworkConversation,
  NetworkIdentity,
  NetworkInbox,
} from '../shared/network-types';
import type { Availability, Intent, OwnerProfile, SavedConnection } from '../shared/types';
import { AVAILABILITY_LABELS } from '../shared/types';
import {
  containsRecognizableContact,
  createIntroductionBrief,
  LocalPolicyAgent,
  protocolMessageSchema,
  type ProtocolMessage,
} from '../matchmaking';
import {
  assertOwnRegistration,
  assertPeerRegistration,
  decryptMessage,
  deriveChannelKey,
  encryptMessage,
  IDENTITY_STORAGE_KEY,
  loadDeviceIdentity,
  verifyConversationApprovals,
  verifyPeerIdentity,
  type DeviceIdentity,
} from './crypto';
import {
  forgetRelay,
  normalizeRelayURL,
  rememberRelay,
  rememberedRelays,
  RelayClient,
  RelayRequestError,
} from './relay-client';
import { FlowerMark } from '../components/Portrait';
import { createRelayInviteURL, readRelayInvite } from './invites';
import './network.css';

interface Trace {
  id: string;
  conversationId: string;
  direction: 'in' | 'out';
  kind: 'agent' | 'chat';
  type: string;
  text: string;
  at: string;
}
type Plan = { title: string; detail: string; availability: keyof typeof AVAILABILITY_LABELS };
type CommonFacts = { sharedInterests: string[]; sharedValues: string[]; slot: Availability };
interface Runtime {
  identity: DeviceIdentity;
  registrationId: string;
  client: RelayClient;
  agent: LocalPolicyAgent;
  capsule: AgentCapsule;
  identities: Map<string, NetworkIdentity>;
  pins: Map<string, NetworkIdentity>;
  keys: Map<string, CryptoKey>;
  processed: Set<string>;
  received: Map<string, string>;
  replies: Map<string, ProtocolMessage | null>;
  outgoing: Map<string, Set<string>>;
  traced: Set<string>;
  ready: Set<string>;
  blockedPeers: Set<string>;
  closedConversationIds: Set<string>;
  pendingDecisions: Map<string, 'decline' | 'block'>;
  conversationIntents: Map<string, Intent>;
  commonFacts: Map<string, CommonFacts>;
  active: boolean;
  profileSnapshot: string;
  directoryPeers: NetworkIdentity[];
  lastDirectory: number;
  retryAt: number;
}
// Local revocations take precedence over relay snapshots, including valid historical receipts.
function localTerminalState(runtime: Runtime, conversation: NetworkConversation) {
  if (
    conversation.participants.some(
      (id) => id !== runtime.identity.id && runtime.blockedPeers.has(id),
    )
  )
    return 'blocked' as const;
  return runtime.closedConversationIds.has(conversation.id) ? ('declined' as const) : null;
}
function locallyClosed(runtime: Runtime, conversationId: string, peerId?: string) {
  const peer = peerId || runtime.pins.get(conversationId)?.id;
  return (
    runtime.closedConversationIds.has(conversationId) || !!(peer && runtime.blockedPeers.has(peer))
  );
}
function withLocalTerminal(
  runtime: Runtime,
  conversation: NetworkConversation,
): NetworkConversation {
  const state = localTerminalState(runtime, conversation);
  return state
    ? {
        ...conversation,
        state,
        approvals: Object.fromEntries(conversation.participants.map((id) => [id, false])),
        decisionAttestations: {},
      }
    : conversation;
}
const SUMMARY: Record<ProtocolMessage['type'], string> = {
  offer: 'An agent asked whether a thoughtful introduction could fit.',
  'policy-response': 'Their private requirements passed. Your agent checks yours independently.',
  'window-proposal': 'Your agents compared shared interests and suggested an available window.',
  'window-response': 'The other agent confirmed that the proposed time works.',
  'meeting-proposal': 'A first-meeting plan is ready for the other agent to review.',
  'suggestion-ready': 'Both agents have a suggestion. Both people still decide.',
  rejected: 'A private requirement stopped this introduction.',
};
const INTENT_LABELS: Record<Intent, string> = {
  friendship: 'Friendship',
  dating: 'Dating',
  collaboration: 'Collaboration',
};
const relayHint = (globalThis as typeof globalThis & { __KIN_RELAY__?: string }).__KIN_RELAY__;
const relayInvite =
  typeof location !== 'undefined'
    ? readRelayInvite(location.href)
    : { relayURL: null, error: null };
const localRelay =
  typeof location !== 'undefined' && !location.hostname.endsWith('github.io')
    ? location.origin
    : '';
const initialRelay = relayInvite.error
  ? ''
  : relayInvite.relayURL ||
    relayHint ||
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_RELAY_URL ||
    localRelay;

export function NetworkPanel({
  profile,
  onCreateProfile,
  onResetReady,
  onSaveConnection,
  onForgetConnection,
}: {
  profile: OwnerProfile | null;
  onCreateProfile: () => void;
  onResetReady?: (reset: () => Promise<void>) => void;
  onSaveConnection?: (connection: Omit<SavedConnection, 'savedAt'>) => Promise<void>;
  onForgetConnection?: (peerId: string) => Promise<void>;
}) {
  const [relayURL, setRelayURL] = useState(initialRelay);
  const [alias, setAlias] = useState(
    profile ? `${profile.agentName} agent`.slice(0, 50) : 'My Kin agent',
  );
  const [purpose, setPurpose] = useState('A thoughtful new connection around shared interests.');
  const [publicInterests, setPublicInterests] = useState<string[]>([]);
  const [intents, setIntents] = useState<Intent[]>(profile?.intents || ['friendship']);
  const [optIn, setOptIn] = useState(false);
  const [joined, setJoined] = useState(false);
  const [identityId, setIdentityId] = useState('');
  const [peers, setPeers] = useState<NetworkIdentity[]>([]);
  const [conversations, setConversations] = useState<NetworkConversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [verifiedConnections, setVerifiedConnections] = useState<Set<string>>(new Set());
  const [approvalChecked, setApprovalChecked] = useState(false);
  const [chat, setChat] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(relayInvite.error || '');
  const [status, setStatus] = useState('');
  const [polling, setPolling] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [forgetConfirm, setForgetConfirm] = useState(false);
  const runtimeRef = useRef<Runtime | null>(null);
  const resetRef = useRef<() => Promise<void>>(async () => {});
  resetRef.current = resetNetwork;
  const pollBusyRef = useRef(false);
  const mountedRef = useRef(true);
  const selectRef = useRef<string | null>(null);
  selectRef.current = selected;
  const current = conversations.find((conversation) => conversation.id === selected);
  const currentPeer = current
    ? peers.find((peer) => peer.id === current.participants.find((id) => id !== identityId)) ||
      runtimeRef.current?.pins.get(current.id)
    : null;
  const unlocked =
    !!current &&
    verifiedConnections.has(current.id) &&
    current.state === 'connected' &&
    !!runtimeRef.current?.active &&
    !localTerminalState(runtimeRef.current, current);
  const currentFacts = current && runtimeRef.current?.commonFacts.get(current.id);
  const currentIntent = current && runtimeRef.current?.conversationIntents.get(current.id);
  const introduction =
    current &&
    plans[current.id] &&
    currentFacts &&
    currentIntent &&
    runtimeRef.current?.active &&
    !localTerminalState(runtimeRef.current, current) &&
    !['declined', 'blocked'].includes(current.state)
      ? createIntroductionBrief({
          intent: currentIntent,
          ...currentFacts,
          peerAlias: currentPeer?.capsule.alias,
        })
      : null;

  useEffect(() => {
    onResetReady?.(() => resetRef.current());
  }, [onResetReady]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (runtimeRef.current) runtimeRef.current.active = false;
    };
  }, []);
  useEffect(() => {
    if (!joined) {
      setAlias(profile ? `${profile.agentName} agent`.slice(0, 50) : 'My Kin agent');
      setIntents(profile?.intents || ['friendship']);
    }
  }, [profile, joined]);
  useEffect(() => {
    if (!joined) return;
    const timer = setInterval(() => {
      void pollInbox();
    }, 3000);
    return () => clearInterval(timer);
  }, [joined]);
  useEffect(() => {
    setApprovalChecked(false);
    setChat('');
  }, [selected]);
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime?.active && JSON.stringify(profile) !== runtime.profileSnapshot) {
      runtime.active = false;
      setVerifiedConnections(new Set());
      setStatus('Your preferences changed. Leaving this relay before any new introductions.');
      void revokeChangedProfile(runtime);
    }
  }, [profile]);

  function addTrace(trace: Trace) {
    const runtime = runtimeRef.current;
    if (
      !runtime?.active ||
      locallyClosed(runtime, trace.conversationId) ||
      runtime.traced.has(trace.id)
    )
      return;
    runtime.traced.add(trace.id);
    setTraces((old) => [...old, trace].slice(-500));
  }
  async function verifyDirectory(runtime: Runtime, identities: NetworkIdentity[]) {
    const verified: NetworkIdentity[] = [];
    for (const peer of identities) {
      await verifyPeerIdentity(peer);
      if (peer.id === runtime.identity.id)
        assertOwnRegistration(
          { id: runtime.identity.id, registrationId: runtime.registrationId },
          peer,
        );
      runtime.identities.set(peer.id, peer);
      if (peer.id !== runtime.identity.id) verified.push(peer);
    }
    return verified;
  }
  async function channel(
    runtime: Runtime,
    conversationId: string,
    peerId: string,
  ): Promise<CryptoKey> {
    const peer = runtime.identities.get(peerId);
    if (!peer) throw new Error('The other agent is unavailable. Refresh the network.');
    await verifyPeerIdentity(peer);
    const pinned = runtime.pins.get(conversationId);
    assertPeerRegistration(pinned, peer);
    if (!pinned) runtime.pins.set(conversationId, peer);
    let key = runtime.keys.get(conversationId);
    if (!key) {
      key = await deriveChannelKey(runtime.identity, peer.exchangeKey, conversationId);
      runtime.keys.set(conversationId, key);
    }
    return key;
  }
  function updateConversation(conversation: NetworkConversation) {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setConversations((old) => {
      const safe = withLocalTerminal(runtime, conversation);
      const index = old.findIndex((item) => item.id === conversation.id);
      return index < 0
        ? [...old, safe]
        : old.map((item) =>
            item.id === conversation.id ? safe : withLocalTerminal(runtime, item),
          );
    });
  }
  function recordLocalDecision(
    runtime: Runtime,
    conversationId: string,
    decision: 'decline' | 'block',
    peerId?: string,
  ) {
    runtime.closedConversationIds.add(conversationId);
    runtime.pendingDecisions.set(conversationId, decision);
    if (decision === 'block' && peerId) runtime.blockedPeers.add(peerId);
    setConversations((old) => old.map((item) => withLocalTerminal(runtime, item)));
    setVerifiedConnections(new Set());
    setApprovalChecked(false);
    setChat('');
    setStatus(
      decision === 'block'
        ? 'This agent is blocked on your device. Confirming with the relay…'
        : 'This introduction is closed on your device. Confirming with the relay…',
    );
  }
  function assertCanSend(runtime: Runtime, conversationId?: string, peerId?: string) {
    if (!runtime.active || runtimeRef.current !== runtime)
      throw new Error('Your network agent is paused.');
    if (
      (peerId && runtime.blockedPeers.has(peerId)) ||
      (conversationId && locallyClosed(runtime, conversationId, peerId))
    )
      throw new Error('This introduction is closed on your device.');
  }
  async function markReady(runtime: Runtime, conversationId: string) {
    if (!runtime.active || locallyClosed(runtime, conversationId)) return;
    if (runtime.ready.has(conversationId)) return;
    const conversation = await runtime.client.request<NetworkConversation>(
      '/api/network/ready',
      {
        conversationId,
      },
      () => assertCanSend(runtime, conversationId),
    );
    if (!runtime.active || locallyClosed(runtime, conversationId)) return;
    runtime.ready.add(conversationId);
    updateConversation(conversation);
  }
  async function sendAgent(runtime: Runtime, conversationId: string, message: ProtocolMessage) {
    if (!runtime.active) throw new Error('Your network agent is paused.');
    if (locallyClosed(runtime, conversationId, message.to))
      throw new Error('This introduction is closed on your device.');
    const key = await channel(runtime, conversationId, message.to);
    const encrypted = await encryptMessage(
      key,
      { conversationId, from: runtime.identity.id, to: message.to, kind: 'agent' },
      JSON.stringify(message),
    );
    if (!runtime.active) throw new Error('Your network agent is paused.');
    if (locallyClosed(runtime, conversationId, message.to))
      throw new Error('This introduction is closed on your device.');
    const packet = await runtime.client.request<EncryptedPacket>(
      '/api/network/messages',
      {
        conversationId,
        kind: 'agent',
        ...encrypted,
      },
      () => assertCanSend(runtime, conversationId, message.to),
    );
    const stages = runtime.outgoing.get(conversationId) || new Set<string>();
    stages.add(message.type);
    runtime.outgoing.set(conversationId, stages);
    if (message.type === 'offer') runtime.conversationIntents.set(conversationId, message.intent);
    if (message.type === 'window-proposal')
      runtime.commonFacts.set(conversationId, {
        sharedInterests: [...message.sharedInterests],
        sharedValues: [...message.sharedValues],
        slot: message.slot,
      });
    addTrace({
      id: packet.id || crypto.randomUUID(),
      conversationId,
      direction: 'out',
      kind: 'agent',
      type: message.type,
      text: SUMMARY[message.type],
      at: packet.createdAt || new Date().toISOString(),
    });
    if (message.type === 'meeting-proposal')
      setPlans((old) => ({ ...old, [conversationId]: message.plan }));
  }
  async function handleAgent(runtime: Runtime, packet: EncryptedPacket, plaintext: string) {
    if (!runtime.active || locallyClosed(runtime, packet.conversationId, packet.from)) return;
    const message = protocolMessageSchema.parse(JSON.parse(plaintext));
    if (
      message.conversationId !== packet.conversationId ||
      message.from !== packet.from ||
      message.to !== runtime.identity.id
    )
      throw new Error('An encrypted agent message has an invalid envelope.');
    const semanticKey = `${packet.conversationId}:${packet.from}:${message.type}`;
    if (runtime.replies.has(packet.id)) {
      const reply = runtime.replies.get(packet.id);
      if (reply) await sendAgent(runtime, packet.conversationId, reply);
      if (reply?.type === 'suggestion-ready' || message.type === 'suggestion-ready')
        await markReady(runtime, packet.conversationId);
      if (reply?.type === 'rejected' || message.type === 'rejected') {
        recordLocalDecision(runtime, packet.conversationId, 'decline');
        updateConversation(
          await runtime.client.request('/api/network/decisions', {
            conversationId: packet.conversationId,
            decision: 'decline',
          }),
        );
        runtime.pendingDecisions.delete(packet.conversationId);
      }
      return;
    }
    const seen = runtime.received.get(semanticKey);
    if (seen) {
      if (seen !== plaintext)
        throw new Error('The other agent sent conflicting protocol messages.');
      return;
    }
    let response: ProtocolMessage | null = null;
    if (message.type === 'offer') {
      response = runtime.agent.receiveOffer(message);
      if (response.type !== 'rejected')
        runtime.conversationIntents.set(packet.conversationId, message.intent);
    } else if (message.type === 'policy-response')
      response = runtime.agent.receivePolicyResponse(message);
    else if (message.type === 'window-proposal') {
      response = runtime.agent.receiveWindowProposal(message);
      if (response.type !== 'rejected')
        runtime.commonFacts.set(packet.conversationId, {
          sharedInterests: [...message.sharedInterests],
          sharedValues: [...message.sharedValues],
          slot: message.slot,
        });
    } else if (message.type === 'window-response')
      response = runtime.agent.receiveWindowResponse(message);
    else if (message.type === 'meeting-proposal') {
      response = runtime.agent.receiveMeetingProposal(message);
      if (response.type !== 'rejected')
        setPlans((old) => ({ ...old, [packet.conversationId]: message.plan }));
    } else if (
      message.type === 'suggestion-ready' &&
      !runtime.outgoing.get(packet.conversationId)?.has('meeting-proposal')
    )
      throw new Error('A peer signalled readiness before a meeting proposal.');
    runtime.received.set(semanticKey, plaintext);
    runtime.replies.set(packet.id, response);
    addTrace({
      id: packet.id,
      conversationId: packet.conversationId,
      direction: 'in',
      kind: 'agent',
      type: message.type,
      text: SUMMARY[message.type],
      at: packet.createdAt,
    });
    if (response) await sendAgent(runtime, packet.conversationId, response);
    if (response?.type === 'suggestion-ready' || message.type === 'suggestion-ready')
      await markReady(runtime, packet.conversationId);
    if (response?.type === 'rejected' || message.type === 'rejected') {
      recordLocalDecision(runtime, packet.conversationId, 'decline');
      updateConversation(
        await runtime.client.request('/api/network/decisions', {
          conversationId: packet.conversationId,
          decision: 'decline',
        }),
      );
      runtime.pendingDecisions.delete(packet.conversationId);
    }
  }
  async function pollInbox(forceDirectory = false) {
    const runtime = runtimeRef.current;
    if (!runtime?.active || pollBusyRef.current || Date.now() < runtime.retryAt) return;
    pollBusyRef.current = true;
    setPolling(true);
    try {
      const inbox = await runtime.client.request<NetworkInbox>('/api/network/inbox');
      if (!runtime.active || !mountedRef.current) return;
      await verifyDirectory(runtime, [inbox.identity, ...inbox.peers]);
      if (forceDirectory || Date.now() - runtime.lastDirectory >= 15000) {
        const directory = await runtime.client.request<{ peers: NetworkIdentity[] }>(
          '/api/network/directory',
        );
        runtime.directoryPeers = await verifyDirectory(runtime, directory.peers);
        runtime.lastDirectory = Date.now();
      }
      if (!runtime.active || runtimeRef.current !== runtime || !mountedRef.current) return;
      setPeers(runtime.directoryPeers);
      setConversations((old) => {
        const merged = new Map(
          inbox.conversations.map((item) => [item.id, withLocalTerminal(runtime, item)]),
        );
        // A relay cannot hide a locally closed thread and thereby erase the owner's decision.
        for (const item of old)
          if (localTerminalState(runtime, item) && !merged.has(item.id))
            merged.set(item.id, withLocalTerminal(runtime, item));
        return [...merged.values()];
      });
      const approved = new Set<string>();
      for (const conversation of inbox.conversations) {
        if (
          !localTerminalState(runtime, conversation) &&
          (await verifyConversationApprovals(conversation, runtime.identities)) &&
          !localTerminalState(runtime, conversation)
        )
          approved.add(conversation.id);
      }
      setVerifiedConnections(
        () =>
          new Set(
            [...approved].filter((id) => {
              const conversation = inbox.conversations.find((item) => item.id === id);
              return conversation && !localTerminalState(runtime, conversation);
            }),
          ),
      );
      const acknowledgements: string[] = [];
      for (const packet of inbox.packets) {
        if (runtime.processed.has(packet.id)) {
          acknowledgements.push(packet.id);
          continue;
        }
        const conversation = inbox.conversations.find((item) => item.id === packet.conversationId);
        if (
          !conversation ||
          packet.to !== runtime.identity.id ||
          !conversation.participants.includes(packet.from) ||
          packet.from === runtime.identity.id
        )
          throw new Error('The relay returned an unexpected message recipient.');
        if (
          localTerminalState(runtime, conversation) ||
          conversation.state === 'declined' ||
          conversation.state === 'blocked'
        ) {
          runtime.processed.add(packet.id);
          acknowledgements.push(packet.id);
          continue;
        }
        const key = await channel(runtime, packet.conversationId, packet.from);
        if (!runtime.active || localTerminalState(runtime, conversation)) continue;
        const plaintext = await decryptMessage(key, packet, packet);
        if (!runtime.active || localTerminalState(runtime, conversation)) continue;
        if (packet.kind === 'agent') await handleAgent(runtime, packet, plaintext);
        else {
          if (!approved.has(conversation.id))
            throw new Error('A human message arrived before both signed approvals.');
          const decoded = JSON.parse(plaintext) as {
            version?: string;
            messageId?: string;
            text?: string;
          };
          if (
            decoded.version !== 'kin-chat/0.1' ||
            typeof decoded.messageId !== 'string' ||
            decoded.messageId.length < 16 ||
            decoded.messageId.length > 80 ||
            typeof decoded.text !== 'string' ||
            !decoded.text.trim() ||
            decoded.text.length > 2000
          )
            throw new Error('An encrypted chat message was invalid.');
          const chatKey = `chat:${packet.conversationId}:${packet.from}:${decoded.messageId}`;
          const previous = runtime.received.get(chatKey);
          if (previous && previous !== plaintext)
            throw new Error('Conflicting encrypted chat messages reused an identifier.');
          if (!previous) {
            runtime.received.set(chatKey, plaintext);
            addTrace({
              id: chatKey,
              conversationId: packet.conversationId,
              direction: 'in',
              kind: 'chat',
              type: 'chat',
              text: decoded.text,
              at: packet.createdAt,
            });
          }
        }
        runtime.processed.add(packet.id);
        acknowledgements.push(packet.id);
      }
      if (acknowledgements.length)
        await runtime.client.request('/api/network/ack', { packetIds: acknowledgements });
      if (mountedRef.current) {
        setLastSync(new Date().toISOString());
        if (!selectRef.current && inbox.conversations.length)
          setSelected(inbox.conversations.at(-1)!.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not sync your encrypted inbox.';
      if (message.toLowerCase().includes('rate limit')) runtime.retryAt = Date.now() + 60000;
      if (mountedRef.current) setError(message);
    } finally {
      pollBusyRef.current = false;
      if (mountedRef.current) setPolling(false);
    }
  }
  async function join() {
    if (!profile) return;
    setBusy('join');
    setError('');
    try {
      if (!optIn) throw new Error('Choose to publish your agent capsule before joining.');
      if (!alias.trim() || alias.trim().length > 60 || containsRecognizableContact(alias))
        throw new Error('Use a short agent alias without your contacts or links.');
      if (!purpose.trim() || purpose.trim().length > 120 || containsRecognizableContact(purpose))
        throw new Error('Use a purpose of up to 120 characters, without contacts or links.');
      if (!intents.length) throw new Error('Choose at least one connection intention.');
      if (profile.paused) throw new Error('Resume your agent before joining the network.');
      if (!globalThis.crypto?.subtle)
        throw new Error('Open Kin over HTTPS or localhost to create your device keys.');
      const normalized = normalizeRelayURL(relayURL),
        identity = await loadDeviceIdentity();
      const capsule: AgentCapsule = {
        alias: alias.trim(),
        intents,
        interests: publicInterests,
        purpose: purpose.trim(),
      };
      const client = new RelayClient(normalized, identity);
      rememberRelay(normalized);
      const registered = await client.request<NetworkIdentity>('/api/network/register', {
        signingKey: identity.signingKey,
        exchangeKey: identity.exchangeKey,
        capsule,
        registrationNonce: crypto.randomUUID(),
      });
      await verifyPeerIdentity(registered);
      const agent = new LocalPolicyAgent({
        ...profile,
        id: identity.id,
        name: capsule.alias,
        agentName: capsule.alias,
        intents,
      });
      runtimeRef.current = {
        identity,
        registrationId: (registered as NetworkIdentity & { registrationId: string }).registrationId,
        client,
        agent,
        capsule,
        identities: new Map([[identity.id, registered]]),
        pins: new Map(),
        keys: new Map(),
        processed: new Set(),
        received: new Map(),
        replies: new Map(),
        outgoing: new Map(),
        traced: new Set(),
        ready: new Set(),
        blockedPeers: new Set(),
        closedConversationIds: new Set(),
        pendingDecisions: new Map(),
        conversationIntents: new Map(),
        commonFacts: new Map(),
        active: true,
        profileSnapshot: JSON.stringify(profile),
        directoryPeers: [],
        lastDirectory: 0,
        retryAt: 0,
      };
      setRelayURL(normalized);
      setIdentityId(identity.id);
      setJoined(true);
      setStatus('Your agent is on the network. People approve every human introduction.');
      await pollInbox();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the agent network.');
    } finally {
      setBusy('');
    }
  }
  async function start(peer: NetworkIdentity) {
    const runtime = runtimeRef.current;
    if (!runtime?.active) return;
    setBusy(peer.id);
    setError('');
    try {
      if (runtime.blockedPeers.has(peer.id)) throw new Error('This connection is blocked.');
      const intent = runtime.capsule.intents.find((item) => peer.capsule.intents.includes(item));
      if (!intent) throw new Error('Your agents do not share an intention.');
      await verifyPeerIdentity(peer);
      const conversation = await runtime.client.request<NetworkConversation>(
        '/api/network/conversations',
        { peerId: peer.id },
        () => assertCanSend(runtime, undefined, peer.id),
      );
      if (
        !runtime.active ||
        runtime.blockedPeers.has(peer.id) ||
        locallyClosed(runtime, conversation.id)
      )
        throw new Error('This introduction is closed on your device.');
      updateConversation(conversation);
      setSelected(conversation.id);
      if (conversation.state !== 'negotiating') {
        if (['blocked', 'declined'].includes(conversation.state))
          throw new Error('This introduction is closed.');
        setStatus('Your introduction is ready to review below.');
        return;
      }
      if (!runtime.outgoing.get(conversation.id)?.has('offer')) {
        const offer = runtime.agent.createOffer(peer.id, intent, conversation.id);
        await sendAgent(runtime, conversation.id, offer);
      }
      setStatus('Your agent sent an encrypted offer. Their browser must be online to reply.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not begin this introduction.');
    } finally {
      setBusy('');
    }
  }
  async function decide(decision: 'approve' | 'decline' | 'block') {
    const runtime = runtimeRef.current;
    if (!runtime?.active || !current) return;
    setBusy(decision);
    setError('');
    try {
      const peerId = current.participants.find((id) => id !== runtime.identity.id);
      if (decision === 'approve' && localTerminalState(runtime, current))
        throw new Error('This introduction is closed on your device.');
      if (decision !== 'approve') recordLocalDecision(runtime, current.id, decision, peerId);
      if (
        decision === 'approve' &&
        (!approvalChecked ||
          !current.participants.every((id) => current.agentReady[id]) ||
          !runtime.ready.has(current.id))
      )
        throw new Error('Both agents must finish, and you must choose this introduction.');
      const registrationIds = (
        current as NetworkConversation & { registrationIds?: Record<string, string> }
      ).registrationIds;
      if (decision === 'approve' && !registrationIds)
        throw new Error('This introduction has no current registration binding.');
      const updated = await runtime.client.request<NetworkConversation>(
        '/api/network/decisions',
        {
          conversationId: current.id,
          decision,
          ...(decision === 'approve' ? { registrationIds } : {}),
        },
        decision === 'approve' ? () => assertCanSend(runtime, current.id, peerId) : undefined,
      );
      updateConversation(updated);
      if (decision !== 'approve') runtime.pendingDecisions.delete(current.id);
      if (decision === 'block' && onForgetConnection) {
        if (peerId) await onForgetConnection(peerId);
      }
      if (
        !localTerminalState(runtime, updated) &&
        (await verifyConversationApprovals(updated, runtime.identities)) &&
        !localTerminalState(runtime, updated)
      )
        setVerifiedConnections((old) => new Set([...old, updated.id]));
      setStatus(
        decision === 'approve'
          ? 'Your signed approval is in. Human chat opens after their signed yes, too.'
          : decision === 'block'
            ? 'This agent is blocked.'
            : 'Introduction declined. No human chat opens.',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save your decision.';
      setError(
        decision !== 'approve' && runtime.pendingDecisions.has(current.id)
          ? `${message} This introduction stays closed on your device. Retry the decision or leave the network; the relay has not confirmed it.`
          : message,
      );
    } finally {
      setBusy('');
    }
  }
  async function sendChat(event: React.FormEvent) {
    event.preventDefault();
    const runtime = runtimeRef.current;
    if (!runtime?.active || !current || !unlocked) return;
    const peerId = current.participants.find((id) => id !== runtime.identity.id)!;
    setBusy('chat');
    setError('');
    try {
      if (localTerminalState(runtime, current))
        throw new Error('This introduction is closed on your device.');
      if (!chat.trim() || chat.length > 2000)
        throw new Error('Write a message of up to 2,000 characters.');
      if (!(await verifyConversationApprovals(current, runtime.identities)))
        throw new Error('Both signed owner approvals are required.');
      const key = await channel(runtime, current.id, peerId);
      const encrypted = await encryptMessage(
        key,
        { conversationId: current.id, from: runtime.identity.id, to: peerId, kind: 'chat' },
        JSON.stringify({
          version: 'kin-chat/0.1',
          messageId: crypto.randomUUID(),
          text: chat.trim(),
        }),
      );
      if (!runtime.active) throw new Error('Your network agent is paused.');
      if (localTerminalState(runtime, current))
        throw new Error('This introduction is closed on your device.');
      const packet = await runtime.client.request<EncryptedPacket>(
        '/api/network/messages',
        {
          conversationId: current.id,
          kind: 'chat',
          ...encrypted,
        },
        () => assertCanSend(runtime, current.id, peerId),
      );
      addTrace({
        id: packet.id || crypto.randomUUID(),
        conversationId: current.id,
        direction: 'out',
        kind: 'chat',
        type: 'chat',
        text: chat.trim(),
        at: packet.createdAt || new Date().toISOString(),
      });
      setChat('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send this encrypted message.');
    } finally {
      setBusy('');
    }
  }
  async function saveCurrentConnection() {
    const runtime = runtimeRef.current;
    if (!runtime?.active || !current || !currentPeer || !unlocked || !onSaveConnection) return;
    setBusy('save-connection');
    setError('');
    try {
      if (!(await verifyConversationApprovals(current, runtime.identities)))
        throw new Error('Both signed approvals must verify before saving a connection.');
      if (!runtime.active || runtimeRef.current !== runtime)
        throw new Error('This introduction is no longer active.');
      if (localTerminalState(runtime, current))
        throw new Error('This introduction is closed on your device.');
      await onSaveConnection({
        peerId: currentPeer.id,
        alias: currentPeer.capsule.alias,
        conversationId: current.id,
        relayURL: runtime.client.url,
      });
      setStatus(
        'Saved to your private circle on this device. This grants no new membership or messaging permission.',
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this connection.');
    } finally {
      setBusy('');
    }
  }
  async function leave() {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setBusy('leave');
    setError('');
    try {
      await runtime.client.request('/api/network/leave');
      forgetRelay(runtime.client.url);
      clearNetworkState();
      setStatus(
        'Your capsule is off the directory. Device keys are retained until you forget them.',
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not leave the relay. Your capsule may still be visible.',
      );
    } finally {
      setBusy('');
    }
  }
  async function revokeChangedProfile(runtime: Runtime) {
    try {
      await runtime.client.request('/api/network/leave');
      forgetRelay(runtime.client.url);
      if (runtimeRef.current === runtime) {
        clearNetworkState();
        setStatus(
          'Your previous network registration is closed. Review your capsule and rejoin with your updated preferences when ready.',
        );
      }
    } catch {
      setError(
        'Your network agent is paused locally, but the relay could not revoke its previous registration. Your device keys were kept. Reconnect to that relay and choose Leave network.',
      );
    }
  }
  function clearNetworkState() {
    if (runtimeRef.current) runtimeRef.current.active = false;
    runtimeRef.current = null;
    setJoined(false);
    setIdentityId('');
    setPeers([]);
    setConversations([]);
    setSelected(null);
    setTraces([]);
    setPlans({});
    setVerifiedConnections(new Set());
    setOptIn(false);
  }
  async function resetNetwork() {
    const runtime = runtimeRef.current;
    if (runtime) runtime.active = false;
    const relays = rememberedRelays();
    if (relays.length && !localStorage.getItem(IDENTITY_STORAGE_KEY))
      throw new Error(
        'Device keys are missing. Your remembered relay capsules may remain visible; contact those relay operators before clearing local records.',
      );
    const identity = relays.length ? await loadDeviceIdentity() : null;
    for (const url of relays) {
      try {
        await new RelayClient(url, identity!).request('/api/network/leave');
      } catch (err) {
        if (
          !(
            err instanceof RelayRequestError &&
            err.status === 401 &&
            err.message === 'Register this identity before using the relay.'
          )
        )
          throw new Error(
            `Could not leave ${url}. Your device keys were kept. Reconnect to that relay and retry deleting your data.`,
          );
      }
      forgetRelay(url);
    }
    localStorage.removeItem(IDENTITY_STORAGE_KEY);
    clearNetworkState();
    setForgetConfirm(false);
    setStatus(
      'Signed leave requests completed for remembered relays. Device keys and local network history are cleared. The relay operator controls its own storage.',
    );
  }
  async function forget() {
    setBusy('reset');
    setError('');
    try {
      await resetNetwork();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not complete relay cleanup. Your device keys were kept.',
      );
    } finally {
      setBusy('');
    }
  }
  async function copyNetworkInvite() {
    try {
      if (!runtimeRef.current?.active) throw new Error('Join a network before sharing its invite.');
      await navigator.clipboard.writeText(createRelayInviteURL(runtimeRef.current.client.url));
      const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(
        new URL(runtimeRef.current.client.url).hostname,
      );
      setStatus(
        loopback
          ? 'Local invite copied for another browser profile on this machine. Different devices need a shared HTTPS network.'
          : 'Network invite copied. It includes only the network address; each person reviews their own profile and chooses to join.',
      );
    } catch {
      setError(
        'Could not copy this invite. You can share the relay address with someone you trust.',
      );
    }
  }

  return (
    <section className="kn-network">
      <div className="page-heading">
        <div>
          <div className="eyebrow">AGENTS ON THE SAME WAVELENGTH</div>
          <h1>A private path to a real hello.</h1>
          <p>Your agent can meet another person’s agent. You both decide when people talk.</p>
        </div>
        {joined && (
          <button className="button button-secondary" onClick={leave} disabled={!!busy}>
            <LogOut size={16} />
            {busy === 'leave' ? 'Leaving…' : 'Leave network'}
          </button>
        )}
      </div>
      {!joined && relayInvite.relayURL && relayInvite.relayURL === initialRelay && (
        <div className="kn-alert kn-status">
          <Globe2 size={18} />
          <span>
            <strong>Network invite</strong> · {relayInvite.relayURL}. Review this network address
            before joining. Opening the link does not publish your profile.
            {['localhost', '127.0.0.1', '[::1]', '::1'].includes(
              new URL(relayInvite.relayURL).hostname,
            ) && ' This local invite works only on the machine running that relay.'}
          </span>
        </div>
      )}
      {!joined && !initialRelay && !relayInvite.error && (
        <div className="kn-alert kn-status">
          <Globe2 size={18} />
          <span>
            This public demo has no shared network yet. For a real introduction, use a network
            invite from a host you trust.
          </span>
        </div>
      )}
      {error && (
        <div className="kn-alert kn-error" role="alert">
          <CircleHelp size={18} />
          <span>{error}</span>
          <button aria-label="Dismiss network error" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {(status || unlocked) && (
        <div className="kn-alert kn-status" role="status">
          <Check size={17} />
          <span>
            {unlocked ? 'Both signed approvals verified. Your encrypted chat is open.' : status}
          </span>
        </div>
      )}
      {!profile ? (
        <div className="kn-empty">
          <div className="kn-agent-orb">
            <FlowerMark />
          </div>
          <h2>Start with someone in your corner.</h2>
          <p>
            Give your agent your preferences before joining the real network. Your directory capsule
            will use an alias you choose.
          </p>
          <button className="button button-primary" onClick={onCreateProfile}>
            Create my agent <ArrowRight size={16} />
          </button>
        </div>
      ) : !joined ? (
        <div className="kn-join-layout">
          <div className="kn-join-card">
            <div className="kn-panel-title">
              <Globe2 size={22} />
              <h2>Choose what your agent shares.</h2>
            </div>
            <p className="kn-lead">
              Joining publishes a small capsule to your chosen relay. Your real name, hard
              requirements, notes, and contacts stay out of that capsule.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void join();
              }}
            >
              <label className="kn-field">
                Relay address
                <input
                  type="url"
                  value={relayURL}
                  onChange={(event) => setRelayURL(event.target.value)}
                  required
                  placeholder="https://your-kin-relay.example"
                />
                <small>HTTPS, or localhost HTTP. Use a relay you trust to run the service.</small>
              </label>
              <label className="kn-field">
                Your agent’s public alias
                <input
                  maxLength={60}
                  value={alias}
                  onChange={(event) => setAlias(event.target.value)}
                  required
                />
                <small>Choose an alias. Keep your real name and contact details private.</small>
              </label>
              <label className="kn-field">
                What are you hoping to connect around?
                <textarea
                  maxLength={120}
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  required
                  rows={2}
                  placeholder="Find a friend, a collaborator, or people interested in your project."
                />
                <small>
                  A friend, collaboration, or sharing your project with interested people. No links
                  or contacts before two yeses.
                </small>
              </label>
              <fieldset className="kn-fieldset">
                <legend>Make room for</legend>
                <div className="kn-chips">
                  {profile.intents.map((intent) => (
                    <button
                      type="button"
                      key={intent}
                      className={intents.includes(intent) ? 'selected' : ''}
                      aria-pressed={intents.includes(intent)}
                      onClick={() =>
                        setIntents((old) =>
                          old.includes(intent)
                            ? old.filter((item) => item !== intent)
                            : [...old, intent],
                        )
                      }
                    >
                      {intents.includes(intent) && <Check size={13} />} {INTENT_LABELS[intent]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="kn-fieldset">
                <legend>Interests you choose to make public</legend>
                <div className="kn-chips">
                  {profile.interests.map((interest) => (
                    <button
                      type="button"
                      key={interest}
                      className={publicInterests.includes(interest) ? 'selected' : ''}
                      aria-pressed={publicInterests.includes(interest)}
                      onClick={() =>
                        setPublicInterests((old) =>
                          old.includes(interest)
                            ? old.filter((item) => item !== interest)
                            : [...old, interest],
                        )
                      }
                    >
                      {publicInterests.includes(interest) && <Check size={13} />} {interest}
                    </button>
                  ))}
                </div>
                <small>
                  Optional. Unselected interests can still be compared inside encrypted agent
                  messages.
                </small>
              </fieldset>
              <label className="kn-join-consent">
                <input
                  type="checkbox"
                  checked={optIn}
                  onChange={(event) => setOptIn(event.target.checked)}
                />
                <span>
                  I choose to publish this capsule and let my local policy agent negotiate with
                  other joined agents.
                  <small>
                    It exchanges age, city, gender, smoking, interests, values, and availability
                    with verified peers in encrypted messages. Your real name, contacts, private
                    rules, and free-text notes are withheld.
                  </small>
                </span>
              </label>
              <button
                className="button button-primary"
                type="submit"
                disabled={!!busy || !optIn || profile.paused}
              >
                <Radio size={16} />
                {busy === 'join' ? 'Connecting securely…' : 'Join the real network'}
                <ArrowRight size={16} />
              </button>
              {profile.paused && (
                <p className="kn-paused">
                  Your agent is paused. Resume it in My agent before joining.
                </p>
              )}
            </form>
          </div>
          <div className="kn-privacy-card">
            <div className="kn-agent-orb">
              <FlowerMark />
            </div>
            <h2>
              Agent conversations.
              <br />
              <em>Human decisions.</em>
            </h2>
            <ul>
              <li>
                <ShieldCheck size={20} />
                <div>
                  <strong>Private policy, checked locally.</strong>
                  <p>
                    Your agent applies your requirements. The relay receives encrypted messages and
                    public capsules.
                  </p>
                </div>
              </li>
              <li>
                <LockKeyhole size={20} />
                <div>
                  <strong>Two signatures unlock a chat.</strong>
                  <p>
                    Neither agent approves for you. Human messages stay locked until both people
                    sign their yes.
                  </p>
                </div>
              </li>
              <li>
                <KeyRound size={20} />
                <div>
                  <strong>Keys live on this device.</strong>
                  <p>
                    Private keys are stored in this browser’s local storage, without a separate
                    password. Anyone with access to this browser or compromised app code may access
                    them.
                  </p>
                </div>
              </li>
            </ul>
            <p className="kn-privacy-footnote">
              The relay can see agent IDs, participants, timing, and message sizes. Encryption
              protects message content in transit through the relay; it does not hide all metadata
              or verify someone’s real-world identity. Long-lived device keys do not provide forward
              secrecy.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="kn-network-bar">
            <div>
              <span className={`kn-online-dot ${!runtimeRef.current?.active ? 'paused' : ''}`} />
              <strong>{alias}</strong>
              <span>on {new URL(relayURL).host}</span>
            </div>
            <button className="text-button" onClick={copyNetworkInvite} disabled={!!busy}>
              <Copy size={15} /> Copy network invite
            </button>
            <button
              className="text-button"
              onClick={() => pollInbox(true)}
              disabled={polling || !!busy}
            >
              <RefreshCw size={15} />
              {polling ? 'Syncing…' : 'Refresh network'}
            </button>
          </div>
          <div className="kn-connected-grid">
            <section className="kn-directory">
              <div className="kn-section-title">
                <h2>Other agents, real possibilities.</h2>
                <span>
                  {peers.length} {peers.length === 1 ? 'agent' : 'agents'}
                </span>
              </div>
              <p>Capsules people chose to publish. Pick one thoughtful introduction to explore.</p>
              {peers.length === 0 ? (
                <div className="kn-directory-empty">
                  <Users size={28} />
                  <h3>A little room for your people.</h3>
                  <p>
                    No other agents are on this relay yet. Open Kin on a second device or browser
                    with another owner profile and join the same relay.
                  </p>
                </div>
              ) : (
                <div className="kn-peer-list">
                  {peers.map((peer) => (
                    <article className="kn-peer-card" key={peer.id}>
                      <div className="kn-peer-heading">
                        <span>
                          <FlowerMark />
                        </span>
                        <div>
                          <h3>{peer.capsule.alias}</h3>
                          <small>Verified agent key · {peer.id.slice(0, 8)}</small>
                        </div>
                      </div>
                      <p>{peer.capsule.purpose}</p>
                      <div className="kn-chips kn-peer-interests">
                        {peer.capsule.interests.map((interest) => (
                          <span key={interest}>{interest}</span>
                        ))}
                      </div>
                      <div className="kn-peer-footer">
                        <span>
                          {peer.capsule.intents.map((intent) => INTENT_LABELS[intent]).join(' · ')}
                        </span>
                        <button
                          className="button button-secondary"
                          disabled={
                            !!busy ||
                            !runtimeRef.current?.active ||
                            !intents.some((intent) => peer.capsule.intents.includes(intent))
                          }
                          onClick={() => start(peer)}
                        >
                          Let our agents talk <ArrowRight size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="kn-conversations">
              <div className="kn-section-title">
                <h2>Your beginnings.</h2>
                <LockKeyhole size={17} />
              </div>
              {conversations.length > 0 && (
                <div
                  className="kn-conversation-picker"
                  role="group"
                  aria-label="Choose an introduction"
                >
                  {conversations.map((conversation) => {
                    const peer =
                      peers.find((item) => conversation.participants.includes(item.id)) ||
                      runtimeRef.current?.pins.get(conversation.id);
                    return (
                      <button
                        key={conversation.id}
                        className={selected === conversation.id ? 'selected' : ''}
                        aria-pressed={selected === conversation.id}
                        onClick={() => setSelected(conversation.id)}
                      >
                        {peer?.capsule.alias || 'An agent'}
                        <span>
                          {conversation.state === 'connected'
                            ? 'Two yeses'
                            : conversation.state === 'awaiting-approval'
                              ? 'Your decision'
                              : conversation.state}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {!current ? (
                <div className="kn-conversation-empty">
                  <MessageCircle size={28} />
                  <h3>The first hello starts here.</h3>
                  <p>
                    Choose an agent in the directory. You’ll see each private negotiation step here.
                  </p>
                </div>
              ) : (
                <div className="kn-current-thread">
                  <div className="kn-thread-heading">
                    <span>YOU & {currentPeer?.capsule.alias.toUpperCase() || 'ANOTHER AGENT'}</span>
                    <h3>
                      {unlocked
                        ? 'Two yeses. A real hello.'
                        : current.state === 'declined'
                          ? 'This introduction is closed.'
                          : current.state === 'blocked'
                            ? 'This agent is blocked.'
                            : current.state === 'awaiting-approval'
                              ? 'Your agents found a beginning.'
                              : 'Agents talking privately.'}
                    </h3>
                    <p>
                      {unlocked
                        ? 'Both signed approvals verified. Your human chat is open.'
                        : current.state === 'negotiating'
                          ? 'Encrypted messages move between two local policy agents. Their browser needs to be online.'
                          : 'You choose whether this becomes a human conversation.'}
                    </p>
                  </div>
                  <div className="kn-trace-list" aria-label="Agent negotiation steps">
                    {traces
                      .filter(
                        (trace) => trace.conversationId === current.id && trace.kind === 'agent',
                      )
                      .map((trace) => (
                        <div
                          className={`kn-agent-step ${trace.direction === 'in' ? 'incoming' : ''}`}
                          key={trace.id}
                        >
                          <FlowerMark />
                          <div>
                            <span>
                              {trace.direction === 'out' ? 'YOUR AGENT' : 'THEIR AGENT'} ·{' '}
                              {trace.type.replaceAll('-', ' ')}
                            </span>
                            <p>{trace.text}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                  {plans[current.id] && (
                    <div className="kn-meeting-plan">
                      <span>A LOW-PRESSURE BEGINNING</span>
                      <h4>{plans[current.id].title}</h4>
                      <p>{plans[current.id].detail}</p>
                      <small>{AVAILABILITY_LABELS[plans[current.id].availability]}</small>
                    </div>
                  )}
                  {introduction && (
                    <div className="kn-meeting-plan" aria-label="A beginning to explore">
                      <span>START SMALL. CHOOSE TOGETHER.</span>
                      <h4>{introduction.headline}</h4>
                      <ul>
                        {introduction.why.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                      <h4>{introduction.idea.title}</h4>
                      <p>{introduction.idea.detail}</p>
                      <span>TWO OPTIONAL QUESTIONS</span>
                      <ol>
                        {introduction.questions.slice(0, 2).map((question) => (
                          <li key={question}>{question}</li>
                        ))}
                      </ol>
                      <p>{introduction.boundary}</p>
                    </div>
                  )}
                  {current.state === 'awaiting-approval' && (
                    <div className="kn-owner-decision">
                      <label>
                        <input
                          type="checkbox"
                          checked={approvalChecked}
                          onChange={(event) => setApprovalChecked(event.target.checked)}
                          disabled={current.approvals[identityId]}
                        />
                        <span>
                          {current.approvals[identityId]
                            ? 'Your signed yes is in.'
                            : 'I want this introduction.'}
                        </span>
                      </label>
                      <p>
                        {current.approvals[identityId]
                          ? 'We’re waiting for their owner to choose. There is no demo approval control here.'
                          : 'Both agents are ready. Human chat stays locked until both people approve.'}
                      </p>
                      <div>
                        <button
                          className="text-button"
                          onClick={() => decide('decline')}
                          disabled={!!busy}
                        >
                          Not this time
                        </button>
                        <button
                          className="button button-primary"
                          disabled={
                            !!busy ||
                            !approvalChecked ||
                            current.approvals[identityId] ||
                            !runtimeRef.current?.ready.has(current.id)
                          }
                          onClick={() => decide('approve')}
                        >
                          <Check size={16} />
                          {current.approvals[identityId]
                            ? 'Waiting for their yes'
                            : 'Approve introduction'}
                        </button>
                      </div>
                    </div>
                  )}
                  {current.state === 'connected' && !unlocked && (
                    <div className="kn-chat-locked">
                      <ShieldCheck size={18} />
                      <p>
                        Verifying both signed owner approvals. Chat stays locked until both receipts
                        are valid.
                      </p>
                    </div>
                  )}
                  {unlocked ? (
                    <>
                      {onSaveConnection && currentPeer && (
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={!!busy}
                          onClick={saveCurrentConnection}
                        >
                          <Users size={16} /> Save to my private circle
                        </button>
                      )}
                      <div
                        className="kn-human-chat"
                        role="log"
                        aria-live="polite"
                        aria-label="Encrypted human conversation"
                      >
                        {traces.filter(
                          (trace) => trace.conversationId === current.id && trace.kind === 'chat',
                        ).length === 0 ? (
                          <p className="kn-chat-start">A hello is a good place to start.</p>
                        ) : (
                          traces
                            .filter(
                              (trace) =>
                                trace.conversationId === current.id && trace.kind === 'chat',
                            )
                            .map((trace) => (
                              <div
                                className={`kn-chat-bubble ${trace.direction === 'out' ? 'outgoing' : ''}`}
                                key={trace.id}
                              >
                                <span>
                                  {trace.direction === 'out'
                                    ? 'You'
                                    : currentPeer?.capsule.alias || 'Their owner'}
                                </span>
                                <p>{trace.text}</p>
                              </div>
                            ))
                        )}
                      </div>
                      <form className="kn-chat-form" onSubmit={sendChat}>
                        <label className="kn-sr-only" htmlFor="kin-network-chat">
                          Your encrypted message
                        </label>
                        <textarea
                          id="kin-network-chat"
                          value={chat}
                          onChange={(event) => setChat(event.target.value)}
                          maxLength={2000}
                          rows={2}
                          placeholder="A thoughtful hello…"
                          disabled={!!busy || !runtimeRef.current?.active}
                        />
                        <button
                          className="button button-primary"
                          type="submit"
                          disabled={!!busy || !chat.trim() || !runtimeRef.current?.active}
                          aria-label="Send encrypted message"
                        >
                          <Send size={17} />
                        </button>
                      </form>
                      <div className="kn-chat-note">
                        <LockKeyhole size={12} />
                        Encrypted between these device keys. Chat history stays in memory.
                      </div>
                    </>
                  ) : (
                    !['declined', 'blocked'].includes(current.state) && (
                      <div className="kn-chat-locked">
                        <LockKeyhole size={18} />
                        <p>Human chat is locked until both owners approve.</p>
                      </div>
                    )
                  )}
                  {current.state !== 'blocked' && (
                    <button
                      className="kn-block-button"
                      disabled={!!busy}
                      onClick={() => decide('block')}
                    >
                      Block this agent
                    </button>
                  )}
                  {runtimeRef.current?.pendingDecisions.has(current.id) && (
                    <div className="kn-chat-locked" role="status">
                      <ShieldCheck size={18} />
                      <div>
                        <p>
                          Your decision is enforced on this device. The relay has not confirmed it.
                          Retry or leave the network.
                        </p>
                        <button
                          className="text-button"
                          disabled={!!busy || !runtimeRef.current?.active}
                          onClick={() =>
                            decide(runtimeRef.current!.pendingDecisions.get(current.id)!)
                          }
                        >
                          {runtimeRef.current.pendingDecisions.get(current.id) === 'block'
                            ? 'Retry blocking this agent'
                            : 'Retry declining this introduction'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
          <div className="kn-network-footnote">
            <span>
              <ShieldCheck size={14} />
              Ciphertext through the relay. Metadata remains visible.
            </span>
            <span>
              {lastSync
                ? `Last synced ${new Date(lastSync).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
                : 'Waiting for the relay'}{' '}
              · Device {identityId.slice(0, 8)}
            </span>
          </div>
        </>
      )}
      <div className="kn-identity-footer">
        <Code2 size={16} />
        <p>
          Local policy agents use a transparent protocol. They do not use an outside language model.
          Network chat is for real owners; demo profiles are separate.
        </p>
        {!joined && (
          <button className="text-button" onClick={() => setForgetConfirm(!forgetConfirm)}>
            <Trash2 size={14} />
            {forgetConfirm ? 'Keep device keys' : 'Forget device identity'}
          </button>
        )}
      </div>
      {forgetConfirm && !joined && (
        <div className="kn-forget-confirm">
          <p>
            Send signed leave requests to remembered relays, then forget this browser’s keys?
            Earlier encrypted conversations cannot be reopened. If a relay is unavailable, your keys
            are kept so you can retry.
          </p>
          <button className="button button-danger" disabled={!!busy} onClick={forget}>
            {busy === 'reset' ? 'Leaving relays…' : 'Forget device identity'}
          </button>
        </div>
      )}
    </section>
  );
}
export default NetworkPanel;
