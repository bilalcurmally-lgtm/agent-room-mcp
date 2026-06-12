import { describe, expect, it } from "vitest";
import { defaultWakeCommand, selectAgentNotifications, selectUnreadMessages } from "../src/room-notify.js";

describe("room-notify", () => {
  it("selects unread routed and mention-list messages", () => {
    const messages = [
      { id: "000001", from: "user", to: "all", topic: "All", body: "Everyone" },
      { id: "000002", from: "user", to: "all", mentions: ["grok", "codex-desktop"], topic: "Pair", body: "@grok @codex" },
      { id: "000003", from: "grok", to: "user", topic: "Reply", body: "ok" }
    ];

    expect(selectUnreadMessages(messages as never, { agent: "grok", lastSeen: "000001", limit: 10 })).toMatchObject([
      { id: "000002" }
    ]);
    expect(selectUnreadMessages(messages as never, { agent: "claude-opus", lastSeen: "", limit: 10 })).toMatchObject([
      { id: "000001" }
    ]);
    expect(
      selectAgentNotifications(messages as never, ["grok", "codex-desktop"], { grok: "000001", "codex-desktop": "" }, 10)
    ).toMatchObject([
      { agent: "grok", total: 1, messages: [{ id: "000002" }] },
      { agent: "codex-desktop", total: 2, messages: [{ id: "000001" }, { id: "000002" }] }
    ]);
  });

  it("defaults to the cross-platform Node wake script", () => {
    expect(defaultWakeCommand("D:/projects/agent-room-mcp")).toBe('node "D:/projects/agent-room-mcp/scripts/wake-agent.mjs"');
  });
});
