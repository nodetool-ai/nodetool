import { describe, expect, it, vi } from "vitest";
import { gameDocument } from "@nodetool-ai/protocol";
import { createGameSession, createScriptedGameSession, createTopDownRoomGame, replayScriptedGame, validateGame } from "../src/index.js";
import { wallScriptCallClock } from "../src/script-clock.js";
import { prepareGameScripts, scriptSourceKey } from "../src/scripts.js";

function scriptedGame(source: string) {
  const base = createTopDownRoomGame("a".repeat(32));
  return gameDocument.parse({
    ...base,
    scenes: base.scenes.map((scene) => ({
      ...scene,
      entities: scene.entities.map((entity) => entity.id === "player"
        ? { ...entity, behaviors: [{ kind: "script", source, maxCommands: 8, maxTickMs: 30 }] }
        : entity)
    }))
  });
}

describe("game scripts", () => {
  it("interrupts an infinite loop within its tick budget", async () => {
    const game = structuredClone(scriptedGame("() => { while (true) {} }"));
    const script = game.scenes[0].entities.find((entity) => entity.id === "player")?.behaviors[0];
    if (!script || script.kind !== "script") throw new Error("Missing scripted player");
    delete (script as { maxTickMs?: number }).maxTickMs;
    const session = await createScriptedGameSession(game, 1);
    const started = performance.now();
    expect(() => session.step({ pressed: [] })).toThrow(/interrupted/);
    expect(performance.now() - started).toBeLessThan(1000);
    session.dispose();
  });

  it("interrupts a script that loops while being prepared", async () => {
    const game = scriptedGame("(() => { while (true) {} })()");
    const started = performance.now();
    await expect(createScriptedGameSession(game, 1)).rejects.toThrow(/interrupted/);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("rejects invalid or excessive commands before applying them", async () => {
    const invalid = await createScriptedGameSession(scriptedGame("({state}) => ({state, commands: [{kind: 'setVelocity', x: 'fast', y: 0}]})"), 1);
    expect(() => invalid.step({ pressed: [] })).toThrow();
    invalid.dispose();

    const excessive = await createScriptedGameSession(scriptedGame("({state}) => ({state, commands: Array.from({length: 9}, () => ({kind: 'emit', event: 'e'}))})"), 1);
    expect(() => excessive.step({ pressed: [] })).toThrow(/command limit/);
    excessive.dispose();
  });

  it("fails on the 120th step and replays safely to tick 119", async () => {
    const game = scriptedGame("({tick, state}) => { if (tick === 119) throw new Error('planned failure'); return {state, commands: []}; }");
    const session = await createScriptedGameSession(game, 1);
    const input = { pressed: [] };
    for (let tick = 1; tick < 120; tick++) session.step(input);
    expect(session.snapshot().tick).toBe(119);
    expect(() => session.step(input)).toThrow(/planned failure.*tick 119|tick 119.*planned failure/);
    session.dispose();

    const replay = await replayScriptedGame(game, 1, Array.from({ length: 119 }, () => input));
    expect(replay.snapshot.tick).toBe(119);
  });

  it("rejects a document with more scripted behaviors than can be prepared", () => {
    const game = scriptedGame("({state}) => ({state, commands: []})");
    const entities = Array.from({ length: 33 }, (_, index) => ({
      id: `actor-${index}`,
      transform2d: { x: index, y: 0 },
      behaviors: [{ kind: "script", source: "({state}) => ({state, commands: []})" }]
    }));
    const overLimit = gameDocument.parse({
      ...game,
      scenes: [{ ...game.scenes[0], entities: [...game.scenes[0].entities, ...entities] }]
    });
    expect(validateGame(overLimit).errors).toContain("Game exceeds the limit of 32 scripted behaviors");
  });

  it("restores explicit script state and replays input deterministically", async () => {
    const game = scriptedGame("({state, random}) => ({state: {count: (state?.count ?? 0) + 1, roll: random()}, commands: [{kind: 'setVelocity', x: 3, y: 0}]})");
    expect(() => createGameSession(game, 1)).toThrow(/createScriptedGameSession/);
    const first = await createScriptedGameSession(game, 7);
    for (let tick = 0; tick < 10; tick += 1) first.step({ pressed: [] });
    const save = first.snapshot();
    const second = await createScriptedGameSession(game, 7, save);
    for (let tick = 0; tick < 10; tick += 1) {
      const result = first.step({ pressed: [] });
      second.step({ pressed: [] });
      expect(result.scriptStats?.calls).toBe(1);
      expect(result.scriptStats?.commands).toBe(1);
      expect(result.scriptStats?.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.scriptStats?.byEntity.player?.calls).toBe(1);
      expect(result.scriptStats?.byEntity.player?.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(second.snapshot()).toEqual(first.snapshot());
    const replay = await replayScriptedGame(game, 7, Array.from({ length: 20 }, () => ({ pressed: [] })));
    expect(replay.snapshot).toEqual(first.snapshot());
    first.dispose();
    second.dispose();
  });

  it("restarts a closure from the source on each tick and after restore", async () => {
    const game = scriptedGame("(() => { let count = 0; return () => ({ state: null, commands: [{ kind: 'setPosition', x: ++count, y: 0 }] }); })()");
    const first = await createScriptedGameSession(game, 1);
    first.step({ pressed: [] });
    first.step({ pressed: [] });
    const saved = first.snapshot();
    const restored = await createScriptedGameSession(game, 1, saved);
    first.step({ pressed: [] });
    restored.step({ pressed: [] });
    expect(first.snapshot()).toEqual(restored.snapshot());
    expect(first.snapshot().entities.find((entity) => entity.id === "player")?.x).toBe(1);
    first.dispose();
    restored.dispose();
  });

  it("isolates input and globals between script calls", async () => {
    const game = structuredClone(scriptedGame("({ pressed, events, world }) => { pressed.push('leak'); events.push('leak'); world[0].x = 99; globalThis.leak = 1; return { state: null, commands: [] }; }"));
    const player = game.scenes[0].entities.find((entity) => entity.id === "player");
    if (!player) {
      throw new Error("Missing scripted player");
    }
    player.behaviors.push({ kind: "script", source: "({ pressed, events, world }) => ({ state: { pressed: pressed.length, events: events.length, x: world[0].x, leak: globalThis.leak ?? null }, commands: [] })", maxCommands: 8, maxTickMs: 30 });
    const session = await createScriptedGameSession(game, 1);
    session.step({ pressed: [] });
    expect(session.snapshot().scriptState['["room","player",1]']).toEqual({ pressed: 0, events: 0, x: 0, leak: null });
    session.dispose();
  });

  it("passes JSON data without exposing a mutable transport global", async () => {
    const runner = await prepareGameScripts(scriptedGame(`(() => {
      Object.defineProperty(globalThis, '__gameInputJson', {
        set() { throw new Error('transport intercepted'); }, configurable: false
      });
      return ({state}) => ({state, commands: []});
    })()`));
    const sourceKey = scriptSourceKey("room", "player", 0);
    const state = { text: 'Unicode 🔥 \"quotes\" \u0000 \u2028', nested: { value: null } };
    const call = { sourceKey, stateKey: sourceKey, entityId: "player", source: "player", state,
      x: 0, y: 0, velocityX: 0, velocityY: 0, touching: { down: false, up: false, left: false, right: false },
      tags: [], props: {}, rotation: 0, active: true, maxCommands: 8, maxTickMs: 30 };
    try {
      const result = runner.run([call, call], { tick: 3, pressed: [], justPressed: [], events: [], world: [] }, 1);
      expect(result.results.map(item => item.state)).toEqual([state, state]);
    } finally {
      runner.dispose();
    }
  });

  it("measures script input and output limits in UTF-8 bytes", async () => {
    const sourceKey = scriptSourceKey("room", "player", 0);
    const call = { sourceKey, stateKey: sourceKey, entityId: "player", source: "player", state: null,
      x: 0, y: 0, velocityX: 0, velocityY: 0, maxCommands: 8, maxTickMs: 30 };
    const input = { tick: 3, pressed: [], justPressed: [], events: [], world: [] };
    const inputRunner = await prepareGameScripts(scriptedGame("({state}) => ({state, commands: []})"));
    expect(() => inputRunner.run([call], { ...input, pressed: ["🔥".repeat(17_000)] }, 1)).toThrow(/input exceeds 64 KiB.*bytes.*tick 3/);
    inputRunner.dispose();

    const outputRunner = await prepareGameScripts(scriptedGame("() => ({state: '🔥'.repeat(17000), commands: []})"));
    expect(() => outputRunner.run([call], input, 1)).toThrow(/Output exceeds 64 KiB.*bytes/);
    outputRunner.dispose();

    const envelopeRunner = await prepareGameScripts(scriptedGame("() => ({state: 'a'.repeat(65460), commands: []})"));
    expect(() => envelopeRunner.run([call], input, 1)).toThrow(/Output exceeds 64 KiB.*bytes/);
    envelopeRunner.dispose();
  });

  it("counts input serialization against the batch deadline", async () => {
    const game = scriptedGame("({state}) => ({state, commands: []})");
    const runner = await prepareGameScripts(game);
    const sourceKey = scriptSourceKey("room", "player", 0);
    const call = { sourceKey, stateKey: sourceKey, entityId: "player", source: "player", state: null,
      x: 0, y: 0, velocityX: 0, velocityY: 0, maxCommands: 8, maxTickMs: 30 };
    let clock = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => clock);
    try {
      const input = { tick: 3, pressed: [], justPressed: [], events: [{ toJSON: () => { clock = 51; return "event"; } }], world: [] };
      expect(() => runner.run([call], input, 1)).toThrow(/interrupted.*batch.*50 ms/i);
    } finally {
      now.mockRestore();
      runner.dispose();
    }
  });

  it("counts per-call serialization against maxTickMs", async () => {
    // This test drives performance.now, so it measures the call on the wall clock that browsers use.
    const runner = await prepareGameScripts(scriptedGame("({state}) => ({state, commands: []})"), { callClock: wallScriptCallClock });
    const sourceKey = scriptSourceKey("room", "player", 0);
    const call = { sourceKey, stateKey: sourceKey, entityId: "player", source: "player", state: null,
      x: 0, y: 0, velocityX: 0, velocityY: 0, maxCommands: 8, maxTickMs: 30 };
    let clock = 0;
    let serializations = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => clock);
    try {
      const input = { tick: 3, pressed: [], justPressed: [], events: [{ toJSON: () => {
        serializations += 1;
        if (serializations === 2) {
          clock = 31;
        }
        return "event";
      } }], world: [] };
      expect(() => runner.run([call], input, 1)).toThrow(/interrupted.*call 30 ms.*player.*tick 3/i);
    } finally {
      now.mockRestore();
      runner.dispose();
    }
  });

  it("counts output processing against the batch deadline", async () => {
    const runner = await prepareGameScripts(scriptedGame("({state}) => ({state, commands: []})"));
    const sourceKey = scriptSourceKey("room", "player", 0);
    const call = { sourceKey, stateKey: sourceKey, entityId: "player", source: "player", state: null,
      x: 0, y: 0, velocityX: 0, velocityY: 0, maxCommands: 8, maxTickMs: 30 };
    const input = { tick: 3, pressed: [], justPressed: [], events: [], world: [] };
    let clock = 0;
    let encodes = 0;
    const originalEncode = TextEncoder.prototype.encode;
    const now = vi.spyOn(performance, "now").mockImplementation(() => clock);
    const encode = vi.spyOn(TextEncoder.prototype, "encode").mockImplementation(function (this: TextEncoder, value?: string) {
      const bytes = originalEncode.call(this, value);
      encodes += 1;
      if (encodes === 2) {
        clock = 51;
      }
      return bytes;
    });
    try {
      expect(() => runner.run([call], input, 1)).toThrow(/interrupted.*batch 50 ms.*tick 3/i);
    } finally {
      encode.mockRestore();
      now.mockRestore();
      runner.dispose();
    }
  });

  it("includes source initialization random draws in saved RNG state", async () => {
    const source = "(() => { const setupRoll = Math.random(); return ({random}) => ({state: {setupRoll, tickRoll: random()}, commands: []}); })()";
    const game = scriptedGame(source);
    const sourceKey = scriptSourceKey("room", "player", 0);
    const call = { sourceKey, stateKey: sourceKey, entityId: "player", source: "player", state: null,
      x: 0, y: 0, velocityX: 0, velocityY: 0, maxCommands: 8, maxTickMs: 30 };
    const input = { tick: 0, pressed: [], justPressed: [], events: [], world: [] };
    const next = (state: number): number => (Math.imul(1664525, state) + 1013904223) >>> 0;
    const runner = await prepareGameScripts(game);
    const first = runner.run([call], input, 7);
    expect(first.results[0].state).toEqual({ setupRoll: next(7) / 4294967296, tickRoll: next(next(7)) / 4294967296 });
    expect(first.rngState).toBe(next(next(7)));
    const continuous = runner.run([{ ...call, state: first.results[0].state }], { ...input, tick: 1 }, first.rngState);
    const restoredRunner = await prepareGameScripts(game);
    const restored = restoredRunner.run([{ ...call, state: first.results[0].state }], { ...input, tick: 1 }, first.rngState);
    expect(restored.results).toEqual(continuous.results);
    expect(restored.rngState).toBe(continuous.rngState);
    runner.dispose();
    restoredRunner.dispose();
  });
});
