import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickJSContext, QuickJSRuntime } from "quickjs-emscripten-core";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "../src/sample.js";
import { prepareGameScripts, scriptSourceKey, type GameScriptCall } from "../src/scripts.js";

// Destructuring the input makes this a fresh-context script, so every call creates and disposes a context.
const freshSource = "({ state }) => ({ state: (state || 0) + 1, commands: [] })";

function fixture(): GameDocument {
  const base = createTopDownRoomGame("a".repeat(32));
  return gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: [
    ...scene.entities.map((entity) => ({ ...entity, behaviors: [] })),
    { id: "worker", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source: freshSource, maxTickMs: 20, maxCommands: 8 }] }
  ] })) });
}

const key = scriptSourceKey("room", "worker", 0);
const call: GameScriptCall = { sourceKey: key, stateKey: key, entityId: "worker", source: "worker", state: null, x: 0, y: 0,
  velocityX: 0, velocityY: 0, touching: { down: false, up: false, left: false, right: false }, maxTickMs: 20, maxCommands: 8 };

afterEach(() => { vi.restoreAllMocks(); });

describe("per-call script budget", () => {
  it("creates a fresh context before the call budget starts and evaluates the user source inside it", async () => {
    // Disposed contexts are reclaimed by a QuickJS cycle collection that runs inside a later newContext.
    // In CI that collection pushed a lumen ambience call past its 20 ms budget although the script ran in 0.1 ms.
    const runner = await prepareGameScripts(fixture());
    const events: string[] = [];
    const newContext = QuickJSRuntime.prototype.newContext;
    vi.spyOn(QuickJSRuntime.prototype, "newContext").mockImplementation(function (this: QuickJSRuntime, ...args) {
      events.push("newContext");
      return newContext.apply(this, args);
    });
    const setInterruptHandler = QuickJSRuntime.prototype.setInterruptHandler;
    vi.spyOn(QuickJSRuntime.prototype, "setInterruptHandler").mockImplementation(function (this: QuickJSRuntime, ...args) {
      events.push("budget");
      return setInterruptHandler.apply(this, args);
    });
    const evalCode = QuickJSContext.prototype.evalCode;
    vi.spyOn(QuickJSContext.prototype, "evalCode").mockImplementation(function (this: QuickJSContext, ...args) {
      if (args[0].includes("__gameScript = (")) { events.push("userSource"); }
      return evalCode.apply(this, args);
    });
    const callFunction = QuickJSContext.prototype.callFunction;
    vi.spyOn(QuickJSContext.prototype, "callFunction").mockImplementation(function (this: QuickJSContext, ...args) {
      events.push("callFunction");
      return callFunction.apply(this, args);
    });
    try {
      for (const tick of [0, 1]) {
        events.length = 0;
        const batch = runner.run([call], { tick, pressed: [], justPressed: [], events: [], world: [] }, 1);
        expect(batch.results).toEqual([{ entityId: "worker", state: 1, commands: [] }]);
        // The batch budget covers context setup. The last budget installed before the user source is the call's own.
        expect(events).toEqual(["budget", "newContext", "budget", "userSource", "callFunction"]);
      }
    } finally { runner.dispose(); }
  });

  it("disposes the new context and reports the call when host-side setup fails", async () => {
    const runner = await prepareGameScripts(fixture());
    const newContext = vi.spyOn(QuickJSRuntime.prototype, "newContext");
    const dispose = vi.spyOn(QuickJSContext.prototype, "dispose");
    // A failing shell setup must not leak the context it created.
    vi.spyOn(QuickJSContext.prototype, "evalCode").mockImplementationOnce(() => { throw new Error("setup stalled"); });
    try {
      expect(() => runner.run([call], { tick: 0, pressed: [], justPressed: [], events: [], world: [] }, 1)).toThrow(/worker at tick 0 failed: setup stalled/);
      expect(newContext).toHaveBeenCalledTimes(1);
      expect(dispose.mock.contexts).toContain(newContext.mock.results[0]?.value);
    } finally { runner.dispose(); }
  });
});
