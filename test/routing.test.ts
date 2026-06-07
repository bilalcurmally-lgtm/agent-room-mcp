import { describe, expect, it } from "vitest";
import {
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

  it("ignores @mentions for agents that have not joined the room", () => {
    expect(resolveAgentId("grok", ["codex-desktop"])).toBeUndefined();
    expect(
      resolveMessageRoute({
        body: "@grok please review",
        registeredAgentIds: ["codex-desktop"]
      })
    ).toMatchObject({ to: "all", parsedMentions: ["grok"] });
  });

  it("routes a single @mention to one agent", () => {
    expect(
      resolveMessageRoute({
        body: "@codex please take this",
        registeredAgentIds: registered
      })
    ).toMatchObject({ to: "codex-desktop", parsedMentions: ["codex"] });
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