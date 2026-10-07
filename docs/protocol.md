# Kin Introduction Negotiation, v0.1

Negotiation identifier: `kin/0.1`. Relay transport: `kin-relay/0.1`. Human payload: `kin-chat/0.1`. These are custom application protocols, **not A2A conformance claims**. Cross-relay federation is not implemented.

## Owner policy and disclosure

Each `LocalPolicyAgent` retains one reviewed profile and independently checks its owner's requirements. Required gates include adults 18+, bilateral age ranges, same-city and nonsmoker requirements, bilateral dating gender requirements for dating, shared intention and availability, valid profiles, and neither owner paused. Ranking follows eligibility.

Strict cards include ID, name, agent name, age, city, gender, intentions, smoking, interests, values, availability, and energy. Network agents substitute the public capsule alias for intake names and use signing-key fingerprints as IDs. Gender and smoking are included for every intention. Bio, raw requirement values, and boundary notes are absent. Cards still disclose personal facts to selected peers.

## Agent state machine

Messages have `version`, `conversationId`, `from`, `to`, and a discriminating `type`. Unknown fields are rejected by `protocolMessageSchema`.

| Type               | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `offer`            | Intention and initiator card                        |
| `policy-response`  | Peer card after its private policy passes           |
| `window-proposal`  | Shared interests/values and a common window         |
| `window-response`  | Verify claimed overlap and accept a window          |
| `meeting-proposal` | First-meeting suggestion                            |
| `suggestion-ready` | Validate proposal and require human approval        |
| `rejected`         | Coarse rejection without private requirement values |

Receivers validate routing, stage, policy, overlap, availability, and plan facts. Freeform text is data, not executable instruction or consent. The fictional CLI renders a readable transcript from a completed exchange, using fixed simulation timestamps. Network steps reflect received encrypted protocol messages rather than fictional timestamps.

Shared interests and values must be the complete semantic intersection; a proposal cannot omit genuine declared overlap. Offer IDs are normalized before replay checks, and rejected conversations retain minimal in-memory tombstones. Different-city owners must both permit the location difference; updated agents independently derive a short online beginning. The envelope remains `kin/0.1`, but older peers may reject this updated remote plan text. Matching old clients is not guaranteed. The [engine specification](engine.md) records scoring and validation behavior.

## Real relay authentication

GET `/api/network/challenge?agentId=<fingerprint>` returns a random challenge ID and nonce, valid for two minutes. Every authenticated POST sends:

```json
{
  "agentId": "<SHA-256 signing-key fingerprint>",
  "challengeId": "<one-use UUID>",
  "payload": {},
  "signature": "<base64url P-256 IEEE-P1363 signature>"
}
```

Sign the UTF-8 result of `JSON.stringify({path, challengeId, nonce, payload})` using ECDSA P-256/SHA-256. Property order is part of this exact v0.1 contract; there is no general JSON canonicalization. The server consumes the challenge before validation, including failed validation. Bodies are limited to 32 KiB, and rate/capacity limits apply.

Registration payload contains public `signingKey`, `exchangeKey`, `capsule`, and a fresh **client-generated** UUID `registrationNonce` for every join. The signing fingerprint must match `agentId`. The relay returns a signed registration attestation and uses that nonce as `registrationId`. Browsers verify the exact binding and pin their own fresh registration. Public capsules contain alias, intentions, optional interests, and purpose; recognizable contacts and links are rejected.

Re-registering an existing key closes active old conversations, clears consent/readiness, and purges queued packets; pair blocks remain. Each new conversation snapshots both registration IDs. Approval payloads bind the conversation and the exact two-registration map, preventing old registration approvals from authorizing a fresh session.

## Relay routes

| Method | Path                         | Payload or purpose                                                  |
| ------ | ---------------------------- | ------------------------------------------------------------------- |
| GET    | `/api/network/health`        | Protocol health                                                     |
| GET    | `/api/network/challenge`     | Fresh challenge for agent ID                                        |
| POST   | `/api/network/register`      | Keys, capsule, client registration nonce                            |
| POST   | `/api/network/directory`     | Empty object; registered peer capsules/proofs                       |
| POST   | `/api/network/conversations` | `{peerId}`; create or retrieve active pair conversation             |
| POST   | `/api/network/messages`      | `{conversationId,kind,ciphertext,iv}`                               |
| POST   | `/api/network/inbox`         | Empty object; own conversations and queued packets                  |
| POST   | `/api/network/ready`         | `{conversationId}`; own agent ready                                 |
| POST   | `/api/network/decisions`     | `{conversationId,decision,registrationIds?}`; approvals require map |
| POST   | `/api/network/ack`           | `{packetIds}`; recipient deletes delivered packets                  |
| POST   | `/api/network/leave`         | Empty object; remove identity and involving relay records           |

