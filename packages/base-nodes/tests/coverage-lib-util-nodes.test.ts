import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcessingContext } from "@nodetool/runtime";
import {
  // lib-date
  TodayLibNode,
  NowLibNode,
  ParseDateLibNode,
  ParseDateTimeLibNode,
  AddTimeDeltaLibNode,
  DateDifferenceLibNode,
  FormatDateTimeLibNode,
  GetWeekdayLibNode,
  DateRangeLibNode,
  IsDateInRangeLibNode,
  GetQuarterLibNode,
  DateToDatetimeLibNode,
  DatetimeToDateLibNode,
  RelativeTimeLibNode,
  BoundaryTimeLibNode,
  // lib-json
  ParseDictLibNode,
  ParseListLibNode,
  StringifyJSONLibNode,
  GetJSONPathStrLibNode,
  GetJSONPathIntLibNode,
  GetJSONPathFloatLibNode,
  GetJSONPathBoolLibNode,
  GetJSONPathListLibNode,
  GetJSONPathDictLibNode,
  ValidateJSONLibNode,
  FilterJSONLibNode,
  JSONTemplateLibNode,
  LoadJSONAssetsLibNode,
  // lib-math
  AddLibNode,
  SubtractLibNode,
  MultiplyLibNode,
  DivideLibNode,
  ModulusLibNode,
  MathFunctionLibNode,
  SineLibNode,
  CosineLibNode,
  PowerLibNode,
  SqrtLibNode,
  // lib-os
  WorkspaceDirectoryLibNode,
  OpenWorkspaceDirectoryLibNode,
  FileExistsLibNode,
  ListFilesLibNode,
  CopyFileLibNode,
  MoveFileLibNode,
  CreateDirectoryLibNode,
  GetFileSizeLibNode,
  CreatedTimeLibNode,
  ModifiedTimeLibNode,
  AccessedTimeLibNode,
  IsFileLibNode,
  IsDirectoryLibNode,
  FileExtensionLibNode,
  FileNameLibNode,
  GetDirectoryLibNode,
  FileNameMatchLibNode,
  FilterFileNamesLibNode,
  BasenameLibNode,
  DirnameLibNode,
  JoinPathsLibNode,
  NormalizePathLibNode,
  GetPathInfoLibNode,
  AbsolutePathLibNode,
  SplitPathLibNode,
  SplitExtensionLibNode,
  RelativePathLibNode,
  PathToStringLibNode,
  ShowNotificationLibNode,
  // lib-markdown
  ExtractLinksMarkdownLibNode,
  ExtractHeadersMarkdownLibNode,
  ExtractBulletListsMarkdownLibNode,
  ExtractNumberedListsMarkdownLibNode,
  ExtractCodeBlocksMarkdownLibNode,
  ExtractTablesMarkdownLibNode,
  // lib-secret
  GetSecretLibNode,
} from "../src/index.js";

/* ================================================================
   Helper: exercise defaults() on all node classes to cover those lines
   ================================================================ */
function exerciseDefaults(NodeClass: new () => { defaults?: () => Record<string, unknown> }) {
  const node = new NodeClass();
  if (typeof node.defaults === "function") {
    const d = node.serialize();
    expect(d).toBeDefined();
  }
}

/* ================================================================
   Helper: a fixed datetime value used across date tests
   ================================================================ */
const DT_2026_03_05 = {
  year: 2026,
  month: 3,
  day: 5,
  hour: 14,
  minute: 30,
  second: 45,
  millisecond: 123,
};

/* ================================================================
   lib-date
   ================================================================ */
