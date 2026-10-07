---
id: ADR-0009
title: Fictional circle admission with explicit owner and simulated organizer consent
status: Accepted
date: 2026-10-07
tags: [communities, consent, privacy, demo, admission]
depends-on: [ADR-0002, ADR-0006, ADR-0008]
---

# ADR-0009: Fictional circle admission with explicit owner and simulated organizer consent

## Context

People may want a shared community as well as an individual introduction. Admission can depend on a circle's purpose, city, meeting window, verified qualification, or paid entitlement. A fit score cannot supply owner disclosure consent, organizer authorization, a credential proof, or a payment.

Kin currently has a browser-local fictional demo and a separate real two-owner relay. Reusing the relay's connected state as membership would imply permissions and organizer authentication that the implementation does not have.

## Decision

Accept the **fictional browser-local Circles slice** only. The catalog and host agents are illustrative fixtures. Deterministic local policies check profile and circle validity, an unpaused agent, adult eligibility, required city and purpose, shared selected interests, and a common meeting window. Owner-entered age and other facts remain unverified. Any required credential or paid-access gate fails closed because verification and billing are absent.

Show the owner the exact capsule before an explicit Apply action: chosen agent alias, circle purpose, shared interests, and a required city only for an eligible city-restricted application. Exclude real name, age, biography, private requirements, boundaries, notes, and contact details. Store the allowlisted application in plaintext browser demo state, without sending it to the real relay or assistant pairing.

Apply creates `pending-organizer` with owner approval true and organizer approval false. A separately labeled **Simulate organizer approval** control sets both flags and produces `member`, shown as **Demo member**. This control authenticates no real organizer and creates no live membership. Decline and withdrawal clear both flags and close the application. An active application cannot be duplicated; a later fresh owner choice may replace a closed application.

Bind each application to local owner-profile and circle-policy change detectors. Reject stale snapshots, inconsistent consent flags, malformed records, altered disclosures, and closed-state replay. These fingerprints are noncryptographic local change detectors. Loading drops invalid or stale applications, profile edits clear them, and export/deletion follows the browser demo's existing scope.

Circle state grants no relay access, human chat, DM permission, group keys, verified badge, or paid benefit. Preserve independent two-owner consent for real introductions under ADR-0008.

## Consequences

The demo can make owner review and organizer review concrete while preserving the distinction between a policy recommendation and admission. It remains easy to export and delete locally, but plaintext browser storage and exported copies retain the limits in ADR-0006. Simulated approvals and local fingerprints must never become authorization evidence for a live organizer service.

The closed credential and payment fixtures demonstrate unavailable requirements honestly. They cannot be enabled by changing a client approval flag or treating sign-in as verified qualification.

## Future proposals, not accepted implementation

A real community service needs authenticated organizer roles, versioned policies, scoped review permissions, revocable memberships, explicit minimal owner disclosures, and proof/decision binding to a fresh application. Trusted issuers, subject relationships, validity, and status must be evaluated; a credential signature alone does not establish truth. [W3C VC 2.0](https://www.w3.org/TR/vc-data-model-2.0/).

Consider a separately tested credential adapter with minimal claims and owner-approved presentations, bound to the verifier audience and transaction nonce. Format choice, replay resistance, status freshness, correlation, and conformance remain open design work. [OpenID4VP 1.0](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html).

Paid admission requires explicit purchase and recurring-payment choices, backend-confirmed entitlement, verified webhook signatures, and idempotent reconciliation. A success redirect or organizer flag is insufficient evidence. [Stripe webhooks](https://docs.stripe.com/webhooks), [Checkout Session reference](https://docs.stripe.com/api/checkout/sessions/object).

Group messaging requires a separately reviewed encryption and membership-change protocol. Membership never grants blanket permission to DM or disclose a member's private data. Managed community operations may fund the project while the MIT core remains free; private-data sales and paid consent bypasses are excluded. See the detailed [community and owner-memory proposals](../communities.md).
