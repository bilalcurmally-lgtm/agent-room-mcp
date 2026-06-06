# Codex Review Packet — Agent Room MCP (UI + Global Notifications)

**Date:** 2026-06-06  
**Repo:** `D:\projects\agent-room-mcp`  
**Live room (vault):** `D:\projects\.agent-room`  
**Prior packet:** `docs/CODEX_REVIEW_2026-06-05.md` (backlog items 2–10, attachments, workspace)

Use this document as the handoff for Codex's next review pass. It covers the dashboard UI overhaul
and the room-wide notification system added after the 2026-06-05 packet.

---

## Executive summary

Two major deliverables shipped in this session:

| Area | What changed |
|------|----------------|
| **Dashboard UI** | Full redesign to **Dark Inbox Command Center** — feed-first layout, dark OKLCH tokens, minimal top bar, left nav, slide-over filters, collapsed composer, project grouping in feed, inline task actions (no `prompt()`). |
| **Global notifications** | Room-wide `@mention` alerts for **all joined agents** (Codex, Claude, Grok, Antigravity, Cursor, user). Not Claude-only. Embedded notifier in dashboard + Notifications panel. |

**104 tests pass** (`npm run build && npm test`).

---

## Verification commands

```powershell
cd D:\projects\agent-room-mcp
npm run build
npm test
npm run verify-clients
npm run start-room
```

Open dashboard (default `http://127.0.0.1:4777`). Restart after pull so UI + notifier load.

Optional dogfood:

```powershell
npm run dogfood-ping-watch
```

Manual acceptance for notifications:

1. Start dashboard: `npm run start-room`
2. Register agents: `register_agent` for `codex-desktop`, `grok`, etc.
3. Post `@codex ping` or `@all standup` from dashboard or another MCP client
4. Check **Notify** panel in dashboard sidebar — should show delivery to targeted agents only
5. Check room dir for `.wake-inbox-<agent>.txt` and Windows toast (if `wake-agent.ps1` available)

---

## Dashboard UI overhaul

**Design direction:** Dark Inbox Command Center (see `PRODUCT.md` for principles).

**Key UX changes:**

- **Feed first** — room conversation is the primary canvas; filters in slide-over + chips (Today / Week / Mine / Review)
- **Dark theme** — OKLCH tokens, IBM Plex Mono + Inter, minimal chrome
- **Left nav** — Overview / Tasks / Decisions / Alerts / Projects / Roadmap / **Notify**
- **Composer** — collapsed by default; **Enter to send**, **Shift+Enter** for newline; `@all`, `@codex`, `@grok`, `@claude` in placeholder
- **Route presets** — To all, To Codex, To Claude, To Grok, To Antigravity
- **Project grouping** — when view filter is "All projects", feed groups messages by project with sticky headers
- **Inline task actions** — no `window.prompt()`; actions in feed cards
- **Notifications panel** — live notifier status, per-agent unread, recent deliveries

**Files:**

| File | Role |
|------|------|
| `src/dashboard-ui.ts` | HTML/CSS/JS for entire control room |
| `src/dashboard.ts` | API routes, snapshot, message routing, notifier wiring |
| `test/dashboard.test.ts` | UI + API coverage (26 tests) |
| `PRODUCT.md` | Design brief (users, principles, anti-references) |

---

## Global room notifications (not Claude-only)

**Problem:** Ping/watch was documented as Claude hook vs Codex watcher — felt Claude-specific.
User wanted a **global** system: once agents join the room, anyone posting `@all` or `@agent` alerts
only the targeted **active** (registered) agents.

**Solution:**

### Embedded room notifier

When the dashboard runs, `RoomNotifier` (`src/room-notify.ts`) polls every 5s and delivers to every
**registered** agent from `agents.json`:

1. Windows toast via `scripts/wake-agent.ps1`
2. Full ping text to `<room>/.wake-inbox-<agent>.txt`
3. Delivery log in `<room>/notifications.jsonl`

Posting from the dashboard triggers an **immediate** notifier tick (no 5s wait).

### Mention routing

`src/routing.ts` parses `@mentions` in message bodies:

| Post | Who gets alerted |
|------|------------------|
| `@all` / broadcast | Every joined agent except sender |
| `@codex`, `@grok`, etc. | Only that agent **if joined** |
| Multiple `@mentions` | Only named joined agents (not whole room) |

**Unjoined agents are ignored** — `@grok` does nothing until `grok` has called `register_agent`.

Aliases: `codex` → `codex-desktop`, `claude` → `claude-opus`, `grok` → `grok`, `antigravity` → `antigravity`.

