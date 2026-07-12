/**
 * Mutation-hardening tests for the math tools. These pin exact formula results,
 * every branch of each calculation/shape/function/conversion, the schema /
 * message contracts, and the non-numeric guard paths — behaviour that the
 * close-enough assertions in math-tools.test.ts left unverified.
 */
import { describe, it, expect } from "vitest";
import {
  StatisticsTool,
  GeometryTool,
  TrigonometryTool,
  ConversionTool
} from "../src/tools/math-tools.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

const ctx = {} as ProcessingContext;

type Stats = { statistics: Record<string, number>; data_summary: string };
type Geo = Record<string, number | string>;
type Trig = {
  function: string;
  input_value: number;
  input_unit: string;
  result: number;
};
type Conv = {
  original_value: number;
  from_unit: string;
  to_unit: string;
  converted_value: number;
  formatted: string;
};
const big = (n: number) => BigInt(n) as unknown as number; // forces a non-number throw

// ---------------------------------------------------------------------------
// StatisticsTool
// ---------------------------------------------------------------------------

describe("StatisticsTool — mutation hardening", () => {
  const tool = new StatisticsTool();

  it("declares the schema contract", () => {
    expect(tool.name).toBe("statistics");
    expect(tool.description).toContain("statistical calculations");
    expect(tool.description).toContain("standard deviation");
    const props = tool.inputSchema.properties as Record<string, any>;
    expect(props.data.items.type).toBe("number");
    expect(props.data.description).toContain("numerical");
    expect(props.calculations.description).toContain("all");
    expect(props.calculations.items.enum).toEqual([
      "mean",
      "median",
      "mode",
      "std_dev",
      "variance",
      "min",
      "max",
      "sum",
      "count",
      "all"
    ]);
    expect(props.calculations.default).toEqual(["all"]);
    expect(tool.inputSchema.required).toEqual(["data"]);
  });

  it("computes the mean exactly", async () => {
    const r = (await tool.process(ctx, {
      data: [10, 20, 30],
      calculations: ["mean"]
    })) as Stats;
    expect(r.statistics.mean).toBe(20);
  });

  it("computes the median for odd and even lengths (and sorts first)", async () => {
    const odd = (await tool.process(ctx, {
      data: [7, 3, 5],
      calculations: ["median"]
    })) as Stats;
    expect(odd.statistics.median).toBe(5);
    const even = (await tool.process(ctx, {
      data: [7, 3, 5, 1],
      calculations: ["median"]
    })) as Stats;
    expect(even.statistics.median).toBe(4);
  });

  it("computes the mode as the first value to reach the max frequency", async () => {
    const r = (await tool.process(ctx, {
      data: [2, 2, 1, 1],
      calculations: ["mode"]
    })) as Stats;
    expect(r.statistics.mode).toBe(2);
  });

  it("computes the sample variance and std_dev exactly", async () => {
    const variance = (await tool.process(ctx, {
      data: [10, 20, 30],
      calculations: ["variance"]
    })) as Stats;
    expect(variance.statistics.variance).toBe(100);
    const std = (await tool.process(ctx, {
      data: [10, 20, 30],
      calculations: ["std_dev"]
    })) as Stats;
    expect(std.statistics.std_dev).toBe(10);
  });

  it("returns 0 for variance/std_dev of a single value", async () => {
    const v = (await tool.process(ctx, {
      data: [5],
      calculations: ["variance"]
    })) as Stats;
    expect(v.statistics.variance).toBe(0);
    const s = (await tool.process(ctx, {
      data: [5],
      calculations: ["std_dev"]
    })) as Stats;
    expect(s.statistics.std_dev).toBe(0);
  });

  it("computes min, max, sum, and count exactly", async () => {
    const data = [10, 20, 30];
    expect(((await tool.process(ctx, { data, calculations: ["min"] })) as Stats).statistics.min).toBe(10);
    expect(((await tool.process(ctx, { data, calculations: ["max"] })) as Stats).statistics.max).toBe(30);
    expect(((await tool.process(ctx, { data, calculations: ["sum"] })) as Stats).statistics.sum).toBe(60);
    expect(((await tool.process(ctx, { data, calculations: ["count"] })) as Stats).statistics.count).toBe(3);
  });

  it("computes ONLY the requested statistic (each guard is independent)", async () => {
    const all = ["mean", "median", "mode", "std_dev", "variance", "min", "max", "sum", "count"];
    // The excluded sets of these two single-calc requests together cover all
    // nine guards, so an "always compute" mutant on any of them is detected.
    for (const only of ["sum", "mean"]) {
      const r = (await tool.process(ctx, { data: [10, 20, 30], calculations: [only] })) as Stats;
      expect(r.statistics[only]).toBeDefined();
      for (const k of all.filter((k) => k !== only)) {
        expect(r.statistics[k]).toBeUndefined();
      }
    }
  });

  it("'all' yields every statistic and the data summary", async () => {
    const r = (await tool.process(ctx, { data: [10, 20, 30] })) as Stats;
    for (const k of ["mean", "median", "mode", "std_dev", "variance", "min", "max", "sum", "count"]) {
      expect(r.statistics[k]).toBeDefined();
    }
    expect(r.data_summary).toBe("Analyzed 3 values");
  });

  it("rejects non-array and empty data with the exact message", async () => {
    expect(((await tool.process(ctx, { data: 42 })) as { error: string }).error).toBe(
      "No data provided"
    );
    expect(((await tool.process(ctx, { data: [] })) as { error: string }).error).toBe(
      "No data provided"
    );
  });

  it("guards against non-numeric data via the catch path", async () => {
    const r = (await tool.process(ctx, { data: [big(1), big(2), big(3)] })) as {
      error: string;
    };
    expect(r.error).toContain("Statistics calculation error");
  });

  it("userMessage names the calculations and value count", () => {
    expect(tool.userMessage({ data: [1, 2, 3], calculations: ["mean", "max"] })).toBe(
      "Calculating statistics (mean, max) on 3 values"
    );
  });

  it("userMessage defaults to 'all' and 0 values when params are absent", () => {
    expect(tool.userMessage({})).toBe("Calculating statistics (all) on 0 values");
  });
});

