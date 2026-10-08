# Connection conversations and owner-controlled personalization

Kin's existing MCP Apps resource contains the full private workspace, including encrypted human chat. Two people can each use their own Kin panel inside a compatible host and communicate through Kin's relay after both signed approvals verify. This does not join their native ChatGPT conversations. Actual Kin installation, rendering, storage and two-owner flows inside ChatGPT or Claude remain unverified; the previous ChatGPT installation attempt was denied by workspace permissions.

## Confirmed privacy requirement — 2026-10-08

Do not implement conversation recording, persistent plaintext conversation archives, audio/video recordings, transcription or automatic analysis/training on conversations. The owner explicitly prioritizes privacy over recording. Future live calling must operate without recording. Learning uses only separately volunteered owner reflections and reviewed preference changes, not captured conversations. Sharing contact information remains a separate deliberate choice.

Existing plaintext chat lives only in active page memory. Temporary encrypted relay delivery queues and hosting metadata still follow their documented retention; this requirement is not a claim that no ciphertext, recipient copy or infrastructure metadata exists. An owner who deliberately sends a reflection to their own AI is choosing separate provider processing, not granting access to the underlying conversation.

## Three separate conversations

1. Policy agents exchange the limited matching card through the encrypted network. They cannot approve for humans.
2. Both humans independently approve, then can chat inside the Kin panel. Plaintext chat is not sent through the host/model bridge.
3. An owner may separately choose to reflect with their own AI. Only the exact summary they approve should enter that AI conversation; its provider's processing practices apply.

The implementation keeps those boundaries separate. Public MCP tools cannot read chat, approve, or send messages. Opening the widget grants no additional disclosure. See [embedded workspace](embedded-workspace.md) and [privacy](privacy-and-consent.md).

## A deliberate "share more" preparation seam

`src/network/disclosure.ts` adds a pure service, without browser controls yet:

- `verifyDisclosureConnection` verifies both registration proofs and signed owner approvals and issues an opaque in-memory capability. A `connected` label or boolean cannot replace the signatures.
- `createDisclosureDraft` accepts only explicitly selected fields: display name, email, international phone number, restricted HTTPS link or bounded information. It reads no profile, contacts or transcript. Normalized values are visible in the exact preview.
- `prepareDisclosureMessage` requires explicit approval of that exact preview and a fresh trusted runtime context. It binds the conversation, owner/recipient, registration epochs and keys, rechecks blocks/revocation/expiry, and consumes the preview once. It returns plaintext and the existing chat envelope; it does not encrypt or send.

The host must supply authoritative current runtime state and retain the existing encryption, signed transport and final local-revocation guard. Previews expire within five minutes, cannot be restored from JSON and cannot authorize a new registration. Preparation is not transmission or guaranteed delivery. The owner is sharing their own selected information, not granting access to anyone else's information. Existing human text chat remains owner-authored and can already contain information the author chooses to disclose.

Information received by another person cannot be recalled from their memory, screenshots, exports or copies. Blocking can stop future Kin exchanges, but must not be labeled "unshare" or "erase everywhere." Links remain plain text until a separately safe UI interaction; these services never fetch them.

## Private reflection with one's own AI

`src/owner-reflection.ts` prepares a strict selected-enum self-reflection with no peer aliases, identifiers, dates, notes, free text or transcripts. It distinguishes fictional demo feedback from voluntary live self-report and does not claim an independently verified outcome. A frozen, in-memory preview must be explicitly approved in exact form within five minutes. Successful approval produces one frozen shared-MCP Apps `ui/message` argument and consumes the preview. The deadline governs approval, not subsequent delivery: host code must send immediately after review, without queueing or silently retrying. Nothing is sent or stored automatically.

Browser integration must feature-detect the connected host's text-message capability and let the owner choose **Send this summary to my AI** after preview. Use the shared `App.sendMessage` API. A host rejection (`isError`), timeout or lost connection must remain visible. Do not automatically retry an uncertain delivery; offer a deliberate new preview or manual-copy fallback. Saving a selected self-report, aggregate sharing and sending a selected summary to an AI need separate approval controls; none authorizes recording a conversation. The existing aggregate `shareApproved` flag grants no AI-disclosure permission.

This source helper is not wired into `widget-host.ts` or the browser. The current host bridge continues to exchange layout events only. The [MCP Apps message contract](https://apps.extensions.modelcontextprotocol.io/api/interfaces/app.McpUiMessageRequest.html) sends to the owner's host conversation; it is not a person-to-person chat transport. [OpenAI's bridge reference](https://developers.openai.com/plugins/reference) recommends the shared APIs when available.

## Reviewed local personalization

`src/network/personalization.ts` offers a deterministic, explicit preference path:

1. Propose preferred and less-preferred interest labels for one intention.
2. The owner reviews and approves that exact proposal.
3. Re-rank the existing capsule shortlist with a bounded adjustment of at most plus/minus ten relevance points, showing the original score and actual clamped contribution.

Inputs remain normalized, disjoint and bounded to twelve priorities total. Peer declarations and the eligible shortlist set remain intact. Authentication is still upstream. This changes ordering within the capped shortlist, not which people are retrieved from the whole directory. It cannot override blocks, private bilateral requirements or either person's approval. Omit preferences to reset to baseline. The approval literal is a caller action boundary, not cryptographic evidence of a human decision.

There is no automatic chat analysis, feedback-to-preference inference, sensitive-trait inference, peer reputation score, persistent preference vault or global model training. An AI may help the owner articulate preferences after a separately approved summary, but proposed changes must still be reviewed and strictly validated. Cross-device synchronization and secure owner recovery remain separate work. Effectiveness and personalization improvement are unmeasured.

## Human audio

Audio is not implemented. Kin currently requests no microphone resource permission and sends `Permissions-Policy: microphone=()` on its own pages. Future calling needs authenticated call invitation/acceptance, individual microphone permission, narrowly reviewed resource/header changes, call signaling, WebRTC connectivity and relay infrastructure, expiration and block/disconnect cleanup. Host permissions may be denied; declaring a permission does not guarantee it. [MCP Apps microphone permission](https://apps.extensions.modelcontextprotocol.io/api/interfaces/app.McpUiResourcePermissions.html).

Do not implement recording, transcription or automatic model forwarding. Microphone/call approval authorizes live calling only. Human WebRTC calling and talking to an AI through an audio API are separate features. Neither the embedded resource nor existing encrypted text chat establishes audio compatibility, metadata privacy or end-to-end call security. No microphone/header changes or live calls occurred in this pass.

## Host and release checks still required

Before announcing these new user flows, integrate the controls, test two actual owners in the intended host, verify sandbox storage/Web Crypto/CORS and feedback capability behavior, and test decline, block, expiry, deletion and interrupted disclosure. Run independent security review and voluntary outcome evaluations. Current [OpenAI plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines) require general-audience suitability and describe mature 18+ support as forthcoming; Kin's adult/dating submission eligibility remains unresolved. Do not change standalone adult safeguards merely to assume eligibility.

Tests use synthetic keys, controlled clocks and pure helper inputs. They establish contract behavior, not actual host rendering, human consent, audio operation or better human outcomes.
