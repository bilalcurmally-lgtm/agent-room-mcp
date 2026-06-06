import { describe, expect, it } from "vitest";
import {
  assessProtocolCompliance,
  assertProtocolCompliant,
  enrichMessageBody,
  isValidProtocolPhase,
  protocolWarningsForMessages
} from "../src/protocol.js";

describe("protocol enforcement", () => {
  it("parses structured fields on user messages without warnings", () => {
    expect(
      assessProtocolCompliance({
        from: "user",
        body: "Note.",
        status: "planning",
        next: "Ship it",
        phase: "C1"
      })
    ).toMatchObject({ missing: [], status: "planning", phase: "C1", next: "Ship it" });
  });

  it("requires STATUS and NEXT for agents but not user messages", () => {
    expect(
      assessProtocolCompliance({
        from: "codex-desktop",
        body: "Please review."
      })
    ).toMatchObject({ missing: ["[STATUS:]", "[NEXT:]"] });

    expect(
      assessProtocolCompliance({
        from: "user",
        body: "Casual note."
      })
    ).toMatchObject({ missing: [], invalid: [] });
  });

  it("accepts structured fields without inline tags", () => {
    expect(
      assessProtocolCompliance({
        from: "codex-desktop",
        body: "Dashboard routing is ready.",
        status: "implementing",
        next: "Claude review",
        phase: "C1"
      })
    ).toMatchObject({ missing: [], invalid: [], status: "implementing", phase: "C1" });
  });

  it("validates phase labels", () => {
    expect(isValidProtocolPhase("C1")).toBe(true);
    expect(isValidProtocolPhase("review")).toBe(true);
    expect(isValidProtocolPhase("random-phase")).toBe(false);
  });

  it("enriches message bodies with structured protocol fields", () => {
    const body = enrichMessageBody("Ready for review.", {
      status: "reviewing",
      next: "Codex merge",
      phase: "C1"
    });

    expect(body).toContain("[PHASE: C1]");
    expect(body).toContain("[STATUS: reviewing]");
    expect(body).toContain("[NEXT: Codex merge]");
  });

  it("rejects non-compliant MCP messages only when enforcement is enabled", () => {
    expect(() =>
      assertProtocolCompliant({ from: "codex-desktop", body: "No protocol." }, false)
    ).not.toThrow();

    expect(() =>
      assertProtocolCompliant({ from: "codex-desktop", body: "No protocol." }, true)
    ).toThrow(/Protocol enforcement/);
  });

  it("builds dashboard warnings from stored messages", () => {
    const warnings = protocolWarningsForMessages([
      {
        id: "000001",
        from: "codex-desktop",
        to: "all",
        topic: "Bad",
        body: "Missing fields",
        time: "2026-06-05T00:00:00.000Z"
      },
      {
        id: "000002",
        from: "claude-opus",
        to: "all",
        topic: "Good",
        body: "[STATUS: reviewing] ok [NEXT: ship]",
        status: "reviewing",
        next: "ship",
        phase: "C2",
        time: "2026-06-05T00:00:01.000Z"
      }
    ]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      messageId: "000001",
      missing: ["[STATUS:]", "[NEXT:]"]
    });
  });
});