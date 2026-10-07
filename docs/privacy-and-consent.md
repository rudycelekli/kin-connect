# Privacy and consent in Kin 0.2

This describes software behavior, not a hosted-service privacy policy or a promise of absolute privacy. Kin has a fictional demo, an opt-in network between real browser owners, and separate assistant integrations. Built-in agents are deterministic; Kin makes no LLM calls.

## Device-local intake

The owner profile contains name or alias, age, city, gender, bio, agent name, intentions, interests, values, availability, energy, smoking status, structured requirements, private notes, and pause state. Every app build stores this profile and fictional demo state as plaintext browser localStorage under `kin-local-demo-v1`, including when a relay serves the page. Intake is not uploaded to a public relay.

No email, phone, exact location, contacts, or calendar access is required. Input validation requires adults 18+; it does not verify age, identity, or truthfulness. Freeform boundaries are private advisory notes. Only structured controls execute as requirements.

Custom interest labels are owner-entered preferences. Selected peers receive them in encrypted matching cards; only separately selected labels enter a public capsule. Circle applications contain only reviewed aliases/purpose/shared interests/required city and remain fictional/local. Saved connections contain only peer key ID, chosen alias, past conversation ID, relay URL and saved time. These bookmarks grant no chat or community authority. Both record types share the profile storage key and are included in export and deletion. Profile edits invalidate circle applications.

Embedded export offers selectable owner-only text when downloads are blocked, without sending it to an assistant, relay, or tool result. History imports, behavioral analytics, LinkedIn, credentials and payments are unimplemented. Future connectors need separate disclosure and owner approval; opening Kin grants no full chat-history access.

Same-origin app code, sufficiently privileged extensions, malware, or someone using the browser profile may access localStorage. The host receives normal page-request metadata. Storage has no automatic expiry. Trust the device and client code.

## Joining the real network

Join is a separate opt-in. You select a relay and choose a public capsule: alias, purpose, intentions, and optional selected interests. Registered agents on that relay can see capsules. Avoid identifying details in the public alias and purpose. Validation rejects recognizable contacts and links but cannot detect every identifying statement.

The browser generates ECDSA P-256 signing and ECDH P-256 exchange keys. A signing-key fingerprint identifies the agent. Peers verify a registration signature binding both public keys and the capsule. This proves key possession, not real-world identity or age. Another browser profile creates another identity; someone can register a new key and alias.

**Private keys are plaintext JWKs in `kin-network-identity-v1` localStorage, without a separate password.** Compromised client code or device access can expose them. There is no key recovery or rotation workflow.

## What a selected peer receives

Browser-held policy agents exchange schema-validated `kin/0.1` messages. The network card uses the chosen public alias instead of the intake name. It discloses age, city, gender, intentions, smoking, interests, values, availability, and energy to the selected peer through encryption. Gender and smoking are included for every intention. These are owner-entered facts, not inferred traits.

The card omits the intake's real name, bio, raw requirement values, and freeform notes. Accept/reject outcomes can still reveal policy information. Recipients can retain facts they receive, take screenshots, or copy messages. The join screen discloses this exchange before opt-in.

Conversation keys use ECDH and HKDF-SHA-256; AES-256-GCM uses fresh 96-bit IVs and authenticated context containing version, conversation ID, sender, recipient, and message kind. Peer registration proofs are verified and exchange keys pinned during the active conversation. Standard browser primitives do not establish implementation security: this release has no independent audit. Long-lived device exchange keys provide **no forward secrecy**; later key compromise can expose captured earlier ciphertext.

## What the relay sees and retains

The relay sees public keys and capsules, participants, conversation state, signed decisions, timing, message kinds and sizes, and ciphertext. It has no browser private keys. Use HTTPS outside loopback. Encryption does not hide metadata or IP addresses from hosting infrastructure.

The reference relay persists metadata and ciphertext in atomic plaintext JSON under `.data/network` by default, with restrictive filesystem permissions. Direct socket IPs appear in volatile rate-limit buckets, not persisted by the reference code. Hosting infrastructure may keep separate logs. The store is single-process with fixed capacity limits and no automatic packet or registration expiry.

