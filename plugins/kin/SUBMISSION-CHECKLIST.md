# Kin official plugin submission readiness

**Rechecked 2026-10-07: connected draft; not ready to submit.** Paid Railway hosting was authorized. The public pilot endpoint is live, all 12 server-contract checks passed, and the configured five-file ZIP is prepared. Gradia is the selected publisher, and the official uploader offers **Business — Gradia**. Actual ChatGPT installation, host UI tests, operator policies, audience eligibility, official review, and directory publication remain outstanding. No package has been uploaded.

Begin with the [private first-test guide](../../docs/chatgpt-first-test.md). Custom MCP testing and official directory distribution are separate stages; a tunnel can support the former without satisfying the latter. [Official connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt), [remote review requirements](https://developers.openai.com/plugins/deploy/app-review).

## Existing preparation

- [x] Portable `plugin.json`, owner-intake skill, and 128px square SVG icon exist.
- [x] Manifest and MCP **template** passed cached Ajv2020 validation against current portable schemas. This does not validate OpenAI extension semantics or installation. [Local evidence](../../research/plugin-package-validation.json).
- [x] Allowlisted ZIP builder exists. `kin-plugin-draft.zip` is instructions-only, with no MCP connection, runtime state, or credentials.
- [x] Separate connected `artifacts/kin-plugin.zip` is prepared with five allowlisted files, including `kin/mcp.json` pointing to `https://kin-relay-production.up.railway.app/mcp`. The previously released instructions-only archive remains unchanged.
- [x] Actual connected ZIP integrity, source correspondence, and both archived portable JSON schemas passed. [Current package evidence](../../research/connected-plugin-validation-2026-10-07.json). OpenAI extension acceptance and host compatibility remain untested.
- [x] Two public model tools exist: `kin_open_connections` and `kin_explain_privacy`. Empty inputs; explicit `readOnlyHint:true`, `destructiveHint:false`, `openWorldHint:false`. Neither reads profiles, approves, nor messages people.
- [x] Five positive and three negative review cases are drafted; none has been executed through ChatGPT.
- [x] Website/support/privacy/terms URLs exist in the manifest; an earlier check today returned HTTP 200. This is availability evidence, not approval of prototype policies or evidence of an MCP service.

Current gaps: `extensions.com.openai.review.demo_recording_url` is absent and actual host-test results are missing. Initial application release notes and expected behavior for all eight cases are drafted; refresh release notes to match the deployed service and actual outcomes before submission. The deliberately unusable template is separate from the configured `mcp.json`.

The authenticated ChatGPT custom-MCP creation attempt returned “Custom apps aren’t allowed in this context. Check your workspace permissions or security settings”. Kin was not installed, and no host cases ran. Resolve the applicable context permissions or use a permitted workspace before treating account testing as complete.

## Product eligibility before listing

- [ ] Demonstrate a complete, reliable real workflow. Current policy excludes trial/demo plugins; fictional fixtures cannot be the whole submitted service.
- [ ] Resolve audience scope. Guidelines require suitability for general audiences including 13–17 and defer mature 18+ experiences. Kin's adult-only rule is not automatically a mature-content classification, but its present suitability is **not established**. Keep the adult safety gate; seek reviewer clarification on the actual submitted scope rather than admit minors to adult matching.
- [ ] Keep proposed paid clubs, digital subscriptions, and upgrades out of the plugin purchase/upsell flow. Current policy disallows digital-service sales, including indirect upsells; access through an existing paid account can be allowed. Kin currently has no billing.

These are platform review gates, not a finding that all dating or adult-only software is prohibited. [Current quality, audience, and commerce guidelines](https://developers.openai.com/plugins/plugin-guidelines).

## Connected service and archive

- [x] Deploy and initially verify public HTTPS `/mcp`: `https://kin-relay-production.up.railway.app/mcp`, with a persistent `/data` volume and one writer. All 12 [public server-contract checks](../../research/hosted-service-verification-2026-10-07.json) passed at 2026-10-07 16:35:16.397 UTC for the Pages origin. This is an observed pilot contract, not established production capacity or completed owner/host testing. A complete reliable service remains required; local addresses, placeholders, or temporary tunnels cannot replace it. [Server requirements](https://developers.openai.com/plugins/deploy/app-review).
- [ ] Verify trusted UI assets, exact CSP and relay CORS origins, storage, Web Crypto, and deletion behavior in the actual host. Transport tests alone do not render the complete workspace. [Kin host boundaries](../../docs/embedded-workspace.md).
- [x] Configure the verified pilot URL and prepare the five-file connected ZIP. Rebuild and inspect it after any final metadata or reviewer-evidence changes:

```sh
node plugins/kin/scripts/configure.mjs "${KIN_PUBLIC_MCP_URL:?Set the verified production HTTPS MCP URL}"
npm run plugin:package
```

Before the official upload, settle the final MCP domain and configure/rebuild against that verified endpoint. The current Railway address is the pilot endpoint. An owned-domain decision is pending; no domain verification has completed. OpenAI's current update flow requires contacting support to change an existing MCP URL, so avoid uploading the initial application against an address the operator intends to replace. [Endpoint update constraint](https://developers.openai.com/plugins/deploy/submission).

Use `npm run plugin:package -- --draft` only for instructions-only inspection. Keep one plugin root, referenced assets, skills, and the generated portable `mcp.json`; exclude secrets. Registered private-connection references are not a public-server submission. [Package guide](https://developers.openai.com/plugins/build/plugins), [archive rules](https://developers.openai.com/plugins/deploy/submission-errors).

Include MCP in the **initial** public submission. An existing skills-only listing cannot currently acquire MCP later. [Submission constraint](https://developers.openai.com/plugins/deploy/submission).

## Actual reviewer evidence

- [ ] Test the installed skill/tools/UI together through ChatGPT on desktop and mobile; retain observed failures and results. Execute all eight manifest cases, including explicit reasons and safe fallbacks for negatives. [Testing instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt).
- [x] Draft initial version release notes in `extensions.com.openai.publication.release_notes`; refresh them after actual deployment and host tests.
- [ ] Supply a real reviewer-accessible walkthrough recording in `extensions.com.openai.review.demo_recording_url`. If sign-in is later required, provide dedicated sample-account access privately in the portal, never inside the ZIP. [Review information](https://developers.openai.com/plugins/deploy/submission).
- [ ] If adding optional custom-UI screenshots, use actual ChatGPT output and current portal dimensions: PNG/JPEG, 706px wide, 400–860px tall, one per starter prompt. Existing browser previews do not establish those requirements. [Screenshot rules](https://developers.openai.com/plugins/deploy/submission-errors).

## Owner and portal actions

- [x] Select Gradia as the publisher. Its business identity is available in the official uploader, which no longer blocks upload for verification. This observation does not establish plugin approval. Owners can submit; other members need Apps Management Write (`api.apps.write`). [Permissions and verification](https://developers.openai.com/plugins/deploy/app-review).
- [ ] Review listing categories, publisher text, four HTTPS policy/support URLs, countries, and hosted data practices. Prototype policies need maintainer review; no audit or legal certification is implied. [Listing fields](https://developers.openai.com/plugins/deploy/submission).
- [ ] Upload the connected ZIP using **With MCP**. Fix required metadata/skill findings, connect the server, complete the exact plain-text `/.well-known/openai-apps-challenge` token from the portal, and pass its current tool scan. Review imported materials, submit the chosen draft, then publish only after approval. [Official portal flow](https://developers.openai.com/plugins/deploy/submission), [error reference](https://developers.openai.com/plugins/deploy/submission-errors).

**Documentation inconsistency:** current guidelines waive annotation justifications; error/review references still mention them. Accurate explicit booleans remain required. Provide clarification if the portal flags an issue, without inventing a mandatory justification gate. Explain nested frame domains if actually used; Kin currently serves its resource directly. [Current annotation guidance](https://developers.openai.com/plugins/plugin-guidelines).

## Listing boundary

Promise the implemented workspace-opening and privacy-explanation tools. Local assistant pairing copies a reviewed profile separately; it does not grant account-wide history access. History imports, LinkedIn, live circle admission, credential verification, payments, and group chat remain proposals. Do not request or reconstruct full chat logs. [Data-minimization guidance](https://developers.openai.com/plugins/plugin-guidelines).

This is a preparation checklist, not an approval prediction. Keep private pilot distribution labeled experimental; claim an official listing only when the actual directory publication is complete.
