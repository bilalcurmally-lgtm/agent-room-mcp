#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentRoomStore,
  type RoomConfig,
  type RoomDecision,
  type RoomMessage,
  type RoomProject,
  type RoomTask,
  type StaleTaskWarning
} from "./store.js";
import { dashboardHtml } from "./dashboard-ui.js";
import { createRoomTime, type RoomTime } from "./time.js";

export interface DashboardOptions {
  roomDir: string;
  port?: number;
  host?: string;
  openBrowser?: boolean;
}

export interface DashboardServer {
  url: string;
  close(): Promise<void>;
}

interface Snapshot {
  selectedProject: string;
  search: string;
  roomTime: RoomTime;
  config: RoomConfig;
  projects: string[];
  projectRecords: RoomProject[];
  messages: RoomMessage[];
  tasks: RoomTask[];
  staleTasks: StaleTaskWarning[];
  decisions: RoomDecision[];
  agents: Array<{
    id: string;
    displayName?: string;
    role?: string;
    lastReadMessageId?: string;
    registeredAt: string;
    updatedAt: string;
  }>;
}

export async function startDashboardServer(options: DashboardOptions): Promise<DashboardServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const store = await AgentRoomStore.open(options.roomDir);

  const server = createServer(async (request, response) => {
    try {
      await routeRequest(store, request, response);
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message });
        return;
      }
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://${host}:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      })
  };
}

export function resolveDashboardOptions(args: readonly string[], env: NodeJS.ProcessEnv): DashboardOptions {
  const explicitRoomIndex = args.indexOf("--room");
  const roomDir = explicitRoomIndex >= 0 ? args[explicitRoomIndex + 1] : env.AGENT_ROOM_DIR ?? ".agent-room";
  if (!roomDir) throw new Error("--room requires a directory path");

  const explicitPortIndex = args.indexOf("--port");
  const port = explicitPortIndex >= 0 ? Number(args[explicitPortIndex + 1]) : 4777;
  if (!Number.isInteger(port) || port <= 0) throw new Error("--port requires a positive integer");

  return {
    roomDir,
    port,
    openBrowser: !args.includes("--no-open")
  };
}

export function isDirectRun(moduleUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  return resolve(fileURLToPath(moduleUrl)) === resolve(argv1);
}

export interface BrowserLaunch {
  command: string;
  args: string[];
  windowsHide?: boolean;
}

export function createBrowserLaunch(url: string, platform: NodeJS.Platform = process.platform): BrowserLaunch {
  if (platform === "win32") {
    return {
      command: "cmd",
      args: ["/c", "start", "", "msedge", `--app=${url}`, "--new-window"],
      windowsHide: true
    };
  }

  if (platform === "darwin") {
    return {
      command: "open",
      args: ["-na", "Google Chrome", "--args", `--app=${url}`, "--new-window"]
    };
  }

  return {
    command: "xdg-open",
    args: [url]
  };
}

