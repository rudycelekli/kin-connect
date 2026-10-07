# Circles, communities, and admission

Kin's Circles view is a **fictional browser-local demo** of joining a social, creative, or professional community. It assesses fit, lets the owner review a small application capsule, and requires a separate **simulated organizer approval** before showing **Demo member**. It creates no real membership, contacts no organizer, opens no group chat, verifies no credential, and takes no payment.

The catalog illustrates four policies: Brooklyn Coffee Circle, Makers Exchange, Founders Table, and Members Club. The professional credential gate and paid club gate remain closed. A favorable agent assessment cannot bypass either requirement.

## What works in this slice

The deterministic local assessment checks a valid adult owner profile, a valid circle policy, an active agent, minimum age, required city and purpose, a shared selected interest, and an overlapping meeting window. These checks use owner-supplied facts; they do not verify a person's age, identity, or qualifications. The displayed owner/host exchange explains the local policy calculation. It is a simulation, not a conversation with an authenticated organizer or an LLM.

The owner reviews the exact capsule, checks **I want to apply and share only this capsule**, and chooses **Apply to this circle**. The capsule stays in the local application:

| Field     | Included value                                                        |
| --------- | --------------------------------------------------------------------- |
| Alias     | The owner's chosen agent name                                         |
| Purpose   | The selected circle's purpose                                         |
| Interests | Only interests shared with that circle                                |
| City      | Included only for an eligible application to a city-restricted circle |

The capsule omits the owner's real-name field, age, biography, private requirements, boundaries, notes, and contact details. A chosen alias or interest can still identify someone; minimal disclosure is not anonymity.

