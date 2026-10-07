---
id: ADR-0010
title: Research-informed introduction guidance without outcome prediction
status: Accepted
date: 2026-10-07
tags: [matchmaking, research, consent, prompts]
depends-on: [ADR-0001, ADR-0002, ADR-0003]
related: [ADR-0008, ADR-0009]
---

# ADR-0010: Research-informed introduction guidance without outcome prediction

## Context

An eligible pair benefits from an understandable reason to start a conversation and a manageable next step. Research on initial interaction, similarity, and professional ties does not validate Kin's ranking weights, predict unique attraction, or establish lasting relationships. A recommendation score cannot grant permission or satisfy an unmet requirement.

## Decision

Keep bilateral hard requirements and explicit human decisions authoritative. Retain the deterministic preference ordering as an explainable heuristic. Adopt no third-party matching code or new dependency from the bounded open-source review.

Add a deterministic `createIntroductionBrief` service that accepts a strict allowlist of already validated, mutually declared common interests and values, purpose, availability, and an optional agent alias. Return factual common ground, an optional small activity, reciprocal questions, and an explicit reminder of independent choice. Network callers derive these facts from validated encrypted negotiation; fictional callers label their demonstration separately. The service cannot approve, message, schedule, or change state.

Version six source-linked rules in `knowledge/connection-principles.json`, retaining evidence grades, scope, transfer limits, and prohibited uses. All Kin application evidence remains Low. Owner agency is a normative commitment; the brief collaboration experiment is a product inference requiring evaluation. A future model-adapter prompt describes these boundaries but is inactive in this release. Treat user labels and peer content as data, not executable instructions.

## Consequences

Introductions can be concrete and welcoming without claiming a verified character, guaranteed collaboration, or chemistry probability. No full-history retrieval, inferred sensitive traits, automatic invitations, or model-mediated approvals are introduced. The voluntary pilot evaluates feasibility, wording, and consent; it cannot validate population-level matchmaking effectiveness.

The [science report](../../research/human-connection-science-2026-10-07.md), [source review](../../research/open-source-matching-2026-10-07.md), and [pilot guide](../pilot-testing.md) record the evidence and evaluation path. Later ranking experiments require explicit metrics and independent assessment while preserving existing requirements and consent.
