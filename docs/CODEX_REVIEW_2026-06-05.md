# Codex Review Packet — Agent Room MCP

**Date:** 2026-06-05  
**Repo:** `D:\projects\agent-room-mcp`  
**Live room (vault):** `D:\projects\.agent-room`  
**Git:** Grok/Composer changes were reviewed by Codex after handoff. Commit/push status is tracked
in the follow-up summary for this session.

Use this document as the single handoff for a Codex review pass: what shipped, how to verify, known
limits, and file-level map.

---

## Executive summary

Backlog priorities **2 through 8**, plus **6.5** (roadmap honesty), **9** (active workspace), and
**10** (attachments MVP) are implemented. The dashboard received a full UI pass (typography, layout,
collapsible panel, roadmap moved to sidebar, denser empty states, workspace banner). **91 tests**
pass (`npm run build && npm test`).

Two user-reported gaps from the “BTW” briefing were addressed:

| Topic | Before | After |
|-------|--------|-------|
| Project selection | Header filter only; “All projects” → no write tag | `activeProject` workspace + **Working in** banner; `resolveWriteProject` |
| Attachments | Not supported | Room `attachments/` + MCP upload/link + dashboard file picker |

---

## Verification commands

```powershell
cd D:\projects\agent-room-mcp
npm run build
npm test
npm run verify-clients
npm run start-suite
```

Open dashboard (default `http://127.0.0.1:4777`). After pull, restart suite so UI/API changes load.

Dogfood ping/watch (optional):

```powershell
npm run dogfood-ping-watch
```

---

## Backlog completion matrix

| Priority | Title | Status | Key artifacts |
|----------|-------|--------|----------------|
| 1 | Project registry | DONE (prior) | `projects.json`, `register_project`, dashboard Projects panel |
| 2 | Task editing | DONE | `update_task`, `append_task_note`, inline task buttons in UI |
| 3 | Search & history | DONE | Snapshot filters, **Mine** preset, `currentUser` in config |
| 4 | MCP client setup | DONE | `src/verify-mcp-clients.ts`, `docs/MCP_CLIENT_SETUP.md` |
| 5 | Ping/watch | DONE | `scripts/room-ping.mjs`, `room-watch.mjs`, `docs/PING_WATCH.md`, wake paths |
| 6 | Protocol enforcement | DONE | `src/protocol.ts`, dashboard warnings, `docs/PROTOCOL_ENFORCEMENT.md` |
| 6.5 | Roadmap honesty | DONE | `src/room-progress.ts` — file vs room evidence |
| 7 | Easy launcher | DONE | `scripts/start-agent-room-suite.ps1`, `docs/LAUNCHER.md` |
| 8 | Temporal awareness | DONE | `src/temporal.ts` — relative time, follow-ups, stale message/decision hints |
| 9 | Active workspace | DONE | `activeProject`, workspace banner, `test/workspace.test.ts` |
| 10 | Attachments | DONE (MVP) | `src/attachments.ts`, MCP tools, `docs/ATTACHMENTS.md` |

---

## Priority 9 — Active workspace (detail)

**Problem:** `Project` dropdown only filtered the UI. `projectForWrite()` tagged writes only when the
filter was a real project id, so **All projects** meant untagged posts.

**Solution:**

- `config.json` field `activeProject`
- `resolveWriteProject(config, viewFilter)` in `src/store.ts`
- Dashboard **View** dropdown: registered workspaces → history tags → All/Unsorted
- **Working in** banner on composer with folder path and clear/view actions
- Snapshot fields `writeProject` and `workspace`

**Docs:** `docs/PROJECT_WORKSPACE.md`

---

## Priority 10 — Attachments (detail)

**Policy:**

- Files under `<room>/attachments/`; index in `attachments.json`
- 5 MB max; MIME allowlist (text, image, pdf, json, zip, Office XML)
- http(s) links inline or via `link_attachment`

**MCP tools added:**

