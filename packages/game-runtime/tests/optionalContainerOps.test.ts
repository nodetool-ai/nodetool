import { gameBackgroundLayer, gameDocument } from "@nodetool-ai/protocol";
import { expect, it } from "vitest";
import { anyGameDocumentOp, applyAnyGameOps } from "../src/document-ops3d.js";
import { GameOpError } from "../src/document-ops.js";
import { createTopDownRoomGame } from "../src/sample.js";

it.each(["backgrounds", "effects"])("removes %s presence through public JSON and restores arrays", (kind) => {
  const before = gameDocument.parse({ ...createTopDownRoomGame(`optional-container-${kind}`), schemaVersion: 2 });
  const player = before.scenes[0].entities.find((entity) => entity.id === "player");
  if (!player?.sprite) { throw new Error("Fixture sprite missing"); }
  before.scenes[0].backgrounds = [gameBackgroundLayer.parse({ id: "background", assetId: player.sprite.assetId, width: 16, height: 9 })];
  before.renderEffects = [{ kind: "brightnessContrast", brightness: 0.1, contrast: 1, required: false }];
  const apply = (document: typeof before, op: unknown) => applyAnyGameOps(document, [anyGameDocumentOp.parse(JSON.parse(JSON.stringify(op)))]);
  const remove = kind === "backgrounds" ? { op: "update_scene", scene_id: before.entrySceneId, set: { backgrounds: null } }
    : { op: "set_effects", effects: null };
  const expected = structuredClone(before);
  if (kind === "backgrounds") { delete expected.scenes[0].backgrounds; }
  else { delete expected.renderEffects; }
  const after = apply(before, remove);
  expect(after).toEqual(expected);
  const restored = kind === "backgrounds"
    ? apply(after, { op: "add_background", scene_id: before.entrySceneId, background: before.scenes[0].backgrounds[0] })
    : apply(after, { op: "set_effects", effects: before.renderEffects });
  expect(restored).toEqual(before);
  expect(apply(restored, remove)).toEqual(expected);
});

it("preserves omission and empty arrays as distinct from absent containers", () => {
  const before = gameDocument.parse({ ...createTopDownRoomGame("optional-container-empty"), schemaVersion: 2 });
  delete before.scenes[0].backgrounds;
  delete before.renderEffects;
  const apply = (op: unknown) => applyAnyGameOps(before, [anyGameDocumentOp.parse(JSON.parse(JSON.stringify(op)))]);
  expect(apply({ op: "update_scene", scene_id: before.entrySceneId, set: {} }).scenes[0]).not.toHaveProperty("backgrounds");
  expect(apply({ op: "update_scene", scene_id: before.entrySceneId, set: { backgrounds: [] } }).scenes[0].backgrounds).toEqual([]);
  const player = before.scenes[0].entities.find((entity) => entity.id === "player");
  if (!player?.sprite) { throw new Error("Fixture sprite missing"); }
  const layer = gameBackgroundLayer.parse({ id: "control", assetId: player.sprite.assetId, width: 16, height: 9 });
  expect(() => anyGameDocumentOp.parse({ op: "update_scene", scene_id: before.entrySceneId, set: { backgrounds: [layer] } })).toThrow();
  expect(apply({ op: "set_effects", effects: [] }).renderEffects).toEqual([]);
  expect(apply({ op: "set_effects", effects: null })).not.toHaveProperty("renderEffects");
  const empty = structuredClone(before);
  empty.scenes[0].backgrounds = [];
  expect(applyAnyGameOps(empty, [{ op: "update_scene", scene_id: empty.entrySceneId, set: {} }]).scenes[0].backgrounds).toEqual([]);
});

it("rejects a later invalid scene without committing container deletion", () => {
  const before = gameDocument.parse({ ...createTopDownRoomGame("optional-container-atomic"), schemaVersion: 2 });
  before.scenes[0].backgrounds = [];
  before.renderEffects = [];
  const captured = structuredClone(before);
  const ops = [
    { op: "update_scene", scene_id: before.entrySceneId, set: { backgrounds: null } },
    { op: "set_effects", effects: null },
    { op: "set_game", entry_scene_id: "missing-scene" },
  ].map((op) => anyGameDocumentOp.parse(JSON.parse(JSON.stringify(op))));
  let failure: unknown;
  try { applyAnyGameOps(before, ops); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(GameOpError);
  if (!(failure instanceof GameOpError)) { throw new Error("Expected operation validation failure"); }
  expect(failure.opIndex).toBe(2);
  expect(before).toEqual(captured);
});
