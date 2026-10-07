# Introduction engine

Kin's deterministic agents check requirements, exchange limited cards, verify common ground, and propose a beginning. They cannot approve for either owner. There is no active model adapter or inferred personality analysis.

## Eligibility before preferences

Every profile is validated. Both owners' age, city, smoking, dating-gender, intention, availability, and pause requirements must pass before a score exists. Invalid profiles and ambiguous duplicate candidate identities are excluded. IDs are normalized before duplicate checks. Low preference scores remain eligible; adding a preference never overrides a hard requirement.

## Reciprocal declared preferences

`assessOpportunity` reports version `kin-opportunity/0.2`, a score, directional owner/peer scores, and each signal's contribution. The score is a product heuristic on a 0–100 scale, not a percentage probability of chemistry, compatibility, or a successful meeting. These weights are uncalibrated hypotheses:

| Signal       | Friendship | Dating | Collaboration |
| ------------ | ---------: | -----: | ------------: |
| Interests    |         40 |     25 |            50 |
| Values       |         25 |     40 |            15 |
| Availability |         20 |     20 |            25 |
| Same city    |         10 |     10 |             5 |
| Energy       |          5 |      5 |             5 |

For interests and values, each person's coverage is the number of shared selections divided by that person's selected list length. Each signal contributes its weight multiplied by the harmonic mean of the two coverages: `2ab / (a + b)`, or zero when both are zero. Contributions are rounded to hundredths and sum to the reported score. Directional scores use each person's own coverage. Swapping roles preserves the overall score.

This rewards focused common ground over simply accumulating labels. It also means broadly interested people can rank lower. Selecting fewer labels can change rankings; this is not an anti-gaming guarantee. Real pilot feedback must evaluate this tradeoff before treating the formula as an improvement in human outcomes.

Availability contributes half its weight for one shared broad window and its full weight for two or more; broader individual availability incurs no penalty. Same-city contributes its weight only when normalized cities match. Energy contributes its full weight for equal selections, half if either selects balanced, and zero otherwise. Shared-list order is not a stated priority and does not affect the score or chosen window. Names, age, gender, bio, private notes, and chat history do not enter soft scoring. Age and dating gender can still enforce declared hard requirements.

Ranking currently orders fictional/local candidate discovery. Live network owners select a public capsule to start negotiation; there is no automatic live-directory ranking using private peer profiles. The stronger common-ground and meeting-plan validation applies to both surfaces.

## Agents verify the complete proposal

Both agents compute the complete semantic intersection of declared interests and values. Omitting a real shared label or inventing one rejects the proposal. The selected window must be shared. Each agent independently derives the plan from negotiated facts. When both owners permit different cities, the plan starts with a short online conversation and asks them to choose the channel after mutual approval. Same-city suggestions retain public-place beginnings.

Offer IDs cannot restart active or rejected conversations, including IDs padded with whitespace. Rejection retains a minimal ID/peer/intention tombstone for the agent's lifetime, discarding the rejected card and window. This is in-memory replay protection, not a durable cross-session replay database.

Wire fields remain `kin/0.1`. Updated different-city meeting text needs updated peers on both sides; an older agent may reject it. Do not infer universal old-client interoperability from the unchanged envelope version. No agent can grant consent or open human chat.

Refreshing fictional/local discovery replaces only unreviewed suggestions with neither approval. Pending, connected, declined, and blocked proposals preserve their existing facts and decisions. A pending proposal can therefore retain a historical score until it is resolved.

## Reproduce the evaluation

```sh
npm run check
npm run benchmark:engine
npm run test:e2e -- --workers=2
```

The benchmark runs 12 curated synthetic scenarios across three intentions: ranking counterexamples, symmetry, list order, hard gates, sparse overlap, remote plans, consent boundaries, duplicate identities, and private-note exclusion. Six deliberately constructed examples compare the new ordering with the frozen previous formula. This comparison is not an unbiased evaluation of human matchmaking. Local timing excludes HTTP, encryption, storage, browser rendering, and ChatGPT.

The [recorded synthetic report](../research/engine-benchmark-2026-10-07.json) describes its environment and limits. CI runs the benchmark on source changes. For human testing, use the [voluntary pilot guide](pilot-testing.md): useful explanations and beginnings, consent comprehension, and optional outcomes require observation, not a score claim. The next ranking experiment should use held-out scenarios and voluntary reviewed feedback without collecting private conversations by default.

The browser suite waits independently for the frontend and relay health endpoint. Each run starts its own relay with a unique ignored `artifacts/playwright-relay-*` storage directory. It refuses to reuse an existing relay so pairing, deletion, and network tests cannot modify a personal local server. Stop a server occupying port 4318 before running the suite; do not remove its data lock to make a test start.
