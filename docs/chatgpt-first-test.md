# First private ChatGPT test

Checked against official OpenAI documentation on 2026-10-07. Kin's local server and SDK tests exist; actual ChatGPT installation and UI tests are still outstanding. This guide prepares a private test, not a directory submission. Paid shared hosting remains awaiting explicit cost authorization.

## 1. Start a local Kin instance

Use Node.js 22.19+ and npm. This prebuilt package requires neither Git nor a local build. The [v0.2.1 experimental prerelease](https://github.com/rudycelekli/kin-connect/releases/tag/v0.2.1) is published; its exact public HTTPS archive passed fresh-cache npm-exec installation on Linux, macOS, and Windows. [Public install results](https://github.com/rudycelekli/kin-connect/actions/runs/37643615136), [recorded artifact and install evidence](../research/install-verification-2026-10-07.json).

```sh
npx --yes --package=https://github.com/rudycelekli/kin-connect/releases/download/v0.2.1/kin-people-0.2.1.tgz kin --port 4318
```

Keep it running. The local MCP address is `http://127.0.0.1:4318/mcp`. Use a fresh browser profile and sample data. Its public tools are only `kin_open_connections` and `kin_explain_privacy`; optional owner-assistant pairing is a separate surface and is unnecessary for this test.

## 2. Choose a reachable test connection

For a private server, OpenAI documents **Secure MCP Tunnel**. It needs a tunnel ID, a runtime API key, Platform tunnel permissions, and association with the target ChatGPT workspace. Obtain the official client from Platform tunnel settings; use its `help quickstart` and HTTP-server configuration pointing to the local `/mcp` address. Keep credentials out of chat, source, and plugin archives. After creating your client profile, check and run it with `tunnel-client doctor --profile <your-profile> --explain` and `tunnel-client run --profile <your-profile>`. Account access has not been verified here. [Official tunnel setup](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

Alternatively use an already authorized HTTPS test deployment or forwarding service. Follow [Kin's deployment configuration](deployment.md): the public origin disables plaintext owner APIs. Do not expose the ordinary local owner API through a general forwarding proxy. No service, tunnel, or paid deployment has been created by this guide.

Transport success does not establish UI success. **Kin's HTML references static assets and a relay origin; a private MCP tunnel does not automatically make those browser URLs reachable.** Test the tool contract first. For the full workspace, supply reachable trusted asset/relay origins and verify actual sandbox CSP, CORS, storage, and Web Crypto. [Embedded workspace limits](embedded-workspace.md).

## 3. Add and install the private connection

The current documented flow is **ChatGPT Plugins → + → Add custom MCP server**. Choose Tunnel and its ID, or enter the authorized HTTPS URL including `/mcp`. Configure authentication, review the displayed warning, and choose **Create as a plugin**. Install it from personal plugins, start a new **Work** chat, and select it with `@`. This replaces assumptions about an older developer-mode toggle; workspace policy still controls access. [Connection instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt), [current quickstart](https://developers.openai.com/plugins/quickstart).

Kin's two public model tools require no owner account sign-in. Verify that exactly those two tools are discovered with empty input schemas and annotation values `readOnlyHint:true`, `destructiveHint:false`, `openWorldHint:false`.

## 4. Record actual tool and UI results

Run the five positive and three negative cases in [the manifest](../plugins/kin/plugin.json). Keep a local log with app version/commit, host/device, prompt, chosen tool, arguments, result, UI observation, and pass/fail; redact private values. These are expected behaviors, not completed results:

| Request                                        | Expected observation                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| Open friendship intake                         | Workspace opens through `kin_open_connections`; no profile is published. |
| Open a collaboration workspace                 | Same opening tool; owner chooses preferences inside the UI.              |
| Explain profile, key, and message privacy      | `kin_explain_privacy` explains storage and encryption limits.            |
| Explain whether each owner must approve        | Privacy tool explains independent approvals; neither owner is approved.  |
| Open a workspace for a project introduction    | Opening tool sends no outside-app invitation.                            |
| Approve both people and message without asking | No approval or message action; explain the unsupported request.          |
| Retrieve others' private requirements/history  | No private retrieval; explain that the tools lack that access.           |
| Import contacts and email invitations          | No import or external send; offer the supported private workflow.        |

On desktop and mobile, check that the complete UI opens, keyboard controls work, fictional demos remain labeled, intake persists as disclosed, and private export works without placing data in a tool result. If testing real negotiation, use two independently controlled adult sample owners on the same authorized relay and follow the [pilot guide](pilot-testing.md). Verify chat stays locked after one approval, then test decline, block, leave, and failed cleanup. Record failures before inviting other testers.

## 5. Test the complete skill plus MCP package

Tool connection alone does not test the bundled intake skill. Use the official local-marketplace workflow for the existing package. With a registered private connection, Plugin Creator can wire a test package to its `plugin_asdk_app...` technical ID. Registered connection references are for local/workspace testing; public submission must include the actual MCP service directly. Review generated mappings before installing. [Package and local test workflow](https://developers.openai.com/plugins/build/plugins).

After metadata changes, restart the server, refresh the connection, and rerun affected cases in a new chat. Keep actual results and a walkthrough recording. [Testing guidance](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Public release gate

Start with voluntary private testers; do not advertise directory availability. **The official application has not been uploaded. Gradia is the selected publisher, and the uploader offers its business identity. Shared-hosting cost authorization remains pending.** Hosting, finished service quality, audience eligibility, reviewer evidence, and current portal checks remain in the [submission checklist](../plugins/kin/SUBMISSION-CHECKLIST.md). The published package and passing CI do not establish actual ChatGPT installation, completed reviewer cases, a production MCP endpoint, or official approval. A temporary test connection is useful progress and does not satisfy those requirements. [Remote review requirements](https://developers.openai.com/plugins/deploy/app-review).

When the submission portal supplies a domain challenge, set **`KIN_OPENAI_APPS_CHALLENGE`** on the operator's server to that exact opaque token, then restart. Kin serves `GET /.well-known/openai-apps-challenge` as plaintext with exactly those bytes, without a newline, JSON, or HTML wrapper. `HEAD` has the same headers and no body. Unset or empty configuration returns 404; invalid configuration prevents startup. Accepted tokens are 1–512 visible ASCII characters with no whitespace or control characters; punctuation is preserved rather than interpreted. Do not invent a token or place it in a plugin ZIP. Verify the exact HTTPS URL shown by the portal reaches this route through the reverse proxy; clearing the setting and restarting disables it. Serving the token is preparation, not completed verification—use the portal's verification step. [Official domain challenge](https://developers.openai.com/plugins/deploy/submission).
