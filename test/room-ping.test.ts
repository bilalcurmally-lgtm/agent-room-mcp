import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const { formatRoomPing, lastSeenPath, resetStopGuard, runStopHook, selectUnreadMessages, stopGuardPath } =
  await import("../scripts/room-ping.mjs");

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

describe("stop-hook auto-wake", () => {
  async function makeRoom(buildMessages: (call: number) => unknown[]) {
    const roomDir = await mkdtemp(join(tmpdir(), "room-ping-stop-"));
    let calls = 0;
    const server = createServer((_request, response) => {
      calls += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ messages: buildMessages(calls) }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    return {
      roomDir,
      options: {
        agent: "claude-opus",
        roomDir,
        snapshotUrl: `http://127.0.0.1:${address.port}/api/snapshot`,
        limit: 10
      },
      close: () => new Promise<void>((resolve) => server.close(() => resolve()))
    };
  }

  const wakeMessage = (id: string) => ({
    id,
    from: "codex-desktop",
    to: "claude-opus",
    topic: "Wake",
    body: "Please review the latest commit."
  });

  it("emits a block decision for unread messages and advances lastseen", async () => {
    const room = await makeRoom(() => [wakeMessage("000005")]);
    try {
      const result = await runStopHook(room.options, {});
      expect(result.block).toBe(true);
      expect(result.reason).toContain("[000005]");
      expect((await readFile(lastSeenPath(room.roomDir, "claude-opus"), "utf8")).trim()).toBe("000005");
    } finally {
      await room.close();
    }
  });

  it("never blocks when stop_hook_active is already set", async () => {
    const room = await makeRoom(() => [wakeMessage("000005")]);
    try {
      const result = await runStopHook(room.options, { stop_hook_active: true });
      expect(result.block).toBe(false);
    } finally {
      await room.close();
    }
  });

  it("goes silent after 3 consecutive blocks until the guard is reset", async () => {
    const room = await makeRoom((call) => [wakeMessage(String(call).padStart(6, "0"))]);
    try {
      for (let round = 1; round <= 3; round += 1) {
        expect((await runStopHook(room.options, {})).block).toBe(true);
      }
      expect((await runStopHook(room.options, {})).block).toBe(false);

      await resetStopGuard(stopGuardPath(room.roomDir, "claude-opus"));
      expect((await runStopHook(room.options, {})).block).toBe(true);
    } finally {
      await room.close();
    }
  });
});
