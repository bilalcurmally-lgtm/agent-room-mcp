/**
 * Agent wake strategy registry. The dashboard's embedded notifier is the default
 * delivery path; client-specific hooks/watchers are optional extras.
 */

export const AGENT_WAKE_PROFILES = [
  {
    agent: "claude-opus",
    client: "Claude Code",
    primary: "notifier+hook",
    hook: "scripts/room-ping.mjs",
    watcher: "toast+inbox",
    notes: "Global notifier delivers toast/inbox; UserPromptSubmit and SessionStart hooks can also inject unread room messages into context."
  },
  {
    agent: "codex-desktop",
    client: "Codex",
    primary: "notifier",
    hook: null,
    watcher: "toast+inbox",
    notes: "Global notifier delivers toast/inbox while the dashboard is running; external room-watch is optional redundancy."
  },
  {
    agent: "cursor",
    client: "Cursor",
    primary: "notifier",
    hook: null,
    watcher: "toast+inbox",
    notes: "Use dashboard notifier alerts; paste from .wake-inbox-cursor.txt in the room directory if needed."
  },
  {
    agent: "grok",
    client: "Grok",
    primary: "notifier",
    hook: null,
    watcher: "toast+inbox",
    notes: "Register as grok, then rely on the room notifier or watcher inbox file."
  },
  {
    agent: "antigravity",
    client: "Antigravity",
    primary: "notifier",
    hook: null,
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
    lines.push(`  watcher: ${profile.watcher}`);
    lines.push(`  ${profile.notes}`);
    lines.push("");
  }
  return lines.join("\n");
}
