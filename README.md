# Kin

### Your agent. Your people.

![Kin's fictional Connections view](docs/preview.png)

Open-source agents connecting people—for friendship, dating, and collaboration. Give your local agent a reviewed profile, preferences, and hard requirements. Two agents check both owners' policies, find common ground, and propose a hello. **Both real owners independently approve before encrypted human chat opens.**

Kin 0.1 implements a browser-held owner agent and a signed-request relay for real two-owner introductions. The separate **Connections** demo uses fictional peers and clearly simulated approval. Agents are deterministic and exchange actual schema-validated JSON; Kin makes no LLM calls. This is an unaudited early implementation, with visible relay metadata and plaintext browser-held private keys.

## Run it

Requires **Node.js 22.19+** and npm.

```sh
npx --yes github:rudycelekli/kin-connect
```

The launcher builds the GitHub package, starts Kin on loopback, and opens your browser. It uses port 4318, or the next free port, and stores local relay records under `~/.kin`. Use `--no-open` or `--port 4318` when needed. The GitHub command installs the repository's default branch; use a reviewed commit or release for reproducible deployments.

The [public browser build](https://rudycelekli.github.io/kin-connect/) is deployed through GitHub Pages when its workflow completes. It can run the fictional demo and connect to a configured HTTPS relay; static hosting alone does not provide a relay. Source: [kin-connect](https://github.com/rudycelekli/kin-connect).

## Make a real introduction

1. Create and review your profile. Intake stays in this browser.
2. Open **Live network**, choose the same relay as the other owner, and explicitly publish a chosen alias, purpose, intentions, and optional interests.
3. Select a peer capsule and let your local policy agents exchange encrypted messages. Both browser owners need to be online.
4. Review the proposal. Each person approves from their own browser. One approval keeps chat locked.
5. After both signed approvals verify, use the encrypted in-app chat. Decline, block, or leave whenever needed.

For a local test, use two separate browser profiles against the same loopback relay. For owners on different devices, deploy a shared HTTPS relay; see [deployment](docs/deployment.md). No public managed relay is implied by the static demo URL.

![Two fictional test owners completing real encrypted negotiation and chat](docs/network-preview.png)

## What works

- Friendship, dating, and collaboration profiles with owner-entered interests, values, and availability.
- Independent bilateral hard gates: age range, city, smoking, and dating gender requirements, plus intention and availability. Adults 18+ is an input rule, not age verification.
- Separate soft preference scoring after eligibility; scores describe overlap, not predicted chemistry.
- A versioned policy-agent handshake, readable steps, and a public-place first-meeting suggestion.
- Key-authenticated registration and requests, encrypted peer negotiation, independent owner approvals, and encrypted human chat.
- Decline, key-pair block, leave, browser profile export/deletion, and a separate device-identity removal control.
- Two public MCP tools that open a workspace or explain privacy. They cannot read profiles, approve, or send messages.
- Optional explicit loopback pairing for your own assistant to manage a copied local profile and fictional discovery.
- Generic sharing that includes a public project link without personal profile or match details.

Freeform boundaries are private advisory notes. Use the structured controls for enforced requirements. No email introductions, contact import, calendar booking, or messages outside the app are implemented.

## Privacy you can inspect

Full intake stays as plaintext browser localStorage. Joining publishes only the capsule you choose, then selected peers receive a limited encrypted matching card. The relay sees capsules, public keys, participants, signed decisions, timing, sizes, and ciphertext.

Delete/reset first sends signed leave to remembered relays, then clears device keys and browser profile, and revokes the local assistant copy when applicable. Unreachable cleanup keeps keys/profile for retry. A blocked peer cannot clear another owner's protection by leaving and rejoining with the same key: blocker-owned pair hashes are a deletion exception, removed only when that blocker leaves. A new key can evade this pseudonymous block.

Private device keys are also plaintext localStorage, without a separate password. Encryption uses ECDH/HKDF and AES-GCM but has no forward secrecy or independent audit. Key verification is not human identity verification. Relay ordering and revocation delivery remain trusted. Read [privacy and consent](docs/privacy-and-consent.md) and [security](SECURITY.md) for the exact limits, retention, and separate deletion scopes.

## Develop and integrate

```sh
npm ci
npm run dev        # Vite 5173; relay/API 4318
npm run check      # TypeScript, production build, domain/API/MCP tests
npm run demo:agents -- friendship --wire
npm run build:demo # Static browser client in dist
npm start          # Built app and loopback relay on 4318
```

The public [Kin protocol](docs/protocol.md) is custom `kin/0.1` with `kin-relay/0.1` transport. It does not claim A2A conformance or cross-relay federation. See [architecture](docs/architecture.md), [agent integration](docs/agent-integration.md), and [accepted decisions](docs/decisions.md).

The [plugin draft](plugins/kin/README.md) includes official-format manifests and a private-workspace skill. It has not been submitted to or approved by OpenAI. A real endpoint and completed review materials are needed before distribution through the plugin directory.

Join through [contributing](CONTRIBUTING.md). The [roadmap](docs/roadmap.md), [launch playbook](docs/launch-playbook.md), and [business model](docs/business-model.md) describe gated plans, not adoption or virality promises. The open implementation remains MIT; the proposed commercial model sells managed service and community tools, without selling private data or bypassing consent.

AI introductions have substantial prior art, including [Boardy](https://www.boardy.ai/) and [Sitch](https://content.sitch.net/privacy-policy/). Kin's bet is an inspectable, adaptable implementation. The [research draft](research/agent-native-matchmaking-2026-10-07.md) records evidence and uncertainty.

MIT licensed. Kin is a working name; no trademark clearance has been performed.
