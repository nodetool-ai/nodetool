import { z } from "zod";
import {
  gameAnimationGraph3D, gameAssetBinding3D, gameBehavior3D, gameBody3D, gameCamera3D, gameCollider3D, gameDocument3D,
  gameEntity3D, gameLight3D, gamePrefab3D, gameScene3D, gameTransform3D, gameVector3,
  type AnyGameDocument, type GameDocument, type GameDocument3D, type GameEntity3D, type GamePrefab3D, type GameTransform3D
} from "@nodetool-ai/protocol";
import { applyGameOwnershipOperation, authoringMembershipOp, createGameOwnershipDeltaState, overrideMembershipOp, reconcileGameOwnershipDeltas } from "./ownership-ops.js";
import { applyGameAuthoringOperation } from "./authoring-reconcile.js";
import { applyGameOps, gameDocumentOp, GameOpError, type GameDocumentOp } from "./document-ops.js";
import { validateGame3D } from "./validate3d.js";

const id = z.string().min(1);
const index = z.number().int().nonnegative();
const target = { entity_id: id, scene_id: id.optional() };
function preservingPatch<Schema extends z.ZodType>(schema: Schema) {
  return z.custom<z.input<Schema>>().superRefine((value, context) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) { for (const issue of parsed.error.issues) { context.addIssue({ code: "custom", path: issue.path, message: issue.message }); } }
  });
}
const entitySet = preservingPatch(gameEntity3D.partial().extend({
  tags: gameEntity3D.shape.tags.unwrap().nullable().optional(),
  props: gameEntity3D.shape.props.unwrap().nullable().optional(),
  id: z.never().optional(),
  parentId: id.nullable().optional(),
  transform3d: gameTransform3D.partial().extend({ position: gameVector3.partial().optional(), scale: gameTransform3D.shape.scale.unwrap().partial().optional() }).optional(),
  primitive: gameEntity3D.shape.primitive.unwrap().partial().nullable().optional(),
  model: gameEntity3D.shape.model.unwrap().partial().nullable().optional(),
  body3d: z.union(gameBody3D.options.map((schema) => schema.partial())).nullable().optional(),
  collider3d: z.union(gameCollider3D.options.map((schema) => schema.partial())).nullable().optional(),
  character3d: gameEntity3D.shape.character3d.unwrap().partial().nullable().optional(),
  camera3d: gameCamera3D.partial().nullable().optional(),
  light3d: z.union(gameLight3D.options.map((schema) => schema.partial())).nullable().optional(),
  animator3d: gameEntity3D.shape.animator3d.unwrap().partial().extend({ graph: id.nullable().optional() }).nullable().optional(),
  interactionActor: gameEntity3D.shape.interactionActor.unwrap().partial().nullable().optional(),
  audioSource: gameEntity3D.shape.audioSource.unwrap().partial().nullable().optional()
}));
export const gameDocumentOp3D = z.discriminatedUnion("op", [
  overrideMembershipOp, authoringMembershipOp,
  z.strictObject({ op: z.literal("reset_override"), ...target, path: z.array(z.string().min(1)).min(1).optional() }),
  z.strictObject({ op: z.literal("detach_entity"), ...target }),
  z.strictObject({ op: z.literal("set_document"), document: gameDocument3D }),
  z.strictObject({ op: z.literal("add_entity"), scene_id: id, entity: gameEntity3D.partial().extend({ id }), index: index.optional() }),
  z.strictObject({ op: z.literal("update_entity"), ...target, set: entitySet }),
  z.strictObject({ op: z.literal("remove_entity"), ...target }),
  z.strictObject({ op: z.literal("duplicate_entity"), ...target, new_id: id, offset: gameVector3.optional() }),
  z.strictObject({ op: z.literal("move_entity"), ...target, to_index: index }),
  z.strictObject({ op: z.literal("add_behavior"), ...target, behavior: gameBehavior3D, index: index.optional() }),
  z.strictObject({ op: z.literal("update_behavior"), ...target, index, behavior: z.record(z.string(), z.unknown()) }),
  z.strictObject({ op: z.literal("remove_behavior"), ...target, index }),
  z.strictObject({ op: z.literal("set_script"), ...target, index, source: z.string(), max_commands: z.number().int().optional(), max_tick_ms: z.number().int().optional() }),
  z.strictObject({ op: z.literal("add_scene"), scene_id: id, scene: gameScene3D.partial(), index: index.optional() }),
  z.strictObject({ op: z.literal("update_scene"), scene_id: id, set: preservingPatch(gameScene3D.omit({ id: true, entities: true }).partial()
    .extend({ music: gameScene3D.shape.music.nullable().optional() })) }),
  z.strictObject({ op: z.literal("remove_scene"), scene_id: id }),
  z.strictObject({ op: z.literal("set_prefab"), prefab_id: id, prefab: gamePrefab3D }),
  z.strictObject({ op: z.literal("remove_prefab"), prefab_id: id }),
  z.strictObject({ op: z.literal("instantiate_prefab"), scene_id: id, prefab_id: id, instance_id: id, transform: gameTransform3D.optional() }),
  z.strictObject({ op: z.literal("set_game"), presentation: preservingPatch(gameDocument3D.shape.presentation.partial()).optional(), input_actions: gameDocument3D.shape.inputActions.optional(), input_axes: gameDocument3D.shape.inputAxes.optional(), entry_scene_id: id.optional(), collision_layers: gameDocument3D.shape.collisionLayers.nullable().optional() }),
  z.strictObject({ op: z.literal("bind_asset"), slot: id, binding: gameAssetBinding3D }),
  z.strictObject({ op: z.literal("unbind_asset"), slot: id }),
  z.strictObject({ op: z.literal("set_animation_graph"), graph_id: id, graph: gameAnimationGraph3D }),
  z.strictObject({ op: z.literal("remove_animation_graph"), graph_id: id })
]);
export type GameDocumentOp3D = z.input<typeof gameDocumentOp3D>;

