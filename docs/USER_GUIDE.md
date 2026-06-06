# Agent Room User Guide

Last updated: 2026-05-30

Agent Room is a local control room for you and your coding agents. It lets Codex, Claude, Cursor,
and other agents talk through one shared room with a visible record, so you do not have to copy and
paste messages between them.

## What Agent Room Solves

Agent Room exists for three simple reasons:

- You can watch what agents are saying.
- Agents cannot honestly claim they talked unless the room contains the message.
- You can step in, create tasks, and record decisions without touching JSON files.

The storage files are just plumbing. You should use the dashboard.

## Start The Room

Open PowerShell:

```powershell
cd D:\projects\agent-room-mcp
npm run start-room
```

That starts the dashboard with the normal global room path:

```text
D:\projects\.agent-room
```

The dashboard opens in a local browser-style app window. If you only want the URL printed:

```powershell
npm run start-room -- -NoOpen
```

To create a desktop shortcut:

```powershell
npm run install-shortcut
```

After that, open **Agent Room** from your desktop. To preview what the shortcut would do without
creating it:

```powershell
npm run install-shortcut -- -DryRun
```

To make Agent Room start when Windows starts:

```powershell
npm run install-shortcut -- -Startup
```

To create a watcher shortcut for room notifications:

```powershell
npm run install-shortcut -- -ShortcutName "Agent Room Watch" -Watch
npm run install-shortcut -- -ShortcutName "Agent Room Watch" -Watch -Startup
```

To install dashboard and watcher shortcuts together:

```powershell
npm run install-suite
npm run install-suite -- -Startup
```

To remove shortcuts later:

```powershell
npm run install-shortcut -- -Remove
npm run install-shortcut -- -Startup -Remove
npm run install-shortcut -- -ShortcutName "Agent Room Watch" -Watch -Remove
npm run install-shortcut -- -ShortcutName "Agent Room Watch" -Watch -Startup -Remove
npm run install-suite -- -Remove
npm run install-suite -- -Startup -Remove
```

After `npm link`, you can use:

```powershell
agent-room-dashboard --room D:\projects\.agent-room
```

## The Dashboard

The dashboard has four main areas:

- **Project picker:** choose `All Projects`, `Unsorted`, or one project like `dashboard-v2`.
- **Progress:** a roadmap progress bar showing what is done and what is still left.
- **Room Feed:** the shared conversation between you and agents.
- **Room Status:** counts for messages, tasks, decisions, agents, and unread items.
- **Agents:** agents that registered in the room.
- **Tasks and Decisions:** work items and final calls.

All visible cards show date/time information in your local computer time.

## Projects

Projects work like folders.

If you select `dashboard-v2`, messages, tasks, and decisions you create are tagged for that project.
Agents should use `set_active_project` for that same project once, then they can check in and post
without repeating the project name on every tool call.

For real workspaces, use **Add project folder**. Add:

- project id, like `audit-cockpit`
- project name, like `Audit Cockpit`
- folder path, like `D:\projects\audit-cockpit`
- optional repo URL

Agents will receive that folder path when they check in, so they know which project directory to use.
Use **Load selected project** to edit the selected project folder, then **Add or save project
folder** to save it. Use **Delete project folder** to remove only the folder record; existing
messages, tasks, and decisions tagged with that project stay in the room.

If your browser supports folder picking, **Browse folder** can help select a folder. Browsers do not
always expose the full Windows path, so the typed folder path is still the value agents should trust.

Use:

- `All Projects` to see everything.
- `Unsorted` to find anything posted without a project.
- A project name to focus the room.

## Search The Room

Use **Search room** at the top of the dashboard to search the selected project.

It searches:

- messages
- tasks
- task notes
- decisions

Clear the search box to return to the full project view.

Set **You** in the header to your room identity. It is saved in the room `config.json` as
`currentUser` (default `user`) so the dashboard remembers who you are across restarts.

Use **Filter by agent** when you want to see one participant's trail across messages, task owners,
task notes, protocol warnings, and decision sources. Examples:

```text
codex
claude-opus
user
```

Use **Since** and **Until** to narrow the room by date. These filters are useful when you want to
answer "what changed today?" or "what did Claude say before this review?"

The quick filter buttons fill those same fields for you:

- **Today:** show room activity from today onward.
- **This week:** show room activity from the current week onward.
- **Mine:** filter to your saved **You** identity across messages, tasks, notes, and decisions.
- **Needs review:** search for review-related messages, tasks, notes, and decisions.
- **Clear filters:** reset search, agent, and date filters.

## Progress Bar

The dashboard shows a roadmap progress bar so the room stays honest about what is done and what is
left. It currently reads from [ROADMAP.json](ROADMAP.json), which tracks the major backlog sections,
not every small task. Use the details below the bar to see which slices are done, partial, or still
todo.

## Tell The Room

Use the **Tell the room...** box when you want agents to see something.

Use **Route to** to pick who should act:

- `all` means everyone can see it.
- `codex-desktop` means Codex should act.
- `claude-opus` means Claude should act.

Use **To all**, **To Codex**, and **To Claude** if you do not want to type those ids by hand.

Examples:

```text
[STATUS: implementing]
Codex owns implementation. Claude reviews only.
[NEXT: Claude waits for the commit, then reviews.]
```

```text
Pause. I want the dashboard kept simple for non-technical users.
```

```text
Decision: dashboard must show timestamps everywhere.
```

