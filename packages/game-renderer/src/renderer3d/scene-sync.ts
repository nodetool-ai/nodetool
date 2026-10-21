import { primitiveInstance, modelInstance } from "./assets/instances.js";
import { releaseInstance } from "./assets/dispose.js";
import { restoreGameAnimationPose3D, sampleGameAnimation3D, sampleGameAnimationPose3D } from "./animation/index.js";
import type { RenderInstance } from "./types.js";
import type { GameModelCache3D } from "./assets/cache.js";
import * as THREE from "three";
import type { GameTransform3D, GameRenderFrame3D } from "@nodetool-ai/protocol";
export function applyTransform(object: THREE.Object3D, transform: GameTransform3D): void {
  object.position.set(transform.position.x, transform.position.y, transform.position.z);
  object.quaternion.fromArray(transform.rotation);
  object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
}

const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();

/** `applyTransform(object, interpolateGameTransform3D(...))` without allocating. The arithmetic is the same. */
function applyInterpolatedTransform(object: THREE.Object3D, previous: GameTransform3D, current: GameTransform3D, alpha: number): void {
  const amount = Math.max(0, Math.min(1, alpha));
  object.position.set(previous.position.x, previous.position.y, previous.position.z)
    .lerp(scratchPosition.set(current.position.x, current.position.y, current.position.z), amount);
  object.quaternion.fromArray(previous.rotation).slerp(scratchQuaternion.fromArray(current.rotation), amount);
  object.scale.set(previous.scale.x + (current.scale.x - previous.scale.x) * amount,
    previous.scale.y + (current.scale.y - previous.scale.y) * amount,
    previous.scale.z + (current.scale.z - previous.scale.z) * amount);
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
      // Frames reuse the definition's model or primitive object, so the descriptor JSON is only built when it changes.
      const source = entity.model ?? entity.primitive;
      let instance = instances.get(entity.entityId);
      if (instance && instance.descriptorSource !== source) {
        if (instance.descriptor !== (JSON.stringify(source) ?? "transform")) { releaseInstance(instance); instances.delete(entity.entityId); instance = undefined; }
        else { instance.descriptorSource = source; }
      }
      if (!instance) {
        if (entity.model) {
          instance = modelInstance(entity.model, await modelCache.get(entity.model.assetId));
          instance.modelAssetId = entity.model.assetId;
        }
        else if (entity.primitive) { instance = primitiveInstance(entity.primitive); }
        else { instance = { descriptor: "transform", object: new THREE.Group(), materials: [] }; }
        signal.throwIfAborted();
        instance.descriptorSource = source;
        instance.object.userData.gameEntityId = entity.entityId;
        instances.set(entity.entityId, instance);
        scene.add(instance.object);
      }
      applyInterpolatedTransform(instance.object, entity.previousTransform, entity.transform, interpolation);
      for (const material of instance.materials) {
        const base: unknown = material.userData.baseOpacity;
        material.opacity = (typeof base === "number" ? base : entity.primitive?.material.opacity ?? 1) * (entity.opacity ?? 1);
        material.transparent = material.userData.baseTransparent === true || material.opacity < 1 || (entity.primitive?.material.alphaMode === "blend") || (entity.model?.material?.alphaMode === "blend");
      }
      let poseChanged = false;
      const animationMode = instance.clips && entity.animationPose ? "graph" : instance.mixer && instance.clips && entity.animation ? "clip" : undefined;
      if (instance.sampledAnimationMode !== animationMode) {
        instance.mixer?.stopAllAction();
        if (instance.sampledAnimationMode === "graph") { restoreGameAnimationPose3D(instance.object); }
        delete instance.sampledAnimationSource;
        delete instance.sampledAnimationTick;
        delete instance.boundsTick;
        if (animationMode) { instance.sampledAnimationMode = animationMode; }
        else { delete instance.sampledAnimationMode; }
        poseChanged = true;
      }
      // A frame's pose and clip state are new objects each tick and never change afterwards, so the same object at the
      // same fractional tick means the same pose. Each new rendered frame has a new fractional tick and samples again.
      const sampledTick = frame.tick - 1 + Math.max(0, Math.min(1, interpolation));
      if (instance.clips && entity.animationPose) {
        if (instance.sampledAnimationSource !== entity.animationPose || instance.sampledAnimationTick !== sampledTick) {
          sampleGameAnimationPose3D(instance.object, instance.clips, entity.animationPose, sampledTick);
          instance.sampledAnimationSource = entity.animationPose;
          instance.sampledAnimationTick = sampledTick;
          poseChanged = true;
        }
      } else if (instance.mixer && instance.clips && entity.animation) {
        if (instance.sampledAnimationSource !== entity.animation || instance.sampledAnimationTick !== sampledTick) {
          sampleGameAnimation3D(instance.mixer, instance.clips, entity.animation, sampledTick);
          instance.sampledAnimationSource = entity.animation;
          instance.sampledAnimationTick = sampledTick;
          poseChanged = true;
        }
      } else if (instance.mixer && instance.sampledAnimationSource !== undefined) {
        instance.mixer.stopAllAction();
        delete instance.sampledAnimationSource;
        delete instance.sampledAnimationTick;
        delete instance.boundsTick;
        poseChanged = true;
      }
      // Skinned bounds skin every vertex on the CPU, so they follow the pose once per tick, not once per rendered frame.
      if (poseChanged && instance.boundsTick !== frame.tick) {
        instance.boundsTick = frame.tick;
        instance.object.updateMatrixWorld(true);
        instance.object.traverse((object) => {
          if (!(object instanceof THREE.SkinnedMesh)) { return; }
          object.computeBoundingBox();
          if (object.boundingBox) { object.boundingSphere = object.boundingBox.getBoundingSphere(object.boundingSphere ?? new THREE.Sphere()); }
        });
      }
    }
}
