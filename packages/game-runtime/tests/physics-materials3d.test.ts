import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { gameDocument3D, gameEntity3D, gameInputFrame3D, type GameCollider3D, type GameCombineRule3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { physicsMaterialIssues3D, resolvePhysicsMaterials3D } from "../src/spatial3d/materials.js";
import { applyGameOps3D } from "../src/document-ops3d.js";
import { createNative3DGame } from "../src/sample3d.js";
import { createGameSession3D } from "../src/session3d.js";
import { validateGame3D } from "../src/validate3d.js";
import { blockout } from "./fixtures-game3d.js";

function colliders(document: GameDocument3D): GameCollider3D[] {
  const entities = [...document.scenes.flatMap((scene) => scene.entities), ...Object.values(document.prefabs).flatMap((prefab) => prefab.entities)];
  return entities.flatMap((entity) => entity.collider3d ? [entity.collider3d] : []);
}

async function existingDocuments(): Promise<[string, GameDocument3D][]> {
  const files = ["samples/aether/game.json", "samples/relay-yard/game.json", "samples/blacksite/game.json", "bench/bench-3d-1000.json", "bench/bench-3d-64-scripted.json"];
  const loaded = await Promise.all(files.map(async (file): Promise<[string, GameDocument3D]> =>
    [file, gameDocument3D.parse(JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), "utf8")))]));
  return [...loaded, ["sample3d", createNative3DGame("sample")], ["blockout", blockout()]];
}

/** A ball dropped onto a floor. Each side may name a material or use inline values. */
function drop(ball: Partial<GameCollider3D>, floor: Partial<GameCollider3D>, materials?: GameDocument3D["physicsMaterials"]): GameDocument3D {
  const game = blockout();
  if (materials) { game.physicsMaterials = materials; }
  game.scenes[0].entities.push(
    gameEntity3D.parse({ id: "floor", transform3d: { position: { x: 0, y: -0.5, z: 5 } }, body3d: { type: "static" },
      collider3d: { kind: "box", halfExtents: { x: 4, y: 0.5, z: 4 }, ...floor } }),
    gameEntity3D.parse({ id: "ball", transform3d: { position: { x: 0, y: 3, z: 5 } }, body3d: { type: "dynamic" },
      collider3d: { kind: "sphere", radius: 0.25, ...ball } })
  );
  return game;
}

const input = gameInputFrame3D.parse({ pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } });

/** The highest the ball rises after it first falls below its rest height. */
async function bounceHeight(game: GameDocument3D): Promise<number> {
  const session = await createGameSession3D(game, 1);
  try {
    let landed = false;
    let peak = 0;
    for (let tick = 0; tick < 180; tick += 1) {
      session.step(input);
      const y = session.inspect({ entityId: "ball" }).entities[0].transform.position.y;
      if (y < 0.3) { landed = true; }
      if (landed) { peak = Math.max(peak, y); }
    }
    expect(landed).toBe(true);
    return peak;
  } finally { session.dispose(); }
}

