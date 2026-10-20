import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickJSContext, QuickJSRuntime } from "quickjs-emscripten-core";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "../src/sample.js";
import { canReuseGameScript } from "../src/script-persistence.js";
import { prepareGameScripts, scriptSourceKey, type GameScriptCall, type GameScriptInput } from "../src/scripts.js";

function fixture(source: string): GameDocument {
  const base = createTopDownRoomGame("a".repeat(32));
  return gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: [
    ...scene.entities.map((entity) => ({ ...entity, behaviors: [] })),
    { id: "worker", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source, maxTickMs: 20, maxCommands: 8 }] }
  ] })) });
}

const key = scriptSourceKey("room", "worker", 0);
const call: GameScriptCall = { sourceKey: key, stateKey: key, entityId: "worker", source: "worker", state: null, x: 0, y: 0,
  velocityX: 0, velocityY: 0, touching: { down: false, up: false, left: false, right: false }, maxTickMs: 20, maxCommands: 8 };
const world = [{ id: "worker", source: "worker", x: 0, y: 0 }, { id: "crate", source: "crate", x: 4, y: 0, tags: ["loot"] }];
const inputAt = (tick: number): GameScriptInput => ({ tick, pressed: [], justPressed: [], events: [], world });

/** Runs the source for several ticks, carrying state and random state forward as a session does. */
async function runTicks(source: string, ticks = 4): Promise<unknown[]> {
  const runner = await prepareGameScripts(fixture(source));
  const outputs: unknown[] = [];
  try {
    let state: GameScriptCall["state"] = null;
    let rngState = 7;
    for (let tick = 0; tick < ticks; tick += 1) {
      const batch = runner.run([{ ...call, state }], inputAt(tick), rngState);
      outputs.push({ result: batch.results[0], rngState: batch.rngState });
      state = batch.results[0].state;
      rngState = batch.rngState;
    }
  } finally { runner.dispose(); }
  return outputs;
}

/** The same function behind an initializer call, which always runs in a fresh realm. */
const fresh = (source: string): string => `(() => (${source}))()`;

afterEach(() => { vi.restoreAllMocks(); });

describe("reusable script classification", () => {
  it.each([
    "(input) => ({ state: input.tick, commands: [] })",
    "({ state }) => { const list = [state]; return { state: list.length, commands: [] }; }",
    "function (input) { return { state: input.tick, commands: [] }; }",
    "(input) => { class Counter { constructor() { this.n = 1; } } return { state: new Counter().n, commands: [] }; }",
    "(input) => { const tool = { read() { return this.value; }, value: 3 }; return { state: tool.read(), commands: [] }; }",
    "(input) => { function helper(n) { return n + 1; } return { state: helper(input.tick), commands: [] }; }"
  ])("reuses %s", (source) => {
    expect(canReuseGameScript(source)).toBe(true);
  });

  it.each([
    ["an initializer call", "(() => { let n = 0; return (input) => ({ state: ++n, commands: [] }); })()"],
    ["this in a plain function", "(input) => { function self() { return this; } return { state: typeof self(), commands: [] }; }"],
    ["this at the top of a function expression", "function (input) { return { state: typeof this, commands: [] }; }"],
    ["arguments", "function (input) { arguments[0] = 1; return { state: input, commands: [] }; }"],
    ["eval", "(input) => ({ state: eval('1'), commands: [] })"],
    ["Function", "(input) => ({ state: Function('return 1')(), commands: [] })"],
    ["Reflect", "(input) => ({ state: Reflect.set({}, 'a', 1), commands: [] })"],
    ["a block-level function", "(input) => { if (input) { function inner() { return 1; } } return { state: typeof inner, commands: [] }; }"],
    ["sloppy-only syntax", "(input) => { with (input) { return { state: tick, commands: [] }; } }"],
    ["a legacy octal literal", "(input) => ({ state: 010, commands: [] })"],
    ["a lifecycle object", "({ onUpdate(input) { return { state: 1 }; } })"]
  ])("keeps fresh realms for %s", (_name, source) => {
    expect(canReuseGameScript(source)).toBe(false);
  });
});

