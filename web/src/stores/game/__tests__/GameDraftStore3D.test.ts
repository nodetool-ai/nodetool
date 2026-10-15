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


it("preserves the local draft after an invalid 3D merge (F4)", () => {
  const document = createNative3DGame("invalid-spatial-merge");
  const store = getGameDraftStore(document.id);
  store.getState().load(document, "first");
  const local = structuredClone(document);
  local.scenes[0].entities.find((entity) => entity.id === "player")!.model = { assetId: "missing-model", castShadow: true, receiveShadow: true };
  expect(() => store.getState().applyMerged(local, document, "second")).toThrow(/missing-model/);
  expect(store.getState().pendingOps).toEqual([]);
  expect(store.getState().baseUpdatedAt).toBe("first");
  store.getState().apply([{ op: "update_entity", scene_id: document.entrySceneId, entity_id: "player", set: { name: "Next edit" } }]);
  expect(store.getState().pendingOps).toHaveLength(1);
  expect(store.getState().saveStatus).toBe("unsaved");
});

it("reports incompatible graph adoption as a conflict and preserves the local animator draft", () => {
  const base = createNative3DGame("graph-adoption-conflict");
  base.assets.hero = { mediaKind: "model", assetId: "hero", digest: "digest", required: true, format: "glb", preparationVersion: "1",
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, nodeIds: ["node:0"], clipIds: ["idle", "run"],
    geometryBytes: 1, textureBytes: 0, triangles: 1, supportedExtensions: [] };
  const visual = base.scenes[0].entities.find((entity) => entity.id === "player-visual")!;
  delete visual.primitive;
  visual.model = { assetId: "hero", castShadow: true, receiveShadow: true };
  visual.animator3d = { clips: { idle: "idle", run: "run" }, graph: "shared", playbackRate: 1, loop: true, transitionTicks: 6 };
  const other = structuredClone(visual);
  other.id = "other";
  other.animator3d = { clips: { idle: "idle" }, playbackRate: 1, loop: true, transitionTicks: 6 };
  base.scenes[0].entities.push(other);
  base.animationGraphs = { shared: { parameters: {}, layers: [{ id: "base", mode: "override", weight: 1, initialState: "idle",
    states: { idle: { motion: { kind: "clip", clip: "idle" }, speed: 1, loop: true } }, transitions: [] }] } };
  const store = getGameDraftStore(base.id);
  store.getState().load(base, "first");
  store.getState().apply([{ op: "update_entity", scene_id: base.entrySceneId, entity_id: "other", set: { name: "Unsaved name", animator3d: { graph: "shared" } } }]);
  const local = gameDocument3D.parse(store.getState().document);
  const graph = structuredClone(base.animationGraphs.shared);
  graph.layers[0].states.run = { motion: { kind: "clip", clip: "run" }, speed: 1, loop: true };
  const server = applyGameOps3D(base, [{ op: "set_animation_graph", graph_id: "shared", graph }]);
  const merged = mergeByUnits(base, local, server, anyGameMergeAdapter(base), { mergeWithoutOps: true });
  expect(merged.conflicts).toHaveLength(1);
  expect(merged.doc).toEqual(local);
  store.getState().applyMerged(merged.doc, merged.nextBase, "first", { keepHistory: true });
  expect(store.getState().document).toEqual(local);
  expect(store.getState().commandHistory.past).toHaveLength(1);
  expect(store.getState().pendingOps.length).toBeGreaterThan(0);
  const invalid = { ...local, animationGraphs: server.animationGraphs };
  const before = store.getState();
  expect(() => store.getState().applyMerged(invalid, server, "second")).toThrow();
  expect(store.getState().document).toBe(before.document);
  expect(store.getState().pendingOps).toBe(before.pendingOps);
  expect(store.getState().commandHistory).toBe(before.commandHistory);
});

it("tracks structural behavior edits separately from source edits until play restarts", () => {
  const document = createNative3DGame("structural-script-tracking");
  const store = getGameDraftStore(document.id);
  store.getState().load(document, "first");
  store.getState().apply([{ op: "add_behavior", scene_id: document.entrySceneId, entity_id: "player", behavior: { kind: "script", source: "() => ({})" } }]);
  expect(store.getState().behaviorStructureVersions.player).toBe(1);
  const player = store.getState().document?.scenes[0].entities.find((entity) => entity.id === "player")!;
  store.getState().apply([{ op: "set_script", scene_id: document.entrySceneId, entity_id: "player", index: player.behaviors.length - 1, source: "() => ({ state: 1 })" }]);
  expect(store.getState().behaviorStructureVersions.player).toBe(1);
  store.getState().apply([{ op: "remove_behavior", scene_id: document.entrySceneId, entity_id: "player", index: player.behaviors.length - 1 }]);
  expect(store.getState().behaviorStructureVersions.player).toBe(2);
});

it("tracks structural behavior changes for prototype-shaped entity IDs", () => {
  const document = createNative3DGame("prototype-script-tracking");
  const parsed = gameDocument3D.parse({ ...document, scenes: document.scenes.map((scene) => ({ ...scene,
    entities: [...scene.entities, { id: "__proto__", transform3d: {} }, { id: "constructor", transform3d: {} }] })) });
  const store = getGameDraftStore(parsed.id);
  store.getState().load(parsed, "first");
  for (const entityId of ["__proto__", "constructor"]) {
    expect(store.getState().apply([{ op: "add_behavior", scene_id: parsed.entrySceneId, entity_id: entityId,
      behavior: { kind: "script", source: "() => ({})" } }])).toBe(true);
    expect(Object.hasOwn(store.getState().behaviorStructureVersions, entityId)).toBe(true);
    expect(store.getState().behaviorStructureVersions[entityId]).toBe(1);
  }
});
