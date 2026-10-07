---
id: ADR-0011
title: Reciprocal declared-preference ranking and complete proposal validation
status: Accepted
date: 2026-10-07
tags: [matchmaking, ranking, protocol, evaluation]
depends-on: [ADR-0001, ADR-0002, ADR-0003]
related: [ADR-0008, ADR-0010]
---

# ADR-0011: Reciprocal declared-preference ranking and complete proposal validation

## Context

Raw shared-label counts can favor broad lists over focused common ground. The previous protocol verified claimed shared facts individually but could accept a subset that omitted genuine overlap. Different-city owners permitting an introduction received an inappropriate local-place suggestion. None of these algorithms has measured human-outcome validity.

## Decision

Use a versioned, inspectable declared-opportunity heuristic after bilateral hard eligibility. Apply intention-specific product weights and per-signal harmonic means of both people's declared-list coverage. Publish directional scores, contributions, and limits. Do not use identity, demographics, private notes, inferred traits, or history for soft ranking. Keep low-overlap eligible candidates eligible.

Derive canonical common ground once and require complete semantic interest/value intersections on negotiation. Normalize identities before replay and duplicate checks; fail closed on ambiguous candidate identities. Retain minimal in-memory rejected-conversation tombstones. Derive and independently validate a short online beginning when both people permit different cities. Envelope fields remain unchanged, but older peers can reject updated remote plans; interoperability is not assumed.

Refresh only unreviewed fictional/local suggestions. Preserve reviewed proposal facts and all existing human decisions. Keep live capsule selection owner-driven; no private-profile live directory ranking is introduced.

Add a deterministic synthetic benchmark to CI and label the comparison as curated regression counterexamples. Timings measure the synchronous local engine only. Preserve the signed mutual-consent network boundary.

## Consequences

Focused overlap can outrank larger lists, score provenance is inspectable, and incomplete proposals reject. Broad-interest owners can rank lower and fewer selected labels can influence the heuristic. Weights require voluntary evaluation; passing synthetic cases does not establish a 100x improvement, fairness across populations, chemistry prediction, or better real meetings. See the [engine specification](../engine.md) and [benchmark record](../../research/engine-benchmark-2026-10-07.json).
