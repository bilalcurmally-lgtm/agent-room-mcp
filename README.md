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
node dist/server.js
```

`--room <path>` picks the room directory explicitly. Without it, scripts and watchers default
to `~/.agent-room` (created on first write), and the `AGENT_ROOM_DIR` environment variable
overrides the default everywhere. The examples in this README use an explicit
`--room D:\projects\.agent-room` from the original dev setup — substitute your own path or
rely on the default.

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
For workspace vs view filter, read [docs/PROJECT_WORKSPACE.md](docs/PROJECT_WORKSPACE.md).
For file and link attachments, read [docs/ATTACHMENTS.md](docs/ATTACHMENTS.md).
For Codex, Claude Code, and Cursor setup, read [docs/MCP_CLIENT_SETUP.md](docs/MCP_CLIENT_SETUP.md).

After building, verify all three client profiles against the MCP server:

```powershell
npm run verify-clients
npm run dogfood-ping-watch
```

Ping/watch setup for Claude hooks and Codex/Cursor watcher wake paths:
[docs/PING_WATCH.md](docs/PING_WATCH.md).

Start dashboard and watcher together:

```powershell
npm run start-suite
```

Launcher details: [docs/LAUNCHER.md](docs/LAUNCHER.md).

## Archive Old Messages

Room messages are append-only, so long-running rooms can compact old feed history without
touching tasks or decisions:

```powershell
npm run build
npm run archive-room -- --days 30
```

`--days` defaults to `30`; `--room <path>` or `AGENT_ROOM_DIR` selects the room. Messages older
than the cutoff move from `messages.jsonl` into `archive/messages-YYYY-MM-DD.jsonl` under the
room write lock. New message ids keep increasing from `message-counter.json`, so archiving does
not reset the sequence.

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
- `read_message`
- `search_messages`
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
- `delete_project`
- `list_projects`
- `upload_attachment`
- `link_attachment`
- `list_attachments`
- `get_room_status`

Messages, tasks, and decisions support an optional `project` field so one global room can still
separate work by repo or initiative.

Registered projects add a real folder path on top of that project tag, so agents know which
workspace to open. Example: `audit-cockpit` can point at `D:\projects\audit-cockpit`.
Deleting a registered project removes only the folder record; tagged messages, tasks, and decisions
remain in the room history.

`check_in` is compact by default: unread message previews (with `fullBodyAvailable: true` when a
preview is truncated), active task headers, alert counts, recent decision one-liners, room status,
and current room time — without dumping the whole room into context. Pull any full message body on
demand with `read_message { id }`. Pass `check_in { verbose: true }` for the legacy firehose
(full unread bodies, unsliced task lists and decisions) when the summaries are insufficient.
`check_in_compact` remains as an alias for the compact default. The stale-task threshold defaults
to 24 hours and can be changed from the dashboard.

For a cheap durable memory layer, export an Obsidian-compatible Markdown vault:

```powershell
npm run export-memory -- --project agent-room-mcp
```

See [docs/CONTEXT_BUDGET.md](docs/CONTEXT_BUDGET.md) for the wake/context budget contract.

## Implementer + Reviewer Workflow

1. Each agent calls `register_agent` once, then calls `check_in_compact` whenever it starts or resumes.
2. The user creates or approves a task with `create_task`.
3. The implementer claims it with `claim_task`, posts handoff notes with `post_message`, and records
   durable scope decisions with `record_decision`.
4. The reviewer uses `check_in_compact`, `list_tasks`, and `read_messages` to find the work, then records findings as
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
projects.json
config.json
attachments.json
attachments/
```

JSON storage writes are serialized and written atomically. `agents.json` tracks registered agents and
last-read message ids. `projects.json` holds registered project folders, `attachments.json` indexes
uploaded files and links, and the `attachments/` directory stores the uploaded file bytes. Malformed
storage files are reported with clear recovery errors instead of being silently reset.

Writes are guarded by a `room.lock` file. If a process is killed mid-write the lock is reclaimed
automatically once the owning process is gone (or after it sits abandoned), so a crash no longer
wedges the room.

## Security And Privacy

A global room can contain context from multiple projects. Keep room directories local and avoid
placing them in synced, shared, or application-repo directories unless that is intentional.
