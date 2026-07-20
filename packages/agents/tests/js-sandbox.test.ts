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
      "    at <anonymous> (user-code:3:5)",
      "    at node:internal/modules/cjs/loader:1234",
      "    at node_modules/something/index.js:5",
      "    at <anonymous> (<evalScript>:1:1)"
    ].join("\n");

    const cleaned = cleanStack(stack);
    expect(cleaned).toContain("user-code");
    expect(cleaned).toContain("<evalScript>");
    expect(cleaned).not.toContain("node:internal");
    expect(cleaned).not.toContain("node_modules");
  });

  it("preserves legacy node:vm frame markers", () => {
    const stack = [
      "Error: test",
      "    at evalmachine.<anonymous>:1:1",
      "    at agent-js:2:3"
    ].join("\n");
    const cleaned = cleanStack(stack);
    expect(cleaned).toContain("evalmachine");
    expect(cleaned).toContain("agent-js");
  });

  it("limits to 5 lines", () => {
    const lines = Array.from(
      { length: 10 },
      (_, i) => `    at <anonymous> (user-code:${i}:0)`
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
    expect(typeof sandbox.assetToSandbox).toBe("function");
    expect(typeof sandbox.sandboxToAsset).toBe("function");
  });

  it("provides workspace stubs without context", async () => {
    const { sandbox } = buildSandbox();
    const ws = sandbox.workspace as { read: (p: string) => Promise<string> };
    await expect(ws.read("test")).rejects.toThrow(
      "not available without a context"
    );
  });

  it("getSecret without context returns undefined", async () => {
    const { sandbox } = buildSandbox();
    const getSecret = sandbox.getSecret as (n: string) => Promise<unknown>;
    await expect(getSecret("ANY")).resolves.toBeUndefined();
  });

  it("asset bridge functions throw helpfully without context", async () => {
    const { sandbox } = buildSandbox();
    const assetToSandbox = sandbox.assetToSandbox as (
      assetId: string,
      path: string
    ) => Promise<string>;
    const sandboxToAsset = sandbox.sandboxToAsset as (
      path: string
    ) => Promise<unknown>;
    await expect(assetToSandbox("a1", "out/file.txt")).rejects.toThrow(
      "not available without a context"
    );
    await expect(sandboxToAsset("out/file.txt")).rejects.toThrow(
      "not available without a context"
    );
  });

  it("blocks SSRF to metadata / loopback / private hosts and non-http schemes", async () => {
    const { sandbox } = buildSandbox();
    const fetchFn = sandbox.fetch as (u: string) => Promise<unknown>;
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:7777/api",
      "http://localhost/x",
      "http://10.0.0.5/internal",
      "http://192.168.1.1/",
      "http://[::1]/",
      "file:///etc/passwd"
    ]) {
      await expect(fetchFn(url)).rejects.toThrow(
        /blocked|unsupported|invalid/i
      );
    }
  });
});

