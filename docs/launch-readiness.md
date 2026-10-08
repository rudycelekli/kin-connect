# Kin launch readiness and first-run guide

**Checked 2026-10-07.** Kin supports developer previews and supervised two-owner pilots. Local negotiation, signed approvals, and encrypted chat work. The owned HTTPS service is live at www.kinconnections.com, and its 12 public server-contract checks passed for both its own origin and the Pages client origin. No completed human trial, actual ChatGPT installation, submission, or directory approval is established here.

| Entry point            | What a new owner can do now                                             | What remains necessary                                                          |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Public browser build   | Use fictional Connections/Circles; review the shared pilot relay        | Operator/contact/retention practices and an actual two-owner pilot              |
| Local launcher         | Run the app and relay; test two separate browser profiles on one device | Node/npm; both owners choose the same relay for different devices               |
| Connected plugin draft | Inspect the configured five-file ZIP and public MCP tools               | A permitted ChatGPT context, actual installation/UI tests, then official review |

## Embedded connection conversations

The existing embedded workspace contains encrypted human chat, without demonstrated ChatGPT/Claude account compatibility. Additional pure source services now prepare reviewed disclosure after verified connection, separately approved self-reflection for one's own AI, and bounded owner-selected topic priorities. None adds browser controls or automatic learning yet. Human audio remains unimplemented and microphone access is currently denied on Kin's pages. [Conversation boundaries and pending tests](connection-conversations.md).

Current [OpenAI plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines) require general-audience suitability, including ages 13–17, and describe mature 18+ support as forthcoming. Kin's selected adult-only/dating scope needs platform eligibility clarification before submission. This is an unresolved distribution constraint, not an approval or a reason to weaken standalone adult controls.

## Current source service improvements

The subsequent source pass adds coherent negotiated briefs to local discovery, a bounded pure public-capsule shortlist, optional local selected-text AI intake, and a minimal consented feedback vault. Shortlist, assisted-intake, feedback and unified live-brief browser integration are pending; these modules do not constitute completed end-to-end product flows. The public relay always disables AI intake. Real providers were not called and no volunteer outcomes were collected. See [assisted intake](assisted-intake.md), [discovery/feedback](owner-discovery-and-feedback.md) and [ADR-0014](adr/0014-reviewed-assistance-discovery-and-feedback.md).

Local checks cover provider mocks and refusal/size/deadline handling, owner-only access, deletion/read races, generic private-error logs, coherent career plans, capsule bounds, and demo-excluding aggregates. The current public checker adds intake-provider denial to the previous 12 contracts (13 total), with a deliberate exposed-endpoint fixture to verify the evaluator fails. Historical CI and public installer records below remain separate; the v0.2.1 archive has not been replaced with this source.

## Launch gates

Passing the local checks does not establish a finished hosted service. Keep each gate separate and record its actual evidence; do not turn unexecuted cases into a readiness percentage.

| Gate                               | Current evidence                                                                        | Next required result                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Published one-line install         | Exact v0.2.1 HTTPS archive passed on Linux, macOS, and Windows                          | Preserve the tested release and its checksums                                                               |
| Local consent and privacy controls | Source tests pass; see exact dated CI records below                                     | Actual two-owner pilot, including refusal and cleanup                                                       |
| Shared service                     | Authorized Railway pilot with persistent `/data`; 12 public preflight checks passed     | Actual owner flows, operator practices, and observed proxy behavior before expansion                        |
| ChatGPT experience                 | Authenticated ChatGPT custom-MCP creation was rejected by workspace/context permissions | Successful installation; desktop/mobile rendering, storage, Web Crypto, consent, and cleanup                |
| Publisher and policies             | Uploader offers Business — Gradia; public pages identify Gradia                         | Monitored private contact and operator practices; adult friendship, dating, collaboration scope is selected |
| Official application               | Connected five-file ZIP prepared; eight cases drafted; no official upload               | Execute cases, supply recording, verify domain, pass scans, submit, and obtain approval                     |

