import { describe, expect, it } from "vitest";
import { gameDocument, gameDocument3D, gameInputFrame3D, gameScriptCommand3D, gameSnapshot3D, gameTransform3D, parseGameDocument } from "../src/index.js";

const base = {
  schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "three", revision: "draft", entrySceneId: "scene",
  tickRate: 60, presentation: { aspectRatio: 16 / 9, hudWidth: 1280, hudHeight: 720 },
  inputActions: ["jump"], assets: {}, scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
    { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } }
  ] }]
};

describe("3D game protocol", () => {
  it("dispatches the new document while preserving exact legacy formats", () => {
    const parsed = parseGameDocument(base);
    expect(parsed).toMatchObject({ ok: true, document: { schemaVersion: 3, dimension: "3d" } });
    const legacy = { schemaVersion: 1, engineVersion: "1", id: "old", revision: "draft", entrySceneId: "scene", tickRate: 60,
      pixelsPerUnit: 32, inputActions: [], assets: {}, scenes: [{ id: "scene", name: "Scene", entities: [] }] };
    const old = parseGameDocument(legacy);
    expect(old).toEqual({ ok: true, document: gameDocument.parse(legacy) });
    expect(gameDocument.safeParse(base).success).toBe(false);
    expect(gameDocument3D.safeParse(legacy).success).toBe(false);
  });

  it("reports unsupported versions before partial parsing", () => {
    expect(parseGameDocument({ schemaVersion: 4, engineVersion: "3" })).toMatchObject({ ok: false,
      diagnostics: [{ code: "unsupported_schema_version", path: ["schemaVersion"] }] });
    expect(parseGameDocument({ ...base, engineVersion: "1" })).toMatchObject({ ok: false,
      diagnostics: [{ code: "unsupported_engine_version", path: ["engineVersion"] }] });
    expect(parseGameDocument({ ...base, dimension: "2d" })).toMatchObject({ ok: false,
      diagnostics: [{ code: "invalid_schema", path: ["dimension"] }] });
  });

  it("rejects unnormalized transforms, planar behaviors and excess physics layers", () => {
    expect(gameTransform3D.safeParse({ rotation: [0, 0, 0, 2] }).success).toBe(false);
    expect(gameTransform3D.safeParse({ scale: { x: 0, y: 1, z: 1 } }).success).toBe(false);
    const game = gameDocument3D.parse(base);
    expect(gameDocument3D.safeParse({ ...game, collisionLayers: Array.from({ length: 17 }, (_, n) => `${n}`) }).success).toBe(false);
    const camera = game.scenes[0].entities[0];
    expect(gameDocument3D.safeParse({ ...game, scenes: [{ ...game.scenes[0], entities: [{ ...camera,
      behaviors: [{ kind: "movement", speed: 1, left: "left", right: "right", up: "up", down: "down" }] }] }] }).success).toBe(false);
    expect(gameDocument3D.safeParse({ ...game, pixelsPerUnit: 32 }).success).toBe(false);
  });

  it("keeps 3D command payloads and recorded input dimension specific", () => {
    expect(gameScriptCommand3D.safeParse({ kind: "setVelocity", x: 1, y: 2 }).success).toBe(false);
    expect(gameScriptCommand3D.parse({ kind: "teleport", position: { x: 1, y: 2, z: 3 } })).toEqual({
      kind: "teleport", position: { x: 1, y: 2, z: 3 }, resetVelocity: true });
    expect(gameInputFrame3D.safeParse({ pressed: [], axes: { moveX: 2 } }).success).toBe(false);
    expect(gameInputFrame3D.parse({ pressed: [] })).toEqual({ pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } });
  });

  it("preserves Rapier handle bit patterns at JSON boundaries", () => {
    const handles = gameSnapshot3D.shape.physics.parse({ encoding: "base64", bytes: "", bodies: { player: 5e-324 }, colliders: { player: 5e-324 } });
    expect(handles.bodies.player).toBe(5e-324);
    expect(gameSnapshot3D.shape.physics.safeParse({ ...handles, bodies: { player: -1 } }).success).toBe(false);
  });
});
