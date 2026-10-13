import { describe, expect, it } from "vitest";
import { gameDocument3D, gameMaterial3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { anyGameDocumentOp, applyAnyGameOps, applyGameOps3D } from "../src/document-ops3d.js";
import { validateGame3D } from "../src/validate3d.js";
import { blockout } from "./fixtures-game3d.js";
import { createGameSession3D, replayGame3D } from "../src/session3d.js";

function applyJsonMaterialOps(document: GameDocument3D, operations: readonly unknown[]): GameDocument3D {
  const decoded: unknown = JSON.parse(JSON.stringify(operations));
  if (!Array.isArray(decoded)) { throw new Error("Expected JSON operation array"); }
  return applyAnyGameOps(document, decoded.map((value: unknown) => anyGameDocumentOp.parse(value)));
}

function texturedMaterialDocument(): GameDocument3D {
  const document = blockout();
  const texture = { assetId: "surface", tiling: { x: 2, y: 3 }, offset: { x: 0.25, y: 0.5 } };
  const material = { color: "#00ff00", opacity: 0.2, shading: "toon", toonSteps: 3,
    outline: { color: "#000000", width: 0.05 }, baseColorTexture: texture, normalTexture: texture,
    ormTexture: texture, emissiveTexture: texture };
  return gameDocument3D.parse({ ...document, materials: { paint: { color: "#ff0000" } },
    assets: { surface: { mediaKind: "image", assetId: "image", digest: "image-digest", format: "png", width: 2, height: 2, byteLength: 64, preparationVersion: "1" },
      rig: { mediaKind: "model", assetId: "rig", digest: "model-digest", bounds: { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
        nodeIds: [], clipIds: [], geometryBytes: 0, textureBytes: 0, triangles: 0 } },
    scenes: [{ ...document.scenes[0], entities: [...document.scenes[0].entities,
      { id: "box", transform3d: {}, primitive: { kind: "box", dimensions: { x: 1, y: 1, z: 1 }, materialId: "paint", material } },
      { id: "model", transform3d: {}, model: { assetId: "rig", materialId: "paint", material } }
    ] }] });
}

describe("named 3D material authoring", () => {
  it("projects isolated presentation materials and exactly replays 120 ticks from tick 60", async () => {
    const before = blockout();
    const document = applyGameOps3D(before, [{ op: "set_material", material_id: "paint", material: { color: "#ff0000", shading: "toon" } }]);
    const session = await createGameSession3D(document, 1);
    const baseline = await createGameSession3D(before, 1);
    const input = { pressed: [], justPressed: [], axes: { moveX: 0.25 }, look: { x: 0, y: 0 } };
    try {
      for (let tick = 0; tick < 60; tick++) { session.step(input); baseline.step(input); }
      const checkpoint = session.snapshot();
      const expected = Array.from({ length: 60 }, () => { baseline.step(input); return session.step(input); });
      const replay = await replayGame3D(document, 1, Array.from({ length: 60 }, () => input), checkpoint);
      expect(replay.steps).toEqual(expected);
      expect(replay.snapshot).toEqual(session.snapshot());
      const { contentDigest: _materialDigest, ...materialState } = session.snapshot();
      const { contentDigest: _baselineDigest, ...baselineState } = baseline.snapshot();
      expect(materialState).toEqual(baselineState);
      const frame = session.frame();
      expect(frame.materials).toEqual(document.materials);
      if (!frame.materials) { throw new Error("Expected projected materials"); }
      frame.materials.paint.color = "#000000";
      expect(session.frame().materials?.paint.color).toBe("#ff0000");
      expect(baseline.frame()).not.toHaveProperty("materials");
    } finally { session.dispose(); baseline.dispose(); }
  });

  it("authors and removes named materials through JSON operations atomically", () => {
    const before = blockout();
    const operations = JSON.parse(JSON.stringify([
      { op: "set_material", material_id: "paint", material: { color: "#ff0000", shading: "toon" } },
      { op: "add_entity", scene_id: "scene", entity: { id: "box", transform3d: {},
        primitive: { kind: "box", dimensions: { x: 1, y: 1, z: 1 }, materialId: "paint" } } }
    ])).map((value: unknown) => anyGameDocumentOp.parse(value));
    const authored = applyAnyGameOps(before, operations);
    if (authored.dimension !== "3d") { throw new Error("Expected 3D document"); }
    expect(authored.materials?.paint.color).toBe("#ff0000");
    expect(() => applyGameOps3D(authored, [{ op: "remove_material", material_id: "paint" }])).toThrow(/paint/);
    const removed = applyGameOps3D(authored, [
      { op: "remove_entity", entity_id: "box", scene_id: "scene" },
      { op: "remove_material", material_id: "paint" }
    ]);
    expect(removed).toEqual(before);
    expect(before.materials).toBeUndefined();
    expect(authored.materials?.paint).toEqual(gameMaterial3D.parse({ color: "#ff0000", shading: "toon" }));
  });

  it("reports missing references in scenes and prefabs", () => {
    const document = blockout();
    const entity = { id: "box", transform3d: {}, primitive: { kind: "box", dimensions: { x: 1, y: 1, z: 1 }, materialId: "missing" } };
    const candidate = gameDocument3D.parse({ ...document,
      scenes: [{ ...document.scenes[0], entities: [...document.scenes[0].entities, entity] }],
      prefabs: { box: { rootId: "box", entities: [entity] } }
    });
    const diagnostics = validateGame3D(candidate).diagnostics.filter((issue) => issue.code === "missing_material");
    expect(diagnostics.map((issue) => issue.path)).toEqual([
      ["scenes", 0, "entities", 2, "primitive", "materialId"],
      ["prefabs", "box", "entities", 0, "primitive", "materialId"]
    ]);
  });

  it("bounds the named table and validates texture asset references even when unused", () => {
    const document = blockout();
    expect(gameDocument3D.safeParse({ ...document, materials: Object.fromEntries(
      Array.from({ length: 257 }, (_, index) => [String(index), {}])) }).success).toBe(false);
    const candidate = gameDocument3D.parse({ ...document, materials: { paint: { baseColorTexture: { assetId: "missing" } } } });
    expect(validateGame3D(candidate).diagnostics).toContainEqual(expect.objectContaining({
      code: "missing_material_texture", path: ["materials", "paint", "baseColorTexture", "assetId"]
    }));
  });

  it("requires owned named entries even for prototype property names", () => {
    const document = blockout();
    document.materials = {};
    expect(() => applyGameOps3D(document, [{ op: "remove_material", material_id: "constructor" }])).toThrow(/does not exist/);
    const candidate = gameDocument3D.parse({ ...document, scenes: [{ ...document.scenes[0], entities: [
      ...document.scenes[0].entities,
      { id: "box", transform3d: {}, primitive: { kind: "box", dimensions: { x: 1, y: 1, z: 1 }, materialId: "constructor" } }
    ] }] });
    expect(validateGame3D(candidate).diagnostics).toContainEqual(expect.objectContaining({ code: "missing_material" }));
  });

  it("projects copied image bindings for the closed capture resolver", async () => {
    const document = blockout();
    document.assets.paint = { mediaKind: "image", assetId: "paint-bytes", digest: "prepared-digest", required: true,
      format: "png", width: 2, height: 2, byteLength: 64, preparationVersion: "1" };
    const session = await createGameSession3D(document, 1);
    try {
      const frame = session.frame();
      expect(frame.images?.paint).toEqual(document.assets.paint);
      if (!frame.images) { throw new Error("Expected image bindings"); }
      frame.images.paint.digest = "changed";
      expect(session.frame().images?.paint.digest).toBe("prepared-digest");
    } finally { session.dispose(); }
  });
  it("clears primitive and model material references through JSON patches without losing inline settings", () => {
    const before = texturedMaterialDocument();
    const after = applyJsonMaterialOps(before, [
      { op: "update_entity", entity_id: "box", set: { primitive: { materialId: null } } },
      { op: "update_entity", entity_id: "model", set: { model: { materialId: null } } }
    ]);
    for (const id of ["box", "model"]) {
      const original = before.scenes[0].entities.find((entity) => entity.id === id);
      const restored = after.scenes[0].entities.find((entity) => entity.id === id);
      const source = original?.primitive ?? original?.model;
      const visual = restored?.primitive ?? restored?.model;
      expect(visual).not.toHaveProperty("materialId");
      expect(visual?.material).toEqual(source?.material);
    }
  });

  it.each(["primitive", "model"] as const)("clears new inline %s material options and patches UV components through JSON", (component) => {
    const before = texturedMaterialDocument();
    const entityId = component === "primitive" ? "box" : "model";
    const updated = applyJsonMaterialOps(before, [{ op: "update_entity", entity_id: entityId,
      set: { [component]: { materialId: null, material: { baseColorTexture: { tiling: { x: 4 }, offset: { y: -0.5 } } } } } }]);
    const material = updated.scenes[0].entities.find((entity) => entity.id === entityId)?.[component]?.material;
    expect(material?.baseColorTexture).toEqual({ assetId: "surface", tiling: { x: 4, y: 3 }, offset: { x: 0.25, y: -0.5 } });
    const uvCleared = applyJsonMaterialOps(updated, [{ op: "update_entity", entity_id: entityId,
      set: { [component]: { material: { baseColorTexture: { tiling: null, offset: null } } } } }]);
    expect(uvCleared.scenes[0].entities.find((entity) => entity.id === entityId)?.[component]?.material?.baseColorTexture)
      .toEqual({ assetId: "surface" });
    const cleared = applyJsonMaterialOps(uvCleared, [{ op: "update_entity", entity_id: entityId,
      set: { [component]: { material: { baseColorTexture: null, normalTexture: null, ormTexture: null,
        emissiveTexture: null, shading: null, toonSteps: null, outline: null } } } }]);
    const result = cleared.scenes[0].entities.find((entity) => entity.id === entityId)?.[component]?.material;
    expect(result?.color).toBe("#00ff00");
    expect(result?.opacity).toBe(0.2);
    for (const field of ["baseColorTexture", "normalTexture", "ormTexture", "emissiveTexture", "shading", "toonSteps", "outline"]) {
      expect(result).not.toHaveProperty(field);
    }
    expect(before.scenes[0].entities.find((entity) => entity.id === entityId)?.[component]?.material?.baseColorTexture?.tiling)
      .toEqual({ x: 2, y: 3 });
  });

  it("retains full merged validation and rejects invalid partial material patches atomically", () => {
    const before = texturedMaterialDocument();
    const original = structuredClone(before);
    for (const material of [{ color: null }, { baseColorTexture: { assetId: null } },
      { baseColorTexture: { tiling: { x: 0 } } }, { baseColorTexture: { offset: { y: Infinity } } },
      { toonSteps: 9 }, { outline: { width: 0.11 } }, { baseColorTexture: { assetId: "missing" } }]) {
      expect(() => applyJsonMaterialOps(before, [{ op: "update_entity", entity_id: "box",
        set: { primitive: { materialId: null, material } } }])).toThrow();
      expect(before).toEqual(original);
    }
    const noUv = applyJsonMaterialOps(before, [{ op: "update_entity", entity_id: "box",
      set: { primitive: { material: { baseColorTexture: { tiling: null } } } } }]);
    expect(() => applyJsonMaterialOps(noUv, [{ op: "update_entity", entity_id: "box",
      set: { primitive: { material: { baseColorTexture: { tiling: { x: 2 } } } } } }])).toThrow();
  });

});
