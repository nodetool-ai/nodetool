import { describe, expect, it } from "vitest";
import { gameDocument, gameDocument3D, gameInputFrame3D, type GameDocument, type GameDocument3D } from "@nodetool-ai/protocol";
import {
  applyGameOps, applyGameOps3D, createGameSession3D, createScriptedGameSession, createTopDownRoomGame, GameOpError, validateGame, validateGame3D
} from "../src/index.js";
import { canPersistGameScript } from "../src/script-persistence.js";
import { prepareGameScripts, scriptSourceKey, type GameScriptCall } from "../src/scripts.js";
import { blockout } from "./fixtures-game3d.js";

const input = { pressed: [] };
const input3D = gameInputFrame3D.parse({ pressed: [] });
const SPEED = { speed: { type: "number", default: 1, minimum: 0, maximum: 10 } } as const;
/** Proven input-only, so it runs in a persistent realm. */
const PERSISTENT = "(input) => ({ state: input.params, commands: [{ kind: 'setVelocity', x: input.params.speed, y: 0 }] })";
/** Destructures its input, so it runs in a fresh context. */
const FRESH = "({ params, state }) => { const before = params.speed; params.speed = 99; return { state: { before, seen: (state && state.seen || 0) + 1 }, commands: [{ kind: 'setVelocity', x: before, y: 0 }] }; }";

function document2D(behavior: Record<string, unknown>, schemaVersion: 2 | 4 = 4, entity = "player"): GameDocument {
  const base = createTopDownRoomGame("script-params");
  return gameDocument.parse({ ...base, schemaVersion, engineVersion: schemaVersion === 4 ? "3" : "1",
    scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((item) => item.id === entity
      ? { ...item, behaviors: [{ kind: "script", maxCommands: 4, maxTickMs: 40, ...behavior }] } : item) })) });
}

function document3D(behavior: Record<string, unknown>): GameDocument3D {
  const base = blockout();
  return gameDocument3D.parse({ ...base, assets: { theme: { mediaKind: "audio", assetId: "theme-asset", digest: "theme-digest" } },
    scenes: [{ ...base.scenes[0], entities: [...base.scenes[0].entities, { id: "mover", transform3d: {}, behaviors: [{ kind: "script", maxTickMs: 40, ...behavior }] }] }] });
}

async function playerX(document: GameDocument, ticks: number): Promise<number> {
  const session = await createScriptedGameSession(document, 1);
  try {
    for (let tick = 0; tick < ticks; tick += 1) { session.step(input); }
    const player = session.snapshot().entities.find((item) => item.id === "player");
    if (!player) { throw new Error("Session must keep the player"); }
    return player.x;
  } finally { session.dispose(); }
}

describe("scripts read inspector params on input.params", () => {
  it("covers both execution paths with the fixture scripts", () => {
    expect(canPersistGameScript(PERSISTENT)).toBe(true);
    expect(canPersistGameScript(FRESH)).toBe(false);
  });

  it.each([["persistent", PERSISTENT], ["fresh-context", FRESH]])("changes 2D play when only a %s script's value changes", async (_path, source) => {
    const slow = await playerX(document2D({ source, params: SPEED, values: { speed: 1 } }), 10);
    const fast = await playerX(document2D({ source, params: SPEED, values: { speed: 4 } }), 10);
    const defaulted = await playerX(document2D({ source, params: SPEED }), 10);
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeCloseTo(slow * 4, 6);
    expect(defaulted).toBeCloseTo(slow, 6);
  });

  it("gives every call fresh params, so a script cannot change a later call's values", async () => {
    const session = await createScriptedGameSession(document2D({ source: FRESH, params: SPEED, values: { speed: 2 } }), 1);
    try {
      for (let tick = 0; tick < 3; tick += 1) { session.step(input); }
      expect(Object.values(session.snapshot().scriptState)).toEqual([{ before: 2, seen: 3 }]);
    } finally { session.dispose(); }
  });

  it("delivers resolved values of every kind, with references as IDs or null", async () => {
    const params = {
      speed: { type: "number", default: 2 }, armed: { type: "boolean", default: true }, tint: { type: "color", default: "#112233" },
      mode: { type: "enum", options: ["chase", "flee"] }, target: { type: "entity" }, gem: { type: "entity", default: "gem" },
      sound: { type: "asset", kind: "audio", default: "sfx.collect" }, offset: { type: "vector", dimensions: 2, default: { x: 1, y: -1 } }
    };
    const session = await createScriptedGameSession(document2D({ source: "(input) => ({ state: input.params, commands: [] })", params, values: { mode: "flee" } }), 1);
    try {
      session.step(input);
      expect(Object.values(session.snapshot().scriptState)).toEqual([{
        speed: 2, armed: true, tint: "#112233", mode: "flee", target: null, gem: "gem", sound: "sfx.collect", offset: { x: 1, y: -1 }
      }]);
    } finally { session.dispose(); }
  });

  it("leaves input without a params key when the behavior declares none", async () => {
    const session = await createScriptedGameSession(document2D({ source: "(input) => ({ state: 'params' in input, commands: [] })" }), 1);
    try {
      session.step(input);
      expect(Object.values(session.snapshot().scriptState)).toEqual([false]);
    } finally { session.dispose(); }
  });

  it.each([["persistent", "(input) => ({ state: input.params.speed, commands: [] })"],
    ["fresh-context", "({ params }) => ({ state: params.speed, commands: [] })"]])(
    "changes 3D script results when only a %s script's value changes", async (_path, source) => {
      const read = async (speed: number): Promise<unknown[]> => {
        const session = await createGameSession3D(document3D({ source, params: SPEED, values: { speed } }), 1);
        try { session.step(input3D); return Object.values(session.snapshot().scriptState); } finally { session.dispose(); }
      };
      expect(await read(3)).toEqual([3]);
      expect(await read(5)).toEqual([5]);
    });
});

