---
id: ADR-0007
title: Real owner network with browser-held keys and signed consent
status: Accepted
date: 2026-10-07
tags: [network, privacy, consent, cryptography]
depends-on: [ADR-0001, ADR-0002, ADR-0003, ADR-0006]
---

# ADR-0007: Real owner network with browser-held keys and signed consent

## Context

The fictional reference cannot introduce real owners. A real flow requires independent owner authorization and transport that does not upload full intake or readable messages. Public model tools must not gain consent authority.

## Decision

Keep app intake and private policy in the browser. Provide a separate opt-in network where each browser creates signing/exchange keys, registers a chosen capsule, and runs its own deterministic policy agent. Route opaque encrypted messages through a challenge-authenticated relay. Verify signed bindings of capsule and exchange key, and pin the peer key for the active conversation.

Use ECDSA P-256 requests and owner decisions, ECDH P-256 plus HKDF-SHA-256 conversation keys, and AES-256-GCM with fresh 96-bit IVs and authenticated context. Require both agents ready and independent signed owner approval. Each join uses a fresh client registration nonce; approval binds the current two-registration map. Re-registration clears old active state. Browsers verify both receipts before human chat. The real flow has no fictional peer-approval action.

Disclose the peer card at opt-in, use a chosen public alias, and omit raw requirements, bio, and notes. Public MCP tools open a workspace and explain limits without accessing personal state. Keep local owner-assistant pairing explicit and separate.

## Consequences

Two independent browser owners can connect through one relay without an LLM. The release remains unaudited. Plaintext browser private keys, no forward secrecy, visible metadata, recipient copies, key-based identity, and trusted relay ordering are explicit limitations. JSON storage is single-process and capacity-bounded, without automatic expiry. Leave removes involving relay records while device keys remain until forgotten. Durable abuse controls, rotation, recovery, versioned consent/revocation, and independent review remain future work.

ADR-0006 still describes the fictional Connections view. Its browser-local intake decision now applies to every app build. The real network is a distinct implemented path rather than the fictional consent simulation.

## Amendment by ADR-0008

Fresh client registration epochs, reviewed assistant imports, remembered-relay cleanup before key deletion, blocker-owned hashed retention, and acknowledged filesystem flush behavior are described precisely in ADR-0008. It amends the initial real-network decision without changing the independent human-consent boundary.
