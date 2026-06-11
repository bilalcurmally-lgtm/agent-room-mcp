#!/usr/bin/env node
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wakeProfileForAgent } from "./agent-wake.mjs";
import { formatRoomPing, selectUnreadMessages } from "./room-ping.mjs";

const DEFAULT_AGENTS = "auto";
const DEFAULT_ROOM_DIR = join(homedir(), ".agent-room");
const DEFAULT_SNAPSHOT_URL =
  process.env.AGENT_ROOM_SNAPSHOT_URL ?? "http://127.0.0.1:4777/api/snapshot?project=all";
const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_LIMIT = 10;
// One spawn per agent per window: a burst of messages must not spawn a process each.
export const DEFAULT_SPAWN_DEBOUNCE_MS = 5 * 60 * 1000;

export function resolveWatchOptions(args, env = process.env, repoRoot = process.cwd()) {
  const useWake = args.includes("--wake") || env.AGENT_ROOM_WAKE === "1";
  const explicitCommand = valueAfter(args, "--command") ?? env.AGENT_ROOM_NOTIFY_COMMAND;
  return {
    agents: (valueAfter(args, "--agents") ?? env.AGENT_ROOM_WATCH_AGENTS ?? DEFAULT_AGENTS)
      .split(",")
      .map((agent) => agent.trim())
      .filter(Boolean),
    command: explicitCommand ?? (useWake ? defaultWakeCommand(repoRoot) : undefined),
    roomDir: valueAfter(args, "--room") ?? env.AGENT_ROOM_DIR ?? DEFAULT_ROOM_DIR,
    snapshotUrl: valueAfter(args, "--url") ?? env.AGENT_ROOM_SNAPSHOT_URL ?? DEFAULT_SNAPSHOT_URL,
    intervalMs: Number(valueAfter(args, "--interval-ms") ?? env.AGENT_ROOM_WATCH_INTERVAL_MS ?? DEFAULT_INTERVAL_MS),
    limit: Number(valueAfter(args, "--limit") ?? env.AGENT_ROOM_PING_LIMIT ?? DEFAULT_LIMIT),
    spawnDebounceMs: Number(
      valueAfter(args, "--spawn-debounce-ms") ?? env.AGENT_ROOM_SPAWN_DEBOUNCE_MS ?? DEFAULT_SPAWN_DEBOUNCE_MS
    ),
    dryRun: args.includes("--dry-run"),
    once: args.includes("--once"),
    wake: useWake
  };
}

/**
 * Decide whether a routed message should spawn a fresh headless turn for the
 * agent. Spawn commands come from the agent's wake profile; the debounce stamp
 * keeps a burst of messages from spawning a process each.
 */
export function resolveSpawnPlan(profile, lastSpawnAtMs, nowMs, debounceMs) {
  if (!profile?.spawn) return { shouldSpawn: false, skipReason: "no-spawn-command" };
  if (typeof lastSpawnAtMs === "number" && nowMs - lastSpawnAtMs < debounceMs) {
    return { shouldSpawn: false, skipReason: "debounce" };
  }
  return { shouldSpawn: true, command: profile.spawn };
}

export function defaultWakeCommand(repoRoot) {
  const wakeScript = join(repoRoot, "scripts", "wake-agent.ps1").replaceAll("\\", "/");
  return `powershell -NoProfile -ExecutionPolicy Bypass -File "${wakeScript}"`;
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

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

async function main() {
  const options = resolveWatchOptions(process.argv.slice(2), process.env, REPO_ROOT);
  if (!options.agents.length) options.agents = ["auto"];
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) throw new Error("--interval-ms must be positive");

  do {
    await runWatchTick(options);
    if (!options.once) await sleep(options.intervalMs);
  } while (!options.once);
}

export function resolveWatchAgents(snapshotAgents, configuredAgents) {
  const useAuto =
    !configuredAgents.length ||
    configuredAgents.length === 1 && configuredAgents[0] === "auto";
  if (!useAuto) return configuredAgents;
  return (snapshotAgents ?? []).map((agent) => agent.id).filter(Boolean);
}

