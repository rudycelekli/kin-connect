# Optional AI-assisted intake

The source includes an optional **local-only** intake endpoint. Network policy and human approvals remain deterministic. This is a developer-accessible backend feature; the reviewed browser intake UI is not yet integrated. Filling an API key alone enables no calls.

## Enable deliberately on your own installation

Keep `KIN_PUBLIC_ORIGIN` unset. In your private `.env`, set `KIN_INTAKE_ENABLED=true`, one supported provider key, and the corresponding explicit model identifier:

```dotenv
KIN_INTAKE_ENABLED=true
OPENAI_API_KEY=
KIN_OPENAI_INTAKE_MODEL=
ANTHROPIC_API_KEY=
KIN_ANTHROPIC_INTAKE_MODEL=
```

Supply at least one complete key/model pair; unused pairs can stay blank. Keys and model identifiers are validated at startup. Choose a model available to your own provider account that supports the documented structured-output request. Model access and output quality have not been verified with real credentials. No model is silently selected or downloaded. Never put credentials in `VITE_` variables, browser code, public issues or the plugin ZIP. The existing private `.env` is preserved; the public template lists the new fields.

`npm start` or `npm run dev` loads this configuration. Public relay mode always disables intake, even if the enable flag and keys exist in its environment. The public ChatGPT MCP endpoint cannot call this API or read private owner profiles.

## Explicit selected-text request

An active, reviewed owner profile and the local human browser session are required. `GET /api/intake/providers` returns provider names and the processing scope, without keys. `POST /api/intake/suggestions` accepts only:

```json
{
  "provider": "openai",
  "text": "I want to explore mentorship in technology.",
  "approved": true
}
```

`approved: true` means the human deliberately selected and approved sending that text to the chosen external provider. It is not an agent's authority to approve on the human's behalf. Paired assistant tokens are denied. Foreign/cross-site browser mutations are denied. The API does not automatically read or send the profile, private requirements, chat history, notes, device keys or contacts. Do not include them in the selected text. Recognizable contacts and URLs are rejected before transmission; this pattern filter cannot detect all private or obfuscated information.

The response proposes normalized interest/career labels and clarification questions with provider/model provenance and `reviewRequired: true`. It never saves a profile, changes a hard requirement, verifies a role, discovers peers, grants an introduction or sends a message. Owner review is necessary because schema validation cannot establish truth, semantic fidelity or absence of every sensitive inference. Provider errors, refusals, invalid output and timeouts return sanitized errors; manual intake remains available.

## Bounds and deletion

One intake request can run at a time per local server. At most ten attempts may start in a running-server hour, with a 10-second request/body deadline, 500 output tokens, a 64 KiB response limit, twelve proposed labels and three questions. Failed started attempts count. Restarts reset the in-memory attempt counter; it is **not** a durable financial budget. Provider pricing and usage limits belong to the owner's account and need separate configuration. Fixed official HTTPS endpoints are used, redirects are rejected, and no model tools are exposed.

Pausing, changing or deleting the owner profile during a pending request suppresses its result. Revocation is rechecked after each asynchronous session read. Local deletion cannot recall text already sent to a provider or erase the provider's copy. OpenAI requests set `store: false`; this is not a claim of zero provider retention. Verify the actual provider/account data controls before enabling the feature. Kin does not persist selected text or model suggestions and avoids raw exception text in request logs.

## Verification scope

Mock contract tests check HTTP requests, guards, schema failures, response/refusal handling, streamed size limits, deadline cancellation, key reflection and sanitized errors. HTTP tests check owner-only scope, public/paired denial, budget exhaustion, unchanged profile/consent, pause/deletion and revocation-read races. No real provider calls, charges, model efficacy assessment or provider retention audit occurred in this implementation pass.

Official request/schema references checked during implementation: [OpenAI Responses](https://developers.openai.com/api/reference/python/resources/responses/methods/create), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create), and [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). Local validators enforce constraints omitted from the wire schema for provider compatibility.
