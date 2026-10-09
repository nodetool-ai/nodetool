import { describe, expect, it, vi } from "vitest";
import { QuickJSContext } from "quickjs-emscripten-core";
import { gameDocument, gameInputFrame3D, type GameDocument } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "../src/sample.js";
import { createScriptedGameSession } from "../src/session.js";
import { createGameSession3D } from "../src/session3d.js";
import { prepareGameScripts, scriptSourceKey, type GameScriptCall } from "../src/scripts.js";
import * as collision from "../src/systems/collision2d.js";
import { blockout } from "./fixtures-game3d.js";

const safe = "input => ({ state: input.state, commands: [] })";
const input = { tick: 0, pressed: [], justPressed: [], events: [], world: [] };

function fixture(sources: readonly string[]): GameDocument {
  const base = createTopDownRoomGame("a".repeat(32));
  return gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: [
    ...scene.entities.map((entity) => ({ ...entity, behaviors: [] })),
    ...sources.map((source, index) => ({ id: `worker-${index}`, transform2d: { x: 0, y: 0 },
      behaviors: [{ kind: "script", source, maxTickMs: 50, maxCommands: 8 }] }))
  ] })) });
}

function call(index: number, state: GameScriptCall["state"] = null): GameScriptCall {
  const entityId = `worker-${index}`;
  const key = scriptSourceKey("room", entityId, 0);
  return { sourceKey: key, stateKey: key, entityId, source: entityId, state,
    x: 0, y: 0, velocityX: 0, velocityY: 0, touching: { down: false, up: false, left: false, right: false },
    maxTickMs: 50, maxCommands: 8 };
}

