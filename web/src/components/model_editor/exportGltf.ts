import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import { HIDDEN_EXTRA } from "./sceneOps";
import { isLightTarget } from "./sceneTree";

/**
 * Set the scene up for the exporter and return the function that undoes it.
 *
 * - Hidden objects get a `nodetool_hidden` extra, because glTF has no
 *   visibility flag. The export runs with `onlyVisible: false` instead of
 *   showing them, since frames keep rendering while the export runs.
 * - A light's target child is taken out of its `children` list for the
 *   export. The light's direction already encodes it, and writing it as a
 *   node would add an empty child to the light on every save.
 */
const prepareForExport = (root: THREE.Object3D): (() => void) => {
  const flagged: THREE.Object3D[] = [];
  const targets: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node === root) {
      return;
    }
    if (isLightTarget(node)) {
      targets.push(node);
      return;
    }
    if (!node.visible) {
      node.userData[HIDDEN_EXTRA] = true;
      flagged.push(node);
    }
  });
  // Splice rather than `remove`, so `parent` stays and nothing is notified.
  const detached = targets.map((target) => {
    const siblings = (target.parent as THREE.Object3D).children;
    const index = siblings.indexOf(target);
    siblings.splice(index, 1);
    return { siblings, index, target };
  });
  return () => {
    for (const node of flagged) {
      delete node.userData[HIDDEN_EXTRA];
    }
    for (const { siblings, index, target } of detached.reverse()) {
      siblings.splice(index, 0, target);
    }
  };
};

/**
 * A skinned mesh whose bones were deleted would be written with `null`
 * joints, and the file would no longer load. Name it instead of saving.
 */
const assertSkinsComplete = (root: THREE.Object3D): void => {
  const inScene = new Set<THREE.Object3D>();
  root.traverse((node) => inScene.add(node));
  root.traverse((node) => {
    if (
      node instanceof THREE.SkinnedMesh &&
      node.skeleton.bones.some((bone) => !inScene.has(bone))
    ) {
      throw new Error(
        `${node.name || "A skinned mesh"} lost bones it is rigged to. Undo the delete of its armature or bones, or delete the mesh too, then save again.`
      );
    }
  });
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
  try {
    assertSkinsComplete(root);
  } catch (error) {
    return Promise.reject(error);
  }
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
      { binary: true, animations, onlyVisible: false }
    );
  }).finally(restore);
};
