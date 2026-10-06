import { primitiveInstance, modelInstance } from "./assets/instances.js";
import { releaseInstance } from "./assets/dispose.js";
import { sampleGameAnimation3D } from "./animation/index.js";
import type { RenderInstance } from "./types.js";
import type { GameModelCache3D } from "./assets/cache.js";
import * as THREE from "three";
import type { GameTransform3D, GameRenderFrame3D } from "@nodetool-ai/protocol";
export function applyTransform(object: THREE.Object3D, transform: GameTransform3D): void {
  object.position.set(transform.position.x, transform.position.y, transform.position.z);
  object.quaternion.fromArray(transform.rotation);
  object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
}

export function interpolateGameTransform3D(previous: GameTransform3D, current: GameTransform3D, alpha: number): GameTransform3D {
  const amount = Math.max(0, Math.min(1, alpha));
  const position = new THREE.Vector3(previous.position.x, previous.position.y, previous.position.z)
    .lerp(new THREE.Vector3(current.position.x, current.position.y, current.position.z), amount);
  const rotation = new THREE.Quaternion().fromArray(previous.rotation).slerp(new THREE.Quaternion().fromArray(current.rotation), amount);
  return { position: { x: position.x, y: position.y, z: position.z }, rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    scale: { x: previous.scale.x + (current.scale.x - previous.scale.x) * amount,
      y: previous.scale.y + (current.scale.y - previous.scale.y) * amount,
      z: previous.scale.z + (current.scale.z - previous.scale.z) * amount } };
}

export async function syncGameScene(scene: THREE.Scene, instances: Map<string, RenderInstance>, modelCache: GameModelCache3D,
  signal: AbortSignal, frame: GameRenderFrame3D, interpolation: number): Promise<void> {
    const present = new Set(frame.entities.map((entry) => entry.entityId));
    for (const [id, instance] of instances) {
      if (!present.has(id)) { releaseInstance(instance); instances.delete(id); }
    }
    for (const entity of frame.entities) {
      const descriptor = JSON.stringify(entity.model ?? entity.primitive) ?? "transform";
      let instance = instances.get(entity.entityId);
      if (instance && instance.descriptor !== descriptor) { releaseInstance(instance); instances.delete(entity.entityId); instance = undefined; }
      if (!instance) {
        if (entity.model) {
          instance = modelInstance(entity.model, await modelCache.get(entity.model.assetId));
          instance.modelAssetId = entity.model.assetId;
        }
        else if (entity.primitive) { instance = primitiveInstance(entity.primitive); }
        else { instance = { descriptor: "transform", object: new THREE.Group(), materials: [] }; }
        signal.throwIfAborted();
        instance.object.userData.gameEntityId = entity.entityId;
        instances.set(entity.entityId, instance);
        scene.add(instance.object);
      }
      applyTransform(instance.object, interpolateGameTransform3D(entity.previousTransform, entity.transform, interpolation));
      for (const material of instance.materials) {
        const base: unknown = material.userData.baseOpacity;
        material.opacity = (typeof base === "number" ? base : entity.primitive?.material.opacity ?? 1) * (entity.opacity ?? 1);
        material.transparent = material.userData.baseTransparent === true || material.opacity < 1 || (entity.primitive?.material.alphaMode === "blend") || (entity.model?.material?.alphaMode === "blend");
      }
      let poseChanged = false;
      if (instance.mixer && instance.clips && entity.animation) {
        const sampledTick = frame.tick - 1 + Math.max(0, Math.min(1, interpolation));
        const key = `${JSON.stringify(entity.animation)}:${sampledTick}`;
        if (instance.sampledAnimationKey !== key) {
          sampleGameAnimation3D(instance.mixer, instance.clips, entity.animation, sampledTick);
          instance.sampledAnimationKey = key;
          poseChanged = true;
        }
      } else if (instance.mixer && instance.sampledAnimationKey !== undefined) {
        instance.mixer.stopAllAction();
        delete instance.sampledAnimationKey;
        poseChanged = true;
      }
      if (poseChanged) {
        instance.object.updateMatrixWorld(true);
        instance.object.traverse((object) => {
          if (!(object instanceof THREE.SkinnedMesh)) { return; }
          object.computeBoundingBox();
          if (object.boundingBox) { object.boundingSphere = object.boundingBox.getBoundingSphere(object.boundingSphere ?? new THREE.Sphere()); }
        });
      }
    }
}
