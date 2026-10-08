import * as THREE from "three";

/**
 * glTF has no visibility flag, so a hidden object is saved with this key in its
 * node `extras` and hidden again when the file is loaded.
 */
export const HIDDEN_EXTRA = "nodetool_hidden";

const cloneMaterial = (
  material: THREE.Material | THREE.Material[]
): THREE.Material | THREE.Material[] =>
  Array.isArray(material) ? material.map((m) => m.clone()) : material.clone();

/**
 * Copy an object subtree with its own geometry and materials, so editing or
 * deleting the copy never changes the original. `Object3D.clone` shares both.
 */
export const cloneObjectDeep = (source: THREE.Object3D): THREE.Object3D => {
  const copy = source.clone(true);
  const sources: THREE.Object3D[] = [];
  const copies: THREE.Object3D[] = [];
  source.traverse((node) => sources.push(node));
  copy.traverse((node) => copies.push(node));
  copies.forEach((node, index) => {
    const original = sources[index];
    if (node instanceof THREE.Mesh && original instanceof THREE.Mesh) {
      node.geometry = original.geometry.clone();
      node.material = cloneMaterial(original.material);
    }
    // A cloned directional or spot light gets a fresh target that is not in
    // the tree. Point it back at the copy of the original's target child.
    if (
      (node instanceof THREE.DirectionalLight || node instanceof THREE.SpotLight) &&
      (original instanceof THREE.DirectionalLight ||
        original instanceof THREE.SpotLight)
    ) {
      const targetIndex = original.children.indexOf(original.target);
      if (targetIndex >= 0) {
        node.target = node.children[targetIndex];
      }
    }
  });
  return copy;
};

export interface SceneStats {
  objects: number;
  meshes: number;
  lights: number;
  vertices: number;
  triangles: number;
}

const triangleCount = (geometry: THREE.BufferGeometry): number => {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  if (index) {
    return Math.floor(index.count / 3);
  }
  return position ? Math.floor(position.count / 3) : 0;
};

/** Count what the editor root contains. Hidden subtrees still count. */
export const computeSceneStats = (root: THREE.Object3D): SceneStats => {
  const stats: SceneStats = {
    objects: 0,
    meshes: 0,
    lights: 0,
    vertices: 0,
    triangles: 0
  };
  root.traverse((node) => {
    if (node === root) {
      return;
    }
    const parent = node.parent;
    const isTarget =
      (parent instanceof THREE.DirectionalLight ||
        parent instanceof THREE.SpotLight) &&
      parent.target === node;
    if (isTarget) {
      return;
    }
    stats.objects += 1;
    if (node instanceof THREE.Light) {
      stats.lights += 1;
    }
    if (node instanceof THREE.Mesh) {
      stats.meshes += 1;
      const position = node.geometry.getAttribute("position");
      stats.vertices += position ? position.count : 0;
      stats.triangles += triangleCount(node.geometry);
    }
  });
  return stats;
};

/**
 * Point every animation track at its node's uuid instead of its name.
 * GLTFLoader binds tracks by node name, so a rename would silently drop the
 * track on the next save. `PropertyBinding.findNode` matches uuids too, so
 * playback and the exporter still resolve the retargeted tracks.
 */
export const bindTracksToUuids = (
  clips: THREE.AnimationClip[],
  root: THREE.Object3D
): void => {
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      const node = THREE.PropertyBinding.findNode(root, parsed.nodeName) as
        | THREE.Object3D
        | undefined;
      if (!node || node.uuid === parsed.nodeName) {
        continue;
      }
      track.name = `${node.uuid}${track.name.slice(parsed.nodeName.length)}`;
    }
  }
};

/** Hide objects whose saved extras say they were hidden, then drop the flag. */
export const restoreHiddenFlags = (root: THREE.Object3D): void => {
  root.traverse((node) => {
    if (node.userData[HIDDEN_EXTRA] === true) {
      node.visible = false;
    }
    delete node.userData[HIDDEN_EXTRA];
  });
};

/** The part of a loaded glTF that {@link restoreNodeNames} reads. */
export interface LoadedGltfNames {
  scene: THREE.Object3D;
  parser: {
    json: { nodes?: { name?: string }[] };
    associations: Map<THREE.Object3D | THREE.Material | THREE.Texture, { nodes?: number }>;
  };
}

/**
 * Give nodes back the names written in the file. GLTFLoader replaces spaces
 * and punctuation with underscores, so "Crate 1" would come back as
 * "Crate_1". Run {@link bindTracksToUuids} first: tracks still use the
 * loader's names until then.
 */
export const restoreNodeNames = (gltf: LoadedGltfNames): void => {
  const nodes = gltf.parser.json.nodes ?? [];
  gltf.scene.traverse((object) => {
    const index = gltf.parser.associations.get(object)?.nodes;
    if (index === undefined) {
      return;
    }
    const name = nodes[index]?.name;
    if (name && name.trim()) {
      object.name = name;
    }
  });
};

/**
 * Remove the empty child earlier versions of the editor saved under each
 * directional and spot light: the light's target written as a node. The
 * loader gives the light a fresh target, so the old one only clutters the
 * scene list.
 */
export const removeStrayLightChildren = (root: THREE.Object3D): void => {
  const lights: (THREE.DirectionalLight | THREE.SpotLight)[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.DirectionalLight || node instanceof THREE.SpotLight) {
      lights.push(node);
    }
  });
  for (const light of lights) {
    for (const child of [...light.children]) {
      if (
        child !== light.target &&
        child.type === "Object3D" &&
        child.name === "" &&
        child.children.length === 0
      ) {
        light.remove(child);
      }
    }
  }
};

/**
 * A name not in `taken`: `base` itself, or `base` with its trailing number
 * raised ("Crate 2" → "Crate 3"), or `base 2` when it has no number.
 */
export const nextAvailableName = (base: string, taken: ReadonlySet<string>): string => {
  const trimmed = base.trim() || "Object";
  if (!taken.has(trimmed)) {
    return trimmed;
  }
  const match = /^(.*?)([ _.-]?)(\d+)$/.exec(trimmed);
  const stem = match ? match[1] : trimmed;
  const separator = match ? match[2] : " ";
  let counter = match ? Number(match[3]) + 1 : 2;
  while (taken.has(`${stem}${separator}${counter}`)) {
    counter += 1;
  }
  return `${stem}${separator}${counter}`;
};
