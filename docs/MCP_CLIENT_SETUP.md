# MCP Client Setup

Last updated: 2026-06-05

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

## Automated Verification

After `npm run build`, verify that the MCP server works the same way each client
invokes it (stdio subprocess + tool calls):

```powershell
cd D:\projects\agent-room-mcp
npm run verify-clients
```

This runs the verification ritual for Claude Code, Codex, and Cursor agent profiles.
It checks tool registration, `register_agent`, `check_in`, `post_message`, and room
storage. Exit code `0` means all three profiles passed.

To keep the temporary room for inspection:

```powershell
npm run verify-clients -- --keep-room
```

To verify against your real global room:

```powershell
npm run verify-clients -- --room D:\projects\.agent-room
```

`npm test` also runs the same checks in `test/mcp-client-verification.test.ts`.

## Verification Ritual

After setup, each agent should do this before real work:

```text
1. Call register_agent with a stable agent id.
2. Call set_active_project for the project being worked.
3. Call check_in without a project and confirm it inherits activeProject.
4. Post a hello message without project and confirm it lands under the active project.
5. Confirm the dashboard shows the message with the right sender.
```

Example agent ids:

```text
codex-desktop
claude-opus
cursor
```

### Manual confirmation in each app

Automated verification proves the MCP server and room storage. You still need one
manual pass per client after adding MCP config:

| Client | Config action | Restart required | Dashboard check |
| --- | --- | --- | --- |
| Claude Code | `claude mcp add ...` (see below) | Yes — new session | Feed shows `claude-opus` message |
| Codex | Add `[mcp_servers.agent_room]` TOML | Yes | Feed shows `codex-desktop` message |
| Cursor | Add `agent-room` to MCP JSON | Yes | Feed shows `cursor` message |

If `npm run verify-clients` passes but a GUI client shows no tools, the config path or
restart step is wrong — not the server.

## Claude Code Setup

Config is managed through the Claude Code CLI (`claude mcp`). On Windows, user-scope
entries apply across projects. List servers with:

```powershell
claude mcp list
```

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
  "agent": "claude-opus"
}
```

## Codex Setup

Add this MCP server to the Codex MCP config TOML used by your Codex environment. The
exact file path depends on your Codex install; look for the config that already
contains `[mcp_servers]` entries and add `agent_room` beside them.

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
  "agent": "codex-desktop"
}
```

## Cursor Setup

Cursor MCP configuration is JSON. Use Cursor **Settings → MCP** or your user/project
MCP config file. Add an `agent-room` server entry using the same room:

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
  "agent": "cursor"
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

- Run `get_room_config` and confirm `activeProject` is the project you expect.
- Use `set_active_project { "project": "agent-room-mcp" }` before assigning project work.
- Pass `"project": "all"` only when an agent intentionally needs the whole room.
- Use `Unsorted` in the dashboard to find messages posted without a project.
