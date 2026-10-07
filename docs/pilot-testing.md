# A two-owner Kin pilot

This is a playbook for two real adult volunteers, not a record of a completed human trial. Automated browser tests exercise the control flow, but they do not establish that an introduction is useful. The authorized Railway pilot relay is live at `https://kin-relay-production.up.railway.app`, with one writer and a persistent `/data` volume. Both devices must choose the same relay; the public Pages client alone is not a relay. Two isolated browser profiles on one device can first test controls against loopback.

The [public server preflight](../research/hosted-service-verification-2026-10-07.json) passed all 12 contract checks at 2026-10-07 16:35:16.397 UTC. A separate [synthetic two-device HTTPS contract](../research/hosted-network-verification-2026-10-07.json) passed eight recorded checks at 16:37:08.755 UTC, including encrypted negotiation/chat, independent synthetic signatures, refusal, block, same-key rejoin denial, and signed leave. The signing decisions were automated; no real human consent, useful meeting, or actual ChatGPT UI was tested. Operator/private-contact/retention practices, final domain, and introduction wording still need review before wider invitations. Follow [the launch gates](launch-readiness.md).

The first pilot should answer: **Can two people understand what their agents share, independently choose an introduction, and use it for a small activity they actually want?** It does not test prediction of romance, marriage, personality, or long-term friendship.

## People and one useful task

Choose two volunteers aged 18 or older who understand the prototype limits and can stop without explanation. Kin checks self-entered adult ages; it does not verify identity or age. Record whether they already know each other, since that affects any discovery claim. Each uses a separate browser profile/device and makes decisions independently.

Start with Collaboration and one concrete task: **spend 20 minutes sketching a one-page plan for a small free weekend project**—for example a neighborhood photo walk, a book-swap table, or a simple public resource guide. The volunteers choose the task and timing. A deliverable and a reason to meet are more interpretable than an unspecified “compatibility” goal. No purchase, contact import, calendar permission, or outside messaging is needed for the test.

Use aliases. Each person privately enters their own reviewed facts and requirements. Before joining, explain that the selected peer agent receives age, city, gender, smoking, intentions, interests, values, availability, and energy through encryption. The real intake name is replaced by the public alias in network cards; bio, raw requirement values, and private notes remain outside the card. Recipients can still copy facts they receive. A volunteer who does not want this exchange should stop before joining.

## Operator setup

Follow [deployment](deployment.md) for a shared HTTPS relay, exact allowed browser origins, and a private persistent data volume. Publish the actual operator, logging/backup retention, and a reachable pilot contact before invitations. There is no staffed reporting or independent audit service in the reference release. Do not describe a pilot contact as a staffed moderation operation.

Confirm the two owners use the same relay URL and current client build. Record only build version, client/browser versions, relay origin, start/end time, and pseudonymous tester labels. Keep private keys and full owner profiles out of screenshots, issue trackers, and meeting notes. The relay can observe metadata and public capsules; device keys are plaintext browser storage, and encryption has no forward secrecy. Explain these current limits using [privacy and consent](privacy-and-consent.md).

## Run the flow

| Step                      | Volunteer action                                                                                                                 | Observable pass condition                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Private intake         | Each chooses **Join the network**, creates/reviews their own agent, and returns to the network form                              | No capsule is published just by completing intake                                                                                                            |
| 2. Capsule review         | Each chooses alias, purpose, intention, and the interests they explicitly want public; reviews the disclosure checkbox and joins | Directory shows only reviewed public capsule fields; no real intake name, notes, contacts, or raw requirements                                               |
| 3. Find one peer          | One owner refreshes the directory, selects the other alias, and chooses **Let our agents talk**                                  | The recipient agent processes the request while its owner remains in control                                                                                 |
| 4. Agent negotiation      | Both watch the transparent step summaries                                                                                        | Six strict messages complete for a compatible pair: `offer`, `policy-response`, `window-proposal`, `window-response`, `meeting-proposal`, `suggestion-ready` |
| 5. First yes              | Owner A checks **I want this introduction** and approves; Owner B deliberately waits                                             | Human chat and **Save to my private circle** remain unavailable to both owners                                                                               |
| 6. Second yes             | Owner B reviews the proposal, checks their own box, and approves in their own browser                                            | Chat becomes available after both current signed approval receipts verify; neither owner can approve for the other                                           |
| 7. A useful hello         | Each sends one chosen message about the small collaboration task                                                                 | Messages arrive in the other browser; relay packets carry ciphertext/IV rather than the message text                                                         |
| 8. Remember the beginning | One owner saves the approved alias, opens **Circles**, and inspects **Your private circle**                                      | The saved alias/date are local; saving creates no invitation, community membership, or new permission to message                                             |

