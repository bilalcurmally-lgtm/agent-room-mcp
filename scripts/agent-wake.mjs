/**
 * Agent wake strategy registry. The dashboard's embedded notifier is the default
 * delivery path; client-specific hooks/watchers are optional extras.
 *
 * Optional `spawn` field: a shell command the external watcher runs to start a
 * fresh headless turn when a message routes to the agent (instead of the toast),
 * e.g. spawn: 'codex exec "Call check_in as codex-desktop, then handle your
 * unread room messages."'. Debounced to one spawn per agent per window
 * (default 5 min); spawns are logged to notifications.jsonl with exit codes.
 * Toast+inbox remains the path for profiles without a spawn command.
 */

export const AGENT_WAKE_PROFILES = [
  {
    agent: "claude-opus",
    client: "Claude Code",
    primary: "notifier+hook",
    hook: "scripts/room-ping.mjs",
    wakeCheck: "node scripts/room-ping.mjs --agent claude-opus",
    watcher: "toast+inbox",
    notes: "Global notifier delivers toast/inbox; UserPromptSubmit and SessionStart hooks can also inject unread room messages into context."
  },
  {
    agent: "codex-desktop",
    client: "Codex",
    primary: "event-watch+codex-exec",
    hook: null,
    wakeCheck: "node scripts/room-ping.mjs --agent codex-desktop",
    watcher: "node scripts/codex-room-watch.mjs",
    notes: "A persistent file-event watcher launches a non-interactive Codex turn, which checks in and executes room-authorized work end to end. Toast/inbox delivery remains optional."
  },
  {
    agent: "cursor",
    client: "Cursor",
    primary: "notifier",
    hook: null,
    wakeCheck: "node scripts/room-ping.mjs --agent cursor",
    watcher: "toast+inbox",
    notes: "Use dashboard notifier alerts; Cursor should run its wakeCheck when alerted. Paste from .wake-inbox-cursor.txt only as fallback."
  },
  {
    agent: "grok",
    client: "Grok",
    primary: "notifier",
    hook: null,
    wakeCheck: "node scripts/room-ping.mjs --agent grok",
    watcher: "toast+inbox",
    notes: "Register as grok, then rely on the room notifier or watcher inbox file."
  },
  {
    agent: "antigravity",
    client: "Antigravity",
    primary: "notifier",
    hook: null,
    wakeCheck: "node scripts/room-ping.mjs --agent antigravity",
    watcher: "toast+inbox",
    notes: "Register as antigravity, then rely on the room notifier or watcher inbox file."
  }
];

export function wakeProfileForAgent(agent) {
  return AGENT_WAKE_PROFILES.find((profile) => profile.agent === agent);
}

export function formatWakeMatrix() {
  const lines = ["Agent wake mechanisms", ""];
  for (const profile of AGENT_WAKE_PROFILES) {
    lines.push(`${profile.client} (${profile.agent})`);
    lines.push(`  primary: ${profile.primary}`);
    if (profile.hook) lines.push(`  hook: ${profile.hook}`);
    if (profile.spawn) lines.push(`  spawn: ${profile.spawn}`);
    lines.push(`  wakeCheck: ${profile.wakeCheck}`);
    lines.push(`  watcher: ${profile.watcher}`);
    lines.push(`  ${profile.notes}`);
    lines.push("");
  }
  return lines.join("\n");
}
