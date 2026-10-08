# Capsule discovery and voluntary feedback

These source APIs prepare the next reviewed browser flow; they do not currently add automatic discovery or feedback controls to the live UI.

## A privacy-scoped shortlist

`shortlistCapsules` is a pure local relevance service over the owner's selected labels and peer public capsules. Authenticate peers with the existing directory/identity verification before calling it. It excludes self, blocks, conflicting duplicate identities, malformed capsules/registration epochs and wrong intentions. It accepts at most 200 peers, matching the relay cap, and returns at most ten suggestions. Alias and purpose are not ranking inputs; private peer profiles, age, gender, notes and history are not read.

Topical relevance uses reciprocal declared coverage. Collaboration with recognized career goals splits the capsule relevance budget equally between topics and complementary career goals. This is separate from the private opportunity score: it has no values, availability, city or energy inputs. Both formulas are product hypotheses. Empty public labels retain a zero-evidence candidate, rather than inventing fit. A low score is not a policy rejection.

A shortlist cannot verify signatures by itself, pass either person's private requirements, grant consent or initiate a conversation. Its score label explicitly states that limitation. The host flow must ask the owner to choose, run the existing encrypted bilateral checks, and obtain two fresh signed human approvals. No background worker, automatic invitations, semantic embedding service or new directory field is introduced.

## One coherent introduction

The updated domain brief can derive facts directly from the policy agent's agreed proposal. It validates the complete genuine shared intersection, mutual intention/window and exact canonical meeting plan. Career reasons and optional questions reflect the owner's declared goal. The plan stays the same on both sides; the brief does not replace it with a conflicting generic exercise. Unknown, unready or rejected agent stages cannot supply a briefing. Host code must additionally honor relay/local human decline and block state, as the existing network UI does.

Local discovery/MCP results now include this optional structured `introduction` alongside the historical score, reasons and plan. The browser's unified presentation remains pending UX integration.

## Minimal voluntary outcome evidence

`pilot-feedback.ts` accepts only explicit-consent self-reports: intention, whether a meeting happened, usefulness, comfort and whether aggregate sharing is approved. It records no names, peer IDs, conversation IDs, notes or transcripts. Usefulness cannot be recorded before a self-reported meeting. All data stays in the supplied local storage; the module has no network calls. Keep storage failures visible rather than silently replacing malformed evidence.

The local vault keeps the newest 50 records until deletion; there is no automatic time expiry. Export includes only separately approved live-owner records, grouped by intention. Fictional demo responses are excluded. Individual IDs and dates are excluded from the aggregate. Small counts can still reveal information; share only when the owner chooses. Repeated responses and self-selected/unverified meetings cannot establish unique people, population effectiveness, safety or a 100x improvement. No actual volunteer results have been collected.

This is an evaluation seam, not learned ranking or model training. Before promoting a later algorithm, establish metrics and protected holdouts independent of development scenarios and compare with the owner-selected baseline. Record adverse experiences and deletion completion, not just approvals. See the [pilot guide](pilot-testing.md).

## Explicit owner preferences and AI reflection

The source now also provides reviewed topic priorities that re-order the existing capsule shortlist, plus a separately approved selected-enum reflection payload for the owner's AI. These are pure, unintegrated contracts. Feedback never automatically becomes preferences or training; aggregate sharing grants no AI disclosure permission. See [connection conversations](connection-conversations.md).
