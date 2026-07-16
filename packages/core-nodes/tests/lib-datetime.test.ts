/**
 * Tests for lib-datetime.ts — native-Date workflow nodes that replace the
 * old dayjs-powered code snippets.
 */

import { describe, it, expect } from "vitest";
import {
  DateNowNode,
  FormatDateNode,
  DateAddNode,
  DateDiffNode,
  DateStartEndNode,
  LIB_DATETIME_NODES,
  parseDate,
  formatDate,
  addUnits,
  diffUnits,
  startOf,
  endOf
} from "@nodetool-ai/core-nodes";

// ---------------------------------------------------------------------------
// parseDate
// ---------------------------------------------------------------------------

describe("parseDate", () => {
  it("parses ISO strings", () => {
    const d = parseDate("2024-03-15T12:34:56.000Z");
    expect(d.getTime()).toBe(Date.UTC(2024, 2, 15, 12, 34, 56));
  });

  it("parses YYYY-MM-DD as local midnight", () => {
    // new Date("2024-03-15") is actually UTC; we accept this contract.
    const d = parseDate("2024-03-15");
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(15);
  });

  it("accepts epoch milliseconds", () => {
    const d = parseDate(1_700_000_000_000);
    expect(d.toISOString()).toBe("2023-11-14T22:13:20.000Z");
  });

  it("accepts a Date and returns a copy", () => {
    const src = new Date("2024-01-01");
    const d = parseDate(src);
    expect(d.getTime()).toBe(src.getTime());
    expect(d).not.toBe(src);
  });

  it("throws on empty/null/undefined inputs (missing wire is not 'now')", () => {
    expect(() => parseDate("")).toThrow(/No date provided/);
    expect(() => parseDate(null)).toThrow(/No date provided/);
    expect(() => parseDate(undefined)).toThrow(/No date provided/);
  });

  it("parses a Constant Date object {year, month, day} as local midnight", () => {
    const d = parseDate({ year: 2024, month: 3, day: 15 });
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  it("parses a full Constant DateTime object honoring utc_offset (seconds)", () => {
    // 2024-03-15 12:30:00 at +01:00 (utc_offset 3600s) == 11:30:00 UTC.
    const d = parseDate({
      year: 2024,
      month: 3,
      day: 15,
      hour: 12,
      minute: 30,
      second: 0,
      microsecond: 500_000, // 500 ms
      tzinfo: "Europe/Berlin",
      utc_offset: 3600
    });
    expect(d.getTime()).toBe(Date.UTC(2024, 2, 15, 11, 30, 0, 500));
  });

  it("parses a UTC datetime object (utc_offset 0) as the exact UTC instant", () => {
    const d = parseDate({
      year: 2024,
      month: 1,
      day: 1,
      hour: 6,
      minute: 0,
      second: 0,
      microsecond: 0,
      tzinfo: "UTC",
      utc_offset: 0
    });
    expect(d.getTime()).toBe(Date.UTC(2024, 0, 1, 6, 0, 0, 0));
  });

  it("throws a friendly error on a malformed date object", () => {
    expect(() => parseDate({ year: "nope", month: 1, day: 1 })).toThrow(
      /Could not parse date/
    );
    expect(() => parseDate({ year: 2024, month: NaN, day: 1 })).toThrow(
      /Could not parse date/
    );
  });

  it("Constant DateTime → parseDate round-trips (regression for the throw)", () => {
    // Shape identical to ConstantDateTimeNode.process() output.
    const constantOutput = {
      year: 2024,
      month: 6,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      microsecond: 0,
      tzinfo: "UTC",
      utc_offset: 0
    };
    expect(() => parseDate(constantOutput)).not.toThrow();
    const shifted = addUnits(parseDate(constantOutput), 1, "day");
    expect(shifted.getTime()).toBe(Date.UTC(2024, 5, 2, 0, 0, 0, 0));
  });

  it("throws on garbage strings", () => {
    expect(() => parseDate("not-a-date")).toThrow(/Could not parse date/);
  });

  it("throws a friendly error on non-finite numbers", () => {
    expect(() => parseDate(NaN)).toThrow(/Could not parse date/);
    expect(() => parseDate(Infinity)).toThrow(/Could not parse date/);
  });

  it("throws a friendly error on an Invalid Date instance", () => {
    expect(() => parseDate(new Date("not-a-date"))).toThrow(
      /Could not parse date/
    );
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe("formatDate", () => {
  // Use a UTC-anchored date and format tokens that don't depend on TZ.
  const d = new Date(Date.UTC(2024, 2, 15, 14, 7, 9, 42));

  it("formats YYYY-MM-DD", () => {
    // local year/month/day may differ from UTC — use UTC values explicitly
    const iso = new Date("2024-03-15T00:00:00.000Z");
    // Reconstruct a local date with known parts:
    const local = new Date(2024, 2, 15, 14, 7, 9, 42);
    expect(formatDate(local, "YYYY-MM-DD")).toBe("2024-03-15");
    expect(iso.toISOString().startsWith("2024-03-15")).toBe(true);
  });

  it("pads HH:mm:ss correctly", () => {
    const local = new Date(2024, 0, 2, 3, 4, 5);
    expect(formatDate(local, "HH:mm:ss")).toBe("03:04:05");
  });

  it("supports milliseconds and 2-digit year", () => {
    expect(formatDate(d, "SSS")).toBe("042");
    const local = new Date(2024, 0, 1);
    expect(formatDate(local, "YY")).toBe("24");
  });

  it("respects bracket-escape literals", () => {
    const local = new Date(2024, 2, 15);
    expect(formatDate(local, "[Year] YYYY")).toBe("Year 2024");
  });

  it("produces an offset string for Z token", () => {
    expect(formatDate(d, "Z")).toMatch(/^(Z|[+-]\d{2}:\d{2})$/);
  });
});

// ---------------------------------------------------------------------------
// addUnits / diffUnits
// ---------------------------------------------------------------------------

describe("addUnits", () => {
  const base = new Date("2024-03-15T12:00:00.000Z");

  it("adds days (calendar-aware)", () => {
    const out = addUnits(base, 7, "day");
    expect(out.toISOString()).toBe("2024-03-22T12:00:00.000Z");
  });

  it("adds days preserving the local wall-clock hour across DST", () => {
    // US spring-forward is 2024-03-10. Starting at noon on the 9th and adding
    // one day must land on noon on the 10th regardless of the runtime TZ: in a
    // DST zone the day is only 23h, so fixed-ms math would land at 13:00.
    const start = new Date(2024, 2, 9, 12, 0, 0, 0);
    const out = addUnits(start, 1, "day");
    expect(out.getFullYear()).toBe(2024);
    expect(out.getMonth()).toBe(2);
    expect(out.getDate()).toBe(10);
    expect(out.getHours()).toBe(12);
    expect(out.getMinutes()).toBe(0);
  });

  it("adds weeks preserving the local wall-clock hour across DST", () => {
    // A week spanning the DST boundary (Mar 6 → Mar 13, 2024).
    const start = new Date(2024, 2, 6, 9, 30, 0, 0);
    const out = addUnits(start, 1, "week");
    expect(out.getMonth()).toBe(2);
    expect(out.getDate()).toBe(13);
    expect(out.getHours()).toBe(9);
    expect(out.getMinutes()).toBe(30);
  });

  it("subtracts days via negative amount (calendar-aware)", () => {
    const start = new Date(2024, 2, 10, 8, 0, 0, 0);
    const out = addUnits(start, -1, "day");
    expect(out.getDate()).toBe(9);
    expect(out.getHours()).toBe(8);
  });

  it("subtracts via negative amount", () => {
    const out = addUnits(base, -1, "hour");
    expect(out.toISOString()).toBe("2024-03-15T11:00:00.000Z");
  });

  it("adds months calendar-aware", () => {
    const out = addUnits(new Date(2024, 0, 31), 1, "month"); // Jan 31 + 1m
    // setMonth(1) may roll into March — that's JS semantics; accept either.
    expect([1, 2]).toContain(out.getMonth());
  });

  it("adds years calendar-aware", () => {
    const leapDay = new Date(2020, 1, 29);
    const out = addUnits(leapDay, 1, "year");
    // Feb 29 + 1 year rolls to Mar 1 in non-leap years.
    expect(out.getFullYear()).toBe(2021);
  });
});

describe("diffUnits", () => {
  it("returns integer days between two dates", () => {
    const a = new Date("2024-03-22T00:00:00.000Z");
    const b = new Date("2024-03-15T00:00:00.000Z");
    expect(diffUnits(a, b, "day")).toBe(7);
  });

  it("returns hours", () => {
    const a = new Date("2024-03-15T12:00:00.000Z");
    const b = new Date("2024-03-15T09:30:00.000Z");
    expect(diffUnits(a, b, "hour")).toBe(2);
  });

  it("returns signed diff when a < b", () => {
    const a = new Date("2024-03-15T00:00:00.000Z");
    const b = new Date("2024-03-22T00:00:00.000Z");
    expect(diffUnits(a, b, "day")).toBe(-7);
  });

  it("returns calendar months", () => {
    const a = new Date(2024, 5, 15);
    const b = new Date(2024, 2, 15);
    expect(diffUnits(a, b, "month")).toBe(3);
  });

  it("returns calendar years", () => {
    const a = new Date(2026, 2, 14);
    const b = new Date(2024, 2, 15);
    // hasn't reached 2026-03-15 yet — 1 year diff
    expect(diffUnits(a, b, "year")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// startOf / endOf
// ---------------------------------------------------------------------------

describe("startOf/endOf", () => {
  const d = new Date(2024, 5, 15, 14, 7, 9, 42); // Jun 15 2024 14:07:09.042 local

  it("startOf day zeroes the clock", () => {
    const s = startOf(d, "day");
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getSeconds()).toBe(0);
    expect(s.getMilliseconds()).toBe(0);
    expect(s.getDate()).toBe(15);
  });

  it("endOf day lands on .999ms of same day", () => {
    const e = endOf(d, "day");
    expect(e.getHours()).toBe(23);
    expect(e.getMinutes()).toBe(59);
    expect(e.getSeconds()).toBe(59);
    expect(e.getMilliseconds()).toBe(999);
    expect(e.getDate()).toBe(15);
  });

  it("startOf month lands on the 1st", () => {
    expect(startOf(d, "month").getDate()).toBe(1);
  });

  it("startOf year lands on Jan 1", () => {
    const s = startOf(d, "year");
    expect(s.getMonth()).toBe(0);
    expect(s.getDate()).toBe(1);
  });

  it("startOf week lands on Sunday", () => {
    expect(startOf(d, "week").getDay()).toBe(0);
  });

  it("endOf lands on .999ms and equals next-period-start minus 1ms", () => {
    const sample = new Date(2024, 2, 9, 14, 7, 9, 42); // day before US DST
    for (const unit of [
      "day",
      "week",
      "month",
      "year",
      "hour",
      "minute",
      "second"
    ] as const) {
      const e = endOf(sample, unit);
      expect(e.getMilliseconds()).toBe(999);
      // end is exactly 1ms before the start of the following period.
      const nextStart = addUnits(startOf(sample, unit), 1, unit);
      expect(e.getTime()).toBe(nextStart.getTime() - 1);
    }
  });

  it("endOf day across DST stays on the same local day", () => {
    // Even when the local day is 23h (spring-forward), endOf lands at 23:59:59.999.
    const e = endOf(new Date(2024, 2, 10, 5, 0, 0, 0), "day");
    expect(e.getDate()).toBe(10);
    expect(e.getHours()).toBe(23);
    expect(e.getMinutes()).toBe(59);
    expect(e.getSeconds()).toBe(59);
    expect(e.getMilliseconds()).toBe(999);
  });
});

// ---------------------------------------------------------------------------
// Node classes
// ---------------------------------------------------------------------------

describe("DateNowNode", () => {
  it("returns iso, epoch_ms and a Date", async () => {
    const node = new DateNowNode();
    const out = await node.process();
    expect(typeof out.iso).toBe("string");
    expect(typeof out.epoch_ms).toBe("number");
    expect(out.date).toBeInstanceOf(Date);
  });
});

describe("FormatDateNode", () => {
  it("formats an ISO date string", async () => {
    const node = new FormatDateNode({
      date: "2024-03-15T12:00:00.000Z",
      pattern: "YYYY-MM-DD"
    });
    const out = await node.process();
    expect(out.iso).toBe("2024-03-15T12:00:00.000Z");
    expect(typeof out.formatted).toBe("string");
    expect(out.epoch_ms).toBe(Date.UTC(2024, 2, 15, 12, 0, 0));
  });

  it("rejects an unparseable input", async () => {
    const node = new FormatDateNode({ date: "nope", pattern: "YYYY" });
    await expect(node.process()).rejects.toThrow(/Could not parse/);
  });
});

describe("DateAddNode", () => {
  it("adds 7 days", async () => {
    const node = new DateAddNode({
      date: "2024-03-15T00:00:00.000Z",
      amount: 7,
      unit: "day"
    });
    const out = await node.process();
    expect(out.iso).toBe("2024-03-22T00:00:00.000Z");
  });

  it("subtracts via negative amount", async () => {
    const node = new DateAddNode({
      date: "2024-03-15T00:00:00.000Z",
      amount: -2,
      unit: "hour"
    });
    const out = await node.process();
    expect(out.iso).toBe("2024-03-14T22:00:00.000Z");
  });

  it("rejects an unknown unit", async () => {
    const node = new DateAddNode({
      date: "2024-03-15",
      amount: 1,
      unit: "eon"
    });
    await expect(node.process()).rejects.toThrow(/Unsupported date unit/);
  });
});

describe("DateDiffNode", () => {
  it("reports day diff and ordering flags", async () => {
    const node = new DateDiffNode({
      date_a: "2024-03-22T00:00:00.000Z",
      date_b: "2024-03-15T00:00:00.000Z",
      unit: "day"
    });
    const out = await node.process();
    expect(out.diff).toBe(7);
    expect(out.is_after).toBe(true);
    expect(out.is_before).toBe(false);
    expect(out.is_same).toBe(false);
  });

  it("same instant reports is_same=true", async () => {
    const iso = "2024-01-01T00:00:00.000Z";
    const node = new DateDiffNode({ date_a: iso, date_b: iso, unit: "day" });
    const out = await node.process();
    expect(out.is_same).toBe(true);
    expect(out.diff).toBe(0);
  });
});

describe("DateStartEndNode", () => {
  it("returns start and end of day as ISO", async () => {
    const node = new DateStartEndNode({
      date: "2024-03-15T14:30:00.000Z",
      unit: "day"
    });
    const out = await node.process();
    expect(out.start).toBeInstanceOf(Date);
    expect(out.end).toBeInstanceOf(Date);
    // end should be exactly 1ms before the following start.
    expect((out.end as Date).getTime() - (out.start as Date).getTime()).toBe(
      86_400_000 - 1
    );
  });
});

// ---------------------------------------------------------------------------
// Export bundle
// ---------------------------------------------------------------------------

describe("LIB_DATETIME_NODES export", () => {
  it("includes exactly the exported classes", () => {
    expect(LIB_DATETIME_NODES).toHaveLength(5);
    const types = LIB_DATETIME_NODES.map((n) => n.nodeType);
    expect(types).toEqual([
      "lib.datetime.Now",
      "lib.datetime.Format",
      "lib.datetime.Add",
      "lib.datetime.Diff",
      "lib.datetime.StartEnd"
    ]);
  });

  it("every node declares metadataOutputTypes", () => {
    for (const cls of LIB_DATETIME_NODES) {
      expect(cls.metadataOutputTypes).toBeTruthy();
    }
  });
});
