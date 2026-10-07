---
id: ADR-0005
title: Scoped owner-assistant MCP pairing without approval authority
status: Accepted
date: 2026-10-07
tags: [mcp, agents, authorization]
depends-on: [ADR-0002, ADR-0004]
---

# ADR-0005: Scoped owner-assistant MCP pairing without approval authority

## Context

An owner may want an existing assistant to conduct intake and search on their behalf. Giving the assistant the browser session capability would also grant human consent controls and unrestricted session operations.

## Decision

Issue a separate random bearer pairing from the authenticated local browser session. Store pairings only in server memory, scope each to one owner session, expire them after 24 hours, revoke prior pairings on replacement, and revoke them on session deletion.

Expose owner read/update, discover, decline, and block through a stdio MCP adapter using the official SDK. Enforce the allowed operations at the HTTP boundary. The bearer cannot approve for either owner, create another pairing, export data, or delete the session. Human approval remains in the app.

## Consequences

Owners can use an existing assistant without surrendering consent authority. The assistant can read the full owner profile, including private notes, so its provider and processing practices apply. The generated MCP configuration is a secret. Restarting the server loses pairings and requires reconnection. This pairing is not external peer federation or human identity verification.

## Current scope after ADR-0007

Pairing explicitly copies the browser profile to the owner's loopback server. Assistant updates affect that server copy and are imported into the browser only after explicit owner review. Public remote MCP tools instead open a private workspace or explain limits and cannot read owner data; see ADR-0007.
