# Codex handoff: Dashboard threads sidebar (P3-02 UI)

Prepared by fable-5 (Claude Code CLI), 2026-06-12. Branch: `harden-agent-room`.
This is the last P3 ledger item of the v0.2 handoff (`agent-room-v0.2-handoff.html`, entry P3-02,
dashboard bullet). Everything below the UI already exists and is tested — do not rebuild it.

## Operating rules (non-negotiable)

1. Register in the room as `codex-desktop`, claim room task `task-000033`, work inside room
   thread `thread-000001` ("Threads UI (Codex)") — `set_active_thread`, post status updates into it.
2. TDD where testable: red → green. `npm test` (199 tests) and `npm run build` must be green
   before any commit. Do not break existing tests; update them only when behavior legitimately
   changed.
3. Closing the room task requires `evidence` (the store enforces it — see AGENT_PROTOCOL.md
   "The Evidence Rule"). Post a completion message with your commit ids and reference it.
4. Surgical diffs. `src/dashboard-ui.ts` is ~2,400 lines — extend it, do not reformat or
   restructure unrelated sections. No new dependencies.

## What already exists (don't rebuild)

- Store: `createThread/closeThread/listThreads/setActiveThread`, `threadId` + `files[]` on
  messages, thread-scoped `readMessages`, `fileConflicts` in compact check-ins, digests on
  close. All in `src/store.ts`, tested in `test/store.test.ts`.
- MCP tools for all of the above (`src/server.ts`).
- Dashboard API: `POST /api/digest` exists. Messages post via `routeAndPostMessage`
  (`src/dashboard.ts`), which spreads `PostMessageInput` — `threadId`/`files` already flow
  through `store.postMessage` if the route passes them.

## Scope

### 1. Snapshot carries threads (src/dashboard.ts)

- `createSnapshot` additionally returns `threads: await store.listThreads()` (all statuses;
  filter client-side) and echoes a new `selectedThread` query param.
- When the snapshot request has `?thread=<threadId>`, filter the `messages` used for the feed
  to `m.threadId === threadId || m.threadId === undefined` (same rule as the store: unthreaded
  stays visible). `?thread=all` or absent = current behavior.

### 2. API routes (src/dashboard.ts)

- `POST /api/threads` `{ project, name, goal?, files? }` → `store.createThread`, 201.
- `POST /api/threads/close` `{ threadId, outcome }` → `store.closeThread`, 200. Surface store
  errors as 400 via `HttpError` (follow the `/api/digest` route pattern).

### 3. Two-level sidebar (src/dashboard-ui.ts)

- Under the existing project selector, render a "Threads" block for the selected project:
  open threads as clickable rows (name + ⚠ badge when that thread has file conflicts — see 5),
  a collapsed "Closed" section beneath (name + outcome, dimmed, link to digest path text).
- "New thread" button → prompt-style inline form (name required, goal optional) → POST
  `/api/threads` → reload snapshot and select it.
- Clicking a thread row sets the active thread filter: snapshot polling adds
  `&thread=<id>`, the feed re-renders scoped, and the composer ("Tell the room") includes
  `threadId: <id>` in its POST body. An "All messages" row resets to unscoped.
- Selected thread row shows a "Close thread" affordance → outcome prompt → POST
  `/api/threads/close` → snapshot reload (thread moves to Closed, digest path shown).

### 4. Composer

- When a thread is selected, the message POST body includes `threadId`. No other composer
  changes. (Posting to a closed thread is rejected by the store — surface the 400 error text.)

### 5. File-conflict badge

- Compute conflicts client-side from the snapshot you already have: a thread's declared file
  set = `thread.files ?? []` ∪ `files` of snapshot messages with that `threadId`; two OPEN
  threads overlapping ⇒ both get the ⚠ badge, with `title` text naming the path(s) and the
  other thread. (Mirror of `compactThreadContext` in store.ts — keep the same set semantics.)

### 6. Tests + verification

- `test/dashboard.test.ts` (or the existing dashboard test file if present — check `test/`):
  route tests for `POST /api/threads` and `/api/threads/close` (created/closed/400 on unknown
  id), snapshot `?thread=` filtering. UI rendering is exercised manually:
- Manual smoke: `npx tsx src/dashboard.ts --room <temp dir> --port 4795 --no-open`, create
  two threads, post into one, verify feed scoping, close it, verify digest link + Closed section.
  Drop a screenshot in `.review-shots/threads-sidebar.png`.

## Acceptance (from the original handoff)

- Dashboard renders the two-level Projects → Threads sidebar; feed shows the active thread
  only; "Tell the room" posts into it.
- Two open threads declaring the same file show the ⚠ badge on both; closing either clears it.
- Thread lifecycle round-trips from the UI; closing generates and links the digest.
- `npm test` green, `npm run build` clean, room task closed with evidence.

## Out of scope

- No visual redesign; reuse existing card/section styles.
- No store/server changes beyond the two routes + snapshot fields (the store layer is done).
- No thread rename (defer), no drag/drop, no LLM anything.
