import { describe, expect, it } from "vitest";
import {
  cronExprError,
  cronScheduleError,
  cronTimezoneError,
  nextCronFireMs
} from "../src/cron-schedule.js";

/** The next `count` fire instants after `from`, as ISO strings. */
function fires(expr: string, tz: string, from: string, count: number) {
  const out: string[] = [];
  let cursor = Date.parse(from);
  for (let i = 0; i < count; i++) {
    const next = nextCronFireMs(expr, tz, cursor);
    if (next === null) break;
    out.push(new Date(next).toISOString());
    cursor = next;
  }
  return out;
}

describe("nextCronFireMs in a timezone other than UTC", () => {
  it("reads the hour on the zone's wall clock, weekdays only", () => {
    // Europe/Berlin is UTC+1 in November, so 08:00 local is 07:00Z.
    // 2026-11-25 is a Wednesday, so Saturday and Sunday are skipped.
    expect(fires("0 8 * * 1-5", "Europe/Berlin", "2026-11-25T12:00:00Z", 4)).toEqual([
      "2026-11-26T07:00:00.000Z",
      "2026-11-27T07:00:00.000Z",
      "2026-11-30T07:00:00.000Z",
      "2026-12-01T07:00:00.000Z"
    ]);
  });

  it("follows the zone's offset change, so 08:00 stays 08:00 local", () => {
    // Summer time (UTC+2) moves the same expression to 06:00Z.
    expect(fires("0 8 * * 1-5", "Europe/Berlin", "2026-06-26T12:00:00Z", 2)).toEqual([
      "2026-06-29T06:00:00.000Z",
      "2026-06-30T06:00:00.000Z"
    ]);
  });

  it("handles a half-hour offset", () => {
    expect(fires("0 8 * * *", "Asia/Kolkata", "2026-01-01T00:00:00Z", 1)).toEqual([
      "2026-01-01T02:30:00.000Z"
    ]);
  });

  it("returns the first fire strictly after the reference instant", () => {
    const slot = Date.parse("2026-01-05T08:00:00Z");
    expect(nextCronFireMs("0 8 * * *", "UTC", slot - 1)).toBe(slot);
    expect(nextCronFireMs("0 8 * * *", "UTC", slot)).toBe(
      Date.parse("2026-01-06T08:00:00Z")
    );
  });

  it("normalizes spacing in the expression", () => {
    expect(nextCronFireMs("  0   8 *\t* 1-5 ", "UTC", Date.parse("2026-01-05T00:00:00Z"))).toBe(
      Date.parse("2026-01-05T08:00:00Z")
    );
  });
});

describe("expression syntax", () => {
  it("accepts lists, ranges, steps and names", () => {
    expect(fires("*/15 9 * * *", "UTC", "2026-01-01T00:00:00Z", 5)).toEqual([
      "2026-01-01T09:00:00.000Z",
      "2026-01-01T09:15:00.000Z",
      "2026-01-01T09:30:00.000Z",
      "2026-01-01T09:45:00.000Z",
      "2026-01-02T09:00:00.000Z"
    ]);
    expect(fires("0 9,17 * * MON", "UTC", "2026-01-01T00:00:00Z", 3)).toEqual([
      "2026-01-05T09:00:00.000Z",
      "2026-01-05T17:00:00.000Z",
      "2026-01-12T09:00:00.000Z"
    ]);
    expect(fires("0 8 * JAN MON-FRI", "UTC", "2026-01-01T00:00:00Z", 2)).toEqual([
      "2026-01-01T08:00:00.000Z",
      "2026-01-02T08:00:00.000Z"
    ]);
  });

  it("fires when either day of month or day of week matches, as standard cron does", () => {
    // 2026-01-01 is a Thursday. The 1st or any Monday.
    expect(fires("0 8 1 * 1", "UTC", "2026-01-01T00:00:00Z", 3)).toEqual([
      "2026-01-01T08:00:00.000Z",
      "2026-01-05T08:00:00.000Z",
      "2026-01-12T08:00:00.000Z"
    ]);
  });
});