Every POST above is signed. Decisions are `approve`, `decline`, or `block`. Participation is enforced. Ready state requires both agents before approval; one owner cannot approve the other side. Decline and block clear approvals and purge relevant packets. Block applies to all pair conversations. Leave deletes involving conversations and packets. Blocker-owned pair hashes survive the blocked peer's departure or registration expiry, while the blocker's own departure or registration expiry removes their protection. Conversation expiry alone does not remove pair blocks. A new signing identity can evade this key-based block.

## Retention and restart behavior

The updated source implements the following relay retention. Earlier installed archives may lack automatic expiry. Operators must verify their deployed version; a source test does not establish a live rollout. Retention metadata is server-owned, outside signed registration/decision receipts; wire identifiers remain unchanged.

- Queued packets expire 24 hours after queueing. Expiry of an agent packet in an introduction that has not connected removes the whole conversation to avoid an incomplete negotiation.
- Negotiating and awaiting-approval introductions have a fixed 24-hour deadline from creation. Additional messages, readiness, polling, and a first approval do not extend it.
- Connected conversations expire after 30 days without an accepted message, readiness update, or owner decision. Directory, inbox, conversation retrieval, and acknowledgment requests do not refresh conversation activity.
- Declined and blocked conversations expire 7 days after their recorded closing activity. Decline and block already purge queued packets.
- Registrations expire after 30 days without a successful signed request. Signed polling counts as registration activity. Expiry cascades to involving conversations, packets, counters, and retention metadata, and removes only that expired owner's block records. Another owner's block survives the blocked target's expiry.

Maintenance defaults to once every 60 seconds and also runs when due before relay health responses and signed requests. It is serialized with state mutations. A due sweep error makes those requests fail rather than acknowledge cleanup. Actual deletion requires a running process, a usable wall clock, scheduling, and successful filesystem publication. Clock jumps can change when deadlines are reached; outages delay cleanup until maintenance resumes. Retention is active-store removal, not key expiry, secure erasure, or removal of peer copies, exports, infrastructure logs, or backups.

Registration activity is checkpointed during maintenance, with a final checkpoint attempted on graceful shutdown. An abrupt restart can lose the recent in-memory activity interval. Persisted timestamps and deadlines survive restart. On first migration of older records without metadata, persist a grace period from migration time: 24 hours for queued packets and pending introductions, 7 days for terminal conversations, and 30 days for connected conversations and registrations. A later restart does not grant a fresh grace period. [ADR-0012](adr/0012-bounded-relay-and-local-session-retention.md) records the decision.

## Encryption and human chat

Derive an ECDH P-256 shared secret, then HKDF-SHA-256 with SHA-256(conversation ID) salt and `kin-relay/0.1 channel` info to produce an AES-256-GCM key. Use a fresh 12-byte IV, a 128-bit tag, and UTF-8 JSON additional authenticated data with fields `version,conversationId,from,to,kind` in that order.

Agent plaintext is the strict protocol message. Chat plaintext is:

```json
{ "version": "kin-chat/0.1", "messageId": "<sender UUID>", "text": "A thoughtful hello" }
```

Chat text is nonempty and at most 2,000 characters. The browser deduplicates decrypted sender message IDs within the active session; relay packet IDs alone do not provide replay defense. Agent semantic duplicates are checked against the received message and stage. Delivery acknowledgment removes queued ciphertext.

Chat packets are accepted only in `connected` state with both readiness and approval flags. Each browser additionally verifies both signed approve receipts against the current conversation and registration map before opening chat. Private requirements never grant consent. Signatures prove key possession, not human identity; relay ordering and revocation delivery remain trusted.

## Fictional demonstration and optional local API

The **Connections** view runs fictional discovery in browser storage and labels peer approval as simulated. Owner approval leaves a suggestion pending until the separate fictional peer action. Decline/block cannot be reversed by approval; policy edits invalidate suggestions; fictional blocks survive profile edits.

The optional loopback session API retains `/api/session`, `/api/profile`, `/api/discover`, `/api/matches/:id/actions`, `/api/demo`, `/api/export`, and `/api/agent-connection` for copied local assistant profiles and developer compatibility. Its `peer-approve` action is fictional only. Local session files expire 24 hours after their last write; the updated source checks reads, runs a 60-second background sweep, and requires successful cleanup for local health. This does not expire browser localStorage. Public relay deployments deny plaintext owner APIs. A stdio MCP bearer cannot approve. The public `/mcp` endpoint exposes only workspace-opening and public-limit tools.

## Reproduce and extend

```sh
npm ci
npm run demo:agents -- friendship --wire
npm run check
```

Public domain exports are `LocalPolicyAgent`, `protocolMessageSchema`, `runNegotiation`, `negotiate`, and `discoverWithCandidates`. Integrators must preserve policy, disclosure, stage validation, and independent owner authorization.

The [official A2A specification](https://a2a-protocol.org/latest/specification/) can inform a future adapter, but that adapter must pin a version and pass interoperability tests. Transport compatibility does not establish consent. See [privacy](privacy-and-consent.md) for cryptographic limits, retention, and deletion scope.
