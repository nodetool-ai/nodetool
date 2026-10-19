import { describe, expect, it, vi } from "vitest";
import { QuickJSContext, type QuickJSHandle } from "quickjs-emscripten-core";
import * as quickJsVariantModule from "@jitl/quickjs-ng-wasmfile-release-sync";
import { loadSandboxEngine } from "../src/js-sandbox-worker/engine.js";

// SAFETY: the CJS namespace's default is the variant, despite its declared
// synthetic-default type (the same interop as the production engine loader).
const variant = (
  quickJsVariantModule as unknown as {
    default: Parameters<typeof loadSandboxEngine>[0];
  }
).default;

const CLOSURE_DOCUMENT = `
const a = Array.from({length: 300}, (_, i) => {
  const o = {i, arr: [], nested: {x: 1}};
  for (let j = 0; j < 13; j++) o['fn' + j] = (opts = {}) => a;
  return o;
});
await env.capture(a);
await env.capture(a);
export default 42;
`;

describe("shared QuickJS engine", () => {
  it("settles an asynchronous host callback with the selected WASM variant", async () => {
    const engine = await loadSandboxEngine(variant);
    const result = await engine.runSandboxed(
      async ({ evalCode }) => evalCode("export default await env.callback();"),
      { env: { callback: async () => 42 } }
    );
    expect(result).toEqual({ ok: true, data: 42 });
  });

  it("releases property handles after returning descriptors and symbols", async () => {
    const handles: QuickJSHandle[] = [];
    const getProp = QuickJSContext.prototype.getProp;
    const reads = vi
      .spyOn(QuickJSContext.prototype, "getProp")
      .mockImplementation(function (this: QuickJSContext, ...args) {
        const handle = getProp.apply(this, args);
        handles.push(handle);
        return handle;
      });
    try {
      const engine = await loadSandboxEngine(variant);
      const result = await engine.runSandboxed(async ({ evalCode }) =>
        evalCode(
          `export default {missing: undefined, yes: true, no: false, symbol: Symbol("label")};`
        )
      );
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      expect(result.data).toMatchObject({
        missing: undefined,
        yes: true,
        no: false
      });
      expect(result.data.symbol.description).toBe("label");
      expect(handles.length).toBeGreaterThan(0);
      expect(handles.filter((handle) => handle.alive)).toHaveLength(0);
    } finally {
      reads.mockRestore();
    }
  });

  it("disposes sequential runtimes after marshaling closure-bearing objects", async () => {
    const engine = await loadSandboxEngine(variant);
    for (let run = 1; run <= 30; run++) {
      const result = await engine.runSandboxed(
        async ({ evalCode }) => evalCode(CLOSURE_DOCUMENT),
        { env: { capture: async () => ({ ok: true }) } }
      );
      expect(result, `run ${run}`).toEqual({ ok: true, data: 42 });
    }
  }, 60_000);

  it("frees the runtime after a job grows the WASM heap", async () => {
    // A job that grows the heap detached the view executePendingJobs read
    // the job's context pointer through. It got `undefined`, built a second
    // context nobody freed, and the runtime aborted on free.
    const engine = await loadSandboxEngine(variant);
    const result = await engine.runSandboxed(
      async ({ evalCode }) =>
        evalCode(`
await env.tick();
const keep = [];
for (let i = 0; i < 300000; i++) keep.push({ i });
export default keep.length;
`),
      { env: { tick: async () => 1 } }
    );
    expect(result).toEqual({ ok: true, data: 300000 });
  }, 60_000);
});
