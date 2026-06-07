import { mkdtemp, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
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
      progress: {
        done: expect.any(Number),
        total: expect.any(Number),
        remaining: expect.any(Number),
        percent: expect.any(Number),
        roomDriven: true,
        items: expect.arrayContaining([
          expect.objectContaining({
            title: "Project Registry And Folder Picker",
            fileStatus: "done",
            roomStatus: "todo",
            status: "todo",
            source: "room",
            evidence: expect.stringContaining("registered project")
          }),
          expect.objectContaining({
            title: "Roadmap Progress Honesty",
            status: "done",
            evidence: expect.stringContaining("ROADMAP.json")
          })
        ])
      },
      roomTime: {
        utcIso: expect.any(String),
        timezone: expect.any(String),
        unixSeconds: expect.any(Number)
      },
      status: {
        messages: 1,
        tasks: {
          open: 1
        },
        agents: 1
      },
      messages: [{ topic: "Build" }],
      tasks: [{ title: "Build UI" }],
      protocolWarnings: [],
      agents: [{ id: "codex" }]
    });
  });

  it("flags agent messages that miss protocol fields", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const store = await AgentRoomStore.open(roomDir);
    const badMessage = await store.postMessage({
      from: "codex-desktop",
      to: "claude-opus",
      topic: "Review handoff",
      body: "I fixed the dashboard. Please review.",
      project: "agent-room-mcp"
    });
    await store.postMessage({
      from: "claude-opus",
      to: "codex-desktop",
      topic: "Compliant handoff",
      body: "[STATUS: reviewing] Looks good. [NEXT: Codex can merge.]",
      project: "agent-room-mcp"
    });
    await store.postMessage({
      from: "user",
      to: "all",
      topic: "Casual note",
      body: "Please keep the dashboard simple.",
      project: "agent-room-mcp"
    });

    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const snapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp`).then((res) => res.json());
    expect(snapshot.protocolWarnings).toMatchObject([
      {
        messageId: badMessage.id,
        from: "codex-desktop",
        to: "claude-opus",
        topic: "Review handoff",
        project: "agent-room-mcp",
        missing: ["[STATUS:]", "[NEXT:]"],
        invalid: [],
        message: expect.stringContaining("Missing [STATUS:] and [NEXT:]")
      }
    ]);
  });

  it("accepts structured protocol fields on dashboard messages", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const response = await fetch(`${server.url}/api/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: "C1 routing is ready.",
        to: "all",
        status: "implementing",
        next: "Claude review",
        phase: "C1",
        project: "agent-room-mcp"
      })
    });
    expect(response.status).toBe(201);

    const snapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp`).then((res) => res.json());
    expect(snapshot.messages).toMatchObject([
      {
        body: expect.stringContaining("[STATUS: implementing]"),
        status: "implementing",
        next: "Claude review",
        phase: "C1"
      }
    ]);
    expect(snapshot.protocolWarnings).toEqual([]);
  });

  it("flags invalid protocol phase labels", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const store = await AgentRoomStore.open(roomDir);
    await store.postMessage({
      from: "codex-desktop",
      to: "all",
      topic: "Bad phase",
      body: "[STATUS: implementing] Ready. [NEXT: review] [PHASE: sprint-9]",
      project: "agent-room-mcp"
    });
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const snapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp`).then((res) => res.json());
    expect(snapshot.protocolWarnings).toMatchObject([
      { invalid: ["[PHASE: sprint-9]"], missing: [] }
    ]);
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
    expect(html).toContain("Room time");
    expect(html).toContain("Route to");
    expect(html).toContain("To all");
    expect(html).toContain("To Codex");
    expect(html).toContain("To Claude");
    expect(html).toContain("applyRoutePreset");
    expect(html).toContain("message-status");
    expect(html).toContain("message-phase");
    expect(html).toContain("message-next");
    expect(html).toContain("enforce-protocol");
    expect(html).toContain("Add or save project folder");
    expect(html).toContain("Project folder");
    expect(html).toContain("Browse folder");
    expect(html).toContain("Load selected project");
    expect(html).toContain("Delete project folder");
    expect(html).toContain("showDirectoryPicker");
    expect(html).toContain('id="search"');
    expect(html).toContain("room-clock");
    expect(html).toContain("formatRelativeTime");
    expect(html).toContain("staleTasks");
    expect(html).toContain("stale-messages");
    expect(html).toContain("stale-decisions");
    expect(html).toContain("followUpHints");
    expect(html).toContain("stale-threshold-form");
    expect(html).toContain("progress-bar");
    expect(html).toContain("renderProgress");
    expect(html).toContain("section-roadmap");
    expect(html).toContain("feed-section");
    expect(html).toContain("header-progress");
    expect(html).toContain("humanizeProgressNote");
    expect(html).toContain("workspace-banner");
    expect(html).toContain("renderWorkspaceBanner");
    expect(html).toContain("Registered workspaces");
    expect(html).toContain("protocol-warnings");
    expect(html).toContain("protocol-warnings");
    expect(html).toContain("protocolWarnings");
    expect(html).toContain("filter-agent");
    expect(html).toContain("filterSince");
    expect(html).toContain("filterUntil");
    expect(html).toContain("current-user");
    expect(html).toContain("Today");
    expect(html).toContain('data-filter-preset="week"');
    expect(html).toContain('data-filter-preset="mine"');
    expect(html).toContain("Mine");
    expect(html).toContain('data-filter-preset="review"');
    expect(html).toContain('data-filter-preset="clear"');
    expect(html).toContain("applyFilterPreset");
    expect(html).toContain("section-overview");
    expect(html).toContain("room-status");
    expect(html).toContain("renderStatus");
    expect(html).toContain("side-toggle");
    expect(html).toContain("panel-section");
    expect(html).toContain("setPanelOpen");
    expect(html).toContain("stale-quiet");
    expect(html).toContain("No messages yet");
    expect(html).toContain("section-notifications");
    expect(html).toContain("renderNotifications");
    expect(html).toContain("loadNotifications");
    expect(html).toContain("To Grok");
    expect(html).toContain(".feed {");
    expect(html).toContain("min-height: 0");
    expect(html).toContain("details.feed-section");
    expect(html).toContain("overflow: hidden");
  });

  it("exposes room notification status from the dashboard API", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false, enableNotifications: true });
    servers.push(server);

    const response = await fetch(`${server.url}/api/notifications`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      enabled: true,
      running: true,
      agents: expect.any(Array),
      recent: expect.any(Array)
    });
  });

  it("routes @mentions when posting from the dashboard API", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const store = await AgentRoomStore.open(roomDir);
    await store.registerAgent({ agent: "grok" });
    await store.registerAgent({ agent: "codex-desktop" });
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const response = await fetch(`${server.url}/api/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: "@grok please review this",
        project: "agent-room-mcp"
      })
    });
    expect(response.status).toBe(201);

    const snapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp`).then((res) => res.json());
    expect(snapshot.messages).toMatchObject([{ to: "grok", body: expect.stringContaining("@grok") }]);
  });

  it("routes explicit To Grok to grok-cli when only grok-cli has joined", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const store = await AgentRoomStore.open(roomDir);
    await store.registerAgent({ agent: "grok-cli" });
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const response = await fetch(`${server.url}/api/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: "grok",
        body: "Direct route preset test",
        project: "agent-room-mcp"
      })
    });
    expect(response.status).toBe(201);

    const snapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp`).then((res) => res.json());
    expect(snapshot.messages).toMatchObject([{ to: "grok-cli", body: "Direct route preset test" }]);
  });

  it("delivers room notifications to joined agents after posting", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const store = await AgentRoomStore.open(roomDir);
    await store.registerAgent({ agent: "grok" });
    await store.registerAgent({ agent: "codex-desktop" });
    const server = await startDashboardServer({
      roomDir,
      port: 0,
      openBrowser: false,
      enableNotifications: true,
      notifyCommand: 'node -e "process.exit(0)"'
    });
    servers.push(server);

    const response = await fetch(`${server.url}/api/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: "@grok ping from dashboard",
        project: "agent-room-mcp"
      })
    });
    expect(response.status).toBe(201);

    const notifications = await fetch(`${server.url}/api/notifications`).then((res) => res.json());
    expect(notifications).toMatchObject({
      enabled: true,
      running: true,
      agentCount: 2,
      recent: expect.arrayContaining([
        expect.objectContaining({
          agent: "grok",
          messageIds: expect.arrayContaining([expect.any(String)])
        })
      ])
    });
    expect(notifications.recent.find((entry: { agent: string }) => entry.agent === "codex-desktop")).toBeUndefined();
  });

  it("surfaces follow-up hints and stale message warnings in snapshots", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const store = await AgentRoomStore.open(roomDir);
    const message = await store.postMessage({
      from: "user",
      to: "all",
      topic: "Schedule",
      body: "Ship later today and review tomorrow.",
      project: "agent-room-mcp"
    });
    const messages = await store.listMessages();
    messages[0].time = "2000-01-01T00:00:00.000Z";
    await writeFile(
      join(roomDir, "messages.jsonl"),
      `${messages.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "utf8"
    );
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const snapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp`).then((res) => res.json());

    expect(snapshot.messages[0]).toMatchObject({
      id: message.id,
      relativeTime: expect.any(String),
      followUpHints: expect.arrayContaining([
        expect.objectContaining({ phrase: "later today" }),
        expect.objectContaining({ phrase: "tomorrow" })
      ])
    });
    expect(snapshot.staleMessages).toMatchObject([{ kind: "message", id: message.id }]);
  });

  it("returns stale task warnings in project snapshots", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const store = await AgentRoomStore.open(roomDir);
    const stale = await store.createTask({
      title: "Re-check stale dashboard task",
      body: "Old context.",
      owner: "codex",
      project: "agent-room-mcp"
    });
    const tasks = await store.listTasks({});
    tasks[0].updatedAt = "2000-01-01T00:00:00.000Z";
    await writeFile(join(roomDir, "tasks.json"), `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const snapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp`).then((res) => res.json());

    expect(snapshot.staleTasks).toMatchObject([
      {
        taskId: stale.id,
        title: "Re-check stale dashboard task",
        owner: "codex",
        message: expect.stringContaining("Re-check")
      }
    ]);
  });

  it("lets the user configure stale task warning threshold", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const updateResponse = await fetch(`${server.url}/api/config`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ staleTaskHours: 6 })
    });

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({ staleTaskHours: 6 });

    const snapshot = await fetch(`${server.url}/api/snapshot`).then((res) => res.json());
    expect(snapshot.config).toMatchObject({ staleTaskHours: 6, currentUser: "user", enforceProtocol: false });
  });

  it("exposes workspace and write project in snapshots", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const store = await AgentRoomStore.open(roomDir);
    await store.upsertProject({
      id: "agent-room-mcp",
      name: "Agent Room MCP",
      folderPath: "D:\\projects\\agent-room-mcp"
    });
    await store.updateConfig({ activeProject: "agent-room-mcp" });
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const snapshot = await fetch(`${server.url}/api/snapshot?project=all`).then((res) => res.json());

    expect(snapshot).toMatchObject({
      selectedProject: "all",
      writeProject: "agent-room-mcp",
      workspace: {
        projectId: "agent-room-mcp",
        name: "Agent Room MCP",
        folderPath: "D:\\projects\\agent-room-mcp",
        registered: true
      }
    });
  });

  it("persists current-user identity and exposes it in snapshots", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const updateResponse = await fetch(`${server.url}/api/config`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentUser: "bill" })
    });

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({ currentUser: "bill" });

    const snapshot = await fetch(`${server.url}/api/snapshot`).then((res) => res.json());
    expect(snapshot.config).toMatchObject({ currentUser: "bill" });
  });

  it("filters snapshot history to the configured current user", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const store = await AgentRoomStore.open(roomDir);
    await store.updateConfig({ currentUser: "bill" });
    await store.postMessage({
      from: "bill",
      to: "all",
      topic: "Mine message",
      body: "From the configured user.",
      project: "agent-room-mcp"
    });
    await store.postMessage({
      from: "codex",
      to: "all",
      topic: "Agent message",
      body: "From Codex.",
      project: "agent-room-mcp"
    });
    await store.createTask({
      title: "Bill task",
      body: "Owned by bill.",
      owner: "bill",
      project: "agent-room-mcp"
    });
    await store.createTask({
      title: "Codex task",
      body: "Owned by codex.",
      owner: "codex",
      project: "agent-room-mcp"
    });
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const snapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp&actor=bill`).then((res) =>
      res.json()
    );

    expect(snapshot.actor).toBe("bill");
    expect(snapshot.messages).toMatchObject([{ topic: "Mine message" }]);
    expect(snapshot.tasks).toMatchObject([{ title: "Bill task" }]);
  });

  it("searches messages, tasks, task notes, and decisions in a project snapshot", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const store = await AgentRoomStore.open(roomDir);
    const task = await store.createTask({
      title: "Implement search",
      body: "Find the needle task.",
      owner: "codex",
      project: "agent-room-mcp"
    });
    await store.appendTaskNote({ taskId: task.id, body: "Needle note from review.", by: "claude-opus" });
    await store.postMessage({
      from: "user",
      to: "all",
      topic: "Needle message",
      body: "This should match.",
      project: "agent-room-mcp"
    });
    await store.postMessage({
      from: "user",
      to: "all",
      topic: "Other message",
      body: "This should not match.",
      project: "agent-room-mcp"
    });
    await store.recordDecision({
      title: "Needle decision",
      decision: "Keep search simple.",
      rationale: "Humans need it.",
      project: "agent-room-mcp"
    });
    await store.recordDecision({
      title: "Other decision",
      decision: "Keep something else.",
      rationale: "Not relevant.",
      project: "agent-room-mcp"
    });
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const messageSnapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp&q=needle%20message`)
      .then((res) => res.json());
    expect(messageSnapshot.search).toBe("needle message");
    expect(messageSnapshot.messages).toMatchObject([{ topic: "Needle message" }]);
    expect(messageSnapshot.tasks).toEqual([]);
    expect(messageSnapshot.decisions).toEqual([]);

    const noteSnapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp&q=review`)
      .then((res) => res.json());
    expect(noteSnapshot.tasks).toMatchObject([{ id: task.id, title: "Implement search" }]);
    expect(noteSnapshot.decisions).toEqual([]);

    const decisionSnapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp&q=simple`)
      .then((res) => res.json());
    expect(decisionSnapshot.decisions).toMatchObject([{ title: "Needle decision" }]);
    expect(decisionSnapshot.messages).toEqual([]);
  });

  it("filters snapshot history by agent and date range", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const store = await AgentRoomStore.open(roomDir);
    const task = await store.createTask({
      title: "Codex task",
      body: "Owned by Codex.",
      owner: "codex",
      project: "agent-room-mcp"
    });
    await store.createTask({
      title: "Claude task",
      body: "Owned by Claude.",
      owner: "claude-opus",
      project: "agent-room-mcp"
    });
    await store.postMessage({
      from: "codex",
      to: "claude-opus",
      topic: "Modern handoff",
      body: "[STATUS: implementing] Done. [NEXT: Claude review.]",
      project: "agent-room-mcp"
    });
    await store.recordDecision({
      title: "Modern decision",
      decision: "Keep filters server-side.",
      rationale: "Hooks need the same view.",
      source: "codex",
      project: "agent-room-mcp"
    });

    const tasks = await store.listTasks({});
    tasks[0].updatedAt = "2020-01-01T00:00:00.000Z";
    tasks[1].updatedAt = "2026-05-31T10:00:00.000Z";
    await writeFile(join(roomDir, "tasks.json"), `${JSON.stringify(tasks, null, 2)}\n`, "utf8");

    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const actorSnapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp&actor=codex`)
      .then((res) => res.json());
    expect(actorSnapshot.actor).toBe("codex");
    expect(actorSnapshot.messages).toMatchObject([{ topic: "Modern handoff" }]);
    expect(actorSnapshot.tasks).toMatchObject([{ id: task.id, title: "Codex task" }]);
    expect(actorSnapshot.decisions).toMatchObject([{ title: "Modern decision" }]);

    const dateSnapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp&since=2026-05-31`)
      .then((res) => res.json());
    expect(dateSnapshot.since).toBe("2026-05-31");
    expect(dateSnapshot.tasks).toMatchObject([{ title: "Claude task" }]);
    expect(dateSnapshot.tasks).not.toEqual(expect.arrayContaining([expect.objectContaining({ title: "Codex task" })]));
  });

  it("lets the user create tasks and decisions from the dashboard API", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const attachment = await fetch(`${server.url}/api/attachments/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Spec", url: "https://example.com/spec" })
    }).then((res) => res.json());

    await fetch(`${server.url}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Implement sidebar",
        body: "Codex owns implementation.",
        owner: "codex",
        project: "dashboard-v2",
        attachmentIds: [attachment.id]
      })
    });

    await fetch(`${server.url}/api/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Human is lead",
        decision: "User decisions override agent debate.",
        rationale: "Prevents drift.",
        project: "dashboard-v2",
        attachmentIds: [attachment.id],
        linkAttachments: [{ name: "Decision link", url: "https://example.com/decision" }]
      })
    });

    const snapshot = await fetch(`${server.url}/api/snapshot?project=dashboard-v2`).then((res) => res.json());
    expect(snapshot.tasks).toMatchObject([{ title: "Implement sidebar", owner: "codex", attachments: [{ id: attachment.id }] }]);
    expect(snapshot.decisions).toMatchObject([{ title: "Human is lead", attachments: [{ id: attachment.id }, { name: "Decision link" }] }]);
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
        body: "Ready for review.",
        branch: "codex/task-editing",
        commit: "abc123",
        by: "codex",
        links: [{ name: "Review note", url: "https://example.com/note" }]
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
          expect.objectContaining({
            by: "codex",
            body: "Ready for review.",
            branch: "codex/task-editing",
            commit: "abc123",
            attachments: [expect.objectContaining({ name: "Review note" })]
          })
        ]
      }
    ]);
  });

  it("serves inline task action controls in the dashboard HTML", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const html = await fetch(`${server.url}/`).then((res) => res.text());
    expect(html).toContain("task-actions");
    // U4: status is changed inline on the card; branch/commit live in the inline
    // Note form. The old "type the task id into a form" controls are gone.
    expect(html).toContain("task-status-select");
    expect(html).toContain("Branch (optional)");
    expect(html).not.toContain("task-update-id");
    expect(html).toContain("function taskCard(task)");
  });

  it("guards loopback writes against cross-origin and rebound hosts (B4)", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const payload = JSON.stringify({ from: "user", to: "all", topic: "ping", body: "hi" });
    const rawPost = (headers: Record<string, string>) =>
      new Promise<number>((resolve, reject) => {
        const target = new URL(`${server.url}/api/messages`);
        const req = httpRequest(
          {
            hostname: target.hostname,
            port: target.port,
            path: target.pathname,
            method: "POST",
            headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload), ...headers }
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          }
        );
        req.on("error", reject);
        req.end(payload);
      });

    // A cross-site page's write carries a foreign Origin -> rejected.
    expect(await rawPost({ origin: "https://evil.example" })).toBe(403);
    // A rebound DNS name shows up as a non-loopback Host -> rejected.
    expect(await rawPost({ host: "evil.example" })).toBe(403);
    // The dashboard's own same-origin write is allowed.
    expect(await rawPost({ origin: server.url })).toBe(201);
    // A local non-browser tool sends no Origin -> allowed.
    expect(await rawPost({})).toBe(201);
  });

  it("serves guided composer workflow controls in the dashboard HTML", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    const html = await fetch(`${server.url}/`).then((res) => res.text());
    expect(html).toContain("data-message-template=\"assign\"");
    expect(html).toContain("data-message-template=\"review\"");
    expect(html).toContain("data-task-owner=\"codex-desktop\"");
    expect(html).toContain("function applyMessageTemplate(template)");
    expect(html).toContain("function setComposerAdvancedOpen(open)");
    expect(html).toContain("setComposerAdvancedOpen(true)");
    expect(html).toContain("min-height: 132px");
    expect(html).toContain("function updateMessageSubmitLabel()");
    expect(html).toContain("applyFilters({ agent: currentUserIdentity()");
    expect(html).toContain("Enter to send");
    expect(html).toContain("async function submitMessage()");
    expect(html).toContain('messageInput.addEventListener("keydown"');
    expect(html).toContain("void submitMessage()");
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

  it("lets the user update and delete project folders from the dashboard API", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-dashboard-"));
    const server = await startDashboardServer({ roomDir, port: 0, openBrowser: false });
    servers.push(server);

    await fetch(`${server.url}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "agent-room-mcp",
        name: "Agent Room",
        folderPath: "D:\\projects\\agent-room-mcp"
      })
    });

    const updateResponse = await fetch(`${server.url}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "agent-room-mcp",
        name: "Agent Room MCP",
        folderPath: "D:\\projects\\agent-room-mcp-v2",
        status: "active"
      })
    });
    expect(updateResponse.status).toBe(201);
    await expect(updateResponse.json()).resolves.toMatchObject({
      id: "agent-room-mcp",
      name: "Agent Room MCP",
      folderPath: "D:\\projects\\agent-room-mcp-v2"
    });

    const deleteResponse = await fetch(`${server.url}/api/projects/delete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "agent-room-mcp" })
    });
    expect(deleteResponse.status).toBe(200);

    const snapshot = await fetch(`${server.url}/api/snapshot?project=agent-room-mcp`).then((res) => res.json());
    expect(snapshot.projectRecords).toEqual([]);
  });
});
