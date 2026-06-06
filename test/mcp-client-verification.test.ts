import { access } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLIENT_SETUP_PROFILES,
  formatVerificationReport,
  verifyAllClientSetups,
  verifyClientSetup
} from "../src/verify-mcp-clients.js";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const serverEntry = join(repoRoot, "dist", "server.js");

describe("MCP client setup verification", () => {
  it("has a built server entry for stdio verification", async () => {
    await expect(access(serverEntry)).resolves.toBeUndefined();
  });

  it("verifies Claude, Codex, and Cursor profiles over stdio", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-verify-test-"));
    const results = await verifyAllClientSetups({ roomDir, serverEntry });

    expect(results).toHaveLength(CLIENT_SETUP_PROFILES.length);
    expect(results.every((result) => result.ok)).toBe(true);
    for (const profile of CLIENT_SETUP_PROFILES) {
      const result = results.find((item) => item.agent === profile.agent);
      expect(result?.steps).toEqual(
        expect.arrayContaining(["register_agent", "check_in", "post_message", "room storage confirmed"])
      );
    }
  }, 60_000);

  it("reports failures clearly", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "agent-room-verify-test-"));
    const result = await verifyClientSetup(
      { roomDir, serverEntry: join(repoRoot, "dist", "missing-server.js") },
      CLIENT_SETUP_PROFILES[0]
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(formatVerificationReport([result])).toContain("FAIL");
  });
});