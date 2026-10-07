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

`KIN_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins. Allow only the clients you intend to serve, including a separately hosted Pages client when used. Origin checks are browser access controls, not identity authentication; network requests independently require key signatures. Use `VITE_RELAY_URL` when building the browser client to prefill a chosen relay. Owners can also enter its HTTPS URL in the network form. Once joined, **Copy network invite** creates a public-client link containing only the relay address. Recipients review the address and their own capsule before consenting; opening the link makes no network registration.

Check `/api/network/health`, two-owner negotiation, independent approvals, blocked preapproval chat, decline/block, and leave before inviting people. The public MCP endpoint is `/mcp`; its two tools open a workspace and explain limits. Test the MCP Apps resource with the intended host before declaring it available.

Run the [public deployment preflight](deployment-check.md) from a source checkout with its development dependencies installed. It checks the real HTTPS server, private-API denial, exact client-origin CORS, MCP tools, and served workspace assets. A passing report establishes only that observed server contract; it does not execute the embedded host or prove human consent.

For the actual ChatGPT or other embedded host, observe the iframe's browser Origin and allow that exact origin; the chat website's origin may differ. Verify asset loading, CSP, CORS, browser storage, Web Crypto, and leave/delete in that host. Publish the operator, reachable pilot contact, and actual proxy-log and backup retention before inviting volunteers. See [the pilot playbook](pilot-testing.md).

The [ChatGPT first-test guide](chatgpt-first-test.md) covers custom connections and the optional `KIN_OPENAI_APPS_CHALLENGE` route for a token supplied by the official submission portal. Leave it unset until a real verification token is provided; the route then returns 404.

## Operational limits

This is a single-process relay with atomic JSON persistence: 200 registered agent keys, 2,000 conversations, and 2,000 queued packets. These are caps, not verified throughput. Startup acquires an exclusive `.kin-process.lock` under `KIN_DATA_DIR`; another server using that directory refuses before loading its store. Normal shutdown releases it. Abrupt termination can leave a stale marker: confirm no process still uses that directory before removing only the marker. Do not share the JSON volume across multiple writer processes or remove an active lock. Messages remain queued until acknowledged or cleared through decline, block, or leave; no automatic expiry exists.

Before increasing the cohort, observe how the deployed proxy affects rate limits. The reference relay uses the direct socket address: challenge GETs and signed POSTs each have a separate 300-per-minute bucket per address; signed POSTs also have a 60-per-minute bucket per agent. A proxy can make unrelated owners share the address buckets. Illustratively, one continuously active idle browser polls the inbox about 20 times and the directory about four times per minute, issuing about 24 challenge GETs and 24 POSTs. Two owners use about 48 requests in each address bucket; 13 use about 312 in each, exceeding the limits before other actions. These are schedule calculations, not measured capacity; latency, browser throttling, and owner actions change the load. The public MCP router separately permits 120 requests per socket address per minute. Confirm actual pilot behavior before expanding, and use an explicitly trusted edge configuration if changing address handling; do not blindly trust `X-Forwarded-For` or other client-supplied headers.

Restrict and account for proxy logs and backups. Encryption protects payloads through the relay, while public capsules, participants, timing, sizes, and signed decision metadata remain visible. Device private keys are plaintext browser storage. The release has no independent audit, forward secrecy, staffed moderation, recovery, or durable person-level blocks.

See [privacy](privacy-and-consent.md), [security](../SECURITY.md), and [roadmap](roadmap.md). A hosted deployment must publish its own accurate operator, retention, and support policies. The repository's public policy pages describe the prototype and need maintainer review for formal service terms.
