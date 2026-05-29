#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { AgentRoomStore, type RoomDecision, type RoomMessage, type RoomTask } from "./store.js";

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
  projects: string[];
  messages: RoomMessage[];
  tasks: RoomTask[];
  decisions: RoomDecision[];
  agents: Array<{ id: string; displayName?: string; role?: string; lastReadMessageId?: string }>;
}

const dashboardHtml = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Agent Room</title></head>
<body><h1>Agent Room</h1></body>
</html>`;

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
    sendJson(response, 200, await createSnapshot(store, url.searchParams.get("project") ?? "all"));
    return;
  }

  if (method === "POST" && url.pathname === "/api/messages") {
    const body = await readJsonBody(request);
    const message = await store.postMessage({
      from: "user",
      to: "all",
      topic: typeof body.topic === "string" ? body.topic : "User note",
      body: requireString(body.body, "body"),
      project: optionalProject(body.project),
      source: "dashboard"
    });
    sendJson(response, 201, message);
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

async function createSnapshot(store: AgentRoomStore, selectedProject: string): Promise<Snapshot> {
  const projectFilter = selectedProject === "all" ? undefined : selectedProject;
  const messages = await store.listMessages();
  const tasks = await store.listTasks(projectFilter && projectFilter !== "unsorted" ? { project: projectFilter } : {});
  const decisions = await store.listDecisions();
  const agents = await store.listAgents();

  return {
    selectedProject,
    projects: await store.listProjects(),
    messages: filterProject(messages, selectedProject),
    tasks: filterProject(tasks, selectedProject),
    decisions: filterProject(decisions, selectedProject),
    agents: agents.map(({ id, displayName, role, lastReadMessageId }) => ({ id, displayName, role, lastReadMessageId }))
  };
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
