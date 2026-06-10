import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertProtocolCompliant } from "../src/protocol.js";
import { createServer, isDirectRun, jsonResult, resolveRoomDir } from "../src/server.js";
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

  it("registers coordination tools that let agents check in without manual prompting", async () => {
    const server = await createServer(await mkdtemp(join(tmpdir(), "agent-room-server-")));

    expect(Object.keys(server._registeredTools)).toEqual(
      expect.arrayContaining([
        "list_tasks",
        "register_agent",
        "check_in",
        "check_in_compact",
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
});
