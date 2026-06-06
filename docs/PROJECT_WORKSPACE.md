# Project Workspace vs View Filter

Last updated: 2026-06-05

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

Agents do not have a separate “set workspace” tool yet; pass `project` on writes or register projects
with `register_project` and tag messages consistently. Dashboard `activeProject` applies to human
posts from the control room only unless agents also send `project` on each tool call.