/**
 * Math tools for statistical, geometric, trigonometric, and unit conversion calculations.
 *
 * Port of src/nodetool/agents/tools/math_tools.py (excluding CalculatorTool which is in calculator-tool.ts)
 */

import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";

export class StatisticsTool extends Tool {
  readonly name = "statistics";
  readonly description =
    "Performs statistical calculations on numerical data. " +
    "Calculates mean, median, mode, standard deviation, variance, min, max, sum, and count.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      data: {
        type: "array" as const,
        items: { type: "number" as const },
        description: "Array of numerical values to analyze"
      },
      calculations: {
        type: "array" as const,
        items: {
          type: "string" as const,
          enum: [
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
          ]
        },
        description:
          "Which statistics to calculate (use 'all' for all statistics)",
        default: ["all"]
      }
    },
    required: ["data"]
  };

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const data = params["data"];
    if (!Array.isArray(data) || data.length === 0) {
      return { error: "No data provided" };
    }
    const nums = data as number[];
    const calcs = (params["calculations"] as string[] | undefined) ?? ["all"];

    try {
      const results: Record<string, unknown> = {};

      if (calcs.includes("all") || calcs.includes("mean")) {
        results["mean"] = nums.reduce((a, b) => a + b, 0) / nums.length;
      }
      if (calcs.includes("all") || calcs.includes("median")) {
        const sorted = [...nums].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        results["median"] =
          sorted.length % 2 !== 0
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
      }
      if (calcs.includes("all") || calcs.includes("mode")) {
        const freq = new Map<number, number>();
        for (const n of nums) freq.set(n, (freq.get(n) ?? 0) + 1);
        let maxFreq = 0;
        let mode: number | string = "No unique mode";
        for (const [val, count] of freq) {
          if (count > maxFreq) {
            maxFreq = count;
            mode = val;
          }
        }
        results["mode"] = mode;
      }
      if (calcs.includes("all") || calcs.includes("std_dev")) {
        if (nums.length > 1) {
          const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
          const variance =
            nums.reduce((sum, n) => sum + (n - mean) ** 2, 0) /
            (nums.length - 1);
          results["std_dev"] = Math.sqrt(variance);
        } else {
          results["std_dev"] = 0;
        }
      }
      if (calcs.includes("all") || calcs.includes("variance")) {
        if (nums.length > 1) {
          const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
          results["variance"] =
            nums.reduce((sum, n) => sum + (n - mean) ** 2, 0) /
            (nums.length - 1);
        } else {
          results["variance"] = 0;
        }
      }
      if (calcs.includes("all") || calcs.includes("min"))
        results["min"] = Math.min(...nums);
      if (calcs.includes("all") || calcs.includes("max"))
        results["max"] = Math.max(...nums);
      if (calcs.includes("all") || calcs.includes("sum"))
        results["sum"] = nums.reduce((a, b) => a + b, 0);
      if (calcs.includes("all") || calcs.includes("count"))
        results["count"] = nums.length;

      return {
        data_summary: `Analyzed ${nums.length} values`,
        statistics: results
      };
    } catch (e) {
      return { error: `Statistics calculation error: ${String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const calcs = (params["calculations"] as string[] | undefined) ?? ["all"];
    return `Calculating statistics (${calcs.join(", ")}) on ${(params["data"] as unknown[])?.length ?? 0} values`;
  }
}

export class GeometryTool extends Tool {
  readonly name = "geometry";
  readonly description =
    "Performs geometric calculations for various shapes. " +
    "Supports area and perimeter for 2D shapes, volume and surface area for 3D shapes, and distance calculations.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      shape: {
        type: "string" as const,
        enum: [
          "circle",
          "rectangle",
          "triangle",
          "sphere",
          "cylinder",
          "cube",
          "distance_2d",
          "distance_3d"
        ],
        description: "Type of geometric shape or calculation"
      },
      dimensions: {
        type: "object" as const,
        description: "Dimensions specific to the shape",
        properties: {
          radius: { type: "number" as const },
          width: { type: "number" as const },
          height: { type: "number" as const },
          length: { type: "number" as const },
          base: { type: "number" as const },
          side_a: { type: "number" as const },
          side_b: { type: "number" as const },
          side_c: { type: "number" as const },
          side: { type: "number" as const },
          x1: { type: "number" as const },
          y1: { type: "number" as const },
          z1: { type: "number" as const },
          x2: { type: "number" as const },
          y2: { type: "number" as const },
          z2: { type: "number" as const }
        }
      }
    },
    required: ["shape", "dimensions"]
  };

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const shape = params["shape"] as string;
    const dims = (params["dimensions"] ?? {}) as Record<string, number>;

    try {
      const results: Record<string, unknown> = { shape };

      if (shape === "circle") {
        const r = dims["radius"];
        results["area"] = Math.PI * r ** 2;
        results["circumference"] = 2 * Math.PI * r;
        results["diameter"] = 2 * r;
      } else if (shape === "rectangle") {
        const w = dims["width"],
          h = dims["height"];
        results["area"] = w * h;
        results["perimeter"] = 2 * (w + h);
        results["diagonal"] = Math.sqrt(w ** 2 + h ** 2);
      } else if (shape === "triangle") {
        if ("base" in dims && "height" in dims) {
          results["area"] = 0.5 * dims["base"] * dims["height"];
        }
        if (["side_a", "side_b", "side_c"].every((k) => k in dims)) {
          const [a, b, c] = [dims["side_a"], dims["side_b"], dims["side_c"]];
          results["perimeter"] = a + b + c;
          const s = (a + b + c) / 2;
          results["area_herons"] = Math.sqrt(s * (s - a) * (s - b) * (s - c));
        }
      } else if (shape === "sphere") {
        const r = dims["radius"];
        results["volume"] = (4 / 3) * Math.PI * r ** 3;
        results["surface_area"] = 4 * Math.PI * r ** 2;
      } else if (shape === "cylinder") {
        const r = dims["radius"],
          h = dims["height"];
        results["volume"] = Math.PI * r ** 2 * h;
        results["surface_area"] = 2 * Math.PI * r * (r + h);
      } else if (shape === "cube") {
        const s = dims["side"] ?? dims["width"] ?? dims["length"];
        results["volume"] = s ** 3;
        results["surface_area"] = 6 * s ** 2;
      } else if (shape === "distance_2d") {
        results["distance"] = Math.sqrt(
          (dims["x2"] - dims["x1"]) ** 2 + (dims["y2"] - dims["y1"]) ** 2
        );
      } else if (shape === "distance_3d") {
        results["distance"] = Math.sqrt(
          (dims["x2"] - dims["x1"]) ** 2 +
            (dims["y2"] - dims["y1"]) ** 2 +
            (dims["z2"] - dims["z1"]) ** 2
        );
      } else {
        return { error: `Unsupported shape: ${shape}` };
      }

      return results;
    } catch (e) {
      return { error: `Geometry calculation error: ${String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Calculating geometry for ${String(params["shape"] ?? "unknown shape")}`;
  }
}

export class TrigonometryTool extends Tool {
  readonly name = "trigonometry";
  readonly description =
    "Performs trigonometric calculations. " +
    "Supports sin, cos, tan, asin, acos, atan, and angle conversions between degrees and radians.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      function: {
        type: "string" as const,
        enum: [
          "sin",
          "cos",
          "tan",
          "asin",
          "acos",
          "atan",
          "deg_to_rad",
          "rad_to_deg"
        ],
        description: "Trigonometric function to apply"
      },
      value: {
        type: "number" as const,
        description:
          "Input value (angle in degrees for trig functions, or value for inverse functions)"
      },
      angle_unit: {
        type: "string" as const,
        enum: ["degrees", "radians"],
        description: "Unit of the input angle",
        default: "degrees"
      }
    },
    required: ["function", "value"]
  };

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const fn = params["function"] as string;
    const value = params["value"] as number;
    const angleUnit = (params["angle_unit"] as string | undefined) ?? "degrees";

    try {
      const toRad =
        angleUnit === "degrees"
          ? (v: number) => (v * Math.PI) / 180
          : (v: number) => v;
      const toDeg =
        angleUnit === "degrees"
          ? (v: number) => (v * 180) / Math.PI
          : (v: number) => v;

      let result: number;
      if (fn === "sin") result = Math.sin(toRad(value));
      else if (fn === "cos") result = Math.cos(toRad(value));
      else if (fn === "tan") result = Math.tan(toRad(value));
      else if (fn === "asin") result = toDeg(Math.asin(value));
      else if (fn === "acos") result = toDeg(Math.acos(value));
      else if (fn === "atan") result = toDeg(Math.atan(value));
      else if (fn === "deg_to_rad") result = (value * Math.PI) / 180;
      else if (fn === "rad_to_deg") result = (value * 180) / Math.PI;
      else return { error: `Unsupported function: ${fn}` };

      return {
        function: fn,
        input_value: value,
        input_unit: angleUnit,
        result
      };
    } catch (e) {
      return { error: `Trigonometry calculation error: ${String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Calculating ${String(params["function"] ?? "")}(${String(params["value"] ?? "")})`;
  }
}

const UNIT_CONVERSIONS: Record<string, number> = {
  // Length (to meters)
  meters: 1.0,
  m: 1.0,
  centimeters: 0.01,
  cm: 0.01,
  millimeters: 0.001,
  mm: 0.001,
  kilometers: 1000.0,
  km: 1000.0,
  feet: 0.3048,
  ft: 0.3048,
  inches: 0.0254,
  in: 0.0254,
  yards: 0.9144,
  yd: 0.9144,
  miles: 1609.344,
  // Weight (to kilograms)
  kilograms: 1.0,
  kg: 1.0,
  grams: 0.001,
  g: 0.001,
  pounds: 0.453592,
  lbs: 0.453592,
  ounces: 0.0283495,
  oz: 0.0283495,
  // Area (to square meters)
  square_meters: 1.0,
  m2: 1.0,
  square_feet: 0.092903,
  ft2: 0.092903,
  square_inches: 0.00064516,
  in2: 0.00064516,
  acres: 4046.86,
  // Volume (to liters)
  liters: 1.0,
  l: 1.0,
  milliliters: 0.001,
  ml: 0.001,
  gallons: 3.78541,
  gal: 3.78541,
  cups: 0.236588,
  fluid_ounces: 0.0295735,
  fl_oz: 0.0295735
};

export class ConversionTool extends Tool {
  readonly name = "unit_conversion";
  readonly description =
    "Converts between different units of measurement. " +
    "Supports length, weight, temperature, area, and volume conversions.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      value: { type: "number" as const, description: "Value to convert" },
      from_unit: {
        type: "string" as const,
        description: "Source unit (e.g., 'meters', 'feet', 'celsius', 'kg')"
      },
      to_unit: {
        type: "string" as const,
        description: "Target unit (e.g., 'feet', 'meters', 'fahrenheit', 'lbs')"
      }
    },
    required: ["value", "from_unit", "to_unit"]
  };

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const value = params["value"] as number;
    const fromUnit = (params["from_unit"] as string).toLowerCase();
    const toUnit = (params["to_unit"] as string).toLowerCase();

    try {
      const tempUnits = new Set(["celsius", "fahrenheit", "kelvin"]);
      let result: number;

      if (tempUnits.has(fromUnit) || tempUnits.has(toUnit)) {
        result = this.convertTemperature(value, fromUnit, toUnit);
      } else {
        const fromFactor = UNIT_CONVERSIONS[fromUnit];
        const toFactor = UNIT_CONVERSIONS[toUnit];
        if (fromFactor === undefined || toFactor === undefined) {
          return {
            error: `Unsupported unit conversion: ${fromUnit} to ${toUnit}`
          };
        }
        result = (value * fromFactor) / toFactor;
      }

      return {
        original_value: value,
        from_unit: fromUnit,
        to_unit: toUnit,
        converted_value: result,
        formatted: `${value} ${fromUnit} = ${result} ${toUnit}`
      };
    } catch (e) {
      return { error: `Conversion error: ${String(e)}` };
    }
  }

  private convertTemperature(value: number, from: string, to: string): number {
    let celsius: number;
    if (from === "fahrenheit") celsius = ((value - 32) * 5) / 9;
    else if (from === "kelvin") celsius = value - 273.15;
    else celsius = value;

    if (to === "fahrenheit") return (celsius * 9) / 5 + 32;
    if (to === "kelvin") return celsius + 273.15;
    return celsius;
  }

  userMessage(params: Record<string, unknown>): string {
    return `Converting ${String(params["value"] ?? "")} ${String(params["from_unit"] ?? "")} to ${String(params["to_unit"] ?? "")}`;
  }
}
