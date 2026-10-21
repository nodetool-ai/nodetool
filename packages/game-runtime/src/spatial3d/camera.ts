import type { GameCameraState3D, GameInputFrame3D, GameQuaternion3D } from "@nodetool-ai/protocol";
import { add3, copyTransform3D, multiplyQuaternion, quantizeSpatial3D, rotate3, scale3 } from "./math.js";
import type { EntityState3D } from "./state.js";
import type { SpatialWorld3D } from "./world.js";

function anglesQuaternion(yaw: number, pitch: number): GameQuaternion3D {
  return multiplyQuaternion([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)]).map(quantizeSpatial3D) as GameQuaternion3D;
}

/** Fixed cameras expose the same forward direction to scripts and character movement as to rendering. */
export function updateFixedCameraAngles3D(camera: GameCameraState3D, entity: EntityState3D,
  rotation: GameQuaternion3D = entity.transform.rotation): void {
  if (entity.definition.camera3d?.behavior.kind === "follow") { return; }
  const forward = rotate3({ x: 0, y: 0, z: -1 }, rotation);
  const length = Math.hypot(forward.x, forward.y, forward.z);
  camera.yaw = Math.atan2(-forward.x, -forward.z);
  camera.pitch = length > 0 ? Math.asin(Math.max(-1, Math.min(1, forward.y / length))) : 0;
}

/** Resolves only this camera's rotation after visual commands, without moving other systems' hierarchy phase. */
export function fixedCameraRotation3D(entity: EntityState3D, states: readonly EntityState3D[]): GameQuaternion3D {
  if (!entity.definition.parentId) { return entity.transform.rotation; }
  const byId = new Map(states.map((state) => [state.definition.id, state]));
  const children: GameQuaternion3D[] = [];
  let root = entity;
  while (root.definition.parentId) {
    if (children.length >= states.length) { throw new Error("Fixed camera hierarchy contains a cycle"); }
    const parent = byId.get(root.definition.parentId);
    if (!parent) { return entity.transform.rotation; }
    children.push(root.localTransform.rotation);
    root = parent;
  }
  // Root setVisual commands copy localTransform into transform immediately. Physical roots retain their world pose.
  let rotation = root.transform.rotation;
  for (let index = children.length - 1; index >= 0; index -= 1) { rotation = multiplyQuaternion(rotation, children[index]); }
  return rotation;
}

export function initialCamera3D(entity: EntityState3D): GameCameraState3D {
  const behavior = entity.definition.camera3d?.behavior;
  const forward = rotate3({ x: 0, y: 0, z: -1 }, entity.transform.rotation);
  const camera: GameCameraState3D = { entityId: entity.definition.id, yaw: behavior?.kind === "follow" ? quantizeSpatial3D(behavior.yaw * Math.PI / 180) : Math.atan2(-forward.x, -forward.z),
    pitch: behavior?.kind === "follow" ? quantizeSpatial3D(behavior.pitch * Math.PI / 180) : 0, transform: structuredClone(entity.transform) };
  if (behavior?.kind === "follow") camera.targetId = behavior.targetId;
  else updateFixedCameraAngles3D(camera, entity);
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
    updateFixedCameraAngles3D(camera, entity);
    camera.transform = copyTransform3D(entity.transform);
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
