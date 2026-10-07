# Launch playbook

Kin's invitation is simple: **Your agent. Your people.** The fictional demo makes the idea tangible in under a minute. The separate real-owner network demonstrates independently approved introductions. A supervised pilot must establish whether these introductions are useful and wanted; neither a repository nor a share button guarantees virality.

## Demo release

Publish the source, README, license, protocol, and contribution guide together. Record a 30-second walkthrough using fictional profiles: set a hard requirement, watch two agents pass both policies, inspect the proposed hello, approve once, show the pending state, and simulate the peer's separate approval. Show the fictional-demo label in the recording.

Suggested announcement copy:

> Your agent knows what matters to you. What if it could find your people? Kin is an open-source early implementation for friendship, dating, and collaboration: two local agents check both people's requirements, exchange encrypted messages, and suggest a hello. Each real owner decides before human chat opens. Try the fictional demo, run a shared relay, and inspect the protocol.

Publish once in communities where the maintainer is already welcome, follow their rules, and invite concrete feedback. Contributors should be able to run `npm ci`, `npm run dev`, and `npm run demo:agents` without credentials. Avoid automated posting, unsolicited messages, fake profiles presented as members, or manufactured testimonials.

For a real-owner walkthrough, show two separate browser owners joining the same relay, choosing public capsules, completing encrypted agent negotiation, approving independently, and opening in-app chat. Use consenting testers and fictional intake for recording. Disclose plaintext device keys, relay metadata, no forward secrecy, and the unaudited prototype status. Do not announce a managed public service until a deployment has been verified.

## A consent-safe share loop

The default share text is:

> My agent is looking for my people. Friendship, dates, or the next good idea. Try Kin—your agent, your people.

The payload contains a public project link and generic copy only. It does not include names, city, age, gender preferences, requirements, scores, or transcript text. The person chooses when and where to share. Invitation recipients enroll themselves; the system does not import their contact data or create shadow profiles.

For a future pilot, let an owner invite a friend to the same community with a reusable public community page. A connection story becomes a share card only if every identifiable person approves that specific public copy. Removing that approval removes the hosted story. Keep friendship, dating, and collaboration invitations distinct so the recipient understands the intention.

## Cold start: density before breadth

After the authenticated-pilot milestones are complete, recruit a voluntary cohort through one community host. Start with one city or one community, one intention, and compatible meeting windows. Example experimental scale: 30–50 consenting adults in a neighborhood book/coffee community; this is a planning hypothesis, not a researched minimum or existing user count.

Give every participant an accurate description of the pilot and its limits. A host can facilitate a public event, but cannot approve an introduction on someone else's behalf. Avoid expanding to a second community until the first reliably produces useful meetings and handles declines, blocks, reports, and deletion requests.

## What to measure

| Question                                 | Measure                                                 | Why it matters                            |
| ---------------------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| Does intake help?                        | Completion and profile correction rate                  | Owners should understand their own policy |
| Are introductions wanted by both people? | Two-owner acceptance, separated from one-sided approval | A match must be reciprocal                |
| Do introductions lead somewhere?         | Voluntary attendance and one-week usefulness feedback   | Human value is the outcome                |
| Is sharing useful?                       | Opt-in invite-to-enrollment conversion                  | No claim of virality without observation  |
| Do people retain control?                | Decline/block success and deletion completion           | Trust is part of product quality          |

Keep operational metrics aggregated and minimize raw event payloads. Do not optimize for dating-profile exposure, pressure people to approve, or reward disclosure of private preferences. Publish the findings from a pilot only with participants' permission and without identifying details.
