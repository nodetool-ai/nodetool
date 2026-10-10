import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { gameDocument3D, gameEntity3D, gameInputFrame3D, type GameCollider3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { collisionLayerBits3D, resolveCollisionLayers3D } from "../src/spatial3d/layers.js";
import { applyGameOps3D } from "../src/document-ops3d.js";
import { createNative3DGame } from "../src/sample3d.js";
import { createGameSession3D } from "../src/session3d.js";
import { validateGame3D } from "../src/validate3d.js";
import { blockout } from "./fixtures-game3d.js";

const LAYERS = ["default", "player", "enemy", "pickup", "ghost"];

function layered(matrix: [string, string][] = []): GameDocument3D {
  const game = blockout();
  game.collisionLayers = [...LAYERS];
  game.collisionMatrix = matrix;
  return game;
}

function groups(collider: GameCollider3D): number {
  return ((collider.category << 16) | collider.mask) >>> 0;
}

function colliders(document: GameDocument3D): GameCollider3D[] {
  const entities = [...document.scenes.flatMap((scene) => scene.entities), ...Object.values(document.prefabs).flatMap((prefab) => prefab.entities)];
  return entities.flatMap((entity) => entity.collider3d ? [entity.collider3d] : []);
}

async function existingDocuments(): Promise<[string, GameDocument3D][]> {
  const files = ["samples/aether/game.json", "samples/relay-yard/game.json", "samples/blacksite/game.json", "bench/bench-3d-1000.json", "bench/bench-3d-64-scripted.json"];
  const loaded = await Promise.all(files.map(async (file): Promise<[string, GameDocument3D]> =>
    [file, gameDocument3D.parse(JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), "utf8")))]));
  const rawBits = blockout();
  rawBits.collisionLayers = ["world", "actor"];
  rawBits.scenes[0].entities.push(gameEntity3D.parse({ id: "filtered", transform3d: {}, body3d: { type: "static" },
    collider3d: { kind: "box", halfExtents: { x: 1, y: 1, z: 1 }, category: 4, mask: 3 } }));
  return [...loaded, ["sample3d", createNative3DGame("sample")], ["blockout", blockout()], ["raw bits", rawBits]];
}