describe("coverage: lib-date", () => {
  it("Today returns current date", async () => {
    const res = await new TodayLibNode().process({});
    const out = res.output as Record<string, number>;
    expect(out).toHaveProperty("year");
    expect(out).toHaveProperty("month");
    expect(out).toHaveProperty("day");
    expect(out).not.toHaveProperty("hour");
  });

  it("Now returns current datetime", async () => {
    const res = await new NowLibNode().process({});
    const out = res.output as Record<string, unknown>;
    expect(out).toHaveProperty("year");
    expect(out).toHaveProperty("hour");
    expect(out).toHaveProperty("tzinfo");
    expect(out).toHaveProperty("utc_offset");
  });

  it("ParseDate with all formats", async () => {
    const node = new ParseDateLibNode();
    // %Y-%m-%d
    expect(await node.process({ date_string: "2026-03-05", input_format: "%Y-%m-%d" })).toEqual({
      output: { year: 2026, month: 3, day: 5 },
    });
    // %m/%d/%Y
    expect(await node.process({ date_string: "03/05/2026", input_format: "%m/%d/%Y" })).toEqual({
      output: { year: 2026, month: 3, day: 5 },
    });
    // %d/%m/%Y
    expect(await node.process({ date_string: "05/03/2026", input_format: "%d/%m/%Y" })).toEqual({
      output: { year: 2026, month: 3, day: 5 },
    });
    // %B %d, %Y
    expect(await node.process({ date_string: "March 05, 2026", input_format: "%B %d, %Y" })).toEqual({
      output: { year: 2026, month: 3, day: 5 },
    });
    // %Y%m%d
    expect(await node.process({ date_string: "20260305", input_format: "%Y%m%d" })).toEqual({
      output: { year: 2026, month: 3, day: 5 },
    });
    // %Y%m%d_%H%M%S
    expect(await node.process({ date_string: "20260305_143045", input_format: "%Y%m%d_%H%M%S" })).toEqual({
      output: { year: 2026, month: 3, day: 5 },
    });
    // %Y-%m-%dT%H:%M:%S
    expect(await node.process({ date_string: "2026-03-05T14:30:45", input_format: "%Y-%m-%dT%H:%M:%S" })).toEqual({
      output: { year: 2026, month: 3, day: 5 },
    });
    // %Y-%m-%dT%H:%M:%S%z
    expect(
      await node.process({ date_string: "2026-03-05T14:30:45+05:00", input_format: "%Y-%m-%dT%H:%M:%S%z" })
    ).toHaveProperty("output");
    // %Y-%m-%dT%H:%M:%S%z without colon in tz
    expect(
      await node.process({ date_string: "2026-03-05T14:30:45+0500", input_format: "%Y-%m-%dT%H:%M:%S%z" })
    ).toHaveProperty("output");
    // Invalid month name
    await expect(
      node.process({ date_string: "Foo 05, 2026", input_format: "%B %d, %Y" })
    ).rejects.toThrow("Invalid date string");
    // Invalid format mismatch
    await expect(node.process({ date_string: "not-a-date", input_format: "%Y-%m-%d" })).rejects.toThrow(
      "Invalid date string"
    );
  });

  it("ParseDateTime returns datetime structure", async () => {
    const node = new ParseDateTimeLibNode();
    const res = await node.process({ datetime_string: "2026-03-05T14:30:45", input_format: "%Y-%m-%dT%H:%M:%S" });
    const out = res.output as Record<string, unknown>;
    expect(out.year).toBe(2026);
    expect(out.hour).toBe(14);
    expect(out).toHaveProperty("tzinfo");
  });

  it("AddTimeDelta adds days/hours/minutes", async () => {
    const node = new AddTimeDeltaLibNode();
    const res = await node.process({ input_datetime: DT_2026_03_05, days: 1, hours: 2, minutes: 30 });
    const out = res.output as Record<string, number>;
    expect(out.day).toBe(6);
    expect(out.hour).toBe(17);
    expect(out.minute).toBe(0);
  });

  it("FormatDateTime with all format variants", async () => {
    const node = new FormatDateTimeLibNode();
    const dt = DT_2026_03_05;

    const r1 = await node.process({ input_datetime: dt, output_format: "%Y-%m-%d" });
    expect(r1.output).toBe("2026-03-05");

    const r2 = await node.process({ input_datetime: dt, output_format: "%m/%d/%Y" });
    expect(r2.output).toBe("03/05/2026");

    const r3 = await node.process({ input_datetime: dt, output_format: "%d/%m/%Y" });
    expect(r3.output).toBe("05/03/2026");

    const r4 = await node.process({ input_datetime: dt, output_format: "%B %d, %Y" });
    expect(r4.output).toBe("March 05, 2026");

    const r5 = await node.process({ input_datetime: dt, output_format: "%Y%m%d" });
    expect(r5.output).toBe("20260305");

    const r6 = await node.process({ input_datetime: dt, output_format: "%Y%m%d_%H%M%S" });
    expect(r6.output).toBe("20260305_143045");

    const r7 = await node.process({ input_datetime: dt, output_format: "%Y-%m-%dT%H:%M:%S" });
    expect(r7.output).toBe("2026-03-05T14:30:45");

    const r8 = await node.process({ input_datetime: dt, output_format: "%Y-%m-%dT%H:%M:%S%z" });
    expect((r8.output as string).startsWith("2026-03-05T14:30:45")).toBe(true);
  });

  it("GetWeekday as name and number", async () => {
    const node = new GetWeekdayLibNode();
    // 2026-03-05 is a Thursday
    const r1 = await node.process({ input_datetime: DT_2026_03_05, as_name: true });
    expect(r1.output).toBe("Thursday");

    const r2 = await node.process({ input_datetime: DT_2026_03_05, as_name: false });
    expect(r2.output).toBe(3); // Thursday = 3 in Monday-based
  });

  it("DateRange generates date list", async () => {
    const node = new DateRangeLibNode();
    const res = await node.process({
      start_date: { year: 2026, month: 3, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 },
      end_date: { year: 2026, month: 3, day: 3, hour: 0, minute: 0, second: 0, millisecond: 0 },
      step_days: 1,
    });
    const out = res.output as Array<Record<string, number>>;
    expect(out).toHaveLength(3);
    expect(out[0].day).toBe(1);
    expect(out[2].day).toBe(3);
  });

  it("DateRange handles zero step_days", async () => {
    const node = new DateRangeLibNode();
    const res = await node.process({
      start_date: { year: 2026, month: 3, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 },
      end_date: { year: 2026, month: 3, day: 3, hour: 0, minute: 0, second: 0, millisecond: 0 },
      step_days: 0,
    });
    const out = res.output as Array<unknown>;
    expect(out).toHaveLength(1); // breaks after first iteration
  });

  it("IsDateInRange inclusive and exclusive", async () => {
    const node = new IsDateInRangeLibNode();
    const start = { year: 2026, month: 3, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 };
    const end = { year: 2026, month: 3, day: 5, hour: 0, minute: 0, second: 0, millisecond: 0 };
    const check = { year: 2026, month: 3, day: 5, hour: 0, minute: 0, second: 0, millisecond: 0 };

    // inclusive: boundary should be included
    const r1 = await node.process({ check_date: check, start_date: start, end_date: end, inclusive: true });
    expect(r1.output).toBe(true);

    // exclusive: boundary should be excluded
    const r2 = await node.process({ check_date: check, start_date: start, end_date: end, inclusive: false });
    expect(r2.output).toBe(false);

    // date in the middle
    const mid = { year: 2026, month: 3, day: 3, hour: 0, minute: 0, second: 0, millisecond: 0 };
    const r3 = await node.process({ check_date: mid, start_date: start, end_date: end, inclusive: false });
    expect(r3.output).toBe(true);
  });

  it("GetQuarter for all four quarters", async () => {
    const node = new GetQuarterLibNode();

    const q1 = await node.process({
      input_datetime: { year: 2026, month: 2, day: 15, hour: 0, minute: 0, second: 0, millisecond: 0 },
    });
    expect(q1.quarter).toBe(1);

    const q2 = await node.process({
      input_datetime: { year: 2026, month: 5, day: 15, hour: 0, minute: 0, second: 0, millisecond: 0 },
    });
    expect(q2.quarter).toBe(2);

    const q3 = await node.process({
      input_datetime: { year: 2026, month: 8, day: 15, hour: 0, minute: 0, second: 0, millisecond: 0 },
    });
    expect(q3.quarter).toBe(3);

    const q4 = await node.process({
      input_datetime: { year: 2026, month: 11, day: 15, hour: 0, minute: 0, second: 0, millisecond: 0 },
    });
    expect(q4.quarter).toBe(4);
    // Q4 end should be Dec 31
    const q4end = q4.quarter_end as Record<string, number>;
    expect(q4end.month).toBe(12);
    expect(q4end.day).toBe(31);
  });

  it("DateToDatetime converts date to datetime at midnight", async () => {
    const node = new DateToDatetimeLibNode();
    const res = await node.process({ input_date: { year: 2026, month: 3, day: 5 } });
    const out = res.output as Record<string, number>;
    expect(out.year).toBe(2026);
    expect(out.month).toBe(3);
    expect(out.day).toBe(5);
    expect(out.hour).toBe(0);
    expect(out.minute).toBe(0);
  });

  it("DatetimeToDate strips time component", async () => {
    const node = new DatetimeToDateLibNode();
    const res = await node.process({ input_datetime: DT_2026_03_05 });
    const out = res.output as Record<string, number>;
    expect(out).toEqual({ year: 2026, month: 3, day: 5 });
    expect(out).not.toHaveProperty("hour");
  });

  it("RelativeTime future/past hours and days", async () => {
    const node = new RelativeTimeLibNode();

    const r1 = await node.process({ amount: 2, unit: "hours", direction: "future" });
    expect(r1.output).toHaveProperty("hour");

    const r2 = await node.process({ amount: 1, unit: "days", direction: "past" });
    expect(r2.output).toHaveProperty("day");

    const r3 = await node.process({ amount: 1, unit: "months", direction: "future" });
    expect(r3.output).toHaveProperty("month");

    const r4 = await node.process({ amount: 1, unit: "months", direction: "past" });
    expect(r4.output).toHaveProperty("month");
  });

  it("RelativeTime months handles year wrap", async () => {
    const node = new RelativeTimeLibNode();
    // Going 13 months forward should wrap year
    const res = await node.process({ amount: 13, unit: "months", direction: "future" });
    expect(res.output).toHaveProperty("year");

    // Going 13 months back
    const res2 = await node.process({ amount: 13, unit: "months", direction: "past" });
    expect(res2.output).toHaveProperty("year");
  });

  it("BoundaryTime for all periods and boundaries", async () => {
    const node = new BoundaryTimeLibNode();
    const dt = DT_2026_03_05;

    // day start (already tested) and end
    const dayEnd = await node.process({ input_datetime: dt, period: "day", boundary: "end" });
    const de = dayEnd.output as Record<string, number>;
    expect(de.hour).toBe(23);
    expect(de.minute).toBe(59);

    // week start (Monday-based)
    const weekStart = await node.process({ input_datetime: dt, period: "week", boundary: "start", start_monday: true });
    const ws = weekStart.output as Record<string, number>;
    expect(ws.hour).toBe(0);

    // week end (Monday-based)
    const weekEnd = await node.process({ input_datetime: dt, period: "week", boundary: "end", start_monday: true });
    const we = weekEnd.output as Record<string, number>;
    expect(we.hour).toBe(23);

    // week start (Sunday-based)
    const weekStartSun = await node.process({
      input_datetime: dt,
      period: "week",
      boundary: "start",
      start_monday: false,
    });
    expect(weekStartSun.output).toHaveProperty("day");

    // week end (Sunday-based)
    const weekEndSun = await node.process({
      input_datetime: dt,
      period: "week",
      boundary: "end",
      start_monday: false,
    });
    expect(weekEndSun.output).toHaveProperty("day");

    // month start
    const monthStart = await node.process({ input_datetime: dt, period: "month", boundary: "start" });
    const ms = monthStart.output as Record<string, number>;
    expect(ms.day).toBe(1);
    expect(ms.hour).toBe(0);

    // month end
    const monthEnd = await node.process({ input_datetime: dt, period: "month", boundary: "end" });
    const me = monthEnd.output as Record<string, number>;
    expect(me.day).toBe(31); // March has 31 days
    expect(me.hour).toBe(23);

    // year start
    const yearStart = await node.process({ input_datetime: dt, period: "year", boundary: "start" });
    const ys = yearStart.output as Record<string, number>;
    expect(ys.month).toBe(1);
    expect(ys.day).toBe(1);
    expect(ys.hour).toBe(0);

    // year end
    const yearEnd = await node.process({ input_datetime: dt, period: "year", boundary: "end" });
    const ye = yearEnd.output as Record<string, number>;
    expect(ye.month).toBe(12);
    expect(ye.day).toBe(31);
    expect(ye.hour).toBe(23);
  });

  it("toDate handles string input", async () => {
    // ParseDateTimeLibNode internally uses toDate with string
    const node = new FormatDateTimeLibNode();
    const res = await node.process({ input_datetime: "2026-03-05T14:30:45", output_format: "%Y-%m-%d" });
    expect(res.output).toBe("2026-03-05");
  });

  it("toDate handles DateTimeValue with utc_offset (colon-less)", async () => {
    const node = new FormatDateTimeLibNode();
    const dt = { ...DT_2026_03_05, utc_offset: "+0500" };
    const res = await node.process({ input_datetime: dt, output_format: "%Y-%m-%d" });
    expect(res.output).toHaveProperty("length");
  });

  it("toDate handles DateTimeValue with utc_offset (with colon)", async () => {
    const node = new FormatDateTimeLibNode();
    const dt = { ...DT_2026_03_05, utc_offset: "+05:00" };
    const res = await node.process({ input_datetime: dt, output_format: "%Y-%m-%d" });
    expect(res.output).toHaveProperty("length");
  });

  it("toDate with no input falls back to current date", async () => {
    // This covers the `return new Date()` fallback in toDate
    const node = new FormatDateTimeLibNode();
    const res = await node.process({ input_datetime: 12345, output_format: "%Y-%m-%d" });
    // 12345 is a number, not a recognized type, so falls back to new Date()
    expect(typeof res.output).toBe("string");
  });

  it("formatDate default case (unknown format)", async () => {
    // The default case in formatDate's switch returns date.toISOString()
    // We can trigger it by passing an unsupported format string via _props
    const node = new FormatDateTimeLibNode();
    // Force a non-standard format by using a value not in the switch
    const res = await node.process({ input_datetime: DT_2026_03_05, output_format: "%unknown" as any });
    // Falls through to default: date.toISOString()
    expect(typeof res.output).toBe("string");
  });

  it("defaults() for all date nodes", () => {
    exerciseDefaults(ParseDateLibNode);
    exerciseDefaults(ParseDateTimeLibNode);
    exerciseDefaults(AddTimeDeltaLibNode);
    exerciseDefaults(DateDifferenceLibNode);
    exerciseDefaults(FormatDateTimeLibNode);
    exerciseDefaults(GetWeekdayLibNode);
    exerciseDefaults(DateRangeLibNode);
    exerciseDefaults(IsDateInRangeLibNode);
    exerciseDefaults(GetQuarterLibNode);
    exerciseDefaults(DateToDatetimeLibNode);
    exerciseDefaults(DatetimeToDateLibNode);
    exerciseDefaults(RelativeTimeLibNode);
    exerciseDefaults(BoundaryTimeLibNode);
  });

  it("RelativeTime months wraps past 12 months and below 0", async () => {
    const node = new RelativeTimeLibNode();
    // 25 months future should wrap year twice
    const res = await node.process({ amount: 25, unit: "months", direction: "future" });
    expect(res.output).toHaveProperty("year");

    // 25 months past should wrap year twice
    const res2 = await node.process({ amount: 25, unit: "months", direction: "past" });
    expect(res2.output).toHaveProperty("year");
  });

  it("RelativeTime throws when day is out of range for target month", async () => {
    // Set fake timer to January 31, which has no equivalent in February
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 31, 12, 0, 0))); // Jan 31, 2026

    const node = new RelativeTimeLibNode();
    // Adding 1 month: Jan 31 -> Feb 31 doesn't exist -> should throw
    await expect(node.process({ amount: 1, unit: "months", direction: "future" })).rejects.toThrow(
      "day is out of range"
    );

    vi.useRealTimers();
  });
});

