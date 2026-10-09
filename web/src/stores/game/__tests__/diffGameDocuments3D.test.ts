import { z } from "zod";
import { gameAuthoring, gameParticles, type GameDocument3D } from "@nodetool-ai/protocol";
import { anyGameDocumentOp, applyAnyGameOps, applyGameOps3D, createNative3DGame, gameDocumentOp3D } from "@nodetool-ai/game-runtime";
import { diffAnyGameDocuments } from "../diffAnyGameDocuments";

function roundTrip(before: GameDocument3D, after: GameDocument3D): void {
  const forward = diffAnyGameDocuments(before, after);
  const inverse = diffAnyGameDocuments(after, before);
  expect(forward.length).toBeGreaterThan(0);
  expect(forward.every((op) => op.op !== "set_document")).toBe(true);
  expect(inverse.every((op) => op.op !== "set_document")).toBe(true);
  const wireForward = z.array(anyGameDocumentOp).parse(JSON.parse(JSON.stringify(forward)));
  const wireInverse = z.array(anyGameDocumentOp).parse(JSON.parse(JSON.stringify(inverse)));
  expect(applyGameOps3D(before, wireForward.map((op) => gameDocumentOp3D.parse(op)))).toEqual(after);
  expect(applyGameOps3D(after, wireInverse.map((op) => gameDocumentOp3D.parse(op)))).toEqual(before);
  const applied = applyAnyGameOps(before, wireForward);
  expect(applied).toEqual(after);
  const undone = applyAnyGameOps(applied, wireInverse);
  expect(undone).toEqual(before);
  expect(applyAnyGameOps(undone, wireForward)).toEqual(after);
}

it("round-trips entity transforms, nested component removal and scene settings with granular JSON operations", () => {
  const before = createNative3DGame("diff3d-components");
  const visual = before.scenes[0].entities.find((entity) => entity.id === "player-visual");
  if (!visual?.primitive) { throw new Error("Fixture primitive missing"); }
  visual.primitive.material.emissive = "#112233";
  before.scenes[0].environment.fog = { color: "#112233", near: 1, far: 20 };
  const after = structuredClone(before);
  const nextVisual = after.scenes[0].entities.find((entity) => entity.id === "player-visual");
  if (!nextVisual?.primitive) { throw new Error("Fixture primitive missing"); }
  delete nextVisual.primitive.material.emissive;
  delete after.scenes[0].environment.fog;
  nextVisual.transform3d.position.x = 2;
  after.scenes[0].name = "Changed scene";
  roundTrip(before, after);
});

it("round-trips parent cascades and entity order without removing an entity twice", () => {
  const before = applyGameOps3D(createNative3DGame("diff3d-hierarchy"), [
    { op: "add_entity", scene_id: "level", entity: { id: "parent", transform3d: {} } },
    { op: "add_entity", scene_id: "level", entity: { id: "child", parentId: "parent", transform3d: {} } }
  ]);
  const after = applyGameOps3D(before, [{ op: "remove_entity", scene_id: "level", entity_id: "parent" },
    { op: "move_entity", scene_id: "level", entity_id: "player", to_index: 0 }]);
  roundTrip(before, after);
});

it("round-trips removal of scene music through JSON operations", () => {
  const before = createNative3DGame("diff3d-music-removal");
  before.assets.music = { mediaKind: "audio", assetId: "0123456789abcdef0123456789abcdef",
    digest: "music-fixture", required: true };
  before.scenes[0].music = { assetId: "music", volume: 0.5,
    fadeInTicks: 0, fadeOutTicks: 0 };
  const after = structuredClone(before);
  delete after.scenes[0].music;
  roundTrip(before, after);
});

it("round-trips an ordinary authored move including ownership metadata", () => {
  const baseline = createNative3DGame("diff3d-authored-move");
  const before = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
    program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline,
    overrides: [], detached: [], suppressions: [] }) };
  const after = applyGameOps3D(before, [{ op: "update_entity", scene_id: before.entrySceneId,
    entity_id: "player", set: { transform3d: { position: { x: 2 } } } }]);
  expect(after.authoring?.overrides.length).toBeGreaterThan(0);
  roundTrip(before, after);
});