export async function runWatchTick(options) {
  try {
    const snapshot = await fetchSnapshot(options.snapshotUrl);
    const agents = resolveWatchAgents(snapshot.agents, options.agents);
    if (!agents.length) return { notifications: [], messageCount: snapshot.messages?.length ?? 0 };
    const lastSeen = await readAllLastSeen(options.roomDir, agents);
    const notifications = selectAgentNotifications(snapshot.messages ?? [], agents, lastSeen, options.limit);

    for (const notification of notifications) {
      const text = formatWatcherNotification(notification);
      const profile = options.profiles?.[notification.agent] ?? wakeProfileForAgent(notification.agent);
      const lastSpawnAt = await readSpawnStamp(options.roomDir, notification.agent);
      const plan = resolveSpawnPlan(
        profile,
        lastSpawnAt,
        Date.now(),
        options.spawnDebounceMs ?? DEFAULT_SPAWN_DEBOUNCE_MS
      );

      if (plan.shouldSpawn) {
        if (options.dryRun) {
          console.log(`${text}\nSPAWN (dry-run) ${notification.agent}: ${plan.command}`);
        } else {
          const exitCode = await runSpawnCommand(plan.command, notification.agent, text, options.roomDir);
          await writeSpawnStamp(options.roomDir, notification.agent, Date.now());
          await appendSpawnLog(options.roomDir, notification, plan.command, exitCode, text);
        }
      } else if (options.dryRun || !options.command) {
        console.log(text);
      } else {
        await runNotifyCommand(options.command, notification.agent, text, options.roomDir);
      }
      if (notification.highestId) await writeLastSeen(options.roomDir, notification.agent, notification.highestId);
    }
    return { notifications, messageCount: snapshot.messages?.length ?? 0 };
  } catch (error) {
    if (options.dryRun || options.once) console.error(error instanceof Error ? error.message : String(error));
    return { notifications: [], error: error instanceof Error ? error.message : String(error) };
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

async function runNotifyCommand(command, agent, text, roomDir) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        AGENT_ROOM_AGENT: agent,
        AGENT_ROOM_PING: text,
        AGENT_ROOM_DIR: roomDir
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Notify command exited ${code}`));
    });
  });
}

// Runs the profile's headless spawn command. Resolves with the exit code —
// a failed turn is logged, not thrown, so one bad spawn cannot kill the watcher.
async function runSpawnCommand(command, agent, text, roomDir) {
  return new Promise((resolveExit) => {
    const child = spawn(command, {
      shell: true,
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        AGENT_ROOM_AGENT: agent,
        AGENT_ROOM_PING: text,
        AGENT_ROOM_DIR: roomDir
      }
    });
    child.once("error", () => resolveExit(-1));
    child.once("exit", (code) => resolveExit(code ?? -1));
  });
}

// Same JSONL the dashboard Notifications panel reads (NotificationDelivery shape
// plus a spawn block), so spawned wakes are auditable next to toast deliveries.
async function appendSpawnLog(roomDir, notification, command, exitCode, text) {
  const record = {
    at: new Date().toISOString(),
    agent: notification.agent,
    messageIds: notification.messages.map((message) => message.id),
    total: notification.total,
    text: `[spawn exit ${exitCode}] ${text}`,
    spawn: { command, exitCode }
  };
  await mkdir(roomDir, { recursive: true });
  await appendFile(join(roomDir, "notifications.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
}

async function readSpawnStamp(roomDir, agent) {
  try {
    const value = Number.parseInt(await readFile(spawnStampPath(roomDir, agent), "utf8"), 10);
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function writeSpawnStamp(roomDir, agent, atMs) {
  const path = spawnStampPath(roomDir, agent);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${atMs}\n`, "utf8");
}

function spawnStampPath(roomDir, agent) {
  return join(roomDir, `.watch-spawnat-${agent}`);
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