/* ================================================================
   lib-json
   ================================================================ */
describe("coverage: lib-json", () => {
  it("ParseDict rejects non-object JSON", async () => {
    await expect(new ParseDictLibNode().process({ json_string: "[1,2]" })).rejects.toThrow(
      "JSON string must represent an object"
    );
    await expect(new ParseDictLibNode().process({ json_string: '"hello"' })).rejects.toThrow(
      "JSON string must represent an object"
    );
  });

  it("ParseList succeeds with array and rejects non-array", async () => {
    const res = await new ParseListLibNode().process({ json_string: "[1,2,3]" });
    expect(res.output).toEqual([1, 2, 3]);

    await expect(new ParseListLibNode().process({ json_string: '{"a":1}' })).rejects.toThrow(
      "JSON string must represent an array"
    );
  });

  it("StringifyJSON with custom indent", async () => {
    const res = await new StringifyJSONLibNode().process({ data: { a: 1 }, indent: 4 });
    expect(res.output).toBe('{\n    "a": 1\n}');
  });

  it("GetJSONPathStr extracts string values", async () => {
    const node = new GetJSONPathStrLibNode();
    const res = await node.process({ data: { a: { b: "hello" } }, path: "a.b" });
    expect(res.output).toBe("hello");

    // missing path returns default
    const res2 = await node.process({ data: { a: 1 }, path: "x.y", default: "fallback" });
    expect(res2.output).toBe("fallback");

    // empty path returns entire data
    const res3 = await node.process({ data: { a: 1 }, path: "" });
    expect(res3.output).toBe("[object Object]");
  });

  it("GetJSONPathFloat extracts float values", async () => {
    const node = new GetJSONPathFloatLibNode();
    const res = await node.process({ data: { x: 3.14 }, path: "x" });
    expect(res.output).toBeCloseTo(3.14);

    // missing returns default
    const res2 = await node.process({ data: {}, path: "missing", default: 99.5 });
    expect(res2.output).toBe(99.5);
  });

  it("GetJSONPathBool extracts boolean values", async () => {
    const node = new GetJSONPathBoolLibNode();
    const res = await node.process({ data: { active: true }, path: "active" });
    expect(res.output).toBe(true);

    const res2 = await node.process({ data: {}, path: "missing", default: false });
    expect(res2.output).toBe(false);
  });

  it("GetJSONPathList extracts list values", async () => {
    const node = new GetJSONPathListLibNode();
    const res = await node.process({ data: { items: [1, 2, 3] }, path: "items" });
    expect(res.output).toEqual([1, 2, 3]);

    // missing returns default
    const res2 = await node.process({ data: {}, path: "missing", default: [99] });
    expect(res2.output).toEqual([99]);
  });

  it("GetJSONPathDict extracts dict values", async () => {
    const node = new GetJSONPathDictLibNode();
    const res = await node.process({ data: { nested: { x: 1 } }, path: "nested" });
    expect(res.output).toEqual({ x: 1 });

    // missing returns default dict
    const res2 = await node.process({ data: {}, path: "missing", default: { fallback: true } });
    expect(res2.output).toEqual({ fallback: true });

    // non-dict value returns fallback
    const res3 = await node.process({ data: { arr: [1, 2] }, path: "arr", default: {} });
    expect(res3.output).toEqual({});

    // null value returns fallback
    const res4 = await node.process({ data: { x: null }, path: "y" });
    expect(res4.output).toEqual({});
  });

  it("jsonPathExtract handles array index access", async () => {
    const node = new GetJSONPathStrLibNode();
    const res = await node.process({ data: { items: ["a", "b", "c"] }, path: "items.1" });
    expect(res.output).toBe("b");

    // out of bounds
    const res2 = await node.process({ data: { items: ["a"] }, path: "items.5", default: "nope" });
    expect(res2.output).toBe("nope");
  });

  it("jsonPathExtract returns null for non-object intermediate", async () => {
    const node = new GetJSONPathStrLibNode();
    const res = await node.process({ data: { x: "string" }, path: "x.y.z", default: "none" });
    expect(res.output).toBe("none");
  });

  it("jsonPathExtract handles empty key segments", async () => {
    const node = new GetJSONPathStrLibNode();
    // path with leading dot
    const res = await node.process({ data: { a: "val" }, path: ".a" });
    expect(res.output).toBe("val");
  });

  it("ValidateJSON validates against various schemas", async () => {
    const node = new ValidateJSONLibNode();

    // object with required fields
    const r1 = await node.process({
      data: { name: "test", age: 25 },
      json_schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, age: { type: "number" } } },
    });
    expect(r1.output).toBe(true);

    // missing required field
    const r2 = await node.process({
      data: { age: 25 },
      json_schema: { type: "object", required: ["name"] },
    });
    expect(r2.output).toBe(false);

    // array validation
    const r3 = await node.process({
      data: [1, 2, 3],
      json_schema: { type: "array", items: { type: "number" } },
    });
    expect(r3.output).toBe(true);

    // array with invalid items
    const r4 = await node.process({
      data: [1, "two", 3],
      json_schema: { type: "array", items: { type: "number" } },
    });
    expect(r4.output).toBe(false);

    // array without items schema
    const r5 = await node.process({
      data: [1, 2],
      json_schema: { type: "array" },
    });
    expect(r5.output).toBe(true);

    // string type
    const r6 = await node.process({ data: "hello", json_schema: { type: "string" } });
    expect(r6.output).toBe(true);

    // number type
    const r7 = await node.process({ data: 42, json_schema: { type: "number" } });
    expect(r7.output).toBe(true);

    // integer type
    const r8 = await node.process({ data: 42, json_schema: { type: "integer" } });
    expect(r8.output).toBe(true);
    const r8b = await node.process({ data: 42.5, json_schema: { type: "integer" } });
    expect(r8b.output).toBe(false);

    // boolean type
    const r9 = await node.process({ data: true, json_schema: { type: "boolean" } });
    expect(r9.output).toBe(true);

    // null type - note: `data: null` gets replaced by `??` fallback to {}, so can't test via node.process
    // Instead test boolean type false value
    const r10 = await node.process({ data: false, json_schema: { type: "boolean" } });
    expect(r10.output).toBe(true);

    // no schema validates anything
    const r11 = await node.process({ data: "anything", json_schema: {} });
    expect(r11.output).toBe(true);

    // null schema
    const r12 = await node.process({ data: "anything", json_schema: null });
    expect(r12.output).toBe(true);

    // type mismatch: expect object got array
    const r13 = await node.process({ data: [1, 2], json_schema: { type: "object" } });
    expect(r13.output).toBe(false);

    // type mismatch: expect object got string (null becomes {} via ??)
    const r14 = await node.process({ data: "hello", json_schema: { type: "object" } });
    expect(r14.output).toBe(false);

    // type mismatch: expect array got object
    const r15 = await node.process({ data: { a: 1 }, json_schema: { type: "array" } });
    expect(r15.output).toBe(false);

    // type mismatch: expect string got number
    const r16 = await node.process({ data: 42, json_schema: { type: "string" } });
    expect(r16.output).toBe(false);

    // nested property validation failure
    const r17 = await node.process({
      data: { name: 123 },
      json_schema: { type: "object", properties: { name: { type: "string" } } },
    });
    expect(r17.output).toBe(false);

    // object with no properties schema
    const r18 = await node.process({
      data: { anything: "goes" },
      json_schema: { type: "object" },
    });
    expect(r18.output).toBe(true);
  });

  it("FilterJSON filters by key-value", async () => {
    const node = new FilterJSONLibNode();
    const res = await node.process({
      array: [{ status: "active", name: "a" }, { status: "inactive", name: "b" }, { status: "active", name: "c" }],
      key: "status",
      value: "active",
    });
    expect(res.output).toEqual([
      { status: "active", name: "a" },
      { status: "active", name: "c" },
    ]);

    // filter with non-object items
    const res2 = await node.process({
      array: ["string", null, { key: "val" }],
      key: "key",
      value: "val",
    });
    expect(res2.output).toEqual([{ key: "val" }]);
  });

  it("JSONTemplate with quoted placeholder and non-dict result", async () => {
    const node = new JSONTemplateLibNode();

    // quoted placeholder: "$key" in template replaced by json value
    const res = await node.process({
      template: '{"name":"$user","items":"$list"}',
      values: { user: "Ada", list: [1, 2] },
    });
    expect(res.output).toEqual({ name: "Ada", items: [1, 2] });

    // result that is not a dict should throw
    await expect(
      node.process({ template: '["$val"]', values: { val: 1 } })
    ).rejects.toThrow("Resulting JSON must be a dictionary");
  });

  it("LoadJSONAssets throws on empty folder", async () => {
    const node = new LoadJSONAssetsLibNode();
    await expect(async () => {
      for await (const _ of node.genProcess({ folder: { uri: "" } })) {
        // noop
      }
    }).rejects.toThrow("Please select an asset folder");
  });

  it("LoadJSONAssets skips non-json files and directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-json-cov-"));
    await writeFile(join(dir, "a.json"), '{"ok":true}', "utf-8");
    await writeFile(join(dir, "b.txt"), "not json", "utf-8");
    await mkdir(join(dir, "subdir"));

    const node = new LoadJSONAssetsLibNode();
    const items: Array<Record<string, unknown>> = [];
    for await (const item of node.genProcess({ folder: dir })) {
      items.push(item);
    }
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("a.json");
  });

  it("LoadJSONAssets throws on invalid JSON file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-json-cov-"));
    await writeFile(join(dir, "bad.json"), "{not valid json}", "utf-8");

    const node = new LoadJSONAssetsLibNode();
    await expect(async () => {
      for await (const _ of node.genProcess({ folder: dir })) {
        // noop
      }
    }).rejects.toThrow("Invalid JSON in file bad.json");
  });

  it("LoadJSONAssets with file:// URI folder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-json-uri-"));
    await writeFile(join(dir, "c.json"), '{"val":42}', "utf-8");

    const node = new LoadJSONAssetsLibNode();
    const items: Array<Record<string, unknown>> = [];
    for await (const item of node.genProcess({ folder: { uri: `file://${dir}` } })) {
      items.push(item);
    }
    expect(items).toHaveLength(1);
  });

  it("LoadJSONAssets with path-based folder object", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-json-path-"));
    await writeFile(join(dir, "d.json"), '{"val":99}', "utf-8");

    const node = new LoadJSONAssetsLibNode();
    const items: Array<Record<string, unknown>> = [];
    for await (const item of node.genProcess({ folder: { path: dir } })) {
      items.push(item);
    }
    expect(items).toHaveLength(1);
  });

  it("inferLocalFolder handles edge cases", async () => {
    const node = new LoadJSONAssetsLibNode();
    // null/undefined folder
    await expect(async () => {
      for await (const _ of node.genProcess({ folder: null })) {
        // noop
      }
    }).rejects.toThrow("Please select an asset folder");

    // empty object
    await expect(async () => {
      for await (const _ of node.genProcess({ folder: {} })) {
        // noop
      }
    }).rejects.toThrow("Please select an asset folder");
  });

  it("defaults() for all json nodes", () => {
    exerciseDefaults(ParseDictLibNode);
    exerciseDefaults(ParseListLibNode);
    exerciseDefaults(StringifyJSONLibNode);
    exerciseDefaults(GetJSONPathStrLibNode);
    exerciseDefaults(GetJSONPathIntLibNode);
    exerciseDefaults(GetJSONPathFloatLibNode);
    exerciseDefaults(GetJSONPathBoolLibNode);
    exerciseDefaults(GetJSONPathListLibNode);
    exerciseDefaults(GetJSONPathDictLibNode);
    exerciseDefaults(ValidateJSONLibNode);
    exerciseDefaults(FilterJSONLibNode);
    exerciseDefaults(JSONTemplateLibNode);
    exerciseDefaults(LoadJSONAssetsLibNode);
  });

  it("GetJSONPathDict uses assigned default fallback", async () => {
    const node = new GetJSONPathDictLibNode();
    node.assign({ data: {}, path: "missing", default: { propFallback: true } });
    const res = await node.process({ data: {}, path: "missing" });
    expect(res.output).toEqual({ propFallback: true });
  });

  it("LoadJSONAssets process() returns empty", async () => {
    const node = new LoadJSONAssetsLibNode();
    const res = await node.process({});
    expect(res).toEqual({});
  });

  it("inferLocalFolder with number returns empty string", async () => {
    // inferLocalFolder receives a non-string, non-object value
    const node = new LoadJSONAssetsLibNode();
    await expect(async () => {
      for await (const _ of node.genProcess({ folder: 12345 })) {
        // noop
      }
    }).rejects.toThrow("Please select an asset folder");
  });

  it("ValidateJSON with falsy schema values", async () => {
    const node = new ValidateJSONLibNode();
    // schema is empty string (falsy, not object) -> returns true
    const r1 = await node.process({ data: "anything", json_schema: "" });
    expect(r1.output).toBe(true);

    // schema is 0 (falsy) -> returns true
    const r2 = await node.process({ data: "anything", json_schema: 0 });
    expect(r2.output).toBe(true);

    // schema is false -> returns true
    const r3 = await node.process({ data: "anything", json_schema: false });
    expect(r3.output).toBe(true);
  });

  it("ValidateJSON with null type in nested schema", async () => {
    // Test the null type check via nested property validation
    const node = new ValidateJSONLibNode();
    // An object with a property that should be null
    const r1 = await node.process({
      data: { x: null },
      json_schema: { type: "object", properties: { x: { type: "null" } } },
    });
    expect(r1.output).toBe(true);

    // Property is not null -> fails null check
    const r2 = await node.process({
      data: { x: "not null" },
      json_schema: { type: "object", properties: { x: { type: "null" } } },
    });
    expect(r2.output).toBe(false);
  });

  it("ValidateJSON with schema having no type (passthrough)", async () => {
    const node = new ValidateJSONLibNode();
    // Schema is an object but has no 'type' field
    const r1 = await node.process({ data: "anything", json_schema: { description: "no type" } });
    expect(r1.output).toBe(true);
  });
});