it("preserves intentional raw ownership and restores it through an explicit existing reset operation", () => {
  const baseline = createNative3DGame("authored-inverse-control");
  const before = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
    program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline,
    overrides: [], detached: [], suppressions: [] }) };
  const player = before.scenes[0].entities.find((entity) => entity.id === "player");
  if (!player) { throw new Error("Fixture player missing"); }
  const target = { scene_id: before.entrySceneId, entity_id: player.id };
  const moved = applyGameOps3D(before, [{ op: "update_entity", ...target, set: { transform3d: { position: { x: 2 } } } }]);
  expect(moved.authoring?.overrides.length).toBeGreaterThan(0);
  const restored = applyGameOps3D(moved, [{ op: "update_entity", ...target,
    set: { transform3d: { position: { x: player.transform3d.position.x } } } }]);
  expect(restored.scenes).toEqual(before.scenes);
  expect(restored.authoring?.overrides).toEqual([{ sceneId: before.entrySceneId, entityId: player.id,
    path: ["transform3d", "position", "x"], value: player.transform3d.position.x }]);
  expect(applyGameOps3D(restored, [{ op: "reset_override", ...target,
    path: ["transform3d", "position", "x"] }])).toEqual(before);
});

it("captures legacy suppression retained after an authored entity is re-added", () => {
  const baseline = createNative3DGame("legacy-readded-suppression");
  const before = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
    program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline }) };
  const entity = before.scenes[0].entities.find((entry) => entry.id === "player-visual");
  if (!entity) { throw new Error("Fixture entity missing"); }
  const removed = applyGameOps3D(before, [{ op: "remove_entity", scene_id: before.entrySceneId, entity_id: entity.id }]);
  const restored = applyGameOps3D(removed, [{ op: "add_entity", scene_id: before.entrySceneId, entity }]);
  expect(restored.scenes[0].entities.some((entry) => entry.id === entity.id)).toBe(true);
  expect(restored.authoring?.suppressions).toContainEqual({ sceneId: before.entrySceneId, entityId: entity.id });
});

it("captures legacy detachment of a manually added entity outside the baseline", () => {
  const baseline = createNative3DGame("legacy-manual-detachment");
  const before = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
    program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline }) };
  const added = applyGameOps3D(before, [{ op: "add_entity", scene_id: before.entrySceneId,
    entity: { id: "manual", transform3d: {} } }]);
  const detached = applyGameOps3D(added, [{ op: "detach_entity", scene_id: before.entrySceneId, entity_id: "manual" }]);
  expect(baseline.scenes[0].entities.some((entry) => entry.id === "manual")).toBe(false);
  expect(detached.authoring?.detached).toContainEqual({ sceneId: before.entrySceneId, entityId: "manual" });
});

it("captures legacy detached membership after its manually added entity is removed", () => {
  const baseline = createNative3DGame("legacy-orphan-detachment");
  const before = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
    program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline }) };
  const target = { scene_id: before.entrySceneId, entity_id: "manual" };
  const added = applyGameOps3D(before, [{ op: "add_entity", scene_id: target.scene_id,
    entity: { id: target.entity_id, transform3d: {} } }]);
  const detached = applyGameOps3D(added, [{ op: "detach_entity", ...target }]);
  const removed = applyGameOps3D(detached, [{ op: "remove_entity", ...target }]);
  expect(removed.scenes[0].entities.some((entry) => entry.id === target.entity_id)).toBe(false);
  expect(baseline.scenes[0].entities.some((entry) => entry.id === target.entity_id)).toBe(false);
  expect(removed.authoring?.detached).toEqual([{ sceneId: target.scene_id, entityId: target.entity_id }]);
});

it("round-trips the original order when the earliest override membership is removed", () => {
  const baseline = createNative3DGame("legacy-ownership-order");
  const initial = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
    program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline }) };
  const target = { scene_id: initial.entrySceneId, entity_id: "player" };
  const player = baseline.scenes[0].entities.find((entity) => entity.id === target.entity_id);
  if (!player) { throw new Error("Fixture player missing"); }
  const before = applyGameOps3D(initial, [{ op: "update_entity", ...target,
    set: { transform3d: { position: { x: player.transform3d.position.x + 2, z: player.transform3d.position.z + 3 } } } }]);
  expect(before.authoring?.overrides.map((entry) => entry.path.at(-1))).toEqual(["x", "z"]);
  const after = applyGameOps3D(before, [{ op: "reset_override", ...target,
    path: ["transform3d", "position", "x"] }]);
  expect(after.authoring?.overrides.map((entry) => entry.path.at(-1))).toEqual(["z"]);
  roundTrip(before, after);
});


