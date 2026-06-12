import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AgentRoomStore } from "../src/store.js";
import { startDashboardServer } from "../src/dashboard.js";

const { runRoomPing, lastSeenPath } = await import("../scripts/room-ping.mjs");
const { runWatchTick, resolveWatchOptions, defaultWakeCommand } = await import("../scripts/room-watch.mjs");

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

describe("ping/watch integration", () => {
  it("dogfoods room-ping against a live dashboard snapshot", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-ping-watch-"));
    const store = await AgentRoomStore.open(roomDir);
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    const snapshotUrl = `${server.url}/api/snapshot?project=all`;

    await store.postMessage({
      from: "codex-desktop",
      to: "claude-opus",
      topic: "Hook dogfood",
      body: "Unread for Claude hook path.",
      project: "agent-room-mcp"
    });

    const options = { agent: "claude-opus", roomDir, snapshotUrl, limit: 10 };
    const first = await runRoomPing(options);
    const second = await runRoomPing(options);

    expect(first.output).toContain("Hook dogfood");
    expect(second.output).toBe("");
    expect(first.highestId).toBeTruthy();
    await expect(readFile(lastSeenPath(roomDir, "claude-opus"), "utf8")).resolves.toContain(first.highestId!);

    await server.close();
  });

  it("dogfoods room-watch notifications for multiple agents", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-ping-watch-"));
    const store = await AgentRoomStore.open(roomDir);
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    const snapshotUrl = `${server.url}/api/snapshot?project=all`;

    await store.postMessage({
      from: "user",
      to: "codex-desktop",
      topic: "Watcher dogfood",
      body: "Unread for Codex watcher path.",
      project: "agent-room-mcp"
    });

    const watch = await runWatchTick(
      resolveWatchOptions(
        ["--agents", "codex-desktop", "--once", "--dry-run", "--room", roomDir, "--url", snapshotUrl],
        {},
        repoRoot
      )
    );

    expect(watch.notifications).toMatchObject([
      { agent: "codex-desktop", messages: [expect.objectContaining({ topic: "Watcher dogfood" })] }
    ]);

    await server.close();
  });

  it("resolves wake command to wake-agent.mjs", () => {
    const command = defaultWakeCommand(repoRoot);
    expect(command).toContain("wake-agent.mjs");
    expect(
      resolveWatchOptions(["--wake", "--once"], {}, repoRoot)
    ).toMatchObject({ wake: true, command });
  });
});
