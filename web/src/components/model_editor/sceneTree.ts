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
 * Recursively build a flattenable tree describing the editable scene graph.
 * Skips internal helper objects (TransformControls gizmo, grid, etc.) by only
 * walking the children of the supplied editor root.
 */
export const buildSceneTree = (
  root: THREE.Object3D,
  depth = 0
): SceneTreeNode[] => {
  return root.children.map((child) => ({
    uuid: child.uuid,
    name: displayName(child),
    type: child.type,
    visible: child.visible,
    depth,
    object: child,
    children: buildSceneTree(child, depth + 1)
  }));
};

export const flattenTree = (nodes: SceneTreeNode[]): SceneTreeNode[] => {
  const result: SceneTreeNode[] = [];
  const walk = (list: SceneTreeNode[]) => {
    for (const node of list) {
      result.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return result;
};

/** Recursively dispose geometries and materials owned by an object subtree. */
export const disposeObject = (object: THREE.Object3D): void => {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = (mesh as THREE.Mesh).material;
    if (Array.isArray(material)) {
      material.forEach((m) => m.dispose());
    } else if (material) {
      material.dispose();
    }
  });
};
