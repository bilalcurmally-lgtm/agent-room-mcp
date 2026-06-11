#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { isDirectRun } from "./server.js";

const execFileAsync = promisify(execFile);

export type DoctorLevel = "pass" | "warn" | "fail";

export interface DoctorCheck {
  name: string;
  level: DoctorLevel;
  detail: string;
  hint?: string;
}

export interface WakeDoctorOptions {
  agent: string;
  roomDir: string;
  repoRoot: string;
  project: string;
  dashboardUrl?: string;
  serverEntry?: string;
  skipDashboard?: boolean;
  skipScheduledTask?: boolean;
  skipMcp?: boolean;
}

export interface WakeDoctorResult {
  ok: boolean;
  checks: DoctorCheck[];
}

const REQUIRED_TOOLS = [
  "check_in_compact",
  "post_message",
  "read_messages",
  "mark_messages_read",
  "get_room_status"
];

export async function runWakeDoctor(options: WakeDoctorOptions): Promise<WakeDoctorResult> {
  const checks: DoctorCheck[] = [];
  const serverEntry = options.serverEntry ?? join(options.repoRoot, "dist", "server.js");

  checks.push(await checkFile("compiled MCP server", serverEntry, "Run npm run build."));
  checks.push(await checkFile("room directory", options.roomDir, "Create it or pass --room <path> (default: ~/.agent-room)."));
  checks.push(await checkFile("messages log", join(options.roomDir, "messages.jsonl"), "Start the room once so storage files are created."));

  if (!options.skipMcp) {
    checks.push(await checkMcpCompact({ ...options, serverEntry }));
  }
  if (!options.skipDashboard) {
    checks.push(await checkDashboard(options));
  }
  if (!options.skipScheduledTask) {
    checks.push(await checkScheduledTask(options.agent));
  }

  checks.push(await checkWatcherMarker(options));
  checks.push(await checkWatcherPid(options));
  checks.push(await checkCursor(options));
  checks.push(await checkBudget(options));
  checks.push(await checkWatcherLog(options));

  return {
    ok: !checks.some((check) => check.level === "fail"),
    checks
  };
}

export function formatWakeDoctorReport(result: WakeDoctorResult, options: WakeDoctorOptions): string {
  const lines = [
    "Agent Room wake doctor",
    "",
    `Agent: ${options.agent}`,
    `Room: ${options.roomDir}`,
    `Project: ${options.project}`,
    ""
  ];
  for (const check of result.checks) {
    lines.push(`${label(check.level)} ${check.name}`);
    lines.push(`     ${check.detail}`);
    if (check.hint) lines.push(`     hint: ${check.hint}`);
    lines.push("");
  }
  lines.push(result.ok ? "Wake doctor passed." : "Wake doctor found blocking failures.");
  return lines.join("\n");
}

async function checkFile(name: string, path: string, hint: string): Promise<DoctorCheck> {
  try {
    await access(path);
    return { name, level: "pass", detail: path };
  } catch {
    return { name, level: "fail", detail: `Missing: ${path}`, hint };
  }
}

