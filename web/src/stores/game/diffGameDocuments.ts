import type { GameDocument, GameEntity } from "@nodetool-ai/protocol/game.js";
import { applyGameOps, gameDocumentOp, type GameDocumentOp } from "@nodetool-ai/game-runtime";
import { diffGameOwnership, sameGameAuthoringDefinitions } from "./diffGameOwnership";

const COMPONENTS = ["sprite", "tilemap", "camera2d", "body2d", "collider2d", "animator", "visualAnimation", "audioSource", "light2d", "parentId"] as const;

function changed(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}


function hasRemovedProperty(from: unknown, to: unknown): boolean {
  if (typeof from !== "object" || from === null || Array.isArray(from)
    || typeof to !== "object" || to === null || Array.isArray(to)) { return false; }
  const desired = new Map(Object.entries(to));
  return Object.entries(from).some(([key, value]) => !desired.has(key) || hasRemovedProperty(value, desired.get(key)));
}

function isBehaviorReorder(from: GameEntity, to: GameEntity): boolean {
  const { behaviors: _fromBehaviors, ...fromFields } = from;
  const { behaviors: _toBehaviors, ...toFields } = to;
  return !changed(fromFields, toFields) && from.behaviors.length === to.behaviors.length &&
    changed(from.behaviors, to.behaviors) &&
    !changed(from.behaviors.map((item) => JSON.stringify(item)).sort(), to.behaviors.map((item) => JSON.stringify(item)).sort());
}

function behaviorMoves(sceneId: string, entity: GameEntity, desired: GameEntity): GameDocumentOp[] {
  const working = [...entity.behaviors];
  const ops: GameDocumentOp[] = [];
  for (let index = 0; index < desired.behaviors.length; index++) {
    if (!changed(working[index], desired.behaviors[index])) { continue; }
    const previous = working.findIndex((item, position) => position > index && !changed(item, desired.behaviors[index]));
    if (previous < 0) { break; }
    const [item] = working.splice(previous, 1);
    working.splice(index, 0, item);
    ops.push({ op: "move_behavior", scene_id: sceneId, entity_id: entity.id, index: previous, to_index: index });
  }
  return ops;
}

function entitySet(from: GameEntity, to: GameEntity): Extract<GameDocumentOp, { op: "update_entity" }>["set"] {
  const set: Record<string, unknown> = { ...to };
  delete set.id;
  for (const key of COMPONENTS) {
    if (from[key] !== undefined && to[key] === undefined) { set[key] = null; }
  }
  const op = gameDocumentOp.parse({ op: "update_entity", entity_id: to.id, set });
  if (op.op !== "update_entity") { throw new Error("Expected entity update operation"); }
  return op.set;
}

