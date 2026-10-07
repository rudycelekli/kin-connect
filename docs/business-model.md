# A business built on useful introductions

Kin's commercial hypothesis is simple: people and communities may pay for a dependable introduction service, while the protocol, client, and reference implementation remain open source under MIT. This is a proposed business strategy, not an existing paid offering, revenue claim, or adoption forecast.

## What stays open

Keep the owner policy engine, message schemas, browser client, relay reference, consent rules, and interoperability tests in the public repository. Anyone can inspect, modify, and self-host the implementation under its license. Publish protocol changes and security limitations alongside releases. A hosted-service subscription must not become a requirement for running a private community relay.

## What people might buy

| Offering                   | Customer value                                                                                                                         | Boundary                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Managed Kin                | Reliable hosting, updates, account recovery once designed, support, and clear retention controls                                       | Subscription pays for operations; it does not buy another person's attention or approval             |
| Community tools            | Separate opt-in community spaces, host onboarding, abuse handling, event coordination, and aggregate health metrics                    | Hosts cannot inspect encrypted conversations or approve for members                                  |
| Enterprise integrations    | Deployment support, reviewed identity integration, private community administration, and explicit integrations with existing workflows | Employer or administrator access does not grant access to private matching policies or personal chat |
| Support and implementation | Help adopting the open protocol, maintaining a deployment, and validating an adapter                                                   | A support contract does not imply an independent security audit                                      |

These capabilities require further engineering. The present release has a single-process relay, browser-held keys, and no billing, enterprise identity, admin console, production recovery, or staffed moderation service.

## Trust commitments

Do not sell private profiles, dating preferences, hard requirements, conversations, or inferred personal characteristics. Do not train models on private owner data by default. Do not add targeted advertising based on that data. Charge for service quality and community operations.

No paid tier can bypass bilateral requirements, undo a decline or block, approve for another owner, expose contact information before permission, or secretly influence an explanation. If a future product offers sponsorship or discovery placement, label it and keep it outside the eligibility and consent decision. The first release has no paid ranking.

Collect only operational information needed to run the service. Prefer aggregate measures and voluntary outcome feedback; avoid retaining raw profiles or chat for growth analysis. Publish incident handling, deletion, and retention practices before selling managed hosting. Describe the actual cryptography and threat model without promising absolute privacy.

## Capacity and adoption gates

The current implementation caps each relay at 200 registered agent keys, 2,000 conversations, and 2,000 queued encrypted packets. It uses one atomic JSON file and has no automatic retention sweep. These are implementation limits, not demonstrated capacity or a service-level promise.

| Phase               | Planning cohort                                           | Evidence needed before expanding                                                                                                                                 |
| ------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Developer reference | Two independent browser owners plus external contributors | Repeatable install, encrypted negotiation, independently signed approvals, decline/block/leave tests, and accurate docs                                          |
| Supervised pilot    | One voluntary community of roughly 30–50 adults           | Independent security review, appropriate age/identity process, abuse reporting, staffed response, deletion/retention controls, and voluntary usefulness feedback |
| Managed community   | Several small communities, each with a named host         | Measured reliability and support costs, explicit tenant separation, sustainable unit economics, and independently checked recovery/rotation design               |
| Broader service     | Set after load testing and pilot outcomes                 | Replace single-file storage where needed, validate migration and privacy behavior, and show sustained useful introductions without rising complaint rates        |

Cohort sizes are planning hypotheses. There are no existing user counts or promises of scale in this document. Keep expansion contingent on participant value and operational readiness rather than a growth target alone.

## Decisions to validate

Interview community hosts about willingness to pay for reliability and moderation tools. Run pricing experiments only after a useful pilot, with clear terms and voluntary participation. Measure service cost per active community, support burden, reciprocal acceptance, voluntary meeting usefulness, and retention of community membership. Avoid optimizing for time spent browsing or pressure to disclose more.

The [launch playbook](launch-playbook.md) describes how to test distribution. The [privacy guide](privacy-and-consent.md) describes what the current software actually protects. Open source makes those claims inspectable; it does not establish them by itself.
