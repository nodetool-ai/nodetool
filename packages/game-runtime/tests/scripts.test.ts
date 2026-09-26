import { describe, expect, it } from "vitest";
import { gameDocument } from "@nodetool-ai/protocol";
import { createGameSession, createScriptedGameSession, createTopDownRoomGame, replayScriptedGame, validateGame } from "../src/index.js";

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
    }
    expect(second.snapshot()).toEqual(first.snapshot());
    const replay = await replayScriptedGame(game, 7, Array.from({ length: 20 }, () => ({ pressed: [] })));
    expect(replay.snapshot).toEqual(first.snapshot());
    first.dispose();
    second.dispose();
  });
});
