import * as THREE from "three";
import type { GamePrimitive3D } from "@nodetool-ai/protocol";
export function createPrimitiveMaterial(settings: GamePrimitive3D["material"], plane: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: settings.color, roughness: settings.roughness,
    metalness: settings.metalness, opacity: settings.opacity, transparent: settings.alphaMode === "blend",
    alphaTest: settings.alphaMode === "mask" ? settings.alphaCutoff : 0,
    emissive: settings.emissive ?? "#000000", side: plane ? THREE.DoubleSide : THREE.FrontSide });
}
