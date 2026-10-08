import { describe, expect, it, vi } from "vitest";
import { QuickJSContext } from "quickjs-emscripten-core";
import { gameDocument } from "@nodetool-ai/protocol";
import { canPersistGameScript } from "../src/script-persistence.js";
import { createTopDownRoomGame } from "../src/sample.js";
import { prepareGameScripts, scriptSourceKey } from "../src/scripts.js";
import { prepareGameScripts3D } from "../src/scripts3d.js";
import { blockout } from "./fixtures-game3d.js";

describe("persistent script proof", () => {
  it("bounds native callback registrations and releases call-owned world readers", async () => {
    const document = gameDocument.parse(createTopDownRoomGame("a".repeat(32)));
    const player = document.scenes[0].entities.find((entity) => entity.id === "player")!;
    player.behaviors = [{ kind: "script", source: "input => ({ state: input.world, commands: [] })", maxTickMs: 50, maxCommands: 8 }];
    const runner = await prepareGameScripts(document);
    const nativeFunction = vi.spyOn(QuickJSContext.prototype, "newFunction");
    const key = scriptSourceKey("room", "player", 0);
    try {
      for (let tick = 0; tick < 10; tick += 1) {
        const world = [{ id: "target", source: "target", x: tick, y: 0 }];
        const batch = runner.run([{ sourceKey: key, stateKey: key, entityId: "player", source: "player", state: null,
          x: 0, y: 0, velocityX: 0, velocityY: 0, touching: { down: false, up: false, left: false, right: false }, maxTickMs: 50, maxCommands: 8
        }], { tick, pressed: [], justPressed: [], events: [], world }, 1);
        expect(batch.results[0].state).toEqual(world);
      }
      expect(nativeFunction.mock.calls.filter(([name]) => name === "legacyWorld")).toHaveLength(1);
      const index = nativeFunction.mock.calls.findIndex(([name]) => name === "legacyWorld");
      const context = nativeFunction.mock.contexts[index];
      const getter = nativeFunction.mock.results[index].value;
      const result = context.callFunction(getter, context.undefined);
      try {
        expect(result.error).toBeDefined();
        if (result.error) { expect(JSON.stringify(context.dump(result.error))).toContain("outside an active script call"); }
      } finally { if (result.error) { result.error.dispose(); } else { result.value.dispose(); } }
    } finally { nativeFunction.mockRestore(); runner.dispose(); }
  });

  it("validates source during preparation and retains an active instance with native values on later calls", async () => {
    const document = gameDocument.parse(createTopDownRoomGame("a".repeat(32)));
    const player = document.scenes[0].entities.find((entity) => entity.id === "player")!;
    player.behaviors = [{ kind: "script", source: "input => ({ state: (input.state || 0) + 1, commands: [] })", maxTickMs: 50, maxCommands: 8 }];
    const evaluate = vi.spyOn(QuickJSContext.prototype, "evalCode");
    const nativeObject = vi.spyOn(QuickJSContext.prototype, "newObject");
    const key = scriptSourceKey("room", "player", 0);
    const runner = await prepareGameScripts(document);
    try {
      expect(evaluate.mock.calls.filter(([source]) => source.includes("globalThis.__gameScript ="))).toHaveLength(1);
      evaluate.mockClear(); nativeObject.mockClear();
      const call = { sourceKey: key, stateKey: key, entityId: "player", source: "player", state: null,
        x: 0, y: 0, velocityX: 0, velocityY: 0, touching: { down: false, up: false, left: false, right: false }, maxTickMs: 50, maxCommands: 8 };
      const input = { tick: 0, pressed: [], justPressed: [], events: [], world: [] };
      const first = runner.run([call], input, 7);
      expect(evaluate.mock.calls.filter(([source]) => source.includes("globalThis.__gameScript ="))).toHaveLength(1);
      evaluate.mockClear(); nativeObject.mockClear();
      const second = runner.run([{ ...call, state: first.results[0].state }], { ...input, tick: 1 }, first.rngState);
      expect(second.results[0].state).toBe(2);
      expect(second.rngState).toBe(7);
      expect(evaluate).not.toHaveBeenCalled();
      expect(nativeObject).toHaveBeenCalled();
      runner.retain?.(new Set());
      runner.run([call], input, 7);
      expect(evaluate.mock.calls.filter(([source]) => source.includes("globalThis.__gameScript ="))).toHaveLength(1);
    } finally { runner.dispose(); evaluate.mockRestore(); nativeObject.mockRestore(); }
  });

  it("validates many inactive definitions without accumulating persistent realms", async () => {
    const document = blockout();
    const scene = document.scenes[0];
    document.scenes.push({ ...scene, id: "inactive", entities: Array.from({ length: 512 }, (_, index) => ({
      ...scene.entities[1], id: `unused-${index}`, behaviors: [{ kind: "script" as const, source: "input => ({ state: input.state, commands: [] })", maxTickMs: 50, maxCommands: 8 }]
    })) });
    const runner = await prepareGameScripts3D(document);
    try {
      const sourceKey = scriptSourceKey("inactive", "unused-0", 0);
      const calls = ["instance-a", "instance-b"].map((entityId, index) => ({ sourceKey,
        stateKey: scriptSourceKey("scene", entityId, 0), entityId, source: "unused-0", state: index + 1,
        position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, grounded: false, maxTickMs: 50, maxCommands: 8
      }));
      const result = runner.run(calls, { tick: 0, pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 },
        camera: { yaw: 0, pitch: 0 }, events: [], queries: [], world: [] }, 1);
      expect(result.results.map((item) => [item.entityId, item.state])).toEqual([["instance-a", 1], ["instance-b", 2]]);
    } finally { runner.dispose(); }
  }, 10_000);

  it.each([
    "input => ({ state: (input.state || 0) + 1, commands: [] })",
    "function(input) { return { state: input.state === null ? 0 : input.state + 1, commands: [] }; }"
  ])("accepts the input-only expression %s", (source) => {
    expect(canPersistGameScript(source)).toBe(true);
  });

  it.each([
    "(() => { let count = 0; return () => ++count })()",
    "input => input.random()", "input => input.world.map(x => x)",
    "input => input.state++", "input => delete input.state", "input => input.state = 1",
    "input => input['state']", "input => input.constructor", "input => input.state.__proto__",
    "input => input.state.prototype", "input => ({ __proto__: input.state })",
    "input => ({ get state() { return 1 } })", "input => ({ state() { return 1 } })",
    "input => ({ ...input })", "input => [ ...input ]", "input => Math.random()",
    "input => globalThis", "input => this", "async input => input.state",
    "function*(input) { return input.state }", "input => new Map()",
    "input => /foo/", "input => 1n", "input => Promise.resolve(1)",
    "input => (input.state, input.tick)", "input => input?.state", "({state}) => state",
    "(input = {}) => input", "input => (() => input)", "input => 'x' in input",
    "input => input instanceof Object", "input => { let x = 1; return x }",
    "input => input.state; globalThis.leak = 1"
  ])("falls back for %s", (source) => {
    expect(canPersistGameScript(source)).toBe(false);
  });
});
