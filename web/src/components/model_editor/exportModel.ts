import * as THREE from "three";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { PLYExporter } from "three/examples/jsm/exporters/PLYExporter.js";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";

import { exportSceneToGltf } from "./exportGltf";
import { cloneObjectDeep } from "./sceneOps";

export type ExportFormat = "glb" | "gltf" | "obj" | "stl" | "ply" | "usdz";

export interface ExportFormatInfo {
  format: ExportFormat;
  label: string;
  /** What the format keeps, shown next to it in the Export menu. */
  detail: string;
}

export const EXPORT_FORMATS: readonly ExportFormatInfo[] = [
  { format: "glb", label: "GLB", detail: "glTF binary, with materials and animation" },
  { format: "gltf", label: "glTF", detail: "glTF JSON, with embedded data" },
  { format: "obj", label: "OBJ", detail: "Geometry only" },
  { format: "stl", label: "STL", detail: "Geometry only, for 3D printing" },
  { format: "ply", label: "PLY", detail: "Geometry with vertex colors" },
  { format: "usdz", label: "USDZ", detail: "For Apple AR Quick Look" }
];

const MIME_TYPES: Record<ExportFormat, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  obj: "model/obj",
  stl: "model/stl",
  ply: "application/octet-stream",
  usdz: "model/vnd.usdz+zip"
};

/** "Chair" + "obj" → "Chair.obj". Characters file systems reject become "_". */
export const exportFileName = (baseName: string, format: ExportFormat): string => {
  const base = baseName.replace(/[\\/:*?"<>|]+/g, "_").trim() || "model";
  return `${base}.${format}`;
};

/**
 * Copy what an export writes into a fresh group: the visible part of
 * `sources`, placed where they sit relative to the editor root. The copy
 * lets mesh exporters read world matrices without touching the live scene,
 * and lets a nested selection keep its on-screen placement.
 */
const buildExportCopy = (root: THREE.Object3D, sources: THREE.Object3D[]): THREE.Group => {
  const copyRoot = new THREE.Group();
  copyRoot.name = root.name;
  root.updateWorldMatrix(true, true);
  const toRoot = root.matrixWorld.clone().invert();
  for (const source of sources) {
    if (!source.visible) {
      continue;
    }
    const copy = cloneObjectDeep(source);
    new THREE.Matrix4()
      .multiplyMatrices(toRoot, source.matrixWorld)
      .decompose(copy.position, copy.quaternion, copy.scale);
    const hidden: THREE.Object3D[] = [];
    copy.traverse((node) => {
      if (!node.visible) {
        hidden.push(node);
      }
    });
    for (const node of hidden) {
      node.removeFromParent();
    }
    copyRoot.add(copy);
  }
  copyRoot.updateMatrixWorld(true);
  return copyRoot;
};

/** The copies own cloned geometry. Materials share the live textures, so only their programs go. */
const disposeExportCopy = (copyRoot: THREE.Object3D): void => {
  copyRoot.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Points || node instanceof THREE.Line) {
      node.geometry.dispose();
    }
  });
};

const hasGeometry = (root: THREE.Object3D): boolean => {
  let found = false;
  root.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Points) {
      found = true;
    }
  });
  return found;
};

const encodeCopy = async (copyRoot: THREE.Group, format: ExportFormat): Promise<BlobPart> => {
  switch (format) {
    case "glb":
    case "gltf":
      return exportSceneToGltf(copyRoot, [], { binary: format === "glb", onlyVisible: true });
    case "obj":
      return new OBJExporter().parse(copyRoot);
    case "stl":
      return new STLExporter().parse(copyRoot, { binary: true });
    case "ply": {
      const result = new PLYExporter().parse(copyRoot, () => undefined, {
        binary: true,
        littleEndian: true
      });
      if (!result) {
        throw new Error("PLY export failed: a mesh has an index count that is not a multiple of 3.");
      }
      return result;
    }
    case "usdz":
      return new USDZExporter().parseAsync(copyRoot, { quickLookCompatible: true });
  }
};

export interface ExportModelOptions {
  /** Export only this object and its children instead of the whole scene. */
  selection?: THREE.Object3D | null;
  /** Clips loaded with the model. Only a whole-scene glTF export writes them. */
  animations?: THREE.AnimationClip[];
}

/**
 * Write the editor scene, or the selected object, as a file for another
 * tool. Hidden objects are left out. Unlike a save, this never changes the
 * asset the editor opened.
 */
export const exportModel = async (
  root: THREE.Object3D,
  format: ExportFormat,
  { selection, animations = [] }: ExportModelOptions = {}
): Promise<Blob> => {
  const isGltf = format === "glb" || format === "gltf";
  // The whole scene goes to GLTFExporter live, because the loaded clips
  // address its objects by uuid and a copy has new uuids.
  if (isGltf && !selection) {
    return exportSceneToGltf(root, animations, {
      binary: format === "glb",
      onlyVisible: true
    });
  }
  const copyRoot = buildExportCopy(root, selection ? [selection] : root.children);
  try {
    if (!isGltf && !hasGeometry(copyRoot)) {
      throw new Error(
        selection
          ? `${selection.name || "The selection"} has no visible mesh to export.`
          : "The scene has no visible mesh to export."
      );
    }
    const data = await encodeCopy(copyRoot, format);
    return data instanceof Blob ? data : new Blob([data], { type: MIME_TYPES[format] });
  } finally {
    disposeExportCopy(copyRoot);
  }
};
