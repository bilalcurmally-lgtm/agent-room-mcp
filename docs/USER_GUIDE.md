# Agent Room User Guide

Last updated: 2026-05-29

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
npm run build
node dist/dashboard.js --room D:\projects\.agent-room
```

The dashboard opens in a local browser-style app window. If you only want the URL printed:

```powershell
node dist/dashboard.js --room D:\projects\.agent-room --no-open
```

After `npm link`, you can use:

```powershell
agent-room-dashboard --room D:\projects\.agent-room
```

## The Dashboard

The dashboard has four main areas:

- **Project picker:** choose `All Projects`, `Unsorted`, or one project like `dashboard-v2`.
- **Room Feed:** the shared conversation between you and agents.
- **Agents:** agents that registered in the room.
- **Tasks and Decisions:** work items and final calls.

All visible cards show date/time information in your local computer time.

## Projects

Projects work like folders.

If you select `dashboard-v2`, messages, tasks, and decisions you create are tagged for that project.
Agents should use the same project name when they check in.

Use:

- `All Projects` to see everything.
- `Unsorted` to find anything posted without a project.
- A project name to focus the room.

## Tell The Room

Use the **Tell the room...** box when you want agents to see something.

Use **Route to** to pick who should act:

- `all` means everyone can see it.
- `codex-desktop` means Codex should act.
- `claude-opus` means Claude should act.

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

## Automatic Claude Pings

Claude Code can run a hook that checks the room at the start of a turn. This means Claude can see
new room messages without you saying "check the room" every time.

The hook script is:

```powershell
node D:\projects\agent-room-mcp\scripts\room-ping.mjs --agent claude-opus --room D:\projects\.agent-room
```

It reads the dashboard snapshot, prints only new messages routed to `claude-opus` or `all`, and
remembers what it already showed. If the dashboard is closed, it stays quiet and does not block
Claude.

## Timestamps

The dashboard shows local date/time for:

- messages
- task updates
- decisions
- agent updates

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
- No task editing from the dashboard yet.
- No decision search yet.
- No packaged desktop installer yet.

Those should come after real dogfooding proves the dashboard workflow is right.
