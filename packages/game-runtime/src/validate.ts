import { gameAuthoringBaseline } from "./authoring-reconcile.js";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";

export interface GameValidationResult {
  readonly valid: boolean;
  readonly document?: GameDocument;
  readonly issues: readonly GameValidationIssue[];
  readonly errors: readonly string[];
}

export interface GameValidationIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

function pathOf(path: readonly PropertyKey[]): (string | number)[] {
  return path.map((part) => typeof part === "symbol" ? part.toString() : part);
}

function formatIssue(issue: GameValidationIssue): string {
  return issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}

function issueFromError(error: string, document: GameDocument): GameValidationIssue {
  const separator = error.indexOf(": ");
  if (separator < 0) return { path: [], message: error };
  const prefix = error.slice(0, separator);
  if (!/^(assets|scenes|renderEffects|entrySceneId|inputActions|collisionLayers)(\.|$)/.test(prefix)) return { path: [], message: error };
  if (prefix.startsWith("assets.")) {
    const slot = Object.keys(document.assets).sort((left, right) => right.length - left.length)
      .find((key) => prefix === `assets.${key}` || prefix.startsWith(`assets.${key}.`));
    if (slot) {
      const remainder = prefix.slice(`assets.${slot}`.length).replace(/^\./, "");
      return { path: ["assets", slot, ...remainder.split(".").filter(Boolean)], message: error.slice(separator + 2) };
    }
  }
  return { path: prefix.split(".").map((part) => /^\d+$/.test(part) ? Number(part) : part), message: error.slice(separator + 2) };
}

