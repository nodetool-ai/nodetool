import { z } from "zod";
import {
  gameAssetBinding,
  gameBackgroundLayer,
  gameAudioMixer,
  gameBehavior,
  gameDocument,
  gameEntity,
  gameRenderEffect,
  gameScene,
  type GameDocument,
  type GameEntity
} from "@nodetool-ai/protocol";
import { applyGameOwnershipOperation, authoringMembershipOp, createGameOwnershipDeltaState, overrideMembershipOp, reconcileGameOwnershipDeltas } from "./ownership-ops.js";
import { applyGameAuthoringOperation } from "./authoring-reconcile.js";
import { validateGame, type GameValidationIssue } from "./validate.js";

const id = z.string().min(1);
const index = z.number().int().nonnegative();
const target = { entity_id: id, scene_id: id.optional() };
function preservingPatch<Schema extends z.ZodType>(schema: Schema) {
  return z.custom<z.input<Schema>>().superRefine((value, context) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) { for (const issue of parsed.error.issues) { context.addIssue({ code: "custom", path: issue.path, message: issue.message }); } }
  });
}
const entitySet = preservingPatch(gameEntity.partial().extend({
  tags: gameEntity.shape.tags.unwrap().nullable().optional(),
  props: gameEntity.shape.props.unwrap().nullable().optional(),
  id: z.never().optional(),
  transform2d: gameEntity.shape.transform2d.partial().optional(),
  sprite: gameEntity.shape.sprite.unwrap().partial().nullable().optional(),
  tilemap: gameEntity.shape.tilemap.unwrap().partial().nullable().optional(),
  camera2d: gameEntity.shape.camera2d.unwrap().partial().nullable().optional(),
  body2d: gameEntity.shape.body2d.unwrap().partial().nullable().optional(),
  collider2d: gameEntity.shape.collider2d.unwrap().partial().nullable().optional(),
  animator: gameEntity.shape.animator.unwrap().partial().nullable().optional(),
  visualAnimation: gameEntity.shape.visualAnimation.unwrap().partial().nullable().optional(),
  audioSource: gameEntity.shape.audioSource.unwrap().partial().nullable().optional(),
  light2d: gameEntity.shape.light2d.unwrap().partial().nullable().optional(),
  parentId: id.nullable().optional()
}));
const sceneSet = preservingPatch(z.strictObject({ name: gameScene.shape.name.optional(), music: gameScene.shape.music.nullable().optional(),
  gravity: gameScene.shape.gravity.nullable().optional(), backgrounds: z.tuple([]).nullable().optional() }));
const light = gameScene.shape.lighting.unwrap().shape.points.element;
const lightSet = preservingPatch(light.partial());
const backgroundSet = preservingPatch(gameBackgroundLayer.partial());
const behaviorSet = z.record(z.string(), z.unknown());

