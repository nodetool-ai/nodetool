/**
 * Camera math for keeping the selection in view after a transform edit.
 * Pure functions over three.js math types, so they run without WebGL.
 */
import * as THREE from "three";

/** Margin applied when framing, so the object does not touch the edges. */
export const FRAME_MARGIN = 1.4;

/**
 * True when `point` lies outside the camera's view volume. The camera's
 * world matrix must be current; callers update it first.
 */
export const isOutOfView = (point: THREE.Vector3, camera: THREE.Camera): boolean => {
  const matrix = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  return !new THREE.Frustum().setFromProjectionMatrix(matrix).containsPoint(point);
};

/** Camera distance at which a sphere of `radius` fits the narrower field of view. */
export const fitDistance = (radius: number, camera: THREE.PerspectiveCamera): number => {
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const fov = Math.min(vFov, hFov);
  return (radius / Math.sin(fov / 2)) * FRAME_MARGIN;
};

/**
 * Camera position that looks at `sphere` from the current viewing direction.
 * It keeps the current distance unless the sphere would not fit, so the
 * view re-targets without zooming in on a small part.
 */
export const followPosition = (
  camera: THREE.PerspectiveCamera,
  orbitTarget: THREE.Vector3,
  sphere: THREE.Sphere
): THREE.Vector3 => {
  const offset = camera.position.clone().sub(orbitTarget);
  const current = offset.length();
  const direction =
    current < 1e-4 ? new THREE.Vector3(1, 0.7, 1).normalize() : offset.divideScalar(current);
  const distance = Math.max(current, fitDistance(sphere.radius, camera));
  return sphere.center.clone().add(direction.multiplyScalar(distance));
};
