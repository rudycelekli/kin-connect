# Check an approved Kin deployment

Run this read-only preflight after an operator has configured an actual shared HTTPS origin, built assets, persistent relay storage, and permitted client origins. The authorized Railway pilot at `https://kin-relay-production.up.railway.app` uses one writer and a persistent `/data` volume. All 12 [public server-contract checks](../research/hosted-service-verification-2026-10-07.json) passed at 2026-10-07 16:35:16.397 UTC for the Pages origin `https://rudycelekli.github.io`. This is observed server evidence, not actual ChatGPT UI or human-pilot testing. The command needs the repository's existing development dependencies, including the real MCP client SDK.

This command and the more explicit privacy-tool response are in current source after the published v0.2.1 archive. Build the deployment from the reviewed source revision. The release archive and its recorded installer results remain unchanged; an older public server can fail the stricter privacy-response check.

From the Kin repository, use the operator's actual **exact HTTPS origin** with no trailing slash, credentials, path, query, or fragment. `--origin` optionally supplies the exact client origin that should be allowed by MCP and relay CORS. It tests that one origin; omitting it tests the deployment's own origin. The example below uses shell variables containing the actual deployment/client origins, which can refer to the tested pilot above:

```sh
npm run check:deployment -- --url "$KIN_PUBLIC_ORIGIN" --origin "$KIN_CLIENT_ORIGIN" --output kin-deployment-check.json
```

If no separate client origin is relevant, omit `--origin`. Node.js 22.19+ is required. Invalid input exits **2**; a failed contract or report write exits **1**; passing checks exit **0**. Reports go to stdout and, if requested, the output file. Do not use `--allow-local` to qualify a public deployment.

The command checks:

- Public app and relay health report the expected protocols and public mode.
- Owner session/profile/export GETs return 403 and issue no cookies. It does not read their response bodies.
- MCP preflight allows the tested origin exactly and exposes the required protocol headers.
- The actual SDK initializes, lists exactly `kin_open_connections` and `kin_explain_privacy`, and checks empty inputs and read-only annotations before calling either tool.
- The privacy response includes plaintext browser-held keys, visible decision metadata, bilateral consent, absent person verification, absent forward secrecy, and the unaudited status. The opener returns only the public workspace/consent structure.
- The HTML app resource declares the same origin and CSP domains, sets the widget/relay markers, and references nonempty public JavaScript and CSS assets actually served with appropriate MIME types and CORS.

Requests stay on the declared origin and reject redirects. Each request has a ten-second timeout, with a sixty-second deadline for network requests overall; bodies are capped at 2 MiB, and at most 20 build asset references are allowed. This conservative bound may require review if future builds grow. Errors contain fixed check codes rather than server bodies, SDK errors, cookies, profiles, keys, or tokens. The report contains the supplied public origins and operational pass/fail metadata.

The only POSTs are public MCP initialization and read-only tool/resource requests with empty tool inputs. The command supplies no owner credentials and never joins a relay, requests a signing challenge, generates owner keys, approves, sends messages, deletes records, or fetches the domain-verification token. Ordinary access logs and rate-limit counters may still change.

For an isolated fixture only, `--allow-local` permits an exact loopback HTTP origin. The fixture must still report **public-relay** mode and block owner APIs. Reports are marked `fixtureMode:true`; a local launcher with its normal local owner APIs should fail. Placeholder `.invalid` origins remain rejected.

Reproduce the five fixture regressions from the repository with `node --import tsx --test test/deployment-check.test.ts`. They cover a valid server, exposed private data/cookies, redirects, missing assets, and invalid origins. Passing fixtures validates the checker; it does not test an actual deployed HTTPS service.

Passing establishes the observed **server contract only**. It does not execute a ChatGPT or Claude iframe, check actual host storage/Web Crypto/mobile behavior, run a human trial, audit cryptography, measure capacity, verify a publisher, or submit/approve the plugin. Follow the [first private ChatGPT test](chatgpt-first-test.md), [embedded workspace checks](embedded-workspace.md), and [submission checklist](../plugins/kin/SUBMISSION-CHECKLIST.md) separately. Retain the report with the deployment version/commit and operator's test notes before inviting voluntary testers.
