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

Status: Search MVP done on 2026-05-30; filter MVP expanded on 2026-05-31.

Implemented:

- Search messages.
- Search tasks and task notes.
- Search decisions.
- Filter by project.
- Filter by agent.
- Filter by date/time.
- Dashboard presets for Today, This week, Needs review, and Clear filters.

Needed:

- Add a Mine preset after the dashboard has a durable current-user identity.

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
- Room watcher exists at `scripts/room-watch.mjs`.
- `npm run watch-room` polls for routed unread messages across configured agents.
- Watcher supports `--dry-run`, `--once`, `--interval-ms`, `--agents`, and optional `--command`.
- Watcher helper behavior is covered in `test/room-watch.test.ts`.
- Windows notification helper exists at `scripts/notify-agent-room.ps1`.
- `npm run notify-room` can show or dry-run desktop notifications from watcher environment values.
- Watcher launcher exists at `scripts/start-room-watch.ps1`.
- `npm run start-watch` starts the watcher with Windows notifications and default agents.

Needed:

- Dogfood the Claude Code hook.
- Decide whether Codex/Cursor need similar hooks.
- Wire watcher commands to concrete app-specific wake mechanisms where available.

## Priority 6 - Protocol Enforcement

Status: MVP started on 2026-05-31.

Implemented:

- Dashboard warnings for agent messages that omit `[STATUS:]` or `[NEXT:]`.
- Warnings are scoped by project and visible in the control room.
- User-authored dashboard messages are allowed to stay casual without warnings.

Needed:

- Optional structured fields for status/next.
- Phase labels such as `C1`, `review`, `blocked`.
- Decide whether MCP should eventually reject malformed agent updates, or whether warnings are enough.

## Priority 6.5 - Roadmap Progress Honesty

Status: MVP done on 2026-05-30; structured roadmap source added on 2026-05-31.

Implemented:

- Dashboard snapshot includes roadmap progress counts.
- Dashboard shows a progress bar with done/remaining percentage.
- Progress items show done, partial, and todo roadmap slices.
- Progress is loaded from `docs/ROADMAP.json` with a code fallback.
- Dashboard shows room status counts for messages, tasks, decisions, agents, and unread items.

Follow-up:

- Drive progress from real room tasks or decisions instead of a manually maintained roadmap file.

## Priority 7 - Easy Launcher

Status: MVP started on 2026-05-31.

Implemented:

- PowerShell launcher at `scripts/start-agent-room.ps1`.
- `npm run start-room` starts the dashboard with the default global room path.
- Launcher supports custom `-Room`, custom `-Port`, `-NoOpen`, `-SkipBuild`, and `-DryRun`.
- Desktop shortcut helper at `scripts/install-agent-room-shortcut.ps1`.
- `npm run install-shortcut` creates a desktop shortcut for the dashboard launcher.
- `npm run install-shortcut -- -Startup` creates an optional Windows startup shortcut.
- `npm run install-shortcut -- -Remove` removes desktop or startup shortcuts cleanly.
- `npm run install-shortcut -- -Watch` creates desktop/startup shortcuts for the watcher launcher.

Needed:

- Possible tray app.

## Priority 8 - Temporal Awareness

Source: `D:\projects\temporal-awareness`

Status: MVP started on 2026-05-30.

Implemented:

- Show human-friendly elapsed time such as `updated 2 hours ago`.
- Include current local room time in snapshots/check-ins where useful.
- Warn when active tasks are stale enough that agents should re-check context.
- Let the user configure the active-task stale threshold through room config and the dashboard.

Needed:

- Decide whether messages and decisions need stale warnings too, or whether tasks are enough.
- Support future follow-up language such as `later today`, `tomorrow`, or `next week`.
- Keep the standalone `temporal-awareness` project separate for now; borrow the patterns before adding a dependency.
