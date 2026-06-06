import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

/**
 * Serialize a Three.js object/scene to a binary glTF (.glb) Blob.
 * Used to persist edits made in the 3D model editor back to an asset.
 */
export const exportSceneToGlb = (root: THREE.Object3D): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      root,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(new Blob([result], { type: "model/gltf-binary" }));
        } else {
          const json = JSON.stringify(result);
          resolve(new Blob([json], { type: "model/gltf+json" }));
        }
      },
      (error) => reject(error),
      { binary: true }
    );
  });
};
