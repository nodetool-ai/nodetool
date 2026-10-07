import type { GameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps3D, gameDocumentOp3D, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";
import { diffGameOwnership } from "./diffGameOwnership";

const NULLABLE_COMPONENTS = ["primitive", "model", "body3d", "collider3d", "character3d", "camera3d",
  "light3d", "animator3d", "interactionActor", "audioSource", "parentId"] as const;

function changed(from: unknown, to: unknown): boolean {
  return JSON.stringify(from) !== JSON.stringify(to);
}

function hasRemovedProperty(from: unknown, to: unknown): boolean {
  if (typeof from !== "object" || from === null || Array.isArray(from)
    || typeof to !== "object" || to === null || Array.isArray(to)) { return false; }
  const desired = new Map(Object.entries(to));
  return Object.entries(from).some(([key, value]) => !desired.has(key) || hasRemovedProperty(value, desired.get(key)));
}

export function diffGameDocuments3D(from: GameDocument3D, to: GameDocument3D): GameDocumentOp3D[] {
  const ops: GameDocumentOp3D[] = [];
  for (const [slot, binding] of Object.entries(to.assets)) {
    if (changed(from.assets[slot], binding)) { ops.push({ op: "bind_asset", slot, binding }); }
  }
  for (const [prefabId, prefab] of Object.entries(to.prefabs)) {
    if (changed(from.prefabs[prefabId], prefab)) { ops.push({ op: "set_prefab", prefab_id: prefabId, prefab }); }
  }
  if (changed(from.presentation, to.presentation) || changed(from.inputActions, to.inputActions)
    || changed(from.inputAxes, to.inputAxes) || changed(from.entrySceneId, to.entrySceneId)
    || changed(from.collisionLayers, to.collisionLayers)) {
    ops.push({ op: "set_game", presentation: to.presentation, input_actions: to.inputActions,
      input_axes: to.inputAxes, entry_scene_id: to.entrySceneId, collision_layers: to.collisionLayers ?? null });
  }
  // There is no scene move operation. Reinsert reordered scenes at their requested indices.
  const retainedSceneIds = from.scenes.filter((scene) => to.scenes.some((entry) => entry.id === scene.id)).map((scene) => scene.id);
  const desiredRetainedSceneIds = to.scenes.filter((scene) => from.scenes.some((entry) => entry.id === scene.id)).map((scene) => scene.id);
  const rebuildScenes = changed(retainedSceneIds, desiredRetainedSceneIds);
  for (const scene of from.scenes) {
    if (rebuildScenes || !to.scenes.some((entry) => entry.id === scene.id)) {
      ops.push({ op: "remove_scene", scene_id: scene.id });
    }
  }
  const scenes = new Map(from.scenes.map((scene) => [scene.id, scene]));
  for (const scene of to.scenes) {
    const previous = scenes.get(scene.id);
    if (!previous || rebuildScenes) {
      ops.push({ op: "add_scene", scene_id: scene.id, scene, index: to.scenes.indexOf(scene) });
      continue;
    }
    const { id: _sceneId, entities: _entities, ...settings } = scene;
    const { id: _previousSceneId, entities: _previousEntities, ...previousSettings } = previous;
    if (changed(previousSettings, settings)) { ops.push({ op: "update_scene", scene_id: scene.id, set: { ...settings, music: scene.music ?? null } }); }
    const entities = new Map(previous.entities.map((entity) => [entity.id, entity]));
    for (const entity of scene.entities) {
      const before = entities.get(entity.id);
      if (!before) {
        ops.push({ op: "add_entity", scene_id: scene.id, entity });
        continue;
      }
      if (!changed(before, entity)) { continue; }
      const previousFields = new Map(Object.entries(before));
      const set: Record<string, unknown> = Object.fromEntries(Object.entries(entity)
        .filter(([key, value]) => key !== "id" && changed(previousFields.get(key), value)));
      for (const component of NULLABLE_COMPONENTS) {
        if (before[component] === undefined) { continue; }
        if (entity[component] === undefined) { set[component] = null; }
        else if (hasRemovedProperty(before[component], entity[component])) {
          ops.push({ op: "update_entity", scene_id: scene.id, entity_id: entity.id, set: { [component]: null } });
        }
      }
      ops.push(gameDocumentOp3D.parse({ op: "update_entity", scene_id: scene.id, entity_id: entity.id, set }));
    }
    const desiredIds = new Set(scene.entities.map((entity) => entity.id));
    const removedIds = new Set(previous.entities.filter((entity) => !desiredIds.has(entity.id)).map((entity) => entity.id));
    const previousById = new Map(previous.entities.map((entity) => [entity.id, entity]));
    for (const entity of previous.entities) {
      if (!removedIds.has(entity.id)) { continue; }
      let parentId = entity.parentId;
      const seen = new Set<string>();
      let removedAncestor = false;
      while (parentId && !seen.has(parentId)) {
        if (removedIds.has(parentId)) { removedAncestor = true; break; }
        seen.add(parentId);
        parentId = previousById.get(parentId)?.parentId;
      }
      if (!removedAncestor) { ops.push({ op: "remove_entity", scene_id: scene.id, entity_id: entity.id }); }
    }
    const workingIds = previous.entities.filter((entity) => desiredIds.has(entity.id)).map((entity) => entity.id);
    const existingIds = new Set(workingIds);
    for (const entity of scene.entities) {
      if (!existingIds.has(entity.id)) { workingIds.push(entity.id); }
    }
    for (let index = 0; index < scene.entities.length; index++) {
      const desiredId = scene.entities[index].id;
      if (workingIds[index] === desiredId) { continue; }
      const previousIndex = workingIds.indexOf(desiredId);
      workingIds.splice(previousIndex, 1);
      workingIds.splice(index, 0, desiredId);
      ops.push({ op: "move_entity", scene_id: scene.id, entity_id: desiredId, to_index: index });
    }
  }
  for (const prefabId of Object.keys(from.prefabs)) {
    if (!(prefabId in to.prefabs)) { ops.push({ op: "remove_prefab", prefab_id: prefabId }); }
  }
  for (const slot of Object.keys(from.assets)) {
    if (!(slot in to.assets)) { ops.push({ op: "unbind_asset", slot }); }
  }
  const applied = applyGameOps3D(from, ops);
  return [...ops, ...diffGameOwnership(from, to, applied).map((op) => gameDocumentOp3D.parse(op))];
}
