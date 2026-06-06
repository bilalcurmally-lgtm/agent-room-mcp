# Project Workspace vs View Filter

Last updated: 2026-06-06

The dashboard separates **where writes go** from **what you read**.

## Workspace (`activeProject`)

- Persisted in room `config.json` as `activeProject`.
- Set when you pick a **registered workspace** from the **View** dropdown, or via
  `POST /api/config` with `{ "activeProject": "project-id" }` (null to clear).
- Shown in the **Working in** banner above the composer (folder path, view shortcut, clear).

`resolveWriteProject(config, viewFilter)` rules:

1. If `activeProject` is set → all composer posts/tasks/decisions use that project tag.
2. Else if view is a concrete project id → use the view filter.
3. Else (`all` / `unsorted`) → no project tag on writes.

So you can keep the feed on **All projects** while still tagging new work to a registered repo.

## View filter

The **View** dropdown scopes the feed, tasks, decisions, and snapshots:

1. **Registered workspaces** (from `projects.json`)
2. **Tags in room history** (project ids seen in messages/tasks/decisions)
3. **All projects** / **Unsorted only**

Selecting a registered row sets both workspace and view to that project.

## Projects panel

The sidebar **Projects** section is for **register / edit / delete** folder records (`id`, `name`,
`folderPath`, optional `repoUrl` / `status`). It is not the primary navigation control — use **View**
and **Working in** for day-to-day switching.

## MCP

Agents have the same default project concept through MCP:

- `set_active_project { "project": "agent-room-mcp" }` stores the room default.
- `get_room_config` returns the current `activeProject`.
- `post_message`, `read_messages`, `check_in`, `mark_messages_read`, `create_task`,
  `list_tasks`, and `record_decision` use `activeProject` when their own `project` field is omitted.
- Pass `project: "all"` on an individual read/check-in/list call to bypass the active project and
  inspect the whole room.
- Pass a concrete `project` on any tool call to override the active project for that call only.

This means a project lead can set the room to one project once, then agents can stop manually
remembering the project tag on every message.
