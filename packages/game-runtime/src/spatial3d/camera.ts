import type { GameCameraState3D, GameInputFrame3D, GameQuaternion3D } from "@nodetool-ai/protocol";
import { add3, multiplyQuaternion, quantizeSpatial3D, rotate3, scale3 } from "./math.js";
import type { EntityState3D } from "./state.js";
import type { SpatialWorld3D } from "./world.js";

function anglesQuaternion(yaw: number, pitch: number): GameQuaternion3D {
  return multiplyQuaternion([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)]).map(quantizeSpatial3D) as GameQuaternion3D;
}

export function initialCamera3D(entity: EntityState3D): GameCameraState3D {
  const behavior = entity.definition.camera3d?.behavior;
  const forward = rotate3({ x: 0, y: 0, z: -1 }, entity.transform.rotation);
  const camera: GameCameraState3D = { entityId: entity.definition.id, yaw: behavior?.kind === "follow" ? quantizeSpatial3D(behavior.yaw * Math.PI / 180) : Math.atan2(-forward.x, -forward.z),
    pitch: behavior?.kind === "follow" ? quantizeSpatial3D(behavior.pitch * Math.PI / 180) : 0, transform: structuredClone(entity.transform) };
  if (behavior?.kind === "follow") camera.targetId = behavior.targetId;
  return camera;
}

export function applyCameraLook3D(camera: GameCameraState3D, entity: EntityState3D, input: GameInputFrame3D): void {
  const behavior = entity.definition.camera3d?.behavior;
  if (behavior?.kind !== "follow") return;
  camera.yaw = quantizeSpatial3D(camera.yaw + input.look.x * behavior.sensitivity);
  camera.pitch = quantizeSpatial3D(Math.max(behavior.minPitch * Math.PI / 180, Math.min(behavior.maxPitch * Math.PI / 180,
    camera.pitch + input.look.y * behavior.sensitivity)));
}

export function resolveCamera3D(camera: GameCameraState3D, entity: EntityState3D, states: readonly EntityState3D[], spatial: SpatialWorld3D): void {
  const behavior = entity.definition.camera3d?.behavior;
  if (behavior?.kind !== "follow") {
    camera.transform = structuredClone(entity.transform);
    return;
  }
  const target = states.find((state) => state.definition.id === behavior.targetId && state.active);
  if (!target) return;
  const origin = add3(target.transform.position, behavior.lookAtOffset);
  const offset = rotate3(behavior.offset, anglesQuaternion(camera.yaw, camera.pitch));
  const desired = add3(target.transform.position, offset);
  const direction = add3(desired, scale3(origin, -1));
  const distance = spatial.cameraDistance(origin, direction, behavior.collisionRadius, target.definition.id);
  const rawPosition = add3(origin, scale3(direction, distance));
  const position = { x: quantizeSpatial3D(rawPosition.x), y: quantizeSpatial3D(rawPosition.y), z: quantizeSpatial3D(rawPosition.z) };
  const look = add3(origin, scale3(position, -1));
  const length = Math.hypot(look.x, look.y, look.z);
  const yaw = Math.atan2(-look.x, -look.z);
  const pitch = length > 0 ? Math.asin(Math.max(-1, Math.min(1, look.y / length))) : 0;
  camera.transform = { ...camera.transform, position, rotation: anglesQuaternion(yaw, pitch) };
}