Recipient acknowledgment deletes queued packets. Decline clears approvals and queued packets for that conversation. Block closes every conversation for the key pair, purges packets, and prevents a new conversation while the pair block remains. Leave deletes the identity and involving conversations, packets, and counters. A blocker-owned record containing a pair hash and blocker ID remains if the blocked peer leaves, so rejoining with the same key remains blocked. The blocker's own departure removes their protection. A fresh signing key can evade it; this is not durable person-level blocking.

Signed proofs prevent simple unsigned key substitution or invented approvals. A dishonest relay can still hide peers, suppress delivery, replay previously signed state, or conceal revocation. The current client trusts relay ordering and deletion. A compromised UI host can change client code and read browser-held data.

An owner's decline or block closes the conversation locally before the relay request completes. During that active runtime, a stale connected inbox or historical approval cannot reopen it; a failed request keeps chat and saving disabled and offers Retry or Leave. This does not guarantee delivery of the revocation to the other owner. An uncertain committed request may return a closed-conversation error on retry; Leave is the cleanup path.

## Two independent decisions

Each join creates a fresh client-generated registration nonce. Approvals bind both current registration IDs as well as the conversation, so prior-registration approvals cannot authorize the new session. Re-registering clears active old conversations and queued messages while retaining pair blocks.

Each local agent checks its owner's policy. Both agents mark the proposal ready before approval is accepted. Each owner then selects **Approve introduction** in their own browser with a confirmation checkbox. Signed requests authenticate the two decisions. The relay rejects human chat until both approvals exist; browsers verify both signed approval receipts for that conversation before rendering or sending chat.

Agents and public model tools cannot approve for owners. A signature proves a device key signed a decision, not which human was at the keyboard. Editing or pausing the profile deactivates the network agent and requests signed leave, removing old relay conversations and approvals before rejoining. If the relay is unavailable, the agent stays paused locally and keeps keys for retry; a failed request cannot guarantee remote revocation.

Human chat uses the encrypted channel and keeps plaintext history in active page memory only. Reload or leave loses that local history. Kin does not book meetings, email introductions, import contacts, or message people outside the app.

## Separate deletion scopes

| Control                | Effect                                                                                                                                       | What remains                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Export my data         | Downloads local profile and fictional demo state                                                                                             | Network keys and conversations are not included                                                                          |
| Delete my data         | Sends signed leave to remembered relays, clears device keys/profile/demo state, and revokes the local assistant copy/pairing when applicable | Peer copies, other owners' blocker hashes, backups and logs; an unreachable relay stops cleanup and keeps keys for retry |
| Leave network          | Requests deletion of identity, conversations, and queued packets on the selected relay                                                       | Local keys, blocker-owned pair hashes, peer copies, backups, infrastructure logs                                         |
| Forget device identity | Sends signed leave to remembered relays before removing device keys                                                                          | Registrations not remembered on this origin, blocker hashes and copies already received                                  |

The browser remembers joined relay addresses in `kin-network-relays-v1`. Reset requests signed leave from those relays before discarding keys. If cleanup fails, the capsule may remain visible and the app keeps keys for retry. Losing keys or remembered addresses through external browser-storage clearing may prevent signed cleanup; contact the relevant relay operator. Registrations made on another app origin are not covered by this origin's remembered list. Deletion does not erase screenshots, exports, backups, or recipients' copies.

## Assistant integrations

Public remote MCP tools open the workspace or explain public limits. They cannot read profiles, search members, publish capsules, approve, or send chat. Enter sensitive intake in the workspace, not the model conversation.

Separately, explicit pairing with your own assistant copies the reviewed profile to your own loopback server. The assistant can read it, including private notes; its provider's processing practices apply. Pairing expires after 24 hours, revokes on replacement or app/server-session deletion, and disappears on restart. It cannot approve. See [agent integration](agent-integration.md).

The optional loopback session API stores plaintext files in `.data/sessions`, uses random HttpOnly/SameSite capabilities, and checks 24-hour expiry since the last write when reading. It has no background sweep. Public relay deployments disable this owner API; browser intake does not depend on it.

The share action contains only generic invitation text and a public project link. Anyone identifiable in a public connection story must separately approve that story. Stronger key protection, durable abuse controls, retention sweeps, and independent review remain [roadmap](roadmap.md) work.
