import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("documentation", () => {
  it("keeps Codex and Cursor setup discoverable", async () => {
    const readme = await readFile("README.md", "utf8");
    const guide = await readFile("docs/MCP_CLIENT_SETUP.md", "utf8");
    const pkg = await readFile("package.json", "utf8");

    expect(readme).toContain("docs/MCP_CLIENT_SETUP.md");
    expect(guide).toContain("## Codex Setup");
    expect(guide).toContain("## Cursor Setup");
    expect(guide).toContain("## Automated Verification");
    expect(guide).toContain("verify-clients");
    expect(guide).toContain("agent-room-mcp");
    expect(guide).toContain("D:\\projects\\.agent-room");
    expect(guide).toContain("check_in");
    expect(guide).toContain("restart");
    expect(pkg).toContain("verify-clients");
  });

  it("documents launchers and room-backed progress", async () => {
    const launcher = await readFile("docs/LAUNCHER.md", "utf8");
    const pkg = await readFile("package.json", "utf8");
    expect(launcher).toContain("start-suite");
    expect(pkg).toContain("start-suite");
  });

  it("documents workspace, attachments, and codex review packet", async () => {
    const workspace = await readFile("docs/PROJECT_WORKSPACE.md", "utf8");
    const attachments = await readFile("docs/ATTACHMENTS.md", "utf8");
    const review = await readFile("docs/CODEX_REVIEW_2026-06-05.md", "utf8");
    const backlog = await readFile("docs/BACKLOG.md", "utf8");

    expect(workspace).toContain("activeProject");
    expect(attachments).toContain("upload_attachment");
    expect(review).toContain("reviewed by Codex");
    expect(backlog).toContain("Priority 10 - Attachments");
    expect(backlog).toContain("DONE for MVP");
  });

  it("documents ping and watch reliability", async () => {
    const pingWatch = await readFile("docs/PING_WATCH.md", "utf8");
    const backlog = await readFile("docs/BACKLOG.md", "utf8");
    const pkg = await readFile("package.json", "utf8");

    expect(pingWatch).toContain("wake-agent.ps1");
    expect(pingWatch).toContain("codex-desktop");
    expect(pingWatch).toContain("codex-room-watch.mjs");
    expect(pingWatch).toContain("codex exec");
    expect(pingWatch).toContain("dogfood-ping-watch");
    expect(backlog).toContain("Priority 5 - Ping/Watch Reliability");
    expect(pkg).toContain("dogfood-ping-watch");
    expect(pkg).toContain("start-codex-watch");
  });
});
