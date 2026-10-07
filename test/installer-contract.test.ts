import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRelayHealth } from '../scripts/relay-health-contract.mjs';
import { RELAY_RETENTION } from '../server/retention.js';

const historical = { ok: true, protocol: 'kin-relay/0.1', privacy: 'encrypted-payloads' };
test('installer evaluator permits historical archives but requires current-source retention', () => {
  assertRelayHealth(historical);
  assert.throws(() => assertRelayHealth(historical, { requireRetention: true }));
  assertRelayHealth({ ...historical, retention: RELAY_RETENTION }, { requireRetention: true });
});
test('installer evaluator rejects bad base contracts and malformed or weakened retention', () => {
  assert.throws(() => assertRelayHealth({ ...historical, ok: false }));
  assert.throws(() =>
    assertRelayHealth({ ...historical, retention: { ...RELAY_RETENTION, queuedPacketMs: 0 } }),
  );
  assert.throws(() => assertRelayHealth({ ...historical, retention: null }));
});
