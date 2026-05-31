import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { getRoadmapProgress, loadRoadmapItems } from "../src/progress.js";

describe("roadmap progress", () => {
  it("loads roadmap items from a structured docs file", async () => {
    const raw = await readFile("docs/ROADMAP.json", "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed.items).toEqual(expect.any(Array));
    expect(parsed.items).toContainEqual(
      expect.objectContaining({ title: "Project Registry And Folder Picker", status: "done" })
    );
    expect(await loadRoadmapItems("docs/ROADMAP.json")).toEqual(parsed.items);
  });

  it("calculates progress from supplied roadmap items", () => {
    expect(
      getRoadmapProgress([
        { title: "A", status: "done" },
        { title: "B", status: "partial" },
        { title: "C", status: "todo" }
      ])
    ).toMatchObject({
      done: 1,
      total: 3,
      remaining: 2,
      percent: 33
    });
  });
});
