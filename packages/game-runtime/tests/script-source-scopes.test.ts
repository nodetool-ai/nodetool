import { expect, it } from "vitest";
import { gameEntity3D, gameInputFrame3D } from "@nodetool-ai/protocol";
import { createGameSession3D } from "../src/session3d.js";
import { canPersistGameScript } from "../src/script-persistence.js";
import { scriptSourceKey } from "../src/scripts.js";
import { prepareGameScripts3D } from "../src/scripts3d.js";
import { parseScriptSourceKey, prefabScriptSourceKey, sceneScriptSourceKey } from "../src/script-source.js";
import { blockout } from "./fixtures-game3d.js";

const input = gameInputFrame3D.parse({ pressed: [] });
const sceneId = "prefab:enemy";
const source = (origin: string) => `input => { const origin = ${JSON.stringify(origin)}; return { state: { origin, value: input.params.value }, commands: [] }; }`;

function fixture() {
  const document = blockout();
  document.entrySceneId = sceneId;
  document.scenes[0].id = sceneId;
  const actor = (origin: string, value: number) => gameEntity3D.parse({ id: "actor", transform3d: {}, behaviors: [{
    kind: "script", source: source(origin), maxCommands: 4, maxTickMs: 20,
    params: { value: { type: "number", default: 0 } }, values: { value }
  }] });
  document.scenes[0].entities.push(actor("scene", 11));
  document.scenes[0].entities[1].behaviors = [{ kind: "script", maxCommands: 4, maxTickMs: 20,
    source: "input => ({ state: null, commands: input.tick === 0 ? [{ kind: 'spawn', prefabId: 'enemy' }] : [] })" }];
  document.prefabs.enemy = { rootId: "actor", entities: [actor("prefab", 22)], externalAssets: [], externalScenes: [] };
  return document;
}

it("keeps authored scene and prefab code and parameters distinct despite matching legacy scope names", async () => {
  expect(canPersistGameScript(source("scene"))).toBe(false);
  expect(canPersistGameScript(source("prefab"))).toBe(false);
  const session = await createGameSession3D(fixture(), 1);
  try {
    session.step(input);
    session.step(input);
    expect(session.snapshot().scriptState).toMatchObject({
      [scriptSourceKey(sceneId, "actor", 0)]: { origin: "scene", value: 11 },
      [scriptSourceKey(sceneId, "enemy#1/actor", 0)]: { origin: "prefab", value: 22 }
    });
  } finally { session.dispose(); }
});

it("reloads colliding scopes independently and replays each tick after serialized restoration", async () => {
  let document = fixture();
  const session = await createGameSession3D(document, 1);
  let restored: Awaited<ReturnType<typeof createGameSession3D>> | undefined;
  try {
    for (let tick = 0; tick < 120; tick += 1) {
      if (tick === 30 || tick === 90) {
        const edited = structuredClone(document);
        const behavior = tick === 30 ? edited.scenes[0].entities.at(-1)!.behaviors[0] : edited.prefabs.enemy.entities[0].behaviors[0];
        if (behavior.kind !== "script") { throw new Error("Missing fixture script"); }
        behavior.source = source(tick === 30 ? "scene-edited" : "prefab-edited");
        const accepted = await session.reloadScripts(edited);
        expect(accepted.ok).toBe(true);
        if (!accepted.ok) { throw new Error(accepted.error); }
        if (restored) { expect(await restored.reloadScripts(edited)).toEqual(accepted); }
        document = accepted.document;
      }
      const result = session.step(input);
      if (restored) {
        expect(restored.step(input).events).toEqual(result.events);
        expect(restored.snapshot()).toEqual(session.snapshot());
      }
      if (tick === 59) {
        restored = await createGameSession3D(document, 1, JSON.parse(JSON.stringify(session.snapshot())));
        expect(restored.snapshot()).toEqual(session.snapshot());
      }
      if (tick === 30 || tick === 90) {
        expect(session.snapshot().scriptState).toMatchObject({
          [scriptSourceKey(sceneId, "actor", 0)]: { origin: "scene-edited", value: 11 },
          [scriptSourceKey(sceneId, "enemy#1/actor", 0)]: { origin: tick === 30 ? "prefab" : "prefab-edited", value: 22 }
        });
      }
    }
  } finally { restored?.dispose(); session.dispose(); }
});