export const gameDocumentOp = z.discriminatedUnion("op", [
  overrideMembershipOp, authoringMembershipOp,
  z.strictObject({ op: z.literal("reset_override"), ...target, path: z.array(z.string().min(1)).min(1).optional() }),
  z.strictObject({ op: z.literal("detach_entity"), ...target }),
  z.strictObject({ op: z.literal("set_document"), document: gameDocument }),
  z.strictObject({ op: z.literal("add_entity"), scene_id: id, entity: gameEntity.partial().extend({ id }), index: index.optional() }),
  z.strictObject({ op: z.literal("update_entity"), ...target, set: entitySet }),
  z.strictObject({ op: z.literal("remove_entity"), ...target, children: z.enum(["remove", "reparent"]).default("remove") }),
  z.strictObject({ op: z.literal("duplicate_entity"), ...target, new_id: id, offset: z.strictObject({ x: z.number().finite(), y: z.number().finite() }).optional() }),
  z.strictObject({ op: z.literal("move_entity"), ...target, to_index: index }),
  z.strictObject({ op: z.literal("add_behavior"), ...target, index: index.optional(), behavior: gameBehavior }),
  z.strictObject({ op: z.literal("update_behavior"), ...target, index, behavior: behaviorSet }),
  z.strictObject({ op: z.literal("remove_behavior"), ...target, index }),
  z.strictObject({ op: z.literal("move_behavior"), ...target, index, to_index: index }),
  z.strictObject({ op: z.literal("set_script"), ...target, index, source: z.string(), max_commands: z.number().int().optional(), max_tick_ms: z.number().int().optional() }),
  z.strictObject({ op: z.literal("add_scene"), scene_id: id, scene: gameScene.partial().optional(), index: index.optional() }),
  z.strictObject({ op: z.literal("update_scene"), scene_id: id, set: sceneSet }),
  z.strictObject({ op: z.literal("remove_scene"), scene_id: id }),
  z.strictObject({ op: z.literal("set_lighting"), scene_id: id, lighting: gameScene.shape.lighting.nullable() }),
  z.strictObject({ op: z.literal("add_light"), scene_id: id, light, index: index.optional() }),
  z.strictObject({ op: z.literal("update_light"), scene_id: id, index, set: lightSet }),
  z.strictObject({ op: z.literal("remove_light"), scene_id: id, index }),
  z.strictObject({ op: z.literal("add_background"), scene_id: id, background: gameBackgroundLayer, index: index.optional() }),
  z.strictObject({ op: z.literal("update_background"), scene_id: id, id, set: backgroundSet }),
  z.strictObject({ op: z.literal("remove_background"), scene_id: id, id }),
  z.strictObject({ op: z.literal("move_background"), scene_id: id, id, to_index: index }),
  z.strictObject({ op: z.literal("set_effects"), effects: z.array(gameRenderEffect).max(8).nullable(), hud_effect_order: gameDocument.shape.hudEffectOrder.nullable().optional() }),
  z.strictObject({ op: z.literal("set_game"), pixels_per_unit: gameDocument.shape.pixelsPerUnit.optional(), input_actions: gameDocument.shape.inputActions.optional(), entry_scene_id: id.optional(), collision_layers: gameDocument.shape.collisionLayers.nullable().optional() }),
  z.strictObject({ op: z.literal("set_audio"), mixer: gameAudioMixer.nullable() }),
  z.strictObject({ op: z.literal("bind_asset"), slot: id, binding: gameAssetBinding }),
  z.strictObject({ op: z.literal("unbind_asset"), slot: id })
]);
export type GameDocumentOp = z.input<typeof gameDocumentOp>;

export interface GameOpIssue {
  readonly opIndex: number;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export class GameOpError extends Error {
  readonly issues: readonly GameOpIssue[];

  constructor(readonly opIndex: number, readonly path: readonly (string | number)[], message: string, issues?: readonly GameOpIssue[]) {
    super(message);
    this.name = "GameOpError";
    this.issues = issues ?? [{ opIndex, path, message }];
  }
}

function fail(opIndex: number, path: readonly (string | number)[], message: string): never {
  throw new GameOpError(opIndex, path, message);
}

function pathOf(path: readonly PropertyKey[]): (string | number)[] {
  return path.map((part) => typeof part === "symbol" ? part.toString() : part);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isRecord(base) || !isRecord(patch)) { return patch; }
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) result[key] = deepMerge(base[key], value);
  return result;
}

function findScene(document: GameDocument, sceneId: string, opIndex: number) {
  const sceneIndex = document.scenes.findIndex((scene) => scene.id === sceneId);
  if (sceneIndex < 0) fail(opIndex, ["scenes"], `Scene ${sceneId} does not exist`);
  return { scene: document.scenes[sceneIndex], sceneIndex };
}

function findEntity(document: GameDocument, indexes: ReadonlyMap<string, Map<string, number>>, entityId: string, sceneId: string | undefined, opIndex: number) {
  const matches: { scene: GameDocument["scenes"][number]; sceneIndex: number; entity: GameEntity; entityIndex: number }[] = [];
  for (const [sceneIndex, scene] of document.scenes.entries()) {
    if (sceneId && scene.id !== sceneId) continue;
    const entityIndex = indexes.get(scene.id)?.get(entityId);
    if (entityIndex === undefined) continue;
    const entity = scene.entities[entityIndex];
    if (entity) matches.push({ scene, sceneIndex, entity, entityIndex });
  }
  if (matches.length === 0) fail(opIndex, ["entity_id"], `Entity ${entityId} does not exist`);
  if (matches.length > 1) fail(opIndex, ["scene_id"], `Entity ${entityId} occurs in multiple scenes; specify scene_id`);
  return matches[0];
}

function indexEntities(scene: GameDocument["scenes"][number]): Map<string, number> {
  return new Map(scene.entities.map((entity, index) => [entity.id, index]));
}

function atIndex<T>(items: T[], value: T, position: number | undefined, opIndex: number, path: readonly (string | number)[]): void {
  const next = position ?? items.length;
  if (next > items.length) fail(opIndex, path, `Index ${next} is out of range`);
  items.splice(next, 0, value);
}

