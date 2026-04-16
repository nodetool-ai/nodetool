/**
 * Tests for js-sandbox.ts — sandboxed JavaScript execution.
 *
 * The sandbox is intentionally lib-free: only vanilla JS plus a handful of
 * bridge functions (fetch, workspace, getSecret, uuid, sleep, console).
 * These tests lock that contract down so future refactors can't accidentally
 * re-introduce lodash / dayjs / cheerio / csv-parse / validator into the
 * user-code surface.
 */

import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  runInSandbox,
  buildSandbox,
  serializeResult,
  truncate,
  cleanStack,
  wrapCode,
  MAX_OUTPUT_SIZE
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
    expect(result as string).toContain("[truncated]");
  });

  it("serializes objects via JSON", () => {
    const result = serializeResult({ a: 1, b: "two" });
    expect(result).toEqual({ a: 1, b: "two" });
  });

  it("preserves native Uint8Array", () => {
    const u8 = new Uint8Array([1, 2, 3]);
    const result = serializeResult(u8);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result as Uint8Array)).toEqual([1, 2, 3]);
  });

  it("falls back to String() for circular values", () => {
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
      "    at agent-js:2:3"
    ].join("\n");

    const cleaned = cleanStack(stack);
    expect(cleaned).toContain("evalmachine");
    expect(cleaned).toContain("agent-js");
    expect(cleaned).not.toContain("node:internal");
    expect(cleaned).not.toContain("node_modules");
  });

  it("limits to 5 lines", () => {
    const lines = Array.from(
      { length: 10 },
      (_, i) => `    at evalmachine:${i}`
    );
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
// buildSandbox — shape of the exposed surface
// ---------------------------------------------------------------------------

describe("buildSandbox", () => {
  it("provides console that captures logs", () => {
    const { sandbox, getLogs } = buildSandbox();
    const console = sandbox.console as { log: (...args: unknown[]) => void };
    console.log("hello", "world");
    expect(getLogs()).toEqual(["hello world"]);
  });

  it("provides console.warn/error/info with prefixes", () => {
    const { sandbox, getLogs } = buildSandbox();
    const console = sandbox.console as {
      warn: (...a: unknown[]) => void;
      error: (...a: unknown[]) => void;
      info: (...a: unknown[]) => void;
    };
    console.warn("w");
    console.error("e");
    console.info("i");
    expect(getLogs()).toEqual(["[warn] w", "[error] e", "[info] i"]);
  });

  it("provides core JS globals", () => {
    const { sandbox } = buildSandbox();
    expect(sandbox.JSON).toBe(JSON);
    expect(sandbox.Math).toBe(Math);
    expect(sandbox.Array).toBe(Array);
    expect(sandbox.Promise).toBe(Promise);
    expect(sandbox.Date).toBe(Date);
    expect(sandbox.RegExp).toBe(RegExp);
    expect(sandbox.URL).toBe(globalThis.URL);
    expect(sandbox.URLSearchParams).toBe(globalThis.URLSearchParams);
  });

  it("blocks setTimeout and setInterval", () => {
    const { sandbox } = buildSandbox();
    expect(sandbox.setTimeout).toBeUndefined();
    expect(sandbox.setInterval).toBeUndefined();
  });

  it("does NOT expose lodash, dayjs, cheerio, csvParse, or validator", () => {
    // This is the core invariant: the sandbox must stay lib-free.
    const { sandbox } = buildSandbox();
    expect(sandbox._).toBeUndefined();
    expect(sandbox.lodash).toBeUndefined();
    expect(sandbox.dayjs).toBeUndefined();
    expect(sandbox.cheerio).toBeUndefined();
    expect(sandbox.csvParse).toBeUndefined();
    expect(sandbox.validator).toBeUndefined();
  });

  it("exposes the bridge functions", () => {
    const { sandbox } = buildSandbox();
    expect(typeof sandbox.fetch).toBe("function");
    expect(typeof sandbox.uuid).toBe("function");
    expect(typeof sandbox.sleep).toBe("function");
    expect(typeof sandbox.getSecret).toBe("function");
    expect(typeof sandbox.workspace).toBe("object");
  });

  it("provides workspace stubs without context", () => {
    const { sandbox } = buildSandbox();
    const ws = sandbox.workspace as { read: (p: string) => Promise<string> };
    expect(ws.read("test")).rejects.toThrow("not available without a context");
  });

  it("getSecret without context returns undefined", async () => {
    const { sandbox } = buildSandbox();
    const getSecret = sandbox.getSecret as (n: string) => Promise<unknown>;
    await expect(getSecret("ANY")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// runInSandbox — functional behaviour
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

  it("executes async code with top-level await", async () => {
    const result = await runInSandbox({
      code: `
        const x = await Promise.resolve(42);
        return x;
      `
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
      `
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
      code: "throw new Error('boom')"
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("boom");
  });

  it("injects custom globals as input variables", async () => {
    const result = await runInSandbox({
      code: "return myInput * 2",
      globals: { myInput: 21 }
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe(42);
  });

  it("treats lodash/dayjs references as ReferenceError", async () => {
    // Lock the invariant: snippets that try to use the removed libs MUST fail
    // loudly instead of silently returning undefined.
    const cases = ["_", "dayjs", "cheerio", "csvParse", "validator"];
    for (const name of cases) {
      const result = await runInSandbox({ code: `return typeof ${name};` });
      // vm semantics: bare identifier reference returns "undefined" via typeof
      // without throwing, but invoking it throws.
      expect(result.success).toBe(true);
      expect(result.result).toBe("undefined");

      const call = await runInSandbox({ code: `return ${name}();` });
      expect(call.success).toBe(false);
    }
  });

  it("can use JSON operations", async () => {
    const result = await runInSandbox({
      code: `
        const obj = JSON.parse('{"a": 1}');
        return JSON.stringify(obj);
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe('{"a":1}');
  });

  it("can use Array methods", async () => {
    const result = await runInSandbox({
      code: "return [3, 1, 2].sort().join(',')"
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("1,2,3");
  });

  it("can use Map and Set", async () => {
    const result = await runInSandbox({
      code: `
        const s = new Set([1, 2, 2, 3]);
        return s.size;
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe(3);
  });

  it("can use native Date", async () => {
    const result = await runInSandbox({
      code: `return new Date(1_700_000_000_000).toISOString();`
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("2023-11-14T22:13:20.000Z");
  });

  it("can use URL and URLSearchParams", async () => {
    const result = await runInSandbox({
      code: `
        const u = new URL("https://example.com/a?x=1");
        u.searchParams.set("y", "2");
        return u.toString();
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("https://example.com/a?x=1&y=2");
  });

  it("respects timeout on infinite loops", async () => {
    const result = await runInSandbox({
      code: "while(true) {}",
      timeoutMs: 100
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("respects timeout on async stalls", async () => {
    const result = await runInSandbox({
      code: "await new Promise(() => {});",
      timeoutMs: 100
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/timeout/i);
  });

  it("serializes complex return values", async () => {
    const result = await runInSandbox({
      code: "return { name: 'test', values: [1, 2, 3] }"
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ name: "test", values: [1, 2, 3] });
  });

  it("disables eval / Function constructor (codeGeneration)", async () => {
    const r1 = await runInSandbox({ code: 'return eval("1+1");' });
    expect(r1.success).toBe(false);
    const r2 = await runInSandbox({
      code: 'return new Function("return 1")();'
    });
    expect(r2.success).toBe(false);
  });

  it("uuid() returns a valid v4 UUID", async () => {
    const result = await runInSandbox({ code: "return uuid();" });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("sleep(ms) pauses execution and is capped", async () => {
    const start = Date.now();
    const result = await runInSandbox({
      code: "await sleep(20); return Date.now();"
    });
    expect(result.success).toBe(true);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });

  it("sleep is capped at 5s so a malicious sleep(60000) still returns fast", async () => {
    const start = Date.now();
    const result = await runInSandbox({
      code: "await sleep(60000); return 'done';",
      timeoutMs: 10_000
    });
    expect(result.success).toBe(true);
    expect(Date.now() - start).toBeLessThan(6_000);
  });
});

// ---------------------------------------------------------------------------
// runInSandbox — fetch bridge
// ---------------------------------------------------------------------------

describe("runInSandbox fetch bridge", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    (globalThis as { fetch: typeof originalFetch }).fetch = originalFetch;
  });

  it("returns a Response-like object with parsed JSON", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(async () =>
      new Response(JSON.stringify({ hello: "world" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const result = await runInSandbox({
      code: `
        const r = await fetch("https://example.com/x");
        return { ok: r.ok, status: r.status, body: r.body, json: r.json };
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      ok: true,
      status: 200,
      json: { hello: "world" }
    });
  });

  it("exposes text(), arrayBuffer(), bytes() methods", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(
      async () => new Response("abc", { status: 200 })
    );
    const result = await runInSandbox({
      code: `
        const r = await fetch("https://example.com");
        const text = await r.text();
        const bytes = await r.bytes();
        return { text, firstByte: bytes[0] };
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ text: "abc", firstByte: 97 });
  });

  it("enforces the per-execution fetch cap", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(
      async () => new Response("{}", { status: 200 })
    );
    const result = await runInSandbox({
      code: `
        for (let i = 0; i < 50; i++) {
          await fetch("https://example.com/" + i);
        }
        return "ok";
      `
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Fetch limit exceeded/i);
  });
});

// ---------------------------------------------------------------------------
// runInSandbox — context bridge (workspace + getSecret)
// ---------------------------------------------------------------------------

describe("runInSandbox context bridge", () => {
  const fakeContext = {
    getSecret: async (name: string) =>
      name === "API_KEY" ? "super-secret" : null,
    resolveWorkspacePath: (p: string) => `/tmp/fake-ws/${p}`
  } as unknown as import("@nodetool/runtime").ProcessingContext;

  it("getSecret reads from the supplied context", async () => {
    const result = await runInSandbox({
      code: `return await getSecret("API_KEY");`,
      context: fakeContext
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("super-secret");
  });

  it("getSecret returns undefined for missing keys", async () => {
    const result = await runInSandbox({
      code: `return await getSecret("MISSING");`,
      context: fakeContext
    });
    expect(result.success).toBe(true);
    expect(result.result).toBeNull(); // undefined serialises to null
  });

  it("workspace.read throws helpfully when no context is provided", async () => {
    const result = await runInSandbox({
      code: `return await workspace.read("file.txt");`
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/workspace\.read is not available/);
  });
});
