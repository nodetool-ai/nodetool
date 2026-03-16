import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AddLibNode,
  MathFunctionLibNode,
  ParseDictLibNode,
  GetJSONPathIntLibNode,
  JSONTemplateLibNode,
  ParseDateLibNode,
  DateDifferenceLibNode,
  BoundaryTimeLibNode,
  LoadJSONAssetsLibNode,
} from "../src/index.js";

describe("native lib.math", () => {
  it("handles arithmetic and unary functions", async () => {
    await expect(new AddLibNode().process({ a: 2, b: 3 })).resolves.toEqual({ output: 5 });
    await expect(
      new MathFunctionLibNode().process({ input: -8, operation: "cube_root" })
    ).resolves.toEqual({ output: -2 });
  });
});

describe("native lib.json", () => {
  it("parses and extracts json values", async () => {
    await expect(new ParseDictLibNode().process({ json_string: '{"a":{"b":7}}' })).resolves.toEqual({
      output: { a: { b: 7 } },
    });

    await expect(
      new GetJSONPathIntLibNode().process({ data: { a: { b: 7 } }, path: "a.b", default: 0 })
    ).resolves.toEqual({ output: 7 });

    await expect(
      new JSONTemplateLibNode().process({
        template: '{"name":"$user","age":"$age"}',
        values: { user: "Ada", age: 30 },
      })
    ).resolves.toEqual({ output: { name: "Ada", age: 30 } });
  });

  it("streams JSON assets from local folder path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nt-lib-json-"));
    await writeFile(join(dir, "a.json"), '{"ok":true}', "utf-8");

    const node = new LoadJSONAssetsLibNode();
    const items: Array<Record<string, unknown>> = [];
    for await (const item of node.genProcess({ folder: { uri: dir } })) {
      items.push(item);
    }

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ json: { ok: true }, name: "a.json" });
  });
});

describe("native lib.date", () => {
  it("parses date and computes date difference", async () => {
    const parsed = await new ParseDateLibNode().process({
      date_string: "2026-03-02",
      input_format: "%Y-%m-%d",
    });
    expect(parsed).toEqual({ output: { year: 2026, month: 3, day: 2 } });

    const diff = await new DateDifferenceLibNode().process({
      start_date: { year: 2026, month: 3, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 },
      end_date: { year: 2026, month: 3, day: 2, hour: 1, minute: 2, second: 3, millisecond: 0 },
    });
    expect(diff).toMatchObject({ total_seconds: 90123, days: 1, hours: 1, minutes: 2, seconds: 3 });
  });

  it("computes boundary times", async () => {
    const out = await new BoundaryTimeLibNode().process({
      input_datetime: { year: 2026, month: 3, day: 2, hour: 12, minute: 5, second: 1, millisecond: 10 },
      period: "day",
      boundary: "start",
    });
    expect(out.output).toMatchObject({ year: 2026, month: 3, day: 2, hour: 0, minute: 0, second: 0 });
  });
});
