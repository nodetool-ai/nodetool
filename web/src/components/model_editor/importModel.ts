import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  clearObjectIds,
  removeStrayLightChildren,
  restoreEditorSettings,
  restoreHiddenFlags,
  restoreNodeNames,
  type LoadedGltfNames
} from "./sceneOps";
import { disposeObject } from "./sceneTree";

const MODEL_EXTENSION = /\.(glb|gltf)$/i;

export const isModelFileName = (name: string): boolean => MODEL_EXTENSION.test(name);

/** "Chair.final.glb" → "Chair.final". */
export const modelNameFromFile = (fileName: string): string =>
  fileName.replace(MODEL_EXTENSION, "").trim() || "Model";

/**
 * Wrap a loaded glTF scene in one group, so the import is a single object in
 * the outliner that moves, hides and deletes as a unit. Its animations are
 * left out: they would play against the whole scene.
 */
const toImportGroup = (gltf: GLTF, name: string): THREE.Group => {
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

/** Parse a dropped or picked `.glb` / self-contained `.gltf` file. */
export const importModelFile = async (file: File): Promise<THREE.Group> => {
  if (!isModelFileName(file.name)) {
    throw new Error(`${file.name} is not a .glb or .gltf file.`);
  }
  const data = /\.gltf$/i.test(file.name) ? await file.text() : await file.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(data, "");
  return toImportGroup(gltf, modelNameFromFile(file.name));
};

/** Load a model asset by its resolved URL. */
export const importModelUrl = async (url: string, name: string): Promise<THREE.Group> => {
  const gltf = await new GLTFLoader().loadAsync(url);
  return toImportGroup(gltf, modelNameFromFile(name));
};
