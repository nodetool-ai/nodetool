import * as THREE from "three";

export interface SceneTreeNode {
  uuid: string;
  name: string;
  type: string;
  visible: boolean;
  depth: number;
  object: THREE.Object3D;
  children: SceneTreeNode[];
}

const displayName = (object: THREE.Object3D): string => {
  if (object.name) {
    return object.name;
  }
  return object.type;
};

/**
 * True for the target object a directional or spot light carries as a child.
 * It only aims the light, so the outliner and agent tools leave it out: moving
 * or deleting it on its own would silently re-aim or break the light.
 */
export const isLightTarget = (object: THREE.Object3D): boolean => {
  const parent = object.parent;
  return (
    (parent instanceof THREE.DirectionalLight ||
      parent instanceof THREE.SpotLight) &&
    parent.target === object
  );
};

/**
 * Recursively build a flattenable tree describing the editable scene graph.
 * Skips internal helper objects (TransformControls gizmo, grid, etc.) by only
 * walking the children of the supplied editor root.
 */
export const buildSceneTree = (
  root: THREE.Object3D,
  depth = 0
): SceneTreeNode[] => {
  return root.children
    .filter((child) => !isLightTarget(child))
    .map((child) => ({
      uuid: child.uuid,
      name: displayName(child),
      type: child.type,
      visible: child.visible,
      depth,
      object: child,
      children: buildSceneTree(child, depth + 1)
    }));
};

const disposeMaterial = (material: THREE.Material): void => {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
};

/**
 * Recursively dispose geometries, materials, and the textures those materials
 * reference within an object subtree.
 */
export const disposeObject = (object: THREE.Object3D): void => {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    child.geometry?.dispose();
    const material = child.material;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
    } else if (material) {
      disposeMaterial(material);
    }
  });
};

/** Remove and dispose every child of the editor root. */
export const clearScene = (root: THREE.Object3D): void => {
  while (root.children.length > 0) {
    const child = root.children[0];
    root.remove(child);
    disposeObject(child);
  }
};

/**
 * Replace the editor root's content with a loaded glTF scene's top-level
 * nodes. Adopting the nodes rather than the scene group keeps a save and
 * reload round trip from wrapping the model in one more group each time.
 */
export const replaceSceneContent = (
  root: THREE.Object3D,
  loaded: THREE.Object3D
): void => {
  clearScene(root);
  for (const child of [...loaded.children]) {
    root.add(child);
  }
};
