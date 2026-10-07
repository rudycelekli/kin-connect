---
id: ADR-0012
title: Bounded relay and local session retention
status: Accepted
date: 2026-10-07
tags: [privacy, retention, relay, storage, operations]
depends-on: [ADR-0002, ADR-0004, ADR-0007, ADR-0008]
amends: [ADR-0004, ADR-0007, ADR-0008]
---

# ADR-0012: Bounded relay and local session retention

## Context

Earlier reference code removed relay records through acknowledgment, decline, block, and leave but had no automatic relay expiry. Optional local session files expired only when read, leaving unread files on disk. Bounded capacity does not provide a retention policy. Introducing cleanup must preserve signed-consent boundaries, avoid indefinitely extending a pending introduction through polling, and preserve another owner's block when its target disappears.

This decision records the updated source implementation. Deployment and live verification are recorded separately; this ADR's acceptance alone does not establish either. Acceptance is not a security audit or a production-readiness claim. It amends the earlier no-sweep statements in ADR-0004, ADR-0007, and ADR-0008.

## Decision

Use server-owned retention metadata outside signed registration and decision receipts. Preserve the existing wire protocol and independent signed owner approvals. Defaults are:

| Record                                        | Retention                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| Queued encrypted packet                       | 24 hours after queueing, unless removed earlier                        |
| Negotiating or awaiting-approval introduction | Fixed 24-hour deadline from creation                                   |
| Connected conversation                        | 30 days since an accepted message, readiness update, or owner decision |
| Declined or blocked conversation              | 7 days since its recorded closing activity                             |
| Registration                                  | 30 days since a successful signed request                              |
| Optional loopback session file                | 24 hours since its last write                                          |

Messages, readiness updates, polling, and a first approval do not extend a pending deadline. Directory, inbox, conversation retrieval, and acknowledgment requests do not extend connected-conversation retention. Successful signed polling does extend registration activity. Removing a conversation also removes queued packets, its message counter, and its retention metadata. An expired undelivered agent packet in an introduction that has not connected removes the entire conversation.

Registration expiry removes involving conversations and packets and only block records owned by that expired registration. A blocker-owned pair hash survives its target leaving or expiring. Conversation expiry alone does not remove a block. The blocker leaving or expiring removes that owner's protection; a new signing key can still evade this key-based mechanism.

Run serialized relay maintenance every 60 seconds by default and when due before relay health responses and signed requests. Publish changes through the existing atomic replacement and filesystem flush path. A due sweep error makes those requests fail rather than acknowledge cleanup. Sweep local regular session files every 60 seconds and during local health checks; retain read-time expiry and serialize cleanup with session writes. Invalid metadata causes an error rather than resetting retention or silently deleting the affected data. Public relay deployments continue to deny plaintext owner APIs.

Checkpoint successful signed registration activity during maintenance and attempt a final checkpoint on graceful shutdown. Persist deadlines and activity so restart does not reset them. Historical records missing metadata receive one grace period measured from the first successful migration sweep: 24 hours for queued packets and pending introductions, 7 days for terminal conversations, and 30 days for connected conversations and registrations. Persist these baselines before reporting successful cleanup. Do not infer missing historical activity from an old creation time.

Keep browser profiles, saved connections, demo state, and plaintext device keys outside automatic expiry. Owner export, deletion, leave, and remembered-relay cleanup retain their existing scopes. Disclose the difference between active-store retention and deletion from backups, hosting logs, exports, or a recipient's device.

## Consequences

Stale records leave active storage without requiring their owners to return. Fixed pending deadlines limit unfinished negotiations, while persisted migration grace avoids deleting every older record on rollout or granting a new grace period after each restart. Retention metadata adds server-visible activity information and write overhead; the store remains single-process and capacity-bounded.

Delivery after a packet deadline is lost, and an introduction or chat can expire while a user still has a page open. Cleanup requires uptime, a usable wall clock, scheduling, and successful filesystem publication. Clock jumps can accelerate or delay expiry. Abrupt interruption can lose registration activity since the latest checkpoint and shorten the next idle window by roughly a maintenance interval. Tests can verify controlled deadlines, failures, and restarts; they do not establish actual power-loss durability or exact-second deletion.

Expiry is not cryptographic revocation, secure erasure, verified human identity, permanent person-level blocking, or deletion of peer copies, exports, backups, and infrastructure logs. Plaintext localStorage keys, lack of forward secrecy, trusted relay ordering, abuse handling, recovery, and independent security review remain limits or further work.

## Links

- [ADR-0004: Loopback session storage](0004-loopback-session-storage.md)
- [ADR-0007: Real owner encrypted network](0007-real-owner-encrypted-network.md)
- [ADR-0008: Fresh consent and durable storage](0008-fresh-consent-and-durable-storage.md)
- [Privacy and consent](../privacy-and-consent.md#automatic-retention-in-the-updated-source)
- [Protocol retention](../protocol.md#retention-and-restart-behavior)
- [Retention policy implementation](../../server/retention.ts)
- [Relay maintenance and activity](../../server/network.ts)
- [Local session store](../../server/store.ts)
