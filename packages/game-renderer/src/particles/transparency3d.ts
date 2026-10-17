import * as THREE from "three";
import type { RenderItem } from "three/src/renderers/webgl/WebGLRenderLists.js";

/** Merges particle runs into Three's object-sorted transparency, without changing scene materials or transforms. */
export class ParticleTransparency3D {
  private readonly runs = new Map<THREE.Object3D, { z: number; order: number }>();
  private readonly projected = new THREE.Vector4();
  private readonly center = new THREE.Vector3();
  private readonly projectionView = new THREE.Matrix4();
  private readonly frustum = new THREE.Frustum();

  clear(): void { this.runs.clear(); }

  add(object: THREE.Object3D, depth: number, order: number, camera: THREE.Camera): void {
    this.projected.set(0, 0, -depth, 1).applyMatrix4(camera.projectionMatrix);
    // Three r185 sorts Vector4 clip-space z, without the perspective divide.
    this.runs.set(object, { z: this.projected.z, order });
  }

  /** Ordinary items retain Three's group/render order, depth and id comparisons. Equal-depth particles retain field order. */
  readonly compare = (a: RenderItem, b: RenderItem): number => {
    if (a.groupOrder !== b.groupOrder) { return a.groupOrder - b.groupOrder; }
    if (a.renderOrder !== b.renderOrder) { return a.renderOrder - b.renderOrder; }
    const first = this.runs.get(a.object);
    const second = this.runs.get(b.object);
    const depth = (second?.z ?? b.z) - (first?.z ?? a.z);
    if (depth !== 0) { return depth; }
    if (first && second) { return first.order - second.order; }
    // At a boundary, ordinary items precede particles at the same depth. This is also the packer's split rule.
    if (first) { return 1; }
    if (second) { return -1; }
    return a.id - b.id;
  };

  /** Only the default ordering bucket can interleave with particles. Other buckets retain their explicit priority. */
  depths(scene: THREE.Scene, camera: THREE.Camera, particles: THREE.Object3D): number[] {
    if (scene.matrixWorldAutoUpdate) { scene.updateMatrixWorld(); }
    this.projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projectionView, camera.coordinateSystem, camera.reversedDepth);
    const depths: number[] = [];
    const pending: { object: THREE.Object3D; groupOrder: number }[] = [{ object: scene, groupOrder: 0 }];
    while (pending.length > 0) {
      const entry = pending.pop();
      if (!entry) { break; }
      const { object } = entry;
      if (!object.visible || object === particles) { continue; }
      let groupOrder = entry.groupOrder;
      if (object.layers.test(camera.layers)) {
        if (object instanceof THREE.Group) { groupOrder = object.renderOrder; }
        if (groupOrder === 0 && object.renderOrder === 0) {
          if (object instanceof THREE.Sprite && transparent(object.material)
            && (!object.frustumCulled || this.frustum.intersectsSprite(object))) {
            this.center.setFromMatrixPosition(object.matrixWorld);
            depths.push(-this.center.applyMatrix4(camera.matrixWorldInverse).z);
          } else if ((object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)
            && hasTransparentDraw(object) && (!object.frustumCulled || this.frustum.intersectsObject(object))) {
            // Match WebGLRenderer.projectObject: object bounds for instancing/skinning, geometry bounds otherwise.
            if (object instanceof THREE.InstancedMesh || object instanceof THREE.SkinnedMesh) {
              if (object.boundingSphere === null) { object.computeBoundingSphere(); }
              if (!object.boundingSphere) { continue; }
              this.center.copy(object.boundingSphere.center);
            } else {
              if (object.geometry.boundingSphere === null) { object.geometry.computeBoundingSphere(); }
              if (!object.geometry.boundingSphere) { continue; }
              this.center.copy(object.geometry.boundingSphere.center);
            }
            this.center.applyMatrix4(object.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
            depths.push(-this.center.z);
          }
        }
      }
      for (const child of object.children) { pending.push({ object: child, groupOrder }); }
    }
    return depths;
  }
}

function transparent(material: THREE.Material): boolean {
  // Three renders transmission in a separate list before ordinary transparent objects.
  return material.visible && material.transparent && !(material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0);
}

function hasTransparentDraw(object: THREE.Mesh | THREE.Line | THREE.Points): boolean {
  const material = object.material;
  if (!Array.isArray(material)) { return transparent(material); }
  return object.geometry.groups.some(group => {
    const entry = material[group.materialIndex ?? 0];
    return entry !== undefined && transparent(entry);
  });
}
