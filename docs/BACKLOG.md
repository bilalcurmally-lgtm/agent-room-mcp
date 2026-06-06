# Agent Room Backlog

Last updated: 2026-06-05

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
- Dashboard can load a selected project record into the form for editing.
- Dashboard can delete registered project folder records without deleting tagged room history.
- Dashboard includes a best-effort folder browse helper where the browser supports it.
- MCP includes `delete_project` for removing registered project records.

Follow-up:

- Add a native full-path folder picker once this becomes a packaged app.

## Priority 2 - Task Editing

Status: DONE for MVP on 2026-05-30.

Implemented:

- Mark task done.
- Mark task blocked.
- Assign or reassign owner.
- Append task note.
- Link commit or branch in a task note.

Follow-up:

- DONE 2026-06-05: Inline per-task buttons (Done, Blocked, Note, Reassign, Edit) on each task card.
- DONE 2026-06-05: Structured `branch` and `commit` fields on task notes via MCP, dashboard API, and update form.

## Priority 3 - Search And History

Status: DONE for MVP on 2026-06-05.

Implemented:

- Search messages.
- Search tasks and task notes.
- Search decisions.
- Filter by project.
- Filter by agent.
- Filter by date/time.
- Dashboard presets for Today, This week, Mine, Needs review, and Clear filters.
- Durable current-user identity in `config.json` (`currentUser`, default `user`).
- Header **You** field saves identity to the room config for the Mine preset.

## Priority 4 - App-Specific Setup Guides

Status: DONE for MVP on 2026-06-05.

Implemented:

- Claude Code setup is documented in `README.md`.
- Claude Code restart caveat is documented in `README.md` and `docs/USER_GUIDE.md`.
- Codex setup is documented in `docs/MCP_CLIENT_SETUP.md`.
- Cursor setup is documented in `docs/MCP_CLIENT_SETUP.md`.
- Each setup includes a verification ritual using `register_agent`, `check_in`, and a dashboard confirmation.
- `npm run verify-clients` exercises Claude, Codex, and Cursor profiles over stdio (same transport as real clients).
- `test/mcp-client-verification.test.ts` runs the same checks in CI.
- Setup guide documents config locations, automated verification, and manual GUI confirmation steps.

Follow-up:

- Run one manual GUI confirmation per client on your machine after applying MCP config.

## Priority 5 - Ping/Watch Reliability

Status: DONE for MVP on 2026-06-05.

Implemented:

- Claude Code hook script at `scripts/room-ping.mjs` with exported `runRoomPing` for integration tests.
- Hook helper behavior in `test/room-ping.test.ts`.
- Hook setup in `README.md`, `docs/USER_GUIDE.md`, and `docs/PING_WATCH.md`.
- Room watcher at `scripts/room-watch.mjs` with `--wake`, exported `runWatchTick`, and cursor in default agents.
- `npm run watch-room`, `npm run start-watch`, and `scripts/start-room-watch.ps1`.
- Windows toast via `scripts/notify-agent-room.ps1`.
- Agent wake dispatcher at `scripts/wake-agent.ps1` (toast + `.wake-inbox-<agent>.txt` for Codex/Cursor).
- Wake strategy registry at `scripts/agent-wake.mjs` (Claude = hook; Codex/Cursor = watcher).
- `npm run dogfood-ping-watch` and `test/ping-watch.integration.test.ts` dogfood ping/watch against a live snapshot.

Follow-up:

- One manual Claude Code session to confirm hook stdout injection after editing user settings.

## Priority 6 - Protocol Enforcement

Status: DONE for MVP on 2026-06-05.

Implemented:

- Dashboard warnings for agent messages that omit `[STATUS:]` or `[NEXT:]`.
- Warnings are scoped by project and visible in the control room.
- User-authored dashboard messages are allowed to stay casual without warnings.
- Structured `status`, `next`, and `phase` fields on MCP and dashboard `post_message`.
- Phase labels: `C1`, `C2`, … plus presets `review`, `blocked`, `merge`, `handoff`.
- Shared rules in `src/protocol.ts` with `test/protocol.test.ts`.
- Optional `enforceProtocol` room config: warnings by default, MCP rejection when enabled.
- Dashboard composer fields and **Reject non-compliant agent MCP messages** toggle.
- Decision doc: [PROTOCOL_ENFORCEMENT.md](PROTOCOL_ENFORCEMENT.md).