// ---------------------------------------------------------------------------
// GeometryTool
// ---------------------------------------------------------------------------

describe("GeometryTool — mutation hardening", () => {
  const tool = new GeometryTool();

  it("declares the schema contract", () => {
    expect(tool.name).toBe("geometry");
    expect(tool.description).toContain("geometric calculations");
    expect(tool.description).toContain("surface area");
    const props = tool.inputSchema.properties as Record<string, any>;
    expect(props.shape.enum).toEqual([
      "circle",
      "rectangle",
      "triangle",
      "sphere",
      "cylinder",
      "cube",
      "distance_2d",
      "distance_3d"
    ]);
    expect(props.shape.description).toContain("geometric");
    expect(props.dimensions.type).toBe("object");
    expect(props.dimensions.description).toContain("Dimensions");
    const dims = props.dimensions.properties as Record<string, { type: string }>;
    for (const k of [
      "radius", "width", "height", "length", "base",
      "side_a", "side_b", "side_c", "side",
      "x1", "y1", "z1", "x2", "y2", "z2"
    ]) {
      expect(dims[k]).toEqual({ type: "number" });
    }
    expect(tool.inputSchema.required).toEqual(["shape", "dimensions"]);
  });

  it("circle: area, circumference, diameter", async () => {
    const r = (await tool.process(ctx, { shape: "circle", dimensions: { radius: 5 } })) as Geo;
    expect(r.shape).toBe("circle");
    expect(r.area).toBeCloseTo(Math.PI * 25, 10);
    expect(r.circumference).toBeCloseTo(2 * Math.PI * 5, 10);
    expect(r.diameter).toBe(10);
  });

  it("rectangle: area, perimeter, diagonal", async () => {
    const r = (await tool.process(ctx, { shape: "rectangle", dimensions: { width: 4, height: 3 } })) as Geo;
    expect(r.area).toBe(12);
    expect(r.perimeter).toBe(14);
    expect(r.diagonal).toBeCloseTo(5, 10);
  });

  it("triangle: base/height area only", async () => {
    const r = (await tool.process(ctx, { shape: "triangle", dimensions: { base: 6, height: 4 } })) as Geo;
    expect(r.area).toBe(12);
    expect(r.perimeter).toBeUndefined();
    expect(r.area_herons).toBeUndefined();
  });

  it("triangle: heron's area and perimeter from three sides only", async () => {
    // 13/14/15 — chosen so s - c !== 1, exposing the final Heron factor.
    const r = (await tool.process(ctx, {
      shape: "triangle",
      dimensions: { side_a: 13, side_b: 14, side_c: 15 }
    })) as Geo;
    expect(r.perimeter).toBe(42);
    expect(r.area_herons).toBeCloseTo(84, 10);
    expect(r.area).toBeUndefined();
  });

  it("triangle: requires BOTH base and height, and ALL three sides", async () => {
    const noHeight = (await tool.process(ctx, { shape: "triangle", dimensions: { base: 6 } })) as Geo;
    expect(noHeight.area).toBeUndefined();
    // Only one side present: `.every` must be false (a `.some` mutant would compute).
    const oneSide = (await tool.process(ctx, { shape: "triangle", dimensions: { side_a: 3 } })) as Geo;
    expect(oneSide.perimeter).toBeUndefined();
    expect(oneSide.area_herons).toBeUndefined();
  });

  it("sphere: volume and surface area", async () => {
    const r = (await tool.process(ctx, { shape: "sphere", dimensions: { radius: 2 } })) as Geo;
    expect(r.volume).toBeCloseTo((4 / 3) * Math.PI * 8, 8);
    expect(r.surface_area).toBeCloseTo(4 * Math.PI * 4, 8);
  });

  it("cylinder: volume and surface area", async () => {
    const r = (await tool.process(ctx, { shape: "cylinder", dimensions: { radius: 2, height: 5 } })) as Geo;
    expect(r.volume).toBeCloseTo(Math.PI * 20, 8);
    expect(r.surface_area).toBeCloseTo(2 * Math.PI * 2 * 7, 8);
  });

  it("cube: volume/surface and the side ?? width ?? length fallback", async () => {
    const bySide = (await tool.process(ctx, { shape: "cube", dimensions: { side: 2 } })) as Geo;
    expect(bySide.volume).toBe(8);
    expect(bySide.surface_area).toBe(24);
    expect(((await tool.process(ctx, { shape: "cube", dimensions: { width: 3 } })) as Geo).volume).toBe(27);
    expect(((await tool.process(ctx, { shape: "cube", dimensions: { length: 4 } })) as Geo).volume).toBe(64);
  });

  it("distance_2d and distance_3d (non-zero origin so +/- differ)", async () => {
    const d2 = (await tool.process(ctx, {
      shape: "distance_2d",
      dimensions: { x1: 1, y1: 2, x2: 4, y2: 6 }
    })) as Geo;
    expect(d2.distance).toBe(5);
    const d3 = (await tool.process(ctx, {
      shape: "distance_3d",
      dimensions: { x1: 1, y1: 1, z1: 1, x2: 2, y2: 3, z2: 3 }
    })) as Geo;
    expect(d3.distance).toBe(3);
  });

  it("rejects an unsupported shape with the exact message", async () => {
    const r = (await tool.process(ctx, { shape: "hexagon", dimensions: {} })) as { error: string };
    expect(r.error).toBe("Unsupported shape: hexagon");
  });

  it("guards against non-numeric dimensions via the catch path", async () => {
    const r = (await tool.process(ctx, {
      shape: "circle",
      dimensions: { radius: big(5) }
    })) as { error: string };
    expect(r.error).toContain("Geometry calculation error");
  });

  it("userMessage names the shape, defaulting when absent", () => {
    expect(tool.userMessage({ shape: "circle", dimensions: {} })).toBe(
      "Calculating geometry for circle"
    );
    expect(tool.userMessage({})).toBe("Calculating geometry for unknown shape");
  });
});