describe("3D physics materials", () => {
  it("leaves every existing document, and therefore every collider, unchanged", async () => {
    const documents = await existingDocuments();
    expect(documents.flatMap(([, document]) => colliders(document)).length).toBeGreaterThan(20);
    for (const [name, document] of documents) {
      const before = JSON.stringify(document);
      const resolved = resolvePhysicsMaterials3D(document);
      expect(resolved, name).toBe(document);
      expect(JSON.stringify(resolved), name).toBe(before);
      expect(document, name).not.toHaveProperty("physicsMaterials");
      expect(colliders(document).every((collider) => collider.physicsMaterial === undefined && collider.frictionCombine === undefined), name).toBe(true);
    }
  });

  it("writes material values into referencing colliders in scenes and prefabs only", () => {
    const game = drop({ physicsMaterial: "rubber" }, {}, {
      rubber: { friction: 1.2, restitution: 0.8, frictionCombine: "max", restitutionCombine: "max" }
    });
    game.prefabs.pebble = { rootId: "pebble", externalAssets: [], externalScenes: [], entities: [
      gameEntity3D.parse({ id: "pebble", transform3d: {}, body3d: { type: "dynamic" }, collider3d: { kind: "sphere", radius: 0.1, physicsMaterial: "rubber" } })
    ] };
    const resolved = resolvePhysicsMaterials3D(game);
    expect(resolved).not.toBe(game);
    const expected = { physicsMaterial: "rubber", friction: 1.2, restitution: 0.8, frictionCombine: "max", restitutionCombine: "max" };
    expect(resolved.scenes[0].entities.find((entity) => entity.id === "ball")?.collider3d).toMatchObject(expected);
    expect(resolved.prefabs.pebble.entities[0].collider3d).toMatchObject(expected);
    expect(resolved.scenes[0].entities.find((entity) => entity.id === "floor")?.collider3d).toMatchObject({ friction: 0.5, restitution: 0 });
    expect(game.scenes[0].entities.find((entity) => entity.id === "ball")?.collider3d).toMatchObject({ friction: 0.5, restitution: 0 });
  });

  it("fills unset material fields with the inline defaults", () => {
    const game = gameDocument3D.parse({ ...drop({}, {}), physicsMaterials: { plain: {} } });
    expect(game.physicsMaterials?.plain).toEqual({ friction: 0.5, restitution: 0, frictionCombine: "average", restitutionCombine: "average" });
  });

  it("combines restitution with the rule the material names", async () => {
    const material = (restitutionCombine: GameCombineRule3D) => ({ bouncy: { friction: 0.5, restitution: 0.9, frictionCombine: "average" as const, restitutionCombine } });
    const max = await bounceHeight(drop({ physicsMaterial: "bouncy" }, {}, material("max")));
    const average = await bounceHeight(drop({ physicsMaterial: "bouncy" }, {}, material("average")));
    const min = await bounceHeight(drop({ physicsMaterial: "bouncy" }, {}, material("min")));
    expect(max).toBeGreaterThan(1.5);
    expect(average).toBeGreaterThan(0.5);
    expect(average).toBeLessThan(max - 0.5);
    expect(min).toBeLessThan(0.3);
  });

  it("lets the higher combine rule of the two colliders win, inline or by material", async () => {
    const inlineBall = { restitution: 0.9, restitutionCombine: "average" as const };
    const averageFloor = await bounceHeight(drop(inlineBall, {}));
    const maxFloor = await bounceHeight(drop(inlineBall, { restitutionCombine: "max" }));
    const materialFloor = await bounceHeight(drop(inlineBall, { physicsMaterial: "stone" }, {
      stone: { friction: 0.5, restitution: 0, frictionCombine: "average", restitutionCombine: "max" }
    }));
    expect(maxFloor).toBeGreaterThan(averageFloor + 0.5);
    expect(materialFloor).toBeCloseTo(maxFloor, 6);
  });

  it("simulates identically from the same document and seed", async () => {
    const game = drop({ physicsMaterial: "bouncy" }, {}, { bouncy: { friction: 0.2, restitution: 0.7, frictionCombine: "min", restitutionCombine: "max" } });
    expect(await bounceHeight(game)).toBe(await bounceHeight(game));
  });

  it("reports unknown materials and inline values a material would discard", () => {
    const game = drop({ physicsMaterial: "missing" }, { physicsMaterial: "stone", friction: 1, restitutionCombine: "max" }, {
      stone: { friction: 0.5, restitution: 0, frictionCombine: "average", restitutionCombine: "average" }
    });
    const floor = game.scenes[0].entities.findIndex((entity) => entity.id === "floor");
    const ball = game.scenes[0].entities.findIndex((entity) => entity.id === "ball");
    expect(physicsMaterialIssues3D(game).map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "physics_material_conflict", path: ["scenes", 0, "entities", floor, "collider3d", "friction"] },
      { code: "physics_material_conflict", path: ["scenes", 0, "entities", floor, "collider3d", "restitutionCombine"] },
      { code: "unknown_physics_material", path: ["scenes", 0, "entities", ball, "collider3d", "physicsMaterial"] }
    ]);
    expect(validateGame3D(game).valid).toBe(false);
    expect(validateGame3D(drop({ physicsMaterial: "stone" }, { frictionCombine: "min" }, {
      stone: { friction: 1, restitution: 0.2, frictionCombine: "max", restitutionCombine: "average" }
    })).valid).toBe(true);
  });

  it("never resolves a material name to an inherited object property", () => {
    const game = drop({ physicsMaterial: "toString" }, {}, { ice: { friction: 0, restitution: 0, frictionCombine: "min", restitutionCombine: "average" } });
    expect(physicsMaterialIssues3D(game).map(({ code }) => code)).toEqual(["unknown_physics_material"]);
    expect(validateGame3D(game).valid).toBe(false);
    const ball = colliders(resolvePhysicsMaterials3D(game)).find((collider) => collider.kind === "sphere");
    expect(ball).toMatchObject({ friction: 0.5, restitution: 0 });
  });

  it("sets and clears materials through set_game and collider references through update_entity", () => {
    const game = drop({}, {});
    const set = applyGameOps3D(game, [
      { op: "set_game", physics_materials: { ice: { friction: 0.02, frictionCombine: "min" } } },
      { op: "update_entity", scene_id: "scene", entity_id: "ball", set: { collider3d: { physicsMaterial: "ice" } } }
    ]);
    expect(set.physicsMaterials).toEqual({ ice: { friction: 0.02, restitution: 0, frictionCombine: "min", restitutionCombine: "average" } });
    expect(set.scenes[0].entities.find((entity) => entity.id === "ball")?.collider3d).toMatchObject({ kind: "sphere", physicsMaterial: "ice" });
    expect(() => applyGameOps3D(set, [{ op: "set_game", physics_materials: null }])).toThrow(/Physics material ice is not declared/);
    const cleared = applyGameOps3D(set, [
      { op: "update_entity", scene_id: "scene", entity_id: "ball", set: { collider3d: { physicsMaterial: null, frictionCombine: "max" } } },
      { op: "set_game", physics_materials: null }
    ]);
    expect(cleared).not.toHaveProperty("physicsMaterials");
    const ball = cleared.scenes[0].entities.find((entity) => entity.id === "ball")?.collider3d;
    expect(ball).not.toHaveProperty("physicsMaterial");
    expect(ball).toMatchObject({ frictionCombine: "max" });
    const inline = applyGameOps3D(cleared, [{ op: "update_entity", scene_id: "scene", entity_id: "ball", set: { collider3d: { frictionCombine: null } } }]);
    expect(inline.scenes[0].entities.find((entity) => entity.id === "ball")?.collider3d).not.toHaveProperty("frictionCombine");
  });
});
