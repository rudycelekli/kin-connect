---
id: ADR-0002
title: Human-owned introduction consent and invalidation
status: Accepted
date: 2026-10-07
tags: [consent, policy, safety]
depends-on: [ADR-0001]
---

# ADR-0002: Human-owned introduction consent and invalidation

## Context

An agent may identify shared interests without knowing whether either person actually wants an introduction. A score and an agent-generated conversation cannot stand in for owner authorization.

## Decision

A match becomes connected only after separate owner and peer approval flags are true. Agents recommend; owners decide. The local app explicitly labels the peer approval as a fictional simulation accessible in the same session. No contact details are shared or event booked.

Decline and block close the proposal and cannot be undone by an approval action. Repeat discovery preserves the current session's decisions. Blocked peer IDs persist across profile edits in the session. Pause prevents discovery and approvals while keeping decline and block available. Editing a profile invalidates existing proposals and approvals so prior consent cannot authorize a changed policy snapshot.

## Consequences

The demo illustrates the required two-person decision without pretending to authenticate a real peer. Real-world consent needs independently authenticated actors, proposal/profile versions, expiry, revocation, and actor authorization. Blocks persist across policy edits within a session; account-scoped blocking across sessions remains a pilot prerequisite.

## Current scope after ADR-0007

The fictional view retains its simulated peer control. The separate ADR-0007 network uses independently signed owner decisions bound to the conversation and fresh registration epochs; each browser verifies both receipts. Proposal-version expiry and durable person-level blocking remain further work.