### API

- `GET /api/notifications` — notifier status, per-agent unread, recent deliveries
- Dashboard **Notify** nav section renders this live

### Launcher changes

- `npm run start-suite` — dashboard + embedded notifier only (no external watcher by default)
- `-WithWatch` on `scripts/start-agent-room-suite.ps1` — optional redundant external watcher
- `start-room-watch.ps1` default agents: `auto` (all registered from snapshot)

### Claude hook (optional extra)

Claude can still use `scripts/room-ping.mjs` hook for context injection. Global notifier delivers
toast/inbox to Claude too; hook is additive, not required.

**Docs:** `docs/PING_WATCH.md` (rewritten 2026-06-06), `docs/LAUNCHER.md`

**Agent profiles:** `scripts/agent-wake.mjs` — grok, antigravity added to wake matrix

---

## Core source map (this session)

| Area | Files |
|------|--------|
| Routing / mentions | `src/routing.ts` |
| Room notifier | `src/room-notify.ts` |
| Dashboard API + notifier | `src/dashboard.ts` |
| Dashboard UI | `src/dashboard-ui.ts` |
| MCP post_message routing | `src/server.ts` (uses `resolveMessageRoute`) |
| External watcher | `scripts/room-watch.mjs` |
| Wake profiles | `scripts/agent-wake.mjs` |
| Suite launcher | `scripts/start-agent-room-suite.ps1` |
| Tests | `test/routing.test.ts`, `test/room-notify.test.ts`, `test/room-watch.test.ts`, `test/ping-watch.integration.test.ts`, `test/dashboard.test.ts` |

---

## Test coverage added/updated

| Test file | What it covers |
|-----------|----------------|
| `test/routing.test.ts` | Mention parse, alias resolve, unjoined agent ignored |
| `test/room-notify.test.ts` | `selectUnreadMessages`, `selectAgentNotifications` |
| `test/dashboard.test.ts` | `@mention` routing from API, delivery to joined agents after post |
| `test/ping-watch.integration.test.ts` | room-ping + room-watch against live dashboard |
| `test/room-watch.test.ts` | `auto` agent resolution from snapshot |

---

## State files (notifications)

| File | Used by |
|------|---------|
| `.watch-lastseen-<agent>` | Room notifier + `room-watch.mjs` |
| `.lastseen-<agent>` | `room-ping.mjs` (Claude hook only) |
| `.wake-inbox-<agent>.txt` | Inbox paste for agents without hooks |
| `notifications.jsonl` | Delivery audit log |
| `agents.json` | Who is "in the room" for delivery |

---

## Review checklist for Codex

1. **Correctness:** `messageTargetsAgent` — mention-list messages must not alert non-mentioned agents; broadcasts must alert all joined agents.
2. **Join gate:** `resolveAgentId` only resolves aliases when agent is in `registeredAgentIds`.
3. **Double delivery:** Suite no longer starts external watcher by default; confirm no duplicate toasts in normal `start-suite` flow.
4. **Async post:** Dashboard `POST /api/messages` awaits `notifier.tick()` — confirm acceptable latency on wake command.
5. **MCP path:** Messages posted via MCP `post_message` are picked up on notifier poll (5s); dashboard posts are immediate. Acceptable?
6. **Security:** Wake command spawns shell; `AGENT_ROOM_NOTIFY_COMMAND` env override — document if exposing dashboard beyond localhost.
7. **UI:** Feed grouping, composer Enter/Shift+Enter, Notifications panel empty states.
8. **Docs:** `PING_WATCH.md`, `LAUNCHER.md` match actual launcher behavior.

---

## Suggested review order

1. Read `docs/PING_WATCH.md` — global notifier model
2. Skim `src/routing.ts` + `src/room-notify.ts`
3. Skim `src/dashboard-ui.ts` — Notifications panel, composer, feed grouping
4. Run `npm test`
5. Manual: start-room → register codex-desktop → post `@codex test` → check Notify panel + inbox file

---

## Known limits / follow-ups

- MCP-posted messages rely on 5s poll unless posted through dashboard (immediate tick).
- No `set_active_project` MCP tool (unchanged from prior packet).
- External watcher is opt-in; most users only need `start-room` or `start-suite`.
- Grok/Antigravity wake paths assume same toast/inbox as Codex — no client-specific hooks yet.

---

## User note for this handoff

Grok/Composer completed the UI overhaul and global notification system. Codex should review,
fix anything found, and update GitHub when satisfied.