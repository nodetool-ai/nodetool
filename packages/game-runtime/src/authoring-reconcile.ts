import { anyGameDocument, gameEntity, gameEntity3D, type AnyGameDocument, type GameAuthoringOverride, type GameAuthoringTarget } from "@nodetool-ai/protocol";
import { z } from "zod";

type Json = z.infer<ReturnType<typeof z.json>>;
export interface GameAuthoringConflict extends GameAuthoringTarget { readonly code: string; readonly message: string }
export interface GameAuthoringCandidate { readonly document: AnyGameDocument; readonly conflicts: readonly GameAuthoringConflict[]; readonly changedEntityIds: readonly string[] }
const keyOf = (target: GameAuthoringTarget): string => JSON.stringify([target.sceneId, target.entityId]);
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function record(value: unknown): value is Record<string, Json> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function entities(document: AnyGameDocument) {
  return new Map(document.scenes.flatMap((scene) => scene.entities.map((entity) => [keyOf({ sceneId: scene.id, entityId: entity.id }), { sceneId: scene.id, entity }] as const)));
}
/** Validate the retained baseline separately so it cannot recursively contain authoring. */
export function gameAuthoringBaseline(document: AnyGameDocument): AnyGameDocument {
  if (!document.authoring) { throw new Error("Game has no retained authoring"); }
  const baseline = anyGameDocument.parse(document.authoring.baseline);
  if (baseline.authoring) { throw new Error("Authoring baseline must not contain authoring metadata"); }
  if (baseline.id !== document.id || (baseline.schemaVersion === 3) !== (document.schemaVersion === 3)) { throw new Error("Authoring baseline belongs to a different game or dimension"); }
  const baselineEntities = entities(baseline);
  for (const override of document.authoring.overrides) {
    const original = baselineEntities.get(keyOf(override));
    if (!original) { throw new Error("Override refers to an entity outside its generated baseline"); }
    const value = patch(original.entity, override);
    if (baseline.schemaVersion === 3) { gameEntity3D.parse(value); } else { gameEntity.parse(value); }
  }
  const seenInstances = new Set<string>();
  for (const instance of document.authoring.instances) {
    const key = keyOf(instance);
    if (seenInstances.has(key) || !baselineEntities.has(key) || !(instance.prefabId in document.authoring.prefabs)) { throw new Error("Prefab instance must have a unique baseline target and an existing definition"); }
    seenInstances.add(key);
  }
  for (const definition of Object.values(document.authoring.prefabs)) {
    if (baseline.schemaVersion === 3) { gameEntity3D.partial().parse(definition); } else { gameEntity.partial().parse(definition); }
  }
  const seenOverrides = new Set<string>();
  for (const override of document.authoring.overrides) {
    const key = JSON.stringify([override.sceneId, override.entityId, override.path]);
    if (seenOverrides.has(key)) { throw new Error("Duplicate authoring override path"); }
    seenOverrides.add(key);
  }
  return baseline;
}
function patch(entity: unknown, override: GameAuthoringOverride): unknown {
  if (override.path[0] === "id") { throw new Error("Override path cannot address entity identity"); }
  const copy = z.record(z.string(), z.json()).parse(structuredClone(entity));
  let cursor = copy;
  for (const [index, part] of override.path.entries()) {
    if (part === "__proto__" || part === "constructor" || part === "prototype") { throw new Error("Override path cannot address prototype properties"); }
    if (index === override.path.length - 1) {
      if (override.remove) { delete cursor[part]; } else { cursor[part] = override.value; }
      break;
    }
    const next = cursor[part];
    if (!record(next)) { throw new Error(`Override path ${override.path.join(".")} is not an entity property`); }
    cursor = next;
  }
  return copy;
}
function differences(base: unknown, current: unknown, target: GameAuthoringTarget, path: string[] = []): GameAuthoringOverride[] {
  if (same(base, current)) { return []; }
  if (record(base) && record(current)) {
    return [...new Set([...Object.keys(base), ...Object.keys(current)])].filter((field) => path.length !== 0 || field !== "id").flatMap((field) => differences(base[field], current[field], target, [...path, field]));
  }
  if (path.length === 0) { return []; }
  const override: GameAuthoringOverride = { ...target, path, value: current === undefined ? null : z.json().parse(current) };
  if (current === undefined) { override.remove = true; }
  return [override];
}
/** Record manual entity edits without allowing a whole-document replacement to drop ownership. */
function atPath(value: unknown, path: readonly string[]): unknown {
  let cursor = value;
  for (const part of path) { if (!record(cursor)) { return undefined; } cursor = cursor[part]; }
  return cursor;
}
function mergeManualSettings(base: unknown, manual: unknown, generated: unknown, target: GameAuthoringTarget, conflicts: GameAuthoringConflict[]): unknown {
  let result: unknown = generated;
  for (const override of differences(base, manual, target)) {
    const oldValue = atPath(base, override.path);
    const generatedValue = atPath(generated, override.path);
    const manualValue = atPath(manual, override.path);
    if (!same(generatedValue, oldValue) && !same(generatedValue, manualValue)) {
      conflicts.push({ ...target, code: "modified_settings", message: `Generator and manual edit both changed ${override.path.join(".")}` });
    }
    try { result = patch(result, override); }
    catch { conflicts.push({ ...target, code: "modified_settings_structure", message: `Generator removed the parent of manually edited ${override.path.join(".")}` }); return manual; }
  }
  return result;
}
export function trackGameAuthoringEdits(before: AnyGameDocument, after: AnyGameDocument): AnyGameDocument {
  if (!before.authoring) { if (after.authoring) { throw new Error("Attaching retained authoring requires the hermetic authoring apply boundary"); } return after; }
  if (!after.authoring) { throw new Error("Retained authoring cannot be discarded by set_document; detach entities explicitly"); }
  const { overrides: _previousOverrides, suppressions: _previousSuppressions, detached: _previousDetached, ...previousDefinitions } = before.authoring;
  const { overrides: _nextOverrides, suppressions: _nextSuppressions, detached: _nextDetached, ...nextDefinitions } = after.authoring;
  if (!same(previousDefinitions, nextDefinitions)) { throw new Error("Retained program, baseline and definition changes require the authoring apply boundary"); }
  const baseline = entities(gameAuthoringBaseline(before));
  const updated = entities(after);
  const detached = new Set(after.authoring.detached.map(keyOf));
  const suppressions = new Map(after.authoring.suppressions.map((target) => [keyOf(target), target]));
  const overrides: GameAuthoringOverride[] = [];
  const explicitByTarget = new Map<string, GameAuthoringOverride[]>();
  for (const override of after.authoring.overrides) {
    const key = keyOf(override);
    const retained = explicitByTarget.get(key) ?? [];
    retained.push(override); explicitByTarget.set(key, retained);
  }
  for (const [key, original] of baseline) {
    if (detached.has(key)) { continue; }
    const target = { sceneId: original.sceneId, entityId: original.entity.id };
    const next = updated.get(key);
    if (!next) { suppressions.set(key, target); continue; }
    if (!suppressions.has(key)) {
      const retained = new Map<string, GameAuthoringOverride>();
      for (const explicit of explicitByTarget.get(key) ?? []) {
        const value = atPath(next.entity, explicit.path);
        const updatedOverride: GameAuthoringOverride = { ...target, path: explicit.path, value: value === undefined ? null : z.json().parse(value) };
        if (value === undefined) { updatedOverride.remove = true; }
        retained.set(JSON.stringify(explicit.path), updatedOverride);
      }
      for (const difference of differences(original.entity, next.entity, target)) { retained.set(JSON.stringify(difference.path), difference); }
      overrides.push(...retained.values());
    }
  }
  return anyGameDocument.parse({ ...after, authoring: { ...after.authoring, overrides, suppressions: [...suppressions.values()] } });
}
/** Build a reviewable candidate. The caller must reject conflicts before persisting it. */
export function reconcileGameAuthoring(current: AnyGameDocument, candidate: AnyGameDocument): GameAuthoringCandidate {
  if (!current.authoring || !candidate.authoring) { throw new Error("Rebuild requires retained authoring metadata"); }
  if (candidate.id !== current.id || (candidate.schemaVersion === 3) !== (current.schemaVersion === 3)) { throw new Error("Rebuild cannot change game identity or dimension"); }
  const oldBaseline = gameAuthoringBaseline(current);
  const old = entities(oldBaseline);
  const oldScenes = new Map(oldBaseline.scenes.map((scene) => [scene.id, scene]));
  const currentScenes = new Map(current.scenes.map((scene) => [scene.id, scene]));
  gameAuthoringBaseline(candidate);
  const next = entities(candidate);
  const previous = entities(current);
  const detached = new Set(current.authoring.detached.map(keyOf));
  const suppressed = new Set(current.authoring.suppressions.map(keyOf));
  const conflicts: GameAuthoringConflict[] = [];
  const overrideMap = new Map<string, GameAuthoringOverride[]>();
  for (const override of current.authoring.overrides) {
    const key = keyOf(override);
    const list = overrideMap.get(key) ?? [];
    list.push(override); overrideMap.set(key, list);
  }
  const references = new Set<string>();
  const addReference = (sceneId: string, entityId: string): void => { references.add(keyOf({ sceneId, entityId })); };
  // These are the authored entity references in the native 2D/3D contracts.
  for (const scene of candidate.scenes) {
    if ("activeCameraId" in scene) { addReference(scene.id, scene.activeCameraId); }
    for (const entity of scene.entities) {
      if (entity.parentId) { addReference(scene.id, entity.parentId); }
      if ("camera3d" in entity && entity.camera3d?.behavior.kind === "follow") { addReference(scene.id, entity.camera3d.behavior.targetId); }
      for (const behavior of entity.behaviors) {
        if (behavior.kind === "spawn" && (candidate.schemaVersion !== 3 || !candidate.prefabs[behavior.prefabId])) { addReference(scene.id, behavior.prefabId); }
      }
    }
  }
  for (const [key, item] of previous) {
    if (!old.has(key) || detached.has(key) || overrideMap.has(key)) {
      if (item.entity.parentId) { addReference(item.sceneId, item.entity.parentId); }
      if ("camera3d" in item.entity && item.entity.camera3d?.behavior.kind === "follow") { addReference(item.sceneId, item.entity.camera3d.behavior.targetId); }
      for (const behavior of item.entity.behaviors) { if (behavior.kind === "spawn" && (candidate.schemaVersion !== 3 || !candidate.prefabs[behavior.prefabId])) { addReference(item.sceneId, behavior.prefabId); } }
    }
  }
  for (const [key, original] of old) {
    if (!next.has(key) && !suppressed.has(key) && !detached.has(key) && (overrideMap.has(key) || references.has(key))) {
      conflicts.push({ sceneId: original.sceneId, entityId: original.entity.id, code: references.has(key) ? "removed_referenced_entity" : "removed_overridden_entity", message: "Generator removed an entity with manual overrides or incoming references" });
    }
  }
  const previousByScene = new Map<string, Array<readonly [string, typeof previous extends Map<string, infer Value> ? Value : never]>>();
  for (const entry of previous) { const list = previousByScene.get(entry[1].sceneId) ?? []; list.push(entry); previousByScene.set(entry[1].sceneId, list); }
  const conflictKeys = new Set(conflicts.map(keyOf));
  const draft = structuredClone(candidate);
  for (const scene of draft.scenes) {
    const oldScene = oldScenes.get(scene.id);
    const currentScene = currentScenes.get(scene.id);
    if (oldScene && currentScene) {
      const { entities: _oldEntities, ...oldSettings } = oldScene;
      const { entities: _currentEntities, ...currentSettings } = currentScene;
      const { entities: _generatedEntities, ...generatedSettings } = scene;
      Object.assign(scene, mergeManualSettings(oldSettings, currentSettings, generatedSettings, { sceneId: scene.id, entityId: "@scene" }, conflicts));
    }
    const resolved = [];
    for (const entity of scene.entities) {
      const key = keyOf({ sceneId: scene.id, entityId: entity.id });
      if (suppressed.has(key) || (detached.has(key) && !previous.has(key))) { continue; }
      const manualCollision = previous.has(key) && !old.has(key);
      if (manualCollision) { conflicts.push({ sceneId: scene.id, entityId: entity.id, code: "manual_entity_collision", message: "Generator key collides with a hand-authored entity" }); }
      let value: unknown = detached.has(key) || manualCollision ? previous.get(key)?.entity ?? entity : entity;
      try {
        if (!detached.has(key) && !manualCollision) { for (const override of overrideMap.get(key) ?? []) { value = patch(value, override); } }
        resolved.push(draft.schemaVersion === 3 ? gameEntity3D.parse(value) : gameEntity.parse(value));
      } catch (error) { conflicts.push({ sceneId: scene.id, entityId: entity.id, code: "invalid_override", message: error instanceof Error ? error.message : "Invalid override" }); resolved.push(entity); }
    }
    const ids = new Set(resolved.map((entity) => entity.id));
    for (const [key, previousEntity] of previousByScene.get(scene.id) ?? []) {
      if (previousEntity.sceneId === scene.id && (!old.has(key) || detached.has(key) || conflictKeys.has(key)) && !ids.has(previousEntity.entity.id)) {
        resolved.push(previousEntity.entity); ids.add(previousEntity.entity.id);
      }
    }
    // Parse once below to recover the dimension-specific entity array type.
    Object.assign(scene, { entities: resolved });
  }
  const draftSceneIds = new Set(draft.scenes.map((scene) => scene.id));
  for (const scene of current.scenes) {
    if (!draftSceneIds.has(scene.id) && scene.entities.some((entity) => !old.has(keyOf({ sceneId: scene.id, entityId: entity.id })) || detached.has(keyOf({ sceneId: scene.id, entityId: entity.id })) || conflictKeys.has(keyOf({ sceneId: scene.id, entityId: entity.id })))) { Object.assign(draft, { scenes: [...draft.scenes, structuredClone(scene)] }); }
  }
  const { scenes: _oldScenesValue, authoring: _oldAuthoring, revision: _oldRevision, ...oldSettings } = oldBaseline;
  const { scenes: _currentScenesValue, authoring: _currentAuthoring, revision: _currentRevision, ...currentSettings } = current;
  const { scenes: _generatedScenesValue, authoring: _generatedAuthoring, revision: _generatedRevision, ...generatedSettings } = draft;
  Object.assign(draft, mergeManualSettings(oldSettings, currentSettings, generatedSettings, { sceneId: current.entrySceneId, entityId: "@document" }, conflicts));
  const document = anyGameDocument.parse({ ...draft, revision: current.revision, authoring: { ...candidate.authoring, overrides: current.authoring.overrides, suppressions: current.authoring.suppressions, detached: current.authoring.detached } });
  const changedEntityIds = [...entities(document)].filter(([key, value]) => !same(value.entity, previous.get(key)?.entity)).map(([, value]) => value.entity.id);
  const finalEntities = entities(document);
  for (const [key, value] of previous) { if (!finalEntities.has(key)) { changedEntityIds.push(value.entity.id); } }
  return { document, conflicts, changedEntityIds: [...new Set(changedEntityIds)] };
}