describe("3D collision layer matrix", () => {
  it("leaves every existing document, and therefore every collider's bits, unchanged", async () => {
    const documents = await existingDocuments();
    const raw = documents.flatMap(([, document]) => colliders(document));
    expect(raw.length).toBeGreaterThan(20);
    expect(raw.some((collider) => collider.category !== 1 || collider.mask !== 0xffff)).toBe(true);
    for (const [name, document] of documents) {
      const before = JSON.stringify(document);
      const resolved = resolveCollisionLayers3D(document);
      expect(resolved, name).toBe(document);
      expect(JSON.stringify(resolved), name).toBe(before);
      expect(colliders(resolved).map(groups), name).toEqual(colliders(document).map(groups));
    }
  });

  it("gives each layer its own category bit and a full mask without matrix entries", () => {
    const game = layered();
    expect(LAYERS.map((layer) => collisionLayerBits3D(game, layer))).toEqual([
      { category: 1, mask: 0xffff }, { category: 2, mask: 0xffff }, { category: 4, mask: 0xffff },
      { category: 8, mask: 0xffff }, { category: 16, mask: 0xffff }
    ]);
  });

  it("derives symmetric masks from the layer pairs that do not collide", () => {
    const matrix: [string, string][] = [["player", "pickup"], ["enemy", "enemy"], ["ghost", "default"]];
    const game = layered(matrix);
    const ignored = new Set(matrix.flatMap(([a, b]) => [`${a}:${b}`, `${b}:${a}`]));
    for (const a of LAYERS) {
      for (const b of LAYERS) {
        const left = collisionLayerBits3D(game, a);
        const right = collisionLayerBits3D(game, b);
        const collide = (left.category & right.mask) !== 0 && (right.category & left.mask) !== 0;
        expect(collide, `${a} with ${b}`).toBe(!ignored.has(`${a}:${b}`));
      }
    }
    expect(collisionLayerBits3D(game, "player")).toEqual({ category: 2, mask: 0xffff & ~8 });
    expect(collisionLayerBits3D(game, "default")).toEqual({ category: 1, mask: 0xffff & ~16 });
  });

  it("keeps unnamed bits in derived masks so raw-bit colliders still meet layered ones", () => {
    const game = layered([["player", "enemy"]]);
    const raw = { category: 1 << 10, mask: 0xffff };
    const player = collisionLayerBits3D(game, "player");
    expect((player.mask & raw.category) !== 0 && (raw.mask & player.category) !== 0).toBe(true);
  });

  it("treats a collider without a layer as a member of collisionLayers[0]", () => {
    const game = layered([["default", "ghost"], ["player", "enemy"]]);
    const unlayered = { category: 1, mask: 0xffff };
    const meets = (bits: { category: number; mask: number }): boolean => (bits.category & unlayered.mask) !== 0 && (unlayered.category & bits.mask) !== 0;
    expect(unlayered).toEqual({ category: collisionLayerBits3D(game, "default").category, mask: 0xffff });
    expect(meets(collisionLayerBits3D(game, "ghost"))).toBe(false);
    expect(meets(collisionLayerBits3D(game, "player"))).toBe(true);
    expect(meets(collisionLayerBits3D(game, "enemy"))).toBe(true);
  });

  it("writes derived bits into layered colliders in scenes and prefabs only", () => {
    const game = layered([["player", "ghost"]]);
    game.scenes[0].entities[1].collider3d = { ...game.scenes[0].entities[1].collider3d!, layer: "player" };
    game.prefabs.wisp = { rootId: "wisp", externalAssets: [], externalScenes: [], entities: [
      gameEntity3D.parse({ id: "wisp", transform3d: {}, body3d: { type: "dynamic" }, collider3d: { kind: "sphere", radius: 0.3, layer: "ghost" } })
    ] };
    game.scenes[0].entities.push(gameEntity3D.parse({ id: "raw", transform3d: {}, body3d: { type: "static" },
      collider3d: { kind: "sphere", radius: 1, category: 32, mask: 7 } }));
    const resolved = resolveCollisionLayers3D(game);
    expect(resolved).not.toBe(game);
    expect(resolved.scenes[0].entities[1].collider3d).toMatchObject({ layer: "player", category: 2, mask: 0xffff & ~16 });
    expect(resolved.prefabs.wisp.entities[0].collider3d).toMatchObject({ layer: "ghost", category: 16, mask: 0xffff & ~2 });
    expect(resolved.scenes[0].entities[2].collider3d).toMatchObject({ category: 32, mask: 7 });
    expect(game.scenes[0].entities[1].collider3d).toMatchObject({ category: 1, mask: 0xffff });
  });

  it("lets a ghost layer fall through ground the matrix tells it to ignore", async () => {
    function drop(matrix: [string, string][]): GameDocument3D {
      const game = layered(matrix);
      game.scenes[0].entities.push(
        gameEntity3D.parse({ id: "ground", transform3d: { position: { x: 0, y: -0.5, z: 5 } }, body3d: { type: "static" },
          collider3d: { kind: "box", halfExtents: { x: 4, y: 0.5, z: 4 }, layer: "default" } }),
        gameEntity3D.parse({ id: "ball", transform3d: { position: { x: 0, y: 1, z: 5 } }, body3d: { type: "dynamic" },
          collider3d: { kind: "sphere", radius: 0.25, layer: "ghost" } })
      );
      return game;
    }
    const input = gameInputFrame3D.parse({ pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } });
    const height = async (game: GameDocument3D): Promise<number> => {
      const session = await createGameSession3D(game, 1);
      try {
        for (let tick = 0; tick < 90; tick += 1) { session.step(input); }
        return session.inspect({ entityId: "ball" }).entities[0].transform.position.y;
      } finally { session.dispose(); }
    };
    expect(await height(drop([]))).toBeGreaterThan(0.1);
    expect(await height(drop([["default", "ghost"]]))).toBeLessThan(-1);
    const unlayeredGround = drop([["default", "ghost"]]);
    const { layer: _groundLayer, ...groundCollider } = unlayeredGround.scenes[0].entities.find((entity) => entity.id === "ground")!.collider3d!;
    unlayeredGround.scenes[0].entities.find((entity) => entity.id === "ground")!.collider3d = groundCollider;
    expect(await height(unlayeredGround)).toBeLessThan(-1);
    const raw = drop([]);
    const ball = raw.scenes[0].entities.find((entity) => entity.id === "ball")!;
    const { layer: _layer, ...unlayered } = ball.collider3d!;
    ball.collider3d = { ...unlayered, category: 2, mask: 0xfffe };
    expect(await height(raw)).toBeLessThan(-1);
  });

  it("reports unknown layers, duplicate pairs and raw bits that a layer would discard", () => {
    const game = layered([["player", "enemy"], ["enemy", "player"], ["player", "missing"]]);
    game.scenes[0].entities[1].collider3d = { ...game.scenes[0].entities[1].collider3d!, layer: "nobody" };
    game.prefabs.wisp = { rootId: "wisp", externalAssets: [], externalScenes: [], entities: [
      gameEntity3D.parse({ id: "wisp", transform3d: {}, body3d: { type: "dynamic" }, collider3d: { kind: "sphere", radius: 0.3, layer: "ghost", mask: 3 } })
    ] };
    const diagnostics = validateGame3D(game).diagnostics.map(({ code, path }) => ({ code, path }));
    expect(diagnostics).toEqual(expect.arrayContaining([
      { code: "unknown_collision_layer", path: ["scenes", 0, "entities", 1, "collider3d", "layer"] },
      { code: "duplicate_collision_pair", path: ["collisionMatrix", 1] },
      { code: "unknown_collision_layer", path: ["collisionMatrix", 2, 1] },
      { code: "collision_layer_bits_conflict", path: ["prefabs", "wisp", "entities", 0, "collider3d", "mask"] }
    ]));
    expect(validateGame3D(layered([["player", "enemy"], ["ghost", "ghost"]])).valid).toBe(true);
  });

  it("sets and clears the matrix through set_game", () => {
    const game = layered();
    delete game.collisionMatrix;
    const set = applyGameOps3D(game, [{ op: "set_game", collision_matrix: [["player", "pickup"]] }]);
    expect(set.collisionMatrix).toEqual([["player", "pickup"]]);
    const cleared = applyGameOps3D(set, [{ op: "set_game", collision_matrix: null }]);
    expect(cleared).not.toHaveProperty("collisionMatrix");
  });

  it("picks and clears a collider's layer through update_entity", () => {
    const game = layered();
    const picked = applyGameOps3D(game, [{ op: "update_entity", scene_id: "scene", entity_id: "player", set: { collider3d: { layer: "player" } } }]);
    expect(picked.scenes[0].entities[1].collider3d).toMatchObject({ kind: "capsule", radius: 0.4, layer: "player" });
    const cleared = applyGameOps3D(picked, [{ op: "update_entity", scene_id: "scene", entity_id: "player", set: { collider3d: { layer: null } } }]);
    expect(cleared.scenes[0].entities[1].collider3d).not.toHaveProperty("layer");
  });
});
