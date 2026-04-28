/**
 * Calculator tool for safe mathematical expression evaluation.
 *
 * Port of src/nodetool/agents/tools/math_tools.py (CalculatorTool)
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";

const MATH_SCOPE: Record<string, unknown> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  PI: Math.PI,
  E: Math.E,
  pi: Math.PI,
  e: Math.E
};

export class CalculatorTool extends Tool {
  readonly name = "calculate";
  readonly description = "Evaluate a mathematical expression safely.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      expression: {
        type: "string" as const,
        description: "The mathematical expression to evaluate"
      }
    },
    required: ["expression"]
  };

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const expression = params["expression"];
    if (typeof expression !== "string") {
      return { error: "expression must be a string" };
    }

    try {
      // Use Function constructor with a restricted scope

      const fn = new Function(
        "scope",
        `with(scope) { return (${expression}) }`
      );
      const result: unknown = fn(MATH_SCOPE);
      if (typeof result !== "number" || !isFinite(result)) {
        return {
          error: `Expression did not evaluate to a finite number: ${String(result)}`
        };
      }
      return { result };
    } catch (e) {
      return { error: `Failed to evaluate expression: ${String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Calculating: ${String(params["expression"] ?? "")}`;
  }
}
