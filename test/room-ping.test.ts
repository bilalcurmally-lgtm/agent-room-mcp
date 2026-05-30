import { describe, expect, it } from "vitest";

const { formatRoomPing, selectUnreadMessages } = await import("../scripts/room-ping.mjs");

describe("room-ping hook helpers", () => {
  it("selects unread messages routed to the agent or all and skips self echoes", () => {
    const messages = [
      { id: "000001", from: "codex-desktop", to: "all", topic: "Old", body: "old" },
      { id: "000002", from: "claude-opus", to: "all", topic: "Echo", body: "skip" },
      { id: "000003", from: "codex-desktop", to: "claude-opus", topic: "Direct", body: "read me" },
      { id: "000004", from: "codex-desktop", to: "cursor", topic: "Other", body: "skip" }
    ];

    expect(selectUnreadMessages(messages, { agent: "claude-opus", lastSeen: "000001", limit: 10 })).toEqual([
      messages[2]
    ]);
  });

  it("formats a compact room ping block with overflow hint", () => {
    const messages = [
      { id: "000010", from: "codex-desktop", to: "all", topic: "Done", body: "Ready", project: "agent-room-mcp" },
      { id: "000011", from: "user", to: "claude-opus", topic: "Review", body: "Please review" }
    ];

    expect(formatRoomPing(messages, { total: 4 })).toContain("ROOM: 2 new messages");
    expect(formatRoomPing(messages, { total: 4 })).toContain(
      "[000010] codex-desktop -> all (agent-room-mcp): Done - Ready"
    );
    expect(formatRoomPing(messages, { total: 4 })).toContain("+2 more, run check_in");
  });
});
