# Rewind — Handoff

State of the `claude/new-session-vjm8nn` branch, for whoever continues the work. The README describes the features for users; this document records the state, the decisions behind it, and how to verify it.

## Baseline and scope

Started from `3caa854 feat: enrich HTTP capture metadata` (9 test files, 45 tests). The branch implements the Master Specification's roadmap as vertical slices, each tested, built and verified at runtime before the next:

| Spec phase | Commit(s) |
| --- | --- |
| 1 Correlation | `3e40014` correlation IDs, W3C traceparent |
| 2 Execution identity | `e850091` executions, parent events |
| 3 Event graph | `4231d68` edges, tree, failure origin |
| 4 Failure fingerprints | `eecf1aa` |
| 5 Replay Lab | `dc9b3d7` experiments and mutations |
| 6 Execution diff | `9a928a6`; invariants in `06b13d1` |
| 7 Dependency recording | `d22411f` rewindFetch; `e477e0e` replay from recordings |
| 8 Reproduction capsules | `a582a01` |
| 9 CI verification | `b8a2cf2` (`npm run verify`) |
| 10 Investigation (read-only first) | `1d71b9e`, rule-based, no model calls |
| Acceptance: tests linked to executions | `8bca603` |

Fixes found during runtime verification: `24752be` (concurrent migrations during `next build`), `4539a9b` (timeline prerendered at build time), `c96d3d1` (execution status = root outcome), `d6d2ac8` (replays kept out of failure history).

## Interface redesign

After the engine work, the dashboard was rebuilt following the "Rewind Interface Plan" (four phases, with the recommended option taken for each open decision: Radix primitives with our own styling, Overview as home, keep and upgrade the tree and waterfall, blue accent with orange only for "recording", tokens first and light theme later, SSE, CodeMirror 6).

| Phase | Commit(s) |
| --- | --- |
| A Foundation | `b951c58` tokens, Geist, shell, shared components; `a09fd59` every page in the shell, Overview home, events at `/events` |
| B Core workflows | `4a742cd` execution workspace and inspector; `3cc2887` Lab JSON editor, request preview, Lab and Compare index pages; `11ac806` side-by-side diff; `77393e0` failure trend and last known good; `ece4c3f` list restyles |
| C Power | `8c4ad1a` + `d6a841b` command palette and shortcuts; `86f8368` filter language and saved views; `35e359e` live stream and toasts |
| D Platform | `0739761` settings, light theme, density; `0c1296e` setup checklist; `977a21f` GitHub job summary for `npm run verify`; `94651c4` incidents |

Fixes along the way: `02a5e2d` (the test suite wrote into `data/rewind.db`; it now uses a per-run temporary database through `REWIND_DB_PATH`), `5922a0a` (capsule page overflow on phones).

Now: 33 test files, 396 tests; `npm run build` passes; lint shows only the 7 pre-existing `no-explicit-any` errors in `src/app/api/events/route.ts`. Every page returns 200 with no console errors and no horizontal scroll at 1440px and 390px.

## Decisions worth knowing

- **Execution status is the root event's outcome.** A handled child failure (e.g. a dependency timeout the app recovered from) stays in the graph but does not fail the execution. Before the root arrives, any error marks the execution failed provisionally (children are stored before their root).
- **Root event IDs are pre-assigned** by `withRewindCapture`, so children can reference a parent that is not stored yet. `POST /api/events` accepts client IDs matching `evt_[A-Za-z0-9_-]` (400 otherwise, 409 on duplicates).
- **Execution context uses `AsyncLocalStorage`** (`src/lib/execution-context.ts`). `rewind.capture` inherits the execution and parent from it; pass `null` to opt out.
- **Failure origin** is the earliest error event with no failing descendants, not the earliest error.
- **Replays are safe by default.** Replays pre-assign their execution ID (`x-rewind-replay-id` + `x-rewind-execution-id`, honoured only when well-formed) and default to `recorded` dependency mode: calls answer from the original execution's recording; unrecorded calls are blocked, never sent live. If the target cannot load the replay plan, every dependency is blocked.
- **Replays never count as real failures.** An execution is a replay if a stored replay points at it or its root request carried `x-rewind-replay-id`.
- **Migrations are additive and idempotent** (`src/lib/db-migrations.ts`), run at startup inside an IMMEDIATE transaction. Never delete `data/rewind.db`.
- **Capsule format v1** is identified by a SHA-256 digest over canonical JSON. `invariants` is an optional v1 field, so capsules exported before invariants still validate.
- **Design tokens are the only colors.** `src/app/globals.css` defines roles (canvas, panel, ink, muted, accent, failure…) for dark (default) and light; components use them through Tailwind (`bg-panel`, `text-muted`). Base element styles live in `@layer base` so utilities can override them.
- **Settings only add redaction.** Extra headers and fields are redacted on ingest in `POST /api/events`; they cannot weaken the built-in rules. `live` can never be the default dependency mode.
- **Per-browser preferences** (theme, density, saved views, dismissed checklist) use `localStorage` behind try/catch; everything shared lives in SQLite.
- **Tests that change shared rows run in a rolled-back transaction** (settings, incidents, onboarding), because test files run in parallel on one database.
- **Investigation is deterministic.** It cites evidence and tests hypotheses through replays; an LLM could narrate or propose hypotheses later, but nothing currently calls a model.

## Verifying locally

```bash
npm test
npm run build
npx eslint src tests      # expect only the 7 pre-existing errors
```

The most useful runtime check is Rewind recording a *separate* app:

1. Start Rewind with replays pointed at the app: `REWIND_REPLAY_BASE_URL=http://localhost:4000 npm start`.
2. Run a small Node server on `:4000` whose handler is wrapped with `withRewindCapture` and calls a fake dependency on `:4001` through `rewindFetch`.
3. Capture a failure, then use Replay Lab, the diff, capsule export/import and `npm run verify -- <capsule> --target http://localhost:4000` against a buggy and a fixed version of the handler. Count calls on the fake dependency to confirm replays do not repeat side effects.

## Known limitations and follow-ups

- **`src/app/page.tsx` was rewritten** as the Overview (rendered at request time). The previous events table moved, intact, to `/events`; local edits made to the old `page.tsx` need re-applying there.
- **Not done from the interface plan:** retention (deleting old data is destructive and needs its own design) and packaging the SDK as `@rewind/next` (the capture code still imports through the `@/` alias).
- **The live stream polls** SQLite once a second per open dashboard. Fine for a local tool; a shared deployment would want a single poller that fans out.
- **Generated tests target `http://localhost:3000`** (existing behaviour, pinned by tests). Making the base URL configurable would let them run against the app under test.
- **Cross-service propagation:** executions are per process; outgoing `rewindFetch` calls do not yet propagate `traceparent` or execution IDs, so the event graph has no inferred cross-service edges.
- **Dependency recording covers HTTP only.** Databases, Redis and queues are next in the spec.
- **Docker** was not verified in this environment (no Docker daemon); no Docker files changed.
