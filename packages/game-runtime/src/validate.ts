import { gameDocument, type GameDocument } from "@nodetool-ai/protocol";

export interface GameValidationResult {
  readonly valid: boolean;
  readonly document?: GameDocument;
  readonly errors: readonly string[];
}

/** Validate structure and references before publishing or starting a session. */
export function validateGame(value: unknown): GameValidationResult {
  const parsed = gameDocument.safeParse(value);
  if (!parsed.success) {
    return { valid: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  }
  const document = parsed.data;
  const errors: string[] = [];
  let scriptCount = 0;
  let scriptSourceBytes = 0;
  const encoder = new TextEncoder();
  const sceneIds = new Set<string>();
  for (const scene of document.scenes) {
    if (sceneIds.has(scene.id)) {
      errors.push(`Duplicate scene id: ${scene.id}`);
    }
    sceneIds.add(scene.id);
  }
  if (!sceneIds.has(document.entrySceneId)) {
    errors.push(`Entry scene does not exist: ${document.entrySceneId}`);
  }
  const actions = new Set<string>();
  for (const action of document.inputActions) {
    if (actions.has(action)) {
      errors.push(`Duplicate input action: ${action}`);
    }
    actions.add(action);
  }
  for (const [sceneIndex, scene] of document.scenes.entries()) {
    const entities = new Map(scene.entities.map((entity) => [entity.id, entity]));
    const children = new Map<string, string[]>();
    if (entities.size !== scene.entities.length) {
      errors.push(`Duplicate entity id in scene ${scene.id}`);
    }
    for (const entity of scene.entities) {
      if (entity.parentId && !entities.has(entity.parentId)) {
        errors.push(`Entity ${entity.id} has missing parent ${entity.parentId}`);
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
        errors.push(`Collider ${id} cannot be rotated or scaled`);
      }
      if (entity.tilemap && (invalidPhysicsAncestor.get(id) ||
        entity.transform2d.rotation !== 0 || entity.transform2d.scaleX !== 1 || entity.transform2d.scaleY !== 1)) {
        errors.push(`Tilemap ${id} cannot be rotated or scaled`);
      }
      if (entity.camera2d && (invalidPhysicsAncestor.get(id) || entity.transform2d.rotation !== 0 ||
        entity.transform2d.scaleX !== 1 || entity.transform2d.scaleY !== 1)) {
        errors.push(`Camera ${id} cannot be rotated or scaled`);
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
        errors.push(`Parent cycle at entity ${entity.id}`);
      }
      if (children.has(entity.id) &&
        (entity.body2d?.type === "kinematic" || entity.behaviors.some((behavior) => behavior.kind === "movement" || behavior.kind === "patrol"))) {
        errors.push(`Moving parent ${entity.id} is not supported`);
      }
      if (children.has(entity.id) && entity.transform2d.scaleX !== entity.transform2d.scaleY) {
        errors.push(`Non-uniformly scaled parent ${entity.id} is not supported`);
      }
      // A kinematic body without a collider moves but never collides, which suits cosmetic particles.
      if (entity.body2d?.type === "static" && !entity.collider2d) {
        errors.push(`Static body ${entity.id} needs a collider2d`);
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
      for (const [behaviorIndex, behavior] of entity.behaviors.entries()) {
        if ((behavior.kind === "movement" || behavior.kind === "patrol") && entity.body2d?.type !== "kinematic") {
          errors.push(`${path}.behaviors.${behaviorIndex}: ${behavior.kind} requires a kinematic body2d`);
        }
        if (behavior.kind === "script") {
          scriptCount += 1;
          scriptSourceBytes += encoder.encode(behavior.source).byteLength;
        }
        if (behavior.kind === "movement") {
          for (const action of [behavior.left, behavior.right, behavior.up, behavior.down]) {
            if (!actions.has(action)) {
              errors.push(`Movement on ${entity.id} uses undeclared action ${action}`);
            }
          }
        }
        if (behavior.kind === "sceneTransition" && !sceneIds.has(behavior.sceneId)) {
          errors.push(`Transition on ${entity.id} uses missing scene ${behavior.sceneId}`);
        }
        if (behavior.kind === "spawn" && !entities.get(behavior.prefabId)?.templateOnly) {
          errors.push(`Spawn on ${entity.id} uses missing prefab entity ${behavior.prefabId}`);
        }
      }
    }
  }
  if (scriptCount > 32) errors.push("Game exceeds the limit of 32 scripted behaviors");
  if (scriptSourceBytes > 64 * 1024) errors.push("Game script source exceeds 64 KiB");
  return errors.length === 0 ? { valid: true, document, errors } : { valid: false, errors };
}
