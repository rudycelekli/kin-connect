---
id: ADR-0008
title: Fresh owner consent, durable state, and persistent blocks
status: Accepted
date: 2026-10-07
tags: [privacy, consent, relay, mcp, cryptography]
depends-on: [ADR-0002, ADR-0004, ADR-0005, ADR-0006, ADR-0007]
amends: [ADR-0004, ADR-0007]
---

# ADR-0008: Fresh owner consent, durable state, and persistent blocks

## Context

The real-owner relay must connect independently authorized people without collecting their full intake or letting model tools grant an introduction. A browser may retain the same device keys while its owner changes preferences, so historical registration and approval signatures must not authorize a fresh negotiation. The fictional demo, a local owner-assistant pairing, and a public ChatGPT workspace have different data-access boundaries.

## Decision

This decision records implemented behavior. Acceptance does not certify the service as audited or production-ready.

Keep owner intake, private policy, and free-text notes in browser storage in every app build. Public MCP tools can open the workspace and explain privacy; their input schemas have no personal fields, and their handlers cannot read profiles, find people, approve, or send messages. The public service rejects the local owner profile/session/export/pairing APIs.

Local owner-assistant pairing remains a separate, explicit action. The pairing button copies the browser profile to a loopback-only session and creates a scoped, expiring bearer configuration for the chosen assistant. The owner reviews assistant changes before importing them into the browser profile. The assistant can read that copied profile, including private notes; its provider's processing practices apply. Its bearer cannot approve introductions. Deleting app data revokes the local pairing and removes the copied session.

The real network uses a separately chosen, contact-free public capsule containing an alias, purpose, intentions, and optional public interests. Signing and exchange private keys stay in the browser. Each client signs its relay requests using ECDSA P-256/SHA-256 with canonical request text, including the path, a single-use challenge, its nonce, and the payload. The identity is the SHA-256 fingerprint of the canonical signing public key. Public registration attestations bind the capsule and exchange key to that identity; browsers verify them before negotiating.

Every registration includes a fresh **client-generated** UUID `registrationNonce` in its signed payload. Its returned `registrationId` is that nonce. The client verifies the registration response against the exact request it just signed and pins its own registration for the active runtime. A relay-supplied challenge cannot provide client freshness because a hostile relay could repeat an earlier challenge. Re-registering an existing identity closes its prior active conversations, clears readiness and approvals, removes approval receipts, and purges queued packets. Existing pair blocks remain in force.

Each conversation captures both participants' registration IDs. Human approval is a separately signed decision containing that conversation ID and the exact two-participant `registrationIds` map. The relay accepts approval only after both policy agents are ready and both captured epochs still match current registrations. It marks a conversation connected only after two distinct owner approvals. Browsers independently verify both signed approval receipts against the conversation and current registration epochs before enabling or accepting human chat. An agent recommendation, relay boolean, old receipt, or first owner's yes cannot unlock chat.

Peers exchange only allowlisted matching facts and proposals using ECDH P-256/HKDF-SHA-256 conversation keys and AES-256-GCM. Fresh 96-bit IVs and authenticated conversation, sender, recipient, and message-kind context protect each encrypted packet. Raw requirements, free-text private notes, contacts, and the owner's real name stay out of peer policy cards. The relay stores and routes ciphertext without decrypting it. It still learns public capsules, public keys, participants, decisions, timestamps, packet sizes, and temporary request IP information.

Inbox access is scoped to the signing identity; only the intended recipient may acknowledge and delete a packet. Decline closes the conversation, clears approvals, and removes undelivered packets. Block revokes all conversations for the pair and prevents new ones. Block records belong to the owner who blocked and retain only that blocker's ID and a SHA-256 hash of the sorted pair of IDs. A blocked peer cannot erase another owner's protection by leaving and rejoining with the same signing key. Leave removes the departing identity and involving conversations, packets, counters, and blocks that the departing owner created. Other owners' hashed protection records are an explicit deletion exception and remain until their owner leaves. Device-key deletion follows relay cleanup so an unavailable relay can be retried with the existing keys. Neither deletion nor leave can erase copies a recipient already received.

## Consequences

Two real browser owners can run their own deterministic policy agents, negotiate over encrypted transport, and independently approve a human chat. The relay never needs their private profiles or encryption private keys. Browser-local intake and public model tools remain separate from the optional loopback copy shared with an existing assistant.

The release remains a capacity-bounded, single-process prototype. JSON updates flush the temporary file, replace the published file atomically, and fsync the containing directory on POSIX before acknowledging. Session deletion likewise fsyncs directory metadata before acknowledgment; relay deletion is a flushed replacement of its state document. Windows receives file flushes but lacks this portable directory-fsync step. These mechanisms request durable filesystem commits; tests of failures and restarts do not prove behavior during real power loss or storage-controller failure. Registrations and ciphertext have no automatic expiry: packets are removed by acknowledgment, decline, block, or leave, and identity/conversation records persist until leave. HTTP admission limits, finite identities/conversations/packets, and lifetime agent-message limits bound the implementation; they are not a complete abuse or moderation system.

Plaintext browser key storage, compromised devices or trusted application code, visible metadata, recipient copies, and lack of forward secrecy remain material limits. Signed key possession does not verify a real person or prove a human physically clicked a button. A new signing key creates another pseudonymous identity and can evade a previous block. Signatures and fresh epochs constrain forgery and historical-consent reuse; an actively hostile relay can still suppress delivery, conceal later revocations, or present incomplete history. Proposal-content binding, stronger recovery/rotation, revocation freshness, storage fault testing, and independent security review remain future work.
