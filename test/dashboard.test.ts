import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRoomStore } from "../src/store.js";
import { createBrowserLaunch, resolveDashboardOptions, startDashboardServer } from "../src/dashboard.js";

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers.length = 0;
});

describe("dashboard server", () => {
  it("resolves dashboard CLI options", () => {
    expect(resolveDashboardOptions(["--room", "D:\\projects\\.agent-room", "--port", "4777"], {})).toMatchObject({
      roomDir: "D:\\projects\\.agent-room",
      port: 4777
    });

    expect(resolveDashboardOptions([], { AGENT_ROOM_DIR: "env-room" })).toMatchObject({
      roomDir: "env-room"
    });
  });

  it("launches the dashboard in a dedicated browser window on Windows", () => {
    expect(createBrowserLaunch("http://127.0.0.1:4777", "win32")).toEqual({
      command: "cmd",
      args: ["/c", "start", "", "msedge", "--app=http://127.0.0.1:4777", "--new-window"],
      windowsHide: true
    });
  });

  it("returns a project-scoped snapshot", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const store = await AgentRoomStore.open(roomDir);
    await store.registerAgent({ agent: "codex", role: "implementer" });
    await store.postMessage({
      from: "user",
      to: "all",
      topic: "Build",
      body: "Build dashboard",
      project: "dashboard-v2"
    });
    await store.createTask({ title: "Build UI", body: "Make it usable", project: "dashboard-v2" });

    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const response = await fetch(`${server.url}/api/snapshot?project=dashboard-v2`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      selectedProject: "dashboard-v2",
      messages: [{ topic: "Build" }],
      tasks: [{ title: "Build UI" }],
      agents: [{ id: "codex" }]
    });
  });

  it("lets the user post a message without touching JSON files", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const response = await fetch(`${server.url}/api/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Codex implement, Opus review.", project: "dashboard-v2" })
    });

    expect(response.status).toBe(201);
    const snapshot = await fetch(`${server.url}/api/snapshot?project=dashboard-v2`).then((res) => res.json());
    expect(snapshot.messages).toMatchObject([{ from: "user", to: "all", body: "Codex implement, Opus review." }]);
  });

  it("preserves explicit HTTP message identity and routing", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const response = await fetch(`${server.url}/api/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "claude-opus",
        to: "codex-desktop",
        topic: "Review handoff",
        body: "[STATUS: reviewing] Found one issue. [NEXT: Codex fix it.]",
        project: "agent-room-mcp",
        source: "claude-http",
        replyTo: "000001"
      })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      from: "claude-opus",
      to: "codex-desktop",
      topic: "Review handoff",
      source: "claude-http",
      replyTo: "000001"
    });
  });

  it("serves a human-friendly control room page", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const html = await fetch(server.url).then((res) => res.text());

    expect(html).toContain("Agent Room");
    expect(html).toContain("Tell the room");
    expect(html).toContain("Project");
    expect(html).toContain("Create task");
    expect(html).toContain("Record decision");
    expect(html).toContain("formatTimestamp");
    expect(html).toContain("Your local time");
    expect(html).toContain("Route to");
    expect(html).toContain("[STATUS:");
    expect(html).toContain("[NEXT:");
    expect(html).toContain("Add project folder");
    expect(html).toContain("Project folder");
  });

  it("lets the user create tasks and decisions from the dashboard API", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    await fetch(`${server.url}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Implement sidebar",
        body: "Codex owns implementation.",
        owner: "codex",
        project: "dashboard-v2"
      })
    });

    await fetch(`${server.url}/api/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Human is lead",
        decision: "User decisions override agent debate.",
        rationale: "Prevents drift.",
        project: "dashboard-v2"
      })
    });

    const snapshot = await fetch(`${server.url}/api/snapshot?project=dashboard-v2`).then((res) => res.json());
    expect(snapshot.tasks).toMatchObject([{ title: "Implement sidebar", owner: "codex" }]);
    expect(snapshot.decisions).toMatchObject([{ title: "Human is lead" }]);
  });

  it("lets the user update task status, owner, and notes from the dashboard API", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const store = await AgentRoomStore.open(roomDir);
    const task = await store.createTask({
      title: "Fix routing",
      body: "Keep the dashboard tab stable.",
      owner: "codex",
      project: "agent-room-mcp"
    });
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const updateResponse = await fetch(`${server.url}/api/tasks/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId: task.id,
        status: "blocked",
        owner: "claude-opus",
        note: "Needs review before merge.",
        by: "user"
      })
    });
    expect(updateResponse.status).toBe(200);

    const noteResponse = await fetch(`${server.url}/api/tasks/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId: task.id,
        body: "Branch codex/task-editing is ready.",
        by: "codex"
      })
    });
    expect(noteResponse.status).toBe(200);

    const snapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp`).then((res) => res.json());
    expect(snapshot.tasks).toMatchObject([
      {
        id: task.id,
        status: "blocked",
        owner: "claude-opus",
        notes: [
          expect.objectContaining({ by: "user", body: "Needs review before merge." }),
          expect.objectContaining({ by: "codex", body: "Branch codex/task-editing is ready." })
        ]
      }
    ]);
  });

  it("lets the user register a project folder and returns it in snapshots", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const response = await fetch(`${server.url}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "audit-cockpit",
        name: "Audit Cockpit",
        folderPath: "D:\\projects\\audit-cockpit",
        repoUrl: "https://github.com/example/audit-cockpit"
      })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: "audit-cockpit",
      name: "Audit Cockpit",
      folderPath: "D:\\projects\\audit-cockpit"
    });

    const snapshot = await fetch(`${server.url}/api/snapshot?project=audit-cockpit`).then((res) => res.json());
    expect(snapshot.projectRecords).toMatchObject([
      { id: "audit-cockpit", name: "Audit Cockpit", folderPath: "D:\\projects\\audit-cockpit" }
    ]);
  });
});
