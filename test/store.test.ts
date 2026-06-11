import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  AgentRoomStore,
  presenceState,
  resolveRoomProject,
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

  it("persists unresolved mention metadata on stored messages", async () => {
    const store = await makeStore();

    const posted = await store.postMessage(
      message({ from: "user", to: "opus", topic: "CSS", unresolvedMentions: ["media"] })
    );

    expect(posted.unresolvedMentions).toEqual(["media"]);
    expect(await store.readMessages({ agent: "opus" })).toMatchObject([
      { id: "000001", unresolvedMentions: ["media"] }
    ]);
  });

  it("returns one full message by id via readMessage", async () => {
    const store = await makeStore();
    const longBody = `Full details: ${"x".repeat(2000)}`;
    await store.postMessage(message({ topic: "first" }));
    const target = await store.postMessage(message({ topic: "wanted", body: longBody }));

    await expect(store.readMessage(target.id)).resolves.toMatchObject({
      id: target.id,
      topic: "wanted",
      body: longBody
    });
    await expect(store.readMessage("999999")).rejects.toThrow(/no message/i);
  });

  it("includes a one-line decision summary in compact check-ins", async () => {
    const store = await makeStore();
    await store.recordDecision({
      title: "Lock strategy",
      decision: "Use a room.lock file\nwith retry and   backoff everywhere.",
      rationale: "Boring wins."
    });

    const checkIn = await store.checkInCompact({ agent: "opus" });
    expect(checkIn.decisions[0]).toMatchObject({
      title: "Lock strategy",
      decision: "Use a room.lock file with retry and backoff everywhere."
    });
  });

  it("truncates previews at a multibyte-safe boundary and flags the full body", async () => {
    const store = await makeStore();
    await store.postMessage(message({ to: "opus", body: "🚀".repeat(400) }));

    const checkIn = await store.checkInCompact({ agent: "opus" });
    const previewMessage = checkIn.unread.messages[0];
    expect(previewMessage.preview.isWellFormed()).toBe(true);
    expect(previewMessage.preview.endsWith("...")).toBe(true);
    expect(previewMessage.fullBodyAvailable).toBe(true);
  });

  it("keeps a 50-message, 30-decision compact check-in under the token budget", async () => {
    const store = await makeStore();
    const filler = "All edge cases covered and verified across the full test matrix today. ".repeat(7);
    for (let i = 0; i < 50; i += 1) {
      await store.postMessage(message({ to: "opus", topic: `Update ${i}`, body: `${filler} #${i}` }));
    }
    for (let i = 0; i < 30; i += 1) {
      await store.recordDecision({ title: `Decision ${i}`, decision: filler, rationale: filler });
    }

    const checkIn = await store.checkInCompact({ agent: "opus" });
    // The handoff budget is ~2,000 tokens; ~4 chars/token puts the JSON under 8,000 chars.
    expect(JSON.stringify(checkIn).length).toBeLessThan(8000);
  });

  it("searches messages by keyword and project, returning previews", async () => {
    const store = await makeStore();
    await store.postMessage(
      message({ from: "codex", to: "opus", topic: "Routing bug", body: "The alias fallback is broken.", project: "alpha" })
    );
    await store.postMessage(
      message({ from: "opus", to: "codex", topic: "Deploy", body: "Routing fix shipped to staging.", project: "beta" })
    );
    await store.postMessage(
      message({ from: "codex", to: "opus", topic: "Lunch", body: "Unrelated chatter.", project: "alpha" })
    );

    const result = await store.searchMessages({ keyword: "routing", project: "alpha" });
    expect(result.total).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.items).toMatchObject([{ id: "000001", topic: "Routing bug", preview: "The alias fallback is broken." }]);
    expect(result.items[0]).not.toHaveProperty("body");

    const byKeyword = await store.searchMessages({ keyword: "ROUTING" });
    expect(byKeyword.total).toBe(2);
  });

  it("applies from/to/afterId filters and the default search limit", async () => {
    const store = await makeStore();
    for (let i = 0; i < 15; i += 1) {
      await store.postMessage(message({ from: "codex", to: "opus", topic: `Ping ${i}`, body: "status check" }));
    }
    await store.postMessage(message({ from: "opus", to: "codex", topic: "Reply", body: "status received" }));

    const fromCodex = await store.searchMessages({ from: "codex", keyword: "status" });
    expect(fromCodex.total).toBe(15);
    expect(fromCodex.items).toHaveLength(10);
    expect(fromCodex.truncated).toBe(true);
    expect(fromCodex.items.at(-1)?.topic).toBe("Ping 14");

    const after = await store.searchMessages({ keyword: "status", afterId: "000014" });
    expect(after.items.map((item) => item.id)).toEqual(["000015", "000016"]);

    const toCodex = await store.searchMessages({ to: "codex" });
    expect(toCodex.items.map((item) => item.topic)).toEqual(["Reply"]);
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
      await store.updateTask({
        taskId: task.id,
        status: "done",
        note: "Tests green",
        evidence: { noteIndex: 0 }
      })
    ).toMatchObject({
      id: "task-000001",
      status: "done",
      notes: [expect.objectContaining({ by: "system", body: "Tests green" })]
    });
  });

  it("rejects marking a task done without evidence", async () => {
    const store = await makeStore();
    const task = await store.createTask(taskInput({ title: "Needs proof" }));

    await expect(store.updateTask({ taskId: task.id, status: "done" })).rejects.toThrow(
      /evidence/i
    );
    await expect(
      store.updateTask({ taskId: task.id, status: "done", evidence: {} })
    ).rejects.toThrow(/evidence/i);
    expect((await store.listTasks({})).find((t) => t.id === task.id)?.status).toBe("open");
  });

  it("accepts done with a valid messageId and persists the evidence", async () => {
    const store = await makeStore();
    const task = await store.createTask(taskInput({ title: "Provable" }));
    const proof = await store.postMessage(message({ topic: "Commit abc123 pushed" }));

    const done = await store.updateTask({
      taskId: task.id,
      status: "done",
      evidence: { messageId: proof.id }
    });
    expect(done.status).toBe("done");
    expect(done.evidence).toEqual({ messageId: proof.id });
  });

  it("rejects evidence references that do not exist", async () => {
    const store = await makeStore();
    const task = await store.createTask(taskInput({ title: "Fake proof" }));

    await expect(
      store.updateTask({ taskId: task.id, status: "done", evidence: { messageId: "999999" } })
    ).rejects.toThrow(/999999/);
    await expect(
      store.updateTask({ taskId: task.id, status: "done", evidence: { noteIndex: 5 } })
    ).rejects.toThrow(/noteIndex/);
  });

  it("allows done without evidence when requireEvidence is disabled", async () => {
    const store = await makeStore();
    await store.updateConfig({ requireEvidence: false });
    const task = await store.createTask(taskInput({ title: "Honor system" }));

    await expect(store.updateTask({ taskId: task.id, status: "done" })).resolves.toMatchObject({
      status: "done"
    });
  });

  it("persists capabilities on registration and returns them from check-in", async () => {
    const store = await makeStore();
    await store.registerAgent({ agent: "codex", capabilities: ["typescript", "review"] });

    expect((await store.listAgents()).find((a) => a.id === "codex")?.capabilities).toEqual([
      "typescript",
      "review"
    ]);
    const checkIn = await store.checkInCompact({ agent: "codex" });
    expect(checkIn.agent.capabilities).toEqual(["typescript", "review"]);
  });

  it("records agent status and bumps lastSeenAt", async () => {
    const store = await makeStore();
    const updated = await store.setStatus({ agent: "codex", status: "working", detail: "C2 review" });

    expect(updated.status).toMatchObject({ state: "working", detail: "C2 review" });
    expect(updated.lastSeenAt).toBeTruthy();
    await expect(store.setStatus({ agent: "codex", status: "sleeping" as never })).rejects.toThrow(
      /status/
    );
  });

  it("bumps lastSeenAt via touchAgent without failing for unknown agents", async () => {
    const store = await makeStore();
    await store.registerAgent({ agent: "codex" });

    await store.touchAgent("codex");
    expect((await store.listAgents()).find((a) => a.id === "codex")?.lastSeenAt).toBeTruthy();
    await expect(store.touchAgent("ghost")).resolves.toBeUndefined();
  });

  it("classifies presence as live, stale, or offline", async () => {
    const nowMs = Date.parse("2026-06-11T12:00:00Z");
    expect(presenceState(new Date(nowMs - 60_000).toISOString(), nowMs)).toBe("live");
    expect(presenceState(new Date(nowMs - 10 * 60_000).toISOString(), nowMs)).toBe("stale");
    expect(presenceState(new Date(nowMs - 31 * 60_000).toISOString(), nowMs)).toBe("offline");
    expect(presenceState(undefined, nowMs)).toBe("offline");
  });

  it("round-trips a handoff ack as a typed reply message", async () => {
    const store = await makeStore();
    const handoff = await store.postMessage(
      message({ from: "codex", to: "opus", topic: "Take over C2" })
    );

    const ack = await store.confirmHandoff({ messageId: handoff.id, agent: "opus" });
    expect(ack).toMatchObject({
      from: "opus",
      to: "codex",
      replyTo: handoff.id,
      type: "ack"
    });
    expect(await store.readMessages({ agent: "codex" })).toMatchObject([
      expect.objectContaining({ type: "ack", replyTo: handoff.id })
    ]);

    await expect(store.confirmHandoff({ messageId: "999999", agent: "opus" })).rejects.toThrow(
      /999999/
    );
    await expect(
      store.confirmHandoff({ messageId: handoff.id, agent: "codex" })
    ).rejects.toThrow(/own message/i);
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

    expect(
      await store.appendTaskNote({
        taskId: task.id,
        body: "Ready for review.",
        branch: "codex/task-editing",
        commit: "123abc",
        by: "codex"
      })
    ).toMatchObject({
      id: task.id,
      notes: [
        expect.objectContaining({ body: "Needs reviewer decision" }),
        expect.objectContaining({
          by: "codex",
          body: "Ready for review.",
          branch: "codex/task-editing",
          commit: "123abc"
        })
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

  it("quarantines a corrupt message line instead of bricking all reads", async () => {
    const store = await makeStore();
    await writeFile(
      join(store.roomDir, "messages.jsonl"),
      "{\"id\":\"000001\",\"from\":\"codex\",\"to\":\"opus\",\"topic\":\"A1\"}\nnot-json\n{\"id\":\"000002\",\"from\":\"user\",\"to\":\"opus\",\"topic\":\"B2\"}\n",
      "utf8"
    );

    // The bad middle line is skipped; the valid lines on either side still read.
    expect(await store.readMessages({ agent: "opus" })).toMatchObject([
      { id: "000001", topic: "A1" },
      { id: "000002", topic: "B2" }
    ]);

    // And a new post derives its id from the highest existing id (not the line
    // count), so the skipped line can't cause a duplicate id.
    const posted = await store.postMessage(message({ from: "opus", to: "codex", topic: "C3" }));
    expect(posted.id).toBe("000003");
  });

  it("filters sinceId numerically so ids past 999,999 still compare correctly", async () => {
    const store = await makeStore();
    await writeFile(
      join(store.roomDir, "messages.jsonl"),
      "{\"id\":\"999999\",\"from\":\"codex\",\"to\":\"opus\",\"topic\":\"old\"}\n{\"id\":\"1000000\",\"from\":\"user\",\"to\":\"opus\",\"topic\":\"new\"}\n",
      "utf8"
    );

    // Lexicographically "1000000" < "999999"; numerically it is newer and must
    // pass the sinceId filter.
    expect(await store.readMessages({ agent: "opus", sinceId: "999999" })).toMatchObject([
      { id: "1000000", topic: "new" }
    ]);
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

    // codex authored the broadcast, so it does not count as codex's own unread.
    expect(await store.getRoomStatus()).toMatchObject({
      agents: 2,
      unread: {
        codex: 1,
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
    await store.updateTask({ taskId: done.id, status: "done", note: "Verified.", evidence: { noteIndex: 0 } });
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

  it("warns agents about stale messages and decisions during check-in", async () => {
    const store = await makeStore();
    await store.registerAgent(agent({ agent: "codex" }));
    const message = await store.postMessage({
      from: "user",
      to: "codex",
      topic: "Follow up tomorrow",
      body: "We should revisit this tomorrow.",
      project: "alpha"
    });
    const decision = await store.recordDecision({
      title: "Use file store",
      decision: "Keep JSON files",
      rationale: "Simple ops",
      project: "alpha"
    });
    const messages = (await readFile(join(store.roomDir, "messages.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    messages[0].time = "2000-01-01T00:00:00.000Z";
    await writeFile(
      join(store.roomDir, "messages.jsonl"),
      `${messages.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "utf8"
    );
    const decisions = JSON.parse(await readFile(join(store.roomDir, "decisions.json"), "utf8"));
    decisions[0].time = "2000-01-01T00:00:00.000Z";
    await writeFile(join(store.roomDir, "decisions.json"), `${JSON.stringify(decisions, null, 2)}\n`, "utf8");

    const checkIn = await store.checkIn({ agent: "codex", project: "alpha" });

    expect(checkIn.staleMessages).toMatchObject([{ kind: "message", id: message.id }]);
    expect(checkIn.staleDecisions).toMatchObject([{ kind: "decision", id: decision.id }]);
  });

  it("caps stale check-in nudges and reports the true totals", async () => {
    const store = await makeStore();
    // Seven messages, all long past the stale threshold. Without a cap this would
    // flood the check_in response with every one of them.
    const lines = [];
    for (let i = 1; i <= 7; i += 1) {
      lines.push(
        JSON.stringify({
          id: String(i).padStart(6, "0"),
          from: "codex",
          to: "all",
          topic: `old ${i}`,
          body: "x",
          time: `2020-01-01T00:00:0${i}.000Z`
        })
      );
    }
    await writeFile(join(store.roomDir, "messages.jsonl"), `${lines.join("\n")}\n`, "utf8");

    const checkIn = await store.checkIn({ agent: "opus" });

    expect(checkIn.staleMessages).toHaveLength(5);
    expect(checkIn.staleMessageCount).toBe(7);
    // The surfaced ones are the most recently gone stale (newest first).
    expect(checkIn.staleMessages[0].id).toBe("000007");
    expect(checkIn.staleMessages.map((warning) => warning.id)).not.toContain("000001");
  });

  it("returns a token-cheap compact check-in for wake turns", async () => {
    const store = await makeStore();
    await store.registerAgent(agent({ agent: "codex" }));
    await store.upsertProject({ id: "alpha", name: "Alpha", folderPath: "D:\\projects\\alpha" });
    await store.postMessage(message({ from: "opus", to: "codex", topic: "First", body: "short", project: "alpha" }));
    await store.postMessage(
      message({ from: "Bilal", to: "all", topic: "Second", body: "0123456789abcdef", project: "alpha" })
    );
    await store.createTask(taskInput({ title: "Implement alpha", owner: "codex", project: "alpha" }));
    await store.createTask(taskInput({ title: "Unclaimed alpha", project: "alpha" }));
    await store.recordDecision({
      title: "Use compact wakes",
      decision: "Start wake turns from check_in_compact.",
      rationale: "Avoid spending context on full room dumps.",
      project: "alpha"
    });

    const checkIn = await store.checkInCompact({
      agent: "codex",
      project: "alpha",
      limit: 1,
      textLimit: 8
    });

    expect(checkIn.unread.count).toBe(2);
    expect(checkIn.unread.returned).toBe(1);
    expect(checkIn.unread.latestId).toBe("000002");
    expect(checkIn.unread.messages).toMatchObject([
      {
        id: "000002",
        topic: "Second",
        preview: "01234...",
        bodyLength: 16
      }
    ]);
    expect(checkIn.tasks.assigned).toMatchObject([{ title: "Implement alpha" }]);
    expect(checkIn.tasks.open).toMatchObject([{ title: "Unclaimed alpha" }]);
    expect(checkIn.decisions).toMatchObject([{ title: "Use compact wakes" }]);
    expect(checkIn.alerts).toMatchObject({
      staleTaskCount: 0,
      staleMessageCount: 0,
      staleDecisionCount: 0
    });
    expect(checkIn.contextBudget.mode).toBe("compact");
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

    expect(await store.getConfig()).toMatchObject({ staleTaskHours: 1, currentUser: "user", enforceProtocol: false });
    expect(checkIn.staleTasks).toMatchObject([{ taskId: task.id, ageHours: expect.any(Number) }]);
  });

  it("stores a durable current-user identity in room config", async () => {
    const store = await makeStore();

    expect(await store.getConfig()).toMatchObject({ currentUser: "user" });

    expect(await store.updateConfig({ currentUser: "bill" })).toMatchObject({ currentUser: "bill" });
    expect(await store.getConfig()).toMatchObject({ currentUser: "bill" });

    await store.upsertProject({
      id: "alpha",
      name: "Alpha",
      folderPath: "D:\\projects\\alpha"
    });
    expect(await store.updateConfig({ activeProject: "alpha" })).toMatchObject({ activeProject: "alpha" });
    expect((await store.updateConfig({ activeProject: null })).activeProject).toBeUndefined();

    const raw = JSON.parse(await readFile(join(store.roomDir, "config.json"), "utf8"));
    expect(raw).toMatchObject({ currentUser: "bill" });
  });

  it("resolves omitted MCP project inputs through the room active project", () => {
    const config = { staleTaskHours: 24, currentUser: "user", enforceProtocol: false, activeProject: "alpha" };

    expect(resolveRoomProject(config, undefined)).toBe("alpha");
    expect(resolveRoomProject(config, "beta")).toBe("beta");
    expect(resolveRoomProject(config, "all")).toBeUndefined();
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

  it("updates and deletes project records without deleting tagged history", async () => {
    const store = await makeStore();
    await store.upsertProject({
      id: "audit-cockpit",
      name: "Audit Cockpit",
      folderPath: "D:\\projects\\audit-cockpit"
    });
    await store.postMessage(message({ from: "user", to: "all", topic: "Still tagged", project: "audit-cockpit" }));

    await expect(
      store.upsertProject({
        id: "audit-cockpit",
        name: "Audit Cockpit V2",
        folderPath: "D:\\projects\\audit-cockpit-v2",
        status: "active"
      })
    ).resolves.toMatchObject({
      id: "audit-cockpit",
      name: "Audit Cockpit V2",
      folderPath: "D:\\projects\\audit-cockpit-v2"
    });

    await expect(store.deleteProject({ id: "audit-cockpit" })).resolves.toMatchObject({
      id: "audit-cockpit",
      name: "Audit Cockpit V2"
    });
    expect(await store.listProjectRecords()).toEqual([]);
    expect(await store.listProjects()).toEqual(["audit-cockpit"]);
  });

  it("excludes a sender's own messages and routes by mention", async () => {
    const store = await makeStore();
    await store.postMessage(message({ from: "codex", to: "all", topic: "Broadcast", body: "I pushed A." }));
    await store.postMessage({ from: "user", to: "all", topic: "Targeted", body: "ping", mentions: ["opus"] });

    // codex authored the broadcast, so it is not in codex's own inbox.
    expect(await store.readMessages({ agent: "codex" })).toEqual([]);
    // opus is mentioned on the targeted note and also sees the broadcast.
    expect((await store.readMessages({ agent: "opus" })).map((m) => m.topic)).toEqual([
      "Broadcast",
      "Targeted"
    ]);
    // grok is neither sender nor mentioned, so the mention-scoped note is hidden.
    expect((await store.readMessages({ agent: "grok" })).map((m) => m.topic)).toEqual(["Broadcast"]);
  });

  it("caps the check-in inbox and reports the true unread total", async () => {
    const store = await makeStore();
    for (let i = 0; i < 5; i += 1) {
      await store.postMessage(message({ from: "user", to: "codex", topic: `M${i}` }));
    }

    const checkIn = await store.checkIn({ agent: "codex", limit: 2 });
    expect(checkIn.unreadCount).toBe(5);
    expect(checkIn.unreadMessages.map((m) => m.topic)).toEqual(["M3", "M4"]);
  });

  it("returns only the most recent messages when a read limit is set", async () => {
    const store = await makeStore();
    for (let i = 0; i < 4; i += 1) {
      await store.postMessage(message({ from: "user", to: "codex", topic: `M${i}` }));
    }

    expect((await store.readMessages({ agent: "codex", limit: 2 })).map((m) => m.topic)).toEqual([
      "M2",
      "M3"
    ]);
  });

  it("issues unique sequential ids across two store instances on one room", async () => {
    const first = await makeStore();
    const second = await AgentRoomStore.open(first.roomDir);

    await Promise.all([
      ...Array.from({ length: 50 }, (_, i) =>
        first.postMessage(message({ from: "a", to: "b", topic: `A${i}` }))
      ),
      ...Array.from({ length: 50 }, (_, i) =>
        second.postMessage(message({ from: "b", to: "a", topic: `B${i}` }))
      )
    ]);

    const lines = (await readFile(join(first.roomDir, "messages.jsonl"), "utf8"))
      .split("\n")
      .filter(Boolean);
    const ids = lines.map((line) => (JSON.parse(line) as { id: string }).id);
    expect(ids).toHaveLength(100);
    expect(new Set(ids).size).toBe(100);
    expect([...ids].sort()).toEqual(Array.from({ length: 100 }, (_, i) => String(i + 1).padStart(6, "0")));
  });

  it("keeps message ids monotonic after messages.jsonl is archived away", async () => {
    const store = await makeStore();
    await store.postMessage(message({ topic: "one" }));
    await store.postMessage(message({ topic: "two" }));
    await store.postMessage(message({ topic: "three" }));

    await writeFile(join(store.roomDir, "messages.jsonl"), "", "utf8");

    const next = await store.postMessage(message({ topic: "four" }));
    expect(next.id).toBe("000004");
  });

  it("recovers the id counter from the message log when the counter file is invalid", async () => {
    const store = await makeStore();
    await store.postMessage(message({ topic: "one" }));
    await store.postMessage(message({ topic: "two" }));

    await writeFile(join(store.roomDir, "message-counter.json"), "not json", "utf8");

    const next = await store.postMessage(message({ topic: "three" }));
    expect(next.id).toBe("000003");
  });

  it("reclaims a lock left behind by a dead process", async () => {
    const store = await makeStore();
    await writeFile(
      join(store.roomDir, "room.lock"),
      JSON.stringify({ pid: 999_999_999, time: Date.now() - 60_000 }),
      "utf8"
    );

    await expect(
      store.postMessage(message({ from: "user", to: "codex", topic: "After crash" }))
    ).resolves.toMatchObject({ topic: "After crash" });
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
