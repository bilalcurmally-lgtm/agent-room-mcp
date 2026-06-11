import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const { formatWatcherNotification, resolveSpawnPlan, resolveWatchOptions, runWatchTick, selectAgentNotifications } =
  await import("../scripts/room-watch.mjs");

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
      resolveWatchOptions(
        [
          "--agents",
          "claude-opus,codex-desktop",
          "--command",
          "notify-send AgentRoom",
          "--interval-ms",
          "1000",
          "--once",
          "--dry-run"
        ],
        {},
        "D:/projects/agent-room-mcp"
      )
    ).toMatchObject({
      agents: ["claude-opus", "codex-desktop"],
      command: "notify-send AgentRoom",
      intervalMs: 1000,
      once: true,
      dryRun: true
    });
  });

  it("defaults agents to auto and can resolve --wake command", async () => {
    const { defaultWakeCommand, resolveWatchAgents } = await import("../scripts/room-watch.mjs");
    expect(resolveWatchOptions(["--wake", "--once"], {}, "D:/projects/agent-room-mcp")).toMatchObject({
      agents: ["auto"],
      wake: true,
      command: defaultWakeCommand("D:/projects/agent-room-mcp")
    });
    expect(
      resolveWatchAgents(
        [{ id: "grok" }, { id: "codex-desktop" }],
        ["auto"]
      )
    ).toEqual(["grok", "codex-desktop"]);
    expect(defaultWakeCommand("D:/projects/agent-room-mcp")).toContain("wake-agent.ps1");
  });
});

describe("portable defaults", () => {
  it("defaults the room directory to ~/.agent-room, not a machine-specific path", () => {
    const options = resolveWatchOptions([], {}, "C:/repo");
    expect(options.roomDir).toBe(join(homedir(), ".agent-room"));
    expect(resolveWatchOptions(["--room", "X:/elsewhere"], {}, "C:/repo").roomDir).toBe("X:/elsewhere");
    expect(resolveWatchOptions([], { AGENT_ROOM_DIR: "Y:/env-room" }, "C:/repo").roomDir).toBe("Y:/env-room");
  });
});

describe("headless spawn wake", () => {
  const profile = (spawn?: string) => ({ agent: "codex-desktop", client: "Codex", spawn });

  it("skips the spawn for agents seen live, spawns for stale or offline ones", () => {
    const nowMs = Date.parse("2026-06-11T12:00:00Z");
    const liveSeen = new Date(nowMs - 60_000).toISOString();
    const staleSeen = new Date(nowMs - 10 * 60_000).toISOString();

    expect(resolveSpawnPlan(profile("codex exec hi"), undefined, nowMs, 300_000, liveSeen)).toEqual({
      shouldSpawn: false,
      skipReason: "agent-live"
    });
    expect(resolveSpawnPlan(profile("codex exec hi"), undefined, nowMs, 300_000, staleSeen)).toMatchObject({
      shouldSpawn: true
    });
    expect(resolveSpawnPlan(profile("codex exec hi"), undefined, nowMs, 300_000, undefined)).toMatchObject({
      shouldSpawn: true
    });
  });

  it("plans a spawn and enforces the debounce window", () => {
    expect(resolveSpawnPlan(profile('codex exec "check in"'), undefined, 1_000_000, 300_000)).toEqual({
      shouldSpawn: true,
      command: 'codex exec "check in"'
    });
    expect(resolveSpawnPlan(profile("codex exec hi"), 900_000, 1_000_000, 300_000)).toEqual({
      shouldSpawn: false,
      skipReason: "debounce"
    });
    expect(resolveSpawnPlan(profile("codex exec hi"), 600_000, 1_000_000, 300_000)).toMatchObject({
      shouldSpawn: true
    });
    expect(resolveSpawnPlan(profile(undefined), undefined, 1_000_000, 300_000)).toEqual({
      shouldSpawn: false,
      skipReason: "no-spawn-command"
    });
  });

  async function makeWatchRoom() {
    const roomDir = await mkdtemp(join(tmpdir(), "room-watch-spawn-"));
    let nextId = 0;
    const server = createServer((_request, response) => {
      nextId += 1;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          agents: [{ id: "codex-desktop" }],
          messages: [
            {
              id: String(nextId).padStart(6, "0"),
              from: "user",
              to: "codex-desktop",
              topic: `Task ${nextId}`,
              body: "please handle"
            }
          ]
        })
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    return {
      roomDir,
      url: `http://127.0.0.1:${address.port}/api/snapshot`,
      close: () => new Promise<void>((resolve) => server.close(() => resolve()))
    };
  }

  it("spawns once per debounce window and logs the exit code", async () => {
    const room = await makeWatchRoom();
    try {
      const options = {
        agents: ["codex-desktop"],
        roomDir: room.roomDir,
        snapshotUrl: room.url,
        limit: 10,
        once: true,
        dryRun: false,
        spawnDebounceMs: 60_000,
        profiles: { "codex-desktop": profile('node -e "process.exit(0)"') }
      };

      await runWatchTick(options);
      const log = (await readFile(join(room.roomDir, "notifications.jsonl"), "utf8")).trim().split("\n");
      expect(log).toHaveLength(1);
      expect(JSON.parse(log[0])).toMatchObject({
        agent: "codex-desktop",
        spawn: { command: 'node -e "process.exit(0)"', exitCode: 0 }
      });

      await runWatchTick(options);
      const after = (await readFile(join(room.roomDir, "notifications.jsonl"), "utf8")).trim().split("\n");
      expect(after).toHaveLength(1);
    } finally {
      await room.close();
    }
  });

  it("constructs but does not execute the spawn in dry-run", async () => {
    const room = await makeWatchRoom();
    try {
      const result = await runWatchTick({
        agents: ["codex-desktop"],
        roomDir: room.roomDir,
        snapshotUrl: room.url,
        limit: 10,
        once: true,
        dryRun: true,
        spawnDebounceMs: 60_000,
        profiles: { "codex-desktop": profile('node -e "process.exit(1)"') }
      });

      expect(result.notifications).toHaveLength(1);
      await expect(readFile(join(room.roomDir, "notifications.jsonl"), "utf8")).rejects.toThrow();
      await expect(readFile(join(room.roomDir, ".watch-spawnat-codex-desktop"), "utf8")).rejects.toThrow();
    } finally {
      await room.close();
    }
  });
});
