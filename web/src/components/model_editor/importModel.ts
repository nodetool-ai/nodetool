import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { USDLoader } from "three/examples/jsm/loaders/USDLoader.js";

import {
  clearObjectIds,
  removeStrayLightChildren,
  restoreEditorSettings,
  restoreHiddenFlags,
  restoreNodeNames,
  type LoadedGltfNames
} from "./sceneOps";
import { disposeObject } from "./sceneTree";

/** Every file type the editor can add to a scene, by lowercase extension. */
export const MODEL_EXTENSIONS = [
  "glb",
  "gltf",
  "obj",
  "fbx",
  "stl",
  "ply",
  "dae",
  "3mf",
  "usdz",
  "usda",
  "usdc"
] as const;
type ModelExtension = (typeof MODEL_EXTENSIONS)[number];

const MODEL_EXTENSION = new RegExp(`\\.(${MODEL_EXTENSIONS.join("|")})$`, "i");

/** Value for a file input's `accept`: models plus the files they reference. */
export const IMPORT_ACCEPT = [
  ...MODEL_EXTENSIONS.map((ext) => `.${ext}`),
  ".mtl",
  ".bin",
  "image/*"
].join(",");

/** "a .glb, .gltf, … or .usdc file", for error messages. */
export const MODEL_FORMATS_LABEL = `${MODEL_EXTENSIONS.slice(0, -1)
  .map((ext) => `.${ext}`)
  .join(", ")} or .${MODEL_EXTENSIONS[MODEL_EXTENSIONS.length - 1]}`;

export const isModelFileName = (name: string): boolean => MODEL_EXTENSION.test(name);

const extensionOf = (name: string): ModelExtension =>
  (MODEL_EXTENSION.exec(name)?.[1].toLowerCase() ?? "glb") as ModelExtension;

/** "Chair.final.glb" → "Chair.final". */
export const modelNameFromFile = (fileName: string): string =>
  fileName.replace(MODEL_EXTENSION, "").trim() || "Model";

const baseName = (path: string): string => {
  const clean = path.split(/[?#]/)[0];
  const name = clean.slice(Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\")) + 1);
  try {
    return decodeURIComponent(name).toLowerCase();
  } catch {
    return name.toLowerCase();
  }
};

/**
 * A loading manager that serves the files picked alongside a model (an
 * `.mtl`, a `.bin`, textures) from memory, matched by file name, because a
 * picked file has no URL its siblings can be resolved against.
 * `settled` waits until every texture the loader started has arrived, so the
 * model is placed with its textures, and then frees the object URLs.
 */
const createCompanionManager = (
  companions: readonly File[]
): { manager: THREE.LoadingManager; settled: () => Promise<void> } => {
  const manager = new THREE.LoadingManager();
  const byName = new Map(companions.map((file) => [file.name.toLowerCase(), file]));
  const urls: string[] = [];
  manager.setURLModifier((url) => {
    const file = byName.get(baseName(url));
    if (!file) {
      return url;
    }
    const objectUrl = URL.createObjectURL(file);
    urls.push(objectUrl);
    return objectUrl;
  });
  let pending = 0;
  let waiters: (() => void)[] = [];
  const itemStart = manager.itemStart.bind(manager);
  const itemEnd = manager.itemEnd.bind(manager);
  const itemError = manager.itemError.bind(manager);
  const finishOne = () => {
    pending -= 1;
    if (pending === 0) {
      waiters.forEach((resolve) => resolve());
      waiters = [];
    }
  };
  manager.itemStart = (url) => {
    pending += 1;
    itemStart(url);
  };
  manager.itemEnd = (url) => {
    itemEnd(url);
    finishOne();
  };
  manager.itemError = (url) => {
    itemError(url);
    finishOne();
  };
  const settled = async () => {
    if (pending > 0) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    for (const url of urls) {
      URL.revokeObjectURL(url);
    }
  };
  return { manager, settled };
};

/**
 * glTF and FBX carry PBR materials already. OBJ, Collada and 3MF give Phong,
 * Lambert or basic materials, which the Inspector cannot edit (it shows
 * roughness and metalness) and which glTF and USDZ export only in part.
 * Convert them, keeping color, textures, transparency and vertex colors.
 */
const toStandardMaterial = (material: THREE.Material): THREE.Material => {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    !(
      material instanceof THREE.MeshPhongMaterial ||
      material instanceof THREE.MeshLambertMaterial ||
      material instanceof THREE.MeshBasicMaterial
    )
  ) {
    return material;
  }
  const standard = new THREE.MeshStandardMaterial({
    name: material.name,
    color: material.color,
    map: material.map,
    alphaMap: material.alphaMap,
    aoMap: material.aoMap,
    opacity: material.opacity,
    transparent: material.transparent,
    alphaTest: material.alphaTest,
    side: material.side,
    vertexColors: material.vertexColors,
    metalness: 0,
    // Blinn-Phong shininess to GGX roughness, the usual approximation.
    roughness:
      material instanceof THREE.MeshPhongMaterial
        ? Math.min(1, Math.sqrt(2 / (material.shininess + 2)))
        : 1
  });
  if (!(material instanceof THREE.MeshBasicMaterial)) {
    standard.emissive.copy(material.emissive);
    standard.emissiveMap = material.emissiveMap;
    standard.normalMap = material.normalMap;
  }
  material.dispose();
  return standard;
};

const convertMaterials = (root: THREE.Object3D): void => {
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.material = Array.isArray(node.material)
        ? node.material.map(toStandardMaterial)
        : toStandardMaterial(node.material);
    }
  });
};

