import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRelayInviteURL, readRelayInvite } from '../src/network/invites';

test('network invite round-trips only its normalized relay address', () => {
  const invite = createRelayInviteURL('https://relay.example/kin/');
  const url = new URL(invite);
  assert.equal(url.origin, 'https://rudycelekli.github.io');
  assert.equal(url.pathname, '/kin-connect/');
  assert.deepEqual([...url.searchParams.keys()], ['kin', 'relay']);
  assert.equal(url.searchParams.get('kin'), 'network');
  assert.deepEqual(readRelayInvite(invite), { relayURL: 'https://relay.example/kin', error: null });
});

test('absent invite differs from malformed or ambiguous invite', () => {
  assert.deepEqual(readRelayInvite('https://kin.example/?kin=network'), {
    relayURL: null,
    error: null,
  });
  for (const query of [
    'relay=',
    'relay=one&relay=two',
    'relay=javascript%3Aalert(1)',
    'relay=not-a-url',
  ])
    assert.deepEqual(readRelayInvite(`https://kin.example/?${query}`), {
      relayURL: null,
      error: 'This network invite is invalid.',
    });
});

test('invites reject non-loopback HTTP, embedded credentials, queries and fragments', () => {
  for (const relay of [
    'http://relay.example',
    'https://owner:secret@relay.example',
    'https://relay.example?token=private',
    'https://relay.example/#private',
    `https://relay.example/${'a'.repeat(2048)}`,
  ]) {
    assert.throws(() => createRelayInviteURL(relay));
    const result = readRelayInvite(`https://kin.example/?relay=${encodeURIComponent(relay)}`);
    assert.equal(result.relayURL, null);
    assert.equal(result.error, 'This network invite is invalid.');
    assert.ok(!result.error.includes('secret'));
  }
  assert.equal(
    readRelayInvite(createRelayInviteURL('http://127.0.0.1:4318')).relayURL,
    'http://127.0.0.1:4318',
  );
});

test('loopback invites open the local app rather than a cross-origin public client', () => {
  for (const address of [
    'http://127.0.0.1:4318',
    'http://localhost:4320',
    'https://localhost:443',
  ]) {
    const invite = new URL(createRelayInviteURL(address));
    assert.equal(invite.origin, new URL(address).origin);
    assert.equal(invite.pathname, '/');
    assert.equal(invite.searchParams.get('kin'), 'network');
    assert.deepEqual(readRelayInvite(invite.href), {
      relayURL: new URL(address).origin,
      error: null,
    });
  }
});
