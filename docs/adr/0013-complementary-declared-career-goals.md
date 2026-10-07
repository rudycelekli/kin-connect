---
id: ADR-0013
title: Complementary career goals with independently verified beginnings
status: Accepted
date: 2026-10-07
tags: [matchmaking, career, privacy, protocol, evaluation]
depends-on: [ADR-0001, ADR-0002, ADR-0003]
amends: [ADR-0011]
related: [ADR-0007, ADR-0010]
---

# ADR-0013: Complementary career goals with independently verified beginnings

## Context

Shared hobbies alone miss complementary professional intentions: seeking and offering mentorship, exploring work and hiring, raising funds and investing. Kin already supports owner-selected, contact-filtered interest labels and encrypted peer cards. A fourth intent or new public schema would increase migration and disclosure scope. Goals are not verified credentials or commitments.

## Decision

Keep career networking in collaboration within the existing matchmaking bounded context. Recognize eight exact normalized owner-entered `Career:` labels and five complementary pair types. Never infer roles from names, bio, history or private notes. Keep genuine shared intersections intact; complementary goals do not become fabricated shared interests.

After bilateral eligibility, opportunity version `kin-opportunity/0.3` splits collaboration's prior 50-point interest signal into 25 topical and 25 complementary career points only when either person selects a recognized goal. Remove recognized goals from topical denominators and overlap to prevent double counting. Career coverage counts distinct supported goals on each side; harmonic coverage bounds the contribution. Ordinary collaboration, friendship and dating retain their previous scoring behavior. Explain unsupported goals, finite goal-only scores and the effect of unilateral goal selection.

Derive a neutral career beginning from both validated interest lists within both policy agents. Use fixed connection priority so role or list reversal does not change the canonical plan. Enforce exact independent plan validation and existing message limits. Keep old wire fields; older peers may fail closed on updated plan text. Human signed approvals, blocks and private policies retain authority.

Expose directional career explanations in local discovery and the career plan through the existing live negotiation surface. Do not introduce automatic private-profile live-directory ranking. Public capsule disclosure remains optional; unselected goals are still peer-disclosed in the opted-in encrypted policy card. Document that distinction.

## Consequences

Useful career beginnings can emerge without shared hobbies, without new public fields, and without agent-granted consent. Inputs remain deliberate structured conventions, not NLP understanding. Self-declared expertise, vacancies, investor status, offers and commercial outcomes are unverified. Synthetic and browser tests establish software behavior only; no human usefulness or 100x improvement is established. See the [engine](../engine.md) and [career testing guide](../career-networking.md).