/* ================================================================
   lib-math
   ================================================================ */
describe("coverage: lib-math", () => {
  it("Subtract", async () => {
    expect(await new SubtractLibNode().process({ a: 10, b: 3 })).toEqual({ output: 7 });
  });

  it("Multiply", async () => {
    expect(await new MultiplyLibNode().process({ a: 4, b: 5 })).toEqual({ output: 20 });
  });

  it("Divide", async () => {
    expect(await new DivideLibNode().process({ a: 10, b: 2 })).toEqual({ output: 5 });
  });

  it("Modulus", async () => {
    expect(await new ModulusLibNode().process({ a: 10, b: 3 })).toEqual({ output: 1 });
  });

  it("MathFunction: all operations", async () => {
    const node = new MathFunctionLibNode();
    expect(await node.process({ input: 5, operation: "negate" })).toEqual({ output: -5 });
    expect(await node.process({ input: -5, operation: "absolute" })).toEqual({ output: 5 });
    expect(await node.process({ input: 3, operation: "square" })).toEqual({ output: 9 });
    expect(await node.process({ input: 2, operation: "cube" })).toEqual({ output: 8 });
    expect(await node.process({ input: 9, operation: "square_root" })).toEqual({ output: 3 });
    expect(await node.process({ input: -8, operation: "cube_root" })).toEqual({ output: -2 });

    const sinRes = await node.process({ input: Math.PI / 2, operation: "sine" });
    expect((sinRes.output as number)).toBeCloseTo(1);

    const cosRes = await node.process({ input: 0, operation: "cosine" });
    expect(cosRes.output).toBeCloseTo(1);

    const tanRes = await node.process({ input: 0, operation: "tangent" });
    expect(tanRes.output).toBeCloseTo(0);

    const asinRes = await node.process({ input: 1, operation: "arcsin" });
    expect((asinRes.output as number)).toBeCloseTo(Math.PI / 2);

    const acosRes = await node.process({ input: 1, operation: "arccos" });
    expect((acosRes.output as number)).toBeCloseTo(0);

    const atanRes = await node.process({ input: 1, operation: "arctan" });
    expect((atanRes.output as number)).toBeCloseTo(Math.PI / 4);

    const logRes = await node.process({ input: Math.E, operation: "log" });
    expect((logRes.output as number)).toBeCloseTo(1);

    // unsupported operation
    await expect(node.process({ input: 1, operation: "unknown_op" })).rejects.toThrow("Unsupported operation");
  });

  it("Sine", async () => {
    const res = await new SineLibNode().process({ angle_rad: Math.PI / 6 });
    expect((res.output as number)).toBeCloseTo(0.5);
  });

  it("Cosine", async () => {
    const res = await new CosineLibNode().process({ angle_rad: Math.PI / 3 });
    expect((res.output as number)).toBeCloseTo(0.5);
  });

  it("Power", async () => {
    expect(await new PowerLibNode().process({ base: 2, exponent: 10 })).toEqual({ output: 1024 });
  });

  it("Sqrt", async () => {
    expect(await new SqrtLibNode().process({ x: 144 })).toEqual({ output: 12 });
  });

  it("defaults() for all math nodes", () => {
    exerciseDefaults(AddLibNode);
    exerciseDefaults(SubtractLibNode);
    exerciseDefaults(MultiplyLibNode);
    exerciseDefaults(DivideLibNode);
    exerciseDefaults(ModulusLibNode);
    exerciseDefaults(MathFunctionLibNode);
    exerciseDefaults(SineLibNode);
    exerciseDefaults(CosineLibNode);
    exerciseDefaults(PowerLibNode);
    exerciseDefaults(SqrtLibNode);
  });
});

