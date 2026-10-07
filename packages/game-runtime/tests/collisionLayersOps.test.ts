import { gameDocument } from "@nodetool-ai/protocol";
import { describe, expect, it } from "vitest";
import { anyGameDocumentOp, applyAnyGameOps } from "../src/document-ops3d.js";
import { GameOpError } from "../src/document-ops.js";
import { createNative3DGame } from "../src/sample3d.js";
import { createTopDownRoomGame } from "../src/sample.js";

// The operations travel through the same public JSON union used by saveDraft.
describe.each([{ name: "2D", create: createTopDownRoomGame }, { name: "3D", create: createNative3DGame }])("$name collision-layer operations", ({ name, create }) => {
  function fixture(id: string) {
    const document = create(id);
    return document.schemaVersion === 3 ? document : gameDocument.parse({ ...document, schemaVersion: 2 });
  }
  it("removes optional layers and preserves omission through JSON inverse and redo", () => {
    const before = fixture(`collision-op-${name}`);
    before.collisionLayers = ["default", "unused"];
    const after = structuredClone(before);
    delete after.collisionLayers;
    const apply = (document: typeof before, op: unknown) => applyAnyGameOps(document, [anyGameDocumentOp.parse(JSON.parse(JSON.stringify(op)))]);
    expect(apply(before, { op: "set_game", collision_layers: null })).toEqual(after);
    expect(apply(after, { op: "set_game", collision_layers: before.collisionLayers })).toEqual(before);
    expect(apply(before, { op: "set_game", collision_layers: null })).toEqual(after);
    expect(apply(before, { op: "set_game" })).toEqual(before);
    expect(apply(after, { op: "set_game", collision_layers: null })).toEqual(after);
  });
  it("rejects an invalid later game patch without committing an earlier scene rename", () => {
    const before = fixture(`collision-invalid-${name}`);
    const snapshot = structuredClone(before);
    expect(() => applyAnyGameOps(before, [
      { op: "update_scene", scene_id: before.entrySceneId, set: { name: "Earlier Edit" } },
      { op: "set_game", collision_layers: ["unused"], entry_scene_id: "missing-scene" }
    ])).toThrow(GameOpError);
    expect(before).toEqual(snapshot);
  });
});
