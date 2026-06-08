# Agent Room MCP — Action Plan (2026-06-08)

Author: claude-opus (coordinator). Source: room msgs 000167 (feedback dump), 000169/000171
(Bilal), 000170 (codex). Branch `harden-agent-room`, HEAD `1389ac3`.

Bilal's directive (000169): **Priority 1 = the wake tool** so he stops nudging, **and** make
the project usable for other people. This plan turns the external feedback into a sequenced
backlog and names the wake work as P0.

---

## P0 — Wake reliability (the thing Bilal must stop nudging)

**Status as of this wake:** CLI wake is now working. This `claude-opus` instance is a **CLI**
client and was resumed autonomously by a room post (routed batch 000171/000172 + the
`wake-probe`), with **no manual nudge**. That answers 000171: it is **not** desktop-only — the
recent hardening (`1389ac3` harden autonomous wake watchers, `52c0f15` nested-sandbox fix,
`228148b` trusted assignments, `8f92309` deferral wording) made the CLI path fire.

Remaining to call P0 *done*:
1. **Prove Grok auto-wakes.** Grok's MCP path works manually but never auto-resumed
   (DOGFOOD_BACKLOG P0). Run the same supervisor/watcher contract for grok-cli and confirm a
   single room post → grok `check_in` with no nudge. Owner: codex (per 000165 queue).
2. **Converge the three clients onto one generic watcher/launcher.** Codex queued this in
   000165 (review generic watcher/launcher/test, converge codex onto the generic core). One
   wake contract, per-tool launcher shim, so a new client is a config entry not new code.
3. **Document the wake contract + an automated acceptance test** (post once → target
   check_ins within N s, survives process/session restart, no toast spam). Closes the gap
   that this is currently only proven by live probes.

## P1 — "Usable for other people" (the brother couldn't get it running)

Gemini/Sonnet/Grok feedback converges on **first-run friction** and **positioning**:
1. **One-command, verified onboarding.** `npx agent-room-mcp init` must end with a working
   wake loop, not just edited MCP config. Add a `doctor`/self-check that confirms: MCP
   registered, dashboard reachable, wake watcher running, a test post wakes a test agent.
2. **README "why this exists" lead.** Open with the **fabrication problem** (no fake
   handoffs / evidence-required), then the tagline. Sonnet + Grok both flagged this.
3. **Local / self-host privacy story up front.** Gemini flagged hesitation over the cloud
   stack. Make "local file-backed, inspectable, no hosted dependency" explicit and document
   self-host vs. hosted-room clearly.
4. **Wake-loop safety: max-turn breaker.** Gemini's context-poisoning/infinite-loop risk —
   two agents auto-replying forever drains tokens. Add an aggressive loop breaker / human
   gate on autonomous wake chains. (Pairs with P0 — ship together.)

## P2 — Feedback "evolution ideas" (parked, not now)

Grok's list, logged so we don't lose it: `search_messages` (filters: project/status/keyword/
after_id); agent **capabilities** declaration for routing; `knowledge.md` append tool;
decision-conflict detection; dashboard polish (timeline/kanban toggle, promote message→
decision, markdown bundle export). None block onboarding; revisit after P0/P1.

## Carry-over (from REVIEW_2026-06-06 + DOGFOOD_BACKLOG_2026-06-07)

Still open and worth folding in once wake/onboarding land: B3 (log rotation / stop re-reading
whole file per post — relevant as rooms grow for real users), U3 (nav swaps main column),
T1 (dashboard render smoke test), stale claimed tasks 000009/000012 (grok) need confirm or
release. Then push `harden-agent-room` and open the PR.

## Sequencing

1. P0.1 Grok auto-wake proof → P0.2 generic watcher convergence → P0.3 contract doc + test.
2. P1.4 max-turn breaker (lands with P0), then P1.1 verified `init`/`doctor`, P1.2 README, P1.3 self-host story.
3. P2 evolution ideas + REVIEW/DOGFOOD carry-over, then PR.

## Split (Claude + Codex, non-overlapping files)

- **Codex:** P0.1/P0.2 watcher+launcher convergence and Grok wake retest (owns
  `scripts/*room-watch*`, launcher shims) per its 000165 queue.
- **Claude:** P0.3 wake-contract doc + acceptance test, P1.4 max-turn breaker design, P1
  onboarding (`init`/`doctor`, README). Avoid simultaneous edits to `src/dashboard-ui.ts`.
