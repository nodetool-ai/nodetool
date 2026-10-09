import { describe, expect, it, vi } from "vitest";
import { gameEntity3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { anyGameDocumentOp, applyAnyGameOps, applyGameOps3D, instantiateGamePrefab3D } from "../src/document-ops3d.js";
import { GameOpError } from "../src/document-ops.js";
import { createTopDownRoomGame } from "../src/sample.js";
import { blockout } from "./fixtures-game3d.js";

function withPrefab() {
  const game = blockout();
  game.prefabs.actor = { rootId: "root", externalAssets: [], externalScenes: [], entities: [
    gameEntity3D.parse({ id: "root", transform3d: {}, body3d: { type: "kinematic" }, collider3d: { kind: "capsule", radius: 0.3, halfHeight: 0.5 } }),
    gameEntity3D.parse({ id: "visual", parentId: "root", transform3d: {}, primitive: { kind: "box", dimensions: { x: 1, y: 1, z: 1 } } }),
    gameEntity3D.parse({ id: "view", parentId: "root", transform3d: {}, camera3d: { projection: { kind: "perspective" }, behavior: { kind: "follow", targetId: "root" } } })
  ] };
  return game;
}

describe("scene music JSON operations", () => {
  function withMusic(): GameDocument3D {
    const document = blockout();
    document.assets.music = { mediaKind: "audio", assetId: "0123456789abcdef0123456789abcdef",
      digest: "music-fixture", required: true };
    document.scenes[0].music = { assetId: "music", volume: 0.5, fadeInTicks: 0, fadeOutTicks: 0 };
    return document;
  }
  function applyWire(document: GameDocument3D, operations: unknown[]): GameDocument3D {
    const ops = JSON.parse(JSON.stringify(operations)).map((op: unknown) => anyGameDocumentOp.parse(op));
    const result = applyAnyGameOps(document, ops);
    if (result.schemaVersion !== 3) { throw new Error("Expected 3D document"); }
    return result;
  }
  it("removes, restores and removes music through the public JSON operation union", () => {
    const before = withMusic();
    const target = { op: "update_scene" as const, scene_id: before.scenes[0].id };
    const after = structuredClone(before);
    delete after.scenes[0].music;
    expect(applyWire(before, [{ ...target, set: { music: null } }])).toEqual(after);
    expect(applyWire(after, [{ ...target, set: { music: before.scenes[0].music } }])).toEqual(before);
    expect(applyWire(before, [{ ...target, set: { music: null } }])).toEqual(after);
    expect(applyWire(after, [{ ...target, set: { music: null } }])).toEqual(after);
  });
  it("keeps omitted music and rejects an invalid later patch atomically", () => {
    const before = withMusic();
    const snapshot = structuredClone(before);
    const target = { op: "update_scene" as const, scene_id: before.scenes[0].id };
    const renamed = applyWire(before, [{ ...target, set: { name: "Renamed" } }]);
    expect(renamed.scenes[0].music).toEqual(before.scenes[0].music);
    expect(applyWire(before, [{ ...target, set: { music: { assetId: "music" } } }]).scenes[0].music)
      .toEqual({ assetId: "music", volume: 1, fadeInTicks: 0, fadeOutTicks: 0 });
    expect(() => applyAnyGameOps(before, [{ ...target, set: { name: "First edit" } },
      { ...target, set: { music: { assetId: "music", volume: -1 } } }]))
      .toThrow(GameOpError);
    expect(before).toEqual(snapshot);
    expect(() => applyWire(before, [{ ...target, set: { name: "First edit" } },
      { ...target, set: { music: { ...before.scenes[0].music, assetId: "missing" } } }])).toThrow(GameOpError);
    expect(before).toEqual(snapshot);
  });
  it("sets, switches and clears the scene sky through update_scene", () => {
    const before = blockout();
    before.scenes[0].entities.push(gameEntity3D.parse({ id: "sun", transform3d: {}, light3d: { kind: "directional", color: "#ffffff", intensity: 2 } }));
    const target = { op: "update_scene" as const, scene_id: before.scenes[0].id };
    const environment = before.scenes[0].environment;
    const procedural = applyWire(before, [{ ...target, set: { environment: { ...environment, sky: { kind: "procedural", sunEntityId: "sun" } } } }]);
    expect(procedural.scenes[0].environment).toEqual({ ...environment, sky: { kind: "procedural", sunEntityId: "sun", turbidity: 10, rayleigh: 2, groundColor: "#3d3a36", intensity: 1 } });
    expect(() => applyWire(before, [{ ...target, set: { environment: { ...environment, sky: { kind: "hdri", assetId: "missing" } } } }])).toThrow(GameOpError);
    expect(() => applyWire(before, [{ ...target, set: { environment: { ...environment, sky: { kind: "procedural", turbidity: 40 } } } }])).toThrow(/Too big/);
    expect(applyWire(procedural, [{ ...target, set: { environment } }]).scenes[0].environment).toEqual(environment);
  });
});

describe("dimension-specific removal defaults at the public operation boundary", () => {
  it("preserves omitted children while retaining 2D default removal and explicit reparenting", () => {
    const before = applyAnyGameOps(createTopDownRoomGame("union-removal-2d"), [
      { op: "add_entity", scene_id: "room", entity: { id: "parent" } },
      { op: "add_entity", scene_id: "room", entity: { id: "child", parentId: "parent" } }
    ]);
    const op = { op: "remove_entity", scene_id: "room", entity_id: "parent" };
    const implicit = anyGameDocumentOp.parse(JSON.parse(JSON.stringify(op)));
    expect(implicit).toEqual(op);
    const removed = applyAnyGameOps(before, [implicit]);
    expect(removed.scenes[0].entities.some((entity) => entity.id === "child")).toBe(false);
    const explicit = anyGameDocumentOp.parse({ ...op, children: "remove" });
    expect(applyAnyGameOps(before, [explicit])).toEqual(removed);
    const reparented = applyAnyGameOps(before, [anyGameDocumentOp.parse({ ...op, children: "reparent" })]);
    expect(reparented.scenes[0].entities.find((entity) => entity.id === "child")).toMatchObject({ id: "child" });
    expect(reparented.scenes[0].entities.find((entity) => entity.id === "child")?.parentId).toBeUndefined();
  });
  it("does not introduce 2D children options into 3D and still rejects explicit unsupported options", () => {
    const source = blockout();
    const before = applyGameOps3D(source, [{ op: "add_entity", scene_id: source.entrySceneId, entity: { id: "removable" } }]);
    const entity = before.scenes[0].entities.find((entry) => entry.id === "removable");
    if (!entity) { throw new Error("Removable entity missing"); }
    const op = { op: "remove_entity", scene_id: before.entrySceneId, entity_id: entity.id };
    const removed = applyAnyGameOps(before, [anyGameDocumentOp.parse(JSON.parse(JSON.stringify(op)))]);
    expect(removed.scenes[0].entities.some((entry) => entry.id === entity.id)).toBe(false);
    expect(() => applyAnyGameOps(before, [anyGameDocumentOp.parse({ ...op, children: "remove" })])).toThrow(GameOpError);
    expect(anyGameDocumentOp.safeParse({ ...op, children: "invalid" }).success).toBe(false);
  });
});
function applyWithLinearScanBudget(document: GameDocument3D, op: Parameters<typeof applyGameOps3D>[1][number]): GameDocument3D {
  const originalSome = Array.prototype.some;
  let predicateCalls = 0;
  const scan = vi.spyOn(Array.prototype, "some").mockImplementation(function (this: unknown[], predicate, thisArg) {
    return originalSome.call(this, (value, index, array) => {
      predicateCalls++;
      return predicate.call(thisArg, value, index, array);
    });
  });
  let result: GameDocument3D;
  try { result = applyGameOps3D(document, [op]); }
  finally { scan.mockRestore(); }
  expect(predicateCalls).toBeLessThan(32 * result.scenes[0].entities.length);
  return result;
}

describe("atomic 3D document operations", () => {
  it("merges typed partial transforms and components on a private draft", () => {
    const game = blockout();
    const next = applyGameOps3D(game, [{ op: "update_entity", entity_id: "player", set: { transform3d: { position: { x: 4 } }, character3d: { speed: 8 } } }]);
    expect(next.scenes[0].entities[1].transform3d.position).toEqual({ x: 4, y: 0, z: 0 });
    expect(next.scenes[0].entities[1].character3d?.speed).toBe(8);
    expect(game).toEqual(blockout());
    expect(() => applyGameOps3D(game, [{ op: "update_entity", entity_id: "player", set: { transform3d: { scale: { x: 2 } } } }])).toThrow(GameOpError);
    expect(game).toEqual(blockout());
  });
  it("preserves omitted component settings across serialized partial edits and body role changes", () => {
    const game = blockout();
    const player = game.scenes[0].entities[1];
    if (!player.character3d || !player.body3d) { throw new Error("Player components missing"); }
    player.character3d.acceleration = 47;
    player.body3d.linearDamping = 2;
    const edited = applyAnyGameOps(game, [{ op: "update_entity", entity_id: "player", set: { character3d: { speed: 9 }, body3d: { gravityScale: 2 } } }]);
    expect(edited.scenes[0].entities[1].character3d?.acceleration).toBe(47);
    expect(edited.scenes[0].entities[1].body3d?.linearDamping).toBe(2);
    const changed = applyAnyGameOps(edited, [{ op: "update_entity", entity_id: "player", set: { character3d: null, body3d: { type: "dynamic", mass: 8 } } }]);
    expect(changed.scenes[0].entities[1].body3d).toMatchObject({ type: "dynamic", mass: 8 });
    const staticBody = applyAnyGameOps(changed, [{ op: "update_entity", entity_id: "player", set: { body3d: { type: "static" } } }]);
    expect(staticBody.scenes[0].entities[1].body3d?.type).toBe("static");
    expect(staticBody.scenes[0].entities[1].body3d).not.toHaveProperty("mass");
  });
  it("rejects stale drafts and ambiguous entity targets", () => {
    const game = blockout();
    expect(() => applyGameOps3D(game, [], { expectedRevision: "old" })).toThrow(/Stale/);
    game.scenes.push({ ...structuredClone(game.scenes[0]), id: "other" });
    expect(() => applyGameOps3D(game, [{ op: "update_entity", entity_id: "player", set: { name: "Player" } }])).toThrow(/multiple scenes/);
  });
  it("remaps complete prefab subtrees and preserves independent definitions", () => {
    const game = withPrefab();
    const result = instantiateGamePrefab3D(game.prefabs.actor, "first");
    expect(result.mapping).toEqual({ root: "first", visual: "first/visual", view: "first/view" });
    expect(result.entities.find((entity) => entity.id === "first/view")?.camera3d?.behavior).toMatchObject({ targetId: "first" });
    expect(result.entities.find((entity) => entity.id === "first/visual")?.parentId).toBe("first");
    const edited = applyGameOps3D(game, [
      { op: "instantiate_prefab", scene_id: "scene", prefab_id: "actor", instance_id: "first" },
      { op: "instantiate_prefab", scene_id: "scene", prefab_id: "actor", instance_id: "second" },
      { op: "update_entity", entity_id: "first", set: { transform3d: { position: { x: 5 } } } }
    ]);
    expect(edited.scenes[0].entities.find((entity) => entity.id === "second")?.transform3d.position.x).toBe(0);
    expect(game.prefabs.actor.entities[0].transform3d.position.x).toBe(0);
    const removed = applyGameOps3D(edited, [{ op: "remove_entity", entity_id: "first" }]);
    expect(removed.scenes[0].entities.filter((entity) => entity.id.startsWith("first"))).toHaveLength(0);
    expect(() => applyGameOps3D(game, [
      { op: "instantiate_prefab", scene_id: "scene", prefab_id: "actor", instance_id: "same" },
      { op: "instantiate_prefab", scene_id: "scene", prefab_id: "actor", instance_id: "same" }
    ])).toThrow(/already exists/);
  });
  it("duplicates and removes a deep hierarchy at the scene entity limit with bounded scans", () => {
    const game = blockout();
    const count = 2047;
    for (let index = 0; index < count; index++) {
      const entity = gameEntity3D.parse({ id: `branch${index}`, transform3d: {} });
      if (index > 0) { entity.parentId = `branch${index - 1}`; }
      game.scenes[0].entities.push(entity);
    }
    const duplicated = applyWithLinearScanBudget(game, { op: "duplicate_entity", entity_id: "branch0", new_id: "copy" });
    expect(duplicated.scenes[0].entities).toHaveLength(4096);
    expect(duplicated.scenes[0].entities.at(-1)).toMatchObject({ id: "copy/branch2046", parentId: "copy/branch2045" });
    expect(game.scenes[0].entities).toHaveLength(2049);
    const removed = applyGameOps3D(duplicated, [{ op: "remove_entity", entity_id: "branch0" }]);
    expect(removed.scenes[0].entities).toHaveLength(2049);
    expect(removed.scenes[0].entities.slice(2).every((entity) => entity.id === "copy" || entity.id.startsWith("copy/"))).toBe(true);
    expect(applyGameOps3D(removed, [{ op: "remove_entity", entity_id: "copy" }])).toEqual(blockout());
  });
  it("instantiates a maximum-size prefab into a populated scene with bounded scans and atomic child collisions", () => {
    const game = blockout();
    for (let index = 0; index < 3838; index++) { game.scenes[0].entities.push(gameEntity3D.parse({ id: `existing${index}`, transform3d: {} })); }
    game.prefabs.branch = { rootId: "part0", externalAssets: [], externalScenes: [], entities: Array.from({ length: 256 }, (_, index) => {
      const entity = gameEntity3D.parse({ id: `part${index}`, transform3d: {} });
      if (index > 0) { entity.parentId = `part${index - 1}`; }
      return entity;
    }) };
    const instantiated = applyWithLinearScanBudget(game, { op: "instantiate_prefab", scene_id: "scene", prefab_id: "branch", instance_id: "instance" });
    expect(instantiated.scenes[0].entities).toHaveLength(4096);
    expect(instantiated.scenes[0].entities.at(-1)).toMatchObject({ id: "instance/part255", parentId: "instance/part254" });
    const blocked = structuredClone(game);
    blocked.scenes[0].entities[2].id = "instance/part255";
    expect(() => applyGameOps3D(blocked, [{ op: "instantiate_prefab", scene_id: "scene", prefab_id: "branch", instance_id: "instance" }])).toThrow(/Instance ID already exists/);
    expect(blocked.scenes[0].entities).toHaveLength(3840);
    expect(blocked.scenes[0].entities.some((entity) => entity.id === "instance")).toBe(false);
  });
  it("dispatches legacy edits and rejects 3D operations entering legacy documents", () => {
    const old = createTopDownRoomGame("old");
    expect(applyAnyGameOps(old, [{ op: "update_entity", entity_id: "player", set: { name: "Renamed" } }]).schemaVersion).toBe(old.schemaVersion);
    expect(() => applyAnyGameOps(old, [{ op: "set_prefab", prefab_id: "actor", prefab: withPrefab().prefabs.actor }])).toThrow(GameOpError);
    expect(applyAnyGameOps(blockout(), [{ op: "update_entity", entity_id: "player", set: { name: "Renamed" } }]).dimension).toBe("3d");
  });
});
