# Changelog

All notable changes to Rewind. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-09-24

Rewind now reproduces failures, not just records them, and has a new interface.

### Added

- **Executions and the event graph.** Every request becomes an execution: a tree of everything it caused, with timing, the point where the failure started, and the path to it. Correlation IDs and W3C `traceparent` are captured.
- **Failure fingerprints.** Failures are grouped by root cause, with a 14-day trend and the last known good run of the same endpoint.
- **Dependency recording.** `rewindFetch` records outgoing calls, and replays answer from the recording by default, so payments and emails are never repeated.
- **Replay Lab.** Replay a captured request with changes (payload, headers, query, dependency responses), edit the payload as JSON, and preview the request before sending it.
- **Execution diff.** Compare any two executions as aligned side-by-side trees, with a verdict (fixed, regressed, still failing…) and where behaviour first diverged.
- **Invariants.** Rules every execution must satisfy, suggested from real behaviour.
- **Reproduction capsules.** Export a failure as one verified file, and import it on another machine. Capsules are scanned for secrets.
- **CI verification.** `npm run verify` replays recorded failures against a build. It writes a GitHub job summary and annotations.
- **Investigation.** Evidence-based hypotheses for a failure, tested by replays.
- **Incidents.** Group executions behind one problem, with notes and a status.
- **New interface.**
  - An Overview home page.
  - Every execution becomes a workspace with tabs and an event inspector.
  - A `⌘K` command palette and keyboard shortcuts.
  - A filter language for executions, with saved views.
  - Live updates, with toasts for new failures.
  - Light and dark themes, and compact density.
  - A setup checklist.
- **Settings.**
  - Extra redaction rules (these can only add redaction).
  - The default dependency mode for replays.
  - A storage overview.
- **Optional access control** with `REWIND_ACCESS_TOKEN`: a sign-in page, bearer tokens for clients, and rate limiting of failed attempts.
- **Operations.**
  - `GET /api/health`.
  - A Docker health check.
  - The running version in the sidebar.
  - `REWIND_DB_PATH` to choose where the database lives.
- **Continuous integration.** Lint, typecheck, tests, build and a Docker image check run on every pull request. Pushing a version tag publishes the release.

### Changed

- The home page is now the Overview; the raw events table moved to `/events`.
- The README is a short guide; the full reference moved to [`docs/REFERENCE.md`](docs/REFERENCE.md).

### Fixed

- Pages that read SQLite rendered at build time and showed stale data.
- The test suite wrote into `data/rewind.db`; it now uses a temporary database.
- API routes returned 500 for malformed JSON, leaked internal error messages, and read request bodies of any size.
- Several dashboard controls did nothing; they were removed.

### Security

- Credential headers, cookies, API keys, tokens, passwords, card numbers and URL credentials are redacted before storage, including in recorded dependency calls and webhook query strings.
- Replays only ever target localhost.
- Meets WCAG 2.1 AA: an axe audit reports no violations on any page in either theme.
- Next.js telemetry is disabled in Docker, and instances ask search engines not to index them.

## [0.1.0]

First release: event capture over HTTP and webhooks, an events dashboard and timeline, replay of captured requests to a local target, response comparison, and generated regression tests (Playwright and Vitest).

[0.2.0]: https://github.com/theanwerfaiz/rewind/releases/tag/v0.2.0
[0.1.0]: https://github.com/theanwerfaiz/rewind/commits/main
