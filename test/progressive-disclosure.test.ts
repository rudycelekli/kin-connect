import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDisclosureDraft,
  DISCLOSURE_PREVIEW_TTL_MS,
  prepareDisclosureMessage,
  verifyDisclosureConnection,
  type DisclosureApproval,
  type DisclosureConnection,
  type DisclosureConnectionContext,
  type DisclosureDraft,
  type DisclosureSelection,
} from '../src/network/disclosure.js';
import { createDeviceIdentity, signText, type DeviceIdentity } from '../src/network/crypto.js';
import type { NetworkConversation, NetworkIdentity } from '../src/shared/network-types.js';

const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const clock = () => NOW;
const selected: DisclosureSelection = {
  fields: [
    { kind: 'display-name', value: 'Morgan' },
    { kind: 'email', value: 'morgan@example.com' },
    { kind: 'phone', value: '+12125550199' },
    { kind: 'link', value: 'https://www.linkedin.com/in/morgan' },
    { kind: 'information', value: 'I enjoy building community gardens.' },
  ],
  consent: true,
};

async function register(
  device: DeviceIdentity,
  registrationId: string = crypto.randomUUID(),
  exchangeKey = device.exchangeKey,
): Promise<NetworkIdentity> {
  const capsule = {
    alias: 'Garden friend',
    intents: ['friendship' as const],
    interests: ['Gardening'],
    purpose: 'A thoughtful introduction',
  };
  const signedText = JSON.stringify({
    path: '/api/network/register',
    challengeId: crypto.randomUUID(),
    nonce: 'synthetic-test-challenge',
    payload: {
      signingKey: device.signingKey,
      exchangeKey,
      capsule,
      registrationNonce: registrationId,
    },
  });
  return {
    id: device.id,
    registrationId,
    signingKey: device.signingKey,
    exchangeKey,
    capsule,
    attestation: { signedText, signature: await signText(device, signedText) },
  };
}

async function approve(
  owners: DeviceIdentity[],
  identities: Map<string, NetworkIdentity>,
  id: string = crypto.randomUUID(),
): Promise<NetworkConversation> {
  const registrationIds = Object.fromEntries(
    owners.map((owner) => [owner.id, identities.get(owner.id)!.registrationId]),
  );
  const decisionAttestations: NonNullable<NetworkConversation['decisionAttestations']> = {};
  for (const owner of owners) {
    const signedText = JSON.stringify({
      path: '/api/network/decisions',
      challengeId: crypto.randomUUID(),
      nonce: 'synthetic-test-challenge',
      payload: { conversationId: id, decision: 'approve', registrationIds },
    });
    decisionAttestations[owner.id] = { signedText, signature: await signText(owner, signedText) };
  }
  return {
    id,
    participants: owners.map((owner) => owner.id) as [string, string],
    registrationIds,
    approvals: Object.fromEntries(owners.map((owner) => [owner.id, true])),
    agentReady: Object.fromEntries(owners.map((owner) => [owner.id, true])),
    state: 'connected',
    createdAt: new Date(NOW - 60_000).toISOString(),
    decisionAttestations,
  };
}

async function fixture() {
  const owners = [await createDeviceIdentity(), await createDeviceIdentity()];
  const identities = new Map<string, NetworkIdentity>();
  for (const owner of owners) identities.set(owner.id, await register(owner));
  const conversation = await approve(owners, identities);
  const context: DisclosureConnectionContext = {
    owner: { id: owners[0].id, registrationId: identities.get(owners[0].id)!.registrationId },
    conversation,
    identities,
    blockedPeerIds: [],
    revokedRegistrationIds: [],
    validUntil: NOW + DISCLOSURE_PREVIEW_TTL_MS,
  };
  return { context, owners, identities };
}

const approved = (draft: DisclosureDraft): DisclosureApproval => ({
  draftId: draft.id,
  previewText: draft.previewText,
  consent: true,
});
async function preview(context: DisclosureConnectionContext) {
  return createDisclosureDraft(await verifyDisclosureConnection(context, clock), selected, clock);
}

test('verified progressive disclosure prepares exactly the selected text for the existing chat envelope', async () => {
  const { context, owners } = await fixture();
  const before = JSON.stringify(context.conversation);
  const draft = await preview(context);
  assert.equal(draft.ownerRegistrationId, context.owner.registrationId);
  assert.equal(draft.recipientRegistrationId, context.conversation.registrationIds[owners[1].id]);
  assert.equal(draft.fields.length, 5);
  assert.ok(Object.isFrozen(draft));
  assert.ok(Object.isFrozen(draft.fields));
  assert.ok(draft.fields.every(Object.isFrozen));
  const message = await prepareDisclosureMessage(draft, approved(draft), context, clock);
  assert.deepEqual(message.envelope, {
    conversationId: context.conversation.id,
    from: owners[0].id,
    to: owners[1].id,
    kind: 'chat',
  });
  assert.equal(message.plaintext, draft.previewText);
  assert.equal(message.expiresAt, draft.expiresAt);
  assert.equal(JSON.stringify(context.conversation), before);
  assert.equal(message.plaintext.includes(owners[0].id), false);
  assert.equal(message.plaintext.includes(context.owner.registrationId), false);
});

