import { describe, expect, it } from "vitest";
import { runInSandbox } from "../src/js-sandbox.js";
import { defaultSandboxWorkerPool } from "../src/js-sandbox-worker/host.js";

describe("pooled QuickJS engine", () => {
  it("reuses one worker after repeatedly marshaling closure-bearing RPC arguments", async () => {
    const pool = defaultSandboxWorkerPool();
    let hostCalls = 0;
    try {
      const initial = await pool.acquire();
      expect(initial).not.toBeNull();
      if (initial === null) {
        throw new Error("The regression requires a real sandbox worker");
      }
      const worker = initial.handle;
      initial.release(false);
      for (let run = 1; run <= 30; run++) {
        const result = await runInSandbox({
          code: `
const a = Array.from({length: 300}, (_, i) => {
  const o = {i, arr: [], nested: {x: 1}};
  for (let j = 0; j < 13; j++) o['fn' + j] = (opts = {}) => a;
  return o;
});
for (let i = 0; i < 2; i++) {
  // Functions cannot cross postMessage. Cleanup must still release the
  // handles allocated before the RPC proxy discovers that restriction.
  try { await capture(a); } catch {}
}
return 42;
`,
          globals: {
            capture: async () => {
              hostCalls++;
              return { ok: true };
            }
          }
        });
        expect(result.success, `run ${run}: ${result.error}`).toBe(true);
        expect(result.result).toBe(42);
        const next = await pool.acquire();
        expect(next?.handle).toBe(worker);
        next?.release(false);
      }
      // This also proves the test did not silently take the in-process path.
      expect(hostCalls).toBe(0);
    } finally {
      pool.destroy();
    }
  }, 60_000);
});