async function routeRequest(
  store: AgentRoomStore,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");

  if (method === "GET" && url.pathname === "/") {
    sendText(response, 200, dashboardHtml, "text/html; charset=utf-8");
    return;
  }

  if (method === "GET" && url.pathname === "/api/snapshot") {
    sendJson(
      response,
      200,
      await createSnapshot(store, url.searchParams.get("project") ?? "all", url.searchParams.get("q") ?? "")
    );
    return;
  }

  if (method === "POST" && url.pathname === "/api/messages") {
    const body = await readJsonBody(request);
    const message = await store.postMessage({
      from: optionalString(body.from) ?? "user",
      to: optionalString(body.to) ?? "all",
      topic: typeof body.topic === "string" ? body.topic : "User note",
      body: requireString(body.body, "body"),
      project: optionalProject(body.project),
      source: optionalString(body.source) ?? "dashboard",
      replyTo: optionalString(body.replyTo)
    });
    sendJson(response, 201, message);
    return;
  }

  if (method === "POST" && url.pathname === "/api/projects") {
    const body = await readJsonBody(request);
    const project = await store.upsertProject({
      id: requireString(body.id, "id"),
      name: requireString(body.name, "name"),
      folderPath: requireString(body.folderPath, "folderPath"),
      repoUrl: optionalString(body.repoUrl),
      status: optionalString(body.status)
    });
    sendJson(response, 201, project);
    return;
  }

  if (method === "POST" && url.pathname === "/api/config") {
    const body = await readJsonBody(request);
    const config = await store.updateConfig({
      staleTaskHours: optionalNumber(body.staleTaskHours)
    });
    sendJson(response, 200, config);
    return;
  }

  if (method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJsonBody(request);
    const task = await store.createTask({
      title: requireString(body.title, "title"),
      body: requireString(body.body, "body"),
      owner: typeof body.owner === "string" && body.owner.length > 0 ? body.owner : undefined,
      project: optionalProject(body.project),
      source: "dashboard"
    });
    sendJson(response, 201, task);
    return;
  }

  if (method === "POST" && url.pathname === "/api/tasks/update") {
    const body = await readJsonBody(request);
    const task = await store.updateTask({
      taskId: requireString(body.taskId, "taskId"),
      status: requireTaskStatus(body.status),
      owner: optionalString(body.owner),
      note: optionalString(body.note),
      by: optionalString(body.by) ?? "user"
    });
    sendJson(response, 200, task);
    return;
  }

  if (method === "POST" && url.pathname === "/api/tasks/notes") {
    const body = await readJsonBody(request);
    const task = await store.appendTaskNote({
      taskId: requireString(body.taskId, "taskId"),
      body: requireString(body.body, "body"),
      by: optionalString(body.by) ?? "user"
    });
    sendJson(response, 200, task);
    return;
  }

  if (method === "POST" && url.pathname === "/api/decisions") {
    const body = await readJsonBody(request);
    const decision = await store.recordDecision({
      title: requireString(body.title, "title"),
      decision: requireString(body.decision, "decision"),
      rationale: requireString(body.rationale, "rationale"),
      project: optionalProject(body.project),
      source: "dashboard"
    });
    sendJson(response, 201, decision);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function createSnapshot(store: AgentRoomStore, selectedProject: string, search: string): Promise<Snapshot> {
  const projectFilter = selectedProject === "all" ? undefined : selectedProject;
  const messages = await store.listMessages();
  const tasks = await store.listTasks(projectFilter && projectFilter !== "unsorted" ? { project: projectFilter } : {});
  const decisions = await store.listDecisions();
  const agents = await store.listAgents();
  const projectRecords = await store.listProjectRecords();
  const config = await store.getConfig();
  const staleTasks = await store.listStaleTasks(
    projectFilter && projectFilter !== "unsorted"
      ? { project: projectFilter, olderThanHours: config.staleTaskHours }
      : { olderThanHours: config.staleTaskHours }
  );
  const projectMessages = filterProject(messages, selectedProject);
  const projectTasks = filterProject(tasks, selectedProject);
  const projectStaleTasks = filterProject(staleTasks, selectedProject);
  const projectDecisions = filterProject(decisions, selectedProject);

  return {
    selectedProject,
    search,
    roomTime: createRoomTime(),
    config,
    projects: await store.listProjects(),
    projectRecords,
    messages: filterSearch(projectMessages, search, messageSearchText),
    tasks: filterSearch(projectTasks, search, taskSearchText),
    staleTasks: filterSearch(projectStaleTasks, search, staleTaskSearchText),
    decisions: filterSearch(projectDecisions, search, decisionSearchText),
    agents: agents.map(({ id, displayName, role, lastReadMessageId, registeredAt, updatedAt }) => ({
      id,
      displayName,
      role,
      lastReadMessageId,
      registeredAt,
      updatedAt
    }))
  };
}

function filterSearch<T>(items: T[], search: string, text: (item: T) => string): T[] {
  const query = search.trim().toLowerCase();
  if (!query) return items;
  return items.filter((item) => text(item).toLowerCase().includes(query));
}

function messageSearchText(message: RoomMessage): string {
  return [message.id, message.from, message.to, message.topic, message.body, message.project, message.source]
    .filter(Boolean)
    .join("\n");
}

function taskSearchText(task: RoomTask): string {
  return [
    task.id,
    task.title,
    task.body,
    task.status,
    task.owner,
    task.project,
    task.source,
    ...task.notes.map((note) => [note.by, note.body].join(" "))
  ]
    .filter(Boolean)
    .join("\n");
}

function staleTaskSearchText(warning: StaleTaskWarning): string {
  return [warning.taskId, warning.title, warning.status, warning.owner, warning.project, warning.message]
    .filter(Boolean)
    .join("\n");
}

function decisionSearchText(decision: RoomDecision): string {
  return [
    decision.id,
    decision.title,
    decision.decision,
    decision.rationale,
    decision.project,
    decision.source,
    ...(decision.links ?? [])
  ]
    .filter(Boolean)
    .join("\n");
}

function filterProject<T extends { project?: string }>(items: T[], selectedProject: string): T[] {
  if (selectedProject === "all") return items;
  if (selectedProject === "unsorted") return items.filter((item) => !item.project);
  return items.filter((item) => item.project === selectedProject);
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  try {
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${field} is required`);
  }
  return value;
}

function optionalProject(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "" || value === "all" || value === "unsorted") return undefined;
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function requireTaskStatus(value: unknown): "open" | "claimed" | "blocked" | "done" {
  if (value === "open" || value === "claimed" || value === "blocked" || value === "done") return value;
  throw new HttpError(400, "status must be open, claimed, blocked, or done");
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  sendText(response, status, JSON.stringify(value, null, 2), "application/json; charset=utf-8");
}

function sendText(response: ServerResponse, status: number, text: string, contentType: string): void {
  response.writeHead(status, { "content-type": contentType });
  response.end(text);
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function main(): Promise<void> {
  const options = resolveDashboardOptions(process.argv.slice(2), process.env);
  const server = await startDashboardServer(options);
  console.log(`Agent Room dashboard: ${server.url}`);
  if (options.openBrowser) openBrowser(server.url);
}

function openBrowser(url: string): void {
  const launch = createBrowserLaunch(url);
  spawn(launch.command, launch.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: launch.windowsHide
  }).unref();
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
