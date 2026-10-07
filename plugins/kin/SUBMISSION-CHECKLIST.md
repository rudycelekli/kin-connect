# Kin official plugin submission readiness

**Status on 2026-10-07: draft; not ready for official MCP submission.** Kin has an implemented MCP server and a portable package draft. It has not been installed and tested in ChatGPT, uploaded for official review, approved, or published in the directory. The public browser demo and local MCP tests do not establish any of those outcomes.

## Evidence already available

- [x] Portable `plugin.json`, intake workflow skill, and square 128px SVG icon exist.
- [x] Installed Ajv2020 validated the manifest and MCP **template** against the fetched official portable schemas. [Recorded local evidence](../../research/plugin-package-validation.json).
- [x] The package builder creates an allowlisted, single-root ZIP without credentials, browser state, templates, or runtime files. The existing `kin-plugin-draft.zip` is **instructions-only** and contains no MCP connection.
- [x] `server/chatgpt.ts` implements `kin_open_connections` and `kin_explain_privacy`, with empty input schemas and explicit read-only/non-destructive/bounded-world hints. It provides a workspace UI resource; neither tool reads private profiles, imports history, grants consent, or sends messages.
- [x] The manifest contains five positive and three negative **draft** review cases.
- [x] Public listing/policy pages returned HTTP 200 during this readiness check: [website](https://rudycelekli.github.io/kin-connect/), [support](https://rudycelekli.github.io/kin-connect/support.html), [privacy](https://rudycelekli.github.io/kin-connect/privacy.html), and [prototype terms](https://rudycelekli.github.io/kin-connect/terms.html). Availability does not establish policy approval or a public MCP endpoint.

Current gaps are directly observable: root `mcp.json` is absent; the configured endpoint is still a deliberately unusable template; `review.demo_recording_url` and `publication.release_notes` are absent; the local validation record marks ChatGPT cases unexecuted. Prototype policies still need maintainer review against the final hosted operation and publisher identity.

## Connected package and service

- [ ] Deploy and verify a stable production **public HTTPS MCP endpoint**. No such endpoint has been verified for this release. Hosting authorization is pending; static GitHub Pages alone cannot host the MCP or relay. Testing tunnels do not satisfy public submission. [Remote MCP requirements](https://developers.openai.com/plugins/deploy/app-review), [connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt).
- [ ] Configure the actual endpoint using `plugins/kin/scripts/configure.mjs`, creating root `plugins/kin/mcp.json` with the single `kin` Streamable HTTP connection. Keep secrets out of the config and archive.
- [ ] Build the connected ZIP with `npm run plugin:package`, inspect its contents, and revalidate the resulting manifest/config. Include MCP in the **initial** submission; adding MCP to a previously skills-only plugin is currently unsupported. [Official submission flow](https://developers.openai.com/plugins/deploy/submission).
- [ ] Confirm production UI resource loading, exact CSP domains, tool metadata, and server behavior match the submitted version. A placeholder or local endpoint cannot substitute for this. [Remote MCP review](https://developers.openai.com/plugins/deploy/app-review).

After a real URL is known, run from the repository root:

```sh
node plugins/kin/scripts/configure.mjs "${KIN_PUBLIC_MCP_URL:?Set the verified production HTTPS MCP URL}"
npm run plugin:package
```

`npm run plugin:package -- --draft` remains useful for inspection. It removes MCP/review metadata and produces an instructions-only artifact; it is not the connected release.

## ChatGPT validation and review evidence

- [ ] Connect the actual server in ChatGPT, inspect discovered tools, install the complete package, and test skill/tool/UI behavior together. Retain prompts, selected tools, arguments, results, and errors. Local browser or Inspector checks do not substitute for this. [Official testing workflow](https://developers.openai.com/plugins/deploy/connect-chatgpt).
- [ ] Execute the five positive and three negative manifest cases with sample data. Complete each negative case's reason and observable safe fallback. Record actual results; current cases are drafts. [Submission review information](https://developers.openai.com/plugins/deploy/submission).
- [ ] Validate ChatGPT desktop and mobile rendering, keyboard access, and private browser intake. Confirm both tools remain unable to publish a profile, approve, import contacts, or disclose private data. [Plugin testing requirements](https://developers.openai.com/plugins/plugin-guidelines).
- [ ] Produce a reviewer-accessible video of the tested tools and workflows; add its actual URL as `extensions.com.openai.review.demo_recording_url` and add version-specific `publication.release_notes`. [Required review materials](https://developers.openai.com/plugins/deploy/submission-errors).
- [ ] If screenshots are supplied for this custom UI, capture actual ChatGPT output: PNG/JPEG, exactly 706px wide and 400–860px tall, one per starter prompt. Existing app previews have not been validated as these screenshots; the current ZIP does not package them. [Screenshot rules](https://developers.openai.com/plugins/deploy/submission-errors).

The two current model tools have no account sign-in. If authentication is added, provide reviewer-ready sample credentials privately in the portal, without inaccessible MFA or network prerequisites. Never package credentials or use real owners' private data as review fixtures. [Reviewer access](https://developers.openai.com/plugins/deploy/app-review).

## Publisher and portal prerequisites

- [ ] Confirm the responsible organization/project, verified individual or business identity, and submission permissions. Kin contributors is draft listing text, not evidence of a verified publisher. [Organization verification](https://developers.openai.com/plugins/deploy/app-review).
- [ ] Review the four HTTPS listing URLs and policies for the actual publisher, data categories, recipients, retention, deletion exceptions, browser storage, visible metadata, unaudited encryption, and the fictional/live feature boundaries. [Privacy requirements](https://developers.openai.com/plugins/plugin-guidelines).
- [ ] Confirm the category is accepted by the current portal and final listing limits pass; portable schema validation does not establish this. [Listing validation](https://developers.openai.com/plugins/deploy/submission-errors).
- [ ] Complete the portal's domain challenge: serve its exact plain-text token at the generated `/.well-known/openai-apps-challenge` URL on the MCP host or an allowed parent, then verify it. No token has been obtained or verified here. [Domain verification](https://developers.openai.com/plugins/deploy/submission).
- [ ] Upload through the **With MCP** path; resolve required metadata and skill-scan errors, connect the production server, and obtain a successful current tool scan. Confirm each tool's three explicit annotation booleans match behavior; respond to actual portal findings. [Final submission checks](https://developers.openai.com/plugins/deploy/submission-errors).
- [ ] Review the portal's imported materials and policy attestations, submit the selected draft, address review feedback, and publish only after approval. No approval or directory availability can be inferred from schema validation. [Review and publication](https://developers.openai.com/plugins/deploy/submission).

**Documentation inconsistency:** the current plugin guidelines explicitly waive annotation justifications, while the submission-errors and remote-review pages still mention them. Treat the guidelines' explicit boolean requirement as current, and provide clarification only if the portal asks; absence of a justification is not an established blocker here. Nested iframe domains still require explanations if used. Kin currently serves its UI resource directly without a nested iframe. [Current annotation and iframe guidance](https://developers.openai.com/plugins/plugin-guidelines), [error reference](https://developers.openai.com/plugins/deploy/submission-errors).

## Capability boundary for the listing

The initial listing should promise only the implemented workspace-opening and public privacy-explanation tools. Local owner-assistant pairing is a separate explicit profile copy, not account-wide memory access. Sign in with ChatGPT scopes do not expose conversations, and MCP must not reconstruct full chat logs. Multi-provider memory, LinkedIn imports, real circle admission, credential verification, paid clubs, and group chat must remain marked as proposals until implemented and separately reviewed. [ChatGPT scope limits](https://developers.openai.com/siwc/quickstart), [plugin data boundaries](https://developers.openai.com/plugins/plugin-guidelines), [community design](../../docs/communities.md).

This checklist records preparation and outstanding evidence. It does not certify security, predict review approval, or replace the actual submission portal's current findings. Official requirements were opened and checked on 2026-10-07; recheck them when preparing the connected release.
