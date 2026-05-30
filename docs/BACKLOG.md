# Agent Room Backlog

Last updated: 2026-05-30

## Priority 1 - Project Registry And Folder Picker

Status: DONE for MVP on 2026-05-30.

Implemented:

- Store real project records in `projects.json`.
- Each project has:
  - `id`
  - `name`
  - `folderPath`
  - optional `repoUrl`
  - optional `status`
  - timestamps
- Dashboard should let the user create/select a project by name and folder path.
- Agents should see the project folder path in dashboard/API snapshots.
- The project selector should show registered projects before tag-only projects.

Follow-up:

- Add a nicer folder picker once this becomes a packaged app.
- Add edit/delete project controls after dogfooding.

## Priority 2 - Task Editing

Status: DONE for MVP on 2026-05-30.

Implemented:

- Mark task done.
- Mark task blocked.
- Assign or reassign owner.
- Append task note.
- Link commit or branch in a task note.

Follow-up:

- Add inline per-task buttons once the dashboard layout has more room.
- Add a structured commit/branch link field if plain notes become too messy.

## Priority 3 - Search And History

Status: Search MVP done on 2026-05-30.

Implemented:

- Search messages.
- Search tasks and task notes.
- Search decisions.
- Filter by project.

Needed:

- Filter by agent.
- Filter by date/time.

## Priority 4 - App-Specific Setup Guides

Status: MVP documented on 2026-05-30.

Implemented:

- Claude Code setup is documented in `README.md`.
- Claude Code restart caveat is documented in `README.md` and `docs/USER_GUIDE.md`.
- Codex setup is documented in `docs/MCP_CLIENT_SETUP.md`.
- Cursor setup is documented in `docs/MCP_CLIENT_SETUP.md`.
- Each setup includes a verification ritual using `register_agent`, `check_in`, and a dashboard confirmation.

Needed:

- Test each client in the real app after MCP config is applied.

## Priority 5 - Ping/Watch Reliability

Current state:

- Claude Code hook script exists at `scripts/room-ping.mjs`.
- Hook helper behavior is covered in `test/room-ping.test.ts`.
- Hook setup is documented in `README.md` and `docs/USER_GUIDE.md`.

Needed:

- Dogfood the Claude Code hook.
- Decide whether Codex/Cursor need similar hooks.
- Consider a lightweight watcher process for unattended monitoring.

## Priority 6 - Protocol Enforcement

Current state: `[STATUS]` and `[NEXT]` are guidance.

Needed:

- Dashboard warnings if important messages omit `[STATUS]` or `[NEXT]`.
- Optional structured fields for status/next.
- Phase labels such as `C1`, `review`, `blocked`.

## Priority 7 - Easy Launcher

Needed:

- One-click or one-command startup.
- Desktop shortcut.
- Possible tray app.
- Optional auto-start.

## Priority 8 - Temporal Awareness

Source: `D:\projects\temporal-awareness`

Status: MVP started on 2026-05-30.

Implemented:

- Show human-friendly elapsed time such as `updated 2 hours ago`.
- Include current local room time in snapshots/check-ins where useful.
- Warn when active tasks are stale enough that agents should re-check context.

Needed:

- Tune stale thresholds after dogfooding.
- Decide whether messages and decisions need stale warnings too, or whether tasks are enough.
- Support future follow-up language such as `later today`, `tomorrow`, or `next week`.
- Keep the standalone `temporal-awareness` project separate for now; borrow the patterns before adding a dependency.