/** Reset overrides to generated values or detach an authored entity from its generator. */
export function applyGameAuthoringOperation(document: AnyGameDocument, op: { readonly op: "reset_override" | "detach_entity"; readonly entity_id: string; readonly scene_id?: string; readonly path?: readonly string[] }): AnyGameDocument {
  if (!document.authoring) { throw new Error("Game has no retained authoring"); }
  const nativeBaseline = gameAuthoringBaseline(document);
  const searchDocument = op.op === "reset_override" ? nativeBaseline : document;
  const matches = searchDocument.scenes.filter((scene) => !op.scene_id || scene.id === op.scene_id).flatMap((scene) => scene.entities.filter((entity) => entity.id === op.entity_id).map((entity) => ({ sceneId: scene.id, entity })));
  if (matches.length !== 1) { throw new Error("Authoring operation requires one existing entity"); }
  const target = { sceneId: matches[0].sceneId, entityId: op.entity_id };
  const key = keyOf(target);
  const draft = structuredClone(document);
  const authoring = draft.authoring;
  if (!authoring) { throw new Error("Game has no retained authoring"); }
  const retained = authoring.overrides.filter((override) => keyOf(override) !== key || (op.path !== undefined && !same(override.path, op.path)));
  if (op.op === "detach_entity") {
    authoring.detached = [...authoring.detached.filter((entry) => keyOf(entry) !== key), target];
    authoring.overrides = authoring.overrides.filter((override) => keyOf(override) !== key);
    authoring.suppressions = authoring.suppressions.filter((entry) => keyOf(entry) !== key);
  } else {
    const baseline = entities(gameAuthoringBaseline(document)).get(key);
    if (!baseline) { throw new Error("Entity has no generated baseline"); }
    let value: unknown = baseline.entity;
    for (const override of retained.filter((entry) => keyOf(entry) === key)) { value = patch(value, override); }
    const scene = draft.scenes.find((entry) => entry.id === target.sceneId);
    if (scene) {
      const present = scene.entities.some((entity) => entity.id === target.entityId);
      Object.assign(scene, { entities: present ? scene.entities.map((entity) => entity.id === target.entityId ? value : entity) : [...scene.entities, value] });
    } else {
      const originalScene = nativeBaseline.scenes.find((entry) => entry.id === target.sceneId);
      if (originalScene) { Object.assign(draft, { scenes: [...draft.scenes, { ...originalScene, entities: [value] }] }); }
    }
    authoring.suppressions = authoring.suppressions.filter((entry) => keyOf(entry) !== key);
    authoring.overrides = retained;
  }
  return anyGameDocument.parse(draft);
}
