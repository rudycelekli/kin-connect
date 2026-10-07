import assert from 'node:assert/strict';

/** Retention is an additive contract: published older archives have no such field. */
export function assertRelayHealth(health, { requireRetention = false } = {}) {
  const { retention, ...base } = health;
  assert.deepEqual(base, { ok: true, protocol: 'kin-relay/0.1', privacy: 'encrypted-payloads' });
  if (requireRetention || retention !== undefined)
    assert.deepEqual(retention, {
      queuedPacketMs: 86_400_000,
      pendingIntroductionMs: 86_400_000,
      connectedIdleMs: 2_592_000_000,
      terminalConversationMs: 604_800_000,
      registrationIdleMs: 2_592_000_000,
      sweepIntervalMs: 60_000,
    });
}
