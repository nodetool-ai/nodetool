/**
 * The static check behind `validate_model3d`: what a reader can decide about a
 * glTF document without rendering it.
 *
 * Errors are documents a viewer would reject or a scene operation would
 * stumble over — a node index nothing resolves, a mesh reading an accessor the
 * file lacks, a hierarchy that loops. Warnings are documents that load but read
 * wrong: an empty scene, an unlit one, duplicate names the "uuid or name"
 * addressing cannot tell apart.
 */

import type { GltfJson } from "./gltf.js";
import { listScene } from "./scene.js";

export type Model3DIssueSeverity = "error" | "warning";

export interface Model3DIssue {
  severity: Model3DIssueSeverity;
  message: string;
  /** Where the issue sits, e.g. `nodes[3]` or `meshes[0].primitives[1]`. */
  path?: string;
}

export interface Model3DValidation {
  ok: boolean;
  errors: Model3DIssue[];
  warnings: Model3DIssue[];
  objectCount: number;
}

const LIGHTS_EXTENSION = "KHR_lights_punctual";

/** Extensions this build understands well enough to keep a document working. */
const SUPPORTED_EXTENSIONS = new Set([LIGHTS_EXTENSION]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Check a glTF document. Never throws: a broken file is a report, not a crash. */
export function validateModel3D(json: GltfJson): Model3DValidation {
  const errors: Model3DIssue[] = [];
  const warnings: Model3DIssue[] = [];
  const issue = (
    severity: Model3DIssueSeverity,
    message: string,
    path?: string
  ): Model3DIssue => {
    const entry: Model3DIssue = { severity, message };
    if (path) {
      entry.path = path;
    }
    return entry;
  };
  const error = (message: string, path?: string): void => {
    errors.push(issue("error", message, path));
  };
  const warn = (message: string, path?: string): void => {
    warnings.push(issue("warning", message, path));
  };

  const version = json.asset?.version;
  if (version !== "2.0") {
    error(
      `asset.version is ${version === undefined ? "missing" : `"${version}"`}; NodeTool reads glTF 2.0.`,
      "asset.version"
    );
  }

  for (const name of json.extensionsRequired ?? []) {
    if (!SUPPORTED_EXTENSIONS.has(name)) {
      error(
        `The document requires extension "${name}", which this build does not implement.`,
        "extensionsRequired"
      );
    }
  }

  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const accessors = json.accessors ?? [];
  const bufferViews = json.bufferViews ?? [];
  const buffers = json.buffers ?? [];
  const materials = json.materials ?? [];

  const inRange = (index: number, length: number): boolean =>
    Number.isInteger(index) && index >= 0 && index < length;

  const scenes = json.scenes ?? [];
  if (scenes.length === 0) {
    warn("The document declares no scene; nothing will render.", "scenes");
  }
  const sceneIndex = typeof json.scene === "number" ? json.scene : 0;
  if (scenes.length > 0 && !inRange(sceneIndex, scenes.length)) {
    error(
      `scene is ${sceneIndex}, but the document has ${scenes.length} scene(s).`,
      "scene"
    );
  }
  scenes.forEach((scene, index) => {
    for (const node of scene.nodes ?? []) {
      if (!inRange(node, nodes.length)) {
        error(
          `scenes[${index}] lists node ${node}, which the document does not have.`,
          `scenes[${index}].nodes`
        );
      }
    }
  });

  nodes.forEach((node, index) => {
    for (const child of node.children ?? []) {
      if (!inRange(child, nodes.length)) {
        error(
          `nodes[${index}] has child ${child}, which the document does not have.`,
          `nodes[${index}].children`
        );
      }
    }
    if (node.mesh !== undefined && !inRange(node.mesh, meshes.length)) {
      error(
        `nodes[${index}] references mesh ${node.mesh}, which the document does not have.`,
        `nodes[${index}].mesh`
      );
    }
    if (node.matrix !== undefined) {
      if (!Array.isArray(node.matrix) || node.matrix.length !== 16) {
        error(`nodes[${index}].matrix must hold 16 numbers.`, `nodes[${index}].matrix`);
      } else if (
        node.translation !== undefined ||
        node.rotation !== undefined ||
        node.scale !== undefined
      ) {
        error(
          `nodes[${index}] carries both a matrix and TRS fields; glTF allows one or the other.`,
          `nodes[${index}]`
        );
      }
    }
    for (const field of ["translation", "scale"] as const) {
      const value = node[field];
      if (value !== undefined && (!Array.isArray(value) || value.length !== 3)) {
        error(`nodes[${index}].${field} must hold 3 numbers.`, `nodes[${index}].${field}`);
      }
    }
    if (
      node.rotation !== undefined &&
      (!Array.isArray(node.rotation) || node.rotation.length !== 4)
    ) {
      error(
        `nodes[${index}].rotation must hold 4 numbers (a quaternion).`,
        `nodes[${index}].rotation`
      );
    }
    for (const [field, value] of Object.entries(node)) {
      if (Array.isArray(value) && value.some((n) => typeof n === "number" && !Number.isFinite(n))) {
        error(`nodes[${index}].${field} holds a non-finite number.`, `nodes[${index}].${field}`);
      }
    }
  });

  // A cycle in `children` hangs every consumer that walks the graph.
  const state = new Array<number>(nodes.length).fill(0);
  const walk = (index: number): boolean => {
    if (state[index] === 1) {
      return true;
    }
    if (state[index] === 2) {
      return false;
    }
    state[index] = 1;
    for (const child of nodes[index]?.children ?? []) {
      if (inRange(child, nodes.length) && walk(child)) {
        return true;
      }
    }
    state[index] = 2;
    return false;
  };
  for (let index = 0; index < nodes.length; index += 1) {
    if (state[index] === 0 && walk(index)) {
      error(
        `The node hierarchy contains a cycle reachable from nodes[${index}].`,
        `nodes[${index}].children`
      );
      break;
    }
  }

  meshes.forEach((mesh, meshIndex) => {
    if (!Array.isArray(mesh.primitives) || mesh.primitives.length === 0) {
      error(`meshes[${meshIndex}] has no primitives.`, `meshes[${meshIndex}]`);
      return;
    }
    mesh.primitives.forEach((primitive, primitiveIndex) => {
      const path = `meshes[${meshIndex}].primitives[${primitiveIndex}]`;
      const position = primitive.attributes?.POSITION;
      if (position === undefined) {
        error(`${path} has no POSITION attribute.`, path);
      }
      for (const [name, accessor] of Object.entries(primitive.attributes ?? {})) {
        if (!inRange(accessor, accessors.length)) {
          error(`${path}.attributes.${name} reads accessor ${accessor}, which does not exist.`, path);
        }
      }
      if (primitive.indices !== undefined && !inRange(primitive.indices, accessors.length)) {
        error(`${path}.indices reads accessor ${primitive.indices}, which does not exist.`, path);
      }
      if (primitive.material !== undefined && !inRange(primitive.material, materials.length)) {
        error(`${path}.material is ${primitive.material}, which does not exist.`, path);
      }
    });
  });

  accessors.forEach((accessor, index) => {
    if (
      accessor.bufferView !== undefined &&
      !inRange(accessor.bufferView, bufferViews.length)
    ) {
      error(
        `accessors[${index}] reads bufferView ${accessor.bufferView}, which does not exist.`,
        `accessors[${index}]`
      );
    }
  });

  bufferViews.forEach((view, index) => {
    if (!inRange(view.buffer, buffers.length)) {
      error(
        `bufferViews[${index}] reads buffer ${view.buffer}, which does not exist.`,
        `bufferViews[${index}]`
      );
      return;
    }
    const buffer = buffers[view.buffer];
    const end = (view.byteOffset ?? 0) + view.byteLength;
    if (end > buffer.byteLength) {
      error(
        `bufferViews[${index}] reads to byte ${end} of a ${buffer.byteLength}-byte buffer.`,
        `bufferViews[${index}]`
      );
    }
  });

  const lightsExtension = isRecord(json.extensions)
    ? json.extensions[LIGHTS_EXTENSION]
    : undefined;
  const lights =
    isRecord(lightsExtension) && Array.isArray(lightsExtension.lights)
      ? lightsExtension.lights
      : [];
  let lightNodes = 0;
  nodes.forEach((node, index) => {
    const nodeExtension = isRecord(node.extensions)
      ? node.extensions[LIGHTS_EXTENSION]
      : undefined;
    if (!isRecord(nodeExtension)) {
      return;
    }
    lightNodes += 1;
    const light = nodeExtension.light;
    if (typeof light !== "number" || !inRange(light, lights.length)) {
      error(
        `nodes[${index}] references light ${String(light)}, which the document does not have.`,
        `nodes[${index}].extensions.${LIGHTS_EXTENSION}`
      );
    }
  });
  if (lights.length > 0 && !(json.extensionsUsed ?? []).includes(LIGHTS_EXTENSION)) {
    error(
      `The document declares lights but does not list "${LIGHTS_EXTENSION}" in extensionsUsed.`,
      "extensionsUsed"
    );
  }

  const objects = listScene(json);
  if (objects.length === 0) {
    warn("The scene is empty — add an object before rendering it.", "scenes");
  } else if (meshes.length > 0 && lightNodes === 0) {
    warn(
      "The scene has geometry but no light; most viewers will render it dark.",
      "scenes"
    );
  }

  const byName = new Map<string, number>();
  for (const object of objects) {
    const key = object.name.trim().toLowerCase();
    if (!key) {
      continue;
    }
    byName.set(key, (byName.get(key) ?? 0) + 1);
  }
  for (const [name, count] of byName) {
    if (count > 1) {
      warn(
        `${count} objects are named "${name}"; addressing one by name picks the first, so use its uuid.`,
        "nodes"
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    objectCount: objects.length
  };
}
