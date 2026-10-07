# Open-source matching software: source review

Reviewed 2026-10-07. This is a bounded review of four projects, not an exhaustive survey or a dependency decision. No third-party matching code was adopted, installed, or executed. Repository existence, declared licensing, and inspected behavior have strong primary-source support; maintenance confidence is inferred from activity; interpersonal effectiveness is unestablished by this review.

A recent, inspectable dating-platform implementation exists in Solumati. That does not establish a mature dating engine or validated prediction of attraction. Gorse, Open Match 2, and `matching` address different technical problems. None of the reviewed sources establishes that its scores predict a wanted introduction, friendship, or relationship success.

## Comparison

| Project                                                         | Actual category                                                     | License inspected   | Useful idea for Kin                                                           | Boundary                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [Gorse](https://github.com/gorse-io/gorse)                      | Generic user/item recommendation service                            | Apache-2.0          | Candidate retrieval and replaceable ranking pipelines                         | Learned recommendations do not implement bilateral owner requirements or introduction consent                         |
| [Open Match 2](https://github.com/googleforgames/open-match2)   | Game matchmaking infrastructure, public preview                     | Apache-2.0          | Ticket lifecycle, queue orchestration, developer-defined match functions      | Scheduling game players is not interpersonal fit; the developer supplies the matching logic                           |
| [daffidwilde/matching](https://github.com/daffidwilde/matching) | Ranked-preference allocation algorithms                             | MIT                 | Test small stable-allocation experiments against explicit reciprocal rankings | Mathematical stability depends on the input model; it does not establish chemistry, permission, or real-world welfare |
| [Solumati](https://github.com/FaserF/Solumati)                  | Full-stack dating-platform beta with weighted questionnaire scoring | AGPL version 3 text | Inspect explainable questionnaire scoring as prior art                        | Beta warning, arbitrary scoring assumptions, no interpersonal outcome validation found in inspected sources           |

A dating UI clone can reproduce profiles, swipes, or screens without supplying a reusable matching algorithm. Solumati was included because its backend scorer was inspected, rather than because it has dating screens. This classification does not imply an audit of its authentication, chat, or deployment.

## Activity snapshot: default branch is the reference

GitHub's repository `pushed_at` includes activity outside the default branch. It must not be presented as the latest merged implementation date. Open issue counts below exclude pull requests and are point-in-time observations, not quality scores.

| Project      | Latest default-branch commit observed                                                                                  | Latest published release returned by API                                        | Repository `pushed_at` | Open issues observed |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------- | -------------------- |
| Gorse        | [2026-10-05, `7bf68e5`](https://github.com/gorse-io/gorse/commit/7bf68e513a35e1a630d9c8bfaa51dd18d1077c76)             | [v0.5.11, 2026-07-14](https://github.com/gorse-io/gorse/releases/tag/v0.5.11)   | 2026-10-05             | 104                  |
| Open Match 2 | [2026-01-05, `ac392a0`](https://github.com/googleforgames/open-match2/commit/ac392a0576ea65a73d17aa07090519efcdba99cd) | None returned by `/releases/latest`                                             | 2026-07-03             | 3                    |
| `matching`   | [2023-10-04, `497602e`](https://github.com/daffidwilde/matching/commit/497602eb746fd21fb51e06b01ce9630499f393e3)       | [1.4.3, 2023-10-04](https://github.com/daffidwilde/matching/releases/tag/1.4.3) | 2025-10-03             | 8                    |
| Solumati     | [2026-07-28, `7cbbc90`](https://github.com/FaserF/Solumati/commit/7cbbc9033681de90fac21f140dde9ddd452645ad)            | None returned by `/releases/latest`                                             | 2026-09-25             | 1                    |

“None returned” means the inspected GitHub endpoint returned no latest non-prerelease release. It does not prove that tags, prereleases, nightly artifacts, or other distribution channels do not exist. All four repositories were unarchived at review time. Activity evidence supports recent work on Gorse and a recent Solumati dependency update; it does not justify calling every project actively maintained in 2026.

The underlying primary metadata endpoints are the GitHub repository, default-branch commit, release, and issue APIs. For example: [Gorse metadata](https://api.github.com/repos/gorse-io/gorse), [Open Match 2 commits](https://api.github.com/repos/googleforgames/open-match2/commits?per_page=1), [`matching` releases](https://api.github.com/repos/daffidwilde/matching/releases/latest), and [Solumati commits](https://api.github.com/repos/FaserF/Solumati/commits?per_page=1). The linked commit IDs pin the source snapshots used below.

## Gorse: a maintained generic ranking service

Gorse imports users, items, and interaction data and trains recommendation models. Its README describes multiple candidate sources, optional embedding/LLM paths, and a master/worker/server deployment with database and cache dependencies. This is useful ranking infrastructure, but importing owner facts or feedback into another service would change Kin's current browser-held disclosure boundary. Any experiment must start with synthetic data and an explicit data-flow design. [Pinned README](https://github.com/gorse-io/gorse/blob/7bf68e513a35e1a630d9c8bfaa51dd18d1077c76/README.md).

The inspected manifest declares Go 1.27.0 and a broad service dependency graph including database, Redis, gRPC, vector, and optional model integrations. It would be an additional service, not a small browser library. Apache-2.0 is present in the license file; transitive dependency and deployment review would still be required before adoption. [Manifest](https://github.com/gorse-io/gorse/blob/7bf68e513a35e1a630d9c8bfaa51dd18d1077c76/go.mod), [license](https://github.com/gorse-io/gorse/blob/7bf68e513a35e1a630d9c8bfaa51dd18d1077c76/LICENSE).

Inspected open reports include a post-migration indexing error and a dashboard secret-redaction complaint. These are reporter claims, not independently reproduced findings. They are concrete reasons to review the selected release and dashboard exposure before trial deployment. [Issue 1359](https://github.com/gorse-io/gorse/issues/1359), [issue 1358](https://github.com/gorse-io/gorse/issues/1358).

## Open Match 2: game queues, not a dating algorithm

The README explicitly describes a public preview of a game matchmaking framework. It provides core APIs, protobuf definitions, and Go clients; users build queueing, assignments, notifications, and their own matchmaking function. Its relevance is orchestration under load, not a ready-made reciprocal human recommender. Tencent/game matchmaking services belong in this same infrastructure category unless a separate human-fit method is demonstrated. No Tencent implementation was evaluated here. [Pinned README](https://github.com/googleforgames/open-match2/blob/ac392a0576ea65a73d17aa07090519efcdba99cd/README.md).

The manifest declares Go 1.24.6, Redis, gRPC/protobuf, and observability dependencies. The source license is Apache-2.0. An independent service and custom adapter would add substantial scope to Kin's current single-process relay. [Manifest](https://github.com/googleforgames/open-match2/blob/ac392a0576ea65a73d17aa07090519efcdba99cd/go.mod), [license](https://github.com/googleforgames/open-match2/blob/ac392a0576ea65a73d17aa07090519efcdba99cd/LICENSE).

The issue sample includes a container-tag discrepancy and a request for documented performance metrics. These support caution about artifact selection and unverified scale claims; they do not establish a benchmark for Kin. [Issue 39](https://github.com/googleforgames/open-match2/issues/39), [issue 13](https://github.com/googleforgames/open-match2/issues/13).

## `matching`: reciprocal rankings with mathematical guarantees

This Python library implements stable marriage, stable roommates, hospital-resident, and student-allocation problems. It consumes explicit preference structures. The Gale–Shapley implementation supports selecting which side's optimal solution is sought; that asymmetry is a product choice, not a neutral measure of compatibility. A stable outcome means the model's ranked-preference condition holds, not that two people will like each other or want to meet. [Pinned README](https://github.com/daffidwilde/matching/blob/497602eb746fd21fb51e06b01ce9630499f393e3/README.md), [algorithm](https://github.com/daffidwilde/matching/blob/497602eb746fd21fb51e06b01ce9630499f393e3/src/matching/algorithms/stable_marriage.py).

The package declares Python >=3.5, NumPy >=1.19.2, and MIT licensing, with optional testing/documentation packages. Its latest default-branch commit and release were in 2023. A 2025 repository push or unarchived status is insufficient evidence of current runtime support. Treat it as an inspectable reference for an offline experiment, not a newly verified production dependency. [Manifest](https://github.com/daffidwilde/matching/blob/497602eb746fd21fb51e06b01ce9630499f393e3/pyproject.toml), [license](https://github.com/daffidwilde/matching/blob/497602eb746fd21fb51e06b01ce9630499f393e3/LICENSE).

An open coverage failure and a 2024 refactor pull request updated in 2025 show unresolved maintenance work. No issues or tests were reproduced locally. [Issue 161](https://github.com/daffidwilde/matching/issues/161), [pull request 174](https://github.com/daffidwilde/matching/pull/174).

## Solumati: recent dating source, unvalidated scoring

Solumati is a full-stack dating/friendship platform. Its README calls the software beta/nightly and advises against production use before a stable release. That disclosure is more relevant than its feature marketing. [Pinned README](https://github.com/FaserF/Solumati/blob/7cbbc9033681de90fac21f140dde9ddd452645ad/README.md).

The inspected `calculate_compatibility` scorer compares equal answers on the intersection of known questions, weights matches using question metadata, and combines 70% weighted answer agreement with 30% intent score. Intent agreement scores 100; disagreement scores 40. Missing comparable answers fall back to 50 for equal intent or 40 for different intent. Thus an intent mismatch reduces rank rather than enforcing an absolute exclusion. The same file also contains guest/test display adjustments. These are implementation facts, not evidence that the weights predict attraction. No outcome-validation study or calibrated probability was found in the inspected files. Kin should not import these weights or describe a questionnaire percentage as chemistry. [Pinned scorer](https://github.com/FaserF/Solumati/blob/7cbbc9033681de90fac21f140dde9ddd452645ad/backend/app/services/match_service.py).

The backend uses FastAPI, SQLAlchemy, Pydantic, and PostgreSQL support; the frontend uses React/Vite. The actual license file contains AGPL version 3 text, although GitHub's metadata classifier returned `NOASSERTION`. Read the file rather than inferring permission from the classifier. Reuse requires a distinct license/dependency review; no compatibility conclusion is made here. [Backend dependencies](https://github.com/FaserF/Solumati/blob/7cbbc9033681de90fac21f140dde9ddd452645ad/backend/requirements.txt), [frontend dependencies](https://github.com/FaserF/Solumati/blob/7cbbc9033681de90fac21f140dde9ddd452645ad/frontend/package.json), [license](https://github.com/FaserF/Solumati/blob/7cbbc9033681de90fac21f140dde9ddd452645ad/LICENSE.md).

Its sole open issue observed was a dependency dashboard, with multiple open dependency-update PRs. This is evidence of update tracking, not proof of production readiness or support capacity. [Dependency dashboard](https://github.com/FaserF/Solumati/issues/5), [example dependency PR](https://github.com/FaserF/Solumati/pull/1030).

## Decision for this release

Keep Kin's existing deterministic bilateral eligibility gates, explainable suggestions, encrypted negotiation, and independent owner approvals. No dependency adoption follows from this research.

A later ranking experiment should use a replaceable interface: eligible candidates in, ordered suggestions with reasons out. It must never bypass hard requirements, public-capsule review, revocation, or two signed owner decisions. A generic recommender may order useful candidates; an allocation algorithm may coordinate a finite cohort; neither authorizes a person to contact another person.

Evaluate ranking against voluntarily reported wanted introductions and useful shared activity. Clicks, message volume, long sessions, an algorithmic score, and mathematical stability are different outcomes. Two-person pilot observations cannot validate predictive chemistry or population-level effectiveness. See [pilot testing](../docs/pilot-testing.md) for the immediate experiment.

## Screening and run limits

This work shares the parent research cap of USD 2. Exact tool spend is unavailable (`spentUsd: null`); no additional paid research service was invoked. The exact Ruflo `aidefence_scan` MCP capability was unavailable, so `screened: false` remains the honest status. No Ruflo memory or reusable pattern storage was written.

The cached `@claude-flow/aidefence` 3.0.3 direct `ThreatDetectionService` was inspected and run with learning disabled on 18 retained source-file/metadata batches. Fifteen returned no regex threat; three were flagged: `matching`'s manifest (public author email and bracket syntax), Solumati's README (development-mode/base64 configuration language), and its scorer (a debug-mode label). These were reviewed as source data, not followed as instructions. No author email, credential value, or raw fetched source was copied into this report. A basic regex result is not comprehensive screening or a software security audit.

Minimized scan hashes: metadata `ef906875d300cc8b`; issue samples `0d71f8cdbbd6da1c`; flagged manifest `c88abbac06a7f6d1`; flagged Solumati README `4742f52e5ae2ec48`; flagged scorer `96be3f69ce14f9d8`. They identify the local scanned snapshots without retaining their contents in a research-memory store. This report is a local review draft for the parent synthesis.
