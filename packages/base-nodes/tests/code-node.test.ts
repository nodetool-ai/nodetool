import { describe, it, expect } from "vitest";
import { CodeNode } from "../src/nodes/code-node.js";

function run(code: string, inputs: Record<string, unknown> = {}) {
  const node = new CodeNode({ code, ...inputs });
  return node.process();
}

// ---------------------------------------------------------------------------
// Dynamic inputs
// ---------------------------------------------------------------------------

describe("CodeNode — dynamic inputs", () => {
  it("passes dynamic inputs as local variables", async () => {
    const r = await run("return { sum: x + y }", { x: 3, y: 7 });
    expect(r).toEqual({ sum: 10 });
  });

  it("handles string inputs", async () => {
    const r = await run("return { upper: text.toUpperCase() }", {
      text: "hello"
    });
    expect(r).toEqual({ upper: "HELLO" });
  });

  it("handles many input types", async () => {
    const r = await run(
      "return { a: typeof n, b: typeof s, c: typeof b, d: Array.isArray(arr), e: typeof obj }",
      { n: 42, s: "hi", b: true, arr: [1, 2], obj: { k: 1 } }
    );
    expect(r).toEqual({
      a: "number",
      b: "string",
      c: "boolean",
      d: true,
      e: "object"
    });
  });

  it("filters out reserved keys (code, timeout)", async () => {
    // code and timeout should not leak as variables
    const r = await run("return { ok: true }", {
      code: "return { ok: true }",
      timeout: 5
    });
    expect(r).toEqual({ ok: true });
  });

  it("filters out underscore-prefixed framework keys", async () => {
    const r = await run("return { ok: true }", {
      _secrets: { key: "val" },
      __node_id: "n1"
    });
    expect(r).toEqual({ ok: true });
  });

  it("skips inputs with invalid JS identifier names", async () => {
    const r = await run("return { ok: true }", { "my-input": 1, "2fast": 2 });
    expect(r).toEqual({ ok: true });
  });

  it("skips JS reserved words as input names", async () => {
    // "class" is a reserved word — should not become a parameter
    const r = await run("return { ok: true }", { class: 1, for: 2, if: 3 });
    expect(r).toEqual({ ok: true });
  });

  it("works with no dynamic inputs", async () => {
    const r = await run("return { value: 42 }");
    expect(r).toEqual({ value: 42 });
  });
});

// ---------------------------------------------------------------------------
// Return value handling
// ---------------------------------------------------------------------------

