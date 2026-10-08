import { describe, expect, it } from "vitest";
import { gameDocument } from "@nodetool-ai/protocol";
import { createScriptedGameSession, createTopDownRoomGame } from "../src/index.js";
import { prepareGameScripts, scriptSourceKey } from "../src/scripts.js";

describe("script host world", () => {
  function scripted(source: string) {
    const base = createTopDownRoomGame("a".repeat(32));
    return gameDocument.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene,
      entities: scene.entities.map((entity) => entity.id === "player" ? { ...entity,
        behaviors: [{ kind: "script", source, maxTickMs: 50, maxCommands: 8 }] } : entity) })) });
  }

  it("keeps the lazy legacy copy writable and private between calls", async () => {
    const document = scripted(`input => {
      const initial = input.world[0].x;
      input.world[0].x = 123;
      input.world.push({ id: "added", x: 7 });
      const edited = input.world[0].x;
      const added = input.world[input.world.length - 1].id;
      input.world = [];
      return { state: { initial, edited, added, replaced: input.world.length }, commands: [] };
    }`);
    const session = await createScriptedGameSession(document, 1);
    try {
      session.step({ pressed: [] });
      expect(session.snapshot().scriptState['["room","player",0]']).toEqual({ initial: 0, edited: 123, added: "added", replaced: 0 });
      session.step({ pressed: [] });
      expect(session.snapshot().scriptState['["room","player",0]']).toEqual({ initial: 0, edited: 123, added: "added", replaced: 0 });
    } finally { session.dispose(); }
  });

  it("bounds every query attempt with entity and tick context", async () => {
    const session = await createScriptedGameSession(scripted(`input => {
      for (let i = 0; i < 65; i++) { world.get("missing"); }
      return { state: null, commands: [] };
    }`), 1);
    try { expect(() => session.step({ pressed: [] })).toThrow(/player.*tick 0.*maxQueries 64/); }
    finally { session.dispose(); }
  });

  it("cannot catch and suppress an exhausted host query budget", async () => {
    const session = await createScriptedGameSession(scripted(`input => {
      try { for (let i = 0; i < 65; i++) { world.get("missing"); } } catch {}
      return { state: null, commands: [] };
    }`), 1);
    try { expect(() => session.step({ pressed: [] })).toThrow(/player.*tick 0.*maxQueries 64/); }
    finally { session.dispose(); }
  });

  it("bounds query arguments before copying them to the host", async () => {
    const session = await createScriptedGameSession(scripted(`input => ({
      state: world.query({ source: "x".repeat(5000) }), commands: []
    })`), 1);
    try { expect(() => session.step({ pressed: [] })).toThrow(/player.*tick 0.*4096/); }
    finally { session.dispose(); }
  });

  it("bounds get IDs before copying them to the host", async () => {
    const session = await createScriptedGameSession(scripted(`input => ({ state: world.get("x".repeat(1025)), commands: [] })`), 1);
    try { expect(() => session.step({ pressed: [] })).toThrow(/player.*tick 0.*1024/); }
    finally { session.dispose(); }
  });

  it("returns private writable query values", async () => {
    const session = await createScriptedGameSession(scripted(`input => {
      const found = world.get("player");
      found.x = 99;
      return { state: { changed: found.x, original: world.get("player").x }, commands: [] };
    }`), 1);
    try {
      session.step({ pressed: [] });
      expect(session.snapshot().scriptState['["room","player",0]']).toEqual({ changed: 99, original: 0 });
    } finally { session.dispose(); }
  });

  it("preserves source-initializer JSON.parse overrides and input property order", async () => {
    const session = await createScriptedGameSession(scripted(`(() => {
      const parse = JSON.parse;
      JSON.parse = text => { const data = parse(text); data.input.world = [{ id: "override" }]; return data; };
      return input => ({ state: { id: input.world[0].id, keys: Object.keys(input) }, commands: [] });
    })()`), 1);
    try {
      session.step({ pressed: [] });
      expect(session.snapshot().scriptState['["room","player",0]']).toEqual({
        id: "override", keys: ["tick", "pressed", "justPressed", "events", "entity", "world", "state", "random"]
      });
    } finally { session.dispose(); }
  });

  it.each([
    `(() => { let count = 0; return input => ({ state: ++count, commands: [] }); })()`,
    `input => { (0, eval)("let counter = 1"); return { state: 1, commands: [] }; }`,
    `(() => { Object.defineProperty(Array.prototype, "locked", { value: 1, configurable: false }); return input => ({ state: [].locked, commands: [] }); })()`,
    `(() => { let prior; return input => { const fresh = prior === undefined; prior = input; return { state: fresh ? 1 : 2, commands: [] }; }; })()`,
    `(() => { const values = new Map(); return input => { values.set("count", (values.get("count") || 0) + 1); return { state: values.get("count"), commands: [] }; }; })()`
  ])("keeps arbitrary legacy source isolated: %s", async (source) => {
    const game = scripted(source);
    const session = await createScriptedGameSession(game, 1);
    try {
      session.step({ pressed: [] });
      session.step({ pressed: [] });
      expect(session.snapshot().scriptState['["room","player",0]']).toBe(1);
      const restored = await createScriptedGameSession(game, 1, session.snapshot());
      try {
        session.step({ pressed: [] });
        restored.step({ pressed: [] });
        expect(restored.snapshot()).toEqual(session.snapshot());
      } finally { restored.dispose(); }
    } finally { session.dispose(); }
  });

  it("normalizes native JSON values and preserves own __proto__ keys", async () => {
    const runner = await prepareGameScripts(scripted("input => ({ state: { value: input.state, leaked: input.state.marker || 0 }, commands: [] })"));
    const fallback = await prepareGameScripts(scripted("({state}) => ({ state: { value: state, leaked: state.marker || 0 }, commands: [] })"));
    const key = scriptSourceKey("room", "player", 0);
    const state = JSON.parse('{"__proto__":{"marker":7},"constructor":"data","toString":3,"array":["🔥",null]}');
    state.negativeZero = -0;
    state.infinity = Infinity;
    try {
      const calls = [{ sourceKey: key, stateKey: key, entityId: "player", source: "player", state,
        x: 0, y: 0, velocityX: 0, velocityY: 0, touching: { down: false, up: false, left: false, right: false }, maxCommands: 8, maxTickMs: 50
      }];
      const input = { tick: 0, pressed: [], justPressed: [], events: [], world: [] };
      const result = runner.run(calls, input, 1);
      expect(result.results).toEqual(fallback.run(calls, input, 1).results);
      expect(result.results[0].state).toMatchObject({ leaked: 0, value: { negativeZero: 0, infinity: null } });
    } finally { runner.dispose(); fallback.dispose(); }
  });

  it.each([
    "world.query({ radius: 1 })", "world.query({ near: { x: 0, y: 0 } })",
    "world.query({ limit: -1 })", "world.query({ limit: 1025 })", "world.get(3)",
    "world.query({ near: { x: Infinity, y: 0 }, radius: 1 })"
  ])("rejects invalid arguments: %s", async (expression) => {
    const session = await createScriptedGameSession(scripted(`input => ({ state: ${expression}, commands: [] })`), 1);
    try { expect(() => session.step({ pressed: [] })).toThrow(/player.*tick 0/); }
    finally { session.dispose(); }
  });

  it("queries noncollider entities while retaining the original legacy population", async () => {
    const game = scripted(`input => ({ state: {
      found: world.get("decoration").id,
      tagged: world.query({ tag: "absent" }),
      limited: world.query({ limit: 0 }),
      legacy: input.world.some(entity => entity.id === "decoration")
    }, commands: [] })`);
    game.scenes[0].entities.push({ id: "decoration", transform2d: { x: 1, y: 2, scaleX: 1, scaleY: 1, rotation: 0 }, behaviors: [] });
    const session = await createScriptedGameSession(game, 1);
    try {
      session.step({ pressed: [] });
      expect(session.snapshot().scriptState['["room","player",0]']).toEqual({ found: "decoration", tagged: [], limited: [], legacy: false });
    } finally { session.dispose(); }
  });

  it("captures global velocity before authored movement while preserving legacy entity input", async () => {
    const game = scripted(`input => ({ state: {
      start: world.get("player").velocityX, legacy: input.entity.velocityX
    }, commands: [] })`);
    const player = game.scenes[0].entities.find((entity) => entity.id === "player")!;
    player.behaviors.unshift({ kind: "movement", left: "left", right: "right", up: "up", down: "down", speed: 5 });
    const session = await createScriptedGameSession(game, 1);
    try {
      session.step({ pressed: ["right"] });
      expect(session.snapshot().scriptState['["room","player",1]']).toEqual({ start: 0, legacy: 5 });
      session.step({ pressed: [] });
      expect(session.snapshot().scriptState['["room","player",1]']).toEqual({ start: 5, legacy: 0 });
    } finally { session.dispose(); }
  });

  it("reads entities and inclusive radius queries without replacing the legacy world array", async () => {
    const base = createTopDownRoomGame("a".repeat(32));
    const document = gameDocument.parse({
      ...base,
      scenes: base.scenes.map((scene) => ({
        ...scene,
        entities: scene.entities.map((entity) => entity.id === "player" ? {
          ...entity,
          behaviors: [{
            kind: "script",
            source: `input => ({ state: {
              found: world.get("target"),
              missing: world.get("missing") === undefined,
              near: world.query({ near: { x: 0, y: 0 }, radius: 5, limit: 1 }),
              legacy: Array.isArray(input.world)
            }, commands: [] })`,
            maxCommands: 8,
            maxTickMs: 50
          }]
        } : entity)
      }))
    });
    const sourceKey = scriptSourceKey("room", "player", 0);
    const runner = await prepareGameScripts(document);
    try {
      const batch = runner.run([{
        sourceKey, stateKey: sourceKey, entityId: "player", source: "player", state: null,
        x: 0, y: 0, velocityX: 0, velocityY: 0,
        touching: { down: false, up: false, left: false, right: false },
        maxCommands: 8, maxTickMs: 50
      }], {
        tick: 3, pressed: [], justPressed: [], events: [],
        world: [
          { id: "target", source: "template", x: 3, y: 4 },
          { id: "origin", source: "template", x: 0, y: 0 }
        ]
      }, 1);
      expect(batch.results[0].state).toMatchObject({
        found: { id: "target", source: "template", x: 3, y: 4 },
        missing: true,
        near: ["target"],
        legacy: true
      });
    } finally {
      runner.dispose();
    }
  });
});
