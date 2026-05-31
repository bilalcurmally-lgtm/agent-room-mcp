# Agent Room MCP

Local file-backed MCP server for coordinating multiple coding agents across projects.

The goal is a boring, auditable shared room:

- append-only messages
- small task board
- decision log
- project-scoped or global room directories
- no hosted dependency

## Run

```powershell
npm install
npm run build
node dist/server.js --room D:\projects\.agent-room
```

After `npm link`, the global command is:

```powershell
agent-room-mcp --room D:\projects\.agent-room
```

## Dashboard

Run the local human control room:

```powershell
npm run start-room
```

That uses the default global room path, `D:\projects\.agent-room`, and opens the dashboard on port
4777. To use a different room or keep the browser closed:

```powershell
npm run start-room -- -Room D:\projects\.agent-room -NoOpen
```

The underlying command is still available when you want full control:

```powershell
npm run build
node dist/dashboard.js --room D:\projects\.agent-room
```

After `npm link`, the global command is:

```powershell
agent-room-dashboard --room D:\projects\.agent-room
```

The dashboard opens on localhost in a dedicated browser-style app window where possible, so other
agents opening their own localhost previews are less likely to replace your room tab. It gives you a
project picker, room feed, agent list, task list, decision list, and a "Tell the room" box. Use
`--no-open` if you want it to print the URL without opening a browser.

For a plain-English walkthrough, read [docs/USER_GUIDE.md](docs/USER_GUIDE.md).
For agent message format and routing rules, read [docs/AGENT_PROTOCOL.md](docs/AGENT_PROTOCOL.md).
For Codex, Claude Code, and Cursor setup, read [docs/MCP_CLIENT_SETUP.md](docs/MCP_CLIENT_SETUP.md).

## MCP Client Config

Use the same room path for every agent/client that should share a room.
For a global room, use a directory outside any single application repo, such as
`D:\projects\.agent-room`.

```json
{
  "mcpServers": {
    "agent-room": {
      "command": "agent-room-mcp",
      "args": ["--room", "D:\\projects\\.agent-room"]
    }
  }
}
```

## MCP Tools

- `post_message`
- `read_messages`
- `create_task`
- `claim_task`
- `register_agent`
- `check_in`
- `mark_messages_read`
- `list_tasks`
- `update_task`
- `append_task_note`
- `record_decision`
- `register_project`
- `list_projects`
- `get_room_status`

Messages, tasks, and decisions support an optional `project` field so one global room can still
separate work by repo or initiative.

Registered projects add a real folder path on top of that project tag, so agents know which
workspace to open. Example: `audit-cockpit` can point at `D:\projects\audit-cockpit`.

Agents should treat `check_in` as their first move when joining or resuming work. It returns unread
messages, assigned tasks, open tasks, recent decisions, room status, and current room time in one
auditable response. It also flags stale active tasks so agents know when to re-check context before
continuing. The stale-task threshold defaults to 24 hours and can be changed from the dashboard.

## Implementer + Reviewer Workflow

1. Each agent calls `register_agent` once, then calls `check_in` whenever it starts or resumes.
2. The user creates or approves a task with `create_task`.
3. The implementer claims it with `claim_task`, posts handoff notes with `post_message`, and records
   durable scope decisions with `record_decision`.
4. The reviewer uses `check_in`, `list_tasks`, and `read_messages` to find the work, then records findings as
   task notes through `update_task` or `append_task_note`.
5. Agents call `mark_messages_read` after consuming their inbox so future `check_in` calls show only new messages.
6. The task is marked `done` only after tests/build or explicit verification notes are attached.

Agents should not claim they reached consensus, received a handoff, or reviewed another agent's
work unless the relevant message, task note, or decision exists in the room.

## Claude Code Setup

For the full multi-client setup guide, including Codex and Cursor, read
[docs/MCP_CLIENT_SETUP.md](docs/MCP_CLIENT_SETUP.md).

Add the MCP server:

```powershell
claude mcp add --scope user agent-room -- node D:/projects/agent-room-mcp/dist/server.js --room D:/projects/.agent-room
```

Then restart any running Claude Code session. Claude Code loads MCP tools at session start, so an
already-open session may show the server as connected but still not expose the tools until restart.

Optional: add a Claude Code hook so unread room messages are injected at the start of new Claude
turns without manual polling. Add this to your user-scope Claude settings:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node D:/projects/agent-room-mcp/scripts/room-ping.mjs --agent claude-opus --room D:/projects/.agent-room"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node D:/projects/agent-room-mcp/scripts/room-ping.mjs --agent claude-opus --room D:/projects/.agent-room"
          }
        ]
      }
    ]
  }
}
```

The hook fails silently if the dashboard is not running. To use a non-default dashboard URL, set
`AGENT_ROOM_SNAPSHOT_URL` or pass `--url http://127.0.0.1:4777/api/snapshot?project=all`.

## Storage

The room directory contains:

```text
messages.jsonl
tasks.json
decisions.json
decisions.md
agents.json
config.json
```

JSON storage writes are serialized and written atomically. `agents.json` tracks registered agents and
last-read message ids. Malformed storage files are reported with clear recovery errors instead of
being silently reset.

## Security And Privacy

A global room can contain context from multiple projects. Keep room directories local and avoid
placing them in synced, shared, or application-repo directories unless that is intentional.