test('connected labels and approval booleans do not replace two signed human decisions', async () => {
  const { context, owners } = await fixture();
  const missing = structuredClone(context.conversation);
  delete missing.decisionAttestations![owners[1].id];
  await assert.rejects(verifyDisclosureConnection({ ...context, conversation: missing }, clock));
  const falseApproval = structuredClone(context.conversation);
  falseApproval.approvals[owners[1].id] = false;
  await assert.rejects(
    verifyDisclosureConnection({ ...context, conversation: falseApproval }, clock),
    /bilateral owner approvals/,
  );
});

test('forged, malformed and differently bound decision signatures fail closed', async () => {
  const { context, owners } = await fixture();
  for (const mutation of ['forged', 'malformed', 'conversation', 'decision', 'epochs']) {
    const conversation = structuredClone(context.conversation);
    const receipt = conversation.decisionAttestations![owners[1].id];
    if (mutation === 'forged') receipt.signature = 'A'.repeat(86);
    else if (mutation === 'malformed') receipt.signedText = '{broken-json';
    else {
      const proof = JSON.parse(receipt.signedText);
      if (mutation === 'conversation') proof.payload.conversationId = crypto.randomUUID();
      if (mutation === 'decision') proof.payload.decision = 'decline';
      if (mutation === 'epochs') proof.payload.registrationIds[owners[0].id] = crypto.randomUUID();
      receipt.signedText = JSON.stringify(proof);
      receipt.signature = await signText(owners[1], receipt.signedText);
    }
    await assert.rejects(
      verifyDisclosureConnection({ ...context, conversation }, clock),
      /bilateral owner approvals/,
      mutation,
    );
  }
});

test('both participant registration proofs are checked as well as approval receipts', async () => {
  const { context, owners, identities } = await fixture();
  for (const owner of owners) {
    const replaced = new Map(identities);
    replaced.set(owner.id, {
      ...identities.get(owner.id)!,
      capsule: { ...identities.get(owner.id)!.capsule, alias: 'Unsigned replacement' },
    });
    await assert.rejects(
      verifyDisclosureConnection({ ...context, identities: replaced }, clock),
      /bilateral owner approvals/,
    );
  }
});

test('owner identity and its freshly pinned registration must match a distinct conversation participant', async () => {
  const { context, owners } = await fixture();
  const outsider = await createDeviceIdentity();
  await assert.rejects(
    verifyDisclosureConnection({ ...context, owner: { ...context.owner, id: outsider.id } }, clock),
    /including this owner/,
  );
  await assert.rejects(
    verifyDisclosureConnection(
      { ...context, owner: { ...context.owner, registrationId: crypto.randomUUID() } },
      clock,
    ),
    /owner registration is stale/,
  );
  await assert.rejects(
    verifyDisclosureConnection(
      {
        ...context,
        conversation: { ...context.conversation, participants: [owners[0].id, owners[0].id] },
      },
      clock,
    ),
    /distinct participants/,
  );
});

test('declined, blocked and pending contexts cannot issue disclosure capabilities', async () => {
  const { context } = await fixture();
  for (const state of ['negotiating', 'awaiting-approval', 'declined', 'blocked'] as const)
    await assert.rejects(
      verifyDisclosureConnection(
        { ...context, conversation: { ...context.conversation, state } },
        clock,
      ),
      /bilateral owner approvals/,
    );
});

test('current block lists and either revoked registration prevent verification', async () => {
  const { context, owners } = await fixture();
  await assert.rejects(
    verifyDisclosureConnection({ ...context, blockedPeerIds: [owners[1].id] }, clock),
    /blocked connection/,
  );
  for (const epoch of Object.values(context.conversation.registrationIds))
    await assert.rejects(
      verifyDisclosureConnection({ ...context, revokedRegistrationIds: [epoch] }, clock),
      /revoked registration/,
    );
});

test('connection freshness deadlines and timestamps are bounded and fail closed', async () => {
  const { context } = await fixture();
  for (const validUntil of [NOW, NOW - 1, NOW + DISCLOSURE_PREVIEW_TTL_MS + 1, NaN, Infinity, -1])
    await assert.rejects(verifyDisclosureConnection({ ...context, validUntil }, clock));
  await assert.rejects(
    verifyDisclosureConnection(
      {
        ...context,
        conversation: { ...context.conversation, createdAt: new Date(NOW + 1).toISOString() },
      },
      clock,
    ),
    /timestamp is in the future/,
  );
  for (const now of [NaN, Infinity, -1, NOW + 0.5])
    await assert.rejects(
      verifyDisclosureConnection(context, () => now),
      /clock/,
    );
});

