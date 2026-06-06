import { describe, expect, it } from "vitest";
import { resolveWriteProject } from "../src/store.js";

describe("resolveWriteProject", () => {
  const config = {
    staleTaskHours: 24,
    currentUser: "user",
    enforceProtocol: false,
    activeProject: "agent-room-mcp"
  };

  it("prefers active workspace over view filter", () => {
    expect(resolveWriteProject(config, "all")).toBe("agent-room-mcp");
    expect(resolveWriteProject(config, "other-tag")).toBe("agent-room-mcp");
  });

  it("falls back to view project when no workspace is set", () => {
    expect(resolveWriteProject({ ...config, activeProject: undefined }, "dashboard-v2")).toBe("dashboard-v2");
    expect(resolveWriteProject({ ...config, activeProject: undefined }, "all")).toBeUndefined();
    expect(resolveWriteProject({ ...config, activeProject: undefined }, "unsorted")).toBeUndefined();
  });
});