async function checkMcpCompact(options: WakeDoctorOptions & { serverEntry: string }): Promise<DoctorCheck> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [options.serverEntry, "--room", options.roomDir],
    stderr: "pipe",
    cwd: options.repoRoot
  });
  const client = new Client({ name: "agent-room-wake-doctor", version: "0.1.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = new Set(tools.tools.map((tool) => tool.name));
    const missing = REQUIRED_TOOLS.filter((tool) => !names.has(tool));
    if (missing.length) {
      return {
        name: "MCP compact tool surface",
        level: "fail",
        detail: `Missing tools: ${missing.join(", ")}`,
        hint: "Rebuild and restart/reload MCP clients."
      };
    }
    const compact = await callToolJson(client, "check_in_compact", {
      agent: options.agent,
      project: options.project,
      includeBroadcasts: true,
      limit: 3
    }) as { contextBudget?: { mode?: string }; unread?: { count?: number; returned?: number } };
    if (compact.contextBudget?.mode !== "compact") {
      return {
        name: "MCP compact check-in",
        level: "fail",
        detail: "check_in_compact returned but did not report compact mode."
      };
    }
    return {
      name: "MCP compact check-in",
      level: "pass",
      detail: `check_in_compact ok; unread ${compact.unread?.returned ?? 0}/${compact.unread?.count ?? 0}`
    };
  } catch (error) {
    return {
      name: "MCP compact check-in",
      level: "fail",
      detail: errorMessage(error),
      hint: "Run npm run build, then restart/reload the MCP client or watcher."
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function checkDashboard(options: WakeDoctorOptions): Promise<DoctorCheck> {
  const base = options.dashboardUrl ?? "http://127.0.0.1:4777";
  const url = `${base.replace(/\/$/, "")}/api/snapshot?project=${encodeURIComponent(options.project)}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    if (!response.ok) {
      return {
        name: "dashboard snapshot",
        level: "fail",
        detail: `${url} returned HTTP ${response.status}`,
        hint: "Start the dashboard from the latest build."
      };
    }
    const snapshot = await response.json() as { selectedProject?: string; agents?: unknown[] };
    return {
      name: "dashboard snapshot",
      level: "pass",
      detail: `${url}; selected=${snapshot.selectedProject ?? "unknown"}; agents=${snapshot.agents?.length ?? 0}`
    };
  } catch (error) {
    return {
      name: "dashboard snapshot",
      level: "fail",
      detail: errorMessage(error),
      hint: "Start agent-room-dashboard or pass --dashboard-url."
    };
  }
}

async function checkScheduledTask(agent: string): Promise<DoctorCheck> {
  if (process.platform !== "win32") {
    return { name: "scheduled task", level: "warn", detail: "Skipped on non-Windows platform." };
  }
  const taskName = taskNameForAgent(agent);
  try {
    const { stdout } = await execFileAsync("schtasks.exe", ["/Query", "/TN", taskName, "/FO", "LIST"]);
    const status = stdout.match(/^Status:\s*(.+)$/m)?.[1]?.trim() ?? "unknown";
    const level: DoctorLevel = status.toLowerCase() === "running" || status.toLowerCase() === "ready" ? "pass" : "warn";
    return {
      name: "scheduled task",
      level,
      detail: `${taskName}; status=${status}`,
      hint: level === "warn" ? "Run npm run install-codex-watch-task or install-claude-watch-task as appropriate." : undefined
    };
  } catch (error) {
    return {
      name: "scheduled task",
      level: "warn",
      detail: `${taskName} not found or not queryable: ${errorMessage(error)}`,
      hint: "Install the watcher scheduled task, or pass --skip-task for manual watcher sessions."
    };
  }
}

async function checkWatcherMarker(options: WakeDoctorOptions): Promise<DoctorCheck> {
  const path = join(options.roomDir, `.${options.agent}-watch-task.json`);
  try {
    const marker = await readJsonFile<{ taskName?: string; startScript?: string }>(path);
    return {
      name: "watch task marker",
      level: "pass",
      detail: `${path}; task=${marker.taskName ?? "unknown"}; startScript=${marker.startScript ?? "unknown"}`
    };
  } catch {
    return {
      name: "watch task marker",
      level: "warn",
      detail: `Missing or unreadable: ${path}`,
      hint: "Install a durable watcher task, or ignore for manual watcher testing."
    };
  }
}

async function checkWatcherPid(options: WakeDoctorOptions): Promise<DoctorCheck> {
  const pidPaths = pidPathsForAgent(options).map((name) => join(options.roomDir, name));
  const pidPath = await firstReadablePath(pidPaths) ?? pidPaths[0];
  try {
    const raw = (await readFile(pidPath, "utf8")).trim();
    const pid = Number(raw);
    if (!Number.isInteger(pid) || pid <= 0) {
      return { name: "watcher process", level: "fail", detail: `Invalid pid in ${pidPath}: ${raw}` };
    }
    return processAlive(pid)
      ? { name: "watcher process", level: "pass", detail: `${pidPath}; pid=${pid} is alive` }
      : {
          name: "watcher process",
          level: "fail",
          detail: `${pidPath}; pid=${pid} is not running`,
          hint: "Restart the watcher or scheduled task."
        };
  } catch {
    return {
      name: "watcher process",
      level: "fail",
      detail: `Missing pid file: ${pidPath}`,
      hint: "Start the watcher or run the scheduled-task supervisor."
    };
  }
}

async function checkCursor(options: WakeDoctorOptions): Promise<DoctorCheck> {
  const paths = cursorPathsForAgent(options.agent).map((name) => join(options.roomDir, name));
  const path = await firstReadablePath(paths) ?? paths[0];
  try {
    const cursor = (await readFile(path, "utf8")).trim();
    return {
      name: "wake cursor",
      level: cursor ? "pass" : "warn",
      detail: cursor ? `${path}; lastSeen=${cursor}` : `${path} is empty`,
      hint: cursor ? undefined : "A first watcher start should initialize this to the newest existing message id."
    };
  } catch {
    return {
      name: "wake cursor",
      level: "warn",
      detail: `Missing: ${path}`,
      hint: "Start the generic watcher once; it creates the cursor without replaying backlog."
    };
  }
}

async function checkBudget(options: WakeDoctorOptions): Promise<DoctorCheck> {
  const path = join(options.roomDir, `.${options.agent}-wake-budget.json`);
  try {
    const budget = await readJsonFile<unknown[]>(path);
    return {
      name: "wake budget",
      level: "pass",
      detail: `${path}; entries=${Array.isArray(budget) ? budget.length : "unknown"}`
    };
  } catch {
    return {
      name: "wake budget",
      level: "warn",
      detail: `Missing: ${path}`,
      hint: "This appears after the first budgeted autonomous wake."
    };
  }
}

async function checkWatcherLog(options: WakeDoctorOptions): Promise<DoctorCheck> {
  const paths = logPathsForAgent(options.agent).map((name) => join(options.roomDir, name));
  const path = await firstReadablePath(paths) ?? paths[0];
  try {
    const text = await readFile(path, "utf8");
    const tail = text.trim().split(/\r?\n/).slice(-1)[0] ?? "";
    return { name: "watcher log", level: "pass", detail: tail ? `${path}; latest=${tail}` : `${path}; empty` };
  } catch {
    return {
      name: "watcher log",
      level: "warn",
      detail: `Missing: ${path}`,
      hint: "A watcher writes this after a wake attempt or error."
    };
  }
}

function pidPathsForAgent(options: WakeDoctorOptions): string[] {
  if (options.agent === "codex-desktop") return [".codex-desktop-room-watch.pid", ".codex-room-watch.pid"];
  const safeAgent = options.agent.replace(/[^A-Za-z0-9_.-]/g, "-");
  return [`.${safeAgent}-room-watch.pid`];
}

function cursorPathsForAgent(agent: string): string[] {
  if (agent === "codex-desktop") return [".codex-desktop-wake-watch-lastseen", ".codex-room-watch-lastseen"];
  return [`.${agent}-wake-watch-lastseen`];
}

function logPathsForAgent(agent: string): string[] {
  if (agent === "codex-desktop") return [".codex-desktop-wake-watch.log", ".codex-room-watch.log"];
  return [`.${agent}-wake-watch.log`];
}

async function firstReadablePath(paths: string[]): Promise<string | undefined> {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try next candidate.
    }
  }
  return undefined;
}

function taskNameForAgent(agent: string): string {
  const safeAgent = agent.replace(/[^A-Za-z0-9_.-]/g, "-");
  return `Agent Room Watch - ${safeAgent}`;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function callToolJson(client: Client, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content;
  if (!Array.isArray(content)) throw new Error(`${name} returned no content`);
  const text = content.find((part) => part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part);
  if (!text || typeof (text as { text?: unknown }).text !== "string") throw new Error(`${name} returned no text`);
  if (result.isError) throw new Error((text as { text: string }).text);
  return JSON.parse((text as { text: string }).text);
}

async function readJsonFile<T>(path: string): Promise<T> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text.replace(/^\uFEFF/, "")) as T;
}

function label(level: DoctorLevel): string {
  if (level === "pass") return "PASS";
  if (level === "warn") return "WARN";
  return "FAIL";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseArgs(argv: readonly string[]): WakeDoctorOptions {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    agent: value("--agent") ?? "codex-desktop",
    roomDir: value("--room") ?? process.env.AGENT_ROOM_DIR ?? join(homedir(), ".agent-room"),
    repoRoot,
    project: value("--project") ?? process.env.AGENT_ROOM_PROJECT ?? "agent-room-mcp",
    dashboardUrl: value("--dashboard-url") ?? process.env.AGENT_ROOM_DASHBOARD_URL ?? "http://127.0.0.1:4777",
    serverEntry: value("--server") ?? join(repoRoot, "dist", "server.js"),
    skipDashboard: argv.includes("--skip-dashboard"),
    skipScheduledTask: argv.includes("--skip-task"),
    skipMcp: argv.includes("--skip-mcp")
  };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv);
  const result = await runWakeDoctor(options);
  console.log(formatWakeDoctorReport(result, options));
  return result.ok ? 0 : 1;
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().then((code) => process.exit(code));
}
