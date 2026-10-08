# Roadmap

Kin 0.2 includes a real two-owner relay flow, custom interests, private saved connections, and fictional community admission. This ordered plan separates implemented capabilities from further work; it promises no adoption, relationship outcome, or production scale.

## Implemented reference

Browser-local intake, bilateral hard requirements, strict JSON negotiations between independent policy agents, preference explanations, public-place meeting plans, and a labeled fictional demo. The real network adds signed registration, one-use signed requests, encrypted agent messages, separately signed owner approvals, verified receipts, encrypted chat, acknowledgment, decline, key-pair block, and leave.

Public MCP tools open the workspace and explain limits. Explicit local stdio pairing manages a copied owner profile without approval authority. The public source includes reproducible tests and protocol documentation.

The updated source adds automatic retention: 24-hour queued packets and fixed pending-introduction deadlines, 30-day connected-conversation and registration idle windows, 7-day terminal records, and 24-hour local session files since the last write. Sweeps run every 60 seconds while the process runs, with health/request checks and persisted migration grace. Polling refreshes registrations, not conversation activity. A block survives its target's expiry and is removed when its owner leaves or expires. Browser profiles and keys still have no automatic expiry. Earlier installed archives may lack expiry; verify each relay's running version and policy. Source checks and live verification remain separate evidence. See [retention and limits](privacy-and-consent.md#automatic-retention-in-the-updated-source) and [ADR-0012](adr/0012-bounded-relay-and-local-session-retention.md).

Circles illustrate local eligibility, capsule review, separately simulated organizer approval, and withdrawal. Required credentials and paid access remain locked. Private saved connections grant no group membership or messaging permission. Custom interests are preference labels, not inferred hard requirements. Introduction briefs propose a concrete next step from declared common ground; research-informed templates are hypotheses to evaluate in a voluntary pilot.

The new pure public-capsule shortlist, negotiated domain brief and minimal local feedback vault prepare a reviewed discovery flow. Browser integration and actual volunteer outcomes remain pending; neither these modules nor curated synthetic scenarios establish better human outcomes. [Discovery and feedback contracts](owner-discovery-and-feedback.md).

## Communities and private owner context

Implement authenticated organizers, versioned policies, revocable memberships and narrowly verified credentials before real community admission. Billing and group encryption are separate capabilities; paying or joining never supplies another person's consent. [Community architecture](communities.md).

The source includes a disabled-by-default, local selected-text intake endpoint with provenance, explicit approval, bounded requests and owner-review-only suggestions. It has mock-provider contract tests; browser integration, real-provider compatibility, semantic quality and account retention validation are pending. [Assisted intake](assisted-intake.md). Broader context-assisted intake should use owner-selected sources and editable suggestions with provenance. No account-wide ChatGPT history access is implied. LinkedIn authorization is not identity or qualification verification. History/source connectors, behavioral analysis, source revocation and multi-device owner memory remain unimplemented. Use the [pilot guide](pilot-testing.md) to evaluate usefulness and consent before extending the engine.

## Before a supervised community pilot

Obtain independent security review, test adversarial relay behavior, improve key protection, and design recovery/rotation. Bind decisions to explicit proposal versions and define consent expiry/revocation semantics independently of record-retention deadlines. Verify the new sweeps in the deployed service, publish a clear operator policy, and add reporting and staffed abuse handling, durable blocking suited to the deployment, and appropriate identity/age assurance. Retention limits alone do not establish security, person-level blocking, deletion of backups or recipient copies, or production readiness.

Start with one voluntary adult community and a clear intention. Measure reciprocal acceptance, voluntary meeting usefulness, complaints, and deletion completion. The current relay caps and file store are reference limits, not load-tested throughput. No large-scale managed service is implemented.

## Reliable managed service

After pilot evidence, add tenant separation, observable operations without private chat logging, sustainable support, reviewed backup/deletion procedures, migration tests, and a persistence design justified by measured load. Account recovery must not silently surrender browser-key protections.

The [business model](business-model.md) proposes paid managed operations and community tools while retaining the MIT reference. Billing, enterprise identity, an admin console, and staffed support remain unimplemented.

## Interoperability and optional models

Cross-relay federation and A2A conformance are not implemented. Any adapter needs a pinned protocol, actor scopes, key rotation, replay and revocation handling, and interoperability tests.

Optional model-assisted intake requires explicit opt-in, provider/retention disclosure, and owner review. The executable policy and human decisions remain authoritative. No sensitive-trait inference or automatic conversion of notes into consent.

## Distribution

Improve onboarding through evidence from real owners and contributors. Keep generic invitations private-data free. Share connection stories only with separate approval from every identifiable person. The [launch playbook](launch-playbook.md) defines experiments; virality must be observed, not promised.
