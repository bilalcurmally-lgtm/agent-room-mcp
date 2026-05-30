# Claude Code integration issues (from Claude's first room session)

Author: Claude (Opus 4.8), via Claude Code, 2026-05-29.
Context: first live multi-agent session in `D:\projects\.agent-room` (project
`agent-room-mcp`). The human (Bilal), Codex Desktop, and Claude Code all tried to
talk in the room. The round-trip works, but two things initially stopped Claude from
being a first-class participant.

Status: resolved in repo as of 2026-05-30.

## TL;DR

1. **HTTP `/api/messages` hardcoded the author.** Fixed. The dashboard API now preserves
   explicit `from`, `to`, `source`, and `replyTo`, while still defaulting dashboard user
   messages to `from: "user"` and `to: "all"`.
2. **The MCP tools don't load mid-session.** The `agent-room` MCP server is correctly
   registered for Claude Code (`claude mcp list` → `agent-room … ✓ Connected`), but its
   tools (`post_message`, `read_messages`, `check_in`, …) are not callable in a Claude
   Code session that was already running when the server was added. **No code fix — a
   sequencing/usage note.** Resolution: restart the Claude Code session.

What already works: the MCP path carries identity correctly; reading the room over
HTTP via `GET /api/snapshot` works; the append-only store and task board work.

---

## Issue A — HTTP dashboard erases agent identity — RESOLVED 2026-05-30

### Where
`src/dashboard.ts`, the `POST /api/messages` handler (currently ~lines 108–120):

```ts
if (method === "POST" && url.pathname === "/api/messages") {
  const body = await readJsonBody(request);
  const message = await store.postMessage({
    from: "user",        // <-- hardcoded
    to: "all",           // <-- hardcoded
    topic: typeof body.topic === "string" ? body.topic : "User note",
    body: requireString(body.body, "body"),
    project: optionalProject(body.project),
    source: "dashboard"
  });
  sendJson(response, 201, message);
  return;
}
```

Caller-supplied `from`, `to`, and `replyTo` are ignored. Observed live: Claude posted
`{"from":"claude-opus","to":"codex-desktop",...}` and the stored record came back
`{"from":"user","to":"all",...}` (room messages `000003` and `000007`).

### Why it matters
This is a **3-party** room (human + Codex + Claude). If two of the three collapse into
`from:"user"`, nobody downstream (or in the UI, or in `read_messages`) can tell who said
what. Attribution is the whole point of a shared decision room.

### Why the MCP path is fine (use it as the model)
`src/server.ts` `post_message` already trusts an explicit `from`/`to`
(`MessageInput = { from: z.string().min(1), to: z.string().min(1), … }`). The store
(`AgentRoomStore.postMessage`) accepts `{from,to,topic,body,project,source,replyTo}` and
assigns `id`/`time`. There is no auth anywhere, so trusting body fields over HTTP is
consistent with how MCP already behaves.

### Fix
The dashboard `POST /api/messages` handler accepts optional identity from the JSON body,
defaulting to the current human dashboard behavior:

```ts
from:    typeof body.from === "string" && body.from.length > 0 ? body.from : "user",
to:      typeof body.to === "string"   && body.to.length   > 0 ? body.to   : "all",
topic:   typeof body.topic === "string" ? body.topic : "User note",
body:    requireString(body.body, "body"),
project: optionalProject(body.project),
source:  typeof body.source === "string" && body.source.length > 0 ? body.source : "dashboard",
replyTo: typeof body.replyTo === "string" ? body.replyTo : undefined
```

Optional future hardening:
- If `from` is not in `listAgents()`, either reject with 400 ("unknown agent, register
  first") or keep it but tag it — your call. Trusting it is fine for a localhost tool.
- The dashboard composer (`src/dashboard-ui.ts`) currently sends only `{body, project}`.
  Add a small "post as" `<select>` populated from `snapshot.agents` so a human at the UI
  can also attribute a message to an agent when relaying. Low priority.

### Test coverage
`test/dashboard.test.ts` posts to `/api/messages` with explicit `from`, `to`, `source`,
and `replyTo`, then asserts the stored message preserves them. The existing dashboard
message test covers the default `user` -> `all` behavior.

---

## Issue B — MCP tools don't surface in an already-running Claude Code session (no code fix) — ✅ RESOLVED 2026-05-29

**Resolved.** After a fresh Claude Code session restart, the `agent-room` MCP tools
loaded and Claude (`claude-opus`) ran the full sequence below: `register_agent` →
`check_in` (pulled all unread + the C1 handoff) → `post_message`. The MCP post landed as
room message `000010` with `from:"claude-opus"` (verified by reading it back from the
store via `read_messages` — persisted record shows `claude-opus`, not `user`). So the MCP
path attributes correctly and the restart caveat is the whole fix. Issue A below is still
a real fix for the HTTP/UI poster path.

### Symptom
In this session, Claude could not call `post_message`/`read_messages`/`check_in`, so it
fell back to raw HTTP (which then hit Issue A). But:

```
$ claude mcp list
agent-room: node D:\projects\agent-room-mcp\dist\server.js --room D:\projects\.agent-room - ✓ Connected
```

The server is registered and healthy. The tools just aren't loaded into *this*
conversation, because Claude Code surfaces a server's tools at **session start**. The
`agent-room` entry was added after this session began (same thing happened earlier with
the `jcodemunch` MCP — a known pattern here).

### Resolution (no code change)
- Start a **fresh** Claude Code session (the registration persists in user scope).
- On the new session, Claude should:
  1. `register_agent { agent: "claude-opus", displayName: "Claude (Opus 4.8)", role: "implementation + review" }`
  2. `check_in { agent: "claude-opus", project: "agent-room-mcp" }` to pull unread + tasks.
  3. `post_message { from: "claude-opus", to: "all", topic: "…", body: "…", project: "agent-room-mcp" }`
- After that, Claude's messages are attributed to `claude-opus` and Issue A no longer
  blocks Claude specifically (though A is still worth fixing for the UI and any other
  HTTP poster).

### Repo documentation
`README.md` now includes a Claude Code setup section:
```
claude mcp add --scope user agent-room -- node D:/projects/agent-room-mcp/dist/server.js --room D:/projects/.agent-room
# then RESTART any running Claude Code session so the tools load
```
The user guide also calls out the restart caveat.

---

## How to reproduce / verify

1. Build: `npm run build` (server + dashboard compile to `dist/`).
2. Start dashboard, post over HTTP with an explicit author:
   `Invoke-RestMethod -Uri http://127.0.0.1:8787/api/messages -Method Post -ContentType application/json -Body '{"from":"claude-opus","to":"all","topic":"t","body":"hi","project":"agent-room-mcp"}'`
   → stored record should now show `from:"claude-opus"`, not `user`.
3. From a freshly started Claude Code session, call `check_in`/`post_message` and confirm
   the message lands in `D:\projects\.agent-room\messages.jsonl` with `from:"claude-opus"`.

## Notes / non-issues
- Trailing `ERROR codex_core::session: failed to record rollout items: thread … not
  found` lines seen elsewhere are from the Codex CLI, unrelated to this server.
- The store is append-only JSONL; concurrent writers (dashboard HTTP + MCP) both open the
  same `roomDir`. If you ever see interleaved/corrupted lines under heavy concurrent
  posting, that's a separate hardening task (atomic append / file lock) — not observed yet.
