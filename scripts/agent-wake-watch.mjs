#!/usr/bin/env node
// Generic, profile-driven Agent Room wake watcher.
//
// Watches the room's messages.jsonl via filesystem events and, when a new
// message is routed to THIS agent, spawns a fresh headless turn of that agent's
// CLI (claude, codex, ...). The turn checks in, reads, and acts — no desktop
// notifications, no polling. One watcher process per agent; designed to be kept
// alive by scripts/agent-room-watch-supervisor.ps1 under a Scheduled Task.
//
// This supersedes the per-agent codex-room-watch.mjs: any stack can be wired by
// adding a profile below (or passing --command / --args-template), so the same
// machinery works for Claude+Codex users today and other stacks later.
//
// Usage:
//   node scripts/agent-wake-watch.mjs --agent claude-opus --room "D:\\projects\\.agent-room"
//   node scripts/agent-wake-watch.mjs --agent codex-desktop --once   (drain backlog once, for tests)

import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const DEFAULT_ROOM_DIR = process.env.AGENT_ROOM_DIR ?? "D:\\projects\\.agent-room";
const DEFAULT_WAKE_TIMEOUT_MS = Number(process.env.AGENT_WAKE_TIMEOUT_MS ?? 180_000);
// Senders allowed to authorize real work (edits/commits) in the woken turn.
const TRUSTED_WORK_ASSIGNERS = new Set(["Bilal", "claude-opus", "codex-desktop"]);