describe("spring forward", () => {
  // Europe/Berlin skips 02:00-03:00 on 2026-03-29 (01:00Z is 03:00 CEST).
  it("fires a time inside the gap at the first instant after it, once", () => {
    expect(fires("30 2 * * *", "Europe/Berlin", "2026-03-28T12:00:00Z", 3)).toEqual([
      "2026-03-29T01:00:00.000Z",
      "2026-03-30T00:30:00.000Z",
      "2026-03-31T00:30:00.000Z"
    ]);
  });

  it("does the same in America/New_York (02:00 does not exist on 2026-03-08)", () => {
    expect(fires("0 2 * * *", "America/New_York", "2026-03-08T00:00:00Z", 2)).toEqual([
      "2026-03-08T07:00:00.000Z",
      "2026-03-09T06:00:00.000Z"
    ]);
  });

  it("fires a weekly slot inside the gap at 03:00, then returns to its time", () => {
    expect(fires("30 2 * * 0", "America/New_York", "2026-03-01T12:00:00Z", 3)).toEqual([
      "2026-03-08T07:00:00.000Z",
      "2026-03-15T06:30:00.000Z",
      "2026-03-22T06:30:00.000Z"
    ]);
  });

  it("does not fire twice when a range lands two slots on the same instant", () => {
    // 02:00 is shifted to 03:00, which is also a slot. One fire, then 04:00.
    expect(fires("0 2-4 * * *", "Europe/Berlin", "2026-03-28T12:00:00Z", 2)).toEqual([
      "2026-03-29T01:00:00.000Z",
      "2026-03-29T02:00:00.000Z"
    ]);
  });

  it("keeps an hourly schedule on the hour with no extra or missing fire", () => {
    expect(fires("0 * * * *", "Europe/Berlin", "2026-03-29T00:30:00Z", 4)).toEqual([
      "2026-03-29T01:00:00.000Z",
      "2026-03-29T02:00:00.000Z",
      "2026-03-29T03:00:00.000Z",
      "2026-03-29T04:00:00.000Z"
    ]);
  });
});

describe("fall back", () => {
  // Europe/Berlin repeats 02:00-03:00 on 2026-10-25 (02:30 CEST is 00:30Z,
  // 02:30 CET is 01:30Z).
  it("fires a repeated time once, on its first occurrence", () => {
    const first = nextCronFireMs("30 2 * * *", "Europe/Berlin", Date.parse("2026-10-24T12:00:00Z"));
    expect(first).toBe(Date.parse("2026-10-25T00:30:00Z"));
    // After that fire, the second 02:30 is skipped and the next fire is tomorrow's.
    expect(nextCronFireMs("30 2 * * *", "Europe/Berlin", first!)).toBe(
      Date.parse("2026-10-26T01:30:00Z")
    );
  });

  it("does the same in America/New_York (01:30 happens twice on 2026-11-01)", () => {
    const first = nextCronFireMs("30 1 * * *", "America/New_York", Date.parse("2026-10-30T12:00:00Z"));
    expect(first).toBe(Date.parse("2026-10-31T05:30:00Z"));
    const second = nextCronFireMs("30 1 * * *", "America/New_York", first!);
    expect(second).toBe(Date.parse("2026-11-01T05:30:00Z"));
    expect(nextCronFireMs("30 1 * * *", "America/New_York", second!)).toBe(
      Date.parse("2026-11-02T06:30:00Z")
    );
  });

  it("keeps an hourly schedule firing every real hour through the repeat", () => {
    expect(fires("0 * * * *", "Europe/Berlin", "2026-10-24T23:30:00Z", 4)).toEqual([
      "2026-10-25T00:00:00.000Z",
      "2026-10-25T01:00:00.000Z",
      "2026-10-25T02:00:00.000Z",
      "2026-10-25T03:00:00.000Z"
    ]);
  });
});

describe("validation", () => {
  it("accepts a normal expression and zone", () => {
    expect(cronScheduleError("0 8 * * 1-5", "Europe/Berlin")).toBeNull();
    expect(cronScheduleError("*/15 * * * *", "UTC")).toBeNull();
    expect(cronScheduleError("0 0 29 2 *", "UTC")).toBeNull();
  });

  it.each([
    ["", /empty/],
    ["   ", /empty/],
    ["* * * *", /4 fields/],
    ["0 0 8 * * *", /6 fields/],
    ["@daily", /1 fields/],
    ["61 * * * *", /minute/i],
    ["0 25 * * *", /hour/i],
    ["0 8 * * 8", /dayOfWeek/i],
    ["a b c d e", /invalid/i],
    ["0 0 30 2 *", /never matches/]
  ])("rejects the expression %j", (expr, message) => {
    const error = cronExprError(expr);
    expect(error).not.toBeNull();
    expect(error).toMatch(message);
    expect(nextCronFireMs(expr, "UTC", Date.now())).toBeNull();
  });

  it.each(["Mars/Base", "Europe/Berlín", "", "  "])(
    "rejects the timezone %j",
    (zone) => {
      expect(cronTimezoneError(zone)).not.toBeNull();
      expect(cronScheduleError("0 8 * * *", zone)).not.toBeNull();
      expect(nextCronFireMs("0 8 * * *", zone, Date.now())).toBeNull();
    }
  );

  it("names the bad timezone and suggests the format", () => {
    expect(cronTimezoneError("Mars/Base")).toBe(
      'Unknown timezone "Mars/Base". Use an IANA name such as Europe/Berlin or America/New_York.'
    );
  });

  it("reports the expression first when both are wrong", () => {
    expect(cronScheduleError("nope", "Mars/Base")).toMatch(/fields/);
  });
});
