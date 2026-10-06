import { Object3D } from "three";

export function syncGameTransformTarget3D(target: Object3D, rendered: Object3D | null): boolean {
  if (!rendered) { return false; }
  rendered.updateWorldMatrix(true, false);
  rendered.matrixWorld.decompose(target.position, target.quaternion, target.scale);
  target.updateMatrixWorld(true);
  return true;
}
