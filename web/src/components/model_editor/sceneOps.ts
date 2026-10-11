import * as THREE from "three";
import { listObjectIds, type GltfNode } from "@nodetool-ai/model3d";

/**
 * glTF has no visibility flag, so a hidden object is saved with this key in its
 * node `extras` and hidden again when the file is loaded.
 */
export const HIDDEN_EXTRA = "nodetool_hidden";

/** The stable object id `@nodetool-ai/model3d` stores in node `extras`. */
export const OBJECT_ID_EXTRA = "nodetool_id";

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
  const copyOf = new Map<THREE.Object3D, THREE.Object3D>();
  sources.forEach((node, index) => copyOf.set(node, copies[index]));
  copies.forEach((node, index) => {
    const original = sources[index];
    // The headless scene tools address objects by this id. A copy is a new
    // object, so it must not answer to the original's id.
    delete node.userData[OBJECT_ID_EXTRA];
    if (node instanceof THREE.Mesh && original instanceof THREE.Mesh) {
      node.geometry = original.geometry.clone();
      node.material = cloneMaterial(original.material);
    }
    // `clone` keeps the original's skeleton, so the copy would deform with the
    // source's bones and stay where the source is. Bind it to the copied
    // bones; a bone outside the copied subtree stays shared.
    if (node instanceof THREE.SkinnedMesh && original instanceof THREE.SkinnedMesh) {
      const bones = original.skeleton.bones.map(
        (bone) => (copyOf.get(bone) as THREE.Bone | undefined) ?? bone
      );
      const inverses = original.skeleton.boneInverses.map((matrix) => matrix.clone());
      node.bind(new THREE.Skeleton(bones, inverses), original.bindMatrix);
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

/**
 * The key `@nodetool-ai/model3d` writes when the agent hides an object with
 * no editor open.
 */
export const HEADLESS_VISIBLE_EXTRA = "visible";

/** Hide objects whose saved extras say they were hidden, then drop the flags. */
export const restoreHiddenFlags = (root: THREE.Object3D): void => {
  root.traverse((node) => {
    if (
      node.userData[HIDDEN_EXTRA] === true ||
      node.userData[HEADLESS_VISIBLE_EXTRA] === false
    ) {
      node.visible = false;
    }
    delete node.userData[HIDDEN_EXTRA];
    delete node.userData[HEADLESS_VISIBLE_EXTRA];
  });
};

/**
 * Extra holding the Inspector settings glTF cannot express: material
 * wireframe, flat shading, back-face side, depth flags, vertex colors turned
 * off, and per-object shadows, culling and render order. Only values that
 * differ from what a plain load gives are written.
 */
export const EDITOR_SETTINGS_EXTRA = "nodetool_editor";

type Settings = Record<string, boolean | number>;

export const materialsOf = (node: THREE.Object3D): THREE.Material[] => {
  if (!(node instanceof THREE.Mesh)) {
    return [];
  }
  return Array.isArray(node.material) ? node.material : [node.material];
};

/**
 * The settings of `material` the exporter would lose. `hasVertexColors` says
 * whether a mesh using it has a color attribute: the loader turns vertex
 * colors on for those, so only then is an "off" worth writing.
 */
export const materialEditorSettings = (
  material: THREE.Material,
  hasVertexColors: boolean
): Settings => {
  const settings: Settings = {};
  if ("wireframe" in material && material.wireframe === true) {
    settings.wireframe = true;
  }
  if ("flatShading" in material && material.flatShading === true) {
    settings.flatShading = true;
  }
  if (material.side === THREE.BackSide) {
    settings.backSide = true;
  }
  if (!material.depthTest) {
    settings.depthTest = false;
  }
  if (!material.depthWrite) {
    settings.depthWrite = false;
  }
  if (hasVertexColors && !material.vertexColors) {
    settings.vertexColors = false;
  }
  return settings;
};

/** The settings of `node` the exporter would lose. */
export const objectEditorSettings = (node: THREE.Object3D): Settings => {
  const settings: Settings = {};
  if (node.castShadow) {
    settings.castShadow = true;
  }
  if (node.receiveShadow) {
    settings.receiveShadow = true;
  }
  if (!node.frustumCulled) {
    settings.frustumCulled = false;
  }
  if (node.renderOrder !== 0) {
    settings.renderOrder = node.renderOrder;
  }
  return settings;
};

const readSettings = (userData: Record<string, unknown>): Settings | null => {
  const value = userData[EDITOR_SETTINGS_EXTRA];
  delete userData[EDITOR_SETTINGS_EXTRA];
  return value !== null && typeof value === "object" ? (value as Settings) : null;
};

const applyObjectSettings = (node: THREE.Object3D, settings: Settings): void => {
  if (settings.castShadow === true) {
    node.castShadow = true;
  }
  if (settings.receiveShadow === true) {
    node.receiveShadow = true;
  }
  if (settings.frustumCulled === false) {
    node.frustumCulled = false;
  }
  if (typeof settings.renderOrder === "number") {
    node.renderOrder = settings.renderOrder;
  }
};

/**
 * Put back the settings saved under {@link EDITOR_SETTINGS_EXTRA}, then drop
 * the extras. A multi-material mesh loads as a group of meshes, so a group's
 * object settings also go to its mesh children.
 */
export const restoreEditorSettings = (root: THREE.Object3D): void => {
  root.traverse((node) => {
    const objectSettings = readSettings(node.userData);
    if (objectSettings) {
      applyObjectSettings(node, objectSettings);
      if (!(node instanceof THREE.Mesh)) {
        for (const child of node.children) {
          if (child instanceof THREE.Mesh) {
            applyObjectSettings(child, objectSettings);
          }
        }
      }
    }
    for (const material of materialsOf(node)) {
      const settings = readSettings(material.userData);
      if (!settings) {
        continue;
      }
      const bag = material as THREE.Material & { wireframe?: boolean; flatShading?: boolean };
      if (settings.wireframe === true && "wireframe" in bag) {
        bag.wireframe = true;
      }
      if (settings.flatShading === true && "flatShading" in bag) {
        bag.flatShading = true;
      }
      if (settings.backSide === true) {
        material.side = THREE.BackSide;
      }
      if (settings.depthTest === false) {
        material.depthTest = false;
      }
      if (settings.depthWrite === false) {
        material.depthWrite = false;
      }
      if (settings.vertexColors === false) {
        material.vertexColors = false;
      }
      material.needsUpdate = true;
    }
  });
};

/** The part of a loaded glTF that {@link restoreNodeNames} reads. */
export interface LoadedGltfNames {
  scene: THREE.Object3D;
  parser: {
    json: { nodes?: GltfNode[] };
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
 * Give every loaded object the id the agent's scene tools list it under.
 * Without one stored, that id is `node-<index>`, and the editor saves nodes
 * in its own order, so after a save the same id would name another object.
 * Run before anything adds or removes objects.
 */
export const stampObjectIds = (gltf: LoadedGltfNames): void => {
  const ids = listObjectIds(gltf.parser.json.nodes ?? []);
  gltf.scene.traverse((object) => {
    const index = gltf.parser.associations.get(object)?.nodes;
    if (index !== undefined && ids[index] !== undefined) {
      object.userData[OBJECT_ID_EXTRA] = ids[index];
    }
  });
};

/**
 * Drop stored object ids from a model imported from another file. Its ids
 * belong to that file's objects, and could equal ids in this scene.
 */
export const clearObjectIds = (root: THREE.Object3D): void => {
  root.traverse((object) => {
    delete object.userData[OBJECT_ID_EXTRA];
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
 * raised ("Crate 2" → "Crate 3"), or `base 2` when it has no number. Names
 * compare trimmed and case-insensitively, as the agent tools look them up.
 */
export const nextAvailableName = (base: string, taken: ReadonlySet<string>): string => {
  const used = new Set(Array.from(taken, (name) => name.trim().toLowerCase()));
  const isTaken = (name: string): boolean => used.has(name.toLowerCase());
  const trimmed = base.trim() || "Object";
  if (!isTaken(trimmed)) {
    return trimmed;
  }
  const match = /^(.*?)([ _.-]?)(\d+)$/.exec(trimmed);
  const stem = match ? match[1] : trimmed;
  const separator = match ? match[2] : " ";
  let counter = match ? Number(match[3]) + 1 : 2;
  while (isTaken(`${stem}${separator}${counter}`)) {
    counter += 1;
  }
  return `${stem}${separator}${counter}`;
};