function pathOf(path: readonly PropertyKey[]): (string | number)[] {
  return path.map((part) => typeof part === "symbol" ? part.toString() : part);
}
function fail(opIndex: number, path: (string | number)[], message: string): never {
  throw new GameOpError(opIndex, path, message);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function merge(base: unknown, patch: unknown): unknown {
  if (!isRecord(base) || !isRecord(patch)) { return patch; }
  if (patch.kind !== undefined && base.kind !== patch.kind || patch.type !== undefined && base.type !== patch.type) { return patch; }
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) { delete result[key]; }
    else { result[key] = merge(base[key], value); }
  }
  return result;
}
function insert<T>(values: T[], value: T, at: number | undefined, opIndex: number): void {
  const selected = at ?? values.length;
  if (selected > values.length) { fail(opIndex, ["index"], "Index is out of range"); }
  values.splice(selected, 0, value);
}
function descendants(entities: readonly GameEntity3D[], rootId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const entity of entities) {
    if (entity.parentId) {
      const list = children.get(entity.parentId) ?? [];
      list.push(entity.id);
      children.set(entity.parentId, list);
    }
  }
  const result = new Set<string>();
  const queue = [rootId];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const next = queue[cursor];
    if (result.has(next)) { continue; }
    result.add(next);
    queue.push(...children.get(next) ?? []);
  }
  return result;
}

export interface InstantiatedPrefab3D {
  readonly rootId: string;
  readonly mapping: Readonly<Record<string, string>>;
  readonly entities: readonly GameEntity3D[];
}

/** Clone only definitions and remap each internal entity reference together. */
export function instantiateGamePrefab3D(prefab: GamePrefab3D, instanceId: string, transform?: GameTransform3D): InstantiatedPrefab3D {
  const mapping: Record<string, string> = {};
  for (const entity of prefab.entities) { mapping[entity.id] = entity.id === prefab.rootId ? instanceId : `${instanceId}/${entity.id}`; }
  const entities = prefab.entities.map((definition) => {
    const entity = structuredClone(definition);
    entity.id = mapping[definition.id];
    if (entity.parentId) { entity.parentId = mapping[entity.parentId] ?? entity.parentId; }
    if (entity.camera3d?.behavior.kind === "follow") {
      entity.camera3d.behavior.targetId = mapping[entity.camera3d.behavior.targetId] ?? entity.camera3d.behavior.targetId;
    }
    if (definition.id === prefab.rootId && transform) { entity.transform3d = structuredClone(transform); }
    return entity;
  });
  return { rootId: instanceId, mapping, entities };
}

