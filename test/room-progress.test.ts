import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { getRoadmapProgressForRoom } from "../src/room-progress.js";
import type { RoomSnapshotForProgress } from "../src/room-progress.js";

function emptyContext(roomDir: string): RoomSnapshotForProgress {
  return {
    roomDir,
    projects: [],
    tasks: [],
    decisions: [],
    messages: [],
    agents: [],
    protocolWarningCount: 0,
    config: { staleTaskHours: 24, currentUser: "user", enforceProtocol: false }
  };
}

describe("room-backed roadmap progress", () => {
  it("downgrades file-done status when the room lacks evidence", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-progress-"));
    const progress = await getRoadmapProgressForRoom(emptyContext(roomDir));

    const registry = progress.items.find((item) => item.title === "Project Registry And Folder Picker");
    expect(registry).toMatchObject({
      fileStatus: "done",
      roomStatus: "todo",
      status: "todo",
      source: "room"
    });
    expect(progress.roomDriven).toBe(true);
  });

  it("marks launcher done when the room has a launcher marker", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-progress-"));
    await writeFile(
      join(roomDir, ".launcher-suite.json"),
      JSON.stringify({ installedAt: "2026-06-05T00:00:00.000Z", dashboard: true, watch: true }),
      "utf8"
    );

    const progress = await getRoadmapProgressForRoom(emptyContext(roomDir));
    expect(progress.items.find((item) => item.title === "Easy Launcher")).toMatchObject({
      status: "done",
      evidence: expect.stringContaining("Launcher suite marker")
    });
  });
});