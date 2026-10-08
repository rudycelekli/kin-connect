# Kin application draft · v0.2.3

This portable Agent Plugins package contains a manifest, one owner-intake workflow skill, an icon, a license, and configured `mcp.json`. Its two public tools are `kin_open_connections` and `kin_explain_privacy`. They open an MCP Apps browser workspace or return public privacy information; neither reads an owner profile nor sends messages or approves introductions.

**Gradia** is the selected publisher; the official uploader offers **Business — Gradia** as the developer identity. The five-file connected ZIP was accepted as an official draft on 2026-10-08. Metadata has no issues, the skill passed its checks, the MCP is configured, and the domain is verified. The application remains unsubmitted and unpublished. This does not establish plugin approval. The manifest keeps **Kin contributors** as the open-source author credits while listing Gradia as the developer identity.

This application source differs from the already released GitHub instructions-only draft archive. The released archive and its recorded checksum remain unchanged. Paid Railway hosting was authorized; the owned pilot MCP endpoint is **`https://www.kinconnections.com/mcp`**. All 12 [owned-domain public server-contract checks](../../research/owned-domain-service-verification-2026-10-07.json) passed for both its own origin and the Pages client origin on 2026-10-07. The relay uses one writer and a persistent `/data` volume. The connected five-file `artifacts/kin-plugin.zip` is rebuilt for this domain; do not upload the old instructions-only archive as the MCP application.

The first official draft uses the settled owned endpoint https://www.kinconnections.com/mcp. OpenAI portal domain verification completed on 2026-10-08; the previous Railway address remains only an explicit relay alias. OpenAI's current update flow requires support to change an existing MCP URL. [Endpoint update constraint](https://developers.openai.com/plugins/deploy/submission).

The repository includes `mcp.template.json` with a deliberately unusable example URL. It is not auto-discovered as an MCP configuration. The generated `mcp.json` now points to the tested live pilot. To reproduce its configuration:

```sh
node plugins/kin/scripts/configure.mjs https://www.kinconnections.com/mcp
```

That creates root `mcp.json` using the portable MCP schema and `streamable-http` transport. No secret belongs in either manifest or ZIP. Root `plugin.json`, `skills/`, `assets/`, and the generated `mcp.json` must stay inside the plugin folder. ZIP this single `kin` folder without sibling files. Without `mcp.json`, this is an instructions-only draft and cannot call Kin tools.