/** Every edit batch is validated on a private clone before returning a draft. */
export function applyGameOps3D(document: GameDocument3D, values: readonly GameDocumentOp3D[], options?: { readonly expectedRevision?: string }): GameDocument3D {
  if (options?.expectedRevision !== undefined && options.expectedRevision !== document.revision) {
    fail(0, ["revision"], `Stale game revision ${options.expectedRevision}`);
  }
  let draft = structuredClone(document);
  const ownershipDeltas = createGameOwnershipDeltaState(fail);
  const findScene = (sceneId: string, opIndex: number) => {
    const scene = draft.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) { fail(opIndex, ["scene_id"], `Scene ${sceneId} does not exist`); }
    return scene;
  };
  const findEntity = (entityId: string, sceneId: string | undefined, opIndex: number) => {
    const matches = draft.scenes.filter((scene) => !sceneId || scene.id === sceneId).flatMap((scene) =>
      scene.entities.filter((entity) => entity.id === entityId).map((entity) => ({ scene, entity })));
    if (matches.length === 0) { fail(opIndex, ["entity_id"], `Entity ${entityId} does not exist`); }
    if (matches.length > 1) { fail(opIndex, ["scene_id"], `Entity ${entityId} occurs in multiple scenes; specify scene_id`); }
    return matches[0];
  };
  for (const [opIndex, value] of values.entries()) {
    const parsed = gameDocumentOp3D.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail(opIndex, pathOf(issue.path), issue.message);
    }
    const op = parsed.data;
    switch (op.op) {
      case "set_override_membership":
      case "set_authoring_membership": { applyGameOwnershipOperation(draft, op, ownershipDeltas, opIndex); break; }
      case "reset_override":
      case "detach_entity": { draft = gameDocument3D.parse(applyGameAuthoringOperation(draft, op)); break; }
      case "set_document": draft = { ...op.document, id: document.id, revision: document.revision }; break;
      case "add_entity": {
        const scene = findScene(op.scene_id, opIndex);
        if (scene.entities.some((entity) => entity.id === op.entity.id)) { fail(opIndex, ["entity", "id"], "Entity already exists"); }
        const entity = gameEntity3D.parse({ transform3d: {}, ...op.entity });
        insert(scene.entities, entity, op.index, opIndex);
        break;
      }
      case "update_entity": {
        const { scene, entity } = findEntity(op.entity_id, op.scene_id, opIndex);
        const merged = merge(entity, op.set);
        if (!isRecord(merged)) { fail(opIndex, ["set"], "Entity update must be an object"); }
        for (const key of ["tags", "props"] as const) {
          if (op.set[key] === null) { delete merged[key]; }
          else if (op.set[key] !== undefined) { merged[key] = structuredClone(op.set[key]); }
        }
        const next = gameEntity3D.safeParse(merged);
        if (!next.success) { const issue = next.error.issues[0]; fail(opIndex, ["set", ...pathOf(issue.path)], issue.message); }
        scene.entities[scene.entities.indexOf(entity)] = next.data;
        break;
      }
      case "remove_entity": {
        const { scene, entity } = findEntity(op.entity_id, op.scene_id, opIndex);
        const removed = descendants(scene.entities, entity.id);
        scene.entities = scene.entities.filter((candidate) => !removed.has(candidate.id));
        break;
      }
      case "duplicate_entity": {
        const { scene, entity } = findEntity(op.entity_id, op.scene_id, opIndex);
        const ids = descendants(scene.entities, entity.id);
        const prefab: GamePrefab3D = { rootId: entity.id, entities: scene.entities.filter((candidate) => ids.has(candidate.id)).map((candidate) => {
          const copy = structuredClone(candidate);
          if (copy.id === entity.id) { delete copy.parentId; }
          return copy;
        }), externalAssets: [], externalScenes: [] };
        const copy = instantiateGamePrefab3D(prefab, op.new_id);
        const existingIds = new Set(scene.entities.map((existing) => existing.id));
        if (copy.entities.some((candidate) => existingIds.has(candidate.id))) { fail(opIndex, ["new_id"], "Duplicated entity ID already exists"); }
        const root = copy.entities.find((candidate) => candidate.id === copy.rootId);
        if (root) {
          if (entity.parentId) { root.parentId = entity.parentId; }
          if (op.offset) {
            root.transform3d.position.x += op.offset.x; root.transform3d.position.y += op.offset.y; root.transform3d.position.z += op.offset.z;
          }
        }
        scene.entities.push(...copy.entities);
        break;
      }
      case "move_entity": {
        const { scene, entity } = findEntity(op.entity_id, op.scene_id, opIndex);
        if (op.to_index >= scene.entities.length) { fail(opIndex, ["to_index"], "Index is out of range"); }
        scene.entities.splice(scene.entities.indexOf(entity), 1);
        scene.entities.splice(op.to_index, 0, entity);
        break;
      }
      case "add_behavior": { const { entity } = findEntity(op.entity_id, op.scene_id, opIndex); insert(entity.behaviors, op.behavior, op.index, opIndex); break; }
      case "update_behavior":
      case "remove_behavior":
      case "set_script": {
        const { entity } = findEntity(op.entity_id, op.scene_id, opIndex);
        const previous = entity.behaviors[op.index];
        if (!previous) { fail(opIndex, ["index"], "Behavior index is out of range"); }
        if (op.op === "remove_behavior") { entity.behaviors.splice(op.index, 1); break; }
        if (op.op === "set_script" && previous.kind !== "script") { fail(opIndex, ["index"], "Behavior is not a script"); }
        let patch: Record<string, unknown>;
        if (op.op === "update_behavior") { patch = op.behavior; }
        else {
          patch = { source: op.source };
          if (op.max_commands !== undefined) { patch.maxCommands = op.max_commands; }
          if (op.max_tick_ms !== undefined) { patch.maxTickMs = op.max_tick_ms; }
        }
        const next = gameBehavior3D.safeParse(merge(previous, patch));
        if (!next.success) { const issue = next.error.issues[0]; fail(opIndex, ["behavior", ...pathOf(issue.path)], issue.message); }
        entity.behaviors[op.index] = next.data;
        break;
      }
      case "add_scene": {
        if (draft.scenes.some((scene) => scene.id === op.scene_id)) { fail(opIndex, ["scene_id"], "Scene already exists"); }
        const scene = gameScene3D.safeParse({ name: op.scene_id, entities: [], ...op.scene, id: op.scene_id });
        if (!scene.success) { const issue = scene.error.issues[0]; fail(opIndex, ["scene", ...pathOf(issue.path)], issue.message); }
        insert(draft.scenes, scene.data, op.index, opIndex);
        break;
      }
      case "update_scene": {
        const scene = findScene(op.scene_id, opIndex);
        const { music, ...settings } = op.set;
        Object.assign(scene, settings);
        if (music === null) { delete scene.music; }
        else if (music !== undefined) { scene.music = gameScene3D.shape.music.parse(music); }
        break;
      }
      case "remove_scene": {
        findScene(op.scene_id, opIndex);
        draft.scenes = draft.scenes.filter((scene) => scene.id !== op.scene_id);
        break;
      }
      case "set_prefab": draft.prefabs[op.prefab_id] = op.prefab; break;
      case "remove_prefab": {
        if (!draft.prefabs[op.prefab_id]) { fail(opIndex, ["prefab_id"], "Prefab does not exist"); }
        delete draft.prefabs[op.prefab_id]; break;
      }
      case "instantiate_prefab": {
        const scene = findScene(op.scene_id, opIndex);
        const prefab = draft.prefabs[op.prefab_id];
        if (!prefab) { fail(opIndex, ["prefab_id"], "Prefab does not exist"); }
        const result = instantiateGamePrefab3D(prefab, op.instance_id, op.transform);
        const existingIds = new Set(scene.entities.map((existing) => existing.id));
        if (result.entities.some((entity) => existingIds.has(entity.id))) { fail(opIndex, ["instance_id"], "Instance ID already exists"); }
        scene.entities.push(...result.entities); break;
      }
      case "set_game": {
        if (op.presentation) { draft.presentation = { ...draft.presentation, ...op.presentation }; }
        if (op.input_actions) { draft.inputActions = op.input_actions; }
        if (op.input_axes) { draft.inputAxes = op.input_axes; }
        if (op.entry_scene_id) { draft.entrySceneId = op.entry_scene_id; }
        if (op.collision_layers === null) { delete draft.collisionLayers; }
        else if (op.collision_layers !== undefined) { draft.collisionLayers = op.collision_layers; }
        break;
      }
      case "bind_asset": draft.assets[op.slot] = op.binding; break;
      case "unbind_asset": {
        if (!draft.assets[op.slot]) { fail(opIndex, ["slot"], "Asset slot does not exist"); }
        delete draft.assets[op.slot]; break;
      }
      case "set_animation_graph": draft.animationGraphs = { ...draft.animationGraphs, [op.graph_id]: op.graph }; break;
      case "remove_animation_graph": {
        if (!draft.animationGraphs?.[op.graph_id]) { fail(opIndex, ["graph_id"], "Animation graph does not exist"); }
        delete draft.animationGraphs[op.graph_id];
        if (Object.keys(draft.animationGraphs).length === 0) { delete draft.animationGraphs; }
        break;
      }
    }
  }
  draft = gameDocument3D.parse(reconcileGameOwnershipDeltas(document, draft, ownershipDeltas));
  const result = validateGame3D(draft);
  if (!result.valid || !result.document) {
    const issue = result.diagnostics[0];
    throw new GameOpError(Math.max(0, values.length - 1), issue.path, issue.message,
      result.diagnostics.map((diagnostic) => ({ opIndex: Math.max(0, values.length - 1), path: diagnostic.path, message: diagnostic.message })));
  }
  return result.document;
}