test('a revocation arriving during asynchronous verification prevents capability issuance', async () => {
  const { context } = await fixture();
  let ticks = 0;
  await assert.rejects(
    verifyDisclosureConnection(context, () => {
      if (++ticks === 2) context.revokedRegistrationIds = [context.owner.registrationId];
      return NOW;
    }),
    /context changed/,
  );
});

test('expiry during cryptographic verification and a backwards clock fail closed', async () => {
  const { context } = await fixture();
  for (const finish of [context.validUntil, NOW - 1]) {
    let ticks = 0;
    await assert.rejects(
      verifyDisclosureConnection(context, () => (++ticks === 1 ? NOW : finish)),
      /expired|changed/,
    );
  }
});

test('serialized or forged verification flags cannot authorize previews', async () => {
  const { context } = await fixture();
  const connection = await verifyDisclosureConnection(context, clock);
  for (const forged of [{ verified: true }, {}, JSON.parse(JSON.stringify(connection))])
    assert.throws(
      () => createDisclosureDraft(forged as DisclosureConnection, selected, clock),
      /in-memory verified connection/,
    );
});

test('empty selections, unsupported fields, duplicates, extra properties and absent consent are rejected', async () => {
  const { context } = await fixture();
  const connection = await verifyDisclosureConnection(context, clock);
  const invalid = [
    { fields: [], consent: true },
    { fields: [{ kind: 'location', value: 'Home address' }], consent: true },
    { fields: [selected.fields[0], selected.fields[0]], consent: true },
    { fields: [selected.fields[0]], consent: false },
    { fields: [selected.fields[0]] },
    { fields: [{ ...selected.fields[0], approvedByAgent: true }], consent: true },
    { ...selected, profile: { name: 'Automatic profile disclosure' } },
    { fields: [selected.fields[0], ...selected.fields], consent: true },
  ];
  for (const input of invalid)
    assert.throws(() => createDisclosureDraft(connection, input as DisclosureSelection, clock));
});

test('contact fields are strictly validated and contact links allow only restricted HTTPS URLs', async () => {
  const { context } = await fixture();
  const connection = await verifyDisclosureConnection(context, clock);
  const invalid = [
    { kind: 'display-name', value: ' ' },
    { kind: 'display-name', value: 'x'.repeat(81) },
    { kind: 'display-name', value: 'Name\nEmail: injected@example.com' },
    { kind: 'display-name', value: 'Name\u202Ehidden' },
    { kind: 'email', value: 'not-an-email' },
    { kind: 'phone', value: '+1 (212) 555-0199' },
    { kind: 'phone', value: '12125550199' },
    { kind: 'information', value: 'x'.repeat(601) },
    { kind: 'information', value: 'contains\u0000a control' },
    ...[
      'javascript:alert(1)',
      'data:text/html,hello',
      'http://example.com',
      '//example.com',
      'https://user:password@example.com',
      'https://example.com/?token=secret',
      'https://example.com/#token',
      'https://localhost',
      'https://127.0.0.1',
      'https://[::1]',
      'https://device.local',
      'https://example.com:444',
      'https://example.com\\private',
    ].map((value) => ({ kind: 'link', value })),
  ];
  for (const field of invalid)
    assert.throws(() =>
      createDisclosureDraft(
        connection,
        { fields: [field], consent: true } as DisclosureSelection,
        clock,
      ),
    );
});

test('text is owner-selected plain text and normalization is visible in the exact preview', async () => {
  const { context } = await fixture();
  const draft = createDisclosureDraft(
    await verifyDisclosureConnection(context, clock),
    {
      fields: [
        { kind: 'display-name', value: '  Morgan  ' },
        { kind: 'information', value: '<script>owner-selected text</script>\nA second line' },
      ],
      consent: true,
    },
    clock,
  );
  assert.equal(draft.fields[0].value, 'Morgan');
  assert.equal(
    draft.previewText,
    'I am choosing to share:\nName: Morgan\nInformation: <script>owner-selected text</script>\nA second line',
  );
  assert.equal(
    (await prepareDisclosureMessage(draft, approved(draft), context, clock)).plaintext,
    draft.previewText,
  );
});

