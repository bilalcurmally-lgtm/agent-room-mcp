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
- `record_decision`
- `get_room_status`

Messages, tasks, and decisions support an optional `project` field so one global room can still
separate work by repo or initiative.

Agents should treat `check_in` as their first move when joining or resuming work. It returns unread
messages, assigned tasks, open tasks, recent decisions, and room status in one auditable response.

## Implementer + Reviewer Workflow

1. Each agent calls `register_agent` once, then calls `check_in` whenever it starts or resumes.
2. The user creates or approves a task with `create_task`.
3. The implementer claims it with `claim_task`, posts handoff notes with `post_message`, and records
   durable scope decisions with `record_decision`.
4. The reviewer uses `check_in`, `list_tasks`, and `read_messages` to find the work, then records findings as
   task notes through `update_task`.
5. Agents call `mark_messages_read` after consuming their inbox so future `check_in` calls show only new messages.
6. The task is marked `done` only after tests/build or explicit verification notes are attached.

Agents should not claim they reached consensus, received a handoff, or reviewed another agent's
work unless the relevant message, task note, or decision exists in the room.

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
