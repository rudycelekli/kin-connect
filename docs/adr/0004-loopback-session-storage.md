---
id: ADR-0004
title: Loopback-only session storage with export and deletion
status: Accepted
date: 2026-10-07
tags: [storage, privacy, deployment]
depends-on: [ADR-0001, ADR-0002]
---

# ADR-0004: Loopback-only session storage with export and deletion

## Context

Profiles contain personal context and potentially sensitive dating preferences. The reference implementation needs durable local sessions without introducing a hosted account database or third-party processing.

## Decision

Bind the server to loopback and validate local host and mutation-origin boundaries. Identify sessions with a random 32-byte HttpOnly, SameSite cookie capability. Hash the capability for storage filenames, restrict filesystem modes, serialize mutations, and atomically replace plaintext JSON under `.data/sessions`.

Provide export and deletion for the active session. Treat sessions more than 24 hours from their last write as expired when read. Use no model, email, analytics, address-book, or external-agent service in the default flow.

## Consequences

Data stays on the machine during default usage, but is readable by administrators, malware, and backups. Expiry is lazy; an unread file is not swept. Deletion cannot retract exports or backups. Production requires independent authentication, encryption and retention review, active sweeping, revocation, abuse controls, and independent security review.

## Current scope after ADR-0007

This storage decision now applies to the optional loopback developer/session API and explicit assistant profile copy. All app intake is browser-local. Public relay deployments disable plaintext owner APIs and use the separate metadata/ciphertext store described in ADR-0007.
