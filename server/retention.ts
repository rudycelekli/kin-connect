import type {
  EncryptedPacket,
  NetworkConversation,
  NetworkIdentity,
} from '../src/shared/network-types.js';

const DAY = 86_400_000;
export const RELAY_RETENTION = Object.freeze({
  queuedPacketMs: DAY,
  pendingIntroductionMs: DAY,
  connectedIdleMs: 30 * DAY,
  terminalConversationMs: 7 * DAY,
  registrationIdleMs: 30 * DAY,
  sweepIntervalMs: 60_000,
});
export interface RetentionActivity {
  identities: Record<string, number>;
  conversations: Record<string, number>;
  pendingDeadlines: Record<string, number>;
  packetDeadlines: Record<string, number>;
}
export interface RetainableRelayState {
  identities: Record<string, NetworkIdentity>;
  conversations: Record<string, NetworkConversation>;
  packets: Record<string, EncryptedPacket>;
  blocks: Array<{ pairHash: string; blockerId: string }>;
  agentPacketCounts: Record<string, number>;
  retentionActivity?: RetentionActivity;
}

/** Relay-owned timestamps are metadata only; they never enter signed owner receipts. */
export function retentionActivity(state: RetainableRelayState): RetentionActivity {
  const activity = (state.retentionActivity ??= {
    identities: {},
    conversations: {},
    pendingDeadlines: {},
    packetDeadlines: {},
  });
  activity.pendingDeadlines ??= {};
  activity.packetDeadlines ??= {};
  return activity;
}

/** Mutates a transaction clone. Counts contain no identities, message bodies, or keys. */
export function sweepRelayState(
  state: RetainableRelayState,
  now: number,
  authenticatedActivity: ReadonlyMap<string, number> = new Map(),
) {
  if (!Number.isFinite(now) || now < 0) throw new Error('Invalid maintenance clock.');
  let changed =
    !state.retentionActivity ||
    !state.retentionActivity.pendingDeadlines ||
    !state.retentionActivity.packetDeadlines;
  const activity = retentionActivity(state);
  for (const records of [
    activity.identities,
    activity.conversations,
    activity.pendingDeadlines,
    activity.packetDeadlines,
  ])
    if (!records || typeof records !== 'object' || Array.isArray(records))
      throw new Error('Invalid relay retention metadata.');
  const result = { removedIdentities: 0, removedConversations: 0, removedPackets: 0 };
  const ensureTimestamp = (records: Record<string, number>, id: string, fallback: number) => {
    if (records[id] === undefined) {
      records[id] = fallback;
      changed = true;
    }
    if (!Number.isFinite(records[id]) || records[id] < 0)
      throw new Error('Invalid relay retention metadata.');
    return records[id];
  };
  for (const id of Object.keys(state.identities)) {
    // Earlier stores lack registration activity. Start a documented migration grace period.
    const previous = ensureTimestamp(activity.identities, id, now);
    const seen = authenticatedActivity.get(id);
    if (seen !== undefined && seen > previous) {
      if (!Number.isFinite(seen) || seen > now) throw new Error('Invalid authenticated activity.');
      activity.identities[id] = seen;
      changed = true;
    }
  }
  // Old stores cannot recover the last acknowledged message time. Use migration time.
  for (const id of Object.keys(state.conversations))
    ensureTimestamp(activity.conversations, id, now);
  for (const [id, conversation] of Object.entries(state.conversations))
    if (conversation.state === 'negotiating' || conversation.state === 'awaiting-approval')
      ensureTimestamp(activity.pendingDeadlines, id, now + RELAY_RETENTION.pendingIntroductionMs);
  for (const id of Object.keys(state.packets))
    ensureTimestamp(activity.packetDeadlines, id, now + RELAY_RETENTION.queuedPacketMs);

  const removePacket = (id: string) => {
    if (!state.packets[id]) return;
    delete state.packets[id];
    delete activity.packetDeadlines[id];
    result.removedPackets += 1;
    changed = true;
  };
  const removeConversation = (id: string) => {
    if (!state.conversations[id]) return;
    for (const [packetId, packet] of Object.entries(state.packets))
      if (packet.conversationId === id) removePacket(packetId);
    delete state.conversations[id];
    delete state.agentPacketCounts[id];
    delete activity.conversations[id];
    delete activity.pendingDeadlines[id];
    result.removedConversations += 1;
    changed = true;
  };
  for (const [id, lastSeen] of Object.entries(activity.identities)) {
    if (!state.identities[id]) {
      delete activity.identities[id];
      changed = true;
      continue;
    }
    if (now - lastSeen < RELAY_RETENTION.registrationIdleMs) continue;
    delete state.identities[id];
    delete activity.identities[id];
    for (const conversation of Object.values(state.conversations))
      if (conversation.participants.includes(id)) removeConversation(conversation.id);
    // Expiry removes only this owner's protection, never someone else's pair block.
    state.blocks = state.blocks.filter((record) => record.blockerId !== id);
    result.removedIdentities += 1;
    changed = true;
  }
  for (const [id, conversation] of Object.entries(state.conversations)) {
    const createdAt = Date.parse(conversation.createdAt);
    if (!Number.isFinite(createdAt)) throw new Error('Invalid conversation retention timestamp.');
    const pending =
      conversation.state === 'negotiating' || conversation.state === 'awaiting-approval';
    const terminal = conversation.state === 'declined' || conversation.state === 'blocked';
    const baseline = activity.conversations[id];
    const limit = pending
      ? RELAY_RETENTION.pendingIntroductionMs
      : terminal
        ? RELAY_RETENTION.terminalConversationMs
        : RELAY_RETENTION.connectedIdleMs;
    if (pending ? now >= activity.pendingDeadlines[id] : now - baseline >= limit)
      removeConversation(id);
  }
  for (const [id, packet] of Object.entries(state.packets)) {
    const createdAt = Date.parse(packet.createdAt);
    if (!Number.isFinite(createdAt)) throw new Error('Invalid packet retention timestamp.');
    if (now < activity.packetDeadlines[id]) continue;
    const conversation = state.conversations[packet.conversationId];
    if (packet.kind === 'agent' && conversation && conversation.state !== 'connected')
      removeConversation(conversation.id);
    else removePacket(id);
  }
  for (const id of Object.keys(activity.conversations))
    if (!state.conversations[id]) {
      delete activity.conversations[id];
      changed = true;
    }
  for (const id of Object.keys(activity.pendingDeadlines))
    if (!state.conversations[id] || state.conversations[id].state === 'connected') {
      delete activity.pendingDeadlines[id];
      changed = true;
    }
  for (const id of Object.keys(activity.packetDeadlines))
    if (!state.packets[id]) {
      delete activity.packetDeadlines[id];
      changed = true;
    }
  return { changed, ...result };
}