describe("params in the 64 KiB logical script input", () => {
  it("counts each behavior definition's params once and still enforces the limit", async () => {
    const values = Object.fromEntries(Array.from({ length: 32 }, (_, index) => [`p${index}`, "v".repeat(64)]));
    const params = Object.fromEntries(Object.keys(values).map((name) => [name, { type: "enum", options: [values[name]] }]));
    const document = document2D({ source: "(input) => ({ state: null, commands: [] })", params, values });
    const runner = await prepareGameScripts(document);
    try {
      const sourceKey = scriptSourceKey("room", "player", 0);
      const call = (entityId: string): GameScriptCall => ({ sourceKey, stateKey: entityId, entityId, source: "room", state: null,
        x: 0, y: 0, velocityX: 0, velocityY: 0, touching: { down: false, up: false, left: false, right: false }, maxCommands: 4, maxTickMs: 40 });
      const calls = [call("player"), call("player-copy")];
      const resolved = JSON.stringify(values);
      const shared = { tick: 0, pressed: [], justPressed: [], events: [], world: [] };
      const paramsBytes = `,"params":{${JSON.stringify(sourceKey)}:${resolved}}`.length;
      const empty = JSON.stringify({ calls, input: { ...shared, props: { player: { pad: "" } } }, rngState: 1 });
      // Pad props so the logical input lands one byte past the limit only because params count once.
      const padding = 64 * 1024 + 1 - empty.length - paramsBytes;
      const props = { player: { pad: "x".repeat(padding) } };
      const expected = JSON.stringify({ calls, input: { ...shared, props }, rngState: 1 }).length + paramsBytes;
      expect(expected).toBe(64 * 1024 + 1);
      expect(() => runner.run(calls, { ...shared, props }, 1)).toThrow(`Game script input exceeds 64 KiB (${expected} bytes, 2 calls, tick 0)`);
      const fitting = { player: { pad: "x".repeat(padding - 1) } };
      expect(runner.run(calls, { ...shared, props: fitting }, 1).results).toHaveLength(2);
    } finally { runner.dispose(); }
  });
});