it("round-trips scene addition, removal and retained scene ordering", () => {
  const initial = createNative3DGame("diff3d-scenes");
  const scene = structuredClone(initial.scenes[0]);
  const before = applyGameOps3D(initial, [
    { op: "add_scene", scene_id: "second", scene: { ...scene, id: "second", name: "Second" } },
    { op: "add_scene", scene_id: "removed", scene: { ...scene, id: "removed", name: "Removed" } }
  ]);
  const after = structuredClone(before);
  after.scenes = [before.scenes[1], before.scenes[0]];
  roundTrip(before, after);
  const added = applyGameOps3D(after, [{ op: "add_scene", scene_id: "first", scene: { ...scene, id: "first", name: "First" }, index: 0 }]);
  roundTrip(after, added);
});

it("round-trips asset bindings and game input settings alongside entity additions", () => {
  const before = createNative3DGame("diff3d-game-settings");
  const after = applyGameOps3D(before, [
    { op: "bind_asset", slot: "music", binding: { mediaKind: "audio",
      assetId: "0123456789abcdef0123456789abcdef", digest: "music-fixture", required: true } },
    { op: "add_entity", scene_id: "level", entity: { id: "new-entity", transform3d: {} }, index: 0 },
    { op: "set_game", input_actions: [...before.inputActions, "inspect"] }
  ]);
  roundTrip(before, after);
});

it("retains reparented children when their previous ancestor is removed", () => {
  const before = applyGameOps3D(createNative3DGame("diff3d-reparent"), [
    { op: "add_entity", scene_id: "level", entity: { id: "old-parent", transform3d: {} } },
    { op: "add_entity", scene_id: "level", entity: { id: "retained-child", parentId: "old-parent", transform3d: {} } }
  ]);
  const after = applyGameOps3D(before, [
    { op: "update_entity", scene_id: "level", entity_id: "retained-child", set: { parentId: null } },
    { op: "remove_entity", scene_id: "level", entity_id: "old-parent" }
  ]);
  roundTrip(before, after);
});

it("round-trips behavior list changes through scene-qualified public operations", () => {
  const before = createNative3DGame("diff3d-behaviors");
  const after = structuredClone(before);
  const player = after.scenes[0].entities.find((entity) => entity.id === "player");
  if (!player) { throw new Error("Fixture player missing"); }
  player.behaviors = [];
  roundTrip(before, after);
});


it("round-trips prefab additions and replacements without whole-document operations", () => {
  const before = createNative3DGame("diff3d-prefabs");
  const entity = before.scenes[0].entities.find((entry) => entry.id === "player-visual");
  if (!entity) { throw new Error("Fixture visual missing"); }
  const prefabEntity = { ...structuredClone(entity), id: "prefab-root" };
  delete prefabEntity.parentId;
  const after = applyGameOps3D(before, [{ op: "set_prefab", prefab_id: "visual", prefab: {
    rootId: prefabEntity.id, entities: [prefabEntity]
  } }]);
  roundTrip(before, after);
  const changed = structuredClone(after);
  changed.prefabs.visual.entities[0].transform3d.position.x = 3;
  roundTrip(after, changed);
});

it("preserves the final authored baseline-valued override when separate diffs become one wire batch", () => {
  const baseline = createNative3DGame("diff3d-coalesced-ownership");
  const before = structuredClone(baseline);
  before.authoring = gameAuthoring.parse({ version: 1, program: {
    source: "return inputs.document", inputs: {}, seed: 1
  }, baseline, overrides: [], detached: [], suppressions: [] });
  const moved = applyGameOps3D(before, [{ op: "update_entity", scene_id: "level", entity_id: "player",
    set: { transform3d: { position: { x: 2 } } } }]);
  const restored = applyGameOps3D(moved, [{ op: "update_entity", scene_id: "level", entity_id: "player",
    set: { transform3d: { position: { x: 0 } } } }]);
  const ops = [...diffAnyGameDocuments(before, moved), ...diffAnyGameDocuments(moved, restored)]
    .map((op) => anyGameDocumentOp.parse(JSON.parse(JSON.stringify(op))));
  expect(ops.every((op) => op.op !== "set_document")).toBe(true);
  expect(applyAnyGameOps(before, ops)).toEqual(restored);
  roundTrip(before, restored);
});


