import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("documentation", () => {
  it("keeps Codex and Cursor setup discoverable", async () => {
    const readme = await readFile("README.md", "utf8");
    const guide = await readFile("docs/MCP_CLIENT_SETUP.md", "utf8");

    expect(readme).toContain("docs/MCP_CLIENT_SETUP.md");
    expect(guide).toContain("## Codex Setup");
    expect(guide).toContain("## Cursor Setup");
    expect(guide).toContain("agent-room-mcp");
    expect(guide).toContain("D:\\projects\\.agent-room");
    expect(guide).toContain("check_in");
    expect(guide).toContain("restart");
  });
});
