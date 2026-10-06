import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { GamePrimitive3D, GameModel3D } from "@nodetool-ai/protocol";
import type { CachedModel, RenderInstance } from "../types.js";
import { createPrimitiveMaterial } from "../materials/index.js";
export function primitiveInstance(primitive: GamePrimitive3D): RenderInstance {
  const size = primitive.dimensions;
  let geometry: THREE.BufferGeometry;
  if (primitive.kind === "box") { geometry = new THREE.BoxGeometry(size.x, size.y, size.z); }
  else if (primitive.kind === "sphere") { geometry = new THREE.SphereGeometry(0.5, 24, 16); geometry.scale(size.x, size.y, size.z); }
  else if (primitive.kind === "capsule") { geometry = new THREE.CapsuleGeometry(size.x / 2, Math.max(0, size.y - size.x), 8, 16); geometry.scale(1, 1, size.z / size.x); }
  else { geometry = new THREE.PlaneGeometry(size.x, size.z); geometry.rotateX(-Math.PI / 2); }
  const material = createPrimitiveMaterial(primitive.material, primitive.kind === "plane");
  const object = new THREE.Mesh(geometry, material);
  object.castShadow = primitive.castShadow;
  object.receiveShadow = primitive.receiveShadow;
  return { descriptor: JSON.stringify(primitive), object, materials: [material], primitiveGeometry: geometry };
}

export function modelInstance(model: GameModel3D, cached: CachedModel): RenderInstance {
  // SkeletonUtils duplicates the skin's bones and bind state while retaining immutable geometry/texture resources.
  const object = cloneSkeleton(cached.gltf.scene);
  let selected: THREE.Object3D | undefined;
  if (model.nodeId !== undefined) {
    object.traverse((child) => { if (child.userData.gameNodeId === model.nodeId) { selected = child; } });
    if (!selected) { throw new Error(`Prepared model node ${model.nodeId} does not exist`); }
  }
  const selectedNodes = new Set<THREE.Object3D>();
  selected?.traverse((child) => selectedNodes.add(child));
  const materials: THREE.Material[] = [];
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) { return; }
    child.visible = selected === undefined || selectedNodes.has(child);
    child.castShadow = model.castShadow;
    child.receiveShadow = model.receiveShadow;
    const original = Array.isArray(child.material) ? child.material : [child.material];
    const cloned = original.map((material) => {
      const copy = material.clone();
      if (copy instanceof THREE.MeshStandardMaterial && model.material) {
        const override = model.material;
        if (override.color !== undefined) { copy.color.set(override.color); }
        if (override.emissive !== undefined) { copy.emissive.set(override.emissive); }
        if (override.metalness !== undefined) { copy.metalness = override.metalness; }
        if (override.roughness !== undefined) { copy.roughness = override.roughness; }
        if (override.opacity !== undefined) { copy.opacity = override.opacity; }
        if (override.alphaMode !== undefined) { copy.transparent = override.alphaMode === "blend"; }
        if (override.alphaCutoff !== undefined && override.alphaMode === "mask") { copy.alphaTest = override.alphaCutoff; }
      }
      copy.userData.baseOpacity = copy.opacity;
      copy.userData.baseTransparent = copy.transparent;
      materials.push(copy);
      return copy;
    });
    child.material = Array.isArray(child.material) ? cloned : cloned[0] ?? child.material;
  });
  return { descriptor: JSON.stringify(model), object, materials, mixer: new THREE.AnimationMixer(object), clips: cached.gltf.animations };
}