// ---------------------------------------------------------------------------
// TrigonometryTool
// ---------------------------------------------------------------------------

describe("TrigonometryTool — mutation hardening", () => {
  const tool = new TrigonometryTool();

  it("declares the schema contract", () => {
    expect(tool.name).toBe("trigonometry");
    expect(tool.description).toContain("trigonometric calculations");
    expect(tool.description).toContain("degrees and radians");
    const props = tool.inputSchema.properties as Record<string, any>;
    expect(props.function.enum).toEqual([
      "sin", "cos", "tan", "asin", "acos", "atan", "deg_to_rad", "rad_to_deg"
    ]);
    expect(props.function.description).toContain("Trigonometric");
    expect(props.value.type).toBe("number");
    expect(props.value.description).toContain("Input value");
    expect(props.angle_unit.enum).toEqual(["degrees", "radians"]);
    expect(props.angle_unit.description).toContain("angle");
    expect(props.angle_unit.default).toBe("degrees");
    expect(tool.inputSchema.required).toEqual(["function", "value"]);
  });

  const deg = async (fn: string, value: number) =>
    ((await tool.process(ctx, { function: fn, value, angle_unit: "degrees" })) as Trig).result;

  it("forward functions in degrees", async () => {
    expect(await deg("sin", 90)).toBeCloseTo(1, 10);
    expect(await deg("sin", 30)).toBeCloseTo(0.5, 10);
    expect(await deg("cos", 60)).toBeCloseTo(0.5, 10);
    expect(await deg("tan", 45)).toBeCloseTo(1, 10);
  });

  it("inverse functions return degrees", async () => {
    expect(await deg("asin", 0.5)).toBeCloseTo(30, 10);
    expect(await deg("acos", 0)).toBeCloseTo(90, 10);
    expect(await deg("atan", 1)).toBeCloseTo(45, 10);
  });

  it("explicit conversions", async () => {
    expect(await deg("deg_to_rad", 180)).toBeCloseTo(Math.PI, 10);
    expect(await deg("rad_to_deg", Math.PI)).toBeCloseTo(180, 10);
  });

  it("honours the radians angle unit (no degree conversion)", async () => {
    const sinRad = (await tool.process(ctx, {
      function: "sin",
      value: Math.PI / 2,
      angle_unit: "radians"
    })) as Trig;
    expect(sinRad.result).toBeCloseTo(1, 10);
    const asinRad = (await tool.process(ctx, {
      function: "asin",
      value: 1,
      angle_unit: "radians"
    })) as Trig;
    expect(asinRad.result).toBeCloseTo(Math.PI / 2, 10);
  });

  it("defaults the angle unit to degrees", async () => {
    const r = (await tool.process(ctx, { function: "sin", value: 90 })) as Trig;
    expect(r.result).toBeCloseTo(1, 10);
    expect(r.input_unit).toBe("degrees");
  });

  it("echoes the function, input value and unit", async () => {
    const r = (await tool.process(ctx, {
      function: "cos",
      value: 60,
      angle_unit: "degrees"
    })) as Trig;
    expect(r.function).toBe("cos");
    expect(r.input_value).toBe(60);
    expect(r.input_unit).toBe("degrees");
  });

  it("rejects an unsupported function with the exact message", async () => {
    const r = (await tool.process(ctx, { function: "sinh", value: 1 })) as { error: string };
    expect(r.error).toBe("Unsupported function: sinh");
  });

  it("guards against non-numeric input via the catch path", async () => {
    const r = (await tool.process(ctx, { function: "sin", value: big(5) })) as {
      error: string;
    };
    expect(r.error).toContain("Trigonometry calculation error");
  });

  it("userMessage shows function and value, defaulting when absent", () => {
    expect(tool.userMessage({ function: "sin", value: 45 })).toBe("Calculating sin(45)");
    expect(tool.userMessage({})).toBe("Calculating ()");
  });
});

