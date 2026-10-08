# Run a shared relay

The local launcher binds to loopback. Two separate browser profiles on one device can test the real owner flow against that relay. For different devices, both owners need the same reachable HTTPS deployment. GitHub Pages serves the browser client only.

## Settle the public origin and contact

Kin's selected owned origin is `https://www.kinconnections.com`, serving the workspace, assets, relay, and `/mcp`. GoDaddy's root domain forwarding targets that origin; Railway handles www TLS. GoDaddy lacks Railway's required apex CNAME flattening, so the root redirects instead of routing directly. [Railway domain requirements](https://docs.railway.com/networking/domains/working-with-domains). The [owned-domain verification](../research/owned-domain-service-verification-2026-10-07.json) records a successful deployment and 12 public contract checks for each of two client origins. Actual host testing and official review remain separate. OpenAI's current update flow requires contacting support to change an existing MCP URL. The connected v0.2.2 draft is uploaded, its domain is verified, and metadata, skill and MCP checks passed on 2026-10-08; review submission and publication remain pending. [Endpoint update constraint](https://developers.openai.com/plugins/deploy/submission).

Use managed domain email for monitored support, privacy, and abuse mailboxes or aliases. Verify delivery and publish the actual contact alongside the operator and retention practices. The domain is selected; a monitored private contact and inbox provider remain pending. Optional Resend credentials provide no inbox or staffed support. The [environment guide](environment.md) documents active settings and empty future-provider placeholders.

Profiles, device keys, and remembered relay addresses belong to the browser origin or the embedded host's storage partition. Changing the workspace origin does not automatically move that state, and an MCP domain change can affect host storage behavior. Keep the old origin available until owners complete signed leave from its remembered relays; preserve keys for retry when cleanup fails. A new origin can create a separate identity. Profile exports omit network private keys, and no automatic origin/key migration exists. Test the intended transition before inviting owners. See [privacy and deletion scopes](privacy-and-consent.md) and [embedded storage limits](embedded-workspace.md).

## Configure a deployment

Build with Node.js 22.19+ and run the Node server behind a TLS reverse proxy. Use a persistent, access-restricted volume for `KIN_DATA_DIR`.

```sh
npm ci
npm run build
KIN_PUBLIC_ORIGIN=https://kin.your-domain.example KIN_ALLOWED_ORIGINS=https://rudycelekli.github.io KIN_DATA_DIR=/path/to/private/kin-data npm start
```

Replace the example with your actual HTTPS origin and private volume path. `KIN_PUBLIC_ORIGIN` must be an exact HTTPS origin with no path. Setting it enables public binding on `0.0.0.0`; it also disables plaintext owner-profile/session APIs. The reverse proxy must forward the configured Host correctly. `PORT` defaults to 4318. During this transition, `KIN_PUBLIC_ALIASES=https://kin-relay-production.up.railway.app` explicitly permits the old Host and browser Origin; it does not enable private owner APIs or migrate browser keys. Only exact HTTPS aliases are accepted. MCP assets use the canonical public origin.

`KIN_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins. Allow only the clients you intend to serve, including a separately hosted Pages client when used. Origin checks are browser access controls, not identity authentication; network requests independently require key signatures. Use `VITE_RELAY_URL` when building the browser client to prefill a chosen relay. Owners can also enter its HTTPS URL in the network form. Once joined, **Copy network invite** creates a public-client link containing only the relay address. Recipients review the address and their own capsule before consenting; opening the link makes no network registration.

Check `/api/network/health`, two-owner negotiation, independent approvals, blocked preapproval chat, decline/block, and leave before inviting people. The public MCP endpoint is `/mcp`; its two tools open a workspace and explain limits. Test the MCP Apps resource with the intended host before declaring it available.

Run the [public deployment preflight](deployment-check.md) from a source checkout with its development dependencies installed. It checks the real HTTPS server, private-API denial, exact client-origin CORS, MCP tools, and served workspace assets. A passing report establishes only that observed server contract; it does not execute the embedded host or prove human consent.

For the actual ChatGPT or other embedded host, observe the iframe's browser Origin and allow that exact origin; the chat website's origin may differ. Verify asset loading, CSP, CORS, browser storage, Web Crypto, and leave/delete in that host. Publish the operator, reachable pilot contact, and actual proxy-log and backup retention before inviting volunteers. See [the pilot playbook](pilot-testing.md).

The [ChatGPT first-test guide](chatgpt-first-test.md) covers custom connections and the optional `KIN_OPENAI_APPS_CHALLENGE` route for a token supplied by the official submission portal. Leave it unset until a real verification token is provided; the route then returns 404.

## Operational limits

On 2026-10-07, the pilot provider API reported one replica, `/data` persistence, a 60-second `/api/network/health` check, and `ON_FAILURE` with three retries. No volume backup schedules or listed volume backups were configured. These [observed settings](../research/hosted-operations-verification-2026-10-07.json) do not establish absence of provider-internal copies or irreversible log deletion. Actual private contact and hosted policies remain pending.

The [subsequent redeployment](../research/hosted-redeployment-verification-2026-10-07.json) succeeded with those runtime settings and passed all 12 public checks again. A fresh 131-byte synthetic sentinel matched before and after deployment. Railway's CLI refused agent file deletion, so that one QA file remains pending human cleanup; the exact command is in the local report. This check does not prove backup recovery or power-loss durability.

This is a single-process relay with atomic JSON persistence: 200 registered agent keys, 2,000 conversations, and 2,000 queued packets. These are caps, not verified throughput. Startup acquires an exclusive `.kin-process.lock` under `KIN_DATA_DIR`; another server using that directory refuses before loading its store. Normal shutdown drains maintenance and releases it; a failed final checkpoint reports failure. Abrupt termination can leave a stale marker: confirm no process still uses that directory before removing only the marker. Do not share the JSON volume across multiple writer processes or remove an active lock. The updated source removes queued packets and pending introductions after 24 hours, terminal conversations after seven days, and idle registrations/connections after 30 days. See [retention deadlines and migration grace](privacy-and-consent.md). Live deployment verification is recorded separately from source tests.

The HTTP server limits receipt of headers to 15 seconds and complete requests to 30 seconds, checks connections each second, and rejects headers larger than 16 KiB. These limits concern incoming requests, preserving long-lived MCP responses. Reverse-proxy limits still apply independently. [Node.js 22.19 HTTP behavior](https://github.com/nodejs/node/blob/v22.19.0/doc/api/http.md).

Before increasing the cohort, observe how the deployed proxy affects rate limits. The reference relay uses the direct socket address: challenge GETs and signed POSTs each have a separate 300-per-minute bucket per address; signed POSTs also have a 60-per-minute bucket per agent. A proxy can make unrelated owners share the address buckets. Illustratively, one continuously active idle browser polls the inbox about 20 times and the directory about four times per minute, issuing about 24 challenge GETs and 24 POSTs. Two owners use about 48 requests in each address bucket; 13 use about 312 in each, exceeding the limits before other actions. These are schedule calculations, not measured capacity; latency, browser throttling, and owner actions change the load. The public MCP router separately permits 120 requests per socket address per minute. Confirm actual pilot behavior before expanding, and use an explicitly trusted edge configuration if changing address handling; do not blindly trust `X-Forwarded-For` or other client-supplied headers.

Restrict and account for proxy logs and backups. Encryption protects payloads through the relay, while public capsules, participants, timing, sizes, and signed decision metadata remain visible. Device private keys are plaintext browser storage. The release has no independent audit, forward secrecy, staffed moderation, recovery, or durable person-level blocks.

The current entrypoint validates saved sessions and relay state before listening or printing readiness. During SIGTERM/SIGINT it stops admitting requests, gives active sockets five seconds, then closes remaining sockets and waits for asynchronous handlers and durable maintenance before releasing the lock. A disconnected request can still have pending work; socket closure alone never releases ownership. Hung storage can still require operator intervention, and an abrupt platform kill can still leave a stale marker. Health probes wait behind queued work without cloning the ciphertext store. See [the lifecycle and transport decision](adr/0016-bounded-transport-and-durable-server-lifecycle.md).

Relay clients reject redirects, including at challenge retrieval, and enforce response-size bounds with a 24-second total request deadline. Use the canonical relay address rather than an address that redirects. A network error never causes an automatic signed write retry: verify current connection state before attempting an action again. These controls do not establish traffic capacity or an independent security certification.

The application admits at most 128 concurrent asynchronous handlers. Overflow returns 503 with `Retry-After: 1` before creating an owner session. This bounds handler work; incomplete header connections retain the existing HTTP timeout controls. Configure provider ingress protections separately before a public traffic campaign. No throughput or distributed capacity claim follows from this limit.

See [privacy](privacy-and-consent.md), [security](../SECURITY.md), and [roadmap](roadmap.md). A hosted deployment must publish its own accurate operator, retention, and support policies. The repository's public policy pages describe the prototype and need maintainer review for formal service terms.
