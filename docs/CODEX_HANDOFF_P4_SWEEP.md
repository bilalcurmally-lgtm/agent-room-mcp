# Codex handoff: P4 sweep — the v0.2.0 productization pass

Prepared by fable-5, 2026-06-12. Branch: `harden-agent-room`. Baseline: 201 tests green,
build clean, commit `ea05c6b` (your threads UI, reviewed and approved in msg 000210).

P3 is complete. This sweep is everything that turns "Billu's setup" into "a tool" — driven
by a real failure: the first external user (Billu's brother) could not get the repo running.

## Operating rules (non-negotiable)

1. Register as `codex-desktop`, `set_active_thread` to `thread-000002` ("P4 sweep (Codex)"),
   post status updates into it. **This time, `confirm_handoff` the handoff message before you
   start** — you skipped the ack on the last round and it was the one review finding.
2. One room task per item, in this order: `task-000034` (P4-03), `task-000035` (P4-04),
   `task-000036` (P4-05), `task-000037` (P4-09), `task-000038` (P1-04), `task-000039` (P4-08).
   Close each with `evidence` referencing your completion note or message — the store rejects
   bare `done`.
3. TDD red→green per item. `npm test` (201) and `npm run build` green before every commit;
   one conventional-commits commit per item (`feat(...)`, `fix(...)`, `docs(...)`).
4. Surgical diffs, no new dependencies, no version bump, no pushing. Cross-platform means
   POSIX paths and shells work — the CI matrix (ubuntu + windows) is the referee once pushed.

## Items

### task-000034 · P4-03 Cross-platform wake

`scripts/wake-agent.ps1` / `notify-agent-room.ps1` are Windows-only — dead on arrival on
macOS/Linux. Build `scripts/wake-agent.mjs`:

- **Always** append the ping text to `<room>/.wake-inbox-<agent>.txt` (this is the part that
  must never fail, on any OS).
- Best-effort OS notification, zero new deps: `win32` → spawn the existing PowerShell toast;
  `darwin` → `osascript -e 'display notification ...'`; `linux` → `notify-send`. Any spawn
  failure falls back silently to inbox-only.
- Reads the same env contract the watcher already sets: `AGENT_ROOM_AGENT`,
  `AGENT_ROOM_PING`, `AGENT_ROOM_DIR`.
- Point `defaultWakeCommand` (scripts/room-watch.mjs and src/room-notify.ts) at the Node
  script. Keep the .ps1 files working (they're referenced in installed tasks) but the Node
  path is the default.
- Tests: per-platform command construction (pass platform as a parameter, like
  `createBrowserLaunch` does in src/dashboard.ts); inbox file written on a temp room.
- Docs: PING_WATCH.md wake-command section.

### task-000035 · P4-04 Archive / compact command

`messages.jsonl` grows forever and several paths read it whole. `npm run archive-room -- --days N`
(default 30):

- Move messages with `time` older than N days to `<room>/archive/messages-<YYYY-MM-DD>.jsonl`
  (append if it exists); rewrite messages.jsonl with the survivors, **inside the room.lock**
  (use the store or replicate its locking — do not write the file unguarded).
- ID continuity is already guaranteed by `message-counter.json` — your test must prove it:
  seed old+new messages, archive, post again → next sequential id, reads still work.
- Decisions and tasks are never archived. README documents the command.

### task-000036 · P4-05 Dashboard "post as" select

Already specced in CLAUDE_CODE_INTEGRATION_ISSUES.md: the composer sends only {body, project}
plus what "More options" adds. Add a from-select next to "Posting as", populated from
`snapshot.agents` ids plus the configured `currentUser` (default selection), included in the
POST. Test: HTML contains the select; a post with a chosen `from` lands attributed to it.

### task-000037 · P4-09 Promote message → decision

Half of all decisions start life as a room message; stop retyping them. A small action on
each feed message card ("→ decision") that opens the Decisions panel with title pre-filled
from the topic, decision text from the body, rationale left empty for the human, and — when
submitted — the recorded decision carries a reference to the source message id (a `links`
entry such as `room:000123` is fine). Test: decision recorded via the API with the source
reference present.

### task-000038 · P1-04 Lite tool profile

19+ tools means every agent pays full schema cost at session start. `--profile lite` on the
server registers only: `post_message`, `read_messages`, `read_message`, `search_messages`,
`check_in`, `mark_messages_read`, `claim_task`, `update_task`. Full stays default. Wire the
flag through `resolveRoomDir`-style arg parsing (see `src/server.ts`). Test: createServer
with the lite profile exposes exactly that set; default unchanged. Document both profiles in
MCP_CLIENT_SETUP.md.

### task-000039 · P4-08 npm publish prep (NO version bump)

- package.json: real `description`, `keywords` (mcp, multi-agent, agents, audit,
  coordination), `repository`, `license`, `files` whitelist (dist, README.md, LICENSE,
  docs/AGENT_PROTOCOL.md, docs/MCP_CLIENT_SETUP.md, docs/PING_WATCH.md).
- Add an MIT `LICENSE` in Bilal Curmally's name — **flag in your completion message that he
  should confirm the license choice**.
- Evidence: paste `npm pack --dry-run` file list into the task note.
- Do **not** bump the version, tag, or publish — fable-5 does that after final review.

## Reserved for fable-5 (do not touch)

README origin story (P4-07), the final room digest, version bump to 0.2.0, tagging, pushing.

## Definition of done for the sweep

All six tasks closed with evidence, suite green (expect ~210+ tests), build clean, a
completion message in thread-000002 listing per-item commits, and the P4-08 license question
flagged to Billu.