| Application state         | Required decision                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pending-organizer`       | Explicit owner application; organizer approval is false                                                         |
| `member`                  | Owner application plus the separate **Simulate organizer approval** control; the UI labels this **Demo member** |
| `declined` or `withdrawn` | Both approval flags cleared; the application cannot be reopened                                                 |

A fresh application may replace a closed one after a new explicit owner choice. Active duplicates are rejected. Owner-profile and circle-policy change detectors bind each application to its local snapshots, and transitions reject stale or altered disclosures. These compact fingerprints are change detectors, not cryptographic proofs or credential attestations. Loading filters malformed or stale records; editing the owner profile clears applications.

Applications share the plaintext browser storage key `kin-local-demo-v1` with the local profile and fictional connections. Export includes these records; app deletion clears them. Same-origin code or sufficiently privileged extensions can read browser storage, and deletion cannot remove copies of an export. Circle applications are not sent to the real-owner relay or copied into the optional owner-assistant pairing. See [privacy and deletion limits](privacy-and-consent.md).

## Proposed real admission architecture

Everything below is a design proposal. The current release has no live organizer roles, credential wallet/verifier, shared membership service, billing integration, or encrypted group messaging.

Treat admission as its own bounded context with an owner, circle, organizer, versioned admission policy, application, and revocable membership. Keep payment entitlement and credential verification as separate evidence inputs. A policy recommendation, a verified claim, payment, and organizer acceptance are different events; none should silently supply another party's consent.

The proposed application flow is:

1. Fetch an authenticated organizer's published policy, policy version, disclosure purpose, and exact requested claims.
2. Evaluate local fit privately. Show the owner the recipient, capsule, any proof request, retention, and proposed fee before disclosure.
3. After explicit owner approval, create a bounded application tied to that policy version and a fresh application challenge.
4. Verify required evidence. Missing, unsupported, expired, revoked, ambiguous, or unverifiable evidence keeps admission unavailable.
5. Require an authorized organizer's separate decision and record the decision's policy version, application, actor, and expiry.
6. Issue a membership with defined permissions, expiry, revocation, withdrawal, and appeal/review behavior. Policy or evidence changes require explicit reevaluation.

Real organizer roles need scoped authorization: who can publish policies, review a particular application, accept or remove a member, and audit administrative changes. A client-supplied `organizerApproved` flag must never grant membership. Organizers should receive only admission-relevant results and owner-approved capsule fields; private policy calculations and failed optional tests stay local. Review logs should avoid raw credentials and unrelated profile data.

### Credentials and selective disclosure

W3C Verifiable Credentials Data Model 2.0 separates issuer, holder, subject, and verifier. A holder is not necessarily the subject, and a valid signature does not establish that a claim is true. The verifier still evaluates issuer trust, proof, subject, and claims against its policy. The model includes validity and status mechanisms and recommends abstract, minimal claims. [W3C VC 2.0](https://www.w3.org/TR/vc-data-model-2.0/).

For Kin, the proposed trusted-issuer policy would specify which issuer may attest each qualification and which subject relationship satisfies admission. Request a result such as `professional_membership_current: true` or an issuer-supported age threshold rather than a raw ID document, exact birth date, employment history, or the full credential. If the issuer cannot supply the needed minimal claim safely, keep the gate closed rather than inventing proof from a LinkedIn account or an agent's guess. Check validity, suspension/revocation status, and status freshness at admission and on renewal; a failed status lookup cannot become approval. [W3C validity and status](https://www.w3.org/TR/vc-data-model-2.0/#status), [abstract claims](https://www.w3.org/TR/vc-data-model-2.0/#favor-abstract-claims).

OpenID4VP 1.0 provides credential-presentation requests with DCQL claim selection. Selective disclosure depends on the credential format; it does not itself ensure unlinkability. Presentations must bind proof of possession to the intended verifier and a fresh transaction nonce, and the verifier must perform its own checks. Wallet disclosure should follow informed owner consent. [OpenID4VP 1.0](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html).

The proposed integration must bind the verified subject to the applying owner, and bind each presentation to the organizer audience, fresh nonce, application, and policy version. Reject a proof reused for another community, recipient, transaction, or policy. Prefer a narrow verification result with an expiry over retaining the presentation. Assess correlation from signatures, identifiers, issuer/status requests, and verification logs before choosing a format. A standards adapter and conformance tests would be separate implementation work; Kin currently claims no VC or OpenID4VP conformance.

### Paid clubs

Paid access stays closed in the demo. A future owner must review the actual seller, amount, currency, benefit, term, refund/cancellation policy, and whether renewal is recurring before choosing checkout. Joining, credential disclosure, paying, and recurring payment authorization remain separate decisions. Agents cannot spend money, turn a one-time purchase into a subscription, or accept new renewal terms automatically.

Stripe distinguishes Checkout completion from payment status; payment can still be processing after a completed session. A return to a success page is not reliable fulfillment evidence. [Checkout Session reference](https://docs.stripe.com/api/checkout/sessions/object), [Checkout post-payment events](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted).

The proposed payment adapter would create checkout on an authenticated backend with a fixed server-selected offer, an opaque application reference, and a separate payment entitlement. It would keep matching profiles, raw credentials, and private notes out of payment metadata. Admission would require the specific offer's verified entitlement plus all other gates and organizer acceptance.

Stripe requires webhook signature verification using the unchanged request body. Deliveries may repeat and arrive out of order, so handlers need deduplication and reconciliation rather than timestamp ordering. [Stripe webhooks](https://docs.stripe.com/webhooks).

For Kin's proposed backend, persist verified event IDs and entitlement updates atomically, tolerate retries and concurrent delivery, and reconcile authoritative payment/subscription state. Define pending, paid, failed, refunded, canceled, expired, and disputed outcomes before enabling access. A refund or canceled renewal needs an explicit access policy; it must not restore a withdrawn application or authorize a conversation. Use test-mode cases for delayed success/failure, duplicate events, stale events, cancellation, and refunds before any live billing.

### Membership and conversations

Membership grants only its stated community permissions. It never authorizes unsolicited DMs, disclosure of another member's private profile, cross-community search, contact export, or an outside-app invitation. A one-to-one introduction still needs independent approval from both owners under [ADR-0008](adr/0008-fresh-consent-and-durable-storage.md).

Encrypted group messaging needs a separate reviewed protocol: group admission and key distribution, authenticated membership changes, removal and key rotation, history access, recovery, devices, and abuse reporting. The current two-owner encryption design is not a group-chat implementation. Organizer or membership removal cannot erase plaintext a recipient already copied.

## Proposed owner memory and connectors

The current owner profile is entered in the browser. Optional loopback assistant pairing explicitly copies that profile to a local session; the owner reviews assistant changes before importing them. The public plugin's two tools only open Kin or explain privacy. They do not read profile data, retrieve history, import contacts, or contact people.

Custom interests are now explicitly owner-entered soft labels, limited to 48 characters and 12 selected interests. Normalization supports comparison; recognizable contacts are rejected, although pattern checks cannot detect every obfuscation. A custom label does not create a hard requirement or prove eligibility.

A proposed private owner memory would hold editable facts and preferences with source provenance, the selected excerpt/reference, collection purpose, import time, and owner approval. Model suggestions about communication style or interests stay drafts. Owners can inspect, correct, reject, or remove each suggestion; an inference never silently becomes a hard requirement. Do not infer sensitive attributes or claim clinical or personality assessment.

A provider login is not universal history access. Sign in with ChatGPT identity and Responses scopes do not grant access to ChatGPT conversations. OpenAI's plugin guidelines prohibit reconstructing the full chat log or collecting accumulated conversation context through MCP. A compatible workflow uses only deliberately selected, task-specific snippets/resources, or an owner-written summary. It must not market account-wide history mining as a plugin capability. [ChatGPT sign-in scopes](https://developers.openai.com/siwc/quickstart), [plugin data boundaries](https://developers.openai.com/plugins/plugin-guidelines).

Each proposed connector must disclose its exact scopes, fields, destination, retention, provider, and model processing before connecting. Revocation stops future collection; separately remove imported records and dependent suggestions. Explain which provider/recipient copies cannot be deleted from Kin. Do not send raw multi-provider history, private owner memory, or friend records to a circle host or model without a separate explicit disclosure choice.

LinkedIn OIDC supports consented lite member profile access; optional email access is a separate scope. LinkedIn explicitly says this sign-in is not identity verification. Its Connections API is separately restricted to approved developers and authorized first-degree access, not general browsing. [LinkedIn OIDC](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2), [Connections API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api).

Any proposed professional-data import requires an approved, purpose-compatible API agreement; do not assume LinkedIn's Marketing or Community Management APIs permit combining member data into a matchmaking profile. Their published restrictions include limits on such combination and transfer. Kin has no LinkedIn integration. [LinkedIn Marketing API restrictions](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases?view=li-lms-2026-06).

After both signed real-owner approvals verify, **Save to my private circle** stores a browser-local bookmark: peer ID, chosen alias, conversation ID, relay URL, and save time. It stores no chat transcript and grants no new membership or messaging permission. These bookmarks share the local app's export/deletion scope. A broader **People I already know** list with owner-entered private records remains a proposal. Saving a friend is not permission to publish their details, invite them, or act for them; a real connection still requires their own participation and approval.

## Community operations as a business

Paid hosting, organizer workspaces, policy configuration, admission queues, event coordination, and administrative support are possible services around the free MIT client and protocol. Begin with small opted-in communities and measure owner understanding, completed consensual introductions, withdrawal/deletion reliability, and organizer workload before broad distribution. The business model must not sell private data, charge to bypass a gate or refusal, or monetize extra disclosure. These are proposals, not shipped paid plans or promised growth. See [business model](business-model.md) and [ADR-0009](adr/0009-community-admission.md).

Primary specifications and provider documentation checked on 2026-10-07. Admission, connectors, and commerce require their own implementation and review before these proposals can become product claims.
