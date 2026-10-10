import { describe, expect, it } from "vitest";
import { GAME_MAX_COLLISION_PAIRS_3D, gameCollider3D, gameCollisionMatrix3D, gameDocument3D } from "../src/index.js";

const base = {
  schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "three", revision: "draft", entrySceneId: "scene",
  tickRate: 60, presentation: { aspectRatio: 16 / 9, hudWidth: 1280, hudHeight: 720 },
  inputActions: [], assets: {}, scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
    { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } }
  ] }]
};

describe("3D collision layer matrix schema", () => {
  it("keeps existing documents and colliders unchanged", () => {
    const game = gameDocument3D.parse(base);
    expect(game).not.toHaveProperty("collisionMatrix");
    const collider = gameCollider3D.parse({ kind: "sphere", radius: 1 });
    expect(collider).not.toHaveProperty("layer");
    expect(collider).toMatchObject({ category: 1, mask: 0xffff });
  });

  it("accepts a layer name on colliders and layer pairs on the document", () => {
    expect(gameCollider3D.parse({ kind: "sphere", radius: 1, layer: "player" })).toMatchObject({ layer: "player" });
    const game = gameDocument3D.parse({ ...base, collisionLayers: ["player", "enemy"], collisionMatrix: [["player", "enemy"], ["enemy", "enemy"]] });
    expect(game.collisionMatrix).toEqual([["player", "enemy"], ["enemy", "enemy"]]);
  });

  it("bounds the matrix to every unordered pair of sixteen layers", () => {
    expect(GAME_MAX_COLLISION_PAIRS_3D).toBe(136);
    const pairs = Array.from({ length: GAME_MAX_COLLISION_PAIRS_3D + 1 }, (_, index) => [`a${index}`, "b"]);
    expect(gameCollisionMatrix3D.safeParse(pairs).success).toBe(false);
    expect(gameCollisionMatrix3D.safeParse([["a"]]).success).toBe(false);
    expect(gameCollisionMatrix3D.safeParse([["a", ""]]).success).toBe(false);
  });
});
