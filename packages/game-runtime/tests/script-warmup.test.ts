import { describe, expect, it, vi } from "vitest";
import { QuickJSContext } from "quickjs-emscripten-core";
import { gameDocument, gameInputFrame3D, type GameDocument } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "../src/sample.js";
import { createNative3DGame } from "../src/sample3d.js";
import { prepareGameScripts, scriptSourceKey, type GameScriptCall } from "../src/scripts.js";
import { createGameSession3D } from "../src/session3d.js";

// Each test relies on being the first runner of its dimension in this file, which is when the warm-up runs.
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

// A fresh-context script, so prepare retains no document realm and every context it creates must be disposed.
const freshSource = "input => { const next = (input.state || 0) + 1; return { state: next, commands: [] }; }";

function fixture(): GameDocument {
  const base = createTopDownRoomGame("a".repeat(32));
  return gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: [
    ...scene.entities.map((entity) => ({ ...entity, behaviors: [] })),
    { id: "worker", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source: freshSource, maxTickMs: 50, maxCommands: 8 }] }
  ] })) });
}

const call: GameScriptCall = { sourceKey: scriptSourceKey("room", "worker", 0), stateKey: scriptSourceKey("room", "worker", 0), entityId: "worker",
  source: "worker", state: 1, x: 0, y: 0, velocityX: 0, velocityY: 0, touching: { down: false, up: false, left: false, right: false },
  maxTickMs: 50, maxCommands: 8 };
const input = { tick: 0, pressed: [], justPressed: [], events: [], world: [] };

describe("one-time script setup", () => {
  it("compiles host parsers during prepare, not inside the first script batch, and disposes its warm-up contexts", async () => {
    // Tick 0 of the 3D sample runs the player, moving-platform and door scripts. In CI the door call
    // hit the 50 ms batch deadline because first-use compilation ran inside that batch.
    const evaluate = vi.spyOn(QuickJSContext.prototype, "evalCode");
    const session = await createGameSession3D(createNative3DGame("a".repeat(32)), 1);
    try {
      // None of the sample's three scripts is persistent: three validation contexts plus two warm-up contexts.
      const contexts = [...new Set(evaluate.mock.contexts)];
      expect(contexts).toHaveLength(5);
      expect(contexts.some((context) => context.alive)).toBe(false);
      session.step(gameInputFrame3D.parse({ pressed: [], axes: { moveZ: -1 } }));
      expect(batches).toEqual([{ calls: 3, compiled: 0 }]);
    } finally { session.dispose(); evaluate.mockRestore(); }
  });

  it("returns a working runner when the warm-up fails, and warms the next runner instead", async () => {
    // Prepare-time document validation evaluates code but calls no guest function, so the first callFunction is the warm-up's.
    const failing = vi.spyOn(QuickJSContext.prototype, "callFunction").mockImplementationOnce(() => { throw new Error("warm-up stalled"); });
    const runner = await prepareGameScripts(fixture());
    try {
      expect(failing).toHaveBeenCalledTimes(1);
      failing.mockRestore();
      expect(runner.run([call], input, 1).results).toEqual([{ entityId: "worker", state: 2, commands: [] }]);
    } finally { failing.mockRestore(); runner.dispose(); }

    const evaluate = vi.spyOn(QuickJSContext.prototype, "evalCode");
    const invoke = vi.spyOn(QuickJSContext.prototype, "callFunction");
    const next = await prepareGameScripts(fixture());
    try {
      expect(invoke).toHaveBeenCalled();
      const contexts = [...new Set(evaluate.mock.contexts)];
      expect(contexts).toHaveLength(3);
      expect(contexts.some((context) => context.alive)).toBe(false);
      expect(next.run([call], input, 1).results).toEqual([{ entityId: "worker", state: 2, commands: [] }]);
    } finally { next.dispose(); evaluate.mockRestore(); invoke.mockRestore(); }
  });
});
