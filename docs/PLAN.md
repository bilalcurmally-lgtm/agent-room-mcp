# Agent Room MCP Plan

## 1. North Star

Agent Room MCP is a local, file-backed coordination server for multiple coding agents working
with the same user across one or many repositories.

The product goal is simple: make Codex, Claude/Opus, Cursor agents, and the human user feel like
they are in one auditable project room without relying on a hosted memory service or a Mac-only
orchestrator.

## 2. Problem

Today, multi-agent collaboration is mostly manual:

- The user has to paste messages between agents.
- Agents can claim they "talked to" each other without an audit trail.
- Decisions get scattered across chat transcripts, markdown files, and terminal history.
- Project-specific bridge files become yet another thing mixed into application repos.
- Hosted memory/orchestration tools may be useful, but they are opaque and dependency-heavy.

We need a reusable coordination layer that can run globally across projects while keeping every
message, task, and decision inspectable on disk.

## 3. Product Principles

- **Local-first:** storage is plain files on the user's machine.
- **Auditable:** no agent can claim consensus unless the room has a recorded message or decision.
- **Boring storage:** JSONL for messages, JSON for tasks, Markdown for human-readable decisions.
- **Global or project-scoped:** one room can coordinate all work, or each project can use its own.
- **Tool-native:** agents communicate through MCP tools, not by editing ad hoc markdown inboxes.
- **Human-led:** the user remains product/tech lead; agents can propose, implement, review, and record.

## 4. Current v0

Location:

```text
D:\projects\agent-room-mcp
```

Global command after `npm link`:

```powershell
agent-room-mcp --room D:\projects\.agent-room
```

Implemented MCP tools:

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

Storage files in the configured room directory:

```text
messages.jsonl
tasks.json
decisions.json
decisions.md
agents.json
config.json
```

Verification:

- `npm test` passes.
- `npm run build` passes.
- The MCP command can run after `npm link`.
- The dashboard command can run with `agent-room-dashboard --room D:\projects\.agent-room`.

## 5. Architecture

### Store

`src/store.ts` owns all file-backed persistence.

Responsibilities:

- initialize the room directory
- append messages to `messages.jsonl`
- read messages for a specific agent
- create, claim, list, and update tasks in `tasks.json`
- register agents and track last-read pointers in `agents.json`
- provide a one-call `check_in` view for unread messages, assigned/open tasks, decisions, and room status
- append durable decisions to `decisions.json` and `decisions.md`
- serialize write operations and write JSON files atomically
- surface malformed storage files with recovery guidance instead of silently resetting them
- summarize room status

The store is intentionally independent from MCP so it can be tested directly and reused by a
future CLI or dashboard.

### MCP Server

`src/server.ts` wraps the store with MCP tools using `@modelcontextprotocol/sdk`.

Room path resolution:

1. `--room <path>`
2. `AGENT_ROOM_DIR`
3. `.agent-room`

The server uses stdio transport so it can be configured in MCP clients like Cursor, Claude Code,
Codex environments that support MCP, and similar agent shells.

### Local Dashboard

`src/dashboard.ts` serves a local browser control room backed by the same store.

User workflow:

1. Open the dashboard.
2. Select `All Projects`, `Unsorted`, or a specific project.
3. Post instructions through "Tell the room".
4. Create tasks or record decisions without touching JSON files.
5. Watch agents, messages, tasks, and decisions update from the shared room.
6. Agents continue to check in via MCP using the same project value.

## 6. Collaboration Protocol

Recommended agent roles:

- **User:** product/tech lead; approves priorities and resolves disagreements.
- **Implementer:** owns the current code-writing pass.
- **Reviewer:** reviews the diff against the accepted plan and records findings.
- **Planner:** clarifies scope, risks, milestones, and acceptance criteria.

Rules:

1. Agents call `register_agent` once and `check_in` whenever they start or resume work.
2. Only one agent owns the implementation pen at a time.
3. Reviewers do not edit code while reviewing unless the user explicitly changes ownership.
4. Decisions must be recorded with `record_decision`.
5. Substantial handoffs should use `post_message` and reference task/decision ids.
6. Agents must not claim consensus, handoff, or review unless the room contains the supporting record.
7. A task is not done until tests/build or explicit verification notes are attached.

## 7. Near-Term Roadmap

### R1. Hardening

- DONE: serialized writes and lock-file guarded mutations.
- DONE: atomic writes for JSON storage.
- DONE: corruption handling with clear errors and recovery guidance.
- DONE: input limits for message, task, note, and decision bodies.
- DONE: tests for malformed storage files, concurrent mutations, filters, and input limits.

### R2. MCP Client Integration Docs

- DONE: document shared MCP config using `agent-room-mcp --room D:\projects\.agent-room`.
- DONE: document an implementer + reviewer workflow.
- Document client-specific examples for Codex, Claude/Opus, and Cursor as their exact config shapes
  are validated.

### R3. Agent Registry

- DONE: use `agents.json` for known agents, display names, roles, and last-read message ids.
- DONE: add `register_agent`.
- DONE: add `check_in` as the default room-entry tool for agents.
- DONE: add `mark_messages_read`.
- DONE: add unread counts in `get_room_status`.

### R4. Better Task Workflow

- Add task priority and project/repo fields.
- Add task dependencies.
- DONE: add `list_tasks` with status, owner, and project filters.
- Add `append_task_note`.

### R5. Project Awareness

- DONE: add optional `project` field to messages, tasks, and decisions.
- Add room status by project.
- Support a global room at `D:\projects\.agent-room` while preserving per-project scoping.

### R6. Human Dashboard

- DONE: local browser dashboard for messages, agents, tasks, and decisions.
- DONE: project picker with `All Projects`, `Unsorted`, and discovered projects.
- DONE: "Tell the room" form that posts as `user`.
- DONE: controlled actions for creating tasks and recording decisions.
- Later add task status editing, decision search, and richer agent presence.

## 8. Review Questions

Please review this plan for:

1. Whether the MCP tool surface is the right minimum viable "agent room."
2. Whether local file storage is sufficient for v0 or whether concurrency demands locking now.
3. Whether `lineage`/audit-style discipline from the dashboard project should be copied here as
   formal decision/task provenance.
4. Whether the roadmap should prioritize MCP client integration docs before storage hardening.
5. Any security/privacy concerns from exposing a global local room across projects.

## 9. Non-Goals For v0

- Hosted sync.
- Cloud auth.
- Multi-user network server.
- Autonomous background agent runner.
- Replacing Git, GitHub, Linear, or project-specific specs.
- Hidden semantic memory that cannot be inspected or edited by the user.

## 10. Success Criteria

The first useful milestone is reached when:

- Codex and Opus can both connect to the same MCP room.
- The user can ask one agent to implement and another to review without copy-pasting messages.
- The room contains a durable task, message, and decision trail.
- The tool can be reused from another repo without copying files into that repo.
