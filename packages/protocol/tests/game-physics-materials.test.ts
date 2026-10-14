import { describe, expect, it } from "vitest";
import { GAME_MAX_PHYSICS_MATERIALS_3D, gameCollider3D, gameDocument3D, gamePhysicsMaterial3D, gamePhysicsMaterials3D } from "../src/index.js";

const base = {
  schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "three", revision: "draft", entrySceneId: "scene",
  tickRate: 60, presentation: { aspectRatio: 16 / 9, hudWidth: 1280, hudHeight: 720 },
  inputActions: [], assets: {}, scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
    { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } }
  ] }]
};

describe("3D physics material schema", () => {
  it("keeps existing documents and colliders unchanged", () => {
    expect(gameDocument3D.parse(base)).not.toHaveProperty("physicsMaterials");
    const collider = gameCollider3D.parse({ kind: "sphere", radius: 1 });
    expect(collider).toMatchObject({ friction: 0.5, restitution: 0 });
    for (const key of ["physicsMaterial", "frictionCombine", "restitutionCombine"]) { expect(collider).not.toHaveProperty(key); }
  });

  it("accepts named materials on the document and a material name or inline combine rules on colliders", () => {
    const game = gameDocument3D.parse({ ...base, physicsMaterials: { ice: { friction: 0.02, frictionCombine: "min" } } });
    expect(game.physicsMaterials).toEqual({ ice: { friction: 0.02, restitution: 0, frictionCombine: "min", restitutionCombine: "average" } });
    expect(gameCollider3D.parse({ kind: "sphere", radius: 1, physicsMaterial: "ice" })).toMatchObject({ physicsMaterial: "ice" });
    expect(gameCollider3D.parse({ kind: "box", halfExtents: { x: 1, y: 1, z: 1 }, restitutionCombine: "max" })).toMatchObject({ restitutionCombine: "max" });
  });

  it("bounds material values, rule names and the material count", () => {
    expect(gamePhysicsMaterial3D.safeParse({ friction: 5 }).success).toBe(false);
    expect(gamePhysicsMaterial3D.safeParse({ restitution: 1.5 }).success).toBe(false);
    expect(gamePhysicsMaterial3D.safeParse({ frictionCombine: "sum" }).success).toBe(false);
    expect(gamePhysicsMaterial3D.safeParse({ bounce: 1 }).success).toBe(false);
    const many = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, index) => [`m${index}`, {}]));
    expect(gamePhysicsMaterials3D.safeParse(many(GAME_MAX_PHYSICS_MATERIALS_3D)).success).toBe(true);
    expect(gamePhysicsMaterials3D.safeParse(many(GAME_MAX_PHYSICS_MATERIALS_3D + 1)).success).toBe(false);
    expect(gameCollider3D.safeParse({ kind: "sphere", radius: 1, physicsMaterial: "" }).success).toBe(false);
  });
});