The current OpenAI package format uses portable root `plugin.json` and automatically discovers `skills/` and root `mcp.json`. OpenAI listing settings belong under `extensions.com.openai`. [Official package documentation](https://developers.openai.com/plugins/build/plugins).

The official draft is uploaded, its metadata/skill/MCP scans passed, and its domain is verified. It has not been installed and tested in ChatGPT, submitted for review, approved, or published. An authenticated ChatGPT custom-MCP creation attempt returned “Custom apps aren’t allowed in this context. Check your workspace permissions or security settings”; no Kin installation or host cases completed. The public HTTPS server contract passed, but the actual iframe, browser storage/Web Crypto, owner controls, and eight reviewer cases still need execution in a permitted context. The manifest supplies planned expected behavior and draft release notes; it contains no fabricated results. Prototype policy pages need actual operator/contact/retention practices and submitted audience review. Refresh release notes after deployment/testing and supply a reviewer-accessible recording before submission. [Official submission documentation](https://developers.openai.com/plugins/deploy/submission).

A ZIP must contain exactly one supported plugin root. Adding MCP configuration requires the submission's MCP path rather than its skills-only path. [Official archive validation rules](https://developers.openai.com/plugins/deploy/submission-errors).

Follow the [official submission readiness checklist](SUBMISSION-CHECKLIST.md) for the connected service, actual ChatGPT tests, publisher identity, and remaining review evidence.

## Validate and package

The historical [owned-domain connected ZIP validation](../../research/owned-domain-plugin-validation-2026-10-07.json) validates the rebuilt 12,249-byte five-file archive, SHA256 `d49d1a4793267a3286462482a74f27ddab9adae8ed3dac9343b1b4591c431e06`, against cached portable schemas using Python jsonschema 4.25.1 with format checks. It establishes archive integrity and the configured owned endpoint, not actual host tests, official scans, upload or approval.

The historical [connected ZIP validation](../../research/connected-plugin-validation-2026-10-07.json) passed at 2026-10-07 16:54:17.134 UTC. It checks the actual five archived files, CRC integrity, source correspondence, and both archived JSON documents against cached portable schemas. That historical 12,258-byte ZIP had SHA256 `5c0b117f9149ca7019e2794d4c83a683144a93614d67c1d33b986264bd2fb0fd`. The current source draft has since been rebuilt for the owned www.kinconnections.com domain. This historical local package check does not establish host compatibility, OpenAI extension acceptance, official scans, or submission.

At 2026-10-07 15:38:03.392 UTC, the Gradia v0.2.1 manifest and unchanged MCP template passed the cached Agent Plugins 1.0.0 JSON schemas using Ajv2020 8.20.0 and ajv-formats 3.0.1 with strict validation enabled. That manifest's SHA256 was `c910e1de241ec5b598b7f22a4ccab80d8771d9fec6301df167bdedb0fe653e59`. The [timestamp, hashes, validation options, and limits](../../research/plugin-package-validation.json) identify that earlier validation separately from the unchanged released ZIP and the later connected package. Cached schema bytes matched the previously retrieved hashes; no schemas were fetched or packages installed for that check.

The portable schema assigns no semantics to extension namespace contents. Its pass does not validate the `com.openai` listing category, review metadata, live endpoint, or installation in ChatGPT; those require the separate checklist and current submission portal. This validation performed no native or fallback AI Defence scan; `screened` remains `false`, and earlier source-screening evidence is preserved separately. Schema validation is not a security audit. SVG icons are explicitly supported by the official listing rules; this package uses a square 128px icon for both required roles. Dark variants and screenshots are optional.

After the release archive has been preserved, `npm run plugin:package -- --draft` creates an instructions-only ZIP without MCP configuration, review metadata, or publication release notes. It writes `artifacts/kin-plugin-draft.zip`, so running it now would overwrite the local copy of the released archive. The configured endpoint and `npm run plugin:package` produce the connected `artifacts/kin-plugin.zip`; rebuild it after final metadata changes. The builder permits only `publication.release_notes` and requires a nonempty string; it also requires safe fallback expectations for the negative review cases.

The allowlisted ZIP includes only one `kin` root, the manifest, skill, icon, license, and optional generated MCP config. It excludes secrets, templates, runtime files, and scripts. Packaging does not validate a live endpoint or establish official approval.

## Official draft evidence — 2026-10-08

The initial v0.2.1 package was uploaded with metadata, skill and MCP checks passing, and its canonical domain verified. The owner then reaffirmed Kin's 18+ scope. The reuploaded v0.2.2 draft states this explicitly in its listing and skill; it is 13,062 bytes with SHA256 `9fc446302af34f9206a01c84c1191a931776e3a71ef4f66d56dc24442cc88610`. The portal accepted the revision; its metadata has no issues and its revised 18+ skill checks passed. The configured MCP and verified domain are retained.

The portal imported five positive and three negative planned cases and saved review progress. Both tools remain Not live because this draft is unpublished. [Observed evidence](../../research/plugin-upload-verification-2026-10-08.json) separates these results from historical schema/archive checks. Actual host cases, walkthrough, operator policies and under-18 suitability remain unresolved; the owner chose to retain 18+ rather than change the submitted service's age boundary. No terms or compliance attestations were accepted and no review or publication is claimed.

## Walkthrough revision — 2026-10-08

The accepted v0.2.3 draft adds the [157-second captioned browser walkthrough](../../docs/reviewer-walkthrough.md). The MP4 is publicly downloadable and its bytes matched the original SHA256. The ZIP is 13,202 bytes with SHA256 `96f55f9343352cae37631d4133544ad255a0536ab68071d677c07b4880b25e48`; it contains the same five allowlisted files and references the actual recording URL. Metadata and skill checks passed, and the missing-walkthrough warning is gone. MCP/domain configuration is retained. The video shows fictional adults and actual browser behavior; actual ChatGPT host cases, operator practices and the 18+ suitability declaration remain unresolved. No final legal attestations, review submission or publication occurred.
