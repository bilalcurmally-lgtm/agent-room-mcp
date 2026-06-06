import { describe, expect, it } from "vitest";
import {
  buildStaleItemWarnings,
  formatRelativeTime,
  parseFollowUpHints
} from "../src/temporal.js";
import { createRoomTime } from "../src/time.js";

describe("temporal helpers", () => {
  it("formats human-friendly relative times", () => {
    const now = new Date("2026-06-05T12:00:00.000Z");
    expect(formatRelativeTime("2026-06-05T11:30:00.000Z", now)).toBe("30 minutes ago");
    expect(formatRelativeTime("2026-06-04T12:00:00.000Z", now)).toBe("1 day ago");
  });

  it("parses follow-up phrases against room time", () => {
    const roomTime = createRoomTime(new Date("2026-06-05T07:30:00.000Z"), "Asia/Karachi");
    const hints = parseFollowUpHints("Ping me later today and we can ship tomorrow.", roomTime);

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phrase: "later today", label: "later today", dueIso: "2026-06-05T23:59:59+05:00" }),
        expect.objectContaining({ phrase: "tomorrow", label: "tomorrow", dueIso: "2026-06-06T09:00:00+05:00" })
      ])
    );
  });

  it("builds stale warnings for old messages and decisions", () => {
    const now = new Date("2026-06-05T12:00:00.000Z");
    const warnings = buildStaleItemWarnings(
      [
        { id: "msg-000001", project: "alpha", time: "2000-01-01T00:00:00.000Z" },
        { id: "dec-000001", project: "alpha", time: "2000-01-01T00:00:00.000Z" }
      ],
      (item) => item.time,
      () => "Example",
      "message",
      1,
      { project: "alpha", now }
    );

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatchObject({ kind: "message", id: "msg-000001", ageHours: expect.any(Number) });
  });
});