/** Express an undo or redo snapshot as the same ops used by the editor and agent. */
export function diffGameDocuments(from: GameDocument, to: GameDocument): GameDocumentOp[] {
  if (!sameGameAuthoringDefinitions(from, to)) { return [{ op: "set_document", document: to }]; }
  const ops: GameDocumentOp[] = [];
  for (const [slot, binding] of Object.entries(to.assets)) {
    if (changed(from.assets[slot], binding)) { ops.push({ op: "bind_asset", slot, binding }); }
  }
  for (const scene of to.scenes) {
    const before = from.scenes.find((entry) => entry.id === scene.id);
    if (!before) {
      ops.push({ op: "add_scene", scene_id: scene.id, scene });
      continue;
    }
    if (changed(before.name, scene.name) || changed(before.music, scene.music) || changed(before.gravity, scene.gravity)) {
      ops.push({ op: "update_scene", scene_id: scene.id,
        set: { name: scene.name, music: scene.music ?? null, gravity: scene.gravity ?? null } });
    }
    if (changed(before.lighting, scene.lighting)) {
      ops.push({ op: "set_lighting", scene_id: scene.id, lighting: scene.lighting ?? null });
    }
    for (const entity of scene.entities) {
      const previous = before.entities.find((entry) => entry.id === entity.id);
      if (!previous) { ops.push({ op: "add_entity", scene_id: scene.id, entity }); }
      else if (isBehaviorReorder(previous, entity)) { ops.push(...behaviorMoves(scene.id, previous, entity)); }
      else if (changed(previous, entity)) {
        for (const component of COMPONENTS) {
          if (previous[component] !== undefined && entity[component] !== undefined
            && hasRemovedProperty(previous[component], entity[component])) {
            ops.push(gameDocumentOp.parse({ op: "update_entity", scene_id: scene.id,
              entity_id: entity.id, set: { [component]: null } }));
          }
        }
        ops.push({ op: "update_entity", scene_id: scene.id, entity_id: entity.id, set: entitySet(previous, entity) });
      }
    }
    const removedIds = new Set(before.entities.filter((entity) => !scene.entities.some((entry) => entry.id === entity.id)).map((entity) => entity.id));
    const beforeById = new Map(before.entities.map((entity) => [entity.id, entity]));
    const hasRemovedAncestor = (entity: GameEntity): boolean => {
      const seen = new Set<string>();
      for (let parentId = entity.parentId; parentId && !seen.has(parentId); parentId = beforeById.get(parentId)?.parentId) {
        if (removedIds.has(parentId)) { return true; }
        seen.add(parentId);
      }
      return false;
    };
    for (const entity of before.entities) {
      // Removing an ancestor already removes this entity, and a second remove would fail on the missing ID.
      if (removedIds.has(entity.id) && !hasRemovedAncestor(entity)) {
        ops.push({ op: "remove_entity", scene_id: scene.id, entity_id: entity.id, children: "remove" });
      }
    }
    const workingEntityIds = before.entities.map((item) => item.id).filter((id) => scene.entities.some((item) => item.id === id));
    for (const entity of scene.entities) { if (!workingEntityIds.includes(entity.id)) { workingEntityIds.push(entity.id); } }
    for (let index = 0; index < scene.entities.length; index++) {
      const desiredId = scene.entities[index].id;
      if (workingEntityIds[index] === desiredId) { continue; }
      const previous = workingEntityIds.indexOf(desiredId);
      if (previous < 0) { continue; }
      workingEntityIds.splice(previous, 1);
      workingEntityIds.splice(index, 0, desiredId);
      ops.push({ op: "move_entity", scene_id: scene.id, entity_id: desiredId, to_index: index });
    }
    if (before.backgrounds === undefined && scene.backgrounds?.length === 0) {
      ops.push({ op: "update_scene", scene_id: scene.id, set: { backgrounds: [] } });
    }
    const oldBackgrounds = before.backgrounds ?? [];
    const newBackgrounds = scene.backgrounds ?? [];
    for (const background of newBackgrounds) {
      const previous = oldBackgrounds.find((entry) => entry.id === background.id);
      if (!previous) { ops.push({ op: "add_background", scene_id: scene.id, background }); }
      else if (changed(previous, background)) {
        if (hasRemovedProperty(previous, background)) {
          ops.push({ op: "remove_background", scene_id: scene.id, id: background.id });
          ops.push({ op: "add_background", scene_id: scene.id, background, index: oldBackgrounds.findIndex((entry) => entry.id === background.id) });
        } else { ops.push({ op: "update_background", scene_id: scene.id, id: background.id, set: background }); }
      }
    }
    for (const background of oldBackgrounds) {
      if (!newBackgrounds.some((entry) => entry.id === background.id)) { ops.push({ op: "remove_background", scene_id: scene.id, id: background.id }); }
    }
    if (before.backgrounds !== undefined && scene.backgrounds === undefined) {
      ops.push({ op: "update_scene", scene_id: scene.id, set: { backgrounds: null } });
    }
    const workingIds = oldBackgrounds.map((item) => item.id).filter((id) => newBackgrounds.some((item) => item.id === id));
    for (const background of newBackgrounds) { if (!workingIds.includes(background.id)) { workingIds.push(background.id); } }
    for (let index = 0; index < newBackgrounds.length; index++) {
      const desiredId = newBackgrounds[index].id;
      if (workingIds[index] === desiredId) { continue; }
      const previous = workingIds.indexOf(desiredId);
      if (previous < 0) { continue; }
      workingIds.splice(previous, 1);
      workingIds.splice(index, 0, desiredId);
      ops.push({ op: "move_background", scene_id: scene.id, id: desiredId, to_index: index });
    }
  }
  for (const scene of from.scenes) {
    if (!to.scenes.some((entry) => entry.id === scene.id)) { ops.push({ op: "remove_scene", scene_id: scene.id }); }
  }
  if (changed(from.renderEffects, to.renderEffects) || changed(from.hudEffectOrder, to.hudEffectOrder)) {
    ops.push({ op: "set_effects", effects: to.renderEffects ?? null, hud_effect_order: to.hudEffectOrder ?? null });
  }
  if (changed(from.pixelsPerUnit, to.pixelsPerUnit) || changed(from.inputActions, to.inputActions) ||
      changed(from.entrySceneId, to.entrySceneId) || changed(from.collisionLayers, to.collisionLayers)) {
    ops.push({ op: "set_game", pixels_per_unit: to.pixelsPerUnit, input_actions: to.inputActions,
      entry_scene_id: to.entrySceneId, collision_layers: to.collisionLayers ?? null });
  }
  for (const slot of Object.keys(from.assets)) {
    if (!(slot in to.assets)) { ops.push({ op: "unbind_asset", slot }); }
  }
  return [...ops, ...diffGameOwnership(from, to, applyGameOps(from, ops)).map((op) => gameDocumentOp.parse(op))];
}
