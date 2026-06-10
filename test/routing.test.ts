import { describe, expect, it } from "vitest";
import {
  UnresolvedMentionsError,
  messageTargetsAgent,
  normalizeRouteTarget,
  parseMentionTokens,
  resolveAgentId,
  resolveMessageRoute
} from "../src/routing.js";

describe("routing", () => {
  const registered = ["codex-desktop", "claude-opus", "cursor", "grok", "antigravity"];

  it("parses mention tokens from message bodies", () => {
    expect(parseMentionTokens("@codex please review @grok")).toEqual(["codex", "grok"]);
  });

  it("resolves aliases and registered agent ids", () => {
    expect(resolveAgentId("codex", registered)).toBe("codex-desktop");
    expect(resolveAgentId("grok", registered)).toBe("grok");
    expect(resolveAgentId("antigravity", registered)).toBe("antigravity");
    expect(resolveAgentId("codex-desktop", registered)).toBe("codex-desktop");
  });

  it("falls back to the literal registered id when the alias target is absent", () => {
    expect(resolveAgentId("claude", ["claude", "cursor"])).toBe("claude");
    expect(
      resolveMessageRoute({
        body: "@claude please review",
        registeredAgentIds: ["claude", "cursor"]
      })
    ).toMatchObject({ to: "claude", parsedMentions: ["claude"] });
  });

  it("resolves @grok to grok-cli when only grok-cli has joined", () => {
    const joined = ["codex-desktop", "claude-opus", "grok-cli", "antigravity"];
    expect(resolveAgentId("grok", joined)).toBe("grok-cli");
    expect(
      resolveMessageRoute({
        body: "@grok please review",
        registeredAgentIds: joined
      })
    ).toMatchObject({ to: "grok-cli", parsedMentions: ["grok"] });
    expect(normalizeRouteTarget("grok", joined)).toBe("grok-cli");
  });

  it("normalizes explicit grok target when the body has unknown mention tokens", () => {
    const joined = ["codex-desktop", "grok-cli"];
    expect(
      resolveMessageRoute({
        to: "grok",
        body: "@nobody hello",
        registeredAgentIds: joined
      })
    ).toMatchObject({ to: "grok-cli", parsedMentions: ["nobody"] });
    expect(
      resolveMessageRoute({
        to: "grok",
        body: "@codex @grok hello",
        registeredAgentIds: joined
      })
    ).toMatchObject({
      to: "grok-cli",
      mentions: ["codex-desktop", "grok-cli"],
      parsedMentions: ["codex", "grok"]
    });
  });

  it("rejects unresolved @mentions instead of silently broadcasting", () => {
    expect(resolveAgentId("grok", ["codex-desktop"])).toBeUndefined();
    expect(() =>
      resolveMessageRoute({
        body: "@grok please review",
        registeredAgentIds: ["codex-desktop"]
      })
    ).toThrow(UnresolvedMentionsError);
    expect(() =>
      resolveMessageRoute({
        body: "@codex fix this",
        registeredAgentIds: ["claude-opus", "cursor"]
      })
    ).toThrow("unknown agent(s): @codex — registered: claude-opus, cursor");
  });

  it("rejects unresolved @mentions on explicit broadcasts too", () => {
    expect(() =>
      resolveMessageRoute({
        to: "all",
        body: "@grok please review",
        registeredAgentIds: ["codex-desktop"]
      })
    ).toThrow(UnresolvedMentionsError);
  });

  it("honors an explicit recipient when body mentions resolve to nobody", () => {
    expect(
      resolveMessageRoute({
        to: "claude-opus",
        body: "the @media query breaks on mobile",
        registeredAgentIds: ["claude-opus", "codex-desktop"]
      })
    ).toMatchObject({
      to: "claude-opus",
      parsedMentions: ["media"],
      unresolvedMentions: ["media"]
    });
  });

  it("surfaces unresolved tokens alongside resolved mentions", () => {
    const route = resolveMessageRoute({
      body: "@codex and @nobody take a look",
      registeredAgentIds: ["codex-desktop"]
    });
    expect(route).toMatchObject({
      to: "codex-desktop",
      parsedMentions: ["codex", "nobody"],
      unresolvedMentions: ["nobody"]
    });
  });

  it("routes a single @mention to one agent", () => {
    expect(
      resolveMessageRoute({
        body: "@codex please take this",
        registeredAgentIds: registered
      })
    ).toMatchObject({ to: "codex-desktop", parsedMentions: ["codex"] });
  });

  it("keeps an explicit recipient when the body quotes another agent", () => {
    expect(
      resolveMessageRoute({
        to: "codex-desktop",
        body: "as @claude suggested earlier, ship it",
        registeredAgentIds: registered
      })
    ).toMatchObject({
      to: "codex-desktop",
      mentions: ["claude-opus"],
      parsedMentions: ["claude"]
    });
  });

  it("delivers to both the explicit recipient and additive mentions", () => {
    const message = { from: "user", to: "codex-desktop", mentions: ["claude-opus"] };
    expect(messageTargetsAgent(message, "codex-desktop")).toBe(true);
    expect(messageTargetsAgent(message, "claude-opus")).toBe(true);
    expect(messageTargetsAgent(message, "cursor")).toBe(false);
  });

  it("routes @all as a broadcast", () => {
    expect(
      resolveMessageRoute({
        body: "@all ship it",
        registeredAgentIds: registered
      })
    ).toMatchObject({ to: "all", parsedMentions: ["all"] });
  });

  it("routes multiple mentions to a directed mention list", () => {
    expect(
      resolveMessageRoute({
        body: "@codex implement, @grok review",
        registeredAgentIds: registered
      })
    ).toMatchObject({
      to: "all",
      mentions: ["codex-desktop", "grok"],
      parsedMentions: ["codex", "grok"]
    });
  });

  it("delivers mention-list messages only to named agents", () => {
    const message = {
      from: "user",
      to: "all",
      mentions: ["codex-desktop", "grok"]
    };
    expect(messageTargetsAgent(message, "codex-desktop")).toBe(true);
    expect(messageTargetsAgent(message, "grok")).toBe(true);
    expect(messageTargetsAgent(message, "claude-opus")).toBe(false);
  });

  it("delivers broadcast messages to every agent except sender", () => {
    const message = { from: "user", to: "all" };
    expect(messageTargetsAgent(message, "codex-desktop")).toBe(true);
    expect(messageTargetsAgent(message, "user")).toBe(false);
  });
});