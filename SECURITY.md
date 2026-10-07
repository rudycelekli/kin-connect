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
- Public MCP tools open the workspace or explain limits. They cannot read personal state, approve, or send messages. Optional loopback owner pairing also cannot approve.
- Fictional peer approval affects demo state only.

## Limits

Profiles and private JWKs are plaintext localStorage without a separate password. A compromised device, privileged extension, or compromised client-code host can expose them. Long-lived exchange keys have no forward secrecy or recovery workflow. Key fingerprints verify keys, not humans. Recipients can retain received information.

The relay sees capsules, keys, participants, decisions, timing, packet kinds, and sizes. Bindings and approval signatures are verified, but ordering and revocation delivery are trusted to the relay. A dishonest relay can suppress messages or replay signed state. Proxies and hosting providers may retain logs.

The JSON store is single-process with no automatic retention sweep. File flushes and POSIX directory fsync precede mutation acknowledgment; Windows lacks the portable directory-fsync step. Tests do not prove real power-loss durability. A blocker-owned pair hash survives the blocked peer's departure; the blocker's departure removes their protection. New signing keys can evade blocks. There is no staffed moderation, production recovery, or account assurance.

Use TLS and explicit origins for public deployments, restrict data-directory access, and define retention practices. Obtain independent security review and adversarial testing before growing a community. Do not call this audited, unbreakable, anonymous, or completely private. See [privacy](docs/privacy-and-consent.md) and [roadmap](docs/roadmap.md).
