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
});
