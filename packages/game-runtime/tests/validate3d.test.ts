import { describe, expect, it } from "vitest";
import { gameEntity3D } from "@nodetool-ai/protocol";
import { validateAnyGame, validateGame3D } from "../src/validate3d.js";
import { createTopDownRoomGame } from "../src/sample.js";

import { blockout } from "./fixtures-game3d.js";

function codes(value: unknown): string[] { return validateGame3D(value).diagnostics.map((diagnostic) => diagnostic.code); }

describe("3D game validation", () => {
  it("accepts a placeholder scene and both dimension dispatch paths", () => {
    expect(validateGame3D(blockout()).valid).toBe(true);
    expect(validateAnyGame(blockout()).valid).toBe(true);
    expect(validateAnyGame(createTopDownRoomGame("old")).valid).toBe(true);
  });
  it("rejects hierarchy cycles, scaled physics and competing pose owners", () => {
    const game = blockout();
    game.scenes[0].entities[1].parentId = "camera";
    game.scenes[0].entities[0].parentId = "player";
    game.scenes[0].entities[1].transform3d.scale.x = 2;
    game.scenes[0].entities[0].body3d = { type: "static", velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 }, gravityScale: 1, linearDamping: 0, angularDamping: 0, ccd: false };
    expect(codes(game)).toEqual(expect.arrayContaining(["hierarchy_cycle", "physics_parent", "physics_scale", "competing_pose_owner"]));
  });
  it("rejects invalid cameras, characters and movable triangle meshes", () => {
    const game = blockout();
    game.scenes[0].activeCameraId = "player";
    const camera = game.scenes[0].entities[0].camera3d;
    if (camera) { camera.projection.near = 1000; }
    game.scenes[0].entities[1].collider3d = gameEntity3D.parse({ id: "mesh", transform3d: {}, collider3d: { kind: "triangleMesh", assetId: "missing" } }).collider3d;
    expect(codes(game)).toEqual(expect.arrayContaining(["invalid_active_camera", "invalid_camera_planes", "invalid_character", "invalid_mesh_body", "missing_asset"]));
  });
  it("validates rooted prefab subtrees and explicit external references", () => {
    const game = blockout();
    game.prefabs.crate = { rootId: "root", externalAssets: [], externalScenes: [], entities: [
      gameEntity3D.parse({ id: "root", transform3d: {}, body3d: { type: "dynamic" }, collider3d: { kind: "box", halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } }),
      gameEntity3D.parse({ id: "visual", parentId: "root", transform3d: {}, primitive: { kind: "box", dimensions: { x: 1, y: 1, z: 1 } } })
    ] };
    expect(validateGame3D(game).valid).toBe(true);
    game.prefabs.crate.entities[1].body3d = game.prefabs.crate.entities[0].body3d;
    expect(codes(game)).toContain("physics_parent");
    delete game.prefabs.crate.entities[1].parentId;
    expect(codes(game)).toContain("invalid_prefab_root");
  });
  it("permits scene template spawns and rejects active scene entity references", () => {
    const game = blockout();
    game.scenes[0].entities.push(gameEntity3D.parse({ id: "template", transform3d: {}, templateOnly: true }));
    game.scenes[0].entities[1].behaviors.push({ kind: "spawn", prefabId: "template", onEvent: "spawn" });
    expect(validateGame3D(game).valid).toBe(true);
    game.scenes[0].entities[2].templateOnly = false;
    expect(codes(game)).toContain("missing_prefab");
  });
  it("checks large hierarchy inputs without recursive call-stack limits", () => {
    const game = blockout();
    for (let index = 0; index < 3000; index++) {
      game.scenes[0].entities.push(gameEntity3D.parse({ id: `child${index}`, parentId: index ? `child${index - 1}` : "player", transform3d: {} }));
    }
    expect(validateGame3D(game).valid).toBe(true);
  });
  it("requires an hdri binding for an HDRI sky and a directional light for the procedural sun", () => {
    const game = blockout();
    game.scenes[0].entities.push(gameEntity3D.parse({ id: "sun", transform3d: {}, light3d: { kind: "directional", color: "#ffffff", intensity: 2 } }),
      gameEntity3D.parse({ id: "lamp", transform3d: {}, light3d: { kind: "point", color: "#ffffff", intensity: 2, range: 5 } }));
    game.scenes[0].environment.sky = { kind: "hdri", assetId: "sky", rotation: 0, intensity: 1 };
    expect(codes(game)).toEqual(["missing_asset"]);
    game.assets.sky = { mediaKind: "audio", assetId: "0123456789abcdef0123456789abcdef", digest: "audio", required: true };
    expect(codes(game)).toEqual(["missing_asset"]);
    game.assets.sky = { mediaKind: "hdri", assetId: "0123456789abcdef0123456789abcdef", digest: "0".repeat(64), required: true,
      format: "hdr", width: 64, height: 32, byteLength: 1024, preparationVersion: "1" };
    expect(validateGame3D(game).valid).toBe(true);
    game.scenes[0].environment.sky = { kind: "procedural", sunEntityId: "sun", turbidity: 10, rayleigh: 2, groundColor: "#333333", intensity: 1 };
    expect(validateGame3D(game).valid).toBe(true);
    for (const sunEntityId of ["lamp", "missing", "player"]) {
      game.scenes[0].environment.sky.sunEntityId = sunEntityId;
      expect(validateGame3D(game).diagnostics).toEqual([expect.objectContaining({ code: "invalid_sky_sun", path: ["scenes", 0, "environment", "sky", "sunEntityId"] })]);
    }
    delete game.scenes[0].environment.sky.sunEntityId;
    expect(validateGame3D(game).valid).toBe(true);
  });
  it("limits shadowed point and spot lights to the scene budget", () => {
    const game = blockout();
    const lamp = (id: string, kind: "point" | "spot", castShadow: boolean, templateOnly = false) => gameEntity3D.parse({ id, templateOnly, transform3d: {},
      light3d: kind === "point" ? { kind, color: "#ffffff", intensity: 1, range: 5, castShadow } : { kind, color: "#ffffff", intensity: 1, range: 5, angle: 0.5, castShadow } });
    game.scenes[0].entities.push(lamp("a", "point", true), lamp("b", "spot", true), lamp("c", "point", true), lamp("d", "spot", true),
      lamp("unshadowed", "point", false), lamp("template", "spot", true, true));
    expect(validateGame3D(game).valid).toBe(true);
    game.scenes[0].entities.push(lamp("e", "point", true));
    expect(validateGame3D(game).diagnostics).toEqual([expect.objectContaining({ code: "shadow_budget", path: ["scenes", 0, "entities"],
      message: "At most 4 point and spot lights may cast shadows" })]);
  });
});
