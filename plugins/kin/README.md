# Kin application draft · v0.2.1

This portable Agent Plugins package contains a manifest, one owner-intake workflow skill, and an icon. Its two intended public tools are `kin_open_connections` and `kin_explain_privacy`. They open an MCP Apps browser workspace or return public privacy information; neither reads an owner profile nor sends messages or approves introductions.

**Gradia** is the selected publisher; the official uploader offers **Business — Gradia** as the developer identity. The current uploader identity gate has cleared, but no file has been uploaded and the application remains unsubmitted. This does not establish plugin approval. The manifest keeps **Kin contributors** as the open-source author credits while listing Gradia as the developer identity.

This application source differs from the already released GitHub instructions-only draft archive. The released archive and its recorded checksum remain unchanged. A future MCP-connected initial application ZIP must be built from the current metadata after the real endpoint is configured; do not upload the old instructions-only archive as the MCP application. Hosting-charge authorization remains pending.

The repository includes `mcp.template.json` with a deliberately unusable example URL. It is not auto-discovered as an MCP configuration. Configure the real endpoint after deploying and testing the service:

```sh
node plugins/kin/scripts/configure.mjs https://your-kin-host/mcp
```

That creates root `mcp.json` using the portable MCP schema and `streamable-http` transport. No secret belongs in either manifest or ZIP. Root `plugin.json`, `skills/`, `assets/`, and the generated `mcp.json` must stay inside the plugin folder. ZIP this single `kin` folder without sibling files. Without `mcp.json`, this is an instructions-only draft and cannot call Kin tools.

The current OpenAI package format uses portable root `plugin.json` and automatically discovers `skills/` and root `mcp.json`. OpenAI listing settings belong under `extensions.com.openai`. [Official package documentation](https://developers.openai.com/plugins/build/plugins).

This draft has not been installed in ChatGPT, submitted, reviewed, or published. Public MCP submission still requires a working HTTPS service, complete listing URLs, five positive and three negative review cases executed through ChatGPT, and a reviewer-accessible demonstration. The manifest supplies planned expected behavior for every case and initial application release notes; it contains no fabricated execution results. The listing references prototype policy pages that require maintainer review for the final publisher and hosted operation. A demo recording and actual host testing remain release tasks. [Official submission documentation](https://developers.openai.com/plugins/deploy/submission).

A ZIP must contain exactly one supported plugin root. Adding MCP configuration requires the submission's MCP path rather than its skills-only path. [Official archive validation rules](https://developers.openai.com/plugins/deploy/submission-errors).

Follow the [official submission readiness checklist](SUBMISSION-CHECKLIST.md) for the connected service, actual ChatGPT tests, publisher identity, and remaining review evidence.

## Validate and package

The current Gradia v0.2.1 manifest and unchanged MCP template passed the cached Agent Plugins 1.0.0 JSON schemas on 2026-10-07 at 15:38:03.392 UTC using Ajv2020 8.20.0 and ajv-formats 3.0.1 with strict validation enabled. The manifest SHA256 is `c910e1de241ec5b598b7f22a4ccab80d8771d9fec6301df167bdedb0fe653e59`. The [timestamp, hashes, validation options, and limits](../../research/plugin-package-validation.json) distinguish this application source from the unchanged released ZIP. Cached schema bytes match the previously retrieved hashes; no schemas were fetched or packages installed for this check.

The portable schema assigns no semantics to extension namespace contents. Its pass does not validate the `com.openai` listing category, review metadata, live endpoint, or installation in ChatGPT; those require the separate checklist and current submission portal. This validation performed no native or fallback AI Defence scan; `screened` remains `false`, and earlier source-screening evidence is preserved separately. Schema validation is not a security audit. SVG icons are explicitly supported by the official listing rules; this package uses a square 128px icon for both required roles. Dark variants and screenshots are optional.

After the release archive has been preserved, `npm run plugin:package -- --draft` creates an instructions-only ZIP without MCP configuration, review metadata, or publication release notes. It writes `artifacts/kin-plugin-draft.zip`, so running it now would overwrite the local copy of the released archive. For the application, configure the actual HTTPS endpoint and use `npm run plugin:package` to create `artifacts/kin-plugin.zip`. The builder permits only `publication.release_notes` and requires a nonempty string; it also requires safe fallback expectations for the negative review cases.

The allowlisted ZIP includes only one `kin` root, the manifest, skill, icon, license, and optional generated MCP config. It excludes secrets, templates, runtime files, and scripts. Packaging does not validate a live endpoint or establish official approval.
