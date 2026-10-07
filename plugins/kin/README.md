# Kin plugin draft · v0.2.0

This portable Agent Plugins package contains a manifest, one owner-intake workflow skill, and an icon. Its two intended public tools are `kin_open_connections` and `kin_explain_privacy`. They open an MCP Apps browser workspace or return public privacy information; neither reads an owner profile nor sends messages or approves introductions.

The repository includes `mcp.template.json` with a deliberately unusable example URL. It is not auto-discovered as an MCP configuration. Configure the real endpoint after deploying and testing the service:

```sh
node plugins/kin/scripts/configure.mjs https://your-kin-host/mcp
```

That creates root `mcp.json` using the portable MCP schema and `streamable-http` transport. No secret belongs in either manifest or ZIP. Root `plugin.json`, `skills/`, `assets/`, and the generated `mcp.json` must stay inside the plugin folder. ZIP this single `kin` folder without sibling files. Without `mcp.json`, this is an instructions-only draft and cannot call Kin tools.

The current OpenAI package format uses portable root `plugin.json` and automatically discovers `skills/` and root `mcp.json`. OpenAI listing settings belong under `extensions.com.openai`. [Official package documentation](https://developers.openai.com/plugins/build/plugins).

This draft has not been installed in ChatGPT, submitted, reviewed, or published. Public MCP submission requires a working HTTPS service, publisher verification, complete listing URLs including real privacy and terms pages, five positive and three negative review cases (drafted in the manifest, not yet executed through ChatGPT), and a reviewer-accessible demonstration. The listing references the prototype policy pages. They require maintainer review for formal hosted terms. A demo recording and publisher verification remain release tasks; fabricated review results are intentionally absent. [Official submission documentation](https://developers.openai.com/plugins/deploy/submission).

A ZIP must contain exactly one supported plugin root. Adding MCP configuration requires the submission's MCP path rather than its skills-only path. [Official archive validation rules](https://developers.openai.com/plugins/deploy/submission-errors).

Follow the [official submission readiness checklist](SUBMISSION-CHECKLIST.md) for the connected service, actual ChatGPT tests, publisher verification, and remaining review evidence.

## Validate and package

The v0.2.0 portable manifest and MCP template passed the current Agent Plugins 1.0.0 JSON schemas on 2026-10-07 using cached Ajv2020 8.20.0 and ajv-formats 3.0.1 with strict validation enabled. The schemas were retrieved again and matched the checked-in cache byte for byte; [timestamp, version, manifest hash, and limits](../../research/plugin-package-validation.json) are recorded locally. No package installation was needed.

The portable schema assigns no semantics to extension namespace contents. Its pass does not validate the `com.openai` listing category, review metadata, live endpoint, or installation in ChatGPT; those require the separate checklist and current submission portal. Current validation has no Ruflo screening claim: the exact MCP scanner and the previously cached fallback are unavailable, and earlier schema-screening evidence is preserved separately. SVG icons are explicitly supported by the official listing rules; this package uses a square 128px icon for both required roles. Dark variants and screenshots are optional.

Run npm run plugin:package -- --draft for an instructions-only ZIP with no MCP configuration or review metadata, or configure the actual HTTPS endpoint and run npm run plugin:package for a connected draft. The allowlisted ZIP includes only one kin root, the manifest, skill, icon, license, and optional generated MCP config. It excludes secrets, templates, runtime files, and scripts. Packaging does not validate a live endpoint or establish official approval.
