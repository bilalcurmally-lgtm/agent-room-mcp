# Agent Room Context Budget

The room is the live coordination layer. Obsidian/Markdown is the durable memory
layer. Wake turns must not load the whole room by default.

## Default Flow

1. A watcher receives a tiny wake event with new message ids.
2. The agent calls `check_in_compact` with broadcasts enabled.
3. The agent acts from the compact delta when possible.
4. The agent escalates to `read_messages`, full `check_in`, or Obsidian files only
   when the compact delta is not enough.
5. The agent marks messages read after consuming them.

## Token Rules

- Wake prompts carry ids and routing context, not full history.
- `check_in_compact` returns previews, active task headers, alert counts, and
  recent decision headers.
- Full message bodies and stale item lists are explicit follow-up reads.
- Obsidian memory files are summaries, not automatic prompt stuffing.

## Obsidian Export

Obsidian integration is file based. Run:

```powershell
npm run export-memory -- --project agent-room-mcp
```

By default this writes Markdown to:

```text
D:\projects\.agent-room\obsidian\agent-room-mcp
```

Open that folder as an Obsidian vault, or pass `--vault <path>` to write into an
existing vault.

Generated files:

- `Current State.md`
- `Backlog.md`
- `Decisions.md`
- `Wake Contract.md`

Agents should reference these files by path and read only the needed section.

## Wake Doctor

Run a single diagnostic before blaming the model or the room:

```powershell
npm run build
npm run doctor-wake -- --agent codex-desktop --dashboard-url http://127.0.0.1:4777
```

The doctor checks:

- compiled MCP server exists and exposes `check_in_compact`
- compact check-in works for the target agent
- dashboard snapshot is reachable
- watcher scheduled task is installed/queryable
- watcher marker, pid, cursor, budget, and log files are present

Use `--skip-task` for manual watcher sessions, `--skip-dashboard` when testing
only MCP/storage, and `--agent claude-opus` to inspect another client profile.
