# Reviewer walkthrough

[Watch the 157-second MP4](https://github.com/rudycelekli/kin-connect/releases/download/v0.2.1/kin-reviewer-walkthrough-2026-10-08.mp4) · [Caption transcript](https://github.com/rudycelekli/kin-connect/releases/download/v0.2.1/kin-reviewer-walkthrough-2026-10-08.txt) · [Verification record](../research/reviewer-walkthrough-verification-2026-10-08.json)

Captured on 2026-10-08 from source `7e1876b`: 17 actual browser screens stitched with captions and scope cards. This is a browser walkthrough with fictional adult profiles on an isolated loopback relay, not a ChatGPT host recording or completed model-selection evaluation. No human conversation, microphone, credentials, owner history or outside contact was recorded. No generative video or reconstructed app screens are used.

The flow shows owner-entered intake and review, separate capsule publication, two independent browser-origin identities, encrypted deterministic agent negotiation, chat locked after one signed approval, an empty chat composer after both approvals, private alias saving, blocking and signed leave. Both sample identities left; the relay then contained no registrations, conversations, packets or blocks. Direct SDK calls to both public tools at the owned HTTPS endpoint succeeded separately. Five positive and three negative ChatGPT host cases remain unexecuted.

The initial alternate-port cross-origin attempt was blocked by the application CSP, which permits only port 4318 for cross-origin loopback connections. Both test browsers then used their own same-origin address for one server on port 4329. The recording does not establish alternate-port cross-origin support.

The MP4 is a new documentation asset on the existing v0.2.1 release. It does not change that release's installer, original draft ZIP or checksums. The plugin-only manifest v0.2.3 references the recording through `extensions.com.openai.review.demo_recording_url`; runtime/package.json remains v0.2.1. Uploaded video bytes were fetched without authentication and matched the original SHA256.

Device keys remain plaintext local browser storage; relay metadata is visible. Kin has no verified human identity/age, forward secrecy or independent audit. Actual host behavior, operator policies, 18+ directory eligibility and final compliance attestations remain separate gates. The walkthrough does not claim official submission, approval or production capacity.

Local source evidence and rendering inputs are under the ignored `artifacts/reviewer-walkthrough-2026-10-08/` directory. Re-render with its `render.py`; the renderer uses FFmpeg/H.264, captions and the original unmodified screen captures. Never replace fictional capture inputs with private human conversations.
