import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatWakeDoctorReport, runWakeDoctor, type WakeDoctorResult } from "../src/doctor-wake.js";

describe("wake doctor", () => {
  it("formats pass/warn/fail checks with hints", () => {
    const result: WakeDoctorResult = {
      ok: false,
      checks: [
        { name: "compact", level: "pass", detail: "ok" },
        { name: "cursor", level: "warn", detail: "missing", hint: "start watcher" },
        { name: "pid", level: "fail", detail: "dead", hint: "restart watcher" }
      ]
    };

    expect(
      formatWakeDoctorReport(result, {
        agent: "codex-desktop",
        roomDir: "R",
        repoRoot: "P",
        project: "agent-room-mcp"
      })
    ).toContain("FAIL pid");
  });

  it("checks local room files and watcher state without external services", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "wake-doctor-"));
    const serverEntry = join(roomDir, "server.js");
    await mkdir(roomDir, { recursive: true });
    await writeFile(serverEntry, "", "utf8");
    await writeFile(join(roomDir, "messages.jsonl"), "", "utf8");
    await writeFile(join(roomDir, ".codex-room-watch.pid"), `${process.pid}\n`, "utf8");
    await writeFile(join(roomDir, ".codex-room-watch-lastseen"), "000123\n", "utf8");
    await writeFile(join(roomDir, ".codex-desktop-wake-budget.json"), "[]\n", "utf8");
    await writeFile(join(roomDir, ".codex-room-watch.log"), "latest ok\n", "utf8");
    await writeFile(
      join(roomDir, ".codex-desktop-watch-task.json"),
      `\uFEFF${JSON.stringify({ taskName: "Agent Room Watch - codex-desktop", startScript: "start.ps1" })}`,
      "utf8"
    );

    const result = await runWakeDoctor({
      agent: "codex-desktop",
      roomDir,
      repoRoot: resolve("."),
      project: "agent-room-mcp",
      serverEntry,
      skipDashboard: true,
      skipScheduledTask: true,
      skipMcp: true
    });

    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining(["watcher process", "wake cursor", "wake budget", "watcher log"])
    );
  });
});