Earlier complete source checks: [CI at `4ee8d3a`](https://github.com/rudycelekli/kin-connect/actions/runs/37665223747) passed all 111 Node tests and 32 browser tests, the Linux/macOS/Windows packed installers, and the container restart checks. [Pages deployment](https://github.com/rudycelekli/kin-connect/actions/runs/37665223730) also succeeded for that source. The subsequent owned-domain source passed 129 local Node tests and 32 browser tests. Its first CI installer checks rejected the additive retention health field; the installer evaluator is corrected separately and requires retention in current-source packages while allowing the historic archive. The public-installer job was intentionally skipped in this source run; the published archive's installer evidence is recorded separately below. The [deployment preflight](deployment-check.md) can check the public server contract; it cannot replace the actual host or human tests.

Public pilot relay: **`https://www.kinconnections.com`**; MCP: **`https://www.kinconnections.com/mcp`**. All 12 [public server-contract checks](../research/owned-domain-service-verification-2026-10-07.json) passed on 2026-10-07 for its own origin and the Pages client origin `https://rudycelekli.github.io`. The old Railway origin remains an explicit alias. GoDaddy DNS/root forwarding and Railway ownership/TLS setup are complete; OpenAI portal domain verification remains separate and pending. This observes public mode, disabled owner APIs, MCP initialization/tools/resource, CSP metadata, served JS/CSS, and no issued cookies. It does not execute an iframe, register owners, approve, chat, delete, verify the domain challenge, or measure capacity. The deployment uses one writer and a persistent `/data` volume.

The separate [synthetic two-device HTTPS contract](../research/hosted-network-verification-2026-10-07.json) passed all eight recorded checks at 2026-10-07 16:37:08.755 UTC. It exercised signed registration, six encrypted agent stages, chat rejection before/after only one synthetic approval, verified bilateral signatures, encrypted chat delivery/acknowledgment, decline, block with same-key rejoin denial, and signed leave/revoked access. Synthetic registrations were removed, and private keys were not persisted. These were automated synthetic-owner decisions over the public relay, not real human consent or an actual ChatGPT/Claude iframe. Operator/private-contact/retention practices and introduction wording remain review tasks.

The owned HTTPS endpoint is settled at `https://www.kinconnections.com/mcp`; DNS, provider verification and served TLS were checked, and the connected ZIP was rebuilt for that endpoint. OpenAI's current update flow requires contacting support to change an existing MCP URL. OpenAI-specific domain verification has not completed. [Endpoint update constraint](https://developers.openai.com/plugins/deploy/submission).

## Shortest browser path

Open [Kin](https://rudycelekli.github.io/kin-connect/). **Try the demo** loads fictional people. **Join the network** starts five private intake screens: identity fields, intentions/interests, values/availability, hard requirements, and review. Saving returns to separate capsule review without publishing or registering an agent.

For the supervised pilot, both owners can enter `https://www.kinconnections.com` in Live network after reviewing the operator practices and disclosure. A **network invite** opens Live network and prefills its normalized address for review. It contains only the address; opening it sends no registration, profile, or keys. Invalid invites leave the field empty. The Pages build now prefills the owned relay for review; a valid invite takes precedence and an invalid invite leaves the field empty. Prefilling is not joining.

Review the address, choose a contact-free alias and purpose, select intentions and optional public interests, check the publication agreement, then **Join the real network**. Both browsers must remain open. Joined owners can **Copy network invite** for another voluntary tester. Local invites open the app on the machine running that relay; HTTPS network invites use the public client and require its origin to be permitted by the operator. Opening the public client does not enroll an owner or supply an existing pool of people.

Select a peer capsule and start the agents. Each owner reviews the proposal, checks **I want this introduction**, and approves. One yes keeps chat locked; both verified signatures unlock it. Saving an approved alias to **Your private circle** grants no new messaging or community permission.

## One-line local installation

The prebuilt release path requires **Node.js 22.19+ and npm**:

```sh
npx --yes --package=https://github.com/rudycelekli/kin-connect/releases/download/v0.2.1/kin-people-0.2.1.tgz kin
```

Runtime dependencies install; no Git or local source build is needed. Wait for **Kin is ready**, then use the opened browser or printed URL. The launcher binds to `127.0.0.1:4318`, falling back to the next free default port. Keep the terminal running; `Ctrl+C` stops it. `--no-open` skips browser opening; `--port 4318` requires that exact port; `--version` prints the installed release. Relay records use `~/.kin`; intake/keys use browser storage. This command pins v0.2.1.

The [v0.2.1 experimental prerelease](https://github.com/rudycelekli/kin-connect/releases/tag/v0.2.1) is published. Its exact HTTPS archive passed fresh-cache npm-exec installation on Linux, macOS, and Windows, with unrelated working directories, isolated data, installed-version checks, and rejection of a second process using the same data directory. [Public installer CI](https://github.com/rudycelekli/kin-connect/actions/runs/37643615136). A final local macOS/Node 22.19 run also passed. The three CI readiness observations were 6.0, 11.1, and 56.8 seconds; these are single-run measurements, not promised durations. Logical cache size ranged from about 129–140 MiB. Linux/macOS verified graceful SIGTERM shutdown and lock removal; Windows used scoped process-tree termination and did not establish graceful marker removal. Earlier Git-unavailable and staging observations remain in the [install evidence](../research/install-verification-2026-10-07.json).

The published archive is **384,799 bytes**, with GitHub-advertised SHA-256 `2370c592abee99a0ba7658596ee1b0c8720e77e5d799d0f3231f679ac51e593d`. The [plugin draft ZIP](https://github.com/rudycelekli/kin-connect/releases/download/v0.2.1/kin-plugin-draft.zip) is **7,315 bytes**, with advertised SHA-256 `4691487b9e71ef85a8c34cd08bce680e53aa4baf740cee4181caf7ecb6f8f054`. These identify the observed release assets; versioned URLs do not establish immutability, and the draft ZIP supplies no managed endpoint or official approval.

Developers can use `npx --yes github:rudycelekli/kin-connect` with Git; it builds source from the current default branch.

For the local pilot, use two separate browser profiles at the printed URL and join the same relay. Two tabs share identity/storage. Separate device installations create separate loopback relays.

Only one server may use a data directory at a time. A second launch using `~/.kin` refuses before loading relay records; stop the first terminal or use its existing URL. Normal shutdown releases `.kin-process.lock`. A force-killed process can leave that marker behind. Remove only the marker, and only after confirming no Kin process uses that directory; retain all profile and relay data. A fresh `KIN_DATA_DIR` is another option for an independent test network.

## Operator gate before inviting real testers

The paid Railway pilot was authorized and deployed with persistent storage; its public contract passed for the Pages origin. Follow [deployment](deployment.md) for the actual pilot checks, including both devices' reachability and proxy rate-limit behavior. Assign outage/support, retention/backups, and abuse responsibilities and publish the actual operator/contact/retention practices before invitations. These operational facts are not established by a health response.

Explain disclosure: capsules are public to the relay/directory; selected peer agents receive encrypted age, city, gender, smoking, interests, values, and availability. Real names, contacts, private rules, and notes are withheld. Device keys are plaintext browser storage. Metadata remains visible; person verification, forward secrecy, and independent audit are absent. See [privacy and consent](privacy-and-consent.md).

## Two adult volunteer tester checklist

Use the fuller [pilot playbook](pilot-testing.md) and record outcomes without private transcripts or keys:

- Independently create/review profiles and capsules; no registration before agreement.
- Join the same relay, remain online, and complete six structured agent stages with compatible policies.
- One approval keeps chat locked; two verified approvals allow an actual encrypted message.
- Save/remove the approved alias. Confirm Circles organizers and memberships remain explicitly fictional, with paid/credential fixtures unavailable.
- Decline a separate proposal and test incompatible requirements; chat stays closed.
- Block an approved peer: chat closes and its saved alias disappears. Same-key rejoining must not bypass the other owner's block.
- Test leave/delete and an unavailable relay: preserve keys/profile for cleanup retry.
- Optionally try a small collaboration task and ask about usefulness, without romantic prediction claims. No human results are recorded here.

## Actual ChatGPT testing and publication

For development, current official instructions allow a public HTTPS MCP endpoint or Secure MCP Tunnel. In ChatGPT Plugins, use the plus button → **Add custom MCP server**, configure the connection/authentication, accept the required warning, and **Create as a plugin**. Install it, select it with `@` in a fresh conversation, and test tools plus the embedded UI. Account/workspace policy applies. An authenticated ChatGPT attempt returned “Custom apps aren’t allowed in this context. Check your workspace permissions or security settings”. No Kin installation or host cases completed. Resolve the applicable context permissions or use a permitted workspace, then execute the actual cases. [Official connect-and-test guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

Publication requires a complete reliable public service, a connected ZIP including MCP from the initial submission, verified publisher identity, domain verification, successful required scans, executed positive/negative cases, recording, release notes, and review approval before publishing. **The official application has not been uploaded. Gradia is the selected publisher, and the uploader offers its business identity. The live pilot endpoint is configured in `mcp.json`, and a five-file connected ZIP is prepared.** The public preflight, portable schema validation, and GitHub prerelease do not satisfy the remaining host, operator-policy, and review gates. The user selected adult friendship, dating, and collaboration; career networking uses collaboration with explicit complementary goals and independently checked career plans; role and credential verification remain unimplemented. See the [career guide](career-networking.md). Follow the [Kin submission checklist](../plugins/kin/SUBMISSION-CHECKLIST.md) and [official submission flow](https://developers.openai.com/plugins/deploy/submission).

## Fresh-user review evidence

At code commit `88e429bed0812861aaeda27b4d708058ae542f16`, [required CI](https://github.com/rudycelekli/kin-connect/actions/runs/37642837251) passed 95 Node/domain/API/MCP/lock checks and 32 desktop/mobile browser checks. Fresh-browser onboarding returned to capsule review without registration or device keys; the checked path fit `1440px` and `390px` widths. The browser checks cover reviewed invites, relay-only copying, live intake disclosure, independent consent/chat, revocation/cleanup, saved aliases, and fictional circle gates. The local-packed installer matrix passed on Linux/macOS/Windows. The Docker stop/restart smoke removed its lock and retained a writable-volume sentinel; this establishes that tested shutdown path, without proving power-loss durability. [Pages deployment](https://github.com/rudycelekli/kin-connect/actions/runs/37642836929) also succeeded for that commit.

This is automated evidence, not completed human or ChatGPT/Claude host testing. Onboarding duration is unmeasured. Operator practices, a permitted platform installation, actual host cases, and the human pilot remain readiness gates.