describe("reused script realms", () => {
  it("freezes the realm during preparation and evaluates no source or context per call", async () => {
    const source = "({ state }) => { const next = (state || 0) + 1; return { state: next, commands: [] }; }";
    expect(canReuseGameScript(source)).toBe(true);
    const runner = await prepareGameScripts(fixture(source));
    const newContext = vi.spyOn(QuickJSRuntime.prototype, "newContext");
    const evaluate = vi.spyOn(QuickJSContext.prototype, "evalCode");
    try {
      let state: GameScriptCall["state"] = null;
      for (let tick = 0; tick < 5; tick += 1) {
        const batch = runner.run([{ ...call, state }], inputAt(tick), 1);
        state = batch.results[0].state;
      }
      expect(state).toBe(5);
      expect(newContext).not.toHaveBeenCalled();
      expect(evaluate).not.toHaveBeenCalled();
    } finally { runner.dispose(); }
  });

  it("matches fresh realms for random numbers, the world API, params and state", async () => {
    const source = `(input) => {
      const near = world.query({ tag: "loot", limit: 4 });
      const crate = world.get("crate");
      const rolls = [Math.random(), input.random(), Math.random()];
      const ids = input.world.map((entity) => entity.id);
      return { state: { count: ((input.state && input.state.count) || 0) + 1, near, crate: crate.x, rolls, ids, keys: Object.keys(input) }, commands: [] };
    }`;
    expect(canReuseGameScript(source)).toBe(true);
    const reused = await runTicks(source);
    expect(reused).toEqual(await runTicks(fresh(source)));
    expect((reused[3] as { result: { state: { count: number } } }).result.state.count).toBe(4);
  });

  it.each([
    ["a global", "(input) => { globalThis.leak = (globalThis.leak || 0) + 1; return { state: globalThis.leak, commands: [] }; }"],
    ["an implicit global", "(input) => { leak = (typeof leak === 'number' ? leak : 0) + 1; return { state: leak, commands: [] }; }"],
    ["Array.prototype", "(input) => { Array.prototype.leak = ([].leak || 0) + 1; return { state: [].leak, commands: [] }; }"],
    ["Object.prototype", "(input) => { const before = ({}).leak || 0; Object.prototype.leak = before + 1; return { state: ({}).leak, commands: [] }; }"],
    ["Math", "(input) => { Math.leak = (Math.leak || 0) + 1; return { state: Math.leak, commands: [] }; }"],
    ["JSON", "(input) => { JSON.leak = (JSON.leak || 0) + 1; return { state: JSON.leak, commands: [] }; }"],
    ["the generator prototype", "(input) => { const proto = Object.getPrototypeOf(function* () {}); proto.leak = (proto.leak || 0) + 1; return { state: proto.leak, commands: [] }; }"],
    ["the iterator prototype", "(input) => { const proto = Object.getPrototypeOf(Object.getPrototypeOf([].values())); proto.leak = (proto.leak || 0) + 1; return { state: proto.leak, commands: [] }; }"],
    ["the script's own function", "function tick(input) { tick.leak = (tick.leak || 0) + 1; return { state: tick.leak, commands: [] }; }"],
    ["the script's prototype object", "function tick(input) { tick.prototype.leak = (tick.prototype.leak || 0) + 1; return { state: tick.prototype.leak, commands: [] }; }"],
    ["a redefined built-in", "(input) => { const before = String(Math.max(1, 2)); Math.max = () => 9; return { state: before, commands: [] }; }"],
    ["an error's inherited name", "(input) => { const error = new Error('x'); error.name = 'Custom' + input.tick; return { state: error.name, commands: [] }; }"]
  ])("keeps no state written to %s", async (name, source) => {
    expect(canReuseGameScript(source)).toBe(true);
    const reused = await runTicks(source);
    // Every call starts from the same built-ins, so the results equal the fresh-realm results, call after call.
    expect(reused).toEqual(await runTicks(fresh(source)));
    expect(new Set(reused.map((output) => JSON.stringify((output as { result: { state: unknown } }).result.state))).size)
      .toBe(name === "an error's inherited name" ? 4 : 1);
  });

  it("falls back to a fresh realm once and then stops reusing the source", async () => {
    const source = "(input) => { globalThis.leak = 1; return { state: globalThis.leak, commands: [] }; }";
    const runner = await prepareGameScripts(fixture(source));
    try {
      runner.run([call], inputAt(0), 1);
      const newContext = vi.spyOn(QuickJSRuntime.prototype, "newContext");
      for (let tick = 1; tick < 4; tick += 1) {
        expect(runner.run([call], inputAt(tick), 1).results[0].state).toBe(1);
      }
      // One fresh context per call and no new frozen realm.
      expect(newContext).toHaveBeenCalledTimes(3);
    } finally { runner.dispose(); }
  });

  it("reports a script error from the fresh realm when the call fails in both", async () => {
    const runner = await prepareGameScripts(fixture("(input) => { throw new Error('broken ' + input.tick); }"));
    try {
      expect(() => runner.run([call], inputAt(3), 1)).toThrow(/worker at tick 3 failed: .*broken 3/);
    } finally { runner.dispose(); }
  });

  it("refreezes a hot-reloaded source before its next call", async () => {
    const runner = await prepareGameScripts(fixture("(input) => { const state = 'old'; return { state, commands: [] }; }"));
    try {
      expect(runner.run([call], inputAt(0), 1).results[0].state).toBe("old");
      runner.reloadSources([{ sourceKey: key, source: "(input) => { const state = 'new'; return { state, commands: [] }; }" }]);
      const newContext = vi.spyOn(QuickJSRuntime.prototype, "newContext");
      expect(runner.run([call], inputAt(1), 1).results[0].state).toBe("new");
      expect(newContext).not.toHaveBeenCalled();
    } finally { runner.dispose(); }
  });
});