it("round-trips removal of optional collision layers through JSON operations", () => {
  const before = createNative3DGame("diff3d-collision-layers-removal");
  before.collisionLayers = ["default", "unused"];
  const after = structuredClone(before);
  delete after.collisionLayers;
  roundTrip(before, after);
});

it("round-trips document animation graphs and the animator reference to them", () => {
  const before = createNative3DGame("diff3d-animation-graph");
  before.assets.hero = { mediaKind: "model", assetId: "hero", digest: "hero-digest", required: true, format: "glb", preparationVersion: "1",
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, nodeIds: ["node:0"], clipIds: ["clip:0", "clip:1"],
    geometryBytes: 1, textureBytes: 0, triangles: 1, supportedExtensions: [] };
  const visual = before.scenes[0].entities.find((entity) => entity.id === "player-visual");
  if (!visual) { throw new Error("Fixture visual missing"); }
  delete visual.primitive;
  visual.model = { assetId: "hero", castShadow: true, receiveShadow: true };
  visual.animator3d = { clips: { idle: "clip:0", run: "clip:1" }, playbackRate: 1, loop: true, transitionTicks: 6 };
  const after = structuredClone(before);
  after.animationGraphs = { locomotion: { parameters: { running: { kind: "bool", default: false } }, layers: [{ id: "base", mode: "override", weight: 1, initialState: "idle",
    states: { idle: { motion: { kind: "clip", clip: "idle" }, speed: 1, loop: true }, run: { motion: { kind: "clip", clip: "run" }, speed: 1, loop: true } },
    transitions: [{ from: "idle", to: "run", conditions: [{ parameter: "running", op: "true" }], durationTicks: 6 }] }] } };
  const nextVisual = after.scenes[0].entities.find((entity) => entity.id === "player-visual");
  if (!nextVisual?.animator3d) { throw new Error("Fixture animator missing"); }
  nextVisual.animator3d.graph = "locomotion";
  roundTrip(before, after);
  expect(diffAnyGameDocuments(before, after).map((op) => op.op)).toContain("set_animation_graph");
  expect(diffAnyGameDocuments(after, before).map((op) => op.op)).toContain("remove_animation_graph");
});

it("round-trips adding and removing the audio mixer through JSON operations", () => {
  const before = createNative3DGame("diff3d-audio-mixer");
  const after = structuredClone(before);
  after.audio = { mixer: { buses: { ambience: { parent: "sfx", volume: 0.5, muted: false, reverbSend: 0.2 } }, assetBuses: {},
    limiter: { enabled: true, thresholdDb: -3 }, reverb: { decaySeconds: 1.8 }, ducking: [], snapshots: {}, transitions: [] } };
  roundTrip(before, after);
});

it("round-trips adding, editing and removing a particles component", () => {
  const before = createNative3DGame("diff3d-particles");
  const withParticles = structuredClone(before);
  const player = withParticles.scenes[0].entities.find((entity) => entity.id === "player-visual");
  if (!player) { throw new Error("Fixture entity missing"); }
  player.particles = gameParticles.parse({ emitters: [{ id: "trail", rate: 12, onDeath: [{ emitter: "spark" }] }, { id: "spark", playOnStart: false }] });
  roundTrip(before, withParticles);
  const edited = structuredClone(withParticles);
  const editedPlayer = edited.scenes[0].entities.find((entity) => entity.id === "player-visual");
  if (!editedPlayer?.particles) { throw new Error("Fixture particles missing"); }
  editedPlayer.particles.emitters = [editedPlayer.particles.emitters[0]];
  editedPlayer.particles.emitters[0].onDeath = [];
  roundTrip(withParticles, edited);
});

it("round-trips adding and removing cull layers, frame budgets and entity culling together", () => {
  const before = createNative3DGame("diff3d-render-culling");
  const after = structuredClone(before);
  after.performance = { cullLayers: { props: { maxDistance: 40 } }, budgets: { drawCalls: 200, voices: 8 } };
  const visual = after.scenes[0].entities.find((entity) => entity.id === "player-visual");
  if (!visual) { throw new Error("Fixture entity missing"); }
  visual.renderCulling = { layer: "props" };
  roundTrip(before, after);
});
