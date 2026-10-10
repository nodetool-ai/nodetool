import * as THREE from "three";
import type { GameRenderFrame3D } from "@nodetool-ai/protocol";
import type { RenderInstance } from "./types.js";

const cameraPosition = new THREE.Vector3();

/**
 * Hides each entity whose `cullDistance` is shorter than its distance to `camera`, and shows every other entity.
 * Pass `null` to show everything, as the editor camera does. Returns the number of hidden entities.
 * Culling changes only `Object3D.visible`, so it never reaches the frame, the session or a snapshot.
 */
export function applyDistanceCulling3D(instances: ReadonlyMap<string, RenderInstance>, frame: GameRenderFrame3D, camera: THREE.Object3D | null): number {
  if (camera) { camera.getWorldPosition(cameraPosition); }
  let culled = 0;
  for (const entity of frame.entities) {
    const object = instances.get(entity.entityId)?.object;
    if (!object) { continue; }
    const limit = camera ? entity.cullDistance : undefined;
    const visible = limit === undefined || object.position.distanceToSquared(cameraPosition) <= limit * limit;
    object.visible = visible;
    if (!visible) { culled += 1; }
  }
  return culled;
}
