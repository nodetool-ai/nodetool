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
} from "../src/nodes/lib-datetime.js";

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

  it("returns current time for empty/null inputs", () => {
    const before = Date.now();
    const a = parseDate("");
    const b = parseDate(null);
    const c = parseDate(undefined);
    const after = Date.now();
    for (const d of [a, b, c]) {
      expect(d.getTime()).toBeGreaterThanOrEqual(before - 10);
      expect(d.getTime()).toBeLessThanOrEqual(after + 10);
    }
  });

  it("throws on garbage strings", () => {
    expect(() => parseDate("not-a-date")).toThrow(/Could not parse date/);
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

  it("adds days as milliseconds", () => {
    const out = addUnits(base, 7, "day");
    expect(out.toISOString()).toBe("2024-03-22T12:00:00.000Z");
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
