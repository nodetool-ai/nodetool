import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickJSContext, QuickJSRuntime } from "quickjs-emscripten-core";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "../src/sample.js";
import { defaultScriptCallClock, wallScriptCallClock } from "../src/script-clock.js";
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

describe("per-call script clock", () => {
  const input = (tick: number) => ({ tick, pressed: [], justPressed: [], events: [], world: [] });
  // Linux can lag a running thread's CPU time by a scheduler tick, so the call's own work must stay well under the limit.
  // The block stays short because it also counts against the 50 ms wall-clock batch budget.
  const shortCall: GameScriptCall = { ...call, maxTickMs: 6 };
  const threadCpuMs = (): number => { const { user, system } = process.threadCpuUsage(); return (user + system) / 1000; };
  // A world entity whose snapshot copy blocks the thread without using CPU. The snapshot is built inside the call window.
  const blockingWorld = (ms: number) => [{
    id: "sleeper", source: "sleeper", y: 0, velocityX: 0, velocityY: 0,
    get x(): number { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); return 0; }
  }];

  it("measures calls in thread CPU time on Node", () => {
    expect(defaultScriptCallClock.kind).toBe("thread-cpu");
    const cpu = defaultScriptCallClock.now();
    const wall = performance.now();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
    expect(performance.now() - wall).toBeGreaterThanOrEqual(29);
    expect(defaultScriptCallClock.now() - cpu).toBeLessThan(20);
  });

  it("does not count time the thread spends blocked inside a call", async () => {
    const runner = await prepareGameScripts(fixture());
    try {
      const started = performance.now();
      const batch = runner.run([shortCall], input(0), 1, blockingWorld(8));
      expect(performance.now() - started).toBeGreaterThanOrEqual(8);
      expect(batch.results).toEqual([{ entityId: "worker", state: 1, commands: [] }]);
    } finally { runner.dispose(); }
  });

  it("counts the same blocked time against a wall-clock call limit", async () => {
    const runner = await prepareGameScripts(fixture(), { callClock: wallScriptCallClock });
    try {
      expect(() => runner.run([shortCall], input(0), 1, blockingWorld(8))).toThrow(/interrupted: call 6 ms for worker at tick 0/);
    } finally { runner.dispose(); }
  });

  it("interrupts a CPU-bound loop once it has used its call limit", async () => {
    const base = fixture();
    const looping = gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) =>
      entity.id === "worker" ? { ...entity, behaviors: [{ kind: "script", source: "({ state }) => { while (true) {} }", maxTickMs: 20, maxCommands: 8 }] } : entity) })) });
    const runner = await prepareGameScripts(looping);
    try {
      const cpu = threadCpuMs();
      const wall = performance.now();
      expect(() => runner.run([call], input(0), 1)).toThrow(/interrupted/);
      // The call stops at 20 ms of thread CPU, or earlier at the 50 ms wall-clock batch budget.
      expect(threadCpuMs() - cpu >= 20 || performance.now() - wall >= 50).toBe(true);
    } finally { runner.dispose(); }
  });
});