## Priority 6.5 - Roadmap Progress Honesty

Status: DONE for MVP on 2026-06-05.

Implemented:

- Dashboard snapshot includes roadmap progress counts.
- Dashboard shows a progress bar with done/remaining percentage.
- Progress items show done, partial, and todo roadmap slices.
- Progress merges `docs/ROADMAP.json` with live room evidence in `src/room-progress.ts`.
- Each item shows file vs room status and a plain-language evidence line.
- Dashboard shows room status counts for messages, tasks, decisions, agents, and unread items.

## Priority 7 - Easy Launcher

Status: DONE for MVP on 2026-06-05.

Implemented:

- PowerShell launcher at `scripts/start-agent-room.ps1`.
- `npm run start-room` starts the dashboard with the default global room path.
- Launcher supports custom `-Room`, custom `-Port`, `-NoOpen`, `-SkipBuild`, and `-DryRun`.
- Desktop shortcut helper at `scripts/install-agent-room-shortcut.ps1`.
- `npm run install-shortcut` creates a desktop shortcut for the dashboard launcher.
- `npm run install-shortcut -- -Startup` creates an optional Windows startup shortcut.
- `npm run install-shortcut -- -Remove` removes desktop or startup shortcuts cleanly.
- `npm run install-shortcut -- -Watch` creates desktop/startup shortcuts for the watcher launcher.
- `npm run install-suite` creates or removes dashboard and watcher shortcuts together.
- `scripts/start-agent-room-suite.ps1` and `npm run start-suite` start dashboard + watcher together.
- Launcher marker `.launcher-suite.json` in the room for roadmap honesty.

Follow-up:

- Possible tray app (deferred; suite launcher covers daily use).

## Priority 8 - Temporal Awareness

Source: `D:\projects\temporal-awareness`

Status: DONE for MVP on 2026-06-05.

Implemented:

- Show human-friendly elapsed time such as `updated 2 hours ago` in the dashboard and snapshots (`src/temporal.ts`).
- Include current local room time in snapshots/check-ins where useful.
- Warn when active tasks are stale enough that agents should re-check context.
- Stale warnings for old messages and decisions using the same room threshold as tasks.
- Parse follow-up phrases (`later today`, `tomorrow`, `next week`, `tonight`) and surface hints on dashboard messages.
- Let the user configure the active-task stale threshold through room config and the dashboard.
- `test/temporal.test.ts` covers relative time, follow-up parsing, and stale item builders.

Decision:

- Tasks remain the primary stale signal; messages and decisions are informational re-check warnings.
- The standalone `temporal-awareness` MCP project stays separate; agent-room borrows time patterns only.

## Priority 9 - Active Workspace Project

Status: DONE for MVP on 2026-06-05.

Implemented:

- `activeProject` in room `config.json` (persisted workspace).
- Dashboard **View** dropdown: registered workspaces first, then history tags, then All/Unsorted.
- Selecting a registered project sets the workspace and filters the view.
- **Working in** banner above the composer with folder path, view shortcut, and clear workspace.
- Snapshot fields `writeProject` and `workspace` so posts/tasks/decisions tag the workspace even when viewing All Projects.
- `resolveWriteProject` in `src/store.ts` with `test/workspace.test.ts`.

## Priority 10 - Attachments

Status: DONE for MVP on 2026-06-05.

Implemented:

- Room storage: `<room>/attachments/` + `attachments.json` index.
- Policy in `src/attachments.ts`: 5 MB max, MIME allowlist, http(s) links only.
- MCP: `upload_attachment`, `link_attachment`, `list_attachments`.
- `post_message`, `append_task_note`, `record_decision` accept `attachmentIds` and structured links.
- Dashboard: `POST /api/attachments`, `GET /api/attachments/:id`, composer file picker, feed chips.
- `docs/ATTACHMENTS.md`, tests `test/attachments.test.ts`, `test/attachments-store.test.ts`.

Follow-up:

- MCP resource URIs for attachment bytes.
- Per-project quotas and image thumbnails in feed.
