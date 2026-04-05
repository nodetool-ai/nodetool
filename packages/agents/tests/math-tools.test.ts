import { describe, it, expect } from "vitest";
import {
  StatisticsTool,
  GeometryTool,
  TrigonometryTool,
  ConversionTool
} from "../src/tools/math-tools.js";

const ctx = {} as any;

// ---------------------------------------------------------------------------
// StatisticsTool
// ---------------------------------------------------------------------------

describe("StatisticsTool", () => {
  const tool = new StatisticsTool();

  it("has correct name and schema", () => {
    expect(tool.name).toBe("statistics");
    expect(tool.inputSchema.required).toContain("data");
  });

  it("calculates all statistics", async () => {
    const result = (await tool.process(ctx, { data: [1, 2, 3, 4, 5] })) as any;
    expect(result.statistics.mean).toBe(3);
    expect(result.statistics.median).toBe(3);
    expect(result.statistics.min).toBe(1);
    expect(result.statistics.max).toBe(5);
    expect(result.statistics.sum).toBe(15);
    expect(result.statistics.count).toBe(5);
  });

  it("calculates mean only", async () => {
    const result = (await tool.process(ctx, {
      data: [10, 20, 30],
      calculations: ["mean"]
    })) as any;
    expect(result.statistics.mean).toBe(20);
    expect(result.statistics.median).toBeUndefined();
  });

  it("calculates std_dev", async () => {
    const result = (await tool.process(ctx, {
      data: [2, 4, 4, 4, 5, 5, 7, 9],
      calculations: ["std_dev"]
    })) as any;
    expect(result.statistics.std_dev).toBeCloseTo(2.138, 2);
  });

  it("returns error for empty data", async () => {
    const result = (await tool.process(ctx, { data: [] })) as any;
    expect(result.error).toBeDefined();
  });

  it("std_dev is 0 for single value", async () => {
    const result = (await tool.process(ctx, {
      data: [5],
      calculations: ["std_dev"]
    })) as any;
    expect(result.statistics.std_dev).toBe(0);
  });

  it("userMessage returns description", () => {
    const msg = tool.userMessage({ data: [1, 2, 3], calculations: ["mean"] });
    expect(msg).toContain("mean");
  });
});

// ---------------------------------------------------------------------------
// GeometryTool
// ---------------------------------------------------------------------------

describe("GeometryTool", () => {
  const tool = new GeometryTool();

  it("has correct name", () => {
    expect(tool.name).toBe("geometry");
  });

  it("calculates circle area and circumference", async () => {
    const result = (await tool.process(ctx, {
      shape: "circle",
      dimensions: { radius: 5 }
    })) as any;
    expect(result.area).toBeCloseTo(78.54, 1);
    expect(result.circumference).toBeCloseTo(31.42, 1);
    expect(result.diameter).toBe(10);
  });

  it("calculates rectangle area and perimeter", async () => {
    const result = (await tool.process(ctx, {
      shape: "rectangle",
      dimensions: { width: 4, height: 3 }
    })) as any;
    expect(result.area).toBe(12);
    expect(result.perimeter).toBe(14);
    expect(result.diagonal).toBeCloseTo(5, 1);
  });

  it("calculates sphere volume and surface area", async () => {
    const result = (await tool.process(ctx, {
      shape: "sphere",
      dimensions: { radius: 3 }
    })) as any;
    expect(result.volume).toBeCloseTo(113.1, 0);
    expect(result.surface_area).toBeCloseTo(113.1, 0);
  });

  it("calculates 2D distance", async () => {
    const result = (await tool.process(ctx, {
      shape: "distance_2d",
      dimensions: { x1: 0, y1: 0, x2: 3, y2: 4 }
    })) as any;
    expect(result.distance).toBe(5);
  });

  it("calculates 3D distance", async () => {
    const result = (await tool.process(ctx, {
      shape: "distance_3d",
      dimensions: { x1: 0, y1: 0, z1: 0, x2: 1, y2: 2, z2: 2 }
    })) as any;
    expect(result.distance).toBe(3);
  });

  it("calculates cube volume", async () => {
    const result = (await tool.process(ctx, {
      shape: "cube",
      dimensions: { side: 2 }
    })) as any;
    expect(result.volume).toBe(8);
    expect(result.surface_area).toBe(24);
  });

  it("calculates cylinder", async () => {
    const result = (await tool.process(ctx, {
      shape: "cylinder",
      dimensions: { radius: 2, height: 5 }
    })) as any;
    expect(result.volume).toBeCloseTo(62.83, 1);
  });

  it("returns error for unsupported shape", async () => {
    const result = (await tool.process(ctx, {
      shape: "hexagon",
      dimensions: {}
    })) as any;
    expect(result.error).toBeDefined();
  });

  it("userMessage returns shape name", () => {
    const msg = tool.userMessage({ shape: "circle", dimensions: {} });
    expect(msg).toContain("circle");
  });
});