// ---------------------------------------------------------------------------
// Profiles: how to launch a headless turn for a given agent's CLI.
// A profile is { command, buildArgs(ctx) } where ctx = { prompt, repoRoot,
// roomDir, mcpConfigPath, trusted }. Add a profile to support a new stack.
// ---------------------------------------------------------------------------
export const PROFILES = {
  claude: {
    command: process.env.CLAUDE_CLI_PATH ?? "claude",
    needsMcpConfig: true,
    buildArgs: ({ prompt, mcpConfigPath }) => [
      "-p",
      prompt,
      "--permission-mode",
      "bypassPermissions",
      ...(mcpConfigPath ? ["--mcp-config", mcpConfigPath] : []),
      "--model",
      process.env.CLAUDE_WAKE_MODEL ?? "opus"
    ]
  },
  codex: {
    command: process.env.CODEX_CLI_PATH ?? "codex",
    needsMcpConfig: false,
    buildArgs: ({ prompt, repoRoot, trusted }) => {
      const sandboxMode = trusted ? "danger-full-access" : "workspace-write";
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
  }
};

// Infer a profile name from an agent id when --profile isn't passed.
export function profileForAgent(agent, explicit) {
  if (explicit) return explicit;
  const id = agent.toLowerCase();
  if (id.includes("codex")) return "codex";
  if (id.includes("claude")) return "claude";
  if (id.includes("grok")) return "grok";
  return "claude";
}

// Select messages that should wake THIS agent: newer than the cursor, not its
// own, and either @mentioning it or routed to it / broadcast.
export function selectWakeMessages(messages, agent, lastSeen = "") {
  const lastSeenValue = messageIdValue(lastSeen);
  return messages.filter((message) => {
    if (messageIdValue(message.id) <= lastSeenValue) return false;
    if (message.from === agent) return false;
    if (Array.isArray(message.mentions) && message.mentions.length > 0) {
      return message.mentions.includes(agent);
    }
    return message.to === "all" || message.to === agent;
  });
}

// A woken turn may run real toolchains only if a trusted sender is in the batch.
export function isTrustedBatch(messages) {
  return messages.some((message) => TRUSTED_WORK_ASSIGNERS.has(message.from));
}

export function buildWakePrompt({ agent, roomDir, messageIds, trusted }) {
  const ids = messageIds.join(", ");
  return [
    "Agent Room wake event.",
    `You are the agent "${agent}".`,
    `New routed message ids: ${ids}.`,
    `Room directory: ${roomDir}.`,
    `Use the agent-room MCP tools now: call check_in as "${agent}" with broadcasts enabled and project all.`,
    "Read the newest room context before deciding what action is required.",
    "Follow the room's current role assignment and coordination instructions.",
    trusted
      ? "A trusted sender (Bilal or a coordinator agent) is in this batch: if they assign or authorize concrete work, execute it end to end in this same turn — inspect the repo, edit files, run tests, commit when appropriate, and report the result in the room."
      : "No trusted assigner in this batch: respond/acknowledge in the room and do NOT edit files or invent work.",
    "If the new messages are informational only, post a concise acknowledgment only when useful.",
    "Mark messages read through the newest id when done. Do not respond to your own messages."
  ].join(" ");
}

export function buildWakeArgs({ profile, prompt, repoRoot, roomDir, mcpConfigPath, trusted }) {
  const def = PROFILES[profile];
  if (!def) throw new Error(`Unknown wake profile: ${profile}`);
  return def.buildArgs({ prompt, repoRoot, roomDir, mcpConfigPath, trusted });
}

// Write a self-contained MCP config so a headless claude can reach the room
// server regardless of user-level config (portable across machines).
export async function ensureMcpConfig({ profile, repoRoot, roomDir }) {
  if (!PROFILES[profile]?.needsMcpConfig) return undefined;
  const configPath = join(roomDir, `.${profile}-wake-mcp.json`);
  const config = {
    mcpServers: {
      "agent-room": {
        type: "stdio",
        command: "node",
        args: [join(repoRoot, "dist", "server.js"), "--room", roomDir],
        env: {}
      }
    }
  };
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configPath;
}

export async function runWake({
  agent,
  profile,
  repoRoot = REPO_ROOT,
  roomDir = DEFAULT_ROOM_DIR,
  messageIds,
  mcpConfigPath,
  trusted = false,
  command = PROFILES[profile]?.command,
  timeoutMs = DEFAULT_WAKE_TIMEOUT_MS,
  logPath = join(roomDir, `.${agent}-wake-watch.log`)
}) {
  await mkdir(dirname(logPath), { recursive: true });
  const prompt = buildWakePrompt({ agent, roomDir, messageIds, trusted });
  const args = buildWakeArgs({ profile, prompt, repoRoot, roomDir, mcpConfigPath, trusted });
  const result = await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      windowsHide: true,
      shell: process.platform === "win32" && !String(command).toLowerCase().endsWith(".exe"),
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
            reject(new Error(`${agent} wake timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : undefined;
    const clearWakeTimeout = () => {
      if (timeout) clearTimeout(timeout);
    };
    child.once("error", (error) => {
      clearWakeTimeout();
      reject(error);
    });
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
  if (result.code !== 0) throw new Error(`${agent} wake exited ${result.code}`);
  return result;
}

export async function startAgentWakeWatch({
  agent,
  profile = profileForAgent(agent),
  repoRoot = REPO_ROOT,
  roomDir = DEFAULT_ROOM_DIR,
  wake = runWake,
  writePid = true
} = {}) {
  if (!agent) throw new Error("startAgentWakeWatch requires { agent }");
  const messagesPath = join(roomDir, "messages.jsonl");
  const cursorPath = join(roomDir, `.${agent}-wake-watch-lastseen`);
  const pidPath = join(roomDir, `.${agent}-room-watch.pid`);
  const mcpConfigPath = await ensureMcpConfig({ profile, repoRoot, roomDir });

  await mkdir(roomDir, { recursive: true });
  if (writePid) await writeFile(pidPath, `${process.pid}\n`, "utf8");

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
        const selected = selectWakeMessages(messages, agent, lastSeen);
        if (newestId && newestId !== lastSeen) {
          lastSeen = newestId;
          await writeFile(cursorPath, `${lastSeen}\n`, "utf8");
        }
        if (selected.length > 0) {
          try {
            await wake({
              agent,
              profile,
              repoRoot,
              roomDir,
              mcpConfigPath,
              trusted: isTrustedBatch(selected),
              messageIds: selected.map((message) => message.id)
            });
          } catch (error) {
            await logWatchError(roomDir, agent, error);
          }
        }
      } while (queued);
    });
    return activeDrain;
  };

  const watcher = watch(messagesPath, { persistent: true }, () => {
    void drain().catch((error) => logWatchError(roomDir, agent, error));
  });
  return { close: () => watcher.close(), drain, pidPath, mcpConfigPath };
}

async function logWatchError(roomDir, agent, error) {
  await writeFile(
    join(roomDir, `.${agent}-wake-watch.log`),
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

function parseCliArgs(argv) {
  const out = { agent: "", profile: "", room: DEFAULT_ROOM_DIR, once: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--agent") out.agent = argv[++i] ?? "";
    else if (arg === "--profile") out.profile = argv[++i] ?? "";
    else if (arg === "--room") out.room = argv[++i] ?? DEFAULT_ROOM_DIR;
    else if (arg === "--once") out.once = true;
  }
  return out;
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) {
  const cli = parseCliArgs(process.argv.slice(2));
  if (!cli.agent) {
    console.error("Usage: node scripts/agent-wake-watch.mjs --agent <id> [--profile claude|codex] [--room <dir>] [--once]");
    process.exitCode = 1;
  } else {
    const profile = profileForAgent(cli.agent, cli.profile || undefined);
    startAgentWakeWatch({ agent: cli.agent, profile, roomDir: cli.room })
      .then(async (handle) => {
        if (cli.once) {
          await handle.drain();
          handle.close();
          console.log(`Drained wake backlog once for ${cli.agent}.`);
          return;
        }
        console.log(`Agent wake watch active: agent=${cli.agent} profile=${profile} room=${cli.room}`);
      })
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  }
}
