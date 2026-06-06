#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentRoomStore,
  resolveWriteProject,
  type RoomConfig,
  type RoomDecision,
  type RoomMessage,
  type RoomProject,
  type RoomStatus,
  type RoomTask,
  type StaleItemWarning,
  type StaleTaskWarning
} from "./store.js";
import { formatRelativeTime, parseFollowUpHints, type FollowUpHint } from "./temporal.js";
import { dashboardHtml } from "./dashboard-ui.js";
import type { EnrichedRoadmapProgress } from "./room-progress.js";
import { getRoadmapProgressForRoom } from "./room-progress.js";
import { protocolWarningsForMessages, type ProtocolWarning } from "./protocol.js";
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

export interface SnapshotMessage extends RoomMessage {
  relativeTime: string;
  followUpHints: FollowUpHint[];
}

export interface WorkspaceInfo {
  projectId: string;
  name: string;
  folderPath?: string;
  registered: boolean;
}

interface Snapshot {
  selectedProject: string;
  search: string;
  actor: string;
  since: string;
  until: string;
  roomTime: RoomTime;
  config: RoomConfig;
  writeProject?: string;
  workspace?: WorkspaceInfo;
  progress: EnrichedRoadmapProgress;
  status: RoomStatus;
  projects: string[];
  projectRecords: RoomProject[];
  messages: SnapshotMessage[];
  tasks: RoomTask[];
  staleTasks: StaleTaskWarning[];
  staleMessages: StaleItemWarning[];
  staleDecisions: StaleItemWarning[];
  protocolWarnings: ProtocolWarning[];
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

interface SnapshotFilters {
  search: string;
  actor: string;
  since: string;
  until: string;
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
      await createSnapshot(store, url.searchParams.get("project") ?? "all", {
        search: url.searchParams.get("q") ?? "",
        actor: url.searchParams.get("actor") ?? "",
        since: url.searchParams.get("since") ?? "",
        until: url.searchParams.get("until") ?? ""
      })
    );
    return;
  }

  const attachmentMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)$/);
  if (method === "GET" && attachmentMatch) {
    const { stored, content } = await store.readAttachmentFile(attachmentMatch[1]);
    sendBuffer(response, 200, content, stored.mimeType);
    return;
  }

  if (method === "POST" && url.pathname === "/api/attachments") {
    const body = await readJsonBody(request);
    const attachment = await store.uploadAttachment({
      fileName: requireString(body.fileName, "fileName"),
      mimeType: requireString(body.mimeType, "mimeType"),
      contentBase64: requireString(body.contentBase64, "contentBase64"),
      uploadedBy: optionalString(body.uploadedBy) ?? "user"
    });
    sendJson(response, 201, attachment);
    return;
  }

  if (method === "POST" && url.pathname === "/api/attachments/link") {
    const body = await readJsonBody(request);
    const attachment = await store.linkAttachment({
      name: requireString(body.name, "name"),
      url: requireString(body.url, "url"),
      uploadedBy: optionalString(body.uploadedBy) ?? "user"
    });
    sendJson(response, 201, attachment);
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
      replyTo: optionalString(body.replyTo),
      status: optionalString(body.status),
      next: optionalString(body.next),
      phase: optionalString(body.phase),
      attachmentIds: optionalStringArray(body.attachmentIds),
      links: optionalAttachmentLinks(body.links)
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

  if (method === "POST" && url.pathname === "/api/projects/delete") {
    const body = await readJsonBody(request);
    const project = await store.deleteProject({
      id: requireString(body.id, "id")
    });
    sendJson(response, 200, project);
    return;
  }

  if (method === "POST" && url.pathname === "/api/config") {
    const body = await readJsonBody(request);
    const config = await store.updateConfig({
      staleTaskHours: optionalNumber(body.staleTaskHours),
      currentUser: optionalString(body.currentUser),
      enforceProtocol: optionalBoolean(body.enforceProtocol),
      activeProject:
        body.activeProject === null ? null : optionalString(body.activeProject)
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
      source: "dashboard",
      attachmentIds: optionalStringArray(body.attachmentIds),
      links: optionalAttachmentLinks(body.links)
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
      branch: optionalString(body.branch),
      commit: optionalString(body.commit),
      by: optionalString(body.by) ?? "user",
      attachmentIds: optionalStringArray(body.attachmentIds),
      links: optionalAttachmentLinks(body.links)
    });
    sendJson(response, 200, task);
    return;
  }

  if (method === "POST" && url.pathname === "/api/tasks/notes") {
    const body = await readJsonBody(request);
    const task = await store.appendTaskNote({
      taskId: requireString(body.taskId, "taskId"),
      body: requireString(body.body, "body"),
      branch: optionalString(body.branch),
      commit: optionalString(body.commit),
      by: optionalString(body.by) ?? "user",
      attachmentIds: optionalStringArray(body.attachmentIds),
      links: optionalAttachmentLinks(body.links)
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
      source: "dashboard",
      attachmentIds: optionalStringArray(body.attachmentIds),
      linkAttachments: optionalAttachmentLinks(body.linkAttachments)
    });
    sendJson(response, 201, decision);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function createSnapshot(
  store: AgentRoomStore,
  selectedProject: string,
  filters: SnapshotFilters
): Promise<Snapshot> {
  const projectFilter = selectedProject === "all" ? undefined : selectedProject;
  const dateRange = createDateRange(filters.since, filters.until);
  const messages = await store.listMessages();
  const tasks = await store.listTasks(projectFilter && projectFilter !== "unsorted" ? { project: projectFilter } : {});
  const decisions = await store.listDecisions();
  const agents = await store.listAgents();
  const projectRecords = await store.listProjectRecords();
  const config = await store.getConfig();
  const status = await store.getRoomStatus();
  const staleOptions =
    projectFilter && projectFilter !== "unsorted"
      ? { project: projectFilter, olderThanHours: config.staleTaskHours }
      : { olderThanHours: config.staleTaskHours };
  const staleTasks = await store.listStaleTasks(staleOptions);
  const staleMessages = await store.listStaleMessages(staleOptions);
  const staleDecisions = await store.listStaleDecisions(staleOptions);
  const roomTime = createRoomTime();
  const projectMessages = filterProject(messages, selectedProject);
  const projectTasks = filterProject(tasks, selectedProject);
  const projectStaleTasks = filterProject(staleTasks, selectedProject);
  const projectProtocolWarnings = protocolWarningsForMessages(projectMessages);
  const projectDecisions = filterProject(decisions, selectedProject);
  const filteredMessages = filterDateRange(filterActor(projectMessages, filters.actor, messageActorText), dateRange, [
    messageTime
  ]);
  const filteredTasks = filterDateRange(filterActor(projectTasks, filters.actor, taskActorText), dateRange, [
    taskUpdatedTime,
    taskNoteTimes
  ]);
  const projectStaleMessages = filterProject(staleMessages, selectedProject);
  const projectStaleDecisions = filterProject(staleDecisions, selectedProject);
  const filteredStaleTasks = filterDateRange(filterActor(projectStaleTasks, filters.actor, staleTaskActorText), dateRange, [
    staleTaskUpdatedTime
  ]);
  const filteredStaleMessages = filterDateRange(
    filterActor(projectStaleMessages, filters.actor, staleItemActorText),
    dateRange,
    [staleItemUpdatedTime]
  );
  const filteredStaleDecisions = filterDateRange(
    filterActor(projectStaleDecisions, filters.actor, staleItemActorText),
    dateRange,
    [staleItemUpdatedTime]
  );
  const filteredProtocolWarnings = filterDateRange(
    filterActor(projectProtocolWarnings, filters.actor, protocolWarningActorText),
    dateRange,
    [protocolWarningTime]
  );
  const filteredDecisions = filterDateRange(filterActor(projectDecisions, filters.actor, decisionActorText), dateRange, [
    decisionTime
  ]);
  const writeProject = resolveWriteProject(config, selectedProject);
  const workspace = buildWorkspaceInfo(config.activeProject, projectRecords);

  return {
    selectedProject,
    search: filters.search,
    actor: filters.actor,
    since: filters.since,
    until: filters.until,
    roomTime,
    config,
    writeProject,
    workspace,
    progress: await getRoadmapProgressForRoom({
      roomDir: store.roomDir,
      projects: projectRecords,
      tasks,
      decisions,
      messages,
      agents,
      protocolWarningCount: projectProtocolWarnings.length,
      config
    }),
    status,
    projects: await store.listProjects(),
    projectRecords,
    messages: enrichMessages(filterSearch(filteredMessages, filters.search, messageSearchText), roomTime),
    tasks: filterSearch(filteredTasks, filters.search, taskSearchText),
    staleTasks: filterSearch(filteredStaleTasks, filters.search, staleTaskSearchText),
    staleMessages: filterSearch(filteredStaleMessages, filters.search, staleItemSearchText),
    staleDecisions: filterSearch(filteredStaleDecisions, filters.search, staleItemSearchText),
    protocolWarnings: filterSearch(filteredProtocolWarnings, filters.search, protocolWarningSearchText),
    decisions: filterSearch(filteredDecisions, filters.search, decisionSearchText),
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

interface DateRange {
  since?: Date;
  until?: Date;
}

function buildWorkspaceInfo(
  activeProject: string | undefined,
  projectRecords: RoomProject[]
): WorkspaceInfo | undefined {
  if (!activeProject) return undefined;
  const record = projectRecords.find((project) => project.id === activeProject);
  if (record) {
    return {
      projectId: record.id,
      name: record.name,
      folderPath: record.folderPath,
      registered: true
    };
  }

  return {
    projectId: activeProject,
    name: activeProject,
    registered: false
  };
}

function createDateRange(since: string, until: string): DateRange {
  return {
    since: parseStartDate(since),
    until: parseEndDate(until)
  };
}

function parseStartDate(value: string): Date | undefined {
  if (!value) return undefined;
  return parseDashboardDate(value, false);
}

function parseEndDate(value: string): Date | undefined {
  if (!value) return undefined;
  return parseDashboardDate(value, true);
}

function parseDashboardDate(value: string, endOfDay: boolean): Date | undefined {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (dateOnly && endOfDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function filterSearch<T>(items: T[], search: string, text: (item: T) => string): T[] {
  const query = search.trim().toLowerCase();
  if (!query) return items;
  return items.filter((item) => text(item).toLowerCase().includes(query));
}

function filterActor<T>(items: T[], actor: string, text: (item: T) => string): T[] {
  const query = actor.trim().toLowerCase();
  if (!query) return items;
  return items.filter((item) => text(item).toLowerCase().includes(query));
}

function filterDateRange<T>(items: T[], range: DateRange, accessors: Array<(item: T) => string[]>): T[] {
  if (!range.since && !range.until) return items;
  return items.filter((item) => {
    const dates = accessors
      .flatMap((accessor) => accessor(item))
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()));
    return dates.some((date) => {
      if (range.since && date < range.since) return false;
      if (range.until && date >= range.until) return false;
      return true;
    });
  });
}

function messageSearchText(message: RoomMessage): string {
  return [
    message.id,
    message.from,
    message.to,
    message.topic,
    message.body,
    message.project,
    message.source,
    message.status,
    message.next,
    message.phase
  ]
    .filter(Boolean)
    .join("\n");
}

function messageActorText(message: RoomMessage): string {
  return [message.from, message.to, message.source].filter(Boolean).join("\n");
}

function messageTime(message: RoomMessage): string[] {
  return [message.time];
}

function enrichMessages(messages: RoomMessage[], roomTime: RoomTime): SnapshotMessage[] {
  return messages.map((message) => ({
    ...message,
    relativeTime: formatRelativeTime(message.time),
    followUpHints: parseFollowUpHints([message.body, message.next].filter(Boolean).join("\n"), roomTime)
  }));
}

function staleItemSearchText(warning: StaleItemWarning): string {
  return [warning.id, warning.title, warning.kind, warning.project, warning.message].filter(Boolean).join("\n");
}

function staleItemActorText(_warning: StaleItemWarning): string {
  return "";
}

function staleItemUpdatedTime(warning: StaleItemWarning): string[] {
  return [warning.updatedAt];
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
    ...task.notes.map((note) => [note.by, note.body, note.branch, note.commit].filter(Boolean).join(" "))
  ]
    .filter(Boolean)
    .join("\n");
}

function taskActorText(task: RoomTask): string {
  return [task.owner, task.source, ...task.notes.map((note) => note.by)].filter(Boolean).join("\n");
}

function taskUpdatedTime(task: RoomTask): string[] {
  return [task.updatedAt];
}

function taskNoteTimes(task: RoomTask): string[] {
  return task.notes.map((note) => note.at);
}

function staleTaskSearchText(warning: StaleTaskWarning): string {
  return [warning.taskId, warning.title, warning.status, warning.owner, warning.project, warning.message]
    .filter(Boolean)
    .join("\n");
}

function staleTaskActorText(warning: StaleTaskWarning): string {
  return [warning.owner].filter(Boolean).join("\n");
}

function staleTaskUpdatedTime(warning: StaleTaskWarning): string[] {
  return [warning.updatedAt];
}

function protocolWarningSearchText(warning: ProtocolWarning): string {
  return [
    warning.messageId,
    warning.from,
    warning.to,
    warning.topic,
    warning.project,
    warning.message,
    ...warning.missing,
    ...warning.invalid
  ]
    .filter(Boolean)
    .join("\n");
}

function protocolWarningActorText(warning: ProtocolWarning): string {
  return [warning.from, warning.to].filter(Boolean).join("\n");
}

function protocolWarningTime(warning: ProtocolWarning): string[] {
  return [warning.time];
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

function decisionActorText(decision: RoomDecision): string {
  return [decision.source].filter(Boolean).join("\n");
}

function decisionTime(decision: RoomDecision): string[] {
  return [decision.time];
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

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return items.length ? items : undefined;
}

function optionalAttachmentLinks(
  value: unknown
): Array<{ name: string; url: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const links = value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : "";
    const linkUrl = typeof row.url === "string" ? row.url : "";
    if (!linkUrl) return [];
    return [{ name: name || linkUrl, url: linkUrl }];
  });
  return links.length ? links : undefined;
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

function sendBuffer(response: ServerResponse, status: number, body: Buffer, contentType: string): void {
  response.writeHead(status, {
    "content-type": contentType,
    "content-length": String(body.length)
  });
  response.end(body);
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
