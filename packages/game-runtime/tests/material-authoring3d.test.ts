import { describe, expect, it } from "vitest";
import { gameDocument3D, gameMaterial3D } from "@nodetool-ai/protocol";
import { anyGameDocumentOp, applyAnyGameOps, applyGameOps3D } from "../src/document-ops3d.js";
import { validateGame3D } from "../src/validate3d.js";
import { blockout } from "./fixtures-game3d.js";
import { createGameSession3D, replayGame3D } from "../src/session3d.js";

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
});
