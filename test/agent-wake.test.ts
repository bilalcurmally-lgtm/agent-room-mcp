import { describe, expect, it } from "vitest";
import { AGENT_WAKE_PROFILES, formatWakeMatrix } from "../scripts/agent-wake.mjs";

describe("agent wake profiles", () => {
  it("defines an executable wake-check command for every agent", () => {
    expect(AGENT_WAKE_PROFILES.length).toBeGreaterThan(0);

    for (const profile of AGENT_WAKE_PROFILES) {
      expect(profile.agent).toBeTruthy();
      expect(profile.wakeCheck).toBe(`node scripts/room-ping.mjs --agent ${profile.agent}`);
    }
  });

  it("prints wake-check commands in the wake matrix", () => {
    const matrix = formatWakeMatrix();

    expect(matrix).toContain("wakeCheck:");
    expect(matrix).toContain("node scripts/room-ping.mjs --agent codex-desktop");
    expect(matrix).toContain("node scripts/room-ping.mjs --agent grok");
  });

  it("uses the event-driven Codex worker instead of a toast-only profile", () => {
    const codex = AGENT_WAKE_PROFILES.find((profile) => profile.agent === "codex-desktop");
    expect(codex).toMatchObject({
      primary: "event-watch+codex-exec",
      watcher: "node scripts/codex-room-watch.mjs"
    });
  });
});
