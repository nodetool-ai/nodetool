/**
 * Tests for js-sandbox.ts — sandboxed JavaScript execution.
 */

import { describe, expect, it } from "vitest";
import {
  runInSandbox,
  buildSandbox,
  serializeResult,
  truncate,
  cleanStack,
  wrapCode,
  MAX_OUTPUT_SIZE,
  MAX_LOOP_ITERATIONS,
} from "../src/js-sandbox.js";

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe("truncate", () => {
  it("returns text unchanged when within limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates and appends marker when exceeding limit", () => {
    const result = truncate("hello world", 5);
    expect(result).toBe("hello\n...[truncated]");
  });
});

// ---------------------------------------------------------------------------
// serializeResult
// ---------------------------------------------------------------------------

describe("serializeResult", () => {
  it("returns null for undefined", () => {
    expect(serializeResult(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(serializeResult(null)).toBeNull();
  });

  it("passes through numbers", () => {
    expect(serializeResult(42)).toBe(42);
  });

  it("passes through booleans", () => {
    expect(serializeResult(true)).toBe(true);
  });

  it("passes through short strings", () => {
    expect(serializeResult("hello")).toBe("hello");
  });

  it("truncates long strings", () => {
    const long = "x".repeat(MAX_OUTPUT_SIZE + 100);
    const result = serializeResult(long);
    expect(typeof result).toBe("string");
    expect((result as string).length).toBeLessThan(long.length);
    expect((result as string)).toContain("[truncated]");
  });

  it("serializes objects via JSON", () => {
    const result = serializeResult({ a: 1, b: "two" });
    expect(result).toEqual({ a: 1, b: "two" });
  });

  it("falls back to String() for non-serializable values", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = serializeResult(circular);
    expect(typeof result).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// cleanStack
// ---------------------------------------------------------------------------

describe("cleanStack", () => {
  it("filters out node: and node_modules lines", () => {
    const stack = [
      "Error: test",
      "    at evalmachine.<anonymous>:1:1",
      "    at node:internal/modules/cjs/loader:1234",
      "    at node_modules/something/index.js:5",
      "    at agent-js:2:3",
    ].join("\n");

    const cleaned = cleanStack(stack);
    expect(cleaned).toContain("evalmachine");
    expect(cleaned).toContain("agent-js");
    expect(cleaned).not.toContain("node:internal");
    expect(cleaned).not.toContain("node_modules");
  });

  it("limits to 5 lines", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `    at evalmachine:${i}`);
    const cleaned = cleanStack(lines.join("\n"));
    expect(cleaned.split("\n").length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// wrapCode
// ---------------------------------------------------------------------------

describe("wrapCode", () => {
  it("wraps code in async IIFE", () => {
    const wrapped = wrapCode("return 42");
    expect(wrapped).toContain("async");
    expect(wrapped).toContain("return 42");
    expect(wrapped).toContain("()");
  });
});

// ---------------------------------------------------------------------------
// buildSandbox
// ---------------------------------------------------------------------------

describe("buildSandbox", () => {
  it("provides console that captures logs", () => {
    const { sandbox, getLogs } = buildSandbox();
    const console = sandbox.console as { log: (...args: unknown[]) => void };
    console.log("hello", "world");
    expect(getLogs()).toEqual(["hello world"]);
  });

  it("provides sandbox with core JS globals", () => {
    const { sandbox } = buildSandbox();
    expect(sandbox.JSON).toBe(JSON);
    expect(sandbox.Math).toBe(Math);
    expect(sandbox.Array).toBe(Array);
    expect(sandbox.Promise).toBe(Promise);
  });

  it("blocks setTimeout and setInterval", () => {
    const { sandbox } = buildSandbox();
    expect(sandbox.setTimeout).toBeUndefined();
    expect(sandbox.setInterval).toBeUndefined();
  });

  it("provides lodash and dayjs", () => {
    const { sandbox } = buildSandbox();
    expect(sandbox._).toBeDefined();
    expect(sandbox.dayjs).toBeDefined();
  });

  it("provides workspace stubs without context", () => {
    const { sandbox } = buildSandbox();
    const ws = sandbox.workspace as { read: (p: string) => Promise<string> };
    expect(ws.read("test")).rejects.toThrow("not available without a context");
  });
});

// ---------------------------------------------------------------------------
// runInSandbox
// ---------------------------------------------------------------------------

describe("runInSandbox", () => {
  it("returns error for empty code", async () => {
    const result = await runInSandbox({ code: "  " });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No code provided");
  });

  it("executes simple expressions", async () => {
    const result = await runInSandbox({ code: "return 2 + 2" });
    expect(result.success).toBe(true);
    expect(result.result).toBe(4);
  });

  it("executes async code", async () => {
    const result = await runInSandbox({
      code: `
        const x = await Promise.resolve(42);
        return x;
      `,
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe(42);
  });

  it("captures console output", async () => {
    const result = await runInSandbox({
      code: `
        console.log("hello");
        console.warn("warning");
        return "done";
      `,
    });
    expect(result.success).toBe(true);
    expect(result.logs).toContain("hello");
    expect(result.logs).toContain("[warn] warning");
  });

  it("reports syntax errors", async () => {
    const result = await runInSandbox({ code: "const x = {;" });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("reports runtime errors", async () => {
    const result = await runInSandbox({
      code: "throw new Error('boom')",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("boom");
  });

  it("injects custom globals", async () => {
    const result = await runInSandbox({
      code: "return myInput * 2",
      globals: { myInput: 21 },
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe(42);
  });

  it("can use lodash", async () => {
    const result = await runInSandbox({
      code: "return _.sum([1, 2, 3, 4])",
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe(10);
  });

  it("can use JSON operations", async () => {
    const result = await runInSandbox({
      code: `
        const obj = JSON.parse('{"a": 1}');
        return JSON.stringify(obj);
      `,
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe('{"a":1}');
  });

  it("can use Array methods", async () => {
    const result = await runInSandbox({
      code: "return [3, 1, 2].sort().join(',')",
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("1,2,3");
  });

  it("can use Map and Set", async () => {
    const result = await runInSandbox({
      code: `
        const s = new Set([1, 2, 2, 3]);
        return s.size;
      `,
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe(3);
  });

  it("respects timeout", async () => {
    const result = await runInSandbox({
      code: "while(true) {}",
      timeoutMs: 100,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("serializes complex return values", async () => {
    const result = await runInSandbox({
      code: "return { name: 'test', values: [1, 2, 3] }",
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ name: "test", values: [1, 2, 3] });
  });
});
