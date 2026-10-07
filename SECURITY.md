# Security policy

Kin 0.1 includes a real two-owner encrypted introduction flow and a separately labeled fictional demo. It is an early implementation with no independent security audit or real-world identity/age verification.

## Reporting

Report security vulnerabilities through [GitHub private vulnerability reporting](https://github.com/rudycelekli/kin-connect/security/advisories/new). Sign in to GitHub to use the form, or open the repository's **Security → Report a vulnerability** control. Include version, a minimal fictional-data reproduction, expected behavior, and impact. Keep personal data and live credentials out of public reports. No response-time guarantee or bounty is offered.

## Current controls

- Full intake stays in browser storage. Separate opt-in publishes a chosen capsule and exchanges selected matching facts through encryption.
- One-use signed requests authenticate ECDSA P-256 key possession; the relay validates public keys, participants, size limits, and rates.
- Registration signatures bind directory data to the agent key. ECDH/HKDF conversation keys and AES-256-GCM authenticate encrypted routing context.
- Relay chat requires both agents ready and both owner approvals. Browsers verify both signed approval receipts.
- Decline/block clear approvals and queued packets. Leave deletes the identity and involving records.
- Updated source adds automatic relay and local-session retention with persisted deadlines and health checks; deployment and live verification are pending as of October 7, 2026.
- Public MCP tools open the workspace or explain limits. They cannot read personal state, approve, or send messages. Optional loopback owner pairing also cannot approve.
- Fictional peer approval affects demo state only.

## Limits

Profiles and private JWKs are plaintext localStorage without a separate password. A compromised device, privileged extension, or compromised client-code host can expose them. Long-lived exchange keys have no forward secrecy or recovery workflow. Key fingerprints verify keys, not humans. Recipients can retain received information.

The relay sees capsules, keys, participants, decisions, timing, packet kinds, and sizes. Bindings and approval signatures are verified, but ordering and revocation delivery are trusted to the relay. A dishonest relay can suppress messages or replay signed state. Proxies and hosting providers may retain logs.

The JSON store is single-process and capacity-bounded. Earlier installed archives may lack automatic expiry. This source release sweeps every 60 seconds while running: queued packets and pending introductions expire after 24 hours, connected conversations after 30 days without messages/readiness/decisions, terminal records after 7 days, and registrations after 30 days without successful signed activity. Pending deadlines cannot be extended; polling refreshes registrations, not conversation activity. Local session files expire 24 hours since their last write. Browser profiles and plaintext keys have no automatic expiry.

Cleanup depends on uptime, the wall clock, scheduling, and successful publication. Persisted deadlines and one-time migration grace survive restarts, but abrupt interruption can lose registration activity since the last maintenance checkpoint. Due sweep failures make relay readiness and signed requests fail. Expiry does not cryptographically revoke captured messages or delete peer copies, exports, backups, or hosting logs. File flushes and POSIX directory fsync precede mutation acknowledgment; Windows lacks the portable directory-fsync step. Tests do not prove real power-loss durability.

A blocker-owned pair hash survives the blocked peer's departure or registration expiry; the blocker's own departure or expiry removes their protection. Conversation expiry does not remove a pair block. New signing keys can evade blocks. There is no staffed moderation, production recovery, or account assurance. See [ADR-0012](docs/adr/0012-bounded-relay-and-local-session-retention.md) for the implemented source policy and migration behavior.

Use TLS and explicit origins for public deployments, restrict data-directory access, and define retention practices. Obtain independent security review and adversarial testing before growing a community. Do not call this audited, unbreakable, anonymous, or completely private. See [privacy](docs/privacy-and-consent.md) and [roadmap](docs/roadmap.md).
