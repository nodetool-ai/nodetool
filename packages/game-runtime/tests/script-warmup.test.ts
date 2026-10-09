import { describe, expect, it, vi } from "vitest";
import { gameInputFrame3D } from "@nodetool-ai/protocol";
import { createNative3DGame } from "../src/sample3d.js";
import { createGameSession3D } from "../src/session3d.js";

const batches: { readonly calls: number; readonly compiled: number }[] = [];

/** Counts host code compiled through the Function constructor, which is how zod builds its object parsers. */
function countCompiledFunctions<T>(work: () => T): { readonly result: T; readonly compiled: number } {
  const original = globalThis.Function;
  let compiled = 0;
  globalThis.Function = new Proxy(original, {
    construct(target, args, newTarget) { compiled += 1; return Reflect.construct(target, args, newTarget); },
    apply(target, self, args) { compiled += 1; return Reflect.apply(target, self, args); }
  });
  try { return { result: work(), compiled }; } finally { globalThis.Function = original; }
}

vi.mock("../src/scripts3d.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/scripts3d.js")>();
  return {
    ...original,
    prepareGameScripts3D: async (...args: Parameters<typeof original.prepareGameScripts3D>) => {
      const runner = await original.prepareGameScripts3D(...args);
      return { ...runner, run: (...batch: Parameters<typeof runner.run>) => {
        const { result, compiled } = countCompiledFunctions(() => runner.run(...batch));
        batches.push({ calls: result.stats.calls, compiled });
        return result;
      } };
    }
  };
});

describe("one-time script setup", () => {
  it("compiles host parsers during prepare, not inside the first script batch", async () => {
    // Tick 0 of the 3D sample runs the player, moving-platform and door scripts. In CI the door call
    // hit the 50 ms batch deadline because first-use compilation ran inside that batch.
    const session = await createGameSession3D(createNative3DGame("a".repeat(32)), 1);
    try {
      session.step(gameInputFrame3D.parse({ pressed: [], axes: { moveZ: -1 } }));
      expect(batches).toEqual([{ calls: 3, compiled: 0 }]);
    } finally { session.dispose(); }
  });
});