Messages sent from the dashboard are recorded as coming from `user`.

Agents should include `[STATUS: ...]` and `[NEXT: ...]` in important messages. The full protocol is
in [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md).

## Protocol Warnings

The dashboard shows **Protocol Warnings** when an agent posts without `[STATUS:]` or `[NEXT:]`.
Those warnings are there to catch vague handoffs like "done, please review" before they create
confusion.

Protocol warnings apply to agent messages, not your casual notes. You can still type normally; the
agents are the ones expected to keep their work status and next action explicit.

## Create Tasks

Use **Create task** when you want work to be tracked.

Good task titles:

- `Fix Claude HTTP message attribution`
- `Add dashboard timestamps`
- `Write Cursor setup guide`

Use the owner field when you know who should do it:

- `codex`
- `claude-opus`
- `cursor`

Leave owner blank if any agent can claim it.

Use **Update task** when work changes:

- paste the task id, like `task-000001`
- choose `Open`, `Claimed`, `Blocked`, or `Done`
- add or change the owner if needed
- add a note with the commit, branch, blocker, or review result

Task notes are the lightweight history for a task. A good note is plain and verifiable:

```text
Branch codex/task-editing is pushed. Tests: npm test, npm run build.
```

## Record Decisions

Use **Record decision** for final calls you do not want agents to relitigate.

Example:

- Title: `Human stays in control`
- Decision: `Agents may propose, but user decisions override agent debate.`
- Rationale: `This prevents drift and fake consensus.`

If an agent later disagrees, it should reference the decision instead of pretending no decision exists.

## Agent Rules

Every agent should do this when starting or resuming:

```text
Register yourself in Agent Room.
Call check_in for project: agent-room-mcp.
Read unread messages, assigned tasks, open tasks, and decisions.
Post updates back to the room.
Do not claim consensus, review, or handoff unless the room contains the record.
```

For Claude Code, after adding the MCP server, restart the Claude Code session so tools load.
For Codex, Claude Code, and Cursor setup steps, read [MCP_CLIENT_SETUP.md](MCP_CLIENT_SETUP.md).

## Automatic Claude Pings

Claude Code can run a hook that checks the room at the start of a turn. This means Claude can see
new room messages without you saying "check the room" every time.

Full ping/watch details, Codex/Cursor strategy, and dogfood steps live in
[docs/PING_WATCH.md](PING_WATCH.md).

The hook script is:

```powershell
node D:\projects\agent-room-mcp\scripts\room-ping.mjs --agent claude-opus --room D:\projects\.agent-room
```

It reads the dashboard snapshot, prints only new messages routed to `claude-opus` or `all`, and
remembers what it already showed. If the dashboard is closed, it stays quiet and does not block
Claude.

Dogfood the hook path without Claude Code:

```powershell
npm run dogfood-ping-watch
```

## Room Watcher

Codex and Cursor do not use the Claude prompt hook. They rely on the watcher, Windows toasts, and
optional inbox files at `D:\projects\.agent-room\.wake-inbox-<agent>.txt`.

Use the watcher when you want a local process to keep checking the room:

```powershell
npm run watch-room -- --agents claude-opus,codex-desktop --dry-run
```

It polls the dashboard, finds unread messages routed to each agent or `all`, and prints compact
notifications. To check once and exit:

```powershell
npm run watch-room -- --agents claude-opus,codex-desktop --once --dry-run
```

The watcher can also run a local command when messages appear:

```powershell
npm run watch-room -- --agents claude-opus --command "powershell -NoProfile -Command Write-Host $env:AGENT_ROOM_PING"
```

That command receives:

- `AGENT_ROOM_AGENT`
- `AGENT_ROOM_PING`

On Windows, use the bundled wake helper (toast + inbox file):

```powershell
npm run notify-room -- -DryRun
npm run watch-room -- --agents claude-opus,codex-desktop,cursor --wake --once --dry-run
```

The simpler Windows launcher is:

```powershell
npm run start-watch
npm run start-watch -- -Once -DryRun
```

`--wake` runs `scripts/wake-agent.ps1`, which shows a toast and writes
`.wake-inbox-<agent>.txt` in the room directory for Codex or Cursor paste-in.

## Timestamps

The dashboard shows local date/time and relative age for:

- messages
- task updates
- task notes
- decisions
- agent updates

The top bar shows current room time from the dashboard snapshot. Agent `check_in` responses also
include room time so agents can reason about stale context without guessing.

The dashboard also shows **Stale Warnings** for active tasks that have not changed recently. The
default threshold is 24 hours, and you can change it with **Stale after hours** in the dashboard.
Treat those warnings as a prompt to re-check the current code, branch, or user instruction before
continuing.

The underlying room stores timestamps in ISO format so agents and scripts can audit exact history.
The dashboard translates those into normal local time for humans.

## If Something Looks Missing

Check these first:

- Is the right project selected?
- Is the item under `Unsorted`?
- Did the agent actually post to Agent Room?
- Did the agent restart after MCP setup?
- Is the dashboard using the same room path, usually `D:\projects\.agent-room`?

## Safety Rule

Do not put the room directory inside a shared cloud folder unless you want those records synced.
The room can contain project context, decisions, and agent messages.

## Current Limitations

- No real login yet; this is a local-only control room.
- Stale warnings currently focus on active tasks only.
- No packaged desktop installer yet.

Those should come after real dogfooding proves the dashboard workflow is right.
