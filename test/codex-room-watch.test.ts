import { appendFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCodexWakeArgs,
  selectCodexWakeMessages,
  startCodexRoomWatch
} from "../scripts/codex-room-watch.mjs";

describe("codex room watch", () => {
  it("selects new routed messages and excludes Codex's own posts", () => {
    const messages = [
      { id: "000100", from: "user", to: "all", body: "broadcast" },
      { id: "000101", from: "codex-desktop", to: "all", body: "own post" },
      { id: "000102", from: "claude-opus", to: "grok-cli", body: "not for codex" },
      {
        id: "000103",
        from: "claude-opus",
        to: "all",
        mentions: ["codex-desktop", "grok-cli"],
        body: "targeted"
      }
    ];

    expect(selectCodexWakeMessages(messages, "000099")).toMatchObject([
      { id: "000100" },
      { id: "000103" }
    ]);
    expect(selectCodexWakeMessages(messages, "000100")).toMatchObject([{ id: "000103" }]);
  });

  it("builds a non-interactive Codex turn that can execute assigned work", () => {
    const args = buildCodexWakeArgs({
      repoRoot: "D:\\projects\\agent-room-mcp",
      roomDir: "D:\\projects\\.agent-room",
      messageIds: ["000100", "000103"]
    });

    expect(args.slice(0, 3)).toEqual(["exec", "-C", "D:\\projects\\agent-room-mcp"]);
    expect(args).toContain("--json");
    expect(args.at(-1)).toContain("check_in");
    expect(args.at(-1)).toContain("000100, 000103");
    expect(args.at(-1)).toContain("execute it end to end in this same turn");
    expect(args.at(-1)).toContain("You may edit files");
    expect(args.at(-1)).not.toContain("Do not edit files");
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
});
