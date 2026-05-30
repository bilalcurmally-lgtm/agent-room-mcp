import { describe, expect, it } from "vitest";
import { createRoomTime } from "../src/time.js";

describe("createRoomTime", () => {
  it("returns local and UTC time facts for a timezone", () => {
    const payload = createRoomTime(new Date("2026-05-30T07:30:00.000Z"), "Asia/Karachi");

    expect(payload).toEqual({
      localIso: "2026-05-30T12:30:00+05:00",
      utcIso: "2026-05-30T07:30:00.000Z",
      date: "2026-05-30",
      time: "12:30:00",
      day: "Saturday",
      timezone: "Asia/Karachi",
      utcOffset: "+05:00",
      unixSeconds: 1780126200
    });
  });
});
