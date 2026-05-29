import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRoomStore } from "../src/store.js";
import { resolveDashboardOptions, startDashboardServer } from "../src/dashboard.js";

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
});
