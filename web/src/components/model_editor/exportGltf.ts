import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import { HIDDEN_EXTRA } from "./sceneOps";
import { isLightTarget } from "./sceneTree";

/**
 * Set the scene up for the exporter and return the function that undoes it.
 *
 * - Hidden objects are written with a `nodetool_hidden` extra and made
 *   visible for the export, because the exporter drops invisible nodes and
 *   glTF has no visibility flag.
 * - A light's target child is hidden for the export. The light's direction
 *   already encodes it, and writing it as a node would add an empty child to
 *   the light on every save.
 */
const prepareForExport = (root: THREE.Object3D): (() => void) => {
  const revealed: THREE.Object3D[] = [];
  const skipped: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node === root) {
      return;
    }
    if (isLightTarget(node)) {
      if (node.visible) {
        node.visible = false;
        skipped.push(node);
      }
      return;
    }
    if (!node.visible) {
      node.visible = true;
      node.userData[HIDDEN_EXTRA] = true;
      revealed.push(node);
    }
  });
  return () => {
    for (const node of revealed) {
      node.visible = false;
      delete node.userData[HIDDEN_EXTRA];
    }
    for (const node of skipped) {
      node.visible = true;
    }
  };
};

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
  const restore = prepareForExport(root);
  return new Promise<Blob>((resolve, reject) => {
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
  }).finally(restore);
};