it("restores pending destruction hooks to their scene and prefab sources and rejects ambiguous legacy records", async () => {
  const document = fixture();
  const hooks = (origin: string) => `({
    onUpdate(input) { return { commands: input.tick === 59 || input.tick === 99 ? [{ kind: 'despawn', entityId: input.entity.id }] : [] }; },
    onDestroy(input) { return { commands: [{ kind: 'emit', event: ${JSON.stringify(origin)} + ':' + input.params.value }] }; }
  })`;
  const sceneBehavior = document.scenes[0].entities.at(-1)!.behaviors[0];
  const prefabBehavior = document.prefabs.enemy.entities[0].behaviors[0];
  if (sceneBehavior.kind !== "script" || prefabBehavior.kind !== "script") { throw new Error("Missing fixture scripts"); }
  sceneBehavior.source = hooks("scene");
  prefabBehavior.source = hooks("prefab");
  document.scenes.push({ ...structuredClone(document.scenes[0]), id: "another-scene" });
  document.scenes[0].entities[1].behaviors[0] = { kind: "script", maxCommands: 4, maxTickMs: 20,
    source: "input => ({ state: null, commands: input.tick === 0 || input.tick === 80 ? [{ kind: 'spawn', prefabId: 'enemy' }] : [] })" };
  const session = await createGameSession3D(document, 1);
  let restored: Awaited<ReturnType<typeof createGameSession3D>> | undefined;
  try {
    for (let tick = 0; tick < 120; tick += 1) {
      const result = session.step(input);
      if (restored) {
        expect(restored.step(input).events).toEqual(result.events);
        expect(restored.snapshot()).toEqual(session.snapshot());
      }
      if (tick === 59) {
        const checkpoint = JSON.parse(JSON.stringify(session.snapshot()));
        restored = await createGameSession3D(document, 1, checkpoint);
        for (const legacyScope of ["prefab:enemy", "another-scene"]) {
          const legacy = structuredClone(checkpoint);
          const record = legacy.scriptState[scriptSourceKey(sceneId, "enemy#1/actor", 0)];
          record.removed.sourceKey = scriptSourceKey(legacyScope, "actor", 0);
          await expect(createGameSession3D(document, 1, legacy)).rejects.toThrow("incompatible legacy script source identity");
        }
      }
      if (tick === 60) {
        expect(result.events).toEqual(expect.arrayContaining([
          expect.objectContaining({ kind: "trigger", event: "scene:11" }),
          expect.objectContaining({ kind: "trigger", event: "prefab:22" })
        ]));
      }
      if (tick === 100) {
        expect(result.events).toContainEqual(expect.objectContaining({ kind: "trigger", event: "prefab:22" }));
      }
    }
  } finally { restored?.dispose(); session.dispose(); }
});


it("also isolates retained expression sources without treating scene names as prefab scopes", async () => {
  const document = fixture();
  for (const [entity, origin] of [[document.scenes[0].entities.at(-1)!, "scene"], [document.prefabs.enemy.entities[0], "prefab"]] as const) {
    const behavior = entity.behaviors[0];
    if (behavior.kind !== "script") { throw new Error("Missing fixture script"); }
    behavior.source = `input => ({ state: { origin: "${origin}", value: input.params.value }, commands: [] })`;
    expect(canPersistGameScript(behavior.source)).toBe(true);
  }
  const session = await createGameSession3D(document, 1);
  try {
    session.step(input); session.step(input);
    expect(session.snapshot().scriptState).toMatchObject({
      [scriptSourceKey(sceneId, "actor", 0)]: { origin: "scene", value: 11 },
      [scriptSourceKey(sceneId, "enemy#1/actor", 0)]: { origin: "prefab", value: 22 }
    });
  } finally { session.dispose(); }
});

it("rejects duplicate source registration instead of overwriting it", async () => {
  const document = fixture();
  document.scenes.push(structuredClone(document.scenes[0]));
  await expect(prepareGameScripts3D(document)).rejects.toThrow("Duplicate game script source");
});

it("parses discriminated sources without changing instance-state keys", () => {
  const scene = sceneScriptSourceKey("prefab:enemy", "actor", 0);
  const prefab = prefabScriptSourceKey("enemy", "actor", 0);
  expect(scene).not.toBe(prefab);
  expect(parseScriptSourceKey(scene)).toEqual({ legacy: false, kind: "scene", scopeId: "prefab:enemy", entityId: "actor", behaviorIndex: 0 });
  expect(parseScriptSourceKey(prefab)).toEqual({ legacy: false, kind: "prefab", scopeId: "enemy", entityId: "actor", behaviorIndex: 0 });
  expect(scriptSourceKey("prefab:enemy", "actor", 0)).toBe('["prefab:enemy","actor",0]');
  for (const key of ['["other","enemy","actor",0]', '["prefab","enemy","actor",-1]', '{}', 'invalid']) {
    expect(parseScriptSourceKey(key)).toBeUndefined();
  }
});

it.each([true, false])("restores ordinary script state resembling a legacy destruction record when the entity is active=%s", async (active) => {
  const document = fixture();
  const behavior = document.scenes[0].entities.at(-1)!.behaviors[0];
  if (behavior.kind !== "script") { throw new Error("Missing fixture script"); }
  behavior.source = `input => ({ state: { $lifecycle: 1, state: 'guest-value', timers: [], removed: { sourceKey: ${JSON.stringify(scriptSourceKey(sceneId, "actor", 0))} } }, commands: ${active ? "[]" : "[{ kind: 'despawn', entityId: input.entity.id }]"} })`;
  const session = await createGameSession3D(document, 1);
  try {
    session.step(input);
    const checkpoint = JSON.parse(JSON.stringify(session.snapshot()));
    const restored = await createGameSession3D(document, 1, checkpoint);
    try {
      expect(restored.snapshot()).toEqual(session.snapshot());
      expect(restored.step(input).events).toEqual(session.step(input).events);
      expect(restored.snapshot()).toEqual(session.snapshot());
    } finally { restored.dispose(); }
  } finally { session.dispose(); }
});