/**
 * STL and PLY hold one bare geometry. A PLY without faces is a point cloud,
 * which PLYLoader returns without an index.
 */
const objectFromGeometry = (
  geometry: THREE.BufferGeometry,
  name: string,
  asPoints = false
): THREE.Object3D => {
  const hasColors = geometry.hasAttribute("color");
  if (asPoints) {
    geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere?.radius || 1;
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ size: radius / 250, vertexColors: hasColors })
    );
    points.name = name;
    return points;
  }
  if (!geometry.hasAttribute("normal")) {
    geometry.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: hasColors ? 0xffffff : 0xb0b0b0,
      vertexColors: hasColors,
      roughness: 0.6,
      metalness: 0
    })
  );
  mesh.name = name;
  return mesh;
};

/**
 * Wrap a loaded glTF scene in one group, so the import is a single object in
 * the outliner that moves, hides and deletes as a unit. Its animations are
 * left out: they would play against the whole scene.
 */
const gltfToImportGroup = (gltf: GLTF, name: string): THREE.Group => {
  if (gltf.parser) {
    restoreNodeNames(gltf as unknown as LoadedGltfNames);
  }
  removeStrayLightChildren(gltf.scene);
  restoreHiddenFlags(gltf.scene);
  restoreEditorSettings(gltf.scene);
  clearObjectIds(gltf.scene);
  const group = new THREE.Group();
  group.name = name;
  for (const child of [...gltf.scene.children]) {
    group.add(child);
  }
  disposeObject(gltf.scene);
  return group;
};

/**
 * The same single group for the other formats. `attach` keeps the loaded
 * root's own transform, such as Collada's Z-up rotation, in its children.
 */
const objectToImportGroup = (loaded: THREE.Object3D, name: string): THREE.Group => {
  const group = new THREE.Group();
  group.name = name;
  convertMaterials(loaded);
  loaded.updateMatrixWorld(true);
  for (const child of [...loaded.children]) {
    group.attach(child);
  }
  if (loaded instanceof THREE.Mesh || loaded instanceof THREE.Points) {
    group.add(loaded);
  }
  return group;
};

const decodeText = (data: ArrayBuffer): string => new TextDecoder().decode(data);

/**
 * Parse model bytes into one import group. `path` is the base URL relative
 * resources resolve against; `companions` are picked files served by name.
 */
const parseModel = async (
  fileName: string,
  data: ArrayBuffer,
  path: string,
  companions: readonly File[]
): Promise<THREE.Group> => {
  const name = modelNameFromFile(fileName);
  const { manager, settled } = createCompanionManager(companions);
  let group: THREE.Group;
  switch (extensionOf(fileName)) {
    case "glb":
    case "gltf": {
      const gltf = await new GLTFLoader(manager).parseAsync(data, path);
      group = gltfToImportGroup(gltf, name);
      break;
    }
    case "obj": {
      const text = decodeText(data);
      const loader = new OBJLoader(manager);
      const mtlName = /^\s*mtllib\s+(.+?)\s*$/m.exec(text)?.[1];
      const mtl = mtlName
        ? companions.find((file) => file.name.toLowerCase() === baseName(mtlName))
        : undefined;
      if (mtl) {
        const materials = new MTLLoader(manager).parse(await mtl.text(), path);
        materials.preload();
        loader.setMaterials(materials);
      }
      group = objectToImportGroup(loader.parse(text), name);
      break;
    }
    case "fbx":
      group = objectToImportGroup(new FBXLoader(manager).parse(data, path), name);
      break;
    case "stl":
      group = objectToImportGroup(
        objectFromGeometry(new STLLoader(manager).parse(data), name),
        name
      );
      break;
    case "ply": {
      const geometry = new PLYLoader(manager).parse(data);
      group = objectToImportGroup(objectFromGeometry(geometry, name, !geometry.index), name);
      break;
    }
    case "dae": {
      const collada = new ColladaLoader(manager).parse(decodeText(data), path);
      if (!collada) {
        throw new Error(`${fileName} is not a valid Collada file.`);
      }
      group = objectToImportGroup(collada.scene, name);
      break;
    }
    case "3mf":
      group = objectToImportGroup(new ThreeMFLoader(manager).parse(data), name);
      break;
    case "usdz":
    case "usda":
    case "usdc":
      group = objectToImportGroup(new USDLoader(manager).parse(data, path), name);
      break;
  }
  await settled();
  return group;
};

/**
 * Parse a dropped or picked model file. `companions` are the other files
 * picked with it, such as the `.mtl` of an `.obj`, the `.bin` of a `.gltf`,
 * or their textures; they are matched to the model's references by name.
 */
export const importModelFile = async (
  file: File,
  companions: readonly File[] = []
): Promise<THREE.Group> => {
  if (!isModelFileName(file.name)) {
    throw new Error(`${file.name} is not a ${MODEL_FORMATS_LABEL} file.`);
  }
  return parseModel(file.name, await file.arrayBuffer(), "", companions);
};

/** Load a model asset by its resolved URL. Relative references resolve next to it. */
export const importModelUrl = async (url: string, name: string): Promise<THREE.Group> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${name} could not be downloaded (HTTP ${response.status}).`);
  }
  const path = url.slice(0, url.split(/[?#]/)[0].lastIndexOf("/") + 1);
  return parseModel(name, await response.arrayBuffer(), path, []);
};
