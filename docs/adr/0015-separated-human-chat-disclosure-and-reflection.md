---
id: ADR-0015
title: Separate human chat, progressive disclosure and owner reflection
status: Accepted
date: 2026-10-07
tags: [privacy, consent, host, personalization, disclosure]
depends-on: [ADR-0002, ADR-0007, ADR-0008]
related: [ADR-0010, ADR-0014]
---

# ADR-0015: Separate human chat, progressive disclosure and owner reflection

## Context

The embedded Kin workspace already contains encrypted human chat. Owners want to choose additional disclosure as a relationship develops, reflect with their own AI and refine future introductions. A host-conversation message is a disclosure to the owner's AI provider, not a person-to-person transport. Sharing aggregate evidence does not grant that permission.

## Decision

Keep human text chat in the existing encrypted Kin channel after independently signed approvals. Do not expose chat through public MCP tools or host model context. Add a pure progressive-disclosure draft service with verified bilateral registration/approval proofs, short-lived opaque in-memory capabilities, exact-preview approval and current context checks at preparation. Bind owner, recipient, conversation, registration epochs and keys. Read no profile automatically, and keep final encryption/transport/revocation checks in the host runtime. Do not claim disclosure can retract recipient copies.

Add a separate strict selected-enum self-reflection preview. Reject identifying and transcript fields. Preserve fictional/live self-report provenance. Only exact explicit approval can produce an argument for the shared host message API; no host call or automatic retry occurs in the service. Local storage, aggregate publication and AI disclosure retain independent consent scopes.

Add optional owner-reviewed topic priorities outside the matchmaking domain, in network candidate orchestration. Apply a bounded, explained adjustment within the existing public-capsule shortlist, leaving original declarations, authentication, exclusions and bilateral policies intact. This is manual deterministic personalization, not inferred feedback, learned reputation or model training. Browser integration, preference persistence/recovery and actual outcome validation remain pending.

Treat human audio as a separate future capability. No microphone, header, media, recording or signaling permission changes are made by this decision. A later calling design must handle individual microphone choices, call acceptance, connectivity and revocation. The owner confirmed on 2026-10-08 that conversation recording and transcription must not be implemented; live calling and owner-volunteered reflections remain separate capabilities. Host permissions and adult/dating publishing scope require actual verification.

## Consequences

The owner can inspect distinct scopes rather than accidentally equating a connection, disclosure, recording or AI reflection. Pure APIs admit focused adversarial tests and preserve the existing relay wire schema. Current-context freshness remains a host responsibility, and relay ordering remains trusted. Opaque capabilities do not survive reload; ambiguous transmission requires deliberate recovery rather than blind retry. Synthetic signatures prove device-key decisions, not human identity. No new browser flows, actual host compatibility, call security, automatic learning or measured matchmaking gains are established by these contracts.

See [connection conversations](../connection-conversations.md), [embedded workspace](../embedded-workspace.md) and [privacy scopes](../privacy-and-consent.md).