describe("CodeNode — return values", () => {
  it("returns plain object keys as outputs", async () => {
    const r = await run("return { a: 1, b: 'two', c: true }");
    expect(r).toEqual({ a: 1, b: "two", c: true });
  });

  it("wraps array returns as { output }", async () => {
    const r = await run("return [1, 2, 3]");
    expect(r).toEqual({ output: [1, 2, 3] });
  });

  it("wraps primitive returns as { output }", async () => {
    expect(await run("return 42")).toEqual({ output: 42 });
    expect(await run('return "hello"')).toEqual({ output: "hello" });
    expect(await run("return true")).toEqual({ output: true });
  });

  it("returns {} for null", async () => {
    expect(await run("return null")).toEqual({});
  });

  it("returns {} for undefined / no return", async () => {
    expect(await run("return undefined")).toEqual({});
    expect(await run("const x = 1;")).toEqual({});
  });

  it("wraps Date return (serialized to ISO string)", async () => {
    const r = await run("return new Date('2024-01-01')");
    // After sandbox serialization, Date becomes a string
    expect(r).toHaveProperty("output");
  });

  it("wraps Map return (serialized via JSON)", async () => {
    const r = await run("return new Map([['a', 1]])");
    // Map serializes to {} via JSON
    expect(r).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Implicit return
// ---------------------------------------------------------------------------

describe("CodeNode — implicit return", () => {
  it("wraps object literal expression", async () => {
    const r = await run("{ sum: 3 + 4 }");
    expect(r).toEqual({ sum: 7 });
  });

  it("wraps simple identifier expression", async () => {
    const r = await run("x * 2", { x: 21 });
    expect(r).toEqual({ output: 42 });
  });

  it("wraps number literal", async () => {
    const r = await run("42");
    expect(r).toEqual({ output: 42 });
  });

  it("wraps string literal", async () => {
    const r = await run('"hello"');
    expect(r).toEqual({ output: "hello" });
  });

  it("wraps array literal", async () => {
    const r = await run("[1, 2, 3]");
    expect(r).toEqual({ output: [1, 2, 3] });
  });

  it("wraps template literal", async () => {
    const r = await run("`hello ${name}`", { name: "world" });
    expect(r).toEqual({ output: "hello world" });
  });

  it("wraps boolean literal", async () => {
    const r = await run("true");
    expect(r).toEqual({ output: true });
  });

  it("handles multi-line with expression on last line", async () => {
    const r = await run("const a = 1;\nconst b = 2;\n{ sum: a + b }");
    expect(r).toEqual({ sum: 3 });
  });

  it("does NOT wrap if/for/while statements", async () => {
    // These should run without error, returning undefined → {}
    expect(await run("if (true) {}")).toEqual({});
    expect(await run("for (let i = 0; i < 1; i++) {}")).toEqual({});
    expect(await run("while (false) {}")).toEqual({});
  });

  it("does NOT wrap const/let/var declarations", async () => {
    expect(await run("const x = 42")).toEqual({});
    expect(await run("let y = 'hi'")).toEqual({});
  });

  it("does not wrap when explicit return exists", async () => {
    const r = await run("const x = 1;\nreturn { x }");
    expect(r).toEqual({ x: 1 });
  });

  it("handles empty code", async () => {
    expect(await run("")).toEqual({});
  });

  it("returns {} for code with only comments", async () => {
    expect(await run("// just a comment")).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// hasReturnStatement — false positive resistance
// ---------------------------------------------------------------------------

describe("CodeNode — return detection avoids false positives", () => {
  it("ignores 'return' inside a string literal", async () => {
    const r = await run('const msg = "please return item";\n{ msg }');
    expect(r).toEqual({ msg: "please return item" });
  });

  it("ignores 'return' inside a comment", async () => {
    const r = await run("// return value\n{ val: 42 }");
    expect(r).toEqual({ val: 42 });
  });

  it("detects real return after string containing 'return'", async () => {
    const r = await run('const s = "return";\nreturn { s }');
    expect(r).toEqual({ s: "return" });
  });
});

// ---------------------------------------------------------------------------
// Async / await
// ---------------------------------------------------------------------------

describe("CodeNode — async support", () => {
  it("supports top-level await", async () => {
    const r = await run("const v = await Promise.resolve(42); return { v }");
    expect(r).toEqual({ v: 42 });
  });

  it("supports async iteration", async () => {
    const code = `
      async function* gen() { yield 1; yield 2; yield 3; }
      const arr = [];
      for await (const v of gen()) arr.push(v);
      return { arr };
    `;
    const r = await run(code);
    expect(r).toEqual({ arr: [1, 2, 3] });
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("CodeNode — errors", () => {
  it("throws on syntax error", async () => {
    await expect(run("const {{{")).rejects.toThrow();
  });

  it("throws on runtime error", async () => {
    await expect(run("undeclaredVar.foo")).rejects.toThrow();
  });

  it("propagates thrown errors", async () => {
    await expect(run('throw new Error("boom")')).rejects.toThrow("boom");
  });
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

describe("CodeNode — timeout", () => {
  it("times out on slow code (async delay)", async () => {
    // Use sleep (available in sandbox) since setTimeout is blocked
    await expect(run("await sleep(10000)", { timeout: 0.1 })).rejects.toThrow();
  });

  it("completes fast code within timeout", async () => {
    const r = await run("return { ok: true }", { timeout: 5 });
    expect(r).toEqual({ ok: true });
  });

  it("no timeout when set to 0", async () => {
    const node = new CodeNode({ code: "return { ok: true }", timeout: 0 });
    const r = await node.process();
    expect(r).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// Real-world patterns
// ---------------------------------------------------------------------------

describe("CodeNode — real-world patterns", () => {
  it("data transformation pipeline", async () => {
    const r = await run(
      `
      const words = text.split(" ");
      const lengths = words.map(w => w.length);
      const total = lengths.reduce((a, b) => a + b, 0);
      return { wordCount: words.length, avgLength: total / words.length };
      `,
      { text: "hello world foo" }
    );
    expect(r.wordCount).toBe(3);
    expect(r.avgLength).toBeCloseTo(13 / 3);
  });

  it("JSON processing", async () => {
    const r = await run(
      `
      const parsed = JSON.parse(jsonStr);
      const names = parsed.map(p => p.name);
      return { names, count: names.length };
      `,
      { jsonStr: '[{"name":"alice"},{"name":"bob"}]' }
    );
    expect(r).toEqual({ names: ["alice", "bob"], count: 2 });
  });

  it("math operations", async () => {
    const r = await run(
      "return { hyp: Math.sqrt(a*a + b*b), rounded: Math.round(a/b * 100) / 100 }",
      { a: 3, b: 4 }
    );
    expect(r).toEqual({ hyp: 5, rounded: 0.75 });
  });

  it("string formatting with template literals", async () => {
    const r = await run(
      "return { greeting: `Hello, ${name}! You have ${count} items.` }",
      { name: "Alice", count: 5 }
    );
    expect(r).toEqual({ greeting: "Hello, Alice! You have 5 items." });
  });

  it("pure JS string manipulation", async () => {
    const r = await run(
      `
      const reversed = text.split("").reverse().join("");
      return { reversed };
    `,
      { text: "hello" }
    );
    expect(r).toEqual({ reversed: "olleh" });
  });
});

// ---------------------------------------------------------------------------
// Static metadata
// ---------------------------------------------------------------------------

describe("CodeNode — metadata", () => {
  it("has correct nodeType", () => {
    expect(CodeNode.nodeType).toBe("nodetool.code.Code");
  });

  it("is dynamic", () => {
    expect(CodeNode.isDynamic).toBe(true);
  });

  it("supports dynamic outputs", () => {
    expect(CodeNode.supportsDynamicOutputs).toBe(true);
  });

  it("has code and timeout props", () => {
    const props = CodeNode.getDeclaredProperties();
    const names = props.map((p) => p.name);
    expect(names).toContain("code");
    expect(names).toContain("timeout");
  });
});

// ---------------------------------------------------------------------------
// Helper for streaming tests
// ---------------------------------------------------------------------------

async function collect(code: string, inputs: Record<string, unknown> = {}) {
  const node = new CodeNode({ code, ...inputs });
  const results: Record<string, unknown>[] = [];
  for await (const r of node.genProcess()) {
    results.push(r);
  }
  return results;
}

// ---------------------------------------------------------------------------
// genProcess streaming
// ---------------------------------------------------------------------------

// NOTE: The sandbox replaces `yield` with `yield_()` function calls.
// User code must use `yield(value)` with parentheses so the replacement
// produces `yield_(value)` which is a valid function call.

describe("CodeNode — genProcess streaming", () => {
  it("yields multiple plain objects", async () => {
    const results = await collect(
      "yield({ a: 1 }); yield({ b: 2 }); yield({ c: 3 });"
    );
    expect(results).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it("yields primitives wrapped as {output}", async () => {
    const results = await collect("yield(1); yield(2); yield(3);");
    expect(results).toEqual([{ output: 1 }, { output: 2 }, { output: 3 }]);
  });

  it("yields arrays wrapped as {output}", async () => {
    const results = await collect("yield([1,2]); yield([3,4]);");
    expect(results).toEqual([{ output: [1, 2] }, { output: [3, 4] }]);
  });

  it("yields mixed types", async () => {
    const results = await collect(
      'yield({ a: 1 }); yield(42); yield([1]); yield("hello");'
    );
    expect(results).toEqual([
      { a: 1 },
      { output: 42 },
      { output: [1] },
      { output: "hello" }
    ]);
  });

  it("skips null and undefined yields", async () => {
    const results = await collect(
      "yield(null); yield({ a: 1 }); yield(undefined); yield({ b: 2 });"
    );
    expect(results).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("collects yielded values", async () => {
    const results = await collect("yield({ step: 1 }); yield({ step: 2 });");
    expect(results).toEqual([{ step: 1 }, { step: 2 }]);
  });

  it("handles no return after yields", async () => {
    const results = await collect("yield({ a: 1 }); yield({ b: 2 });");
    expect(results).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("passes dynamic inputs to generator", async () => {
    const results = await collect(
      "yield({ sum: x + y }); yield({ product: x * y });",
      { x: 3, y: 7 }
    );
    expect(results).toEqual([{ sum: 10 }, { product: 21 }]);
  });

  it("async yields with await", async () => {
    const results = await collect(
      "yield({ a: await Promise.resolve(1) }); yield({ b: await Promise.resolve(2) });"
    );
    expect(results).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

// ---------------------------------------------------------------------------
// genProcess fallback (no yield)
// ---------------------------------------------------------------------------

describe("CodeNode — genProcess fallback (no yield)", () => {
  it("falls back to process() for non-yield code", async () => {
    const results = await collect("return { x: 42 }");
    expect(results).toEqual([{ x: 42 }]);
  });

  it("falls back for implicit return", async () => {
    const results = await collect("{ sum: 3 + 4 }");
    expect(results).toEqual([{ sum: 7 }]);
  });

  it("falls back for primitive return", async () => {
    const results = await collect("return 42");
    expect(results).toEqual([{ output: 42 }]);
  });

  it('ignores "yield" in strings', async () => {
    const results = await collect('const s = "yield stuff"; return { s }');
    expect(results).toEqual([{ s: "yield stuff" }]);
  });

  it('ignores "yield" in comments', async () => {
    const results = await collect("// yield value\nreturn { ok: true }");
    expect(results).toEqual([{ ok: true }]);
  });
});

// ---------------------------------------------------------------------------
// genProcess timeout
// ---------------------------------------------------------------------------

describe("CodeNode — genProcess timeout", () => {
  it("times out on slow generator", async () => {
    const code = "yield({ a: 1 }); await sleep(10000);";
    await expect(collect(code, { timeout: 0.1 })).rejects.toThrow();
  });

  it("completes fast generator within timeout", async () => {
    const results = await collect("yield({ a: 1 }); yield({ b: 2 });", {
      timeout: 5
    });
    expect(results).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

// ---------------------------------------------------------------------------
// genProcess errors
// ---------------------------------------------------------------------------

describe("CodeNode — genProcess errors", () => {
  it("throws on syntax error", async () => {
    await expect(collect("yield({{{")).rejects.toThrow();
  });

  it("throws on runtime error in generator", async () => {
    await expect(
      collect("yield({ a: 1 }); undeclaredVar.foo;")
    ).rejects.toThrow();
  });

  it("propagates thrown error", async () => {
    await expect(
      collect('yield({ a: 1 }); throw new Error("boom");')
    ).rejects.toThrow("boom");
  });
});

// ---------------------------------------------------------------------------
// genProcess yield detection
// ---------------------------------------------------------------------------

describe("CodeNode — genProcess yield detection", () => {
  it("detects yield in simple code", async () => {
    const results = await collect("yield({ x: 1 });");
    expect(results).toEqual([{ x: 1 }]);
  });

  it("ignores yield in double-quoted string", async () => {
    const results = await collect('const s = "yield something"; return { s }');
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ s: "yield something" });
  });

  it("ignores yield in single-quoted string", async () => {
    const results = await collect("const s = 'yield something'; return { s }");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ s: "yield something" });
  });

  it("ignores yield in template literal", async () => {
    const results = await collect("const s = `yield something`; return { s }");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ s: "yield something" });
  });

  it("ignores yield in single-line comment", async () => {
    const results = await collect("// yield value\nreturn { ok: true }");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  it("ignores yield in multi-line comment", async () => {
    const results = await collect("/* yield value */\nreturn { ok: true }");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true });
  });

  it('detects real yield after string containing "yield"', async () => {
    // Note: the \byield\b replacement also affects "yield" inside strings,
    // so the string value becomes "yield_". This is a known limitation.
    const results = await collect('const s = "yield"; yield({ s });');
    expect(results).toEqual([{ s: "yield_" }]);
  });
});

// ---------------------------------------------------------------------------
// Input type coverage
// ---------------------------------------------------------------------------

describe("CodeNode — input type coverage", () => {
  // Numbers
  it("handles integer input", async () => {
    const r = await run("return { v: n }", { n: 42 });
    expect(r).toEqual({ v: 42 });
  });

  it("handles float input", async () => {
    const r = await run("return { v: n }", { n: 3.14 });
    expect(r).toEqual({ v: 3.14 });
  });

  it("handles negative number input", async () => {
    const r = await run("return { v: n }", { n: -7 });
    expect(r).toEqual({ v: -7 });
  });

  it("handles zero input", async () => {
    const r = await run("return { v: n }", { n: 0 });
    expect(r).toEqual({ v: 0 });
  });

  it("handles Infinity input (becomes null via JSON)", async () => {
    const r = await run("return { v: n }", { n: Infinity });
    expect(r.v).toBeNull();
  });

  it("handles NaN input (becomes null via JSON)", async () => {
    const r = await run("return { v: n }", { n: NaN });
    expect(r.v).toBeNull();
  });

  // Strings
  it("handles empty string input", async () => {
    const r = await run("return { v: s }", { s: "" });
    expect(r).toEqual({ v: "" });
  });

  it("handles unicode string input", async () => {
    const r = await run("return { v: s }", {
      s: "Hello \u{1F600} \u00E9\u00E8"
    });
    expect(r).toEqual({ v: "Hello \u{1F600} \u00E9\u00E8" });
  });

  it("handles multiline string input", async () => {
    const r = await run("return { v: s }", { s: "line1\nline2\nline3" });
    expect(r).toEqual({ v: "line1\nline2\nline3" });
  });

  // Booleans
  it("handles true input", async () => {
    const r = await run("return { v: b }", { b: true });
    expect(r).toEqual({ v: true });
  });

  it("handles false input", async () => {
    const r = await run("return { v: b }", { b: false });
    expect(r).toEqual({ v: false });
  });

  // null
  it("handles null input", async () => {
    const r = await run("return { v: n === null }", { n: null });
    expect(r).toEqual({ v: true });
  });

  // undefined
  it("handles undefined input", async () => {
    const r = await run("return { v: u === undefined }", { u: undefined });
    expect(r).toEqual({ v: true });
  });

  // Arrays
  it("handles empty array input", async () => {
    const r = await run("return { v: arr, len: arr.length }", { arr: [] });
    expect(r).toEqual({ v: [], len: 0 });
  });

  it("handles nested array input", async () => {
    const r = await run("return { v: arr[1][0] }", {
      arr: [
        [1, 2],
        [3, 4]
      ]
    });
    expect(r).toEqual({ v: 3 });
  });

  it("handles typed array input (Uint8Array becomes plain object via JSON)", async () => {
    const ta = new Uint8Array([10, 20, 30]);
    const r = await run("return { v: arr, type: typeof arr }", { arr: ta });
    expect(r.v).toEqual({ "0": 10, "1": 20, "2": 30 });
    expect(r.type).toBe("object");
  });

  // Objects
  it("handles empty object input", async () => {
    const r = await run("return { v: Object.keys(obj).length }", { obj: {} });
    expect(r).toEqual({ v: 0 });
  });

  it("handles nested object input", async () => {
    const r = await run("return { v: obj.a.b.c }", {
      obj: { a: { b: { c: 42 } } }
    });
    expect(r).toEqual({ v: 42 });
  });

  it("handles object with methods input (methods stripped by JSON)", async () => {
    const obj = {
      x: 10,
      double() {
        return this.x * 2;
      }
    };
    const r = await run("return { v: obj.x, hasDouble: typeof obj.double }", {
      obj
    });
    expect(r).toEqual({ v: 10, hasDouble: "undefined" });
  });

  // Date
  it("handles Date input (becomes ISO string via JSON)", async () => {
    const d = new Date("2024-06-15T12:00:00Z");
    const r = await run("return { v: d, type: typeof d }", { d });
    expect(r.v).toBe("2024-06-15T12:00:00.000Z");
    expect(r.type).toBe("string");
  });

  // Buffer
  it("handles Buffer input (becomes object with type/data via JSON)", async () => {
    const buf = Buffer.from("hello");
    const r = await run("return { v: buf }", { buf });
    expect(r.v).toEqual({ type: "Buffer", data: [104, 101, 108, 108, 111] });
  });

  // Map
  it("handles Map input (becomes {} via JSON)", async () => {
    const m = new Map([
      ["a", 1],
      ["b", 2]
    ]);
    const r = await run("return { v: m }", { m });
    expect(r.v).toEqual({});
  });

  // Set
  it("handles Set input (becomes {} via JSON)", async () => {
    const s = new Set([1, 2, 3]);
    const r = await run("return { v: s }", { s });
    expect(r.v).toEqual({});
  });

  // RegExp
  it("handles RegExp input (becomes {} via JSON)", async () => {
    const re = /foo(\d+)/g;
    const r = await run("return { v: re }", { re });
    expect(r.v).toEqual({});
  });

  // Error
  it("handles Error input (becomes {} via JSON)", async () => {
    const err = new Error("test error");
    const r = await run("return { v: err }", { err });
    expect(r.v).toEqual({});
  });

  // BigInt
  it("handles BigInt input (becomes null — JSON.stringify throws)", async () => {
    const big = BigInt(999999999999999999n);
    const r = await run("return { v: big }", { big });
    expect(r.v).toBeNull();
  });

  // Function (callback)
  it("handles function input (becomes null via JSON)", async () => {
    const fn = (x: number) => x * 3;
    const r = await run("return { v: fn }", { fn });
    expect(r.v).toBeNull();
  });

  // Symbol (as a value)
  it("handles Symbol as an input value (becomes null via JSON)", async () => {
    const sym = Symbol("test");
    const r = await run("return { v: sym }", { sym });
    expect(r.v).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Output type coverage
// ---------------------------------------------------------------------------

describe("CodeNode — output type coverage", () => {
  it("returns plain number in object", async () => {
    const r = await run("return { n: 42 }");
    expect(r).toEqual({ n: 42 });
  });

  it("returns string in object", async () => {
    const r = await run('return { s: "hello" }');
    expect(r).toEqual({ s: "hello" });
  });

  it("returns boolean in object", async () => {
    const r = await run("return { b: true }");
    expect(r).toEqual({ b: true });
  });

  it("returns array in object", async () => {
    const r = await run("return { arr: [1, 2, 3] }");
    expect(r).toEqual({ arr: [1, 2, 3] });
  });

  it("returns nested objects in object", async () => {
    const r = await run("return { nested: { a: { b: 1 } } }");
    expect(r).toEqual({ nested: { a: { b: 1 } } });
  });

  it("returns Date in object (serialized to ISO string)", async () => {
    const r = await run("return { d: new Date('2024-01-01T00:00:00Z') }");
    expect(r.d).toBe("2024-01-01T00:00:00.000Z");
  });

  it("returns Map in object (serialized to empty via JSON)", async () => {
    const r = await run('return { m: new Map([["a", 1]]) }');
    expect(r).toHaveProperty("m");
  });

  it("returns Set in object (serialized to empty via JSON)", async () => {
    const r = await run("return { s: new Set([1, 2, 3]) }");
    expect(r).toHaveProperty("s");
  });

  it("returns RegExp in object (serialized to empty via JSON)", async () => {
    const r = await run("return { re: /abc/g }");
    expect(r).toHaveProperty("re");
  });

  // Non-plain objects — after sandbox serialization these become serialized values
  it("wraps Date return as { output } (serialized to ISO string)", async () => {
    const r = await run("return new Date('2024-01-01')");
    expect(r).toHaveProperty("output");
  });

  it("wraps Set return (serialized via JSON)", async () => {
    const r = await run("return new Set([1])");
    // Set serializes to {} via JSON, then normalizeOutput wraps or returns it
    expect(r).toBeDefined();
  });

  it("wraps RegExp return (serialized via JSON)", async () => {
    const r = await run("return /abc/");
    expect(r).toBeDefined();
  });

  it("wraps Error return (serialized via JSON)", async () => {
    const r = await run('return new Error("x")');
    expect(r).toBeDefined();
  });

  it("wraps empty string return as { output }", async () => {
    const r = await run('return ""');
    expect(r).toEqual({ output: "" });
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("CodeNode — edge cases", () => {
  it("returns empty object for return {}", async () => {
    const r = await run("return {}");
    expect(r).toEqual({});
  });

  it("handles object with numeric keys", async () => {
    const r = await run('return { 0: "a", 1: "b" }');
    expect(r).toEqual({ 0: "a", 1: "b" });
  });

  it("handles very large return array", async () => {
    const r = await run(
      "return { data: Array.from({length: 10000}, (_, i) => i) }"
    );
    expect((r.data as number[]).length).toBe(10000);
    expect((r.data as number[])[0]).toBe(0);
    expect((r.data as number[])[9999]).toBe(9999);
  });

  it("returns input object (deep copy, not same reference)", async () => {
    const complex = { a: [1, 2], b: { c: "d" }, e: true };
    const r = await run("return { x }", { x: complex });
    expect(r).toEqual({ x: complex });
    // Inputs are deep-copied via JSON round-trip
    expect(r.x).not.toBe(complex);
    expect(r.x).toEqual(complex);
  });

  it("modifying input array inside code does not affect original", async () => {
    const arr = [1, 2, 3];
    const r = await run("arr.push(4); return { arr }", { arr });
    expect(r).toEqual({ arr: [1, 2, 3, 4] });
    // Original array is NOT mutated (inputs are deep-copied)
    expect(arr).toEqual([1, 2, 3]);
  });

  it("destructures input objects", async () => {
    const obj = { a: 1, b: 2 };
    const r = await run("const { a, b } = obj; return { a, b }", { obj });
    expect(r).toEqual({ a: 1, b: 2 });
  });
});
