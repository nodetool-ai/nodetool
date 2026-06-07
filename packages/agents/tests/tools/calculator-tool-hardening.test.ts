/**
 * Mutation-hardening tests for CalculatorTool: the input-schema shape and the
 * non-number result branch that line coverage left unverified.
 */
import { describe, it, expect } from "vitest";
import { CalculatorTool } from "../../src/tools/calculator-tool.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

const tool = new CalculatorTool();
const ctx = {} as ProcessingContext;

describe("CalculatorTool — mutation hardening", () => {
  it("declares the expression property with type and description", () => {
    const props = tool.inputSchema.properties as Record<
      string,
      { type?: string; description?: string }
    >;
    expect(props).toHaveProperty("expression");
    expect(props.expression.type).toBe("string");
    expect(props.expression.description).toBe(
      "The mathematical expression to evaluate"
    );
  });

  // A boolean result is finite when coerced (isFinite(true) === true), so only
  // the `typeof result !== "number"` operand rejects it — this pins that operand.
  it("rejects an expression that evaluates to a boolean", async () => {
    const result = await tool.process(ctx, { expression: "1 > 0" });
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("finite number");
  });
});
