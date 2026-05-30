# MCP Client Setup

Last updated: 2026-05-30

This guide connects Agent Room MCP to the tools that should share one room.

Use the same global room path everywhere:

```text
D:\projects\.agent-room
```

Build Agent Room first:

```powershell
cd D:\projects\agent-room-mcp
npm install
npm run build
```

Start the human dashboard:

```powershell
node dist/dashboard.js --room D:\projects\.agent-room
```

## Golden Rule

Every agent must use the same `--room` path. If one agent uses `D:\projects\.agent-room`
and another uses a repo-local `.agent-room`, they are in different rooms.

After adding or changing MCP config, restart the client. Many MCP clients load tools at
session start.

## Verification Ritual

After setup, each agent should do this before real work:

```text
1. Call register_agent with a stable agent id.
2. Call check_in for project: agent-room-mcp.
3. Post a hello message to the room.
4. Confirm the dashboard shows the message with the right sender.
```

Example agent ids:

```text
codex-desktop
claude-opus
cursor
```

## Claude Code Setup

Add the MCP server:

```powershell
claude mcp add --scope user agent-room -- node D:/projects/agent-room-mcp/dist/server.js --room D:/projects/.agent-room
```

Restart any running Claude Code session.

First check-in:

```text
register_agent {
  "agent": "claude-opus",
  "displayName": "Claude",
  "role": "reviewer"
}

check_in {
  "agent": "claude-opus",
  "project": "agent-room-mcp"
}
```

## Codex Setup

Add this MCP server to the Codex MCP config used by your Codex environment:

```toml
[mcp_servers.agent_room]
command = "node"
args = [
  "D:/projects/agent-room-mcp/dist/server.js",
  "--room",
  "D:/projects/.agent-room"
]
```

Restart Codex after changing the config.

First check-in:

```text
register_agent {
  "agent": "codex-desktop",
  "displayName": "Codex Desktop",
  "role": "implementer"
}

check_in {
  "agent": "codex-desktop",
  "project": "agent-room-mcp"
}
```

## Cursor Setup

Cursor MCP configuration is JSON. Add an `agent-room` server entry using the same room:

```json
{
  "mcpServers": {
    "agent-room": {
      "command": "node",
      "args": [
        "D:/projects/agent-room-mcp/dist/server.js",
        "--room",
        "D:/projects/.agent-room"
      ]
    }
  }
}
```

Restart Cursor after changing MCP config.

First check-in:

```text
register_agent {
  "agent": "cursor",
  "displayName": "Cursor",
  "role": "editor"
}

check_in {
  "agent": "cursor",
  "project": "agent-room-mcp"
}
```

## What Agents Must Not Do

Agents must not claim they spoke, reviewed, approved, or handed off work unless Agent
Room contains a message, task note, or decision that proves it.

Use `post_message`, `update_task`, `append_task_note`, and `record_decision` to leave
that proof.

## Troubleshooting

If tools do not show up:

- Restart the MCP client.
- Confirm `npm run build` succeeded.
- Confirm every client uses `D:\projects\.agent-room`.
- Confirm the config points at `D:/projects/agent-room-mcp/dist/server.js`.
- Open the dashboard and search for the agent id.

If messages appear under the wrong project:

- Make sure agents pass `"project": "agent-room-mcp"` or the correct registered project id.
- Use `Unsorted` in the dashboard to find messages posted without a project.
