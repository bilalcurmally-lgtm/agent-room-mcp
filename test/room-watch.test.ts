import { describe, expect, it } from "vitest";

const { formatWatcherNotification, resolveWatchOptions, selectAgentNotifications } = await import(
  "../scripts/room-watch.mjs"
);

describe("room-watch helpers", () => {
  it("selects routed unread messages for multiple agents", () => {
    const messages = [
      { id: "000001", from: "user", to: "all", topic: "All", body: "Everyone look" },
      { id: "000002", from: "codex-desktop", to: "claude-opus", topic: "Review", body: "Review please" },
      { id: "000003", from: "claude-opus", to: "codex-desktop", topic: "Fix", body: "Fix this" },
      { id: "000004", from: "codex-desktop", to: "cursor", topic: "Other", body: "Skip" }
    ];

    const notifications = selectAgentNotifications(
      messages,
      ["claude-opus", "codex-desktop"],
      { "claude-opus": "000001", "codex-desktop": "000002" },
      10
    );

    expect(notifications).toMatchObject([
      { agent: "claude-opus", total: 1, messages: [{ id: "000002" }], highestId: "000002" },
      { agent: "codex-desktop", total: 1, messages: [{ id: "000003" }], highestId: "000003" }
    ]);
  });

  it("formats watcher notifications with agent labels", () => {
    const text = formatWatcherNotification({
      agent: "claude-opus",
      messages: [{ id: "000010", from: "user", to: "claude-opus", topic: "Review", body: "Please review" }],
      total: 1
    });

    expect(text).toContain("AGENT claude-opus");
    expect(text).toContain("ROOM: 1 new message");
  });

  it("resolves watcher options from cli args", () => {
    expect(
      resolveWatchOptions([
        "--agents",
        "claude-opus,codex-desktop",
        "--command",
        "notify-send AgentRoom",
        "--interval-ms",
        "1000",
        "--once",
        "--dry-run"
      ])
    ).toMatchObject({
      agents: ["claude-opus", "codex-desktop"],
      command: "notify-send AgentRoom",
      intervalMs: 1000,
      once: true,
      dryRun: true
    });
  });
});
