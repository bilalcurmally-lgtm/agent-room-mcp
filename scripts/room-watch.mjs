#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { formatRoomPing, selectUnreadMessages } from "./room-ping.mjs";

const DEFAULT_AGENTS = "claude-opus,codex-desktop";
const DEFAULT_ROOM_DIR = process.env.AGENT_ROOM_DIR ?? "D:\\projects\\.agent-room";
const DEFAULT_SNAPSHOT_URL =
  process.env.AGENT_ROOM_SNAPSHOT_URL ?? "http://127.0.0.1:4777/api/snapshot?project=all";
const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_LIMIT = 10;

export function resolveWatchOptions(args, env = process.env) {
  return {
    agents: (valueAfter(args, "--agents") ?? env.AGENT_ROOM_WATCH_AGENTS ?? DEFAULT_AGENTS)
      .split(",")
      .map((agent) => agent.trim())
      .filter(Boolean),
    command: valueAfter(args, "--command") ?? env.AGENT_ROOM_NOTIFY_COMMAND,
    roomDir: valueAfter(args, "--room") ?? env.AGENT_ROOM_DIR ?? DEFAULT_ROOM_DIR,
    snapshotUrl: valueAfter(args, "--url") ?? env.AGENT_ROOM_SNAPSHOT_URL ?? DEFAULT_SNAPSHOT_URL,
    intervalMs: Number(valueAfter(args, "--interval-ms") ?? env.AGENT_ROOM_WATCH_INTERVAL_MS ?? DEFAULT_INTERVAL_MS),
    limit: Number(valueAfter(args, "--limit") ?? env.AGENT_ROOM_PING_LIMIT ?? DEFAULT_LIMIT),
    dryRun: args.includes("--dry-run"),
    once: args.includes("--once")
  };
}

export function selectAgentNotifications(messages, agents, lastSeenByAgent, limit) {
  return agents
    .map((agent) => {
      const allUnread = selectUnreadMessages(messages, {
        agent,
        lastSeen: lastSeenByAgent[agent] ?? "",
        limit: Number.MAX_SAFE_INTEGER
      });
      const selected = allUnread.slice(0, limit);
      return {
        agent,
        messages: selected,
        total: allUnread.length,
        highestId: selected.at(-1)?.id
      };
    })
    .filter((notification) => notification.messages.length > 0);
}

export function formatWatcherNotification(notification) {
  return [
    `AGENT ${notification.agent}`,
    formatRoomPing(notification.messages, { total: notification.total })
  ].join("\n");
}

async function main() {
  const options = resolveWatchOptions(process.argv.slice(2));
  if (!options.agents.length) throw new Error("--agents must include at least one agent id");
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) throw new Error("--interval-ms must be positive");

  do {
    await runWatchTick(options);
    if (!options.once) await sleep(options.intervalMs);
  } while (!options.once);
}

async function runWatchTick(options) {
  try {
    const snapshot = await fetchSnapshot(options.snapshotUrl);
    const lastSeen = await readAllLastSeen(options.roomDir, options.agents);
    const notifications = selectAgentNotifications(snapshot.messages ?? [], options.agents, lastSeen, options.limit);

    for (const notification of notifications) {
      const text = formatWatcherNotification(notification);
      if (options.dryRun || !options.command) {
        console.log(text);
      } else {
        await runNotifyCommand(options.command, notification.agent, text);
      }
      if (notification.highestId) await writeLastSeen(options.roomDir, notification.agent, notification.highestId);
    }
  } catch (error) {
    if (options.dryRun || options.once) console.error(error instanceof Error ? error.message : String(error));
  }
}

async function readAllLastSeen(roomDir, agents) {
  const pairs = await Promise.all(
    agents.map(async (agent) => [agent, await readLastSeen(statePath(roomDir, agent))])
  );
  return Object.fromEntries(pairs);
}

async function fetchSnapshot(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Snapshot failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function runNotifyCommand(command, agent, text) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        AGENT_ROOM_AGENT: agent,
        AGENT_ROOM_PING: text
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Notify command exited ${code}`));
    });
  });
}

async function readLastSeen(path) {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return "";
  }
}

async function writeLastSeen(roomDir, agent, id) {
  const path = statePath(roomDir, agent);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${id}\n`, "utf8");
}

function statePath(roomDir, agent) {
  return join(roomDir, `.watch-lastseen-${agent}`);
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
