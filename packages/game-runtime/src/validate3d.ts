import { gameAuthoringBaseline } from "./authoring-reconcile.js";
import {
  gameDocument3D, gameInputBindingIssues, parseGameDocument, type AnyGameDocument, type GameDiagnostic,
  type GameDocument3D, type GameEntity3D, type GamePrefab3D
} from "@nodetool-ai/protocol";
import { validateGame } from "./validate.js";
import { audioMixerReferenceIssues } from "./audio-mixer-references.js";

export interface GameValidationResult3D {
  readonly valid: boolean;
  readonly document?: GameDocument3D;
  readonly diagnostics: readonly GameDiagnostic[];
  readonly issues: readonly GameDiagnostic[];
  readonly errors: readonly string[];
}

/** Structural and semantic validation happens before preparing assets or physics. */
export function validateGame3D(value: unknown): GameValidationResult3D {
  const parsed = gameDocument3D.safeParse(value);
  const diagnostics: GameDiagnostic[] = [];
  const add = (code: string, path: (string | number)[], message: string): void => {
    diagnostics.push({ code, path, message });
  };
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      add("invalid_schema", issue.path.map((part) => typeof part === "symbol" ? part.toString() : part), issue.message);
    }
  } else {
    const document = parsed.data;
    if (document.authoring) {
      try {
        const baseline = gameAuthoringBaseline(document);
        const validatedBaseline = validateGame3D(baseline);
        if (!validatedBaseline.valid) { add("invalid_authoring", ["authoring", "baseline"], validatedBaseline.errors.join(", ")); }
      } catch (error) { add("invalid_authoring", ["authoring"], error instanceof Error ? error.message : "Invalid authoring metadata"); }
    }
    const scenes = new Set<string>();
    for (const [index, scene] of document.scenes.entries()) {
      if (scenes.has(scene.id)) { add("duplicate_scene", ["scenes", index, "id"], `Duplicate scene ${scene.id}`); }
      scenes.add(scene.id);
    }
    if (!scenes.has(document.entrySceneId)) { add("missing_scene", ["entrySceneId"], `Scene ${document.entrySceneId} does not exist`); }
    for (const issue of audioMixerReferenceIssues(document.audio, document.assets, scenes)) { add("invalid_audio_mixer", issue.path, issue.message); }
    for (const key of ["inputActions", "inputAxes", "collisionLayers"] as const) {
      const names = document[key] ?? [];
      if (new Set(names).size !== names.length) { add("duplicate_name", [key], "Names must be unique"); }
    }
    for (const issue of gameInputBindingIssues(document)) { add("missing_input_binding_target", issue.path, issue.message); }
    for (const [slot, asset] of Object.entries(document.assets)) {
      if (asset.mediaKind === "model" || asset.mediaKind === "collider") {
        if (["x", "y", "z"].some((axis) => {
          if (axis === "x") { return asset.bounds.min.x > asset.bounds.max.x; }
          if (axis === "y") { return asset.bounds.min.y > asset.bounds.max.y; }
          return asset.bounds.min.z > asset.bounds.max.z;
        })) { add("invalid_bounds", ["assets", slot, "bounds"], "Minimum bounds must not exceed maximum bounds"); }
      }
      if (asset.mediaKind === "model") {
        if (new Set(asset.nodeIds).size !== asset.nodeIds.length || new Set(asset.clipIds).size !== asset.clipIds.length) {
          add("ambiguous_selector", ["assets", slot], "Prepared node and clip IDs must be unique");
        }
      }
    }

    function validateEntities(entities: readonly GameEntity3D[], path: (string | number)[], prefab?: GamePrefab3D): void {
      const byId = new Map<string, GameEntity3D>();
      for (const [index, entity] of entities.entries()) {
        if (byId.has(entity.id)) { add("duplicate_entity", [...path, index, "id"], `Duplicate entity ${entity.id}`); }
        byId.set(entity.id, entity);
      }
      const visited = new Set<string>();
      for (const [index, entity] of entities.entries()) {
        const entityPath = [...path, index];
        if (entity.parentId && !byId.has(entity.parentId)) {
          add("missing_parent", [...entityPath, "parentId"], `Parent ${entity.parentId} does not exist`);
        }
        const current = new Set<string>();
        let node: GameEntity3D | undefined = entity;
        while (node && !visited.has(node.id)) {
          if (current.has(node.id)) { add("hierarchy_cycle", [...entityPath, "parentId"], "Entity hierarchy contains a cycle"); break; }
          current.add(node.id);
          node = node.parentId ? byId.get(node.parentId) : undefined;
        }
        for (const nodeId of current) { visited.add(nodeId); }
        if (entity.body3d) {
          if (entity.parentId) { add("physics_parent", [...entityPath, "parentId"], "Physics bodies must be scene roots"); }
          const scale = entity.transform3d.scale;
          if (scale.x !== 1 || scale.y !== 1 || scale.z !== 1) {
            add("physics_scale", [...entityPath, "transform3d", "scale"], "Physics bodies require unit scale");
          }
        }
        if (entity.collider3d && !entity.body3d) { add("missing_body", [...entityPath, "collider3d"], "Collider requires a root body3d"); }
        if (entity.collider3d?.kind === "triangleMesh" && entity.body3d?.type !== "static") {
          add("invalid_mesh_body", [...entityPath, "collider3d", "kind"], "Triangle mesh colliders require static bodies");
        }
        if (entity.character3d) {
          if (entity.body3d?.type !== "kinematic" || entity.collider3d?.kind !== "capsule" || entity.collider3d.sensor) {
            add("invalid_character", [...entityPath, "character3d"], "Character requires a kinematic body and nonsensor capsule collider");
          }
          if (entity.transform3d.rotation[0] !== 0 || entity.transform3d.rotation[2] !== 0 ||
            entity.collider3d && (entity.collider3d.rotation[0] !== 0 || entity.collider3d.rotation[2] !== 0)) {
            add("invalid_character_pose", [...entityPath, "transform3d", "rotation"], "Character capsules must remain upright");
          }
          for (const axis of [entity.character3d.moveXAxis, entity.character3d.moveZAxis]) {
            if (!document.inputAxes.includes(axis)) { add("missing_input_axis", [...entityPath, "character3d"], `Input axis ${axis} is not declared`); }
          }
          if (!document.inputActions.includes(entity.character3d.jumpAction)) { add("missing_input_action", [...entityPath, "character3d", "jumpAction"], "Jump action is not declared"); }
        }
        if (entity.camera3d) {
          if (entity.body3d || entity.character3d) { add("competing_pose_owner", [...entityPath, "camera3d"], "Gameplay cameras cannot be physics bodies or characters"); }
          if (entity.camera3d.projection.near >= entity.camera3d.projection.far) {
            add("invalid_camera_planes", [...entityPath, "camera3d", "projection"], "Camera near plane must be less than far plane");
          }
          const follow = entity.camera3d.behavior;
          if (follow.kind === "follow") {
            if (!byId.has(follow.targetId) || follow.targetId === entity.id || byId.get(follow.targetId)?.templateOnly) {
              add("missing_camera_target", [...entityPath, "camera3d", "behavior", "targetId"], "Follow target must be another active scene entity");
            }
            if (follow.minPitch > follow.maxPitch || follow.pitch < follow.minPitch || follow.pitch > follow.maxPitch) {
              add("invalid_camera_pitch", [...entityPath, "camera3d", "behavior"], "Camera pitch must lie within ordered limits");
            }
          }
        }
        if (entity.primitive && entity.model) { add("competing_visual", [...entityPath, "model"], "Entity must choose either primitive or model rendering"); }
        if (entity.interactionActor && !entity.collider3d) { add("missing_interaction_collider", [...entityPath, "interactionActor"], "Interaction actors require a collider"); }
        const checkAsset = (slot: string, kind: "model" | "collider" | "audio", componentPath: (string | number)[]): void => {
          const asset = document.assets[slot];
          if (!asset || asset.mediaKind !== kind) { add("missing_asset", componentPath, `Asset ${slot} must be a ${kind} binding`); }
          if (prefab && !prefab.externalAssets.includes(slot)) { add("undeclared_external_asset", componentPath, `Prefab must declare asset ${slot}`); }
        };
        if (entity.model) {
          checkAsset(entity.model.assetId, "model", [...entityPath, "model", "assetId"]);
          const asset = document.assets[entity.model.assetId];
          if (asset?.mediaKind === "model" && entity.model.nodeId && !asset.nodeIds.includes(entity.model.nodeId)) {
            add("missing_model_node", [...entityPath, "model", "nodeId"], "Stable model node ID does not exist");
          }
        }
        if (entity.collider3d?.kind === "convexHull" || entity.collider3d?.kind === "triangleMesh") {
          checkAsset(entity.collider3d.assetId, "collider", [...entityPath, "collider3d", "assetId"]);
          const binding = document.assets[entity.collider3d.assetId];
          if (binding?.mediaKind === "collider" && binding.shape !== entity.collider3d.kind) {
            add("collider_shape_mismatch", [...entityPath, "collider3d", "assetId"], "Prepared collider shape does not match the component");
          }
        }
        if (entity.audioSource) { checkAsset(entity.audioSource.assetId, "audio", [...entityPath, "audioSource", "assetId"]); }
        if (entity.animator3d) {
          const asset = entity.model && document.assets[entity.model.assetId];
          if (!asset || asset.mediaKind !== "model") { add("missing_animation_model", [...entityPath, "animator3d"], "Animator requires a model binding"); }
          else {
            for (const [alias, clip] of Object.entries(entity.animator3d.clips)) {
              if (!asset.clipIds.includes(clip)) { add("missing_animation_clip", [...entityPath, "animator3d", "clips", alias], `Prepared clip ${clip} does not exist`); }
            }
          }
          if (entity.animator3d.initialClip && !(entity.animator3d.initialClip in entity.animator3d.clips)) {
            add("missing_animation_clip", [...entityPath, "animator3d", "initialClip"], "Initial clip alias does not exist");
          }
        }
        for (const [behaviorIndex, behavior] of entity.behaviors.entries()) {
          if (behavior.kind === "spawn" && !document.prefabs[behavior.prefabId] && (prefab || !byId.get(behavior.prefabId)?.templateOnly)) {
            add("missing_prefab", [...entityPath, "behaviors", behaviorIndex, "prefabId"], `Prefab ${behavior.prefabId} does not exist`);
          }
          if (behavior.kind === "sceneTransition") {
            if (!scenes.has(behavior.sceneId)) { add("missing_scene", [...entityPath, "behaviors", behaviorIndex, "sceneId"], `Scene ${behavior.sceneId} does not exist`); }
            if (prefab && !prefab.externalScenes.includes(behavior.sceneId)) { add("undeclared_external_scene", [...entityPath, "behaviors", behaviorIndex, "sceneId"], "Prefab must declare its external scene reference"); }
          }
        }
      }
    }
    for (const [index, scene] of document.scenes.entries()) {
      const path = ["scenes", index];
      validateEntities(scene.entities, [...path, "entities"]);
      const camera = scene.entities.find((entity) => entity.id === scene.activeCameraId);
      if (!camera?.camera3d || camera.templateOnly) { add("invalid_active_camera", [...path, "activeCameraId"], "Active camera must select an active camera3d entity"); }
      if (scene.entities.filter((entity) => entity.light3d?.kind === "directional" && entity.light3d.castShadow).length > 1) {
        add("shadow_budget", [...path, "entities"], "Only one directional light may cast shadows");
      }
      if (scene.environment.fog && scene.environment.fog.near >= scene.environment.fog.far) { add("invalid_fog", [...path, "environment", "fog"], "Fog near must be less than far"); }
      if (scene.music && document.assets[scene.music.assetId]?.mediaKind !== "audio") { add("missing_asset", [...path, "music", "assetId"], "Scene music requires an audio binding"); }
    }
    for (const [prefabId, prefab] of Object.entries(document.prefabs)) {
      const path = ["prefabs", prefabId];
      const roots = prefab.entities.filter((entity) => !entity.parentId);
      if (roots.length !== 1 || roots[0]?.id !== prefab.rootId) { add("invalid_prefab_root", [...path, "rootId"], "Prefab must contain exactly one declared root"); }
      if (prefab.entities.some((entity) => entity.templateOnly)) { add("nested_prefab", [...path, "entities"], "Prefab entities cannot be templateOnly"); }
      for (const slot of prefab.externalAssets) { if (!document.assets[slot]) { add("missing_asset", [...path, "externalAssets"], `External asset ${slot} does not exist`); } }
      for (const sceneId of prefab.externalScenes) { if (!scenes.has(sceneId)) { add("missing_scene", [...path, "externalScenes"], `External scene ${sceneId} does not exist`); } }
      validateEntities(prefab.entities, [...path, "entities"], prefab);
    }
  }
  const valid = parsed.success && diagnostics.length === 0;
  const result: { valid: boolean; document?: GameDocument3D; diagnostics: GameDiagnostic[]; issues: GameDiagnostic[]; errors: string[] } = {
    valid, diagnostics, issues: diagnostics, errors: diagnostics.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
  };
  if (valid && parsed.success) { result.document = parsed.data; }
  return result;
}

export type AnyGameValidationResult = { readonly valid: true; readonly document: AnyGameDocument; readonly diagnostics: readonly GameDiagnostic[] } |
  { readonly valid: false; readonly diagnostics: readonly GameDiagnostic[] };
export function validateAnyGame(value: unknown): AnyGameValidationResult {
  const parsed = parseGameDocument(value);
  if (!parsed.ok) { return { valid: false, diagnostics: parsed.diagnostics }; }
  if (parsed.document.schemaVersion === 3) {
    const result = validateGame3D(parsed.document);
    return result.valid && result.document ? { valid: true, document: result.document, diagnostics: [] } : { valid: false, diagnostics: result.diagnostics };
  }
  const result = validateGame(parsed.document);
  return result.valid && result.document ? { valid: true, document: result.document, diagnostics: [] } :
    { valid: false, diagnostics: result.issues.map((issue) => ({ ...issue, path: [...issue.path], code: "invalid_document" })) };
}
