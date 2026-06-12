import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertProtocolCompliant } from "../src/protocol.js";
import { createServer, isDirectRun, jsonResult, paginate, resolveRoomDir, resolveServerProfile } from "../src/server.js";
import { AgentRoomStore } from "../src/store.js";

describe("resolveRoomDir", () => {
  it("uses --room before environment fallback", () => {
    expect(resolveRoomDir(["--room", "D:\\projects\\.agent-room"], { AGENT_ROOM_DIR: "env-room" })).toBe(
      "D:\\projects\\.agent-room"
    );
  });

  it("uses AGENT_ROOM_DIR when --room is not provided", () => {
    expect(resolveRoomDir([], { AGENT_ROOM_DIR: "env-room" })).toBe("env-room");
  });

  it("defaults to a project-local .agent-room", () => {
    expect(resolveRoomDir([], {})).toBe(".agent-room");
  });

  it("rejects --room without a path", () => {
    expect(() => resolveRoomDir(["--room"], {})).toThrow("--room requires a directory path");
  });
});

describe("resolveServerProfile", () => {
  it("defaults to full and accepts --profile lite", () => {
    expect(resolveServerProfile([], {})).toBe("full");
    expect(resolveServerProfile(["--profile", "lite"], {})).toBe("lite");
    expect(resolveServerProfile([], { AGENT_ROOM_PROFILE: "lite" })).toBe("lite");
  });

  it("rejects unknown profiles", () => {
    expect(() => resolveServerProfile(["--profile", "tiny"], {})).toThrow("--profile must be full or lite");
  });
});

describe("isDirectRun", () => {
  it("compares file URLs with Windows-style argv paths", () => {
    expect(isDirectRun("file:///D:/projects/agent-room-mcp/src/server.ts", "D:\\projects\\agent-room-mcp\\src\\server.ts")).toBe(
      true
    );
  });

  it("returns false when argv path is missing or different", () => {
    expect(isDirectRun("file:///D:/projects/agent-room-mcp/src/server.ts", undefined)).toBe(false);
    expect(isDirectRun("file:///D:/projects/agent-room-mcp/src/server.ts", "D:\\other\\server.ts")).toBe(false);
  });
});

describe("paginate", () => {
  it("returns all items untruncated when under the limit", () => {
    expect(paginate([1, 2, 3], 20)).toEqual({ items: [1, 2, 3], total: 3, truncated: false });
  });

  it("keeps the most recent items and reports the full total", () => {
    const result = paginate(["a", "b", "c", "d"], 2);
    expect(result).toEqual({ items: ["c", "d"], total: 4, truncated: true });
  });
});

describe("jsonResult", () => {
  it("serializes tool responses compactly, without indentation whitespace", () => {
    const result = jsonResult({ id: "000001", nested: { items: [1, 2] } });
    expect(result.content[0].text).toBe('{"id":"000001","nested":{"items":[1,2]}}');
  });
});

describe("createServer", () => {
  it("rejects non-compliant agent messages when protocol enforcement is enabled", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-server-"));
    await AgentRoomStore.open(roomDir);

    expect(() =>
      assertProtocolCompliant(
        { from: "codex-desktop", body: "Missing protocol.", to: "all", topic: "Bad" },
        true
      )
    ).toThrow(/Protocol enforcement/);

    expect(() =>
      assertProtocolCompliant(
        {
          from: "codex-desktop",
          body: "Ready.",
          status: "implementing",
          next: "Claude review",
          phase: "C1"
        },
        true
      )
    ).not.toThrow();
  });

  it("defaults check_in to the compact response with a verbose escape hatch", async () => {
    const server = await createServer(await mkdtemp(join(tmpdir(), "agent-room-server-")));

    const compact = JSON.parse(
      (await server._registeredTools.check_in.handler({ agent: "opus" })).content[0].text
    );
    expect(compact.contextBudget?.mode).toBe("compact");
    expect(compact.unreadMessages).toBeUndefined();

    const verbose = JSON.parse(
      (await server._registeredTools.check_in.handler({ agent: "opus", verbose: true })).content[0].text
    );
    expect(Array.isArray(verbose.unreadMessages)).toBe(true);
  });

  it("bumps the calling agent's lastSeenAt on tool calls", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-server-"));
    const server = await createServer(roomDir);
    const store = await AgentRoomStore.open(roomDir);
    await store.registerAgent({ agent: "codex" });

    await server._registeredTools.post_message.handler({
      from: "codex",
      to: "all",
      topic: "Presence",
      body: "[STATUS: working]\nPing.\n[NEXT: keep going]"
    });

    const agent = (await store.listAgents()).find((candidate) => candidate.id === "codex");
    expect(agent?.lastSeenAt).toBeTruthy();
  });

  it("registers coordination tools that let agents check in without manual prompting", async () => {
    const server = await createServer(await mkdtemp(join(tmpdir(), "agent-room-server-")));

    expect(Object.keys(server._registeredTools)).toEqual(
      expect.arrayContaining([
        "list_tasks",
        "register_agent",
        "check_in",
        "check_in_compact",
        "read_message",
        "search_messages",
        "confirm_handoff",
        "set_status",
        "generate_digest",
        "create_thread",
        "close_thread",
        "set_active_thread",
        "list_threads",
        "mark_messages_read",
        "set_active_project",
        "get_room_config",
        "register_project",
        "delete_project",
        "list_projects",
        "append_task_note",
        "upload_attachment",
        "link_attachment",
        "list_attachments"
      ])
    );
  });

  it("registers only the lite profile tools when requested", async () => {
    const server = await createServer(await mkdtemp(join(tmpdir(), "agent-room-server-")), { profile: "lite" });

    expect(Object.keys(server._registeredTools).sort()).toEqual([
      "check_in",
      "claim_task",
      "mark_messages_read",
      "post_message",
      "read_message",
      "read_messages",
      "search_messages",
      "update_task"
    ]);
  });
});
