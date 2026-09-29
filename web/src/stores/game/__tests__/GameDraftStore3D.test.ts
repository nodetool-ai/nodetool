import { describe, expect, it } from "@jest/globals";
import { gameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps3D, createNative3DGame, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";
import { mergeByUnits } from "../../documentMerge";
import { getGameDraftStore } from "../GameDraftStore";
import { anyGameMergeAdapter } from "../anyMerge";

it("records a transform gesture as one undo step and preserves edits made during its save", () => {
  const document = createNative3DGame("gizmo-undo");
  const store = getGameDraftStore(document.id);
  store.getState().load(document, "first");
  const op: GameDocumentOp3D = { op: "update_entity", scene_id: document.entrySceneId, entity_id: "player", set: { transform3d: { position: { x: 2, y: 3, z: 4 } } } };
  store.getState().apply([op]);
  store.getState().undo();
  expect(gameDocument3D.parse(store.getState().document)).toEqual(document);
  store.getState().redo();
  store.getState().setSaving(store.getState().pendingOps.length);
  const second: GameDocumentOp3D = { ...op, set: { transform3d: { position: { x: 5 } } } };
  store.getState().apply([second]);
  store.getState().acknowledge(applyGameOps3D(document, [op]), "second", 1);
  expect(store.getState().saveStatus).toBe("unsaved");
  expect(gameDocument3D.parse(store.getState().document).scenes[0].entities.find((entity) => entity.id === "player")?.transform3d.position).toEqual({ x: 5, y: 3, z: 4 });
});

describe("3D document merge", () => {
  it("merges independent spatial fields and reports competing pose edits", () => {
    const base = createNative3DGame("spatial-merge");
    const target = { scene_id: base.entrySceneId, entity_id: "player" };
    const local = applyGameOps3D(base, [{ op: "update_entity", ...target, set: { name: "Local player" } }]);
    const server = applyGameOps3D(base, [{ op: "update_entity", ...target, set: { transform3d: { position: { x: 2 } } } }]);
    const merged = mergeByUnits(base, local, server, anyGameMergeAdapter(base), { mergeWithoutOps: true });
    expect(merged.conflicts).toEqual([]);
    expect(gameDocument3D.parse(merged.doc).scenes[0].entities.find((entity) => entity.id === "player")).toMatchObject({ name: "Local player", transform3d: { position: { x: 2 } } });
    const competing = applyGameOps3D(base, [{ op: "update_entity", ...target, set: { transform3d: { position: { x: 3 } } } }]);
    const conflict = mergeByUnits(base, competing, server, anyGameMergeAdapter(base), { mergeWithoutOps: true });
    expect(conflict.conflicts).toHaveLength(1);
    expect(conflict.conflicts[0].unit.id).toBe(`${base.entrySceneId}:player`);
  });
});