// ---------------------------------------------------------------------------
// ConversionTool
// ---------------------------------------------------------------------------

describe("ConversionTool — mutation hardening", () => {
  const tool = new ConversionTool();

  const conv = async (value: number, from: string, to: string) =>
    (await tool.process(ctx, { value, from_unit: from, to_unit: to })) as Conv;

  it("declares the schema contract", () => {
    expect(tool.name).toBe("unit_conversion");
    expect(tool.description).toContain("between different units");
    expect(tool.description).toContain("temperature");
    const props = tool.inputSchema.properties as Record<string, any>;
    expect(props.value.type).toBe("number");
    expect(props.value.description).toContain("convert");
    expect(props.from_unit.type).toBe("string");
    expect(props.from_unit.description).toContain("Source unit");
    expect(props.to_unit.type).toBe("string");
    expect(props.to_unit.description).toContain("Target unit");
    expect(tool.inputSchema.required).toEqual(["value", "from_unit", "to_unit"]);
  });

  it("converts via factors exactly (and the * / order)", async () => {
    expect((await conv(1, "feet", "meters")).converted_value).toBeCloseTo(0.3048, 10);
    expect((await conv(1, "meters", "feet")).converted_value).toBeCloseTo(1 / 0.3048, 10);
  });

  it("lower-cases both units before lookup", async () => {
    expect((await conv(1, "METERS", "Feet")).converted_value).toBeCloseTo(1 / 0.3048, 10);
  });

  it("temperature conversions cover every from/to branch", async () => {
    // 212/100 (not 32/0) so the (value - 32) factors are non-zero.
    expect((await conv(100, "celsius", "fahrenheit")).converted_value).toBeCloseTo(212, 10);
    expect((await conv(212, "fahrenheit", "celsius")).converted_value).toBeCloseTo(100, 10);
    expect((await conv(0, "celsius", "kelvin")).converted_value).toBeCloseTo(273.15, 10);
    expect((await conv(273.15, "kelvin", "celsius")).converted_value).toBeCloseTo(0, 10);
    expect((await conv(212, "fahrenheit", "kelvin")).converted_value).toBeCloseTo(373.15, 10);
    expect((await conv(273.15, "kelvin", "fahrenheit")).converted_value).toBeCloseTo(32, 10);
    // from == to (else branches of both halves)
    expect((await conv(50, "celsius", "celsius")).converted_value).toBe(50);
  });

  it("rejects mixing a temperature unit with a non-temperature unit", async () => {
    // Temperature is its own dimension: converting a temperature to/from a
    // length (or any other unit) must error, not silently return a number.
    for (const temp of ["celsius", "fahrenheit", "kelvin"]) {
      const forward = (await tool.process(ctx, {
        value: 50,
        from_unit: temp,
        to_unit: "meters"
      })) as { error?: string; converted_value?: number };
      expect(forward.error).toBeDefined();
      expect(forward.converted_value).toBeUndefined();

      const backward = (await tool.process(ctx, {
        value: 50,
        from_unit: "meters",
        to_unit: temp
      })) as { error?: string; converted_value?: number };
      expect(backward.error).toBeDefined();
      expect(backward.converted_value).toBeUndefined();
    }
  });

  it("errors when EITHER unit is unknown", async () => {
    expect(
      ((await tool.process(ctx, { value: 1, from_unit: "furlongs", to_unit: "meters" })) as {
        error: string;
      }).error
    ).toBe("Unsupported unit conversion: furlongs to meters");
    // toFactor undefined while fromFactor is valid.
    expect(
      ((await tool.process(ctx, { value: 1, from_unit: "meters", to_unit: "furlongs" })) as {
        error: string;
      }).error
    ).toBe("Unsupported unit conversion: meters to furlongs");
  });

  it("echoes fields and formats the result string", async () => {
    const r = await conv(1, "meters", "feet");
    expect(r.original_value).toBe(1);
    expect(r.from_unit).toBe("meters");
    expect(r.to_unit).toBe("feet");
    expect(r.formatted).toBe(`1 meters = ${r.converted_value} feet`);
  });

  it("guards against non-numeric value via the catch path", async () => {
    const r = (await tool.process(ctx, {
      value: big(5),
      from_unit: "meters",
      to_unit: "feet"
    })) as { error: string };
    expect(r.error).toContain("Conversion error");
  });

  it("userMessage describes the conversion, defaulting when absent", () => {
    expect(tool.userMessage({ value: 5, from_unit: "kg", to_unit: "lbs" })).toBe(
      "Converting 5 kg to lbs"
    );
    expect(tool.userMessage({})).toBe("Converting   to ");
  });
});
