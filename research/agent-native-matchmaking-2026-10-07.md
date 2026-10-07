# Agent-native matchmaking: implementation research draft

Date: 2026-10-07. Depth: standard. Status: done within the scoped questions below; this is not an exhaustive market survey. This draft has not been accepted for persistent Ruflo research memory.

## Executive summary

There is credible prior art for AI-mediated introductions, profile-assisted dating, and logistics-led friendship matching. Kin's useful starting point is an inspectable open-source policy-agent reference: both owners' hard requirements gate a proposal, the conversation explains its reasoning, and the people authorize the introduction. A live network and viral adoption remain future work requiring validation.

## Scope

1. What should an agent-to-agent protocol contribute, and what must the matchmaking application still enforce?
2. What privacy and owner-consent boundaries should the first implementation use?
3. Which existing products establish prior art and shape honest positioning?
4. What is a practical, consent-safe cold-start and sharing strategy?

## Findings and evidence

**High — Agent interoperability and owner consent are separate concerns.** The current official A2A specification provides discovery metadata, security schemes, task workflows, and scoped authorization. Its security section assigns authorization boundaries to each implementation and calls for access checks before querying resources. Inference for Kin: a transport adapter does not authorize a personal introduction; the application still needs independent actor authorization and proposal-specific consent. Kin currently uses a custom `kin/0.1` local flow and explicitly disclaims conformance. [Official A2A specification](https://a2a-protocol.org/latest/specification/).

**High — Data minimization is an explicit privacy design principle.** ICO guidance describes collecting enough information for a defined purpose while limiting unnecessary data, and periodically reviewing what is retained. The page says its guidance is under review, so this is a design reference rather than a deployment-specific legal conclusion. Inference for Kin: start with reviewed, structured owner input; avoid exact coordinates, contact imports, and hidden sensitive inferences; provide export and deletion. [ICO data minimization guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/).

**High for product positioning, unverified for efficacy — Close AI introduction prior art exists.** Boardy's own website describes collecting outcome context, checking relevance, and making an introduction after both sides opt in. Its AI-assistant entry flow also requires owner approval of the email before sending. These are self-described behaviors, not independent evidence of success. Kin cannot honestly claim to be the first agent to connect people. [Boardy](https://www.boardy.ai/), [Boardy's assistant entry flow](https://www.boardy.ai/muse).

**High for disclosed collection, unverified for matching quality — AI-assisted dating also exists.** Sitch's own privacy policy describes a dating service and chatbot, detailed preference collection, and personalization through AI and other models. It identifies the possibility of sensitive information in profile data. Inference for Kin: collecting more personal context is not by itself a defensible advantage; explain the policy and disclosure boundaries instead. [Sitch privacy policy](https://content.sitch.net/privacy-policy/).

**High for stated workflow, Medium for Kin's cold-start inference — Logistics constrain the useful matching pool.** Timeleft describes filtering by city, date, and event format before constructing a small group from profile compatibility. It also explicitly says its matching cannot guarantee friendship or chemistry. Inference for Kin: start a real pilot with one community, one intention, and compatible windows; measure wanted and attended introductions before expanding. [Timeleft matching explanation](https://www.timeleft.com/blog/how-timeleft-matches-you/).

**Low — A generic invitation may support organic sharing.** A share action with project copy and no profile details offers a low-friction invitation without exposing another person. Whether it converts recipients into participants is an untested product hypothesis. No evidence found establishes that Kin will become viral; the launch plan is an experiment, not a forecast.

## Cross-reference and implementation consequence

Boardy and Sitch validate that the category is already populated, while Timeleft demonstrates that scheduling and context can matter as much as a compatibility narrative. Their first-party claims do not establish independent efficacy. A2A addresses agent communication; it does not replace the owner policy gate. Privacy guidance supports collecting purposeful structured inputs, while competitor disclosures show why a detailed personal profile deserves careful handling.

The local repository implements separate deterministic policy-agent instances exchanging strict JSON, fictional peers, bilateral requirements, readable generated transcripts, separate owner/simulated-peer approval, a scoped owner-assistant MCP connection, and plaintext local session persistence. A separate static build runs the same fictional matching in the browser with localStorage and no remote profile API. It does not implement authenticated remote peer decisions, federation, built-in LLM calls, encrypted storage, or calendar/email actions. These boundaries are documented in the accepted ADRs and roadmap.

## Remaining questions

- Do people find an agent's explanation more useful than direct profile browsing?
- Which intake fields materially improve useful reciprocal introductions?
- How should persistent blocks, revocation, expiry, and consent receipts work across communities?
- What versioned protocol and identity model can a future adapter reliably support?
- What moderation and age-assurance approach is appropriate to an actual deployment?
- Does a generic invite outperform a conventional community event invitation?

## Recommended next steps

Ship the inspectable fictional demo and invite developers to run the same domain protocol. Before a real participant pilot, implement authenticated two-owner decisions and the roadmap's privacy, retention, abuse-handling, and security milestones. Start with one voluntary local cohort and measure usefulness, two-sided acceptance, attendance, complaints, and deletion completion. Keep all public connection stories separately opted in.

## Run record and limits

The requested Ruflo-core memory and `aidefence_scan` MCP tools were not available. Every web batch was screened with the cached Claude Flow built-in AIDefence engine before retaining findings; one batch's public example emails were redacted and rescanned. This basic regex engine is not a full injection detector, and the exact skill MCP screening contract was not fulfilled, so the [run record](run-record.json) honestly uses `screened: false`. Scan summaries contain hashes and outcomes, not fetched text.

The configured cap was USD 2; tool spend was not measurable and is recorded as `null`. Four bounded web batches covered all four questions. No research memory or reusable pattern namespace was written. The active-run marker was removed after synthesis. The report and record are local draft files awaiting review; the invoked deep-research skill requires acceptance before future research-memory storage.

## Implementation update after this research snapshot

The scoped web findings remain prior-art and design evidence, not a deployment claim. Subsequent implementation added a distinct real two-owner network: browser-local intake and private keys, signed public registration bindings, client-generated registration epochs, encrypted policy-agent negotiation, both owners' signed approval receipts, and encrypted in-app chat. The fictional Connections view remains a separate reproducible example. See ADR-0007 and the current privacy/protocol docs. No independent audit, forward secrecy, person identity assurance, managed-service scale, A2A conformance, or guaranteed virality is claimed.