function existingIndex<T>(items: readonly T[], position: number, opIndex: number, path: readonly (string | number)[]): number {
  if (position >= items.length) fail(opIndex, path, `Index ${position} is out of range`);
  return position;
}

function responsibleOpIndex(document: GameDocument, ops: readonly GameDocumentOp[], issue: GameValidationIssue): number {
  const [head, position, section, entityPosition] = issue.path;
  const scene = head === "scenes" && typeof position === "number" ? document.scenes[position] : undefined;
  const entity = section === "entities" && typeof entityPosition === "number" ? scene?.entities[entityPosition] : undefined;
  for (let index = ops.length - 1; index >= 0; index -= 1) {
    const op = ops[index];
    if (op.op === "set_document") { return index; }
    if (entity && (("entity_id" in op && op.entity_id === entity.id) ||
      (op.op === "add_entity" && op.entity.id === entity.id) ||
      (op.op === "duplicate_entity" && op.new_id === entity.id))) return index;
    if (scene && "scene_id" in op && op.scene_id === scene.id) { return index; }
    if (head === "assets" && "slot" in op && op.slot === position) { return index; }
    if (head === "renderEffects" && op.op === "set_effects") { return index; }
    if (head === "audio" && op.op === "set_audio") { return index; }
    if ((head === "entrySceneId" || head === "pixelsPerUnit" || head === "inputActions" || head === "collisionLayers") && op.op === "set_game") { return index; }
  }
  return Math.max(0, ops.length - 1);
}

function referencesAsset(document: GameDocument, slot: string): boolean {
  if (document.renderEffects?.some((effect) => effect.kind === "lut" && effect.assetId === slot)) { return true; }
  if (document.audio?.mixer && slot in document.audio.mixer.assetBuses) { return true; }
  return document.scenes.some((scene) => scene.music?.assetId === slot ||
    scene.backgrounds?.some((background) => background.assetId === slot) ||
    scene.entities.some((entity) => entity.sprite?.assetId === slot || entity.tilemap?.assetId === slot || entity.audioSource?.assetId === slot));
}

