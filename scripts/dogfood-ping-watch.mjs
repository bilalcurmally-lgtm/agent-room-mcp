#!/usr/bin/env node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRoomStore } from "../dist/store.js";
import { runRoomPing, lastSeenPath } from "./room-ping.mjs";
import { runWatchTick, resolveWatchOptions, defaultWakeCommand } from "./room-watch.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

async function main() {
  const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dogfood-"));
  const store = await AgentRoomStore.open(roomDir);
  const dashboard = await startSnapshotServer(roomDir);
  const snapshotUrl = `${dashboard.url}/api/snapshot?project=all`;

  try {
    await store.registerAgent({ agent: "claude-opus", displayName: "Claude" });
    await store.postMessage({
      from: "codex-desktop",
      to: "claude-opus",
      topic: "Dogfood ping",
      body: "Priority 5 verification message.",
      project: "agent-room-mcp"
    });
    await store.postMessage({
      from: "user",
      to: "codex-desktop",
      topic: "Dogfood watch",
      body: "Watcher path verification message.",
      project: "agent-room-mcp"
    });

    const pingOptions = { agent: "claude-opus", roomDir, snapshotUrl, limit: 10 };
    const first = await runRoomPing(pingOptions);
    const second = await runRoomPing(pingOptions);

    if (!first.output?.includes("Dogfood ping")) {
      throw new Error("First room-ping did not surface the seeded message");
    }
    if (second.output) {
      throw new Error("Second room-ping should be silent after advancing last-seen state");
    }

    const lastSeen = await readFile(lastSeenPath(roomDir, "claude-opus"), "utf8");
    if (!lastSeen.trim()) throw new Error("room-ping did not advance .lastseen-claude-opus");

    const watchOptions = resolveWatchOptions(
      ["--agents", "codex-desktop", "--once", "--dry-run", "--room", roomDir, "--url", snapshotUrl],
      {},
      REPO_ROOT
    );
    const watch = await runWatchTick(watchOptions);
    if (!watch.notifications?.length) {
      throw new Error("room-watch did not detect routed unread messages for codex-desktop");
    }

    const wakeCommand = defaultWakeCommand(REPO_ROOT);
    if (!wakeCommand.includes("wake-agent.ps1")) {
      throw new Error("default wake command does not target wake-agent.ps1");
    }

    await store.postMessage({
      from: "user",
      to: "codex-desktop",
      topic: "Dogfood spawn",
      body: "Spawn path verification message.",
      project: "agent-room-mcp"
    });
    const spawnOptions = {
      agents: ["codex-desktop"],
      roomDir,
      snapshotUrl,
      limit: 10,
      once: true,
      dryRun: false,
      spawnDebounceMs: 60_000,
      profiles: { "codex-desktop": { agent: "codex-desktop", spawn: 'node -e "process.exit(0)"' } }
    };
    await runWatchTick(spawnOptions);
    const spawnLog = (await readFile(join(roomDir, "notifications.jsonl"), "utf8")).trim().split("\n");
    const spawnRecord = JSON.parse(spawnLog.at(-1));
    if (spawnRecord.spawn?.exitCode !== 0) {
      throw new Error("spawn path did not log a successful headless turn to notifications.jsonl");
    }
    await store.postMessage({
      from: "user",
      to: "codex-desktop",
      topic: "Dogfood spawn 2",
      body: "Must be debounced.",
      project: "agent-room-mcp"
    });
    await runWatchTick(spawnOptions);
    const debounced = (await readFile(join(roomDir, "notifications.jsonl"), "utf8")).trim().split("\n");
    if (debounced.length !== spawnLog.length) {
      throw new Error("second tick inside the debounce window spawned again");
    }

    console.log("Dogfood ping/watch verification passed.");
    console.log(`  room-ping first: ${first.totalUnread} unread, advanced to ${first.highestId}`);
    console.log(`  room-ping second: silent`);
    console.log(`  room-watch: ${watch.notifications.length} notification(s)`);
    console.log(`  wake command: ${wakeCommand}`);
    console.log(`  spawn path: exit ${spawnRecord.spawn.exitCode}, debounce honored`);
  } finally {
    await dashboard.close();
    await rm(roomDir, { recursive: true, force: true });
  }
}

async function startSnapshotServer(roomDir) {
  const { startDashboardServer } = await import("../dist/dashboard.js");
  return startDashboardServer({
    roomDir,
    port: 0,
    openBrowser: false,
    enableNotifications: false
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
