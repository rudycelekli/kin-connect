---
id: ADR-0003
title: Custom versioned Kin negotiation flow without A2A conformance claims
status: Accepted
date: 2026-10-07
tags: [protocol, interoperability]
depends-on: [ADR-0002]
---

# ADR-0003: Custom versioned Kin negotiation flow without A2A conformance claims

## Context

Agent communication standards offer useful discovery and transport patterns, but a local policy simulation does not implement their wire contracts, authentication, signatures, or interoperability requirements.

## Decision

Name the current flow `kin/0.1`. Publish its message shape, actions, consent states, local API, and extension requirements. Serve a custom capability descriptor at `/.well-known/kin-agent.json` including `a2aConformant: false`.

Exchange versioned offer, policy-response, window-proposal, window-response, meeting-proposal, suggestion-ready, and rejected messages between separate local agents. Render six readable transcript kinds: discover, requirements, interests, availability, proposal, and decision. Message IDs and fixed transcript timestamps are simulation metadata. Agent display names are not authenticated identity. Keep private requirement values and freeform notes out of the exchanged card and transcript.

## Consequences

Developers have a runnable domain example and a documented implementation boundary. A future A2A adapter must pin a supported version, authenticate actors, protect against replay and unauthorized disclosure, and pass interoperability tests. Transport conformance alone cannot grant owner consent.

## Current scope after ADR-0007

ADR-0007 carries the same strict agent messages through encrypted kin-relay/0.1 transport. Network identities are signing-key fingerprints with verified registration bindings; fixed timestamps remain fictional-transcript metadata. A2A conformance and cross-relay federation are still not implemented.
