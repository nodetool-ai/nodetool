import * as THREE from "three";
import type { CachedModel, RenderInstance } from "../types.js";
export function releaseInstance(instance: RenderInstance): void {
  instance.mixer?.stopAllAction();
  instance.mixer?.uncacheRoot(instance.object);
  const skeletons = new Set<THREE.Skeleton>();
  instance.object.traverse((object) => { if (object instanceof THREE.SkinnedMesh) { skeletons.add(object.skeleton); } });
  skeletons.forEach((skeleton) => skeleton.dispose());
  instance.materials.forEach((material) => material.dispose());
  instance.primitiveGeometry?.dispose();
  instance.object.removeFromParent();
}

export function releaseModel(model: CachedModel): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  model.gltf.scenes.forEach((scene) => scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => {
        materials.add(material);
        for (const value of Object.values(material)) { if (value instanceof THREE.Texture) { textures.add(value); } }
      });
    }
  }));
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => {
    const image: unknown = texture.source.data;
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) { image.close(); }
    texture.dispose();
  });
}
