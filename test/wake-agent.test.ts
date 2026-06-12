import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const { createNotificationCommand, deliverWake, inboxPath } = await import("../scripts/wake-agent.mjs");

describe("wake-agent", () => {
  it("constructs best-effort notification commands for each desktop platform", () => {
    expect(createNotificationCommand("win32", "D:/repo", "Codex", "Hello room")).toMatchObject({
      command: "powershell",
      args: expect.arrayContaining(["-File", "D:/repo/scripts/notify-agent-room.ps1"])
    });
    expect(createNotificationCommand("darwin", "D:/repo", "Codex", "Hello room")).toEqual({
      command: "osascript",
      args: ["-e", 'display notification "Hello room" with title "Agent Room - Codex"']
    });
    expect(createNotificationCommand("linux", "D:/repo", "Codex", "Hello room")).toEqual({
      command: "notify-send",
      args: ["Agent Room - Codex", "Hello room"]
    });
    expect(createNotificationCommand("freebsd", "D:/repo", "Codex", "Hello room")).toBeUndefined();
  });

  it("always appends wake text to the agent inbox", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-wake-"));

    await deliverWake(
      { agent: "codex-desktop", ping: "First ping", roomDir },
      { platform: "freebsd", notify: false }
    );
    await deliverWake(
      { agent: "codex-desktop", ping: "Second ping", roomDir },
      { platform: "freebsd", notify: false }
    );

    expect(inboxPath(roomDir, "codex-desktop")).toBe(join(roomDir, ".wake-inbox-codex-desktop.txt"));
    await expect(readFile(join(roomDir, ".wake-inbox-codex-desktop.txt"), "utf8")).resolves.toBe(
      "First ping\nSecond ping\n"
    );
  });
});