Allow normal polling/delivery time before classifying a missing update as a defect. If negotiation rejects a policy, accept the rejection. The agent must not relax a hard requirement to complete a demo. A generic rejection should not expose the other person's private rule value.

For a developer-assisted session, inspect the network request shapes without copying their contents into public logs: six agent packets should use encrypted payloads, and owner decisions should be signed independently. No screenshots should contain device-key JWKs, assistant configuration capabilities, or decrypted personal cards. Cryptographic evidence and usefulness feedback are separate records. [Protocol](protocol.md).

## Deliberately test refusal and cleanup

Run these controls while both volunteers know they are test cases. No one must accept an actual unwanted introduction for the pilot to count.

- **Policy refusal:** after reviewing a voluntary temporary structured requirement that excludes the test pair, initiate a fresh conversation. It must stop with a coarse rejection and no approval or chat path. Restore only a rule that the owner actually wants; profile edits close the old registration and require reviewed rejoining.
- **Decline:** decline a ready proposal in the declining owner's browser. Chat must remain closed, and the previous proposal must not become connected from a delayed approval.
- **Block:** after the baseline approved flow, block the peer. Chat closes, further pair introductions fail, and the blocker’s saved alias is removed. A blocked peer leaving/rejoining with the same key must not erase the other owner's block. A fresh identity can evade this device-key block; it is not person-level protection. The blocker's own leave removes their stored block protection.
- **Saved-list removal:** if an alias was separately retained before another test, remove it using its labeled control. Only the local saved list changes; there is no invitation or outside contact action.
- **Leave:** leave the relay and check that the public registration disappears for the other joined owner. Local device keys remain until an explicit reset; ciphertext already copied by a peer is outside relay deletion.
- **Delete:** each owner uses **Delete my data**. Signed leave from remembered relays must succeed before keys/profile/demo state are cleared. If the relay is offline, cleanup must show an actionable failure and keep keys for retry. Restore relay access and retry. Do not clear browser storage externally as a substitute for signed cleanup, since that can orphan a registration.

The deletion observation covers the reference relay and this browser origin. It cannot establish erasure of peer copies, infrastructure logs, backups, or another owner's retained block hash. The operator should inspect the private relay state only with the agreed pilot scope and should record completion rather than participants' facts.

## Keep circles explicitly fictional

In the same session, visit **Circles** and review a free fictional circle. Check the policy list and exact minimal application capsule. **Apply to this circle** requires the owner's checkbox, then remains pending. **Simulate organizer approval** is visibly a local demo control; it must not be interpreted as permission from a real organizer. Withdraw the demo membership. Inspect a credential-required and a paid fixture: both remain unavailable, with no credential-verification badge or billing flow.

The saved real-network aliases and fictional application list are separate. A saved alias grants no community membership, and a simulated membership opens no live group chat. The pilot must not invite anyone to a real club or represent a mock organizer as a person. [Communities](communities.md).

## Optional follow-up: usefulness, not predictive chemistry

Only if each volunteer separately agrees, collect a short private note after the chat or chosen activity. Do not upload intake data, private conversations, or names. Suggested prompts:

1. Did you understand which facts became public and which reached the selected peer?
2. Did you feel able to wait, decline, block, or stop without pressure?
3. Was this introduction something you wanted? Rate 1–5, or decline to answer.
4. Did the agent explanation help you make the decision? What detail was missing or unnecessary?
5. Did you complete the small shared task or choose a useful next step? What happened?
6. Would you choose another introduction for the same purpose? Why?

Record qualitative observations and exact control failures. With two volunteers, report counts (“both understood the capsule,” “one found the task useful”) and missing answers, rather than percentages or causal claims. Prior acquaintance, a chosen test partner, operator guidance, and a tiny sample limit generalization. A wanted refusal is a respected decision, not a conversion failure.

No claim of scientifically predicted attraction, marriage suitability, verified friendship, or broad matching effectiveness follows from this pilot. A later comparative study would need a larger consenting cohort, a defined baseline, preregistered outcomes, and an appropriate ethical/privacy review. Public quotes or stories need separate consent from every identifiable participant; participating in the pilot does not authorize promotion.

## Minimal result record

Use one private note containing: build/relay origin, pseudonymous labels, prior-acquaintance yes/no, which disclosure/control checks passed, any defect and reproduction steps without personal payloads, whether the optional task happened, optional usefulness responses, and signed cleanup outcome. Delete raw notes at the agreed end of the pilot; document any intentionally retained anonymized defect report. This is a proposed manual record, not telemetry that Kin currently collects.