// ---------------------------------------------------------------------------
// TrigonometryTool
// ---------------------------------------------------------------------------

describe("TrigonometryTool", () => {
  const tool = new TrigonometryTool();

  it("has correct name", () => {
    expect(tool.name).toBe("trigonometry");
  });

  it("calculates sin in degrees", async () => {
    const result = (await tool.process(ctx, {
      function: "sin",
      value: 90,
      angle_unit: "degrees"
    })) as any;
    expect(result.result).toBeCloseTo(1, 5);
  });

  it("calculates cos in degrees", async () => {
    const result = (await tool.process(ctx, {
      function: "cos",
      value: 0,
      angle_unit: "degrees"
    })) as any;
    expect(result.result).toBeCloseTo(1, 5);
  });

  it("calculates tan in radians", async () => {
    const result = (await tool.process(ctx, {
      function: "tan",
      value: 0,
      angle_unit: "radians"
    })) as any;
    expect(result.result).toBeCloseTo(0, 5);
  });

  it("calculates asin in degrees", async () => {
    const result = (await tool.process(ctx, {
      function: "asin",
      value: 1,
      angle_unit: "degrees"
    })) as any;
    expect(result.result).toBeCloseTo(90, 1);
  });

  it("converts degrees to radians", async () => {
    const result = (await tool.process(ctx, {
      function: "deg_to_rad",
      value: 180
    })) as any;
    expect(result.result).toBeCloseTo(Math.PI, 5);
  });

  it("converts radians to degrees", async () => {
    const result = (await tool.process(ctx, {
      function: "rad_to_deg",
      value: Math.PI
    })) as any;
    expect(result.result).toBeCloseTo(180, 1);
  });

  it("returns error for unsupported function", async () => {
    const result = (await tool.process(ctx, {
      function: "sinh",
      value: 1
    })) as any;
    expect(result.error).toBeDefined();
  });

  it("userMessage shows function and value", () => {
    const msg = tool.userMessage({ function: "sin", value: 45 });
    expect(msg).toContain("sin");
    expect(msg).toContain("45");
  });
});

// ---------------------------------------------------------------------------
// ConversionTool
// ---------------------------------------------------------------------------

describe("ConversionTool", () => {
  const tool = new ConversionTool();

  it("has correct name", () => {
    expect(tool.name).toBe("unit_conversion");
  });

  it("converts meters to feet", async () => {
    const result = (await tool.process(ctx, {
      value: 1,
      from_unit: "meters",
      to_unit: "feet"
    })) as any;
    expect(result.converted_value).toBeCloseTo(3.281, 2);
  });

  it("converts km to miles", async () => {
    const result = (await tool.process(ctx, {
      value: 1,
      from_unit: "kilometers",
      to_unit: "miles"
    })) as any;
    expect(result.converted_value).toBeCloseTo(0.6214, 3);
  });

  it("converts kg to pounds", async () => {
    const result = (await tool.process(ctx, {
      value: 1,
      from_unit: "kilograms",
      to_unit: "pounds"
    })) as any;
    expect(result.converted_value).toBeCloseTo(2.2046, 3);
  });

  it("converts celsius to fahrenheit", async () => {
    const result = (await tool.process(ctx, {
      value: 100,
      from_unit: "celsius",
      to_unit: "fahrenheit"
    })) as any;
    expect(result.converted_value).toBeCloseTo(212, 1);
  });

  it("converts fahrenheit to celsius", async () => {
    const result = (await tool.process(ctx, {
      value: 32,
      from_unit: "fahrenheit",
      to_unit: "celsius"
    })) as any;
    expect(result.converted_value).toBeCloseTo(0, 1);
  });

  it("converts celsius to kelvin", async () => {
    const result = (await tool.process(ctx, {
      value: 0,
      from_unit: "celsius",
      to_unit: "kelvin"
    })) as any;
    expect(result.converted_value).toBeCloseTo(273.15, 2);
  });

  it("returns error for unsupported units", async () => {
    const result = (await tool.process(ctx, {
      value: 1,
      from_unit: "furlongs",
      to_unit: "meters"
    })) as any;
    expect(result.error).toBeDefined();
  });

  it("formats result string", async () => {
    const result = (await tool.process(ctx, {
      value: 1,
      from_unit: "meters",
      to_unit: "feet"
    })) as any;
    expect(result.formatted).toContain("1");
    expect(result.formatted).toContain("meters");
    expect(result.formatted).toContain("feet");
  });

  it("userMessage describes conversion", () => {
    const msg = tool.userMessage({ value: 5, from_unit: "kg", to_unit: "lbs" });
    expect(msg).toContain("5");
    expect(msg).toContain("kg");
    expect(msg).toContain("lbs");
  });
});
