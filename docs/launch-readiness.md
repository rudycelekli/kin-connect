# Kin launch readiness and first-run guide

**Checked 2026-10-07.** Kin supports developer previews and supervised two-owner pilots. Local negotiation, signed approvals, and encrypted chat work. No completed human trial, public managed relay, actual ChatGPT installation, submission, or directory approval is established here.

| Entry point          | What a new owner can do now                                             | What remains necessary                                                                  |
| -------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Public browser build | Use fictional Connections/Circles; create a private profile             | A shared reachable HTTPS relay for real owners on different devices                     |
| Local launcher       | Run the app and relay; test two separate browser profiles on one device | Node/npm; a shared HTTPS deployment for different devices                               |
| ChatGPT plugin draft | Inspect the package and implemented MCP workspace tools                 | A configured endpoint or development tunnel, actual account tests, then official review |

## Shortest browser path

Open [Kin](https://rudycelekli.github.io/kin-connect/). **Try the demo** loads fictional people. **Join the network** starts five private intake screens: identity fields, intentions/interests, values/availability, hard requirements, and review. Saving returns to separate capsule review without publishing or registering an agent.

For real introductions, both owners need the same operator-provided HTTPS relay. A **network invite** opens Live network and prefills its normalized address for review. It contains only the address; opening it sends no registration, profile, or keys. Invalid invites leave the field empty. Without a configured relay or invite, GitHub Pages explains that no shared network is supplied.

Review the address, choose a contact-free alias and purpose, select intentions and optional public interests, check the publication agreement, then **Join the real network**. Both browsers must remain open. Joined owners can **Copy network invite** for another voluntary tester. Local invites open the app on the machine running that relay; HTTPS network invites use the public client and require its origin to be permitted by the operator. The public URL supplies a client; no shared relay or existing pool of people is supplied.

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

Follow [deployment](deployment.md) for shared HTTPS, persistent storage, and exact permitted client origins. Check both devices' reachability. Assign outage/support, retention/backups, and abuse responsibilities. Managed hosting authorization remains pending.

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

For development, current official instructions allow a public HTTPS MCP endpoint or Secure MCP Tunnel. In ChatGPT Plugins, use the plus button → **Add custom MCP server**, configure the connection/authentication, accept the required warning, and **Create as a plugin**. Install it, select it with `@` in a fresh conversation, and test tools plus the embedded UI. Account/workspace policy applies. Kin has not completed this account-level flow. [Official connect-and-test guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

Publication requires a production public HTTPS endpoint, a connected ZIP including MCP from the initial submission, verified publisher identity, domain verification, successful required scans, executed positive/negative cases, recording, release notes, and review approval before publishing. **The official application has not been uploaded. Gradia is the selected publisher, and the uploader offers its business identity; hosting authorization remains pending.** Portable schema validation and a GitHub prerelease do not satisfy the remaining gates. Follow the [Kin submission checklist](../plugins/kin/SUBMISSION-CHECKLIST.md) and [official submission flow](https://developers.openai.com/plugins/deploy/submission).

## Fresh-user review evidence

At code commit `88e429bed0812861aaeda27b4d708058ae542f16`, [required CI](https://github.com/rudycelekli/kin-connect/actions/runs/37642837251) passed 95 Node/domain/API/MCP/lock checks and 32 desktop/mobile browser checks. Fresh-browser onboarding returned to capsule review without registration or device keys; the checked path fit `1440px` and `390px` widths. The browser checks cover reviewed invites, relay-only copying, live intake disclosure, independent consent/chat, revocation/cleanup, saved aliases, and fictional circle gates. The local-packed installer matrix passed on Linux/macOS/Windows. The Docker stop/restart smoke removed its lock and retained a writable-volume sentinel; this establishes that tested shutdown path, without proving power-loss durability. [Pages deployment](https://github.com/rudycelekli/kin-connect/actions/runs/37642836929) also succeeded for that commit.

This is automated evidence, not completed human or ChatGPT/Claude host testing. Onboarding duration is unmeasured. Shared hosting and actual platform installation remain the next readiness gates.
