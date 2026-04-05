/**
 * Tests for CalculatorTool — safe mathematical expression evaluation.
 */

import { describe, expect, it } from "vitest";
import { CalculatorTool } from "../../src/tools/calculator-tool.js";
import type { ProcessingContext } from "@nodetool/runtime";

const tool = new CalculatorTool();
const ctx = {} as ProcessingContext;

describe("CalculatorTool", () => {
  describe("metadata", () => {
    it("has correct name and description", () => {
      expect(tool.name).toBe("calculate");
      expect(tool.description).toContain("mathematical");
    });

    it("requires expression parameter", () => {
      expect(tool.inputSchema.required).toContain("expression");
    });
  });

  describe("basic arithmetic", () => {
    it("evaluates addition", async () => {
      const result = await tool.process(ctx, { expression: "2 + 3" });
      expect(result).toEqual({ result: 5 });
    });

    it("evaluates multiplication", async () => {
      const result = await tool.process(ctx, { expression: "4 * 7" });
      expect(result).toEqual({ result: 28 });
    });

    it("evaluates division", async () => {
      const result = await tool.process(ctx, { expression: "10 / 4" });
      expect(result).toEqual({ result: 2.5 });
    });

    it("evaluates complex expressions", async () => {
      const result = await tool.process(ctx, {
        expression: "(2 + 3) * 4 - 1"
      });
      expect(result).toEqual({ result: 19 });
    });
  });

  describe("math functions", () => {
    it("evaluates sqrt", async () => {
      const result = await tool.process(ctx, { expression: "sqrt(16)" });
      expect(result).toEqual({ result: 4 });
    });

    it("evaluates sin", async () => {
      const result = await tool.process(ctx, { expression: "sin(0)" });
      expect(result).toEqual({ result: 0 });
    });

    it("evaluates log", async () => {
      const result = await tool.process(ctx, { expression: "log(E)" });
      expect(result).toEqual({ result: 1 });
    });

    it("evaluates pow", async () => {
      const result = await tool.process(ctx, { expression: "pow(2, 10)" });
      expect(result).toEqual({ result: 1024 });
    });

    it("uses PI constant", async () => {
      const result = await tool.process(ctx, { expression: "PI" });
      expect(result).toEqual({ result: Math.PI });
    });

    it("evaluates floor and ceil", async () => {
      const floor = await tool.process(ctx, { expression: "floor(3.7)" });
      expect(floor).toEqual({ result: 3 });

      const ceil = await tool.process(ctx, { expression: "ceil(3.2)" });
      expect(ceil).toEqual({ result: 4 });
    });

    it("evaluates min and max", async () => {
      const min = await tool.process(ctx, { expression: "min(5, 3, 8)" });
      expect(min).toEqual({ result: 3 });

      const max = await tool.process(ctx, { expression: "max(5, 3, 8)" });
      expect(max).toEqual({ result: 8 });
    });
  });

  describe("error handling", () => {
    it("returns error for non-string expression", async () => {
      const result = await tool.process(ctx, { expression: 42 });
      expect(result).toEqual({ error: "expression must be a string" });
    });

    it("returns error for Infinity result", async () => {
      const result = await tool.process(ctx, { expression: "1/0" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("finite number");
    });

    it("returns error for NaN result", async () => {
      const result = await tool.process(ctx, { expression: "sqrt(-1)" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("finite number");
    });

    it("returns error for syntax errors", async () => {
      const result = await tool.process(ctx, { expression: "2 +" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain(
        "Failed to evaluate"
      );
    });

    it("returns error for undefined variables", async () => {
      const result = await tool.process(ctx, {
        expression: "unknownVar + 1"
      });
      expect(result).toHaveProperty("error");
    });
  });

  describe("userMessage", () => {
    it("formats user message with expression", () => {
      expect(tool.userMessage({ expression: "2+2" })).toBe("Calculating: 2+2");
    });

    it("handles missing expression", () => {
      expect(tool.userMessage({})).toBe("Calculating: ");
    });
  });
});
