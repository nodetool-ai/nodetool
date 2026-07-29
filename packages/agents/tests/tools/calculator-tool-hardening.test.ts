/**
 * Mutation-hardening tests for CalculatorTool: the input-schema shape, the
 * non-number result branch, and — critically — the parser/evaluator's
 * refusal to execute anything but whitelisted arithmetic. `calculate`
 * evaluates model-supplied `expression` strings, so any escape from the
 * arithmetic grammar back into a host object (`constructor`, `process`,
 * `globalThis`, ...) would be a remote-code-execution vector reachable via
 * `AgentNode` (see `packages/llm-nodes/src/nodes/agent-tool-hydration.ts`,
 * `STATIC_TOOL_CLASSES`). These tests pin that the tokenizer/parser rejects
 * such expressions cleanly instead of resolving them through the prototype
 * chain.
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

  // The grammar has no comparison/logical operators, so a boolean result is
  // unreachable via the parser itself — `>` is simply not a token it knows.
  // This still pins that an unrecognized operator character fails cleanly
  // (as an `{ error }`, not a thrown exception that escapes `process()`).
  it("rejects an expression using an unsupported operator", async () => {
    const result = await tool.process(ctx, { expression: "1 > 0" });
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain(
      "Failed to evaluate"
    );
  });

  it("rejects a boolean-looking result via the finite-number guard", async () => {
    // NaN/Infinity are the only non-finite outcomes the parser can actually
    // produce (there's no path to a boolean or object) — pin that guard here.
    const result = await tool.process(ctx, { expression: "0/0" });
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("finite number");
  });
});

describe("CalculatorTool — security: no dynamic-code escape", () => {
  const expectSafeRejection = async (expression: string) => {
    const result = await tool.process(ctx, { expression });
    expect(result).toHaveProperty("error");
    // Must never resolve to a finite number (i.e. must never have "worked"
    // as an accidental side channel) and must never throw past `process()`.
    expect(result).not.toHaveProperty("result");
    return result as { error: string };
  };

  it("blocks constructor.constructor(...) Function-constructor escape", async () => {
    await expectSafeRejection(
      'constructor.constructor("return process.env")()'
    );
  });

  it("blocks this.constructor.constructor(...) escape", async () => {
    await expectSafeRejection('this.constructor.constructor("return 1")()');
  });

  it("blocks (1).constructor member access", async () => {
    await expectSafeRejection("(1).constructor");
  });

  it("blocks bare 'process' identifier", async () => {
    const { error } = await expectSafeRejection("process");
    expect(error).toContain("Unknown identifier: process");
  });

  it("blocks require('fs') call", async () => {
    await expectSafeRejection('require("fs")');
  });

  it("blocks bare 'globalThis' identifier", async () => {
    const { error } = await expectSafeRejection("globalThis");
    expect(error).toContain("Unknown identifier: globalThis");
  });

  it("blocks calling 'constructor' as a whitelisted-looking function", async () => {
    // Own-property lookup on a null-prototype object never resolves
    // Object.prototype.constructor, even when called like a function.
    await expectSafeRejection("constructor(1)");
  });

  it("blocks '__proto__' used as an identifier", async () => {
    await expectSafeRejection("__proto__");
  });

  it("blocks 'toString' and 'hasOwnProperty' used as calls", async () => {
    await expectSafeRejection("toString()");
    await expectSafeRejection("hasOwnProperty(1)");
  });
});