/** Validate structure and references before publishing or starting a session. */
export function validateGame(value: unknown): GameValidationResult {
  const parsed = gameDocument.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({ path: pathOf(issue.path), message: issue.message }));
    return { valid: false, issues, errors: issues.map(formatIssue) };
  }
  const document = parsed.data;
  const errors: string[] = [];
  if (document.authoring) {
    try {
      const baseline = gameAuthoringBaseline(document);
      const validatedBaseline = validateGame(baseline);
      if (!validatedBaseline.valid) { errors.push(`authoring.baseline: ${validatedBaseline.errors.join(", ")}`); }
    } catch (error) { errors.push(`authoring: ${error instanceof Error ? error.message : "Invalid authoring metadata"}`); }
  }
  const issueOverrides = new Map<number, GameValidationIssue>();
  if (document.schemaVersion === 1 && document.collisionLayers) {
    errors.push("collisionLayers: requires schema version 2");
  }
  if (document.schemaVersion === 1 && ((document.renderEffects?.length ?? 0) > 1 ||
    document.renderEffects?.some((effect) => effect.kind !== "brightnessContrast") || document.hudEffectOrder)) {
    errors.push("Effect chains, bloom, and HUD effect order require game schema version 2");
  }
  for (const [index, effect] of (document.renderEffects ?? []).entries()) {
    if (effect.kind !== "lut") {
      continue;
    }
    const path = `renderEffects.${index}`;
    const asset = document.assets[effect.assetId];
    if (!asset || asset.mediaKind !== "image") {
      errors.push(`${path}.assetId: LUT requires an image asset`);
    } else if (asset.width !== effect.size * effect.size || asset.height !== effect.size) {
      errors.push(`${path}.assetId: LUT dimensions must be ${effect.size * effect.size}×${effect.size}`);
    }
    if (effect.domainMin.some((value, channel) => value >= effect.domainMax[channel]!)) {
      errors.push(`${path}: LUT domain minimum must be less than maximum in every channel`);
    }
  }
  let scriptCount = 0;
  let scriptSourceBytes = 0;
  const encoder = new TextEncoder();
  const sceneIds = new Set<string>();
  for (const [sceneIndex, scene] of document.scenes.entries()) {
    if (sceneIds.has(scene.id)) {
      errors.push(`scenes.${sceneIndex}.id: Duplicate scene id ${scene.id}`);
    }
    sceneIds.add(scene.id);
  }
  if (!sceneIds.has(document.entrySceneId)) {
    errors.push(`entrySceneId: Scene ${document.entrySceneId} does not exist`);
  }
  const actions = new Set<string>();
  for (const [assetId, binding] of Object.entries(document.assets)) {
    if (document.schemaVersion === 1 && (binding.mediaKind === "font" || binding.preparation || binding.originalDimensions || binding.trim || binding.referenceAssetId)) {
      errors.push(`assets.${assetId}: prepared assets and fonts require game schema version 2`);
    }
    if (binding.mediaKind !== "font" && binding.required !== undefined) {
      errors.push(`assets.${assetId}.required: only fonts may set required`);
    }
    if ((binding.mediaKind === "font") !== (binding.fontFormat !== undefined)) {
      errors.push(`assets.${assetId}.fontFormat: font assets require a format and other assets cannot set one`);
    }
    if (binding.trim && (binding.mediaKind !== "image" || binding.trim.x + binding.width > binding.trim.sourceWidth ||
      binding.trim.y + binding.height > binding.trim.sourceHeight)) {
      errors.push(`assets.${assetId}.trim: crop must fit the source image`);
    }
  }
  for (const [actionIndex, action] of document.inputActions.entries()) {
    if (actions.has(action)) {
      errors.push(`inputActions.${actionIndex}: Duplicate input action ${action}`);
    }
    actions.add(action);
  }
  for (const [sceneIndex, scene] of document.scenes.entries()) {
    if (document.schemaVersion === 1 && scene.lighting) errors.push(`scenes.${sceneIndex}.lighting: requires schema version 2`);
    if (document.schemaVersion === 1 && scene.backgrounds) errors.push(`scenes.${sceneIndex}.backgrounds: requires schema version 2`);
    if (document.schemaVersion === 1 && scene.gravity) errors.push(`scenes.${sceneIndex}.gravity: requires schema version 2`);
    const layerIds = new Set<string>();
    for (const [layerIndex, layer] of (scene.backgrounds ?? []).entries()) {
      if (layerIds.has(layer.id)) errors.push(`scenes.${sceneIndex}.backgrounds.${layerIndex}.id: Duplicate background id ${layer.id}`);
      layerIds.add(layer.id);
      const asset = document.assets[layer.assetId];
      if (!asset || asset.mediaKind !== "image") errors.push(`scenes.${sceneIndex}.backgrounds.${layerIndex}.assetId: requires an image asset`);
    }
    if (scene.music) {
      if (document.schemaVersion < 2) errors.push(`scenes.${sceneIndex}.music: requires schema version 2`);
      const binding = document.assets[scene.music.assetId];
      if (!binding) {
        errors.push(`scenes.${sceneIndex}.music.assetId: Scene ${scene.id} references missing asset ${scene.music.assetId}`);
      } else if (binding.mediaKind !== "audio") {
        errors.push(`scenes.${sceneIndex}.music.assetId: requires audio, but ${scene.music.assetId} is ${binding.mediaKind}`);
      }
    }
    const entities = new Map(scene.entities.map((entity) => [entity.id, entity]));
    const entityIndexes = new Map(scene.entities.map((entity, index) => [entity.id, index]));
    const children = new Map<string, string[]>();
    if (entities.size !== scene.entities.length) {
      errors.push(`scenes.${sceneIndex}.entities: Duplicate entity id in scene ${scene.id}`);
    }
    for (const [entityIndex, entity] of scene.entities.entries()) {
      if (entity.parentId && !entities.has(entity.parentId)) {
        errors.push(`scenes.${sceneIndex}.entities.${entityIndex}.parentId: Entity ${entity.id} has missing parent ${entity.parentId}`);
      }
      if (entity.parentId && entities.has(entity.parentId)) {
        const siblings = children.get(entity.parentId) ?? [];
        siblings.push(entity.id);
        children.set(entity.parentId, siblings);
      }
    }
    const queue = scene.entities.filter((entity) => !entity.parentId || !entities.has(entity.parentId)).map((entity) => entity.id);
    const visited = new Set<string>();
    const invalidPhysicsAncestor = new Map<string, boolean>();
    for (let head = 0; head < queue.length; head += 1) {
      const id = queue[head];
      if (visited.has(id)) continue;
      visited.add(id);
      const entity = entities.get(id);
      if (!entity) continue;
      if (entity.collider2d && (invalidPhysicsAncestor.get(id) ||
        entity.transform2d.rotation !== 0 || entity.transform2d.scaleX !== 1 || entity.transform2d.scaleY !== 1)) {
        errors.push(`scenes.${sceneIndex}.entities.${entityIndexes.get(id)}.collider2d: Collider ${id} cannot be rotated or scaled`);
      }
      if (entity.tilemap && (invalidPhysicsAncestor.get(id) ||
        entity.transform2d.rotation !== 0 || entity.transform2d.scaleX !== 1 || entity.transform2d.scaleY !== 1)) {
        errors.push(`scenes.${sceneIndex}.entities.${entityIndexes.get(id)}.tilemap: Tilemap ${id} cannot be rotated or scaled`);
      }
      if (entity.camera2d && (invalidPhysicsAncestor.get(id) || entity.transform2d.rotation !== 0 ||
        entity.transform2d.scaleX !== 1 || entity.transform2d.scaleY !== 1)) {
        errors.push(`scenes.${sceneIndex}.entities.${entityIndexes.get(id)}.camera2d: Camera ${id} cannot be rotated or scaled`);
      }
      const invalidForChildren = Boolean(invalidPhysicsAncestor.get(id)) ||
        entity.transform2d.rotation !== 0 || entity.transform2d.scaleX !== 1 || entity.transform2d.scaleY !== 1;
      for (const childId of children.get(id) ?? []) {
        invalidPhysicsAncestor.set(childId, invalidForChildren);
        queue.push(childId);
      }
    }
    for (const [entityIndex, entity] of scene.entities.entries()) {
      if (!visited.has(entity.id)) {
        errors.push(`scenes.${sceneIndex}.entities.${entityIndex}.parentId: Parent cycle at entity ${entity.id}`);
      }
      if (children.has(entity.id) &&
        (entity.body2d?.type === "kinematic" || entity.behaviors.some((behavior) => behavior.kind === "movement" || behavior.kind === "patrol"))) {
        errors.push(`scenes.${sceneIndex}.entities.${entityIndex}.behaviors: Moving parent ${entity.id} is not supported`);
      }
      if (children.has(entity.id) && entity.transform2d.scaleX !== entity.transform2d.scaleY) {
        errors.push(`scenes.${sceneIndex}.entities.${entityIndex}.transform2d: Non-uniformly scaled parent ${entity.id} is not supported`);
      }
      // A kinematic body without a collider moves but never collides, which suits cosmetic particles.
      const solidTiles = Boolean(entity.tilemap?.tiles.some((tile) => tile.solid ?? entity.tilemap?.solid ?? false));
      if (entity.body2d?.type === "static" && !entity.collider2d && !solidTiles) {
        const message = `Static body ${entity.id} needs a collider2d or solid tiles`;
        issueOverrides.set(errors.length, { path: ["scenes", sceneIndex, "entities", entityIndex, "collider2d"], message });
        errors.push(message);
      }
      const path = `scenes.${sceneIndex}.entities.${entityIndex}`;
      for (const [component, assetId, expectedKind] of [
        ["sprite", entity.sprite?.assetId, "image"],
        ["tilemap", entity.tilemap?.assetId, "image"],
        ["audioSource", entity.audioSource?.assetId, "audio"]
      ] as const) {
        if (!assetId) {
          continue;
        }
        const binding = document.assets[assetId];
        if (!binding) {
          errors.push(`${path}.${component}.assetId: Entity ${entity.id} references missing asset ${assetId}`);
        } else if (binding.mediaKind !== expectedKind) {
          errors.push(`${path}.${component}.assetId: requires ${expectedKind}, but ${assetId} is ${binding.mediaKind}`);
        }
      }
      if (entity.animator && !entity.sprite) {
        errors.push(`${path}.animator: requires a sprite`);
      }
      if (entity.sprite) {
        const binding = document.assets[entity.sprite.assetId];
        if (binding?.trim && (entity.sprite.frame || entity.animator)) {
          errors.push(`${path}.sprite: a trimmed asset cannot use frames or an animator`);
        }
      }
      if (entity.tilemap && document.assets[entity.tilemap.assetId]?.trim) {
        errors.push(`${path}.tilemap: a trimmed asset cannot be a tilemap`);
      }
      if (entity.visualAnimation && !entity.sprite) errors.push(`${path}.visualAnimation: requires a sprite`);
      if (document.schemaVersion === 1 && entity.visualAnimation) errors.push(`${path}.visualAnimation: requires schema version 2`);
      if (document.schemaVersion === 1 && entity.sprite?.unlit !== undefined) errors.push(`${path}.sprite.unlit: requires schema version 2`);
      if (document.schemaVersion === 1) {
        for (const [field, present] of [
          ["light2d", entity.light2d !== undefined],
          ["animator.clips", entity.animator?.clips !== undefined],
          ["sprite.flipX", entity.sprite?.flipX !== undefined],
          ["sprite.faceMotion", entity.sprite?.faceMotion !== undefined],
          ["body2d.gravityScale", entity.body2d?.gravityScale !== undefined],
          ["collider2d.oneWay", entity.collider2d?.oneWay !== undefined],
          ["tilemap", entity.tilemap !== undefined && (entity.tilemap.solid !== undefined || entity.tilemap.category !== undefined ||
            entity.tilemap.mask !== undefined || entity.tilemap.tiles.some((tile) => tile.solid !== undefined || tile.oneWay !== undefined))]
        ] as const) {
          if (present) errors.push(`${path}.${field}: requires schema version 2`);
        }
      }
      if (entity.light2d && !scene.lighting) errors.push(`${path}.light2d: requires scene lighting`);
      const tracked = new Set<string>();
      for (const track of entity.visualAnimation?.tracks ?? []) {
        if (tracked.has(track.property)) errors.push(`${path}.visualAnimation: duplicate ${track.property} track`);
        tracked.add(track.property);
        if ((track.property === "scaleX" || track.property === "scaleY") && (track.from <= 0 || track.to <= 0)) {
          errors.push(`${path}.visualAnimation: scale values must be positive`);
        }
        if (track.property === "opacity" && (track.from < 0 || track.from > 1 || track.to < 0 || track.to > 1)) {
          errors.push(`${path}.visualAnimation: opacity must be between 0 and 1`);
        }
      }
      if (entity.visualAnimation?.rotationRate !== undefined && tracked.has("rotation")) {
        errors.push(`${path}.visualAnimation: rotation track conflicts with rotationRate`);
      }
      for (const [behaviorIndex, behavior] of entity.behaviors.entries()) {
        if (behavior.kind === "movement" && entity.body2d?.type !== "kinematic") {
          errors.push(`${path}.behaviors.${behaviorIndex}: movement requires a kinematic body2d`);
        }
        // A patrolling static body is a moving solid that carries the bodies standing on it.
        if (behavior.kind === "patrol" && !entity.body2d) {
          errors.push(`${path}.behaviors.${behaviorIndex}: patrol requires a body2d`);
        }
        if (behavior.kind === "patrol" && behavior.turnAtLedges && (behavior.axis !== "x" || entity.body2d?.type !== "kinematic")) {
          errors.push(`${path}.behaviors.${behaviorIndex}.turnAtLedges: requires a kinematic body patrolling the x axis`);
        }
        if (behavior.kind === "script") {
          scriptCount += 1;
          scriptSourceBytes += encoder.encode(behavior.source).byteLength;
        }
        if (behavior.kind === "movement") {
          for (const action of [behavior.left, behavior.right, behavior.up, behavior.down]) {
            if (!actions.has(action)) {
              errors.push(`${path}.behaviors.${behaviorIndex}: Movement on ${entity.id} uses undeclared action ${action}`);
            }
          }
        }
        if (behavior.kind === "sceneTransition" && !sceneIds.has(behavior.sceneId)) {
          errors.push(`${path}.behaviors.${behaviorIndex}.sceneId: Transition on ${entity.id} uses missing scene ${behavior.sceneId}`);
        }
        if (behavior.kind === "spawn" && !entities.get(behavior.prefabId)?.templateOnly) {
          errors.push(`${path}.behaviors.${behaviorIndex}.prefabId: Spawn on ${entity.id} uses missing prefab entity ${behavior.prefabId}`);
        }
      }
    }
  }
  if (scriptCount > 32) errors.push("Game exceeds the limit of 32 scripted behaviors");
  if (scriptSourceBytes > 64 * 1024) errors.push("Game script source exceeds 64 KiB");
  const issues = errors.map((error, index) => issueOverrides.get(index) ?? issueFromError(error, document));
  return errors.length === 0 ? { valid: true, document, issues, errors } : { valid: false, issues, errors };
}
