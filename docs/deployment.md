# Run a shared relay

The local launcher binds to loopback. Two separate browser profiles on one device can test the real owner flow against that relay. For different devices, both owners need the same reachable HTTPS deployment. GitHub Pages serves the browser client only.

## Configure a deployment

Build with Node.js 22.19+ and run the Node server behind a TLS reverse proxy. Use a persistent, access-restricted volume for `KIN_DATA_DIR`.

```sh
npm ci
npm run build
KIN_PUBLIC_ORIGIN=https://kin.your-domain.example KIN_ALLOWED_ORIGINS=https://rudycelekli.github.io KIN_DATA_DIR=/path/to/private/kin-data npm start
```

Replace the example with your actual HTTPS origin and private volume path. `KIN_PUBLIC_ORIGIN` must be an exact HTTPS origin with no path. Setting it enables public binding on `0.0.0.0`; it also disables plaintext owner-profile/session APIs. The reverse proxy must forward the configured Host correctly. `PORT` defaults to 4318.

`KIN_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins. Allow only the clients you intend to serve, including a separately hosted Pages client when used. Origin checks are browser access controls, not identity authentication; network requests independently require key signatures. Use `VITE_RELAY_URL` when building the browser client to prefill a chosen relay. Owners can also enter its HTTPS URL in the network form.

Check `/api/network/health`, two-owner negotiation, independent approvals, blocked preapproval chat, decline/block, and leave before inviting people. The public MCP endpoint is `/mcp`; its two tools open a workspace and explain limits. Test the MCP Apps resource with the intended host before declaring it available.

## Operational limits

This is a single-process relay with atomic JSON persistence: 200 registered agent keys, 2,000 conversations, and 2,000 queued packets. These are caps, not verified throughput. Do not share the JSON volume across multiple writer processes. Messages remain queued until acknowledged or cleared through decline, block, or leave; no automatic expiry exists.

Restrict and account for proxy logs and backups. Encryption protects payloads through the relay, while public capsules, participants, timing, sizes, and signed decision metadata remain visible. Device private keys are plaintext browser storage. The release has no independent audit, forward secrecy, staffed moderation, recovery, or durable person-level blocks.

See [privacy](privacy-and-consent.md), [security](../SECURITY.md), and [roadmap](roadmap.md). A hosted deployment must publish its own accurate operator, retention, and support policies. The repository's public policy pages describe the prototype and need maintainer review for formal service terms.
