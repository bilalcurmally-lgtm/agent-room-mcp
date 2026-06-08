import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildWakeArgs,
  buildWakePrompt,
  canSpendWakeBudget,
  isLikelyAgentSender,
  isTrustedBatch,
  profileForAgent,
  selectWakeMessages
} from "../scripts/agent-wake-watch.mjs";

const msg = (over: Record<string, unknown> = {}) => ({
  id: "000010",
  from: "Bilal",
  to: "all",
  body: "hi",
  ...over
});

describe("selectWakeMessages", () => {
  it("ignores messages at or before the cursor", () => {
    const messages = [msg({ id: "000005" }), msg({ id: "000010" })];
    expect(selectWakeMessages(messages, "claude-opus", "000010")).toHaveLength(0);
  });

  it("excludes the agent's own posts", () => {
    const messages = [msg({ id: "000011", from: "claude-opus" })];
    expect(selectWakeMessages(messages, "claude-opus", "000000")).toHaveLength(0);
  });

  it("wakes on broadcast and direct messages", () => {
    const messages = [
      msg({ id: "000011", to: "all" }),
      msg({ id: "000012", to: "claude-opus" }),
      msg({ id: "000013", to: "codex-desktop" })
    ];
    const selected = selectWakeMessages(messages, "claude-opus", "000010");
    expect(selected.map((m) => m.id)).toEqual(["000011", "000012"]);
  });

  it("does not wake on agent broadcasts unless explicitly mentioned", () => {
    const messages = [
      msg({ id: "000011", from: "claude-opus", to: "all" }),
      msg({ id: "000012", from: "claude-opus", to: "all", mentions: ["codex-desktop"] })
    ];
    const selected = selectWakeMessages(messages, "codex-desktop", "000010");
    expect(selected.map((m) => m.id)).toEqual(["000012"]);
  });

  it("respects explicit mentions over routing", () => {
    const messages = [
      msg({ id: "000011", to: "all", mentions: ["codex-desktop"] }),
      msg({ id: "000012", to: "all", mentions: ["claude-opus"] })
    ];
    const selected = selectWakeMessages(messages, "claude-opus", "000010");
    expect(selected.map((m) => m.id)).toEqual(["000012"]);
  });
});

describe("wake loop breaker", () => {
  it("recognizes likely agent senders", () => {
    expect(isLikelyAgentSender("claude-opus")).toBe(true);
    expect(isLikelyAgentSender("codex-desktop")).toBe(true);
    expect(isLikelyAgentSender("Bilal")).toBe(false);
  });

  it("limits autonomous wake spending per window", async () => {
    const roomDir = await mkdtemp(join(tmpdir(), "wake-budget-"));
    try {
      await expect(
        canSpendWakeBudget({ roomDir, agent: "codex-desktop", nowMs: 1_000, windowMs: 60_000, maxWakes: 2 })
      ).resolves.toMatchObject({ allowed: true });
      await expect(
        canSpendWakeBudget({ roomDir, agent: "codex-desktop", nowMs: 2_000, windowMs: 60_000, maxWakes: 2 })
      ).resolves.toMatchObject({ allowed: true });
      await expect(
        canSpendWakeBudget({ roomDir, agent: "codex-desktop", nowMs: 3_000, windowMs: 60_000, maxWakes: 2 })
      ).resolves.toMatchObject({ allowed: false });
      await expect(
        canSpendWakeBudget({ roomDir, agent: "codex-desktop", nowMs: 70_000, windowMs: 60_000, maxWakes: 2 })
      ).resolves.toMatchObject({ allowed: true });
    } finally {
      await rm(roomDir, { recursive: true, force: true });
    }
  });
});

describe("profileForAgent", () => {
  it("infers profile from the agent id", () => {
    expect(profileForAgent("codex-desktop")).toBe("codex");
    expect(profileForAgent("claude-opus")).toBe("claude");
    expect(profileForAgent("grok-cli")).toBe("grok");
  });

  it("honours an explicit override", () => {
    expect(profileForAgent("claude-opus", "codex")).toBe("codex");
  });
});

describe("isTrustedBatch", () => {
  it("is true when a trusted sender is present", () => {
    expect(isTrustedBatch([msg({ from: "Bilal" })])).toBe(true);
    expect(isTrustedBatch([msg({ from: "claude-opus" })])).toBe(true);
  });

  it("is false for untrusted-only batches", () => {
    expect(isTrustedBatch([msg({ from: "wake-probe" })])).toBe(false);
  });
});

describe("buildWakeArgs", () => {
  it("builds claude print-mode args with the mcp config", () => {
    const args = buildWakeArgs({
      profile: "claude",
      prompt: "do it",
      mcpConfigPath: "C:/room/.claude-wake-mcp.json"
    });
    expect(args).toContain("-p");
    expect(args).toContain("--permission-mode");
    expect(args).toContain("bypassPermissions");
    expect(args).toContain("--mcp-config");
    expect(args).toContain("C:/room/.claude-wake-mcp.json");
  });

  it("builds codex exec args, escalating sandbox only when trusted", () => {
    const untrusted = buildWakeArgs({ profile: "codex", prompt: "p", repoRoot: "R", trusted: false });
    expect(untrusted).toContain("workspace-write");
    const trusted = buildWakeArgs({ profile: "codex", prompt: "p", repoRoot: "R", trusted: true });
    expect(trusted).toContain("danger-full-access");
  });

  it("throws on an unknown profile", () => {
    expect(() => buildWakeArgs({ profile: "nope", prompt: "p" })).toThrow(/Unknown wake profile/);
  });
});

describe("buildWakePrompt", () => {
  it("starts wake turns with compact check-in before full reads", () => {
    const prompt = buildWakePrompt({ agent: "claude-opus", roomDir: "R", messageIds: ["1"], trusted: true });
    expect(prompt).toContain("FIRST_TOOL: check_in_compact");
    expect(prompt).toContain("ALLOWED_ESCALATION: read_messages or full check_in only when compact previews are insufficient");
    expect(prompt).toContain("WAKE_EVIDENCE");
  });

  it("authorizes work only for trusted batches", () => {
    const trusted = buildWakePrompt({ agent: "claude-opus", roomDir: "R", messageIds: ["1"], trusted: true });
    expect(trusted).toMatch(/ACTION_POLICY: execute assigned/);
    const untrusted = buildWakePrompt({ agent: "claude-opus", roomDir: "R", messageIds: ["1"], trusted: false });
    expect(untrusted).toMatch(/ACTION_POLICY: acknowledge only/);
  });
});