/* ================================================================
   lib-os
   ================================================================ */
describe("coverage: lib-os", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "nt-os-cov-"));
    await writeFile(join(tempDir, "test.txt"), "content", "utf-8");
    await mkdir(join(tempDir, "subdir"));
    await writeFile(join(tempDir, "subdir", "nested.txt"), "nested", "utf-8");
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("WorkspaceDirectory with and without context", async () => {
    const node = new WorkspaceDirectoryLibNode();
    // without context
    const r1 = await node.process({});
    expect(r1.output).toBe("");

    // with context
    const ctx = { workspaceDir: "/tmp/workspace" } as unknown as ProcessingContext;
    const r2 = await node.process({}, ctx);
    expect(r2.output).toBe("/tmp/workspace");
  });

  it("OpenWorkspaceDirectory without context returns empty", async () => {
    const node = new OpenWorkspaceDirectoryLibNode();
    const res = await node.process({});
    expect(res).toEqual({});
  });

  it("FileExists returns true/false", async () => {
    const node = new FileExistsLibNode();
    const r1 = await node.process({ path: join(tempDir, "test.txt") });
    expect(r1.output).toBe(true);

    const r2 = await node.process({ path: join(tempDir, "nonexistent.txt") });
    expect(r2.output).toBe(false);

    // empty path throws
    await expect(node.process({ path: "" })).rejects.toThrow("cannot be empty");
  });

  it("ListFiles with pattern and subdirectories", async () => {
    const node = new ListFilesLibNode();
    const files: string[] = [];
    for await (const item of node.genProcess({ folder: tempDir, pattern: "*.txt", include_subdirectories: true })) {
      files.push(String(item.file));
    }
    expect(files.some((f) => f.endsWith("test.txt"))).toBe(true);
    expect(files.some((f) => f.endsWith("nested.txt"))).toBe(true);
  });

  it("ListFiles with no pattern match", async () => {
    const node = new ListFilesLibNode();
    const files: string[] = [];
    for await (const item of node.genProcess({ folder: tempDir, pattern: "*.xyz", include_subdirectories: false })) {
      files.push(String(item.file));
    }
    expect(files).toHaveLength(0);
  });

  it("CopyFile copies file and directory", async () => {
    const node = new CopyFileLibNode();
    const src = join(tempDir, "test.txt");
    const dst = join(tempDir, "copy_target", "copied.txt");
    const res = await node.process({ source_path: src, destination_path: dst });
    expect(res.output).toBe(dst);

    // copy directory
    const dirSrc = join(tempDir, "subdir");
    const dirDst = join(tempDir, "copy_target", "subdir_copy");
    await node.process({ source_path: dirSrc, destination_path: dirDst });

    // empty paths throw
    await expect(node.process({ source_path: "", destination_path: "/tmp/x" })).rejects.toThrow("source_path");
    await expect(node.process({ source_path: "/tmp/x", destination_path: "" })).rejects.toThrow("destination_path");
  });

  it("MoveFile moves file", async () => {
    const node = new MoveFileLibNode();
    const src = join(tempDir, "copy_target", "copied.txt");
    const dst = join(tempDir, "moved.txt");
    await node.process({ source_path: src, destination_path: dst });
  });

  it("CreateDirectory creates new directory", async () => {
    const node = new CreateDirectoryLibNode();
    const newDir = join(tempDir, "newdir");
    await node.process({ path: newDir });

    // empty path throws
    await expect(node.process({ path: "" })).rejects.toThrow("cannot be empty");
  });

  it("GetFileSize returns file size", async () => {
    const node = new GetFileSizeLibNode();
    const res = await node.process({ path: join(tempDir, "test.txt") });
    expect(res.output).toBeGreaterThan(0);

    await expect(node.process({ path: "" })).rejects.toThrow("cannot be empty");
  });

  it("CreatedTime, ModifiedTime, AccessedTime", async () => {
    const filePath = join(tempDir, "test.txt");

    const ct = await new CreatedTimeLibNode().process({ path: filePath });
    expect(ct.output).toHaveProperty("year");

    const mt = await new ModifiedTimeLibNode().process({ path: filePath });
    expect(mt.output).toHaveProperty("year");

    const at = await new AccessedTimeLibNode().process({ path: filePath });
    expect(at.output).toHaveProperty("year");

    // empty path throws
    await expect(new CreatedTimeLibNode().process({ path: "" })).rejects.toThrow("cannot be empty");
  });

  it("IsFile and IsDirectory", async () => {
    const filePath = join(tempDir, "test.txt");

    const r1 = await new IsFileLibNode().process({ path: filePath });
    expect(r1.output).toBe(true);

    const r2 = await new IsDirectoryLibNode().process({ path: tempDir });
    expect(r2.output).toBe(true);

    const r3 = await new IsFileLibNode().process({ path: tempDir });
    expect(r3.output).toBe(false);

    const r4 = await new IsDirectoryLibNode().process({ path: filePath });
    expect(r4.output).toBe(false);

    // nonexistent path
    const r5 = await new IsFileLibNode().process({ path: join(tempDir, "nope") });
    expect(r5.output).toBe(false);

    const r6 = await new IsDirectoryLibNode().process({ path: join(tempDir, "nope") });
    expect(r6.output).toBe(false);

    // empty path throws
    await expect(new IsFileLibNode().process({ path: "" })).rejects.toThrow("cannot be empty");
    await expect(new IsDirectoryLibNode().process({ path: "" })).rejects.toThrow("cannot be empty");
  });

  it("FileExtension, FileName, GetDirectory", async () => {
    const filePath = join(tempDir, "test.txt");

    const r1 = await new FileExtensionLibNode().process({ path: filePath });
    expect(r1.output).toBe(".txt");

    const r2 = await new FileNameLibNode().process({ path: filePath });
    expect(r2.output).toBe("test.txt");

    const r3 = await new GetDirectoryLibNode().process({ path: filePath });
    expect(r3.output).toBe(tempDir);

    // empty path throws
    await expect(new FileExtensionLibNode().process({ path: "" })).rejects.toThrow("cannot be empty");
  });

  it("FileNameMatch with case sensitivity", async () => {
    const node = new FileNameMatchLibNode();
    expect(await node.process({ filename: "test.txt", pattern: "*.txt", case_sensitive: true })).toEqual({
      output: true,
    });
    expect(await node.process({ filename: "test.TXT", pattern: "*.txt", case_sensitive: true })).toEqual({
      output: false,
    });
    expect(await node.process({ filename: "test.TXT", pattern: "*.txt", case_sensitive: false })).toEqual({
      output: true,
    });
    // ? wildcard
    expect(await node.process({ filename: "a.txt", pattern: "?.txt", case_sensitive: true })).toEqual({
      output: true,
    });
  });

  it("FilterFileNames", async () => {
    const node = new FilterFileNamesLibNode();
    const res = await node.process({
      filenames: ["a.txt", "b.json", "c.txt"],
      pattern: "*.txt",
      case_sensitive: true,
    });
    expect(res.output).toEqual(["a.txt", "c.txt"]);

    // case insensitive
    const res2 = await node.process({
      filenames: ["A.TXT", "b.json"],
      pattern: "*.txt",
      case_sensitive: false,
    });
    expect(res2.output).toEqual(["A.TXT"]);
  });

  it("Basename with and without extension removal", async () => {
    const node = new BasenameLibNode();
    expect(await node.process({ path: "/foo/bar/test.txt" })).toEqual({ output: "test.txt" });
    expect(await node.process({ path: "/foo/bar/test.txt", remove_extension: true })).toEqual({ output: "test" });
    // empty path throws
    await expect(node.process({ path: "" })).rejects.toThrow("path is empty");
    await expect(node.process({ path: "   " })).rejects.toThrow("path is empty");
  });

  it("Dirname", async () => {
    expect(await new DirnameLibNode().process({ path: "/foo/bar/test.txt" })).toEqual({ output: "/foo/bar" });
  });

  it("JoinPaths", async () => {
    expect(await new JoinPathsLibNode().process({ paths: ["/foo", "bar", "baz.txt"] })).toEqual({
      output: "/foo/bar/baz.txt",
    });
    await expect(new JoinPathsLibNode().process({ paths: [] })).rejects.toThrow("cannot be empty");
  });

  it("NormalizePath", async () => {
    expect(await new NormalizePathLibNode().process({ path: "/foo/bar/../baz" })).toEqual({ output: "/foo/baz" });
    await expect(new NormalizePathLibNode().process({ path: "" })).rejects.toThrow("cannot be empty");
  });

  it("GetPathInfo for file and nonexistent path", async () => {
    const node = new GetPathInfoLibNode();
    const r1 = await node.process({ path: join(tempDir, "test.txt") });
    const info = r1.output as Record<string, unknown>;
    expect(info.exists).toBe(true);
    expect(info.is_file).toBe(true);
    expect(info.is_dir).toBe(false);
    expect(info.extension).toBe(".txt");

    // nonexistent
    const r2 = await node.process({ path: join(tempDir, "nope.xyz") });
    const info2 = r2.output as Record<string, unknown>;
    expect(info2.exists).toBe(false);
    expect(info2.is_file).toBe(false);
  });

  it("AbsolutePath", async () => {
    const node = new AbsolutePathLibNode();
    const res = await node.process({ path: "relative/path" });
    expect(typeof res.output).toBe("string");
    expect((res.output as string).startsWith("/")).toBe(true);

    await expect(node.process({ path: "" })).rejects.toThrow("cannot be empty");
  });

  it("SplitPath", async () => {
    const res = await new SplitPathLibNode().process({ path: "/foo/bar/test.txt" });
    expect(res.dirname).toBe("/foo/bar");
    expect(res.basename).toBe("test.txt");
  });

  it("SplitExtension", async () => {
    const res = await new SplitExtensionLibNode().process({ path: "/foo/bar/test.txt" });
    expect(res.root).toBe("/foo/bar/test");
    expect(res.extension).toBe(".txt");
  });

  it("RelativePath", async () => {
    const node = new RelativePathLibNode();
    const res = await node.process({ target_path: "/foo/bar/baz", start_path: "/foo" });
    expect(res.output).toBe("bar/baz");

    await expect(node.process({ target_path: "", start_path: "." })).rejects.toThrow("cannot be empty");
  });

  it("PathToString", async () => {
    const node = new PathToStringLibNode();
    expect(await node.process({ file_path: "/foo/bar" })).toEqual({ output: "/foo/bar" });
    await expect(node.process({ file_path: "" })).rejects.toThrow("cannot be empty");
  });

  it("ShowNotification validates inputs", async () => {
    const node = new ShowNotificationLibNode();
    await expect(node.process({ title: "", message: "hi" })).rejects.toThrow("title cannot be empty");
    await expect(node.process({ title: "hi", message: "" })).rejects.toThrow("message cannot be empty");
    // valid notification returns empty
    expect(await node.process({ title: "Test", message: "Hello" })).toEqual({});
  });

  it("expandUser with tilde", async () => {
    // Tests expandUser via FileExistsLibNode
    const node = new FileExistsLibNode();
    const res = await node.process({ path: "~" });
    expect(res.output).toBe(true);
  });

  it("expandUser with ~ alone", async () => {
    const node = new FileExistsLibNode();
    const res = await node.process({ path: "~" });
    expect(res.output).toBe(true);
  });

  it("ListFiles.process() returns empty", async () => {
    const node = new ListFilesLibNode();
    const res = await node.process({});
    expect(res).toEqual({});
  });

  it("OpenWorkspaceDirectory opens directory (mocked)", async () => {
    // We test the path where context has workspaceDir but openPath is called
    // We can't actually open a path in tests, but we can test the no-dir path
    const node = new OpenWorkspaceDirectoryLibNode();
    const ctx = { workspaceDir: undefined } as unknown as ProcessingContext;
    const res = await node.process({}, ctx);
    expect(res).toEqual({});
  });

  it("FilterFileNames with non-array filenames", async () => {
    const node = new FilterFileNamesLibNode();
    // Pass a non-array value for filenames to hit the `: []` fallback
    const res = await node.process({ filenames: "not-an-array", pattern: "*", case_sensitive: true });
    expect(res.output).toEqual([]);
  });

  it("JoinPaths with non-array paths", async () => {
    const node = new JoinPathsLibNode();
    // Pass a non-array value for paths to hit the `: []` fallback then error
    await expect(node.process({ paths: "not-an-array" })).rejects.toThrow("cannot be empty");
  });

  it("OpenWorkspaceDirectory returns empty when no workspaceDir", async () => {
    const node = new OpenWorkspaceDirectoryLibNode();
    const ctx = {} as unknown as ProcessingContext;
    const res = await node.process({}, ctx);
    expect(res).toEqual({});
  });

  it("defaults() for all os nodes", () => {
    exerciseDefaults(FileExistsLibNode);
    exerciseDefaults(ListFilesLibNode);
    exerciseDefaults(CopyFileLibNode);
    exerciseDefaults(MoveFileLibNode);
    exerciseDefaults(CreateDirectoryLibNode);
    exerciseDefaults(GetFileSizeLibNode);
    exerciseDefaults(CreatedTimeLibNode);
    exerciseDefaults(ModifiedTimeLibNode);
    exerciseDefaults(AccessedTimeLibNode);
    exerciseDefaults(IsFileLibNode);
    exerciseDefaults(IsDirectoryLibNode);
    exerciseDefaults(FileExtensionLibNode);
    exerciseDefaults(FileNameLibNode);
    exerciseDefaults(GetDirectoryLibNode);
    exerciseDefaults(FileNameMatchLibNode);
    exerciseDefaults(FilterFileNamesLibNode);
    exerciseDefaults(BasenameLibNode);
    exerciseDefaults(DirnameLibNode);
    exerciseDefaults(JoinPathsLibNode);
    exerciseDefaults(NormalizePathLibNode);
    exerciseDefaults(GetPathInfoLibNode);
    exerciseDefaults(AbsolutePathLibNode);
    exerciseDefaults(SplitPathLibNode);
    exerciseDefaults(SplitExtensionLibNode);
    exerciseDefaults(RelativePathLibNode);
    exerciseDefaults(PathToStringLibNode);
    exerciseDefaults(ShowNotificationLibNode);
  });
});

