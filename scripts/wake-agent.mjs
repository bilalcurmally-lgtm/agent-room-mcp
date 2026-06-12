#!/usr/bin/env node
import { spawn } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export function inboxPath(roomDir, agent) {
  return join(roomDir, `.wake-inbox-${agent}.txt`);
}

export function compactBody(text) {
  const body = String(text || "No room message provided.").replace(/\s+/g, " ").trim();
  return body.length > 240 ? body.slice(0, 237) + "..." : body;
}

function quoteAppleScript(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function createNotificationCommand(platform, repoRoot, agent, ping) {
  const title = `Agent Room - ${agent || "agent"}`;
  const body = compactBody(ping);
  if (platform === "win32") {
    return {
      command: "powershell",
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        join(repoRoot, "scripts", "notify-agent-room.ps1").replaceAll("\\", "/")
      ]
    };
  }
  if (platform === "darwin") {
    return {
      command: "osascript",
      args: ["-e", `display notification "${quoteAppleScript(body)}" with title "${quoteAppleScript(title)}"`]
    };
  }
  if (platform === "linux") {
    return {
      command: "notify-send",
      args: [title, body]
    };
  }
  return undefined;
}

async function appendInbox(roomDir, agent, ping) {
  const path = inboxPath(roomDir, agent);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${ping || "No room message provided."}\n`, "utf8");
}

async function runNotification(command, env) {
  await new Promise((resolve) => {
    const child = spawn(command.command, command.args, {
      stdio: "ignore",
      windowsHide: true,
      env
    });
    child.once("error", () => resolve());
    child.once("exit", () => resolve());
  });
}

export async function deliverWake(input, options = {}) {
  const agent = input.agent || "agent";
  const ping = input.ping || "No room message provided.";
  const roomDir = input.roomDir;
  if (roomDir) await appendInbox(roomDir, agent, ping);

  if (options.notify === false) return;
  const command = createNotificationCommand(options.platform ?? process.platform, options.repoRoot ?? REPO_ROOT, agent, ping);
  if (!command) return;
  await runNotification(command, {
    ...process.env,
    AGENT_ROOM_AGENT: agent,
    AGENT_ROOM_PING: ping,
    ...(roomDir ? { AGENT_ROOM_DIR: roomDir } : {})
  });
}

async function main() {
  await deliverWake({
    agent: process.env.AGENT_ROOM_AGENT || "agent",
    ping: process.env.AGENT_ROOM_PING || "No room message provided.",
    roomDir: process.env.AGENT_ROOM_DIR
  });
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
