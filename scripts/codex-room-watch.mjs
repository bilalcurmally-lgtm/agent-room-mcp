#!/usr/bin/env node
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AGENT = "codex-desktop";
const TRUSTED_WORK_ASSIGNERS = new Set(["Bilal", "claude-opus"]);
const DEFAULT_ROOM_DIR = process.env.AGENT_ROOM_DIR ?? "D:\\projects\\.agent-room";
const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const DEFAULT_WAKE_TIMEOUT_MS = Number(process.env.CODEX_ROOM_WAKE_TIMEOUT_MS ?? 120_000);

export function selectCodexWakeMessages(messages, lastSeen = "") {
  const lastSeenValue = messageIdValue(lastSeen);
  return messages.filter((message) => {
    if (messageIdValue(message.id) <= lastSeenValue) return false;
    if (message.from === AGENT) return false;
    if (Array.isArray(message.mentions) && message.mentions.length > 0) {
      return message.mentions.includes(AGENT);
    }
    return message.to === "all" || message.to === AGENT;
  });
}

export function codexWakeSandboxMode(messages) {
  return messages.some((message) => TRUSTED_WORK_ASSIGNERS.has(message.from))
    ? "danger-full-access"
    : "workspace-write";
}

export function buildCodexWakeArgs({ repoRoot, roomDir, messageIds, sandboxMode }) {
  const ids = messageIds.join(", ");
  const prompt = [
    "Agent Room wake event.",
    `New routed message ids: ${ids}.`,
    `Room directory: ${roomDir}.`,
    "Use the agent-room MCP tools now: call check_in as codex-desktop with broadcasts enabled and project all.",
    "Read the newest room context before deciding what action is required.",
    "Follow the room's current role assignment and coordination instructions.",
    "If Bilal or the coordinator assigns or authorizes concrete work, execute it end to end in this same turn: inspect the repository, edit files, run tests, commit when appropriate, and report the result in the room.",
    "You may edit files and use tools when the room context authorizes implementation or review work; do not defer authorized work to a future normal turn.",
    "If the new messages are informational only, post only a concise acknowledgment when useful and do not invent work.",
    "Do not respond to your own messages."
  ].join(" ");
  return [
    "exec",
    "-C",
    repoRoot,
    "--sandbox",
    sandboxMode,
    ...(sandboxMode === "workspace-write"
      ? ["--config", 'windows.sandbox="unelevated"']
      : []),
    "--json",
    prompt
  ];
}

export async function runCodexWake({
  repoRoot = REPO_ROOT,
  roomDir = DEFAULT_ROOM_DIR,
  messageIds,
  sandboxMode = "workspace-write",
  command = process.env.CODEX_CLI_PATH ?? "codex",
  logPath = join(roomDir, ".codex-room-watch.log"),
  timeoutMs = DEFAULT_WAKE_TIMEOUT_MS
}) {
  await mkdir(dirname(logPath), { recursive: true });
  const args = buildCodexWakeArgs({ repoRoot, roomDir, messageIds, sandboxMode });
  const result = await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      windowsHide: true,
      shell: process.platform === "win32" && !command.toLowerCase().endsWith(".exe"),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const timeout =
      timeoutMs > 0
        ? setTimeout(() => {
            child.kill("SIGTERM");
            reject(new Error(`Codex wake timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : undefined;
    const clearWakeTimeout = () => {
      if (timeout) clearTimeout(timeout);
    };
    child.once("error", reject);
    child.once("exit", (code) => {
      clearWakeTimeout();
      resolveRun({ code: code ?? 1, stdout, stderr });
    });
  });
  await writeFile(
    logPath,
    `${new Date().toISOString()} ids=${messageIds.join(",")} exit=${result.code}\n${result.stdout}${result.stderr}\n`,
    { encoding: "utf8", flag: "a" }
  );
  if (result.code !== 0) throw new Error(`Codex wake exited ${result.code}`);
  return result;
}

export async function startCodexRoomWatch({
  repoRoot = REPO_ROOT,
  roomDir = DEFAULT_ROOM_DIR,
  command = process.env.CODEX_CLI_PATH ?? "codex",
  wake = runCodexWake
} = {}) {
  const messagesPath = join(roomDir, "messages.jsonl");
  const cursorPath = join(roomDir, ".codex-room-watch-lastseen");
  let lastSeen = await readText(cursorPath);
  let queued = false;
  let activeDrain = Promise.resolve();

  const initialMessages = await readMessages(messagesPath);
  if (!lastSeen && initialMessages.length > 0) {
    lastSeen = initialMessages.at(-1)?.id ?? "";
    await writeFile(cursorPath, `${lastSeen}\n`, "utf8");
  }

  const drain = () => {
    queued = true;
    activeDrain = activeDrain.catch(() => undefined).then(async () => {
      do {
        queued = false;
        const messages = await readMessages(messagesPath);
        const newestId = messages.at(-1)?.id ?? lastSeen;
        const selected = selectCodexWakeMessages(messages, lastSeen);
        if (newestId && newestId !== lastSeen) {
          lastSeen = newestId;
          await writeFile(cursorPath, `${lastSeen}\n`, "utf8");
        }
        if (selected.length > 0) {
          try {
            await wake({
              repoRoot,
              roomDir,
              command,
              messageIds: selected.map((message) => message.id),
              sandboxMode: codexWakeSandboxMode(selected)
            });
          } catch (error) {
            await logWatchError(roomDir, error);
          }
        }
      } while (queued);
    });
    return activeDrain;
  };

  const watcher = watch(messagesPath, { persistent: true }, () => {
    void drain().catch((error) => logWatchError(roomDir, error));
  });
  return { close: () => watcher.close(), drain };
}

async function logWatchError(roomDir, error) {
  await writeFile(
    join(roomDir, ".codex-room-watch.log"),
    `${new Date().toISOString()} error=${error instanceof Error ? error.stack : String(error)}\n`,
    { encoding: "utf8", flag: "a" }
  );
}

async function readMessages(path) {
  const content = await readText(path);
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

async function readText(path) {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return "";
  }
}

function messageIdValue(id) {
  const value = Number.parseInt(id || "0", 10);
  return Number.isFinite(value) ? value : 0;
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) {
  startCodexRoomWatch().then(() => {
    console.log(`Codex room watch active for ${DEFAULT_ROOM_DIR}`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