const sharedRemoveEntityOp = z.strictObject({ op: z.literal("remove_entity"), ...target,
  children: z.enum(["remove", "reparent"]).optional() });
export const anyGameDocumentOp = z.union([sharedRemoveEntityOp, gameDocumentOp, gameDocumentOp3D]);
export type AnyGameDocumentOp = z.input<typeof anyGameDocumentOp>;
/** The largest op batch one draft save accepts. Larger local batches save the whole document. */
export const MAX_GAME_DRAFT_OPS = 1024;

export function applyAnyGameOps(document: GameDocument, ops: readonly AnyGameDocumentOp[], options?: { readonly expectedRevision?: string }): GameDocument;
export function applyAnyGameOps(document: GameDocument3D, ops: readonly AnyGameDocumentOp[], options?: { readonly expectedRevision?: string }): GameDocument3D;
export function applyAnyGameOps(document: AnyGameDocument, ops: readonly AnyGameDocumentOp[], options?: { readonly expectedRevision?: string }): AnyGameDocument;
export function applyAnyGameOps(document: AnyGameDocument, ops: readonly AnyGameDocumentOp[], options?: { readonly expectedRevision?: string }): AnyGameDocument {
  if (options?.expectedRevision !== undefined && options.expectedRevision !== document.revision) {
    fail(0, ["revision"], `Stale game revision ${options.expectedRevision}`);
  }
  if (document.schemaVersion === 3) {
    const selected = ops.map((op, opIndex) => {
      const parsed = gameDocumentOp3D.safeParse(op);
      if (!parsed.success) { const issue = parsed.error.issues[0]; fail(opIndex, pathOf(issue.path), issue.message); }
      return parsed.data;
    });
    return applyGameOps3D(document, selected, options);
  }
  const selected: GameDocumentOp[] = ops.map((op, opIndex) => {
    const parsed = gameDocumentOp.safeParse(op);
    if (!parsed.success) { const issue = parsed.error.issues[0]; fail(opIndex, pathOf(issue.path), issue.message); }
    return parsed.data;
  });
  return applyGameOps(document, selected);
}
