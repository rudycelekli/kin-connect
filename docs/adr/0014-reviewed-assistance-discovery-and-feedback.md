---
id: ADR-0014
title: Reviewed assistance, public-capsule discovery and minimal outcome evidence
status: Accepted
date: 2026-10-07
tags: [privacy, intake, discovery, evaluation, consent]
depends-on: [ADR-0002, ADR-0004, ADR-0007]
related: [ADR-0005, ADR-0010, ADR-0013]
---

# ADR-0014: Reviewed assistance, public-capsule discovery and minimal outcome evidence

## Context

Kin needs useful discovery and coherent introductions without treating a model's explanation as eligibility, inferred user knowledge or human consent. Model assistance adds external processing and cost. Voluntary outcomes need a separate evidence boundary from fictional examples and ranking development.

## Decision

Keep enforcement and negotiation in the deterministic matchmaking domain. Derive the contextual introduction brief from validated policy cards and the exact agreed canonical plan. Include it in local discovery results and expose a read-only agent briefing method only after a proposal is ready. The host must still honor human decline/block state; an agent stage does not override it.

Use a separate pure capsule shortlist over authenticated public declarations. The upstream host verifies directory signatures before ranking. Exclude self, blocked IDs, conflicting duplicates, malformed capsules and wrong intentions. Cap inputs and outputs. No private peer profile or demographic inference enters relevance. The score is not private eligibility or an outcome probability. Choosing a capsule, exchanging encrypted policy cards and independently approving remain separate actions. No automatic invitation is introduced.

Make optional model intake a loopback owner-session capability, disabled by default and always disabled on public relays. Require a provider/model pair and explicit selected-text approval. Deny paired assistants. Send only that text to fixed official endpoints, reject redirects, bound attempts, concurrency, response bytes, tokens and duration, and sanitize errors. Return strict suggestions with provenance and mandatory owner review; never save profiles, change requirements, discover or approve. Recheck revocation after asynchronous reads and suppress results when the reviewed profile changes. Provider deletion/retention and a durable monetary budget are separate concerns.

Keep outcome evidence in a separate local module: consented, minimal self-reports, no names, peer IDs or transcripts. Retain the newest 50 until deletion. Export only separately approved live-owner aggregates, excluding fictional demos. Do not call retrieval, feedback storage or these rule changes model training. Require independent pilot metrics and protected holdouts before promoting an algorithm based on outcomes.

Browser integration of shortlist, assisted intake, unified live briefs and feedback controls remains pending product confirmation and subsequent implementation. Existing browser deletion/export does not yet include the unused feedback vault. This decision accepts the bounded service contracts, not an unexecuted user flow or production release.

## Consequences

Local assistant discovery gains a consistent negotiated brief. Public capsule relevance and voluntary evidence have testable seams without new disclosure fields or consent authority. AI request limits are process-local and reset on restart; they do not cap account dollars. Deletion cannot retract already transmitted text, and schema validation cannot prove semantic fidelity or absence of sensitive inference. Mock provider tests establish contracts, not real-model quality. Synthetic tests establish software behavior, not safe meetings, unique participants, adoption or measured improvement.

See [assisted intake](../assisted-intake.md), [discovery and feedback](../owner-discovery-and-feedback.md) and the [privacy scopes](../privacy-and-consent.md).