/** Applies a complete ordered edit atomically. The input document is never mutated. */
export function applyGameOps(document: GameDocument, ops: readonly GameDocumentOp[]): GameDocument {
  let draft = structuredClone(document);
  const ownershipDeltas = createGameOwnershipDeltaState(fail);
  const entityIndexesByScene = new Map(draft.scenes.map((scene) => [scene.id, indexEntities(scene)]));
  for (const [opIndex, input] of ops.entries()) {
    const parsed = gameDocumentOp.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({ opIndex, path: pathOf(issue.path), message: issue.message }));
      const first = issues[0];
      throw new GameOpError(first.opIndex, first.path, first.message, issues);
    }
    const op = parsed.data;
    switch (op.op) {
      case "set_override_membership":
      case "set_authoring_membership": { applyGameOwnershipOperation(draft, op, ownershipDeltas, opIndex); break; }
      case "reset_override":
      case "detach_entity": { draft = gameDocument.parse(applyGameAuthoringOperation(draft, op)); break; }
      case "set_document": {
        draft = { ...op.document, id: document.id, revision: document.revision };
        entityIndexesByScene.clear();
        for (const scene of draft.scenes) {
          entityIndexesByScene.set(scene.id, indexEntities(scene));
        }
        break;
      }
      case "add_entity": {
        const { scene, sceneIndex } = findScene(draft, op.scene_id, opIndex);
        if (entityIndexesByScene.get(scene.id)?.has(op.entity.id)) fail(opIndex, ["scenes", sceneIndex, "entities"], `Entity ${op.entity.id} already exists`);
        const entity = gameEntity.safeParse({ name: "", templateOnly: false, transform2d: { x: 0, y: 0 }, behaviors: [], ...op.entity });
        if (!entity.success) { fail(opIndex, ["entity", ...pathOf(entity.error.issues[0].path)], entity.error.issues[0].message); }
        atIndex(scene.entities, entity.data, op.index, opIndex, ["index"]);
        if (op.index === undefined) entityIndexesByScene.get(scene.id)?.set(entity.data.id, scene.entities.length - 1);
        else entityIndexesByScene.set(scene.id, indexEntities(scene));
        break;
      }
      case "update_entity": {
        const { scene, entity, entityIndex } = findEntity(draft, entityIndexesByScene, op.entity_id, op.scene_id, opIndex);
        const merged = deepMerge(entity, op.set);
        if (!isRecord(merged)) { fail(opIndex, ["set"], "Entity update must be an object"); }
        for (const key of ["tags", "props"] as const) {
          if (op.set[key] === null) { delete merged[key]; }
          else if (op.set[key] !== undefined) { merged[key] = structuredClone(op.set[key]); }
        }
        for (const key of ["sprite", "tilemap", "camera2d", "body2d", "collider2d", "animator", "visualAnimation", "audioSource", "light2d", "parentId"] as const) {
          if (merged[key] === null) { delete merged[key]; }
        }
        const next = gameEntity.safeParse(merged);
        if (!next.success) { fail(opIndex, ["set", ...pathOf(next.error.issues[0].path)], next.error.issues[0].message); }
        if (next.data.id !== entity.id && entityIndexesByScene.get(scene.id)?.has(next.data.id)) fail(opIndex, ["set", "id"], `Entity ${next.data.id} already exists`);
        scene.entities[entityIndex] = next.data;
        if (next.data.id !== entity.id) {
          entityIndexesByScene.get(scene.id)?.delete(entity.id);
          entityIndexesByScene.get(scene.id)?.set(next.data.id, entityIndex);
        }
        break;
      }
      case "remove_entity": {
        const { scene, sceneIndex, entity, entityIndex } = findEntity(draft, entityIndexesByScene, op.entity_id, op.scene_id, opIndex);
        const removed = new Set([entity.id]);
        if (op.children === "remove") {
          let changed = true;
          while (changed) {
            changed = false;
            for (const child of scene.entities) if (child.parentId && removed.has(child.parentId) && !removed.has(child.id)) { removed.add(child.id); changed = true; }
          }
        }
        for (const candidate of scene.entities) for (const behavior of candidate.behaviors) {
          if (behavior.kind === "spawn" && removed.has(behavior.prefabId) && !removed.has(candidate.id)) fail(opIndex, ["scenes", sceneIndex, "entities", entityIndex], `Behavior on ${candidate.id} still references ${behavior.prefabId}`);
        }
        if (op.children === "reparent") for (const child of scene.entities) if (child.parentId === entity.id) {
          if (entity.parentId) { child.parentId = entity.parentId; }
          else { delete child.parentId; }
        }
        scene.entities = scene.entities.filter((candidate) => !removed.has(candidate.id));
        entityIndexesByScene.set(scene.id, indexEntities(scene));
        break;
      }
      case "duplicate_entity": {
        const { scene, entity, entityIndex } = findEntity(draft, entityIndexesByScene, op.entity_id, op.scene_id, opIndex);
        if (entityIndexesByScene.get(scene.id)?.has(op.new_id)) fail(opIndex, ["new_id"], `Entity ${op.new_id} already exists`);
        const copy: GameEntity = { ...structuredClone(entity), id: op.new_id,
          transform2d: { ...entity.transform2d, x: entity.transform2d.x + (op.offset?.x ?? 0), y: entity.transform2d.y + (op.offset?.y ?? 0) } };
        scene.entities.splice(entityIndex + 1, 0, copy);
        entityIndexesByScene.set(scene.id, indexEntities(scene));
        break;
      }
      case "move_entity": {
        const { scene, entityIndex } = findEntity(draft, entityIndexesByScene, op.entity_id, op.scene_id, opIndex);
        existingIndex(scene.entities, op.to_index, opIndex, ["to_index"]);
        const [entity] = scene.entities.splice(entityIndex, 1);
        scene.entities.splice(op.to_index, 0, entity);
        entityIndexesByScene.set(scene.id, indexEntities(scene));
        break;
      }
      case "add_behavior": {
        const { entity } = findEntity(draft, entityIndexesByScene, op.entity_id, op.scene_id, opIndex);
        atIndex(entity.behaviors, op.behavior, op.index, opIndex, ["index"]);
        break;
      }
      case "update_behavior": {
        const { entity } = findEntity(draft, entityIndexesByScene, op.entity_id, op.scene_id, opIndex);
        existingIndex(entity.behaviors, op.index, opIndex, ["index"]);
        const next = gameBehavior.safeParse({ ...entity.behaviors[op.index], ...op.behavior });
        if (!next.success) { fail(opIndex, ["behavior", ...pathOf(next.error.issues[0].path)], next.error.issues[0].message); }
        entity.behaviors[op.index] = next.data;
        break;
      }
      case "remove_behavior": {
        const { entity } = findEntity(draft, entityIndexesByScene, op.entity_id, op.scene_id, opIndex);
        existingIndex(entity.behaviors, op.index, opIndex, ["index"]);
        entity.behaviors.splice(op.index, 1);
        break;
      }
      case "move_behavior": {
        const { entity } = findEntity(draft, entityIndexesByScene, op.entity_id, op.scene_id, opIndex);
        existingIndex(entity.behaviors, op.index, opIndex, ["index"]);
        existingIndex(entity.behaviors, op.to_index, opIndex, ["to_index"]);
        const [behavior] = entity.behaviors.splice(op.index, 1);
        entity.behaviors.splice(op.to_index, 0, behavior);
        break;
      }
      case "set_script": {
        const { entity } = findEntity(draft, entityIndexesByScene, op.entity_id, op.scene_id, opIndex);
        existingIndex(entity.behaviors, op.index, opIndex, ["index"]);
        const behavior = entity.behaviors[op.index];
        if (behavior.kind !== "script") { fail(opIndex, ["index"], "Behavior is not a script"); }
        const next = gameBehavior.safeParse({ ...behavior, source: op.source, maxCommands: op.max_commands ?? behavior.maxCommands, maxTickMs: op.max_tick_ms ?? behavior.maxTickMs });
        if (!next.success) { fail(opIndex, ["source", ...pathOf(next.error.issues[0].path)], next.error.issues[0].message); }
        entity.behaviors[op.index] = next.data;
        break;
      }
      case "add_scene": {
        if (draft.scenes.some((scene) => scene.id === op.scene_id)) fail(opIndex, ["scene_id"], `Scene ${op.scene_id} already exists`);
        const scene = gameScene.safeParse({ name: op.scene_id, entities: [], ...op.scene, id: op.scene_id });
        if (!scene.success) { fail(opIndex, ["scene", ...pathOf(scene.error.issues[0].path)], scene.error.issues[0].message); }
        atIndex(draft.scenes, scene.data, op.index, opIndex, ["index"]);
        entityIndexesByScene.set(scene.data.id, indexEntities(scene.data));
        break;
      }
      case "update_scene": {
        const { scene, sceneIndex } = findScene(draft, op.scene_id, opIndex);
        const { backgrounds, ...set } = op.set;
        const candidate = { ...scene, ...set, music: op.set.music === null ? undefined : op.set.music ?? scene.music,
          gravity: op.set.gravity === null ? undefined : op.set.gravity ?? scene.gravity };
        if (backgrounds === null) { delete candidate.backgrounds; }
        else if (backgrounds !== undefined) { candidate.backgrounds = []; }
        const next = gameScene.safeParse(candidate);
        if (!next.success) { fail(opIndex, ["set", ...pathOf(next.error.issues[0].path)], next.error.issues[0].message); }
        draft.scenes[sceneIndex] = next.data;
        break;
      }
      case "remove_scene": {
        const { sceneIndex } = findScene(draft, op.scene_id, opIndex);
        if (draft.scenes.length === 1) { fail(opIndex, ["scene_id"], "Cannot remove the last scene"); }
        for (const scene of draft.scenes) for (const entity of scene.entities) for (const behavior of entity.behaviors) {
          if (behavior.kind === "sceneTransition" && behavior.sceneId === op.scene_id) fail(opIndex, ["scene_id"], `Transition on ${entity.id} still references ${op.scene_id}`);
        }
        draft.scenes.splice(sceneIndex, 1);
        entityIndexesByScene.delete(op.scene_id);
        break;
      }
      case "set_lighting": {
        const { scene } = findScene(draft, op.scene_id, opIndex);
        if (op.lighting === null) { delete scene.lighting; }
        else { scene.lighting = op.lighting; }
        break;
      }
      case "add_light": {
        const { scene } = findScene(draft, op.scene_id, opIndex);
        if (!scene.lighting) { fail(opIndex, ["lighting"], "Scene has no lighting"); }
        atIndex(scene.lighting.points, op.light, op.index, opIndex, ["index"]);
        break;
      }
      case "update_light": {
        const { scene } = findScene(draft, op.scene_id, opIndex);
        if (!scene.lighting) { fail(opIndex, ["lighting"], "Scene has no lighting"); }
        existingIndex(scene.lighting.points, op.index, opIndex, ["index"]);
        const next = light.safeParse({ ...scene.lighting.points[op.index], ...op.set });
        if (!next.success) { fail(opIndex, ["set", ...pathOf(next.error.issues[0].path)], next.error.issues[0].message); }
        scene.lighting.points[op.index] = next.data;
        break;
      }
      case "remove_light": {
        const { scene } = findScene(draft, op.scene_id, opIndex);
        if (!scene.lighting) { fail(opIndex, ["lighting"], "Scene has no lighting"); }
        existingIndex(scene.lighting.points, op.index, opIndex, ["index"]);
        scene.lighting.points.splice(op.index, 1);
        break;
      }
      case "add_background": {
        const { scene } = findScene(draft, op.scene_id, opIndex);
        const backgrounds = scene.backgrounds ?? (scene.backgrounds = []);
        if (backgrounds.some((background) => background.id === op.background.id)) fail(opIndex, ["background", "id"], `Background ${op.background.id} already exists`);
        atIndex(backgrounds, op.background, op.index, opIndex, ["index"]);
        break;
      }
      case "update_background": {
        const { scene } = findScene(draft, op.scene_id, opIndex);
        const backgroundIndex = scene.backgrounds?.findIndex((background) => background.id === op.id) ?? -1;
        if (backgroundIndex < 0 || !scene.backgrounds) fail(opIndex, ["id"], `Background ${op.id} does not exist`);
        const next = gameBackgroundLayer.safeParse({ ...scene.backgrounds[backgroundIndex], ...op.set });
        if (!next.success) { fail(opIndex, ["set", ...pathOf(next.error.issues[0].path)], next.error.issues[0].message); }
        if (next.data.id !== op.id && scene.backgrounds.some((background) => background.id === next.data.id)) fail(opIndex, ["set", "id"], `Background ${next.data.id} already exists`);
        scene.backgrounds[backgroundIndex] = next.data;
        break;
      }
      case "remove_background": {
        const { scene } = findScene(draft, op.scene_id, opIndex);
        const backgroundIndex = scene.backgrounds?.findIndex((background) => background.id === op.id) ?? -1;
        if (backgroundIndex < 0 || !scene.backgrounds) fail(opIndex, ["id"], `Background ${op.id} does not exist`);
        scene.backgrounds.splice(backgroundIndex, 1);
        break;
      }
      case "move_background": {
        const { scene } = findScene(draft, op.scene_id, opIndex);
        const backgrounds = scene.backgrounds ?? [];
        const backgroundIndex = backgrounds.findIndex((background) => background.id === op.id);
        if (backgroundIndex < 0) fail(opIndex, ["id"], `Background ${op.id} does not exist`);
        existingIndex(backgrounds, op.to_index, opIndex, ["to_index"]);
        const [background] = backgrounds.splice(backgroundIndex, 1);
        backgrounds.splice(op.to_index, 0, background);
        break;
      }
      case "set_effects": {
        if (op.effects === null) { delete draft.renderEffects; }
        else { draft.renderEffects = op.effects; }
        if (op.hud_effect_order === null) { delete draft.hudEffectOrder; }
        else if (op.hud_effect_order) { draft.hudEffectOrder = op.hud_effect_order; }
        break;
      }
      case "set_game": {
        if (op.pixels_per_unit !== undefined) { draft.pixelsPerUnit = op.pixels_per_unit; }
        if (op.input_actions !== undefined) { draft.inputActions = op.input_actions; }
        if (op.entry_scene_id !== undefined) { draft.entrySceneId = op.entry_scene_id; }
        if (op.collision_layers === null) { delete draft.collisionLayers; }
        else if (op.collision_layers !== undefined) { draft.collisionLayers = op.collision_layers; }
        break;
      }
      case "set_audio": {
        if (op.mixer === null) { delete draft.audio; }
        else { draft.audio = { ...draft.audio, mixer: op.mixer }; }
        break;
      }
      case "bind_asset": draft.assets[op.slot] = op.binding; break;
      case "unbind_asset": {
        if (!(op.slot in draft.assets)) fail(opIndex, ["slot"], `Asset slot ${op.slot} does not exist`);
        if (referencesAsset(draft, op.slot)) fail(opIndex, ["slot"], `Asset slot ${op.slot} is still referenced`);
        delete draft.assets[op.slot];
        break;
      }
    }
  }
  draft = gameDocument.parse(reconcileGameOwnershipDeltas(document, draft, ownershipDeltas));
  const result = validateGame(draft);
  if (!result.valid || !result.document) {
    const issues = result.issues.map((issue) => ({ opIndex: responsibleOpIndex(draft, ops, issue), path: issue.path, message: issue.message }));
    const first = issues[0];
    throw new GameOpError(first.opIndex, first.path, first.message, issues);
  }
  return result.document;
}
