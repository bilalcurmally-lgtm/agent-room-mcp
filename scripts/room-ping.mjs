#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_AGENT = "claude-opus";
const DEFAULT_ROOM_DIR = join(homedir(), ".agent-room");
const DEFAULT_SNAPSHOT_URL =
  process.env.AGENT_ROOM_SNAPSHOT_URL ?? "http://127.0.0.1:4777/api/snapshot?project=all";
const DEFAULT_LIMIT = 10;

export function messageTargetsAgent(message, agent) {
  if (message.from === agent) return false;
  if (Array.isArray(message.mentions) && message.mentions.length > 0) {
    return message.mentions.includes(agent);
  }
  if (message.to === "all") return true;
  return message.to === agent;
}

export function selectUnreadMessages(messages, options) {
  const lastSeen = options.lastSeen ?? "";
  return messages
    .filter((message) => message.id > lastSeen)
    .filter((message) => messageTargetsAgent(message, options.agent))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, options.limit);
}

export function formatRoomPing(messages, options = {}) {
  if (!messages.length) return "";

  const lines = [`ROOM: ${messages.length} new message${messages.length === 1 ? "" : "s"}`];
  for (const message of messages) {
    const project = message.project ? ` (${message.project})` : "";
    const summary = [message.topic, trimOneLine(message.body)].filter(Boolean).join(" - ");
    lines.push(`[${message.id}] ${message.from} -> ${message.to}${project}: ${summary}`);
  }

  const overflow = Math.max(0, (options.total ?? messages.length) - messages.length);
  if (overflow > 0) lines.push(`+${overflow} more, run check_in`);
  return lines.join("\n");
}

export function resolvePingOptions(args, env = process.env) {
  return {
    agent: valueAfter(args, "--agent") ?? env.AGENT_ROOM_AGENT ?? DEFAULT_AGENT,
    roomDir: valueAfter(args, "--room") ?? env.AGENT_ROOM_DIR ?? DEFAULT_ROOM_DIR,
    snapshotUrl: valueAfter(args, "--url") ?? env.AGENT_ROOM_SNAPSHOT_URL ?? DEFAULT_SNAPSHOT_URL,
    limit: Number(valueAfter(args, "--limit") ?? env.AGENT_ROOM_PING_LIMIT ?? DEFAULT_LIMIT)
  };
}

export function lastSeenPath(roomDir, agent) {
  return join(roomDir, `.lastseen-${agent}`);
}

export async function runRoomPing(options) {
  const statePath = lastSeenPath(options.roomDir, options.agent);

  try {
    const [snapshot, lastSeen] = await Promise.all([
      fetchSnapshot(options.snapshotUrl),
      readLastSeen(statePath)
    ]);
    const allUnread = selectUnreadMessages(snapshot.messages ?? [], {
      agent: options.agent,
      lastSeen,
      limit: Number.MAX_SAFE_INTEGER
    });
    const selected = allUnread.slice(0, options.limit);
    const output = formatRoomPing(selected, { total: allUnread.length });
    const highest = selected.at(-1)?.id;
    if (highest) await writeLastSeen(statePath, highest);

    return {
      output,
      selected,
      totalUnread: allUnread.length,
      highestId: highest,
      lastSeenBefore: lastSeen
    };
  } catch (error) {
    return {
      output: "",
      selected: [],
      totalUnread: 0,
      highestId: undefined,
      lastSeenBefore: "",
      silent: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Max consecutive Stop-hook blocks before going silent. Without this cap, two
// chatty agents can Stop-hook each other into an infinite ping-pong overnight.
export const STOP_GUARD_LIMIT = 3;

export function stopGuardPath(roomDir, agent) {
  return join(roomDir, `.stopguard-${agent}`);
}

export async function readStopGuard(path) {
  try {
    const count = Number.parseInt(await readFile(path, "utf8"), 10);
    return Number.isFinite(count) && count > 0 ? count : 0;
  } catch {
    return 0;
  }
}

export async function writeStopGuard(path, count) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${count}\n`, "utf8");
}

export async function resetStopGuard(path) {
  await rm(path, { force: true });
}

// Claude Code Stop-hook mode: when unread routed messages exist, return a block
// decision so Claude continues its turn with the ping injected as the reason.
// Re-entrancy (stop_hook_active) and the consecutive-block guard keep this from
// looping; the guard resets whenever the user submits a prompt.
export async function runStopHook(options, payload = {}) {
  if (payload.stop_hook_active === true) {
    return { block: false, reason: "", skipped: "stop_hook_active" };
  }

  const guardPath = stopGuardPath(options.roomDir, options.agent);
  const blocks = await readStopGuard(guardPath);
  if (blocks >= STOP_GUARD_LIMIT) {
    return { block: false, reason: "", skipped: "loop-guard" };
  }

  const result = await runRoomPing(options);
  if (!result.output) return { block: false, reason: "" };

  await writeStopGuard(guardPath, blocks + 1);
  return { block: true, reason: result.output };
}

async function readStdinJson() {
  try {
    if (process.stdin.isTTY) return {};
    let data = "";
    for await (const chunk of process.stdin) data += chunk;
    return data.trim() ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = resolvePingOptions(args);
  const mode = valueAfter(args, "--mode") ?? "prompt";

  if (mode === "stop") {
    const payload = await readStdinJson();
    const result = await runStopHook(options, payload);
    if (result.block) console.log(JSON.stringify({ decision: "block", reason: result.reason }));
    return;
  }

  // UserPromptSubmit / SessionStart: a human is present, so the loop guard resets.
  await resetStopGuard(stopGuardPath(options.roomDir, options.agent));
  const result = await runRoomPing(options);
  if (result.output) console.log(result.output);
}

export async function fetchSnapshot(url) {
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

export async function readLastSeen(path) {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return "";
  }
}

export async function writeLastSeen(path, id) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${id}\n`, "utf8");
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function trimOneLine(value) {
  if (typeof value !== "string") return "";
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 117)}...` : oneLine;
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) {
  main();
}
