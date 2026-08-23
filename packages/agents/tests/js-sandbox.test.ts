/**
 * Tests for js-sandbox.ts — sandboxed JavaScript execution.
 *
 * The sandbox is intentionally lib-free: only vanilla JS plus a handful of
 * bridge functions (fetch, workspace, getSecret, sleep, console).
 * These tests lock that contract down so future refactors can't accidentally
 * re-introduce lodash / dayjs / cheerio / csv-parse / validator into the
 * user-code surface.
 */

import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { createLocalWorkspace } from "@nodetool-ai/runtime";
import {
  runInSandbox,
  buildSandbox,
  serializeResult,
  truncate,
  cleanStack,
  wrapCode,
  resolveSandboxLimits,
  MAX_OUTPUT_SIZE,
  MAX_FETCH_CALLS,
  GUEST_MEMORY_LIMIT,
  MAX_CONSOLE_LOGS,
  MAX_CONSOLE_LOG_CHARS
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

  it("drops the engine-provided timer globals before user code", () => {
    const wrapped = wrapCode("return 42");
    for (const name of [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "setImmediate",
      "clearImmediate"
    ]) {
      expect(wrapped).toContain(`delete globalThis.${name};`);
    }
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
      "file:///etc/passwd",
      // IPv4-mapped / NAT64 IPv6 — the URL parser hex-serializes these, so the
      // dotted-quad check misses them unless the embedded v4 is extracted.
      "http://[::ffff:169.254.169.254]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:7f00:1]/",
      "http://[64:ff9b::a9fe:a9fe]/",
      // IPv4-compatible IPv6 — canonicalizes to [::a9fe:a9fe].
      "http://[::169.254.169.254]/"
    ]) {
      await expect(fetchFn(url)).rejects.toThrow(
        /blocked|unsupported|invalid/i
      );
    }
  });

  it("re-validates every redirect hop, not just the initial URL", async () => {
    // Prove per-hop validation: the first hop is an allowed loopback origin
    // (allowPrivateNetwork), which 302s to a file: URL. The scheme check runs
    // on every hop regardless of allowPrivateNetwork, so the follow-up is
    // rejected — a redirect target is validated before the next request.
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => {
      res.writeHead(302, { Location: "file:///etc/passwd" });
      res.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    const port = (server.address() as { port: number }).port;
    try {
      const { sandbox } = buildSandbox(undefined, undefined, {
        allowPrivateNetwork: true
      });
      const fetchFn = sandbox.fetch as (u: string) => Promise<unknown>;
      await expect(fetchFn(`http://127.0.0.1:${port}/`)).rejects.toThrow(
        /unsupported scheme/i
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("strips credential headers on a cross-origin redirect but keeps them same-origin", async () => {
    // Hop A 302s to hop B on a different port (a different origin, since origin
    // includes the port). The forwarded headers must lose Authorization/Cookie
    // but keep X-Keep.
    const { createServer } = await import("node:http");
    let hopBHeaders: Record<string, string | string[] | undefined> = {};
    const hopB = createServer((req, res) => {
      hopBHeaders = req.headers;
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
    await new Promise<void>((resolve) => hopB.listen(0, "127.0.0.1", resolve));
    const portB = (hopB.address() as { port: number }).port;
    const hopA = createServer((_req, res) => {
      res.writeHead(302, { Location: `http://127.0.0.1:${portB}/` });
      res.end();
    });
    await new Promise<void>((resolve) => hopA.listen(0, "127.0.0.1", resolve));
    const portA = (hopA.address() as { port: number }).port;
    try {
      const { sandbox } = buildSandbox(undefined, undefined, {
        allowPrivateNetwork: true
      });
      const fetchFn = sandbox.fetch as (
        u: string,
        o?: Record<string, unknown>
      ) => Promise<{ status: number }>;
      const res = await fetchFn(`http://127.0.0.1:${portA}/`, {
        headers: {
          Authorization: "secret",
          Cookie: "session=secret",
          "X-Keep": "1"
        }
      });
      expect(res.status).toBe(200);
      expect(hopBHeaders["authorization"]).toBeUndefined();
      expect(hopBHeaders["cookie"]).toBeUndefined();
      expect(hopBHeaders["x-keep"]).toBe("1");
    } finally {
      await new Promise<void>((resolve) => hopA.close(() => resolve()));
      await new Promise<void>((resolve) => hopB.close(() => resolve()));
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
        workspace: createLocalWorkspace(ws),
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

  it("forwards console output to onLog as it happens", async () => {
    const seen: Array<[string, string]> = [];
    const result = await runInSandbox({
      code: `
        console.log("hello", 1);
        console.info("note");
        console.warn("warning");
        console.error("boom");
        return "done";
      `,
      onLog: (level, message) => seen.push([level, message])
    });
    expect(result.success).toBe(true);
    expect(seen).toEqual([
      ["log", "hello 1"],
      ["info", "note"],
      ["warn", "warning"],
      ["error", "boom"]
    ]);
    expect(result.logs).toEqual([
      "hello 1",
      "[info] note",
      "[warn] warning",
      "[error] boom"
    ]);
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

  it("crypto.randomUUID() returns a valid v4 UUID and uuid() is gone", async () => {
    const result = await runInSandbox({ code: "return crypto.randomUUID();" });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    const removed = await runInSandbox({ code: "return uuid();" });
    expect(removed.success).toBe(false);
    expect(removed.error).toMatch(/uuid/);
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

  it("syncs object globals after guest code throws", async () => {
    const state: Record<string, unknown> = { queued: [] };

    const result = await runInSandbox({
      code: `
        state.queued.push({ tool: "ui_add_node", id: "node-1" });
        throw new Error("commit failed");
      `,
      globals: { state }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("commit failed");
    expect(state).toEqual({
      queued: [{ tool: "ui_add_node", id: "node-1" }]
    });
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
// runInSandbox — async concurrency
//
// The contract these pin: a bridge call starts its host-side work when
// invoked, not when awaited, so Promise combinators and parallelMap fan work
// out in parallel. A library upgrade that silently serialized host promises
// would fail the wall-clock and in-flight assertions here.
// ---------------------------------------------------------------------------

describe("runInSandbox async concurrency", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    (globalThis as { fetch: typeof originalFetch }).fetch = originalFetch;
  });

  /** Mock fetch that resolves after `delayMs` and records peak concurrency. */
  const trackingFetch = (delayMs: number) => {
    let inFlight = 0;
    const state = { maxInFlight: 0, calls: 0 };
    (globalThis as { fetch: unknown }).fetch = vi.fn(async (url: string) => {
      state.calls++;
      inFlight++;
      state.maxInFlight = Math.max(state.maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, delayMs));
      inFlight--;
      return new Response(JSON.stringify({ url }), { status: 200 });
    });
    return state;
  };

  it("runs bridge calls under Promise.all in parallel", async () => {
    const state = trackingFetch(150);
    const started = Date.now();
    const result = await runInSandbox({
      code: `
        const urls = Array.from({ length: 5 }, (_, i) => "https://example.com/" + i);
        const responses = await Promise.all(urls.map((u) => fetch(u)));
        return responses.every((r) => r.ok);
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe(true);
    expect(state.maxInFlight).toBe(5);
    // Serialized, five 150ms fetches would take >= 750ms.
    expect(Date.now() - started).toBeLessThan(700);
  });

  it("runs concurrent sleeps in parallel", async () => {
    const started = Date.now();
    const result = await runInSandbox({
      code: `
        await Promise.all([sleep(300), sleep(300), sleep(300)]);
        return "done";
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("done");
    expect(Date.now() - started).toBeLessThan(800);
  });

  it("supports Promise.allSettled and Promise.race over bridges", async () => {
    const result = await runInSandbox({
      code: `
        const settled = await Promise.allSettled([
          sleep(10),
          fetch("nonsense://blocked")
        ]);
        const raced = await Promise.race([
          sleep(200).then(() => "slow"),
          sleep(1).then(() => "fast")
        ]);
        return { states: settled.map((s) => s.status), raced };
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      states: ["fulfilled", "rejected"],
      raced: "fast"
    });
  });

  it("parallelMap preserves input order and bounds concurrency", async () => {
    const state = trackingFetch(100);
    const result = await runInSandbox({
      code: `
        const items = [0, 1, 2, 3, 4, 5];
        const out = await parallelMap(items, async (n, i) => {
          const r = await fetch("https://example.com/" + n);
          return n * 10 + i;
        }, 2);
        return out;
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual([0, 11, 22, 33, 44, 55]);
    expect(state.calls).toBe(6);
    expect(state.maxInFlight).toBeLessThanOrEqual(2);
    expect(state.maxInFlight).toBeGreaterThan(1);
  });

  it("parallelMap handles empty input and rejects on the first failure", async () => {
    const result = await runInSandbox({
      code: `
        const empty = await parallelMap([], async () => 1);
        let failed = null;
        try {
          await parallelMap([1, 2, 3], async (n) => {
            if (n === 2) throw new Error("boom at " + n);
            return n;
          });
        } catch (e) {
          failed = e.message;
        }
        return { empty, failed };
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ empty: [], failed: "boom at 2" });
  });

  it("enforces the fetch cap across parallel calls", async () => {
    trackingFetch(5);
    const result = await runInSandbox({
      code: `
        const urls = Array.from({ length: 30 }, (_, i) => "https://example.com/" + i);
        await Promise.all(urls.map((u) => fetch(u)));
        return "ok";
      `
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Fetch limit exceeded/i);
  });

  it("does not expose timer globals to user code", async () => {
    const result = await runInSandbox({
      code: `
        return [
          typeof setTimeout, typeof clearTimeout,
          typeof setInterval, typeof clearInterval,
          typeof setImmediate, typeof clearImmediate
        ];
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual(Array(6).fill("undefined"));
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

/**
 * Both tests below time how fast a cancellation reaches a spinning guest, and
 * both cancel by terminating the worker — which drops it from the pool, so the
 * next run spawns a fresh one. Spawning is the expensive part (a WASM
 * instantiation, and under tsx a recompile of the whole sandbox graph):
 * measured here, a cold cancellation run takes ~900ms against a ~16ms warm one,
 * and a contended CI runner has been seen paying 7-13s for a single spawn. That
 * is startup, not interrupt latency, and a budget written for the latter cannot
 * absorb it — one CI run failed `elapsed < 3000` at 11191ms on a cancellation
 * that worked. Leaving an idle worker in the pool first keeps each budget
 * measuring what its test is named after.
 *
 * The warm-up has to outlive a cold boot, not just its own no-op run.
 * `runInWorker` arms its backstop — `timeoutMs` + 5 s — before the worker has
 * loaded a single module, so a 5 s warm-up was reaped at 10 s on a runner whose
 * boot takes ~11 s. That terminates the worker, so the pool stayed cold and the
 * budget below measured the boot after all: `elapsed < 3000` failed again, at
 * 11175 ms. Asserting the warm run succeeded keeps a cold pool from arriving
 * disguised as an interrupt-latency regression.
 */
async function warmSandboxWorkerPool(): Promise<void> {
  const result = await runInSandbox({ code: "return 1;", timeoutMs: 120_000 });
  expect(result.success).toBe(true);
}

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
    await warmSandboxWorkerPool();
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

  it("cancels a guest that never yields", async () => {
    // The case the worker exists for. A guest that spins from its first
    // instruction used to block the host event loop until its execution
    // timeout — the abort listener could never run, so the flag the interrupt
    // handler polled stayed false. On the worker path the host thread stays
    // free and abort terminates the worker outright.
    await warmSandboxWorkerPool();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 25);
    const started = Date.now();

    const result = await runInSandbox({
      code: "while (true) {}\nreturn 'never';",
      timeoutMs: 30_000,
      signal: controller.signal
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Execution cancelled");
    // Well before the 30s execution timeout.
    expect(Date.now() - started).toBeLessThan(5_000);
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

// ---------------------------------------------------------------------------
// crypto bridge
// ---------------------------------------------------------------------------

describe("runInSandbox crypto bridge", () => {
  it("digests a string with the known SHA-256 vector for 'abc'", async () => {
    const result = await runInSandbox({
      code: `
        const d = await crypto.digest("SHA-256", "abc");
        return { hex: toHex(d), isBytes: d instanceof Uint8Array, len: d.length };
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      hex: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      isBytes: true,
      len: 32
    });
  });

  it("digests a Uint8Array and matches the string form", async () => {
    const result = await runInSandbox({
      code: `
        const a = await crypto.digest("SHA-1", "abc");
        const b = await crypto.digest("sha1", new TextEncoder().encode("abc"));
        return { a: toHex(a), b: toHex(b) };
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      a: "a9993e364706816aba3e25717850c26c9cd0d89d",
      b: "a9993e364706816aba3e25717850c26c9cd0d89d"
    });
  });

  it("supports SHA-384 and SHA-512", async () => {
    const result = await runInSandbox({
      code: `
        const a = await crypto.digest("SHA-384", "abc");
        const b = await crypto.digest("SHA-512", "abc");
        return { a: a.length, b: b.length };
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ a: 48, b: 64 });
  });

  it("rejects an unsupported algorithm with a clear error", async () => {
    const result = await runInSandbox({
      code: `return await crypto.digest("MD5", "abc");`
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unsupported algorithm/i);
  });

  it("rejects non-string, non-byte digest input", async () => {
    const result = await runInSandbox({
      code: `return await crypto.digest("SHA-256", 42);`
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/must be a string or Uint8Array/i);
  });

  it("computes the known HMAC-SHA256 vector", async () => {
    const result = await runInSandbox({
      code: `
        const mac = await crypto.hmac(
          "SHA-256",
          "key",
          "The quick brown fox jumps over the lazy dog"
        );
        return toHex(mac);
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe(
      "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
    );
  });

  it("accepts binary keys and data for hmac", async () => {
    const result = await runInSandbox({
      code: `
        const mac = await crypto.hmac("SHA-256", new TextEncoder().encode("key"), new TextEncoder().encode("msg"));
        const mac2 = await crypto.hmac("SHA-256", "key", "msg");
        return { same: toHex(mac) === toHex(mac2), len: mac.length };
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ same: true, len: 32 });
  });

  it("getRandomValues returns a real Uint8Array of the requested length", async () => {
    const result = await runInSandbox({
      code: `
        const b = crypto.getRandomValues(16);
        return { len: b.length, isBytes: b instanceof Uint8Array, allZero: b.every(v => v === 0) };
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({ len: 16, isBytes: true });
    expect((result.result as { allZero: boolean }).allZero).toBe(false);
  });

  it("caps getRandomValues at 65536 bytes", async () => {
    const result = await runInSandbox({
      code: `return crypto.getRandomValues(200000).length;`
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe(65_536);
  });

  it("crypto.randomUUID returns a UUID", async () => {
    const result = await runInSandbox({ code: `return crypto.randomUUID();` });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});

// ---------------------------------------------------------------------------
// base64 / hex / utf8 guest helpers
// ---------------------------------------------------------------------------

describe("runInSandbox binary helpers", () => {
  it("round-trips base64", async () => {
    const result = await runInSandbox({
      code: `
        const b64 = toBase64("hello world");
        const back = fromBase64(b64);
        return { b64, text: new TextDecoder().decode(back), isBytes: back instanceof Uint8Array };
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      b64: Buffer.from("hello world").toString("base64"),
      text: "hello world",
      isBytes: true
    });
  });

  it("base64-encodes every byte value correctly", async () => {
    const result = await runInSandbox({
      code: `
        const bytes = new Uint8Array(256);
        for (let i = 0; i < 256; i++) bytes[i] = i;
        const b64 = toBase64(bytes);
        const back = fromBase64(b64);
        let same = back.length === 256;
        for (let i = 0; i < 256 && same; i++) same = back[i] === i;
        return { b64, same };
      `
    });
    expect(result.success).toBe(true);
    const expected = Buffer.from(
      Array.from({ length: 256 }, (_, i) => i)
    ).toString("base64");
    expect(result.result).toEqual({ b64: expected, same: true });
  });

  it("round-trips hex", async () => {
    const result = await runInSandbox({
      code: `
        const hex = toHex(new TextEncoder().encode("nodetool"));
        const back = fromHex(hex);
        return { hex, text: new TextDecoder().decode(back) };
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      hex: Buffer.from("nodetool").toString("hex"),
      text: "nodetool"
    });
  });

  it("round-trips non-ASCII text through TextEncoder/TextDecoder", async () => {
    const result = await runInSandbox({
      code: `
        const bytes = new TextEncoder().encode("héllo — 世界");
        return { len: bytes.length, text: new TextDecoder().decode(bytes) };
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      len: Buffer.from("héllo — 世界").length,
      text: "héllo — 世界"
    });
  });

  it("accepts base64url input in fromBase64", async () => {
    const result = await runInSandbox({
      code: `return new TextDecoder().decode(fromBase64("aGVsbG8_d29ybGQ-"));`
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe(
      Buffer.from("aGVsbG8/d29ybGQ+", "base64").toString("utf-8")
    );
  });

  it("does not let a caller global clobber the helpers", async () => {
    const result = await runInSandbox({
      code: `return typeof toBase64;`,
      globals: { toBase64: 5 }
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// workspace binary + metadata I/O
// ---------------------------------------------------------------------------

describe("runInSandbox workspace binary I/O", () => {
  const withWorkspace = async (
    fn: (ctx: import("@nodetool-ai/runtime").ProcessingContext, dir: string) => Promise<void>
  ): Promise<void> => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join, isAbsolute } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "sbx-bin-"));
    const context = {
      workspace: createLocalWorkspace(dir),
        resolveWorkspacePath: (p: string) => (isAbsolute(p) ? p : join(dir, p))
    } as unknown as import("@nodetool-ai/runtime").ProcessingContext;
    try {
      await fn(context, dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };

  it("round-trips bytes through writeBytes/readBytes", async () => {
    await withWorkspace(async (context, dir) => {
      const result = await runInSandbox({
        code: `
          const data = new Uint8Array([0, 1, 2, 250, 255]);
          await workspace.writeBytes("nested/blob.bin", data);
          const back = await workspace.readBytes("nested/blob.bin");
          return { isBytes: back instanceof Uint8Array, values: Array.from(back) };
        `,
        context
      });
      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        isBytes: true,
        values: [0, 1, 2, 250, 255]
      });
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const onDisk = await readFile(join(dir, "nested/blob.bin"));
      expect(Array.from(onDisk)).toEqual([0, 1, 2, 250, 255]);
    });
  });

  it("stats files and directories", async () => {
    await withWorkspace(async (context) => {
      const result = await runInSandbox({
        code: `
          await workspace.write("a.txt", "hello");
          await workspace.mkdir("sub/dir");
          const f = await workspace.stat("a.txt");
          const d = await workspace.stat("sub/dir");
          return {
            size: f.size,
            fileIsFile: f.isFile,
            fileIsDir: f.isDirectory,
            hasMtime: typeof f.modifiedMs === "number" && f.modifiedMs > 0,
            dirIsDir: d.isDirectory
          };
        `,
        context
      });
      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        size: 5,
        fileIsFile: true,
        fileIsDir: false,
        hasMtime: true,
        dirIsDir: true
      });
    });
  });

  it("removes a file and an empty directory but not a populated tree", async () => {
    await withWorkspace(async (context) => {
      const result = await runInSandbox({
        code: `
          await workspace.write("gone.txt", "x");
          await workspace.remove("gone.txt");
          await workspace.mkdir("empty");
          await workspace.remove("empty");
          await workspace.write("tree/keep.txt", "x");
          let treeError = null;
          try { await workspace.remove("tree"); } catch (e) { treeError = e.message; }
          return { after: await workspace.list("."), treeError: treeError !== null };
        `,
        context
      });
      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({ treeError: true });
      expect((result.result as { after: string[] }).after).toEqual(["tree"]);
    });
  });

  it("confines workspace.* to the workspace unless the host opts into host mode", async () => {
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join, isAbsolute } = await import("node:path");
    const ws = await mkdtemp(join(tmpdir(), "sbx-fs-ws-"));
    const outside = await mkdtemp(join(tmpdir(), "sbx-fs-out-"));
    try {
      await writeFile(join(outside, "secret.txt"), "SECRET");
      const context = {
        workspace: createLocalWorkspace(ws),
        resolveWorkspacePath: (p: string) => (isAbsolute(p) ? p : join(ws, p))
      } as unknown as import("@nodetool-ai/runtime").ProcessingContext;
      const code = `return await workspace.read(${JSON.stringify(join(outside, "secret.txt"))});`;

      // An absolute path is read as workspace-relative, so the guest lands on
      // `<ws>/tmp/…/secret.txt` — which is not there. What matters is that the
      // real secret never comes back; whether the refusal reads as "missing"
      // or "outside" is not the security property.
      const confined = await runInSandbox({ code, context });
      expect(confined.success).toBe(false);
      expect(JSON.stringify(confined)).not.toContain("SECRET");

      const hostMode = await runInSandbox({
        code,
        context,
        limits: { filesystemAccess: "host" }
      });
      expect(hostMode.success).toBe(true);
      expect(hostMode.result).toBe("SECRET");

      // Host-set only — a guest global of the same name must not reach it.
      const spoofed = await runInSandbox({
        code,
        context,
        globals: { filesystemAccess: "host" }
      });
      expect(spoofed.success).toBe(false);
      expect(JSON.stringify(spoofed)).not.toContain("SECRET");
    } finally {
      await rm(ws, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("blocks loopback by default and permits it only when the host opts in", async () => {
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("local-service");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}/`;
    try {
      const blocked = await runInSandbox({
        code: `const r = await fetch(${JSON.stringify(url)}); return await r.text();`
      });
      expect(blocked.success).toBe(false);
      expect(blocked.error).toMatch(/internal\/private address/i);

      const allowed = await runInSandbox({
        code: `const r = await fetch(${JSON.stringify(url)}); return await r.text();`,
        limits: { allowPrivateNetwork: true }
      });
      expect(allowed.success).toBe(true);
      expect(allowed.result).toBe("local-service");

      // The switch is host-only: a guest global of the same name must not
      // reach the resolved limits.
      const spoofed = await runInSandbox({
        code: `const r = await fetch(${JSON.stringify(url)}); return await r.text();`,
        globals: { allowPrivateNetwork: true, limits: { allowPrivateNetwork: true } }
      });
      expect(spoofed.success).toBe(false);
      expect(spoofed.error).toMatch(/internal\/private address/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("keeps non-http schemes blocked even with private network allowed", async () => {
    const result = await runInSandbox({
      code: `return await fetch("file:///etc/passwd");`,
      limits: { allowPrivateNetwork: true }
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unsupported scheme/i);
  });

  it("reports a missing path as exists:false instead of throwing", async () => {
    await withWorkspace(async (context) => {
      const result = await runInSandbox({
        code: `
          await workspace.write("here.txt", "hello");
          const present = await workspace.stat("here.txt");
          const absent = await workspace.stat("nope.txt");
          return {
            present: present.exists,
            absent: absent.exists,
            absentSize: absent.size,
            isSymlink: present.isSymlink,
            hasCreated: typeof present.createdMs === "number",
            hasAccessed: typeof present.accessedMs === "number"
          };
        `,
        context
      });
      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        present: true,
        absent: false,
        absentSize: 0,
        isSymlink: false,
        hasCreated: true,
        hasAccessed: true
      });
    });
  });

  it("returns the workspace root", async () => {
    await withWorkspace(async (context, dir) => {
      const result = await runInSandbox({
        code: `return { root: await workspace.root() };`,
        context
      });
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ root: dir });
    });
  });

  it("copies and moves files, creating parent directories", async () => {
    await withWorkspace(async (context) => {
      const result = await runInSandbox({
        code: `
          await workspace.write("a.txt", "payload");
          await workspace.copy("a.txt", "nested/deep/b.txt");
          const copied = await workspace.read("nested/deep/b.txt");
          const srcStillThere = (await workspace.stat("a.txt")).exists;

          await workspace.move("nested/deep/b.txt", "moved/c.txt");
          const moved = await workspace.read("moved/c.txt");
          const srcGone = !(await workspace.stat("nested/deep/b.txt")).exists;

          return { copied, srcStillThere, moved, srcGone };
        `,
        context
      });
      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        copied: "payload",
        srcStillThere: true,
        moved: "payload",
        srcGone: true
      });
    });
  });

  it("blocks copy and move that escape the workspace via a symlink", async () => {
    const { mkdtemp, rm, writeFile, symlink, readdir } =
      await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join, isAbsolute } = await import("node:path");
    const ws = await mkdtemp(join(tmpdir(), "sbx-ws-"));
    const outside = await mkdtemp(join(tmpdir(), "sbx-out-"));
    try {
      await writeFile(join(outside, "secret.txt"), "SECRET");
      await writeFile(join(ws, "inside.txt"), "ok");
      // A symlink pointing out of the workspace: lexical containment passes,
      // so only the realpath check can catch it.
      await symlink(join(outside, "secret.txt"), join(ws, "link.txt"));
      await symlink(outside, join(ws, "outdir"));
      const context = {
        workspace: createLocalWorkspace(ws),
        resolveWorkspacePath: (p: string) => (isAbsolute(p) ? p : join(ws, p))
      } as never;
      const { sandbox } = buildSandbox(context);
      const workspace = sandbox.workspace as {
        copy: (s: string, d: string) => Promise<void>;
        move: (s: string, d: string) => Promise<void>;
      };
      // Reading out through a symlinked source.
      await expect(workspace.copy("link.txt", "stolen.txt")).rejects.toThrow(
        /outside the workspace/i
      );
      // Writing out through a symlinked destination directory.
      await expect(
        workspace.copy("inside.txt", "outdir/planted.txt")
      ).rejects.toThrow(/outside the workspace/i);
      await expect(
        workspace.move("inside.txt", "outdir/planted.txt")
      ).rejects.toThrow(/outside the workspace/i);
      // Absolute escape, no symlink involved: the destination is read as
      // workspace-relative, so the copy lands inside the workspace. The
      // property under test is that nothing is planted outside it.
      await workspace.copy("inside.txt", join(outside, "planted.txt"));
      expect(await readdir(outside)).toEqual(["secret.txt"]);
    } finally {
      await rm(ws, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("blocks binary writes through an escaping symlink", async () => {
    const { mkdtemp, rm, writeFile, symlink, readFile } =
      await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join, isAbsolute } = await import("node:path");
    const ws = await mkdtemp(join(tmpdir(), "sbx-ws-"));
    const outside = await mkdtemp(join(tmpdir(), "sbx-out-"));
    try {
      await writeFile(join(outside, "secret.bin"), "SECRET");
      await symlink(join(outside, "secret.bin"), join(ws, "link.bin"));
      const context = {
        workspace: createLocalWorkspace(ws),
        resolveWorkspacePath: (p: string) => (isAbsolute(p) ? p : join(ws, p))
      } as never;
      const { sandbox } = buildSandbox(context);
      const workspace = sandbox.workspace as {
        readBytes: (p: string) => Promise<unknown>;
        writeBytes: (p: string, d: Uint8Array) => Promise<void>;
        remove: (p: string) => Promise<void>;
      };
      await expect(workspace.readBytes("link.bin")).rejects.toThrow(
        /outside the workspace/i
      );
      await expect(
        workspace.writeBytes("link.bin", new Uint8Array([1]))
      ).rejects.toThrow(/outside the workspace/i);
      await expect(workspace.remove("link.bin")).rejects.toThrow(
        /outside the workspace/i
      );
      expect(await readFile(join(outside, "secret.bin"), "utf-8")).toBe(
        "SECRET"
      );
    } finally {
      await rm(ws, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("new workspace members throw helpfully without a context", async () => {
    const { sandbox } = buildSandbox();
    const ws = sandbox.workspace as Record<
      string,
      (...a: never[]) => Promise<unknown>
    >;
    for (const name of ["readBytes", "writeBytes", "stat", "mkdir", "remove"]) {
      await expect(ws[name]("x" as never)).rejects.toThrow(
        "not available without a context"
      );
    }
  });
});

// ---------------------------------------------------------------------------
// fetch binary bodies + limits
// ---------------------------------------------------------------------------

describe("runInSandbox fetch binary bodies", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    (globalThis as { fetch: typeof originalFetch }).fetch = originalFetch;
  });

  it("sends a Uint8Array body as raw bytes, not JSON", async () => {
    let sentBody: unknown;
    (globalThis as { fetch: unknown }).fetch = vi.fn(
      async (_u: string, init: RequestInit) => {
        sentBody = init.body;
        return new Response("ok", { status: 200 });
      }
    );
    const result = await runInSandbox({
      code: `
        const r = await fetch("https://example.com", {
          method: "POST",
          body: new Uint8Array([1, 2, 3, 4])
        });
        return r.status;
      `
    });
    expect(result.success).toBe(true);
    expect(sentBody).toBeInstanceOf(Uint8Array);
    expect(Array.from(sentBody as Uint8Array)).toEqual([1, 2, 3, 4]);
  });

  it("still JSON-encodes plain object bodies", async () => {
    let sentBody: unknown;
    (globalThis as { fetch: unknown }).fetch = vi.fn(
      async (_u: string, init: RequestInit) => {
        sentBody = init.body;
        return new Response("ok", { status: 200 });
      }
    );
    const result = await runInSandbox({
      code: `return (await fetch("https://example.com", { method: "POST", body: { a: 1 } })).status;`
    });
    expect(result.success).toBe(true);
    expect(sentBody).toBe('{"a":1}');
  });

  it("delivers bytes() and arrayBuffer() as real binary in the guest", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(
      async () => new Response(new Uint8Array([222, 173, 190, 239]))
    );
    const result = await runInSandbox({
      code: `
        const r = await fetch("https://example.com/bin");
        const b = await r.bytes();
        const ab = await r.arrayBuffer();
        return {
          isBytes: b instanceof Uint8Array,
          hex: toHex(b),
          abBytes: ab.byteLength
        };
      `
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      isBytes: true,
      hex: "deadbeef",
      abBytes: 4
    });
  });
});

// ---------------------------------------------------------------------------
// configurable limits
// ---------------------------------------------------------------------------

describe("resolveSandboxLimits", () => {
  it("defaults to the module constants", () => {
    const limits = resolveSandboxLimits();
    expect(limits.maxFetchCalls).toBe(MAX_FETCH_CALLS);
    expect(limits.maxOutputSize).toBe(MAX_OUTPUT_SIZE);
    expect(limits.memoryLimitBytes).toBe(GUEST_MEMORY_LIMIT);
  });

  it("clamps values above the hard ceilings", () => {
    const limits = resolveSandboxLimits({
      maxFetchCalls: 10_000,
      maxResponseBodyBytes: 1024 ** 4,
      maxOutputSize: 1024 ** 4,
      memoryLimitBytes: 1024 ** 4,
      stackLimitBytes: 1024 ** 4,
      fetchTimeoutMs: 10 * 60_000
    });
    expect(limits.maxFetchCalls).toBe(100);
    expect(limits.maxResponseBodyBytes).toBe(50 * 1024 * 1024);
    expect(limits.maxOutputSize).toBe(10 * 1024 * 1024);
    expect(limits.memoryLimitBytes).toBe(512 * 1024 * 1024);
    expect(limits.stackLimitBytes).toBe(8 * 1024 * 1024);
    expect(limits.fetchTimeoutMs).toBe(120_000);
  });

  it("ignores non-numeric overrides", () => {
    const limits = resolveSandboxLimits({
      maxFetchCalls: Number.NaN,
      maxOutputSize: undefined
    });
    expect(limits.maxFetchCalls).toBe(MAX_FETCH_CALLS);
    expect(limits.maxOutputSize).toBe(MAX_OUTPUT_SIZE);
  });
});

describe("runInSandbox limits option", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    (globalThis as { fetch: typeof originalFetch }).fetch = originalFetch;
  });

  it("maxFetchCalls=1 blocks the second request", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(
      async () => new Response("{}", { status: 200 })
    );
    const result = await runInSandbox({
      code: `
        await fetch("https://example.com/1");
        await fetch("https://example.com/2");
        return "ok";
      `,
      limits: { maxFetchCalls: 1 }
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Fetch limit exceeded \(max 1 /i);
  });

  it("maxOutputSize truncates the returned value", async () => {
    const result = await runInSandbox({
      code: `return "x".repeat(20000);`,
      limits: { maxOutputSize: 2000 }
    });
    expect(result.success).toBe(true);
    expect((result.result as string).length).toBeLessThan(3000);
    expect(result.result as string).toContain("[truncated]");
  });

  it("memoryLimitBytes override fails a large allocation", async () => {
    // Allocate JS objects: QuickJS's memory limiter counts its own heap
    // objects, not string or typed-array payloads.
    const code = `
      const items = [];
      for (let i = 0; i < 200000; i++) items.push({ i });
      return items.length;
    `;
    const tight = await runInSandbox({
      code,
      limits: { memoryLimitBytes: 2 * 1024 * 1024 }
    });
    expect(tight.success).toBe(false);
    expect(tight.error).toMatch(/out of memory/i);
    const roomy = await runInSandbox({ code, timeoutMs: 20_000 });
    expect(roomy.success).toBe(true);
    expect(roomy.result).toBe(200000);
  });
});

// ---------------------------------------------------------------------------
// progress reporting
// ---------------------------------------------------------------------------

describe("progress bridge", () => {
  it("forwards a report to the host callback", async () => {
    const seen: Array<[number, string | undefined]> = [];
    const result = await runInSandbox({
      code: `progress(42, "halfway"); return "done";`,
      onProgress: (p, m) => seen.push([p, m])
    });
    expect(result.success).toBe(true);
    expect(seen).toEqual([[42, "halfway"]]);
  });

  it("clamps percentages to 0-100 and coerces non-finite to 0", () => {
    const seen: number[] = [];
    const { sandbox } = buildSandbox(undefined, undefined, undefined, (p) =>
      seen.push(p)
    );
    const report = sandbox.progress as (p: number, m?: string) => void;
    // Rate limiting drops reports inside the 100 ms window, so drive the host
    // function directly with a wide enough gap between calls.
    vi.useFakeTimers();
    try {
      report(-5);
      vi.advanceTimersByTime(200);
      report(150);
      vi.advanceTimersByTime(200);
      report(Number.NaN);
      vi.advanceTimersByTime(200);
      report(Number.POSITIVE_INFINITY);
    } finally {
      vi.useRealTimers();
    }
    // Infinity is not finite, so it coerces to 0 rather than clamping to 100.
    expect(seen).toEqual([0, 100, 0, 0]);
  });

  it("truncates the message to 500 characters", () => {
    const seen: Array<string | undefined> = [];
    const { sandbox } = buildSandbox(undefined, undefined, undefined, (_p, m) =>
      seen.push(m)
    );
    const report = sandbox.progress as (p: number, m?: string) => void;
    report(1, "y".repeat(2000));
    expect(seen[0]).toHaveLength(500);
  });

  it("rate-limits a tight loop of reports", async () => {
    const seen: number[] = [];
    const result = await runInSandbox({
      code: `for (let i = 0; i < 200; i++) progress(i / 2); return "ok";`,
      onProgress: (p) => seen.push(p)
    });
    expect(result.success).toBe(true);
    // The loop runs well inside one 100 ms window, so only the first report
    // (and at most a handful more on a very slow machine) gets through.
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen.length).toBeLessThan(20);
    expect(seen[0]).toBe(0);
  });

  it("stops forwarding once the run is cancelled", () => {
    const seen: number[] = [];
    const controller = new AbortController();
    const { sandbox } = buildSandbox(
      undefined,
      controller.signal,
      undefined,
      (p) => seen.push(p)
    );
    const report = sandbox.progress as (p: number, m?: string) => void;
    report(10);
    controller.abort();
    report(20);
    expect(seen).toEqual([10]);
  });

  it("is a no-op without a callback", async () => {
    const result = await runInSandbox({
      code: `progress(10, "no sink"); return progress(20) === undefined;`
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// console log forwarding
// ---------------------------------------------------------------------------

describe("console log forwarding", () => {
  it("forwards from the host console object immediately", () => {
    const seen: Array<[string, string]> = [];
    const { sandbox, getLogs } = buildSandbox(
      undefined,
      undefined,
      undefined,
      undefined,
      (level, message) => seen.push([level, message])
    );
    const con = sandbox.console as {
      log: (...a: unknown[]) => void;
      warn: (...a: unknown[]) => void;
    };
    con.log("hello", { n: 1 });
    con.warn("careful");
    expect(seen).toEqual([
      ["log", "hello {\n  \"n\": 1\n}"],
      ["warn", "careful"]
    ]);
    expect(getLogs()).toEqual(["hello {\n  \"n\": 1\n}", "[warn] careful"]);
  });

  it("truncates a forwarded line but keeps the full line in logs", () => {
    const seen: string[] = [];
    const { sandbox, getLogs } = buildSandbox(
      undefined,
      undefined,
      undefined,
      undefined,
      (_level, message) => seen.push(message)
    );
    const con = sandbox.console as { log: (...a: unknown[]) => void };
    const long = "x".repeat(MAX_CONSOLE_LOG_CHARS + 50);
    con.log(long);
    expect(seen[0]).toHaveLength(MAX_CONSOLE_LOG_CHARS);
    expect(getLogs()[0]).toHaveLength(MAX_CONSOLE_LOG_CHARS + 50);
  });

  it("stops forwarding after MAX_CONSOLE_LOGS but still collects", () => {
    const seen: string[] = [];
    const { sandbox, getLogs } = buildSandbox(
      undefined,
      undefined,
      undefined,
      undefined,
      (_level, message) => seen.push(message)
    );
    const con = sandbox.console as { log: (...a: unknown[]) => void };
    for (let i = 0; i < MAX_CONSOLE_LOGS + 25; i++) {
      con.log(String(i));
    }
    expect(seen).toHaveLength(MAX_CONSOLE_LOGS);
    expect(getLogs()).toHaveLength(MAX_CONSOLE_LOGS + 25);
  });

  it("stops forwarding once the run is cancelled", () => {
    const seen: string[] = [];
    const controller = new AbortController();
    const { sandbox } = buildSandbox(
      undefined,
      controller.signal,
      undefined,
      undefined,
      (_level, message) => seen.push(message)
    );
    const con = sandbox.console as { log: (...a: unknown[]) => void };
    con.log("before");
    controller.abort();
    con.log("after");
    expect(seen).toEqual(["before"]);
  });

  it("swallows a throwing sink so the guest still succeeds", async () => {
    const result = await runInSandbox({
      code: `console.log("hi"); return 1;`,
      onLog: () => {
        throw new Error("sink failed");
      }
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe(1);
    expect(result.logs).toEqual(["hi"]);
  });
});

// ---------------------------------------------------------------------------
// Intl-backed format bridge
// ---------------------------------------------------------------------------

describe("format bridge", () => {
  it("formats numbers with grouping", async () => {
    const result = await runInSandbox({
      code: `return await format.number(1234.5, { locale: "en-US" });`
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("1,234.5");
  });

  it("formats currency and percent", async () => {
    const result = await runInSandbox({
      code: `return {
        usd: await format.number(12.5, { locale: "en-US", style: "currency", currency: "USD" }),
        pct: await format.number(0.256, { locale: "en-US", style: "percent", maximumFractionDigits: 1 }),
        plain: await format.number(1234.5, { locale: "en-US", useGrouping: false })
      };`
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      usd: "$12.50",
      pct: "25.6%",
      plain: "1234.5"
    });
  });

  it("formats a date in a fixed time zone", async () => {
    const result = await runInSandbox({
      code: `return await format.date(0, {
        locale: "en-US",
        dateStyle: "medium",
        timeZone: "UTC"
      });`
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("Jan 1, 1970");
  });

  it("rejects a non-finite epoch", async () => {
    const result = await runInSandbox({
      code: `try { await format.date(NaN); return "no throw"; }
             catch (e) { return e.message; }`
    });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/epochMs must be a finite number/);
  });

  it("formats relative time", async () => {
    const result = await runInSandbox({
      code: `return await format.relativeTime(-1, "day", { locale: "en-US" });`
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("1 day ago");
  });

  it("formats a list as a conjunction and a disjunction", async () => {
    const result = await runInSandbox({
      code: `return {
        and: await format.list(["a", "b", "c"], { locale: "en-US" }),
        or: await format.list(["a", "b"], { locale: "en-US", type: "disjunction" })
      };`
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ and: "a, b, and c", or: "a or b" });
  });

  it("surfaces an invalid locale as a guest-side Error", async () => {
    const result = await runInSandbox({
      code: `try { await format.number(1, { locale: "not a locale" }); return "no throw"; }
             catch (e) { return e.message; }`
    });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/locale/i);
  });

  it("defaults to en-US when no locale is given", async () => {
    const result = await runInSandbox({
      code: `return await format.number(1234567.891);`
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("1,234,567.891");
  });
});

// ---------------------------------------------------------------------------
// serializeResult — binary survives at depth
// ---------------------------------------------------------------------------

describe("serializeResult binary preservation", () => {
  it("keeps typed arrays nested below the top level", () => {
    const out = serializeResult({
      // No top-level typed array: this used to fall through to JSON.stringify,
      // which turned each Uint8Array into {"0":1,"1":2}.
      items: [{ output: new Uint8Array([1, 2, 3]) }],
      deep: { nested: { bytes: new Uint8Array([9]) } }
    }) as {
      items: { output: unknown }[];
      deep: { nested: { bytes: unknown } };
    };
    expect(out.items[0].output).toBeInstanceOf(Uint8Array);
    expect(Array.from(out.items[0].output as Uint8Array)).toEqual([1, 2, 3]);
    expect(out.deep.nested.bytes).toBeInstanceOf(Uint8Array);
  });

  it("leaves a user's integer-keyed object alone", () => {
    // The shape a JSON-ified Uint8Array takes. Nothing may guess it back into
    // bytes — this is a plain object and must stay one.
    const out = serializeResult({ counts: { 0: 5, 1: 200 } }) as {
      counts: unknown;
    };
    expect(out.counts).not.toBeInstanceOf(Uint8Array);
    expect(out.counts).toEqual({ 0: 5, 1: 200 });
  });

  it("falls back to String for a cyclic value, as before", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(typeof serializeResult(cyclic)).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Engine failure containment
//
// Both cases here used to end with the host process dead and the tool call
// that was running it returning nothing at all — the worst failure mode there
// is, because the agent driving it cannot even retry.
// ---------------------------------------------------------------------------

describe("guest→host binary volume", () => {
  it("moves far more than the old ~8 MB ceiling without aborting the runtime", async () => {
    // The typed-array serializer took a `Lifetime` from `getArrayBuffer` and
    // never disposed it. The leaked handles tripped
    // `list_empty(&rt->gc_obj_list)` in JS_FreeRuntime — an Emscripten abort
    // fired *after* the guest had already computed its answer, so the result
    // was produced and then thrown away. 16 MB failed before the fix.
    const result = await runInSandbox({
      code: `
        let total = 0;
        for (let i = 0; i < 24; i++) {
          total += await eat(new Uint8Array(1024 * 1024));
        }
        return total;
      `,
      context: {} as never,
      timeoutMs: 120_000,
      globals: { eat: async (a: unknown) => (a as Uint8Array).length }
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.result).toBe(24 * 1024 * 1024);
  }, 180_000);
});

describe("engine failure never takes the host process down", () => {
  it("fails the run, with an actionable message, when marshaling blows up", async () => {
    // A host global returning a raw Uint8Array breaks the byte-tagging
    // contract: the value is marshaled property-by-property, the guest OOMs,
    // and the throw lands in a promise continuation the engine never catches.
    // That used to be an unhandled rejection, i.e. a dead process.
    const result = await runInSandbox({
      code: `const a = await big(); return "unreachable";`,
      context: {} as never,
      timeoutMs: 120_000,
      globals: { big: async () => new Uint8Array(16 * 1024 * 1024) }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    // Not the raw Emscripten assertion text — an agent can't act on that.
    expect(result.error).not.toMatch(/gc_obj_list|Assertion failed/);
    expect(result.error).toMatch(/sandbox/i);
  }, 180_000);

  it("still runs normally afterwards", async () => {
    const result = await runInSandbox({ code: `return 1 + 1;`, context: {} as never });
    expect(result.success).toBe(true);
    expect(result.result).toBe(2);
  });
});