- `upload_attachment`
- `link_attachment`
- `list_attachments`

**Extended tools:**

- `post_message` — `attachmentIds`, `links`
- `append_task_note` — same
- `record_decision` — `attachmentIds`, `linkAttachments` (legacy `links` strings unchanged for non-URLs)

**Dashboard:**

- `POST /api/attachments`, `GET /api/attachments/:id`
- Composer file picker + pending ids on send
- Feed renders attachment chips

**Tests:** `test/attachments.test.ts`, `test/attachments-store.test.ts`

**Docs:** `docs/ATTACHMENTS.md`

**Deferred:** MCP resources, quotas, thumbnails, virus scan.

---

## Dashboard UI changes (cross-cutting)

- IBM Plex Sans/Mono, zinc/teal palette, toolbar, progress pills
- Main column = **Room Feed** only; roadmap in collapsible sidebar
- Right panel: Overview, Roadmap, Alerts, Tasks, Projects, Decisions (`<details>`)
- Panel hide/show + `localStorage`
- Empty states: title + hint copy
- Header roadmap chip jumps to sidebar roadmap

**Files:** `src/dashboard-ui.ts`, `src/dashboard.ts`, `test/dashboard.test.ts`

---

## Core source map (new or heavily touched)

| Area | Files |
|------|--------|
| Store / room IO | `src/store.ts` |
| Attachments policy | `src/attachments.ts` |
| MCP server | `src/server.ts` |
| Dashboard API + snapshot | `src/dashboard.ts` |
| Dashboard UI | `src/dashboard-ui.ts` |
| Protocol | `src/protocol.ts` |
| Progress / roadmap | `src/room-progress.ts` |
| Temporal | `src/temporal.ts` |
| MCP verify | `src/verify-mcp-clients.ts` |
| Scripts | `scripts/room-ping.mjs`, `room-watch.mjs`, `start-agent-room-suite.ps1`, `wake-agent.ps1` |
| Tests | `test/*.test.ts` (16 files, 91 tests) |

---

## Vault sync (`D:\projects\.agent-room`)

The live room directory mirrors key docs at its **root** (not `docs/`). This packet update copies:

- `BACKLOG.md`
- `ROADMAP.json`
- `CODEX_REVIEW_2026-06-05.md`
- `ATTACHMENTS.md`
- `PROJECT_WORKSPACE.md`
- `AGENT_PROTOCOL.md`, `USER_GUIDE.md`, `MCP_CLIENT_SETUP.md`, `PING_WATCH.md`, `LAUNCHER.md`,
  `PROTOCOL_ENFORCEMENT.md` (when changed in repo)

Room **data** (`messages.jsonl`, `config.json`, etc.) is unchanged by this work except new rooms
gain `attachments.json` + `attachments/` on first open after upgrade.

---

## Review checklist for Codex

1. **Correctness:** `resolveWriteProject` + attachment resolution on concurrent writes (room lock).
2. **Security:** attachment MIME/size limits; path traversal in file names; dashboard only binds localhost.
3. **UX:** workspace banner vs view filter confusion; attachment remove chip; feed link targets.
4. **Protocol:** `post_message` body still drives protocol warnings when `enforceProtocol` is on.
5. **Compat:** old rooms without `attachments.json` — `ensureRoom` creates empty index.
6. **Docs:** vault copies match `docs/` in repo.
7. **Gaps:** no `set_active_project` MCP tool; no default project in config beyond `activeProject`.

---

## Suggested review order

1. Read `docs/PROJECT_WORKSPACE.md` and `docs/ATTACHMENTS.md`
2. Skim `src/store.ts` — `resolveWriteProject`, `uploadAttachment`, `postMessage`
3. Run `npm test` and spot-check dashboard composer + feed
4. Optional: `npm run verify-clients` against a temp room

---

## User constraints for this handoff

- User has now asked Codex to update GitHub after review/fixes.
- Restart dashboard/suite after deploying local build to dogfood workspace + attachments.