test('an exact preview, explicit consent and genuine in-memory draft are required at preparation', async () => {
  const { context } = await fixture();
  const draft = await preview(context);
  for (const invalid of [
    { ...approved(draft), draftId: crypto.randomUUID() },
    { ...approved(draft), previewText: `${draft.previewText}\nOne more secret` },
    { ...approved(draft), previewText: `${draft.previewText} ` },
    { ...approved(draft), consent: false },
    { ...approved(draft), verified: true },
  ])
    await assert.rejects(
      prepareDisclosureMessage(draft, invalid as DisclosureApproval, context, clock),
    );
  await assert.rejects(
    prepareDisclosureMessage(JSON.parse(JSON.stringify(draft)), approved(draft), context, clock),
    /unknown/,
  );
  assert.equal(
    (await prepareDisclosureMessage(draft, approved(draft), context, clock)).plaintext,
    draft.previewText,
  );
});

test('freshly approved owner or recipient registration epochs invalidate earlier previews', async () => {
  const { context, owners, identities } = await fixture();
  const draft = await preview(context);
  for (const changedOwner of owners) {
    const renewed = new Map(identities);
    renewed.set(changedOwner.id, await register(changedOwner));
    const next = {
      ...context,
      identities: renewed,
      conversation: await approve(owners, renewed, context.conversation.id),
      owner: { id: owners[0].id, registrationId: renewed.get(owners[0].id)!.registrationId },
    };
    await assert.rejects(
      prepareDisclosureMessage(draft, approved(draft), next, clock),
      /registration changed after the preview/,
    );
  }
});

test('new conversations, changed owner direction and substituted encryption keys cannot reuse a preview', async () => {
  const { context, owners, identities } = await fixture();
  const draft = await preview(context);
  const differentConversation = { ...context, conversation: await approve(owners, identities) };
  await assert.rejects(
    prepareDisclosureMessage(draft, approved(draft), differentConversation, clock),
    /connection or registration changed/,
  );
  await assert.rejects(
    prepareDisclosureMessage(
      draft,
      approved(draft),
      {
        ...context,
        owner: { id: owners[1].id, registrationId: identities.get(owners[1].id)!.registrationId },
      },
      clock,
    ),
    /connection or registration changed/,
  );
  const otherKeys = await createDeviceIdentity();
  const swapped = new Map(identities);
  swapped.set(
    owners[1].id,
    await register(owners[1], identities.get(owners[1].id)!.registrationId, otherKeys.exchangeKey),
  );
  await assert.rejects(
    prepareDisclosureMessage(draft, approved(draft), { ...context, identities: swapped }, clock),
    /connection or registration changed/,
  );
});

test('revocation, blocking, declined decisions and expiration are revalidated at the preparation boundary', async () => {
  const { context, owners } = await fixture();
  const draft = await preview(context);
  const contexts = [
    { ...context, revokedRegistrationIds: [context.owner.registrationId] },
    { ...context, blockedPeerIds: [owners[1].id] },
    { ...context, conversation: { ...context.conversation, state: 'declined' as const } },
    { ...context, validUntil: NOW },
  ];
  for (const next of contexts)
    await assert.rejects(prepareDisclosureMessage(draft, approved(draft), next, clock));
  await assert.rejects(
    prepareDisclosureMessage(draft, approved(draft), context, () => draft.expiresAt),
    /preview is expired/,
  );
  await assert.rejects(
    prepareDisclosureMessage(draft, approved(draft), context, () => draft.createdAt - 1),
    /preview is expired/,
  );
});

test('capabilities and previews cannot outlive their original freshness deadline even after renewal', async () => {
  const { context } = await fixture();
  const short = { ...context, validUntil: NOW + 1000 };
  const capability = await verifyDisclosureConnection(short, clock);
  assert.throws(() => createDisclosureDraft(capability, selected, () => NOW + 1000), /expired/);
  const draft = createDisclosureDraft(capability, selected, clock);
  let ticks = 0;
  await assert.rejects(
    prepareDisclosureMessage(draft, approved(draft), context, () =>
      ++ticks <= 2 ? NOW : NOW + 1000,
    ),
    /preview expired/,
  );
});

test('a final context mutation after signature verification still prevents message preparation', async () => {
  const { context } = await fixture();
  const draft = await preview(context);
  let ticks = 0;
  await assert.rejects(
    prepareDisclosureMessage(draft, approved(draft), context, () => {
      if (++ticks === 4) context.revokedRegistrationIds = [context.owner.registrationId];
      return NOW;
    }),
    /context changed before message preparation/,
  );
});

test('successful preparation consumes a preview and concurrent duplicate attempts yield only one payload', async () => {
  const { context } = await fixture();
  const draft = await preview(context);
  const outcomes = await Promise.allSettled([
    prepareDisclosureMessage(draft, approved(draft), context, clock),
    prepareDisclosureMessage(draft, approved(draft), context, clock),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected').length, 1);
  await assert.rejects(
    prepareDisclosureMessage(draft, approved(draft), context, clock),
    /consumed/,
  );
});
