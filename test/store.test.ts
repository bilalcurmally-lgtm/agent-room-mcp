import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  AgentRoomStore,
  type CreateTaskInput,
  type RegisterAgentInput,
  type PostMessageInput,
  type RecordDecisionInput
} from "../src/store.js";

describe("AgentRoomStore", () => {
  it("posts and reads messages for an agent in append order", async () => {
    const store = await makeStore();

    const first = await store.postMessage(message({ from: "codex", to: "opus", topic: "A1", project: "alpha" }));
    const second = await store.postMessage(message({ from: "user", to: "opus", topic: "Priority" }));
    await store.postMessage(message({ from: "opus", to: "codex", topic: "Review" }));

    expect(first.id).toBe("000001");
    expect(first.project).toBe("alpha");
    expect(second.id).toBe("000002");
    expect(await store.readMessages({ agent: "opus" })).toMatchObject([
      { id: "000001", from: "codex", to: "opus", topic: "A1" },
      { id: "000002", from: "user", to: "opus", topic: "Priority" }
    ]);
    expect(await store.readMessages({ agent: "opus", sinceId: "000001" })).toMatchObject([
      { id: "000002", topic: "Priority" }
    ]);
  });

  it("creates, claims, and updates tasks", async () => {
    const store = await makeStore();
    const task = await store.createTask(taskInput({ title: "Build A1", project: "alpha" }));

    expect(task).toMatchObject({ id: "task-000001", title: "Build A1", status: "open", project: "alpha" });

    expect(await store.claimTask({ taskId: task.id, agent: "codex" })).toMatchObject({
      id: "task-000001",
      owner: "codex",
      status: "claimed"
    });

    expect(
      await store.updateTask({ taskId: task.id, status: "done", note: "Tests green" })
    ).toMatchObject({
      id: "task-000001",
      status: "done",
      notes: [expect.objectContaining({ by: "system", body: "Tests green" })]
    });
  });

  it("reassigns tasks and appends task-only notes", async () => {
    const store = await makeStore();
    const task = await store.createTask(taskInput({ title: "Review dashboard", owner: "codex" }));

    expect(
      await store.updateTask({
        taskId: task.id,
        status: "blocked",
        owner: "claude-opus",
        note: "Needs reviewer decision",
        by: "user"
      })
    ).toMatchObject({
      id: task.id,
      status: "blocked",
      owner: "claude-opus",
      notes: [expect.objectContaining({ by: "user", body: "Needs reviewer decision" })]
    });

    expect(await store.appendTaskNote({ taskId: task.id, body: "Commit 123abc is ready.", by: "codex" }))
      .toMatchObject({
        id: task.id,
        notes: [
          expect.objectContaining({ body: "Needs reviewer decision" }),
          expect.objectContaining({ by: "codex", body: "Commit 123abc is ready." })
        ]
      });
  });

  it("records decisions in markdown and reports room status", async () => {
    const store = await makeStore();

    await store.postMessage(message({ from: "codex", to: "opus", topic: "A1" }));
    await store.createTask(taskInput({ title: "Review A1" }));
    const decision = await store.recordDecision({
      title: "Lineage architecture",
      decision: "Extend existing return types.",
      rationale: "Keeps value and lineage together.",
      project: "alpha",
      links: ["src/finance/summary.ts"]
    });

    expect(decision.id).toBe("decision-000001");
    expect(decision.project).toBe("alpha");
    expect(await readFile(join(store.roomDir, "decisions.md"), "utf8")).toContain(
      "## decision-000001 - Lineage architecture"
    );
    expect(await store.getRoomStatus()).toMatchObject({
      roomDir: store.roomDir,
      messages: 1,
      tasks: { open: 1, claimed: 0, blocked: 0, done: 0 },
      decisions: 1
    });
  });

  it("lists tasks with status, owner, and project filters", async () => {
    const store = await makeStore();
    const openAlpha = await store.createTask(taskInput({ title: "Open alpha", project: "alpha" }));
    const claimedAlpha = await store.createTask(
      taskInput({ title: "Claimed alpha", owner: "codex", project: "alpha" })
    );
    await store.createTask(taskInput({ title: "Open beta", project: "beta" }));

    expect(await store.listTasks({})).toMatchObject([
      { id: openAlpha.id, title: "Open alpha" },
      { id: claimedAlpha.id, title: "Claimed alpha" },
      { title: "Open beta" }
    ]);
    expect(await store.listTasks({ status: "open", project: "alpha" })).toMatchObject([
      { id: openAlpha.id, title: "Open alpha" }
    ]);
    expect(await store.listTasks({ owner: "codex" })).toMatchObject([
      { id: claimedAlpha.id, title: "Claimed alpha" }
    ]);
  });

  it("surfaces malformed storage files instead of silently resetting them", async () => {
    const store = await makeStore();
    await writeFile(join(store.roomDir, "tasks.json"), "{ bad json", "utf8");

    await expect(store.createTask(taskInput())).rejects.toThrow(/Failed to parse tasks\.json/);
    await expect(readFile(join(store.roomDir, "tasks.json"), "utf8")).resolves.toBe("{ bad json");
  });

  it("rejects malformed message lines with recovery guidance", async () => {
    const store = await makeStore();
    await writeFile(join(store.roomDir, "messages.jsonl"), "{\"id\":\"000001\"}\nnot-json\n", "utf8");

    await expect(store.readMessages({ agent: "codex" })).rejects.toThrow(/Failed to parse messages\.jsonl line 2/);
  });

  it("preserves valid task storage when an atomic write fails", async () => {
    const store = await makeStore();
    const task = await store.createTask(taskInput({ title: "Existing" }));

    await expect(
      store.createTask(taskInput({ title: "Bad", body: "x".repeat(100_001) }))
    ).rejects.toThrow(/body must be at most/);

    await expect(readFile(join(store.roomDir, "tasks.json"), "utf8")).resolves.toContain(task.id);
    expect(await store.listTasks({})).toHaveLength(1);
  });

  it("rejects oversized messages, task notes, and decisions", async () => {
    const store = await makeStore();
    const task = await store.createTask(taskInput());

    await expect(store.postMessage(message({ body: "x".repeat(100_001) }))).rejects.toThrow(
      /body must be at most/
    );
    await expect(
      store.updateTask({ taskId: task.id, status: "blocked", note: "x".repeat(100_001), by: "codex" })
    ).rejects.toThrow(/note must be at most/);
    await expect(
      store.recordDecision({
        title: "Too large",
        decision: "x".repeat(100_001),
        rationale: "because"
      })
    ).rejects.toThrow(/decision must be at most/);
  });

  it("serializes concurrent task creation and decision recording", async () => {
    const store = await makeStore();

    await Promise.all(
      Array.from({ length: 10 }, (_, index) => store.createTask(taskInput({ title: `Task ${index}` })))
    );
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        store.recordDecision({
          title: `Decision ${index}`,
          decision: "Do it.",
          rationale: "Concurrent test."
        })
      )
    );

    expect((await store.listTasks({})).map((task) => task.id)).toEqual([
      "task-000001",
      "task-000002",
      "task-000003",
      "task-000004",
      "task-000005",
      "task-000006",
      "task-000007",
      "task-000008",
      "task-000009",
      "task-000010"
    ]);
    expect(JSON.parse(await readFile(join(store.roomDir, "decisions.json"), "utf8"))).toHaveLength(10);
  });

  it("registers agents and includes unread counts in room status", async () => {
    const store = await makeStore();
    await store.registerAgent(agent({ agent: "codex", displayName: "Codex", role: "implementer" }));
    await store.registerAgent(agent({ agent: "opus", role: "reviewer" }));
    await store.postMessage(message({ from: "opus", to: "codex", topic: "Review", body: "Please fix A." }));
    await store.postMessage(message({ from: "codex", to: "all", topic: "Update", body: "I pushed A." }));

    expect(await store.getRoomStatus()).toMatchObject({
      agents: 2,
      unread: {
        codex: 2,
        opus: 1
      }
    });

    expect(await readFile(join(store.roomDir, "agents.json"), "utf8")).toContain("\"displayName\": \"Codex\"");
  });

  it("checks in with one auditable inbox view and then marks messages read", async () => {
    const store = await makeStore();
    await store.registerAgent(agent({ agent: "codex" }));
    await store.postMessage(message({ from: "opus", to: "codex", topic: "Needs fix", project: "alpha" }));
    await store.upsertProject({ id: "alpha", name: "Alpha", folderPath: "D:\\projects\\alpha" });
    await store.postMessage(message({ from: "user", to: "all", topic: "Priority", project: "alpha" }));
    await store.postMessage(message({ from: "opus", to: "codex", topic: "Other project", project: "beta" }));
    await store.createTask(taskInput({ title: "Implement alpha", owner: "codex", project: "alpha" }));
    await store.createTask(taskInput({ title: "Unclaimed alpha", project: "alpha" }));
    await store.recordDecision({
      title: "Use room",
      decision: "Agents coordinate through MCP.",
      rationale: "Prevents fake handoffs.",
      project: "alpha"
    });

    const checkIn = await store.checkIn({ agent: "codex", project: "alpha" });

    expect(checkIn.unreadMessages).toMatchObject([
      { topic: "Needs fix", project: "alpha" },
      { topic: "Priority", project: "alpha" }
    ]);
    expect(checkIn.assignedTasks).toMatchObject([{ title: "Implement alpha" }]);
    expect(checkIn.openTasks).toMatchObject([{ title: "Unclaimed alpha" }]);
    expect(checkIn.recentDecisions).toMatchObject([{ title: "Use room" }]);
    expect(checkIn.projectRecord).toMatchObject({ id: "alpha", folderPath: "D:\\projects\\alpha" });
    expect(checkIn.roomTime).toMatchObject({
      utcIso: expect.any(String),
      timezone: expect.any(String),
      unixSeconds: expect.any(Number)
    });

    await store.markMessagesRead({ agent: "codex" });
    expect((await store.checkIn({ agent: "codex" })).unreadMessages).toEqual([]);
  });

  it("warns agents about stale active tasks during check-in", async () => {
    const store = await makeStore();
    await store.registerAgent(agent({ agent: "codex" }));
    const stale = await store.createTask(taskInput({ title: "Re-check old work", owner: "codex", project: "alpha" }));
    const done = await store.createTask(taskInput({ title: "Old but done", owner: "codex", project: "alpha" }));
    await store.updateTask({ taskId: done.id, status: "done" });
    const fresh = await store.createTask(taskInput({ title: "Fresh work", owner: "codex", project: "alpha" }));
    const tasks = JSON.parse(await readFile(join(store.roomDir, "tasks.json"), "utf8"));
    for (const task of tasks) {
      if (task.id === stale.id || task.id === done.id) task.updatedAt = "2000-01-01T00:00:00.000Z";
      if (task.id === fresh.id) task.updatedAt = new Date().toISOString();
    }
    await writeFile(join(store.roomDir, "tasks.json"), `${JSON.stringify(tasks, null, 2)}\n`, "utf8");

    const checkIn = await store.checkIn({ agent: "codex", project: "alpha" });

    expect(checkIn.staleTasks).toMatchObject([
      {
        taskId: stale.id,
        title: "Re-check old work",
        status: "claimed",
        owner: "codex",
        project: "alpha",
        message: expect.stringContaining("Re-check")
      }
    ]);
    expect(checkIn.staleTasks.map((warning) => warning.taskId)).not.toContain(done.id);
    expect(checkIn.staleTasks.map((warning) => warning.taskId)).not.toContain(fresh.id);
  });

  it("uses room config for stale task threshold", async () => {
    const store = await makeStore();
    await store.registerAgent(agent({ agent: "codex" }));
    const task = await store.createTask(taskInput({ title: "Recently idle", owner: "codex", project: "alpha" }));
    const tasks = JSON.parse(await readFile(join(store.roomDir, "tasks.json"), "utf8"));
    tasks[0].updatedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await writeFile(join(store.roomDir, "tasks.json"), `${JSON.stringify(tasks, null, 2)}\n`, "utf8");

    expect((await store.checkIn({ agent: "codex", project: "alpha" })).staleTasks).toEqual([]);

    await store.updateConfig({ staleTaskHours: 1 });
    const checkIn = await store.checkIn({ agent: "codex", project: "alpha" });

    expect(await store.getConfig()).toMatchObject({ staleTaskHours: 1 });
    expect(checkIn.staleTasks).toMatchObject([{ taskId: task.id, ageHours: expect.any(Number) }]);
  });

  it("lists projects from messages, tasks, and decisions with unsorted fallback", async () => {
    const store = await makeStore();
    await store.postMessage(message({ from: "user", to: "all", topic: "Global", project: "dashboard-v2" }));
    await store.createTask(taskInput({ title: "API work", project: "agent-room" }));
    await store.recordDecision({
      title: "Use local dashboard",
      decision: "Dashboard runs locally.",
      rationale: "Least setup.",
      project: "dashboard-v2"
    });
    await store.postMessage(message({ from: "opus", to: "codex", topic: "No project" }));

    expect(await store.listProjects()).toEqual(["agent-room", "dashboard-v2", "unsorted"]);
  });

  it("registers project folders and lists them before tag-only projects", async () => {
    const store = await makeStore();
    const project = await store.upsertProject({
      id: "audit-cockpit",
      name: "Audit Cockpit",
      folderPath: "D:\\projects\\audit-cockpit",
      repoUrl: "https://github.com/example/audit-cockpit",
      status: "active"
    });
    await store.postMessage(message({ from: "user", to: "all", topic: "Tag only", project: "loose-tag" }));

    expect(project).toMatchObject({
      id: "audit-cockpit",
      name: "Audit Cockpit",
      folderPath: "D:\\projects\\audit-cockpit",
      repoUrl: "https://github.com/example/audit-cockpit",
      status: "active"
    });
    expect(await store.listProjectRecords()).toMatchObject([
      { id: "audit-cockpit", name: "Audit Cockpit", folderPath: "D:\\projects\\audit-cockpit" }
    ]);
    expect(await store.listProjects()).toEqual(["audit-cockpit", "loose-tag"]);
  });
});

async function makeStore(): Promise<AgentRoomStore> {
  const roomDir = await mkdtemp(join(tmpdir(), "agent-room-"));
  return AgentRoomStore.open(roomDir);
}

function message(overrides: Partial<PostMessageInput> = {}): PostMessageInput {
  return {
    from: "codex",
    to: "opus",
    topic: "Topic",
    body: "Message body",
    ...overrides
  };
}

function taskInput(overrides: Partial<CreateTaskInput> = {}): CreateTaskInput {
  return {
    title: "Task",
    body: "Task body",
    ...overrides
  };
}

function agent(overrides: Partial<RegisterAgentInput> = {}): RegisterAgentInput {
  return {
    agent: "codex",
    ...overrides
  };
}