describe("buildSandbox workspace symlink containment", () => {
  it("blocks reads/writes through a symlink that escapes the workspace", async () => {
    const { mkdtemp, rm, writeFile, symlink } =
      await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join, isAbsolute } = await import("node:path");
    const ws = await mkdtemp(join(tmpdir(), "sbx-ws-"));
    const outside = await mkdtemp(join(tmpdir(), "sbx-out-"));
    try {
      await writeFile(join(outside, "secret.txt"), "SECRET\n");
      await symlink(join(outside, "secret.txt"), join(ws, "link.txt"));
      const context = {
        resolveWorkspacePath: (p: string) => (isAbsolute(p) ? p : join(ws, p))
      } as never;
      const { sandbox } = buildSandbox(context);
      const workspace = sandbox.workspace as {
        read: (p: string) => Promise<string>;
        write: (p: string, c: string) => Promise<void>;
      };
      await expect(workspace.read("link.txt")).rejects.toThrow(
        /outside the workspace/i
      );
      await expect(workspace.write("link.txt", "PWNED")).rejects.toThrow(
        /outside the workspace/i
      );
      // Host file untouched.
      const { readFile } = await import("node:fs/promises");
      expect(await readFile(join(outside, "secret.txt"), "utf-8")).toBe(
        "SECRET\n"
      );
    } finally {
      await rm(ws, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
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
      // `typeof` on an undeclared identifier returns "undefined" by spec
      // (works the same in QuickJS modules and node:vm).
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
    // Note: QuickJS's URL implementation doesn't propagate mutations on
    // `url.searchParams` back to the parent URL, so we build the query via
    // URLSearchParams directly and concatenate.
    const result = await runInSandbox({
      code: `
        const u = new URL("https://example.com/a?x=1");
        const p = new URLSearchParams(u.search);
        p.append("y", "2");
        return u.origin + u.pathname + "?" + p.toString();
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
    // The time limit is enforced by two mechanisms: the wall-clock race
    // (surfaces as "timeout") and the CPU-budget interrupt handler (surfaces
    // as "interrupted"). Which one trips first is load-dependent — under a
    // starved event loop the interrupt can win — so accept either. Both mean
    // the stall was stopped on time.
    expect(result.error).toMatch(/timeout|interrupted/i);
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

  it("enforces a CPU budget via the runtime interrupt handler", async () => {
    // Pure compute with no async yield points — only the engine's interrupt
    // handler can stop this. With node:vm this was advisory (wall-clock race
    // around the Promise); with QuickJS it's a hard interrupt on the runtime.
    const start = Date.now();
    const result = await runInSandbox({
      code: "let x = 0; while (true) { x++; } return x;",
      timeoutMs: 200
    });
    expect(result.success).toBe(false);
    // Should abort close to the deadline, not run forever.
    expect(Date.now() - start).toBeLessThan(3_000);
  });

  it("syncs mutations on object globals back to the host", async () => {
    // The CodeNode relies on being able to pass a `state` object and have
    // user-code mutations persist across invocations. With a true WASM
    // sandbox the guest heap is isolated from the host, so runInSandbox
    // syncs object globals back in place after execution.
    const state: Record<string, unknown> = { counter: 0, history: [] };

    const r1 = await runInSandbox({
      code: `
        state.counter += 1;
        state.history.push(state.counter);
        return state.counter;
      `,
      globals: { state }
    });
    expect(r1.success).toBe(true);
    expect(r1.result).toBe(1);
    expect(state).toEqual({ counter: 1, history: [1] });

    const r2 = await runInSandbox({
      code: `
        state.counter += 1;
        state.history.push(state.counter);
        return state.counter;
      `,
      globals: { state }
    });
    expect(r2.success).toBe(true);
    expect(r2.result).toBe(2);
    expect(state).toEqual({ counter: 2, history: [1, 2] });
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
    (globalThis as { fetch: unknown }).fetch = vi.fn(
      async () =>
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
    resolveWorkspacePath: (p: string) => `/tmp/fake-ws/${p}`,
    assetToSandbox: async (_assetId: string, p: string) => `/tmp/fake-ws/${p}`,
    sandboxToAsset: async (p: string) => ({
      type: "asset",
      uri: `asset://from-${p}`,
      asset_id: "a-from-sandbox"
    })
  } as unknown as import("@nodetool-ai/runtime").ProcessingContext;

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

  it("assetToSandbox forwards to the supplied context", async () => {
    const result = await runInSandbox({
      code: `return await assetToSandbox("asset-1", "downloads/file.txt");`,
      context: fakeContext
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("/tmp/fake-ws/downloads/file.txt");
  });

  it("sandboxToAsset forwards to the supplied context", async () => {
    const result = await runInSandbox({
      code: `return await sandboxToAsset("artifacts/image.png");`,
      context: fakeContext
    });
    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      type: "asset",
      asset_id: "a-from-sandbox"
    });
  });
});

describe("runInSandbox cancellation", () => {
  it("returns immediately when the signal is already aborted", async () => {
    const result = await runInSandbox({
      code: "return 1 + 1;",
      signal: AbortSignal.abort()
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Execution cancelled");
  });

  it("unwinds a sleeping script mid-flight instead of waiting it out", async () => {
    // Regression: script cancellation reached only sub-agent calls, so a script
    // parked in sleep()/fetch() ran until the (60 min) execution timeout.
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 50);

    const result = await runInSandbox({
      // Without abort-aware sleep this loops for ~25s (5 x 5s cap).
      code: "for (let i = 0; i < 5; i++) { await sleep(5000); }\nreturn 'finished';",
      timeoutMs: 60_000,
      signal: controller.signal
    });

    const elapsed = Date.now() - started;
    expect(result.success).toBe(false);
    // Must beat the 5s sleep cap: abort has to interrupt the *in-flight* nap,
    // not merely fail the next bridge call after it finishes naturally.
    expect(elapsed).toBeLessThan(2000);
  });

  it("stops the orphaned guest from doing more host work after cancel", async () => {
    // runInSandbox returns promptly via the cancellation race, but the guest
    // keeps running until QuickJS winds it down. These bridge-level guards are
    // what stop it burning host work (fetches, sub-agent calls) in the interim.
    const controller = new AbortController();
    let hostCalls = 0;

    const result = await runInSandbox({
      code: `
        for (let i = 0; i < 40; i++) {
          await tick();
          await sleep(50);
        }
        return "finished";
      `,
      timeoutMs: 60_000,
      signal: controller.signal,
      globals: {
        tick: async () => {
          hostCalls++;
          if (hostCalls === 3) controller.abort();
          return hostCalls;
        }
      }
    });

    expect(result.success).toBe(false);
    // Give the orphaned guest a moment to prove it has actually stopped.
    const callsAtCancel = hostCalls;
    await new Promise((r) => setTimeout(r, 300));
    expect(hostCalls).toBeLessThanOrEqual(callsAtCancel + 1);
    expect(hostCalls).toBeLessThan(40);
  });
});

describe("runInSandbox cancellation of CPU-bound guests", () => {
  it("interrupts a CPU-bound loop once cancellation has landed", async () => {
    // Regression: Promise.race cannot stop a CPU-bound guest — it never yields,
    // so the run only ended at executionTimeout (one hour under ScriptRunner).
    // QuickJS polls this interrupt handler from inside the interpreter, which
    // is the only thing that can break a spinning loop.
    //
    // The guest yields once (`await tick()`) before spinning. That is the shape
    // real orchestration scripts have — they await sub-agents constantly — and
    // it is what lets the abort flag get set in the first place. See the test
    // below for the case this cannot cover.
    const controller = new AbortController();
    const started = Date.now();

    const result = await runInSandbox({
      code: "await tick();\nwhile (true) {}\nreturn 'never';",
      timeoutMs: 20_000,
      signal: controller.signal,
      globals: {
        tick: async () => {
          controller.abort();
          return 1;
        }
      }
    });

    const elapsed = Date.now() - started;
    expect(result.success).toBe(false);
    expect(elapsed).toBeLessThan(3000);
  });

  it("documents the limit: a guest that never yields cannot be cancelled in-process", async () => {
    // A guest that spins from its first instruction blocks the host event loop,
    // so the Stop message cannot even be read and the abort flag can never be
    // set — the interrupt handler polls a flag that stays false. Cancelling
    // this case requires running QuickJS in a terminable worker.
    // This test pins the known behavior so a future worker migration has a
    // failing assertion to flip.
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 25);
    const started = Date.now();

    const result = await runInSandbox({
      code: "while (true) {}\nreturn 'never';",
      timeoutMs: 1_000,
      signal: controller.signal
    });

    expect(result.success).toBe(false);
    // Runs to its execution timeout despite the 25ms abort.
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  it("guards caller-injected async globals after cancel", async () => {
    // ScriptRunner injects __runAgent/__log as globals. These are host
    // functions and were added after the bridge guards, so a cancelled script
    // kept driving real work through them.
    const controller = new AbortController();
    let hostCalls = 0;

    const result = await runInSandbox({
      code: `
        for (let i = 0; i < 12; i++) {
          await customBridge();
        }
        return "finished";
      `,
      timeoutMs: 30_000,
      signal: controller.signal,
      globals: {
        customBridge: async () => {
          hostCalls++;
          if (hostCalls === 2) controller.abort();
          return hostCalls;
        }
      }
    });

    expect(result.success).toBe(false);
    const callsAtCancel = hostCalls;
    await new Promise((r) => setTimeout(r, 300));
    expect(hostCalls).toBeLessThanOrEqual(callsAtCancel + 1);
    expect(hostCalls).toBeLessThan(12);
  });
});
