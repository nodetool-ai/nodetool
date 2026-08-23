/**
 * The JSON transport that moves structured data across the QuickJS boundary,
 * and the round trips it has to keep intact.
 *
 * The unit half pins the encoder's contract — what it represents, what it
 * refuses. The end-to-end half runs real guest code, because the interesting
 * failures are the ones where host and guest disagree about a marker.
 */

import { describe, expect, it } from "vitest";
import {
  decodeGuestPayload,
  encodeHostRecord,
  JSON_DATE_MARKER,
  JSON_NUMBER_MARKER,
  JSON_SIDECAR_MARKER,
  JSON_UNDEFINED_MARKER,
  SIDECAR_STRING_THRESHOLD
} from "../src/sandbox-json-transport.js";
import { SANDBOX_BYTES_MARKER } from "../src/sandbox-bytes.js";
import { runInSandbox } from "../src/js-sandbox.js";

// ---------------------------------------------------------------------------
// encodeHostRecord
// ---------------------------------------------------------------------------

describe("encodeHostRecord", () => {
  it("encodes plain data as ordinary JSON", () => {
    const { json, sidecar, skipped } = encodeHostRecord({
      inputs: { rows: [{ id: 1 }, { id: 2 }], name: "x" }
    });
    expect(skipped).toEqual([]);
    expect(sidecar).toEqual([]);
    expect(JSON.parse(json)).toEqual({
      inputs: { rows: [{ id: 1 }, { id: 2 }], name: "x" }
    });
  });

  it("marks the values JSON drops or flattens", () => {
    const { json } = encodeHostRecord({
      when: new Date("2020-01-02T03:04:05.000Z"),
      nan: Number.NaN,
      inf: Number.POSITIVE_INFINITY,
      holder: { missing: undefined }
    });
    const tree = JSON.parse(json);
    expect(tree.when).toEqual({
      [JSON_DATE_MARKER]: "2020-01-02T03:04:05.000Z"
    });
    expect(tree.nan).toEqual({ [JSON_NUMBER_MARKER]: "NaN" });
    expect(tree.inf).toEqual({ [JSON_NUMBER_MARKER]: "Infinity" });
    expect(tree.holder).toEqual({
      missing: { [JSON_UNDEFINED_MARKER]: true }
    });
  });

  it("moves a long string to the sidecar and leaves a short one inline", () => {
    const long = "x".repeat(SIDECAR_STRING_THRESHOLD);
    const { json, sidecar } = encodeHostRecord({ long, short: "hi" });
    const tree = JSON.parse(json);
    expect(tree.long).toEqual({ [JSON_SIDECAR_MARKER]: 0 });
    expect(tree.short).toBe("hi");
    expect(sidecar).toEqual([long]);
  });

  it("base64-tags bytes, which cannot ride the sidecar into the guest", () => {
    const { json } = encodeHostRecord({ bytes: new Uint8Array([1, 2, 3]) });
    expect(JSON.parse(json).bytes).toEqual({
      [SANDBOX_BYTES_MARKER]: "AQID"
    });
  });

  it("skips only the entry it cannot represent", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const { json, skipped, cyclic: cyclicNames } = encodeHostRecord({
      fine: { a: 1 },
      fn: { call: () => 1 },
      cyclic,
      instance: new (class Thing {})(),
      map: new Map([["a", 1]]),
      big: { n: 1n }
    });
    expect([...skipped].sort()).toEqual(["big", "fn", "instance", "map"]);
    expect(cyclicNames).toEqual(["cyclic"]);
    expect(JSON.parse(json)).toEqual({ fine: { a: 1 } });
  });

  it("does not mistake a repeated value for a cycle", () => {
    const shared = { a: 1 };
    const { json, cyclic } = encodeHostRecord({ pair: [shared, shared] });
    expect(cyclic).toEqual([]);
    expect(JSON.parse(json).pair).toEqual([{ a: 1 }, { a: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// decodeGuestPayload
// ---------------------------------------------------------------------------

describe("decodeGuestPayload", () => {
  it("splices the sidecar back in by index", () => {
    const bytes = new Uint8Array([9, 9]);
    const decoded = decodeGuestPayload({
      j: JSON.stringify({
        v: { text: { [JSON_SIDECAR_MARKER]: 0 }, blob: { [JSON_SIDECAR_MARKER]: 1 } }
      }),
      b: ["long", bytes]
    });
    expect(decoded).toEqual({ text: "long", blob: bytes });
  });

  it("passes a raw payload straight through", () => {
    expect(decodeGuestPayload({ raw: "plain" })).toBe("plain");
    expect(decodeGuestPayload({ raw: undefined })).toBeUndefined();
  });

  it("answers undefined for a payload it cannot parse", () => {
    expect(decodeGuestPayload({ j: "{not json" })).toBeUndefined();
    expect(decodeGuestPayload({ j: 42 })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// End to end through a real guest
// ---------------------------------------------------------------------------

describe("sandbox JSON transport end to end", () => {
  it("round-trips structured data unchanged", async () => {
    const result = await runInSandbox({
      code: `return { rows: [{ id: 1, tags: ["a"] }, { id: 2, tags: [] }], count: 2, ok: true, none: null };`
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      rows: [
        { id: 1, tags: ["a"] },
        { id: 2, tags: [] }
      ],
      count: 2,
      ok: true,
      none: null
    });
  });

  it("carries bytes out of the guest as a typed array", async () => {
    const result = await runInSandbox({
      code: `return { head: new Uint8Array([137, 80, 78]), n: 3 };`
    });
    const value = result.result as { head: Uint8Array; n: number };
    expect(value.head).toBeInstanceOf(Uint8Array);
    expect(Array.from(value.head)).toEqual([137, 80, 78]);
    expect(value.n).toBe(3);
  });

  it("carries a long string out whole", async () => {
    const result = await runInSandbox({
      code: `return { text: "y".repeat(${SIDECAR_STRING_THRESHOLD * 2}) };`,
      limits: { maxOutputSize: 10_000_000 }
    });
    const value = result.result as { text: string };
    expect(value.text.length).toBe(SIDECAR_STRING_THRESHOLD * 2);
    expect(value.text.startsWith("yyy")).toBe(true);
  });

  it("returns a bare string without an envelope around it", async () => {
    const result = await runInSandbox({ code: `return "hello";` });
    expect(result.result).toBe("hello");
  });

  it("answers String(value) for a cyclic result instead of aborting the runtime", async () => {
    const result = await runInSandbox({
      code: `const a = { name: "a" }; a.self = a; return a;`
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("[object Object]");
  });

  it("reads injected globals the guest never marshaled", async () => {
    const result = await runInSandbox({
      code: `return { n: inputs.rows.length, first: inputs.rows[0].name, bytes: Array.from(inputs.blob), when: inputs.when instanceof Date };`,
      globals: {
        inputs: {
          rows: [{ name: "one" }, { name: "two" }],
          blob: new Uint8Array([1, 2]),
          when: new Date("2021-05-06T07:08:09.000Z")
        }
      }
    });
    expect(result.result).toEqual({
      n: 2,
      first: "one",
      bytes: [1, 2],
      when: true
    });
  });

  it("injects a global the transport refuses through the wrapper's own path", async () => {
    const result = await runInSandbox({
      code: `return typeof cfg.hello;`,
      globals: { cfg: { hello: () => "hi" } }
    });
    expect(result.result).toBe("function");
  });

  it("refuses a cyclic global by name rather than aborting the runtime", async () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    const result = await runInSandbox({
      code: `return cfg.name;`,
      globals: { cfg: cyclic }
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('"cfg"');
    expect(result.error).toContain("refers back to itself");
  });

  it("syncs an object global back to the host, dates included", async () => {
    const state: Record<string, unknown> = { runs: 0 };
    await runInSandbox({
      code: `state.runs += 1; state.last = new Date("2022-03-04T05:06:07.000Z"); state.rows = [{ id: 1 }]; return state.runs;`,
      globals: { state }
    });
    expect(state.runs).toBe(1);
    expect(state.last).toBeInstanceOf(Date);
    expect((state.last as Date).toISOString()).toBe("2022-03-04T05:06:07.000Z");
    expect(state.rows).toEqual([{ id: 1 }]);
  });

  it("delivers emitted values decoded, bytes and all", async () => {
    const seen: unknown[] = [];
    const result = await runInSandbox({
      code: `await emit("out", { rows: [{ id: 1 }], blob: new Uint8Array([7]) }); await emit("out", "plain"); return 1;`,
      onEmit: async (_name, value) => {
        seen.push(value);
      }
    });
    expect(result.success).toBe(true);
    const first = seen[0] as { rows: unknown; blob: Uint8Array };
    expect(first.rows).toEqual([{ id: 1 }]);
    expect(Array.from(first.blob)).toEqual([7]);
    expect(seen[1]).toBe("plain");
  });

  it("records outputs decoded", async () => {
    const result = await runInSandbox({
      code: `await output("rows", [{ id: 1 }, { id: 2 }]); return "done";`
    });
    expect(result.outputs).toEqual({ rows: [{ id: 1 }, { id: 2 }] });
  });
});
