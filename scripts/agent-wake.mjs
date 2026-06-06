/**
 * Agent wake strategy registry. Claude uses prompt hooks; Codex and Cursor rely on
 * the room watcher plus local notifications and inbox files.
 */

export const AGENT_WAKE_PROFILES = [
  {
    agent: "claude-opus",
    client: "Claude Code",
    primary: "hook",
    hook: "scripts/room-ping.mjs",
    watcher: "toast+inbox",
    notes: "UserPromptSubmit and SessionStart hooks inject unread room messages into context."
  },
  {
    agent: "codex-desktop",
    client: "Codex",
    primary: "watcher",
    hook: null,
    watcher: "toast+inbox",
    notes: "No prompt hook equivalent documented; run npm run start-watch -- -Wake while Codex is open."
  },
  {
    agent: "cursor",
    client: "Cursor",
    primary: "watcher",
    hook: null,
    watcher: "toast+inbox",
    notes: "Use watcher notifications; paste from .wake-inbox-cursor.txt in the room directory if needed."
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