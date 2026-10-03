import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

/**
 * Serialize the editor root's content to a binary glTF (.glb) Blob.
 * Used to persist edits made in the 3D model editor back to an asset.
 *
 * The root's children become the glTF scene's top-level nodes, so the root
 * group itself is not written as an extra wrapper node. `animations` are the
 * clips loaded with the model; without them a save would strip them.
 */
export const exportSceneToGlb = (
  root: THREE.Object3D,
  animations: THREE.AnimationClip[] = []
): Promise<Blob> => {
  // Same technique as GLTFExporter's own AuxScene: push to `children` instead
  // of calling `add`, so the live objects keep their parent in the editor.
  const scene = new THREE.Scene();
  scene.name = root.name;
  scene.children.push(...root.children);
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(new Blob([result], { type: "model/gltf-binary" }));
        } else {
          const json = JSON.stringify(result);
          resolve(new Blob([json], { type: "model/gltf+json" }));
        }
      },
      (error) => reject(error),
      { binary: true, animations }
    );
  });
};
