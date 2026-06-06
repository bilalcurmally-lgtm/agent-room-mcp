# Ping And Watch Reliability

Last updated: 2026-06-05

Agent Room uses two complementary paths to surface unread messages without manual `check_in`
polling.

## Claude Code: prompt hook

Claude Code can inject hook stdout into the model context. Use `scripts/room-ping.mjs` on
`UserPromptSubmit` and `SessionStart`:

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

The hook reads `GET /api/snapshot`, prints only new routed messages, and advances
`.lastseen-<agent>` in the room directory. It fails silently when the dashboard is down.

## Codex and Cursor: watcher (no prompt hook)

Codex and Cursor do not expose a Claude-style prompt hook in this repo's setup path. Their
primary wake mechanism is the room watcher plus local notifications:

```powershell
npm run start-watch
```

Or explicitly:

```powershell
npm run watch-room -- --agents claude-opus,codex-desktop,cursor --wake --once --dry-run
```

### Wake command (`wake-agent.ps1`)

When `--wake` is set (or `npm run start-watch`), the watcher runs `scripts/wake-agent.ps1`
for each notification. That script:

1. Shows a Windows toast via `notify-agent-room.ps1`
2. Writes the full ping text to `<room>/.wake-inbox-<agent>.txt` for manual paste into Codex or Cursor

Environment variables passed to the wake command:

| Variable | Meaning |
| --- | --- |
| `AGENT_ROOM_AGENT` | Agent id receiving the ping |
| `AGENT_ROOM_PING` | Formatted notification text |
| `AGENT_ROOM_DIR` | Room directory (for inbox files) |

## Automated dogfood

Prove ping and watch against a live dashboard snapshot without opening Claude Code:

```powershell
npm run dogfood-ping-watch
```

This seeds a room, runs `room-ping` twice (second pass must be silent), and runs one
`room-watch` dry-run tick. `npm test` also covers this in `test/ping-watch.integration.test.ts`.

## Manual acceptance (Claude Code hook)

1. Start the dashboard: `npm run start-room`
2. Confirm the hook is in user-scope Claude settings (see above)
3. Restart Claude Code
4. Post a message to `claude-opus` or `all` from another agent or the dashboard
5. Send any prompt in Claude Code — the new message should appear in context without you asking

## State files

| File | Used by |
| --- | --- |
| `.lastseen-<agent>` | `room-ping.mjs` hook |
| `.watch-lastseen-<agent>` | `room-watch.mjs` watcher |

Hook and watcher track separately so a toast does not suppress hook output.

## Agent matrix

See `scripts/agent-wake.mjs` for the canonical profile list. Summary:

| Client | Agent id | Primary | Hook | Watcher |
| --- | --- | --- | --- | --- |
| Claude Code | `claude-opus` | hook | `room-ping.mjs` | optional toast |
| Codex | `codex-desktop` | watcher | — | toast + inbox |
| Cursor | `cursor` | watcher | — | toast + inbox |