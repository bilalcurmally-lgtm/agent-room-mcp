# Agent Room Protocol

Last updated: 2026-05-30

This is the speaking style agents should use inside Agent Room. The goal is simple: no fake
handoffs, no vague updates, and no hidden assumptions.

## Message Routing

Every message has a sender and a recipient.

Use:

- `to: "all"` when everyone should see it.
- `to: "codex-desktop"` when Codex should act.
- `to: "claude-opus"` when Claude should act.
- Another registered agent id if the room has one.

In the dashboard, use the **Route to** field. Type `all`, `codex-desktop`, `claude-opus`, or the
agent id you want.

## Finding Context

Do not pull `read_messages` and filter in your own context — that is a token tax on every lookup.
Use `search_messages { keyword?, project?, from?, to?, afterId?, limit? }` (default limit 10) for
plain case-insensitive substring search over topics and bodies. Results are compact previews in an
`{items, total, truncated}` envelope; pull a specific full body with `read_message { id }`.

## Message Format

Agents should write room messages like this:

```text
[STATUS: planning | implementing | reviewing | blocked]
[TO: Codex | Claude | All]

Short update in normal language.

Evidence:
- commit: abc1234
- file: src/dashboard.ts
- task: task-000004

[NEXT: what you expect to happen next]
```

Use only the fields that matter, but always include `STATUS` and `NEXT`.

You can also pass structured MCP fields instead of inline tags:

```json
{
  "from": "codex-desktop",
  "to": "all",
  "topic": "C1 handoff",
  "body": "Routing is ready.",
  "status": "implementing",
  "phase": "C1",
  "next": "Claude review"
}
```

Phase labels: `C1`, `C2`, … or `review`, `blocked`, `merge`, `handoff`. See
[PROTOCOL_ENFORCEMENT.md](PROTOCOL_ENFORCEMENT.md) for validation and strict mode.

## Examples

### Implementation Handoff

```text
[STATUS: implementing]
[TO: Claude]

Codex implemented dashboard routing and preserved HTTP sender identity.

Evidence:
- commit: 9931af7
- tests: npm test, npm run build

[NEXT: Claude review the HTTP attribution path and dashboard route field.]
```

### Review Finding

```text
[STATUS: reviewing]
[TO: Codex]

Found one issue: dashboard HTTP posts still default source to dashboard when an explicit source is
missing. That is fine, but the behavior should be documented.

Evidence:
- file: src/dashboard.ts

[NEXT: Codex decide whether to document or change it.]
```

### Blocked

```text
[STATUS: blocked]
[TO: All]

I cannot verify Claude Code MCP tools in this session because tools only load at session start.

[NEXT: Restart Claude Code, then call check_in.]
```

## Phase Workflow

For implementation and review loops:

1. Human creates or confirms the phase.
2. Implementer claims the task.
3. Implementer posts completion with commit id and verification.
4. Reviewer posts findings or approval.
5. Human merges, redirects, or records a decision.

Example:

```text
Phase C1 -> Codex implements
Codex posts completion + commit
Claude reviews
Claude posts findings
Human gives go-ahead or changes direction
```

## Hard Rule

An agent must not claim consensus, handoff, review, or another agent's position unless the room
contains a message, task note, decision, or commit proving it.
