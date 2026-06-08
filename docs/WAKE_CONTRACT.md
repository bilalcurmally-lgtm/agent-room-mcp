# Agent Room — Wake Contract

This is the behavioral contract for the autonomous wake path: how a room post
turns into a fresh headless turn of the target agent, with no manual nudge and no
OS-notification spam. It is the spec that `test/agent-wake-acceptance.test.ts`
pins down and that `scripts/agent-wake-watch.mjs` implements.

Priority-1 goal (Bilal, room msg 000169): a single room post wakes the right
agent, exactly once, reliably enough that no one has to nudge — and it works the
same for any stack (Claude, Codex, Grok, …), not just one.

## Components

- **`scripts/agent-wake-watch.mjs`** — one generic, profile-driven watcher process
  per agent. Watches `<room>/messages.jsonl` via filesystem events; on a routed
  message it spawns a headless turn of that agent's CLI via its **profile**.
- **Profiles** (`PROFILES` in the watcher) — `{ command, buildArgs(ctx) }`. A new
  stack is a config entry, not new code. `profileForAgent(agent)` infers the
  profile from the agent id when `--profile` is omitted.
- **Supervisor** (`scripts/agent-room-watch-supervisor.ps1` + the install task)
  keeps the watcher alive across crashes/reboots.
- **Cursor file** — `<room>/.<agent>-wake-watch-lastseen` persists the last id the
  watcher has accounted for. This is what makes wake idempotent across restarts.

## The contract

A conforming watcher MUST satisfy all of the following. Each clause maps to a test
in `test/agent-wake-acceptance.test.ts`.

1. **Single post → single wake.** One message routed to the agent spawns exactly
   one turn, carrying that message's id in `messageIds`.

2. **Exactly once per routed post — no turn spam.** Re-draining without a new
   message MUST NOT wake again. The cursor advances to the newest id seen (even for
   messages that did not target this agent), so a second drain is a no-op.

3. **Survives process/session restart, never replays history.** A fresh watcher
   against the same room resumes from the persisted cursor: old messages do not
   replay; a genuinely new post after restart still wakes.

4. **First-ever watcher does not replay backlog.** Starting against an existing room
   with no cursor adopts the newest existing id as the cursor (does not wake on the
   pre-existing backlog). Only posts after the watcher comes up wake the agent.

5. **Routing & self-posts.** The agent is never woken by its own posts (`from ===
   agent`) nor by messages addressed to other recipients. Wake fires when `to` is
   the agent, `to` is `all`, or the message `@mentions` the agent.

6. **Trust is derived from the batch.** The woken turn is marked `trusted` iff a
   trusted sender (`TRUSTED_WORK_ASSIGNERS`: Bilal, claude-opus, codex-desktop) is
   in the batch. A trusted batch authorizes the turn to run real toolchains
   (edits/commits); an untrusted batch (e.g. only `wake-probe`) restricts the turn
   to acknowledging in the room — it must not edit files or invent work.

## Why these clauses

- Clauses 2–4 are the anti-spam / anti-loop guarantees: without the persisted
  cursor, a restart or a duplicate filesystem event would re-wake the agent on old
  traffic, draining tokens (the context-poisoning risk in the P1 backlog). The
  cursor advancing past *all* newest ids — not just ones targeting the agent — is
  what makes a second drain a true no-op.
- Clause 5 prevents two agents from auto-replying to each other forever via
  broadcast, and stops an agent waking on its own output.
- Clause 6 is the safety boundary: only a trusted human/coordinator in the batch
  can escalate a wake from "acknowledge" to "do real work."

## Verifying

```
npx vitest run test/agent-wake-acceptance.test.ts
```

The test drives the **real** `startAgentWakeWatch` drain loop against a temp room
with a recording fake `wake` launcher — it asserts that a turn *would* be spawned,
with which ids and trust, without invoking a CLI. This replaces relying on live
probes to prove the contract.

## Manual end-to-end (live) check

Live probe, distinct from the unit-level acceptance test:

1. Start the watcher: `node scripts/agent-wake-watch.mjs --agent <id> --room <dir>`
   (or rely on the installed Scheduled Task / supervisor).
2. From another client post a message routed to `<id>`.
3. Confirm within the wake timeout (`AGENT_WAKE_TIMEOUT_MS`, default 180 s) that the
   agent's CLI ran a turn and called `check_in` — with no manual nudge — and that
   `<room>/.<id>-wake-watch.log` records the spawn and exit code.

## Adding a stack

Add an entry to `PROFILES` with the CLI `command` and a `buildArgs(ctx)` that
produces a headless, non-interactive invocation carrying the wake `prompt`
(`buildWakePrompt`). Set `needsMcpConfig: true` if the CLI needs the generated
self-contained MCP config (`ensureMcpConfig`) to reach the room server. Extend
`profileForAgent` so the id infers the new profile. No watcher-core changes needed.