describe("script param validation", () => {
  it("checks 2D entity and asset references", () => {
    const params = { target: { type: "entity" }, sound: { type: "asset", kind: "audio" } };
    expect(validateGame(document2D({ source: PERSISTENT, params, values: { target: "gem", sound: "sfx.collect" } })).valid).toBe(true);
    const result = validateGame(document2D({ source: PERSISTENT, params, values: { target: "ghost", sound: "wall" } }));
    expect(result.issues).toEqual(expect.arrayContaining([
      { path: ["scenes", 0, "entities", 1, "behaviors", 0, "values", "target"], message: "Script parameter target references missing entity ghost" },
      { path: ["scenes", 0, "entities", 1, "behaviors", 0, "values", "sound"], message: "Script parameter sound requires a audio asset, but wall is image" }
    ]));
    expect(validateGame(document2D({ source: PERSISTENT, params: { sound: { type: "asset", default: "missing" } } })).errors)
      .toContain("scenes.0.entities.1.behaviors.0.params.sound.default: Script parameter sound references missing asset missing");
  });

  it("reserves 2D params for schema version 4", () => {
    expect(validateGame(document2D({ source: PERSISTENT, params: SPEED }, 2)).errors)
      .toContain("scenes.0.entities.1.behaviors.0.params: requires schema version 4");
  });

  it("checks 3D references and refuses entity references inside prefabs", () => {
    const params = { target: { type: "entity" }, music: { type: "asset", kind: "audio" } };
    expect(validateGame3D(document3D({ source: PERSISTENT, params, values: { target: "player", music: "theme" } })).valid).toBe(true);
    const missing = validateGame3D(document3D({ source: PERSISTENT, params, values: { target: "ghost", music: "nothing" } }));
    expect(missing.diagnostics.map((issue) => [issue.code, issue.path.slice(-2).join(".")])).toEqual([
      ["invalid_script_param_reference", "values.target"], ["invalid_script_param_reference", "values.music"]
    ]);
    const base = document3D({ source: PERSISTENT });
    const prefab = gameDocument3D.parse({ ...base, prefabs: { drone: { rootId: "drone", externalAssets: [], externalScenes: [], entities: [
      { id: "drone", transform3d: {}, behaviors: [{ kind: "script", source: PERSISTENT, params, values: { target: "drone", music: "theme" } }] }
    ] } } });
    expect(validateGame3D(prefab).diagnostics.map((issue) => issue.code)).toEqual(["invalid_script_param_reference", "undeclared_external_asset"]);
  });
});

describe("set_script_params", () => {
  it("sets, resets and redeclares 2D params through document ops", () => {
    const document = document2D({ source: PERSISTENT });
    const declared = applyGameOps(document, [{ op: "set_script_params", entity_id: "player", index: 0,
      params: { ...SPEED, target: { type: "entity" } }, values: { speed: 5, target: "gem" } }]);
    expect(declared.scenes[0].entities[1].behaviors[0]).toMatchObject({ params: { speed: SPEED.speed }, values: { speed: 5, target: "gem" } });
    const reset = applyGameOps(declared, [{ op: "set_script_params", entity_id: "player", index: 0, values: { speed: null } }]);
    expect(reset.scenes[0].entities[1].behaviors[0]).toMatchObject({ values: { target: "gem" } });
    const redeclared = applyGameOps(reset, [{ op: "set_script_params", entity_id: "player", index: 0, params: SPEED }]);
    expect(redeclared.scenes[0].entities[1].behaviors[0]).not.toHaveProperty("values");
    const removed = applyGameOps(declared, [{ op: "set_script_params", entity_id: "player", index: 0, params: null }]);
    expect(removed.scenes[0].entities[1].behaviors[0]).not.toHaveProperty("params");
    expect(removed.scenes[0].entities[1].behaviors[0]).not.toHaveProperty("values");
  });

  it("changes play when the inspector's set_script_params edit is applied", async () => {
    const document = document2D({ source: PERSISTENT, params: SPEED });
    const edited = applyGameOps(document, [{ op: "set_script_params", entity_id: "player", scene_id: "room", index: 0, values: { speed: 4 } }]);
    expect(edited.scenes[0].entities[1].behaviors[0]).toMatchObject({ source: PERSISTENT });
    expect(await playerX(edited, 10)).toBeCloseTo(await playerX(document, 10) * 4, 6);
  });

  it("rejects 2D values that do not fit or reference nothing", () => {
    const document = document2D({ source: PERSISTENT, params: { ...SPEED, target: { type: "entity" } } });
    expect(() => applyGameOps(document, [{ op: "set_script_params", entity_id: "player", index: 0, values: { speed: 11 } }]))
      .toThrow(expect.objectContaining({ path: ["values", "speed"] }));
    expect(() => applyGameOps(document, [{ op: "set_script_params", entity_id: "player", index: 0, values: { target: "ghost" } }])).toThrow(GameOpError);
    expect(() => applyGameOps(document, [{ op: "set_script_params", entity_id: "gem", index: 0, values: { speed: 1 } }])).toThrow(/not a script/);
  });

  it("sets 3D values and validates references through document ops", () => {
    const document = document3D({ source: PERSISTENT, params: { ...SPEED, target: { type: "entity" } } });
    const updated = applyGameOps3D(document, [{ op: "set_script_params", entity_id: "mover", index: 0, values: { speed: 7, target: "player" } }]);
    expect(updated.scenes[0].entities.find((item) => item.id === "mover")?.behaviors[0]).toMatchObject({ values: { speed: 7, target: "player" } });
    expect(() => applyGameOps3D(document, [{ op: "set_script_params", entity_id: "mover", index: 0, values: { target: "ghost" } }])).toThrow(GameOpError);
  });
});
