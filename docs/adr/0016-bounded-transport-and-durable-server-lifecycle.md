---
id: ADR-0016
title: Bound relay transport and drain handlers before releasing server ownership
status: Accepted
date: 2026-10-08
tags: [reliability, privacy, transport, lifecycle]
depends-on: [ADR-0007, ADR-0008, ADR-0012]
related: [ADR-0015]
---

# ADR-0016: Bound relay transport and drain handlers before releasing server ownership

## Context

A signed request must reach only the relay selected by its owner. A redirect, oversized response, stalled body or mutable payload can undermine this boundary. Separately, closing HTTP connections does not finish their asynchronous handlers: an accepted request may still write data after its socket disconnects. Releasing a single-writer lock at socket closure therefore permits overlapping storage ownership.

## Decision

Reject redirects at both relay request stages, validate the challenge contract, bound response bodies by route and apply a deadline across challenge, signing and response consumption. Snapshot the JSON payload before asynchronous signing. Expose fixed transport errors rather than arbitrary relay-controlled messages. Do not automatically retry signed writes: a failed response does not establish that a mutation was uncommitted.

Track accepted asynchronous HTTP handlers. Stop admitting requests during shutdown, close active sockets after five seconds, then await handlers and durable maintenance before releasing the process lock. A filesystem operation that never finishes must retain ownership rather than falsely report a clean shutdown. Startup validates persisted relay and local session state before listening and announcing readiness. Signal handling is installed before awaiting validation. Corrupt files remain available for investigation; startup errors do not print their contents.

Use a queue/readiness barrier for health probes instead of copying the entire ciphertext store. Bound concurrent asynchronous handlers to 128; overflow returns 503 and a retry hint before owner session creation. This bounds admitted handler work, not the number of header-stage sockets or an end-to-end traffic guarantee. Retention publication and startup validation still determine readiness. The barrier does not certify disk capacity, every future write or traffic capacity. Limit port probing to valid ports, preserve nonzero child-signal exit status and recognize launcher readiness across stdout chunks.

## Consequences

The launch path fails clearly on malformed or corrupt state and preserves the single-writer boundary during ordinary termination. Focused subprocess, real-socket and transport tests cover failures, followed by the existing browser, installer and integration checks. This introduces no transcript persistence, recording, inferred personalization or additional consent authority.

The relay remains one process with finite storage caps. Redirect rejection requires clients to use the actual canonical relay URL. Response limits reflect current wire and storage bounds, not measured scale. Abrupt termination can still leave a stale lock; an operator must establish that no process owns the directory before removing it. Platform host compatibility, independent security review, real participant outcomes and launch policy eligibility remain separate gates.

## Links

- [Consent and durability](0008-fresh-consent-and-durable-storage.md)
- [Retention](0012-bounded-relay-and-local-session-retention.md)
- [Separated conversation scopes](0015-separated-human-chat-disclosure-and-reflection.md)