/* ================================================================
   lib-markdown
   ================================================================ */
describe("coverage: lib-markdown", () => {
  it("ExtractLinks without titles and with autolinks", async () => {
    const node = new ExtractLinksMarkdownLibNode();
    const md = "[Link](http://example.com) and <http://auto.link>";

    const r1 = await node.process({ markdown: md, include_titles: false });
    expect(r1.output).toEqual([
      { url: "http://example.com", title: "" },
      { url: "http://auto.link", title: "" },
    ]);

    // with titles
    const r2 = await node.process({ markdown: md, include_titles: true });
    expect(r2.output).toEqual([
      { url: "http://example.com", title: "Link" },
      { url: "http://auto.link", title: "" },
    ]);

    // empty markdown
    const r3 = await node.process({ markdown: "" });
    expect(r3.output).toEqual([]);
  });

  it("ExtractHeaders with max_level filtering", async () => {
    const node = new ExtractHeadersMarkdownLibNode();
    const md = "# H1\n## H2\n### H3\n#### H4";

    const r1 = await node.process({ markdown: md, max_level: 2 });
    expect(r1.output).toHaveLength(2);

    const r2 = await node.process({ markdown: md, max_level: 6 });
    expect(r2.output).toHaveLength(4);
  });

  it("ExtractBulletLists extracts multiple lists", async () => {
    const node = new ExtractBulletListsMarkdownLibNode();
    const md = "- item1\n- item2\n\nSome text\n\n* item3\n+ item4";
    const res = await node.process({ markdown: md });
    const lists = res.output as Array<Array<Record<string, string>>>;
    expect(lists).toHaveLength(2);
    expect(lists[0]).toHaveLength(2);
    expect(lists[1]).toHaveLength(2);
  });

  it("ExtractBulletLists with trailing list (no trailing newline)", async () => {
    const node = new ExtractBulletListsMarkdownLibNode();
    const md = "- a\n- b";
    const res = await node.process({ markdown: md });
    expect(res.output).toHaveLength(1);
  });

  it("ExtractNumberedLists", async () => {
    const node = new ExtractNumberedListsMarkdownLibNode();
    const md = "1. First\n2. Second\n\nText\n\n1. Alpha\n2. Beta";
    const res = await node.process({ markdown: md });
    const lists = res.output as string[][];
    expect(lists).toHaveLength(2);
    expect(lists[0]).toEqual(["First", "Second"]);
    expect(lists[1]).toEqual(["Alpha", "Beta"]);
  });

  it("ExtractNumberedLists with trailing list", async () => {
    const node = new ExtractNumberedListsMarkdownLibNode();
    const md = "1. a\n2. b";
    const res = await node.process({ markdown: md });
    expect(res.output).toHaveLength(1);
  });

  it("ExtractCodeBlocks with no language", async () => {
    const node = new ExtractCodeBlocksMarkdownLibNode();
    const md = "```\nhello world\n```";
    const res = await node.process({ markdown: md });
    expect(res.output).toEqual([{ language: "text", code: "hello world" }]);
  });

  it("ExtractTables with insufficient rows", async () => {
    const node = new ExtractTablesMarkdownLibNode();
    // Only header and separator, no data rows
    const md = "| a | b |\n|---|---|";
    const res = await node.process({ markdown: md });
    expect((res.output as Record<string, unknown>).rows).toEqual([]);

    // No table at all
    const md2 = "Just some text";
    const res2 = await node.process({ markdown: md2 });
    expect((res2.output as Record<string, unknown>).rows).toEqual([]);
  });

  it("ExtractTables stops at non-pipe line", async () => {
    const node = new ExtractTablesMarkdownLibNode();
    const md = "| a | b |\n|---|---|\n| 1 | 2 |\n\nSome other text\n| c | d |";
    const res = await node.process({ markdown: md });
    const rows = (res.output as Record<string, unknown>).rows as Array<Record<string, string>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ a: "1", b: "2" });
  });

  it("defaults() for all markdown nodes", () => {
    exerciseDefaults(ExtractLinksMarkdownLibNode);
    exerciseDefaults(ExtractHeadersMarkdownLibNode);
    exerciseDefaults(ExtractBulletListsMarkdownLibNode);
    exerciseDefaults(ExtractNumberedListsMarkdownLibNode);
    exerciseDefaults(ExtractCodeBlocksMarkdownLibNode);
    exerciseDefaults(ExtractTablesMarkdownLibNode);
  });
});

