---
id: ADR-0006
title: Browser-only fictional demo using the shared domain
status: Accepted
date: 2026-10-07
tags: [demo, deployment, privacy]
depends-on: [ADR-0001, ADR-0002]
---

# ADR-0006: Browser-only fictional demo using the shared domain

## Context

People should be able to explore the owner-agent interaction without installing a server. Hosting the local API publicly would break its security assumptions and expose a simulated consent mechanism as a live service.

## Decision

Provide a separate static build using the same deterministic matching domain with an in-browser adapter. Keep profile, proposal, consent-simulation, and block state in one plaintext localStorage key, `kin-local-demo-v1`. Support export and deletion of that app key. Make external assistant pairing unavailable in this build.

The app makes no profile or match API request during static matching. Serve ordinary static assets through GitHub Pages. Label the people and peer decision as fictional. Preserve bilateral gates and the explicit two-step demo approval.

## Consequences

The interaction can be shared through a public URL without a hosted matchmaking backend. Browser storage is not encrypted, can be read by same-origin code or suitably privileged extensions, and has no automatic expiry. Deletion does not erase exported or copied data. The static host sees ordinary request metadata. A real community service remains a separate authenticated-pilot milestone.

## Current scope after ADR-0007

Browser-local intake now applies to every app build. The Connections view remains fictional, while the static browser client may separately opt into a configured HTTPS relay through the real-owner flow in ADR-0007. Static hosting alone is not a relay.
