# Contributing to Kin

Thank you for helping agents connect people. Useful first contributions include accessibility fixes, clearer match explanations, locale support, protocol examples, and tests that exercise privacy or policy boundaries.

## Work locally

Use Node.js 22.19+ and npm. Run `npm ci`, `npm run dev`, and `npm run check`. Keep the committed lockfile in sync with dependency changes. Run `npm run demo:agents` when changing negotiation or scoring.

Keep domain policy inside `src/matchmaking/domain`, orchestration in `application`, and external adapters in `infrastructure`. The public bounded-context index exports domain and application APIs; import infrastructure only at the composition root. Read the [ADRs](docs/decisions.md) before changing an invariant.

## Send a change

1. Open an issue describing the concrete behavior and who benefits. For a small fix, a pull request is enough.
2. Create a branch and make the change. Use fictional profiles in tests and screenshots.
3. Run relevant checks. Explain the trigger, resulting behavior, and validation in the pull request.
4. For a change to consent, storage, hard requirements, or federation, include an ADR and update the protocol and privacy documents.

Never add real people's dating profiles, private agent transcripts, credentials, or contact lists to fixtures or issues. Avoid analytics or network calls in the default demo. Keep empty, blocked, declined, paused, and pending states understandable.

Contributions are provided under the repository's MIT license. Respect the [Code of Conduct](CODE_OF_CONDUCT.md). Report sensitive issues through the [security policy](SECURITY.md).