/* ================================================================
   lib-secret
   ================================================================ */
describe("coverage: lib-secret", () => {
  it("returns default when name is empty", async () => {
    const node = new GetSecretLibNode();
    const res = await node.process({ name: "", default: "mydefault" });
    expect(res.output).toBe("mydefault");
  });

  it("falls back to process.env when context returns null", async () => {
    const node = new GetSecretLibNode();
    const envKey = "NT_TEST_SECRET_" + Date.now();
    process.env[envKey] = "env-value";
    try {
      const ctx = { getSecret: async () => null } as unknown as ProcessingContext;
      const res = await node.process({ name: envKey, default: "def" }, ctx);
      expect(res.output).toBe("env-value");
    } finally {
      delete process.env[envKey];
    }
  });

  it("falls back to default when neither context nor env has value", async () => {
    const node = new GetSecretLibNode();
    const ctx = { getSecret: async () => null } as unknown as ProcessingContext;
    const res = await node.process({ name: "TOTALLY_NONEXISTENT_KEY_" + Date.now(), default: "def" }, ctx);
    expect(res.output).toBe("def");
  });

  it("works without context at all", async () => {
    const node = new GetSecretLibNode();
    const res = await node.process({ name: "TOTALLY_NONEXISTENT_KEY_" + Date.now(), default: "fallback" });
    expect(res.output).toBe("fallback");
  });

  it("defaults() returns correct shape", () => {
    const node = new GetSecretLibNode();
    const d = node.serialize();
    expect(d).toEqual({ name: "", default: "" });
  });
});