describe("script realm ownership", () => {
  it("does not build a discarded native-input copy for a fresh call", async () => {
    const runner = await prepareGameScripts(fixture(["input => ({ state: Math.abs(input.state || 0), commands: [] })"]));
    let reads = 0;
    try {
      const result = runner.run([call(0, 7)], { ...input, get world() { reads += 1; return []; } }, 1, []);
      expect(result.results[0].state).toBe(7);
      expect(reads).toBe(2); // Logical batch accounting and the legacy per-call JSON argument.
    } finally { runner.dispose(); }
  });

  it.each([
    { source: "input => ({ state: input.state.value, commands: [] })", valid: { value: 1 }, invalid: null },
    { source: "input => ({ state: null, commands: input.state })", valid: [], invalid: "invalid commands" }
  ])("releases every retained context after guest or output failure: $source", async ({ source, valid, invalid }) => {
    const evaluate = vi.spyOn(QuickJSContext.prototype, "evalCode");
    const runner = await prepareGameScripts(fixture([safe, source]));
    try {
      runner.run([call(0), call(1, valid)], input, 1);
      const contexts = [...new Set(evaluate.mock.contexts)];
      expect(contexts).toHaveLength(2);
      expect(contexts.every((context) => context.alive)).toBe(true);
      expect(() => runner.run([call(0), call(1, invalid)], { ...input, tick: 1 }, 1)).toThrow();
      expect(contexts.every((context) => !context.alive)).toBe(true);
      evaluate.mockClear();
      expect(runner.run([call(0)], { ...input, tick: 2 }, 1).results).toHaveLength(1);
      expect(evaluate.mock.contexts[0]).not.toBe(contexts[0]);
    } finally { runner.dispose(); evaluate.mockRestore(); }
  });

  it("releases retained and fresh contexts when the real interrupt deadline fires", async () => {
    const evaluate = vi.spyOn(QuickJSContext.prototype, "evalCode");
    const runner = await prepareGameScripts(fixture([safe, "input => { while (true) {} }"]));
    try {
      runner.run([call(0)], input, 1);
      expect(() => runner.run([call(0), { ...call(1), maxTickMs: 20 }], { ...input, tick: 1 }, 1)).toThrow(/interrupt|budget/i);
      const contexts = [...new Set(evaluate.mock.contexts)];
      // The retained safe realm, the fallback script's validation realm and its interrupted call realm.
      expect(contexts).toHaveLength(3);
      expect(contexts.every((context) => !context.alive)).toBe(true);
    } finally { runner.dispose(); evaluate.mockRestore(); }
  });

  it("releases retained contexts on failure before a call begins", async () => {
    const evaluate = vi.spyOn(QuickJSContext.prototype, "evalCode");
    const runner = await prepareGameScripts(fixture([safe]));
    try {
      runner.run([call(0)], input, 1);
      const context = evaluate.mock.contexts[0];
      expect(context.alive).toBe(true);
      expect(() => runner.run([call(0, "x".repeat(70_000))], input, 1)).toThrow(/input exceeds 64 KiB/);
      expect(context.alive).toBe(false);
    } finally { runner.dispose(); evaluate.mockRestore(); }
  });

  it("disposes only removed instances and reuses the remaining context", async () => {
    const evaluate = vi.spyOn(QuickJSContext.prototype, "evalCode");
    const runner = await prepareGameScripts(fixture([safe, safe]));
    try {
      runner.run([call(0), call(1)], input, 1);
      const contexts = [...new Set(evaluate.mock.contexts)];
      expect(contexts).toHaveLength(2);
      runner.retain?.(new Set([call(0).stateKey]));
      expect(contexts.map((context) => context.alive)).toEqual([true, false]);
      evaluate.mockClear();
      expect(runner.run([call(0, 7)], input, 1).results[0].state).toBe(7);
      expect(evaluate).not.toHaveBeenCalled();
      runner.retain?.(new Set());
      expect(contexts.every((context) => !context.alive)).toBe(true);
    } finally { runner.dispose(); evaluate.mockRestore(); }
  });

  it("releases validated entry-scene realms that the first batch does not use", async () => {
    const evaluate = vi.spyOn(QuickJSContext.prototype, "evalCode");
    const runner = await prepareGameScripts(fixture([safe, safe]));
    try {
      const prepared = [...new Set(evaluate.mock.contexts)];
      expect(prepared).toHaveLength(2);
      expect(prepared.every((context) => context.alive)).toBe(true);
      evaluate.mockClear();
      runner.run([call(0)], input, 1);
      expect(evaluate).not.toHaveBeenCalled();
      expect(prepared.map((context) => context.alive)).toEqual([true, false]);
      runner.run([call(0), call(1)], { ...input, tick: 1 }, 1);
      expect(evaluate.mock.contexts.filter((context) => context !== prepared[0])).not.toHaveLength(0);
    } finally { runner.dispose(); evaluate.mockRestore(); }
  });

  it("prunes the last despawned script and skips query snapshot collision work on later ticks", async () => {
    const evaluate = vi.spyOn(QuickJSContext.prototype, "evalCode");
    const session = await createScriptedGameSession(fixture([
      "input => ({ state: input.tick, commands: [{ kind: 'despawn', entityId: input.entity.id }] })"
    ]), 1);
    const touching = vi.spyOn(collision, "touchingOf");
    try {
      session.step({ pressed: [] });
      const context = evaluate.mock.contexts[0];
      expect(context.alive).toBe(true);
      touching.mockClear();
      session.step({ pressed: [] });
      expect(context.alive).toBe(false);
      expect(touching).not.toHaveBeenCalled();
    } finally { session.dispose(); touching.mockRestore(); evaluate.mockRestore(); }
  });

  it("skips query snapshot collision work when scripts exist only on an inactive template", async () => {
    const document = fixture([safe]);
    document.scenes[0].entities.find((entity) => entity.id === "worker-0")!.templateOnly = true;
    const session = await createScriptedGameSession(document, 1);
    const touching = vi.spyOn(collision, "touchingOf");
    try {
      session.step({ pressed: [] });
      expect(touching).not.toHaveBeenCalled();
      expect(session.snapshot().tick).toBe(1);
    } finally { session.dispose(); touching.mockRestore(); }
  });

  it.each(["2d", "3d"])("releases a successful script realm when the %s session fails afterward", async (dimension) => {
    const source = "input => ({ state: 1, commands: [{ kind: 'spawn', prefabId: 'missing' }] })";
    const document3D = blockout();
    document3D.scenes[0].entities[1].behaviors = [{ kind: "script", source, maxTickMs: 50, maxCommands: 8 }];
    const evaluate = vi.spyOn(QuickJSContext.prototype, "evalCode");
    const session = dimension === "2d" ? await createScriptedGameSession(fixture([source]), 1)
      : await createGameSession3D(document3D, 1);
    try {
      expect(() => session.step(gameInputFrame3D.parse({ pressed: [] }))).toThrow(/missing.*prefab/i);
      const contexts = [...new Set(evaluate.mock.contexts)];
      expect(contexts).toHaveLength(1);
      expect(contexts[0].alive).toBe(false);
      expect(() => session.snapshot()).toThrow(/failed/);
    } finally { session.dispose(); evaluate.mockRestore(); }
  });
});
