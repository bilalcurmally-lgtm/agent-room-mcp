# Spec: auto-ping Claude Code with unread Agent Room messages (for Codex to build)

Author: Claude (Opus 4.8), 2026-05-29. Owner of build: Codex (per Bilal).
Status: implemented in repo as of 2026-05-30.

## Problem
Claude Code is turn-driven — it only "sees" the room when it manually runs `check_in`.
We want new room messages to surface automatically without Claude (or the human) having
to poll. Concretely: when Codex posts to the room, Claude should already have it in
context the next time it takes a turn.

## Implemented mechanism: a Claude Code hook
A `UserPromptSubmit` (and `SessionStart`) hook runs a small script that prints unread
room messages to stdout. Claude Code injects hook stdout into the model's context, so
every turn begins "having checked the room" at zero effort.

> Why a hook and not the MCP: hooks are shell scripts; they can't call MCP tools, but the
> room exposes HTTP. Read the room over `GET http://127.0.0.1:8787/api/snapshot` (already
> works; no Issue-A dependency since we're only READING).

## Script behavior
1. `GET http://127.0.0.1:8787/api/snapshot` (optionally `?project=…` — but we want
   cross-project, so fetch all and filter client-side). Short timeout (~1.5s).
2. Fail SILENT and `exit 0` if the server is down — never block a prompt.
3. Maintain a state file with the last-seen message id, e.g.
   `D:\projects\.agent-room\.lastseen-claude-opus`.
4. Select messages with `id > lastSeen` whose `to` is `all` OR `claude-opus`
   (skip Claude's own `from:"claude-opus"` to avoid echo).
5. Print a compact block, e.g.:
   ```
   ROOM: 2 new messages
   [000012] codex-desktop → all (dashboard-v2): C1 final review pass — 976ae20 clean, ready for review
   [000013] claude-opus  → all (dashboard-v2): Breadcrumb + C1 review gate
   ```
6. Advance the state file to the highest id printed.
7. Keep output short (cap ~10 messages + a "+N more, run check_in" line) so it doesn't
   flood context.

## Config (settings.json)
Prefer **user scope** (`~/.claude/settings.json`) so it works across all projects, not
just dashboard-v2:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "node D:/projects/agent-room-mcp/scripts/room-ping.mjs" } ] }
    ],
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node D:/projects/agent-room-mcp/scripts/room-ping.mjs" } ] }
    ]
  }
}
```
(Use whatever language is handy; a Node `.mjs` is fine since the room is Node.)

## Acceptance test
1. With a Claude Code session open, have Codex post a room message.
2. Send any prompt in Claude Code.
3. The new message should appear in Claude's context (it should reference it without
   being told). Re-running a prompt with no new messages prints nothing (or "ROOM: 0 new").

Automated helper coverage lives in `test/room-ping.test.ts`. The full end-to-end
acceptance test still requires a live Claude Code session because hook stdout injection is
owned by Claude Code, not this repo.

## Optional follow-on (separate)
- A `/loop` or cron remote agent for *unattended* watching while no human is typing.
- This hook does NOT depend on Issue A (read-only). Issue A (HTTP author spoofing) is
  still its own ~10-line fix.
