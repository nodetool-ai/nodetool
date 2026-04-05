import { describe, it, expect } from "vitest";
import { CalculatorTool } from "../src/tools/calculator-tool.js";
import { extractJSON } from "../src/utils/json-parser.js";

// Minimal mock context for tool process calls
const mockContext = {} as any;

describe("CalculatorTool", () => {
  const calc = new CalculatorTool();

  it("evaluates basic arithmetic", async () => {
    const result = await calc.process(mockContext, { expression: "2 + 3 * 4" });
    expect(result).toEqual({ result: 14 });
  });

  it("supports math functions", async () => {
    const result = await calc.process(mockContext, { expression: "sqrt(16)" });
    expect(result).toEqual({ result: 4 });
  });

  it("supports constants", async () => {
    const result = await calc.process(mockContext, { expression: "PI" });
    expect(result).toEqual({ result: Math.PI });
  });

  it("returns error for invalid expression", async () => {
    const result = (await calc.process(mockContext, {
      expression: "foo bar baz"
    })) as Record<string, unknown>;
    expect(result).toHaveProperty("error");
  });

  it("returns error for non-string expression", async () => {
    const result = (await calc.process(mockContext, {
      expression: 42
    })) as Record<string, unknown>;
    expect(result).toHaveProperty("error");
  });

  it("has correct provider tool shape", () => {
    const pt = calc.toProviderTool();
    expect(pt.name).toBe("calculate");
    expect(pt.description).toBeTruthy();
    expect(pt.inputSchema).toBeDefined();
  });

  it("returns error for non-finite number (Infinity)", async () => {
    const result = (await calc.process(mockContext, {
      expression: "1/0"
    })) as Record<string, unknown>;
    expect(result).toHaveProperty("error");
    expect(result.error).toContain("finite number");
  });

  it("returns error for NaN", async () => {
    const result = (await calc.process(mockContext, {
      expression: "sqrt(-1)"
    })) as Record<string, unknown>;
    expect(result).toHaveProperty("error");
    expect(result.error).toContain("finite number");
  });

  it("userMessage returns descriptive string", () => {
    const msg = calc.userMessage({ expression: "2+2" });
    expect(msg).toBe("Calculating: 2+2");
  });

  it("userMessage handles missing expression", () => {
    const msg = calc.userMessage({});
    expect(msg).toBe("Calculating: ");
  });
});

describe("extractJSON", () => {
  it("parses plain JSON string", () => {
    expect(extractJSON('{"a": 1}')).toEqual({ a: 1 });
  });

  it("extracts from fenced code block", () => {
    const text = 'Here is the result:\n```json\n{"key": "value"}\n```\nDone.';
    expect(extractJSON(text)).toEqual({ key: "value" });
  });

  it("extracts balanced braces from text", () => {
    const text = 'The answer is {"x": 42} and more text.';
    expect(extractJSON(text)).toEqual({ x: 42 });
  });

  it("returns null for non-JSON text", () => {
    expect(extractJSON("Hello, world!")).toBeNull();
  });

  it("handles nested objects", () => {
    const text = '{"outer": {"inner": true}}';
    expect(extractJSON(text)).toEqual({ outer: { inner: true } });
  });

  it("handles strings with braces inside", () => {
    const text = '{"msg": "hello {world}"}';
    expect(extractJSON(text)).toEqual({ msg: "hello {world}" });
  });
});
