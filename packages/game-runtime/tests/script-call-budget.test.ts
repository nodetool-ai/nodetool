import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickJSContext, QuickJSRuntime } from "quickjs-emscripten-core";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "../src/sample.js";
import { defaultScriptCallClock, wallScriptCallClock, threadCpuScriptCallClock, startScriptCallTimer } from "../src/script-clock.js";
import { prepareGameScripts, scriptSourceKey, type GameScriptCall } from "../src/scripts.js";

// An initializer call could keep closure state, so this is a fresh-context script: every call creates and disposes a context.
const freshSource = "(() => ({ state }) => ({ state: (state || 0) + 1, commands: [] }))()";

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

// These tests check the real limits, so they undo the suite-wide scale in vitest.config.ts.
beforeEach(() => { vi.stubEnv("NODETOOL_GAME_SCRIPT_BUDGET_SCALE", "1"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

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
  it("selects available native thread CPU accounting on Node", () => {
    expect(typeof process.threadCpuUsage).toBe("function");
    expect(threadCpuScriptCallClock()?.kind).toBe("thread-cpu");
    expect(defaultScriptCallClock.kind).toBe("thread-cpu");
  });

  it("converts actual native CPU microseconds into milliseconds", () => {
    const clock = threadCpuScriptCallClock();
    if (!clock) { throw new Error("Node thread CPU accounting is unavailable"); }
    const before = process.threadCpuUsage();
    const milliseconds = clock.now();
    const after = process.threadCpuUsage();

    expect(milliseconds).toBeGreaterThanOrEqual((before.user + before.system) / 1000);
    expect(milliseconds).toBeLessThanOrEqual((after.user + after.system) / 1000);
  });

  it("keeps blocked wall time out of the default 20 ms CPU timer", () => {
    const expires = startScriptCallTimer(defaultScriptCallClock, 20);
    const wallExpires = startScriptCallTimer(wallScriptCallClock, 20);
    const before = process.threadCpuUsage();
    const started = performance.now();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
    const cpu = process.threadCpuUsage(before);
    const evidence = {
      clock: defaultScriptCallClock.kind,
      cpuMs: (cpu.user + cpu.system) / 1000,
      wallMs: performance.now() - started
    };
    const expired = expires();
    const wallExpired = wallExpires();

    expect(evidence.cpuMs).toBeLessThan(20);
    expect(expired, JSON.stringify(evidence)).toBe(false);
    expect(wallExpired).toBe(true);
    expect(defaultScriptCallClock.kind).toBe("thread-cpu");
  });

  it("keeps garbage collection pauses out of the call budget but still counts the call's own CPU time", () => {
    // On a loaded CI runner V8's parallel GC helpers get no CPU, so one scavenge pauses the main thread for 10-35 ms.
    // A pause that landed inside a trivial 8 ms script call failed `nodetool game simulate`.
    setFlagsFromString("--expose-gc");
    const gc = runInNewContext("gc") as () => void;
    const retained = Array.from({ length: 300_000 }, (_, index) => ({ index, label: `entry-${index}` }));
    const limit = 5;
    const expires = startScriptCallTimer(defaultScriptCallClock, limit);
    const cpu = defaultScriptCallClock.now();
    const wall = performance.now();
    let collections = 0;
    while (performance.now() - wall < limit * 3 || defaultScriptCallClock.now() - cpu < limit * 3) { gc(); collections += 1; }
    const evidence = { collections, wallMs: performance.now() - wall, cpuMs: defaultScriptCallClock.now() - cpu, retained: retained.length };
    expect(expires(), JSON.stringify(evidence)).toBe(false);

    // Recorded pauses can exceed the CPU the collector used when the thread was descheduled during one,
    // so the call's own work must outlast the whole collection phase before the limit is certain to apply.
    const busy = defaultScriptCallClock.now();
    let spin = 0;
    while (defaultScriptCallClock.now() - busy < evidence.wallMs + limit * 2) { spin += 1; }
    expect(expires(), `spin ${spin}`).toBe(true);
  });

  const input = (tick: number) => ({ tick, pressed: [], justPressed: [], events: [], world: [] });
  // Linux can lag a running thread's CPU time by a scheduler tick, so the call's own work must stay well under the limit.
  // The block stays short because it also counts against the 50 ms wall-clock batch budget.
  const shortCall: GameScriptCall = { ...call, maxTickMs: 6 };
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

  it("names the call budget when a reused realm overruns it inside world.get", async () => {
    // A reused realm freezes Error.prototype, so an error thrown by a host function reaches the guest without its message.
    const base = fixture();
    const reading = gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) =>
      entity.id === "worker" ? { ...entity, behaviors: [{ kind: "script", source: "() => ({ state: world.get(\"sleeper\") ? 1 : 0, commands: [] })", maxTickMs: 1, maxCommands: 8 }] } : entity) })) });
    // The call clock jumps once world.get serializes the entity, so the budget expires inside the host function.
    let expired = false;
    const runner = await prepareGameScripts(reading, { callClock: { kind: "wall", now: () => (expired ? 1000 : 0) } });
    const encode = TextEncoder.prototype.encode;
    vi.spyOn(TextEncoder.prototype, "encode").mockImplementation(function (this: TextEncoder, text?: string) {
      if (text?.startsWith("{\"id\":\"sleeper\"")) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
        expired = true;
      }
      return encode.call(this, text);
    });
    const world = [{ id: "sleeper", source: "sleeper", x: 0, y: 0, velocityX: 0, velocityY: 0 }];
    try {
      expect(() => runner.run([{ ...call, maxTickMs: 1 }], input(0), 1, world)).toThrow(/interrupted: call 1 ms for worker at tick 0/);
    } finally { runner.dispose(); }
  });

  it.each([1, 20])("interrupts a CPU-bound loop at a %i ms call limit", async (limit) => {
    const base = fixture();
    const looping = gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) =>
      entity.id === "worker" ? { ...entity, behaviors: [{ kind: "script", source: "({ state }) => { while (true) {} }", maxTickMs: limit, maxCommands: 8 }] } : entity) })) });
    const runner = await prepareGameScripts(looping);
    try {
      const cpu = defaultScriptCallClock.now();
      const wall = performance.now();
      expect(() => runner.run([{ ...call, maxTickMs: limit }], input(0), 1)).toThrow(/interrupted/);
      // The per-call CPU budget and the independent 50 ms batch wall budget both remain enforced.
      expect(defaultScriptCallClock.now() - cpu >= limit || performance.now() - wall >= 50).toBe(true);
    } finally { runner.dispose(); }
  });

  it("multiplies the call limit by NODETOOL_GAME_SCRIPT_BUDGET_SCALE", async () => {
    vi.stubEnv("NODETOOL_GAME_SCRIPT_BUDGET_SCALE", "3");
    const base = fixture();
    const looping = gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) =>
      entity.id === "worker" ? { ...entity, behaviors: [{ kind: "script", source: "({ state }) => { while (true) {} }", maxTickMs: 1, maxCommands: 8 }] } : entity) })) });
    const runner = await prepareGameScripts(looping);
    try {
      expect(() => runner.run([{ ...call, maxTickMs: 1 }], input(0), 1)).toThrow(/interrupted: call 3 ms for worker at tick 0/);
    } finally { runner.dispose(); }
  });

  it.each(["0.5", "fast", "Infinity"])("rejects NODETOOL_GAME_SCRIPT_BUDGET_SCALE=%s", async (value) => {
    vi.stubEnv("NODETOOL_GAME_SCRIPT_BUDGET_SCALE", value);
    await expect(prepareGameScripts(fixture())).rejects.toThrow(`NODETOOL_GAME_SCRIPT_BUDGET_SCALE must be a number of at least 1, got "${value}"`);
  });
});
