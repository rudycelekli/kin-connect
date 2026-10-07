---
id: ADR-0001
title: Local policy-agent reference with a matchmaking bounded context
status: Accepted
date: 2026-10-07
tags: [architecture, domain, agents]
---

# ADR-0001: Local policy-agent reference with a matchmaking bounded context

## Context

The initial product needs to demonstrate owner agents negotiating useful introductions with inspectable rules. Real remote owners, model providers, authentication, and a federated directory would add unverified assumptions to the first release.

## Decision

Build an operational local reference with React, TypeScript, a Node HTTP API, a `matchmaking` bounded context, and fictional peers. Each owner has an independent deterministic policy-agent instance retaining its private policy. Exchange schema-validated JSON to check eligibility, availability, and proposal honesty. Both policies gate ranking. Generate readable dialogue from the completed handshake and label it a simulation.

Enforce age, city, smoking, dating-gender, intention, availability, and paused-state checks in domain services. Keep preference scoring separate. Private freeform boundary notes are advisory and never described as enforced. The public bounded-context API exports domain and application; infrastructure is composed separately.

## Consequences

The app is reproducible without credentials or model costs. Contributors can inspect and test hard constraints. It does not prove matchmaking quality, identity, remote interoperability, or real relationship outcomes. Model-assisted intake and live agents require later reviewed adapters.

## Current scope after ADR-0007

The bounded context and deterministic policy agents remain in use. ADR-0007 adds a separate real two-owner network; fictional-peer simulation is now one view rather than the entire product.
