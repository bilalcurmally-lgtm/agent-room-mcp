import { appendFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCodexWakeArgs,
  codexWakeSandboxMode,
  selectCodexWakeMessages,
  startCodexRoomWatch
} from "../scripts/codex-room-watch.mjs";

describe("codex room watch", () => {
  it("selects new routed messages and excludes Codex's own posts", () => {
    const messages = [
      { id: "000100", from: "user", to: "all", body: "broadcast" },
      { id: "000101", from: "codex-desktop", to: "all", body: "own post" },
      { id: "000102", from: "claude-opus", to: "grok-cli", body: "not for codex" },
      { id: "000103", from: "claude-opus", to: "all", body: "agent broadcast" },
      {
        id: "000104",
        from: "claude-opus",
        to: "all",
        mentions: ["codex-desktop", "grok-cli"],
        body: "targeted"
      }
    ];

    expect(selectCodexWakeMessages(messages, "000099")).toMatchObject([
      { id: "000100" },
      { id: "000104" }
    ]);
    expect(selectCodexWakeMessages(messages, "000100")).toMatchObject([{ id: "000104" }]);
  });

  it("builds a non-interactive Codex turn that can execute assigned work", () => {
    const args = buildCodexWakeArgs({
      repoRoot: "D:\\projects\\agent-room-mcp",
      roomDir: "D:\\projects\\.agent-room",
      messageIds: ["000100", "000103"],
      sandboxMode: "workspace-write"
    });

    expect(args.slice(0, 3)).toEqual(["exec", "-C", "D:\\projects\\agent-room-mcp"]);
    expect(args).toContain("--json");
    expect(args).toContain("--sandbox");
    expect(args).toContain("workspace-write");
    expect(args).toContain('windows.sandbox="unelevated"');
    expect(args.at(-1)).toContain("FIRST_TOOL: check_in_compact");
    expect(args.at(-1)).toContain("ALLOWED_ESCALATION: read_messages or full check_in only when compact previews are insufficient");
    expect(args.at(-1)).toContain("000100, 000103");
    expect(args.at(-1)).toContain("ACTION_POLICY: acknowledge only");
    expect(args.at(-1)).toContain("WAKE_EVIDENCE");
  });

  it("grants full execution only for trusted work assigners", () => {
    expect(codexWakeSandboxMode([{ from: "Bilal" }])).toBe("danger-full-access");
    expect(codexWakeSandboxMode([{ from: "claude-opus" }])).toBe("danger-full-access");
    expect(codexWakeSandboxMode([{ from: "grok-cli" }])).toBe("workspace-write");
    expect(codexWakeSandboxMode([{ from: "wake-test" }])).toBe("workspace-write");
  });

  it("advances its cursor and invokes one wake for new routed messages", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "codex-room-watch-"));
    const messagesPath = join(roomDir, "messages.jsonl");
    await writeFile(
      messagesPath,
      `${JSON.stringify({ id: "000001", from: "user", to: "all", body: "old" })}\n`,
      "utf8"
    );
    const wakes: string[][] = [];
    const watcher = await startCodexRoomWatch({
      roomDir,
      repoRoot: process.cwd(),
      wake: async ({ messageIds }: { messageIds: string[] }) => {
        wakes.push(messageIds);
      }
    });

    await appendFile(
      messagesPath,
      [
        JSON.stringify({ id: "000002", from: "codex-desktop", to: "all", body: "own" }),
        JSON.stringify({ id: "000003", from: "user", to: "codex-desktop", body: "wake" })
      ].join("\n") + "\n",
      "utf8"
    );
    await watcher.drain();
    watcher.close();

    expect(wakes).toEqual([["000003"]]);
  });

  it("continues watching after a wake command fails", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "codex-room-watch-"));
    const messagesPath = join(roomDir, "messages.jsonl");
    await writeFile(
      messagesPath,
      `${JSON.stringify({ id: "000001", from: "user", to: "all", body: "old" })}\n`,
      "utf8"
    );
    const wakes: string[][] = [];
    let attempts = 0;
    const watcher = await startCodexRoomWatch({
      roomDir,
      repoRoot: process.cwd(),
      wake: async ({ messageIds }: { messageIds: string[] }) => {
        attempts += 1;
        wakes.push(messageIds);
        if (attempts === 1) throw new Error("simulated wake failure");
      }
    });

    await appendFile(
      messagesPath,
      `${JSON.stringify({ id: "000002", from: "user", to: "codex-desktop", body: "first" })}\n`,
      "utf8"
    );
    await watcher.drain();
    await appendFile(
      messagesPath,
      `${JSON.stringify({ id: "000003", from: "user", to: "codex-desktop", body: "second" })}\n`,
      "utf8"
    );
    await watcher.drain();
    watcher.close();

    expect(wakes).toEqual([["000002"], ["000003"]]);
  });
});
