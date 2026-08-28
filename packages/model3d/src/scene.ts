/**
 * The scene operations behind both 3D editing surfaces.
 *
 * The browser's `ui_3d_*` tools drive a live three.js scene; these run the same
 * verbs against the glTF document itself, so an agent can build and edit a
 * model with no editor open and the file it leaves behind opens in the editor
 * unchanged. Names, addressing ("uuid or case-insensitive name") and units
 * (degrees, CSS hex) match the browser contract.
 *
 * Everything the operations do not touch survives: an existing model keeps its
 * meshes, textures, animations and extensions, and only the nodes named by an
 * operation change.
 */

import {
  emptyGltf,
  type GltfJson,
  type GltfMaterial,
  type GltfNode,
  type Model3DFile
} from "./gltf.js";
import {
  decomposeMatrix,
  eulerDegreesToQuaternion,
  hexToLinearRgb,
  linearRgbToHex,
  quaternionToEulerDegrees,
  round6,
  type Quat,
  type Vec3
} from "./math.js";
import {
  buildPrimitiveGeometry,
  isMeshKind,
  PRIMITIVE_DEFAULTS,
  PRIMITIVE_LABELS,
  type PrimitiveKind
} from "./primitives.js";

/**
 * One object in the scene, in the shape the browser bridge returns:
 * position/scale in world units, rotation in degrees.
 */
export interface Model3DSceneObject {
  uuid: string;
  name: string;
  /** three.js-style object type, e.g. "Mesh", "Group", "DirectionalLight". */
  type: string;
  visible: boolean;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  parentUuid: string | null;
  /** Base color of the object's material, when it has a single-colored one. */
  materialColor?: string;
}

export interface Model3DTransformPatch {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
}

export class Model3DOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Model3DOperationError";
  }
}

const ID_KEY = "nodetool_id";
const VISIBLE_KEY = "visible";
const SELECTED_KEY = "nodetool_selected";
const LIGHTS_EXTENSION = "KHR_lights_punctual";

const COMPONENT_FLOAT = 5126;
const COMPONENT_UNSIGNED_INT = 5125;
const TARGET_ARRAY_BUFFER = 34962;
const TARGET_ELEMENT_ARRAY_BUFFER = 34963;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nodesOf = (json: GltfJson): GltfNode[] => {
  json.nodes ??= [];
  return json.nodes;
};

const activeScene = (json: GltfJson) => {
  json.scenes ??= [{ nodes: [] }];
  const index = typeof json.scene === "number" ? json.scene : 0;
  const scene = json.scenes[index] ?? json.scenes[0];
  scene.nodes ??= [];
  return scene;
};

const extrasOf = (node: GltfNode): Record<string, unknown> => {
  if (!isRecord(node.extras)) {
    node.extras = {};
  }
  return node.extras;
};

/**
 * Give every node a stable id, so a delete (which renumbers glTF's node array)
 * cannot make an id an agent already holds point at a different object.
 */
export function ensureObjectIds(json: GltfJson): void {
  const nodes = nodesOf(json);
  const used = new Set<string>();
  // Claim first, mint second, so a minted id cannot collide with one a later
  // node already holds. A repeated id (a .glb whose objects were duplicated in
  // another tool carries the same extras twice) is kept by the first node —
  // the one `resolveTarget` resolves it to — and the rest are re-minted.
  const keepsItsId = nodes.map((node) => {
    const id = isRecord(node.extras) ? node.extras[ID_KEY] : undefined;
    if (typeof id !== "string" || id.length === 0 || used.has(id)) {
      return false;
    }
    used.add(id);
    return true;
  });
  let seq = 1;
  nodes.forEach((node, index) => {
    if (keepsItsId[index]) {
      return;
    }
    while (used.has(`obj_${seq}`)) {
      seq += 1;
    }
    extrasOf(node)[ID_KEY] = `obj_${seq}`;
    used.add(`obj_${seq}`);
  });
}

const idOf = (node: GltfNode, index: number): string => {
  const id = isRecord(node.extras) ? node.extras[ID_KEY] : undefined;
  return typeof id === "string" && id.length > 0 ? id : `node-${index}`;
};

/** Every node's parent index, or -1 for a scene root. */
function parentIndices(json: GltfJson): number[] {
  const nodes = nodesOf(json);
  const parents = new Array<number>(nodes.length).fill(-1);
  nodes.forEach((node, index) => {
    for (const child of node.children ?? []) {
      if (child >= 0 && child < nodes.length) {
        parents[child] = index;
      }
    }
  });
  return parents;
}

function readTransform(node: GltfNode): {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
} {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    const trs = decomposeMatrix(node.matrix);
    return {
      position: trs.translation.map(round6) as Vec3,
      rotation: quaternionToEulerDegrees(trs.rotation).map(round6) as Vec3,
      scale: trs.scale.map(round6) as Vec3
    };
  }
  const rotation = (node.rotation ?? [0, 0, 0, 1]) as Quat;
  return {
    position: (node.translation ?? [0, 0, 0]).map(round6) as Vec3,
    rotation: quaternionToEulerDegrees(rotation).map(round6) as Vec3,
    scale: (node.scale ?? [1, 1, 1]).map(round6) as Vec3
  };
}

/** The light `KHR_lights_punctual` attaches to a node, if any. */
function lightTypeOf(json: GltfJson, node: GltfNode): string | null {
  const nodeExt = isRecord(node.extensions)
    ? node.extensions[LIGHTS_EXTENSION]
    : undefined;
  if (!isRecord(nodeExt) || typeof nodeExt.light !== "number") {
    return null;
  }
  const docExt = isRecord(json.extensions)
    ? json.extensions[LIGHTS_EXTENSION]
    : undefined;
  const lights = isRecord(docExt) && Array.isArray(docExt.lights) ? docExt.lights : [];
  const light = lights[nodeExt.light];
  const type = isRecord(light) && typeof light.type === "string" ? light.type : "point";
  switch (type) {
    case "directional":
      return "DirectionalLight";
    case "spot":
      return "SpotLight";
    default:
      return "PointLight";
  }
}

function objectType(json: GltfJson, node: GltfNode): string {
  const light = lightTypeOf(json, node);
  if (light) {
    return light;
  }
  if (typeof node.mesh === "number") {
    return typeof node.skin === "number" ? "SkinnedMesh" : "Mesh";
  }
  if (typeof node.camera === "number") {
    return "Camera";
  }
  return "Group";
}

/** Material indices a node's mesh draws with. */
function materialIndices(json: GltfJson, node: GltfNode): number[] {
  if (typeof node.mesh !== "number") {
    return [];
  }
  const mesh = json.meshes?.[node.mesh];
  if (!mesh) {
    return [];
  }
  const indices: number[] = [];
  for (const primitive of mesh.primitives ?? []) {
    if (typeof primitive.material === "number") {
      indices.push(primitive.material);
    }
  }
  return indices;
}

function materialColorOf(json: GltfJson, node: GltfNode): string | undefined {
  const [first] = materialIndices(json, node);
  if (first === undefined) {
    return undefined;
  }
  const factor = json.materials?.[first]?.pbrMetallicRoughness?.baseColorFactor;
  return Array.isArray(factor) ? linearRgbToHex(factor) : undefined;
}

function serializeObject(
  json: GltfJson,
  node: GltfNode,
  index: number,
  parents: number[]
): Model3DSceneObject {
  const parent = parents[index];
  const extras = isRecord(node.extras) ? node.extras : {};
  const color = materialColorOf(json, node);
  const object: Model3DSceneObject = {
    uuid: idOf(node, index),
    name: node.name ?? objectType(json, node),
    type: objectType(json, node),
    visible: extras[VISIBLE_KEY] !== false,
    ...readTransform(node),
    parentUuid:
      parent >= 0 ? idOf(nodesOf(json)[parent] as GltfNode, parent) : null
  };
  if (color) {
    object.materialColor = color;
  }
  return object;
}

/** Every object in the document's active scene, parents before children. */
export function listScene(json: GltfJson): Model3DSceneObject[] {
  const nodes = nodesOf(json);
  const parents = parentIndices(json);
  const out: Model3DSceneObject[] = [];
  const seen = new Set<number>();
  const visit = (index: number): void => {
    const node = nodes[index];
    if (!node || seen.has(index)) {
      return;
    }
    seen.add(index);
    out.push(serializeObject(json, node, index, parents));
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  for (const root of activeScene(json).nodes ?? []) {
    visit(root);
  }
  // A node outside the active scene is still in the file; report it rather
  // than pretending the document is smaller than it is.
  nodes.forEach((_, index) => visit(index));
  return out;
}

/** The id the document records as selected, when the editor left one. */
export function selectedId(json: GltfJson): string | null {
  const extras = isRecord(json.extras) ? json.extras : {};
  const value = extras[SELECTED_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function setSelectedId(json: GltfJson, id: string | null): void {
  if (!isRecord(json.extras)) {
    json.extras = {};
  }
  const extras = json.extras as Record<string, unknown>;
  if (id === null) {
    delete extras[SELECTED_KEY];
  } else {
    extras[SELECTED_KEY] = id;
  }
}

/** Resolve a target by id or case-insensitive name. Throws when nothing matches. */
export function resolveTarget(json: GltfJson, target: string): number {
  const nodes = nodesOf(json);
  const raw = target.trim();
  const byId = nodes.findIndex((node, index) => idOf(node, index) === raw);
  if (byId >= 0) {
    return byId;
  }
  const lower = raw.toLowerCase();
  const byName = nodes.findIndex(
    (node) => (node.name ?? "").toLowerCase() === lower
  );
  if (byName >= 0) {
    return byName;
  }
  throw new Model3DOperationError(`No object found matching "${target}".`);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function uniqueName(json: GltfJson, base: string): string {
  const taken = new Set(nodesOf(json).map((node) => node.name ?? ""));
  if (!taken.has(base)) {
    return base;
  }
  let n = 2;
  while (taken.has(`${base} ${n}`)) {
    n += 1;
  }
  return `${base} ${n}`;
}

function pushExtensionUsed(json: GltfJson, name: string): void {
  json.extensionsUsed ??= [];
  if (!json.extensionsUsed.includes(name)) {
    json.extensionsUsed.push(name);
  }
}

/** Append bytes as a new data-URI buffer; valid in both `.gltf` and `.glb`. */
function appendBuffer(json: GltfJson, bytes: Uint8Array, base64: (b: Uint8Array) => string): number {
  json.buffers ??= [];
  json.buffers.push({
    byteLength: bytes.byteLength,
    uri: `data:application/octet-stream;base64,${base64(bytes)}`
  });
  return json.buffers.length - 1;
}

function appendBufferView(
  json: GltfJson,
  buffer: number,
  byteOffset: number,
  byteLength: number,
  target: number
): number {
  json.bufferViews ??= [];
  json.bufferViews.push({ buffer, byteOffset, byteLength, target });
  return json.bufferViews.length - 1;
}

function appendAccessor(
  json: GltfJson,
  accessor: {
    bufferView: number;
    componentType: number;
    count: number;
    type: string;
    min?: number[];
    max?: number[];
  }
): number {
  json.accessors ??= [];
  json.accessors.push(accessor);
  return json.accessors.length - 1;
}

function boundsOf(positions: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  return { min: min.map(round6), max: max.map(round6) };
}

/** The editor's default material: light grey, mostly rough, barely metallic. */
function defaultMaterial(name: string): GltfMaterial {
  return {
    name,
    pbrMetallicRoughness: {
      baseColorFactor: [...(hexToLinearRgb("#cccccc") as Vec3), 1],
      metallicFactor: 0.1,
      roughnessFactor: 0.8
    }
  };
}

export interface AddObjectOptions {
  /** Encoder for the appended geometry buffer (injected so this stays pure). */
  base64Encode: (bytes: Uint8Array) => string;
}

/** Add a primitive to the active scene and return the object it created. */
export function addObject(
  json: GltfJson,
  kind: PrimitiveKind,
  name: string | undefined,
  options: AddObjectOptions
): Model3DSceneObject {
  ensureObjectIds(json);
  const defaults = PRIMITIVE_DEFAULTS[kind];
  const node: GltfNode = {
    name: uniqueName(json, name?.trim() || PRIMITIVE_LABELS[kind]),
    translation: [...defaults.position],
    rotation: [...eulerDegreesToQuaternion(defaults.rotation)],
    scale: [...defaults.scale]
  };

  if (isMeshKind(kind)) {
    const geometry = buildPrimitiveGeometry(kind);
    const positionBytes = new Uint8Array(geometry.positions.buffer.slice(0));
    const normalBytes = new Uint8Array(geometry.normals.buffer.slice(0));
    const indexBytes = new Uint8Array(geometry.indices.buffer.slice(0));

    const packed = new Uint8Array(
      positionBytes.length + normalBytes.length + indexBytes.length
    );
    packed.set(positionBytes, 0);
    packed.set(normalBytes, positionBytes.length);
    packed.set(indexBytes, positionBytes.length + normalBytes.length);

    const buffer = appendBuffer(json, packed, options.base64Encode);
    const positionView = appendBufferView(
      json,
      buffer,
      0,
      positionBytes.length,
      TARGET_ARRAY_BUFFER
    );
    const normalView = appendBufferView(
      json,
      buffer,
      positionBytes.length,
      normalBytes.length,
      TARGET_ARRAY_BUFFER
    );
    const indexView = appendBufferView(
      json,
      buffer,
      positionBytes.length + normalBytes.length,
      indexBytes.length,
      TARGET_ELEMENT_ARRAY_BUFFER
    );

    const { min, max } = boundsOf(geometry.positions);
    const positionAccessor = appendAccessor(json, {
      bufferView: positionView,
      componentType: COMPONENT_FLOAT,
      count: geometry.positions.length / 3,
      type: "VEC3",
      min,
      max
    });
    const normalAccessor = appendAccessor(json, {
      bufferView: normalView,
      componentType: COMPONENT_FLOAT,
      count: geometry.normals.length / 3,
      type: "VEC3"
    });
    const indexAccessor = appendAccessor(json, {
      bufferView: indexView,
      componentType: COMPONENT_UNSIGNED_INT,
      count: geometry.indices.length,
      type: "SCALAR"
    });

    json.materials ??= [];
    const meshMaterial = defaultMaterial(`${node.name} Material`);
    if (kind === "plane") {
      // A plane has no back face of its own; without this it disappears from
      // half the angles a camera can look at it from.
      meshMaterial.doubleSided = true;
    }
    json.materials.push(meshMaterial);
    const material = json.materials.length - 1;

    json.meshes ??= [];
    json.meshes.push({
      name: node.name,
      primitives: [
        {
          attributes: { POSITION: positionAccessor, NORMAL: normalAccessor },
          indices: indexAccessor,
          material
        }
      ]
    });
    node.mesh = json.meshes.length - 1;
  } else {
    pushExtensionUsed(json, LIGHTS_EXTENSION);
    json.extensions ??= {};
    const ext = isRecord(json.extensions[LIGHTS_EXTENSION])
      ? (json.extensions[LIGHTS_EXTENSION] as { lights?: unknown[] })
      : { lights: [] };
    ext.lights ??= [];
    ext.lights.push({
      type: kind === "directionalLight" ? "directional" : "point",
      name: node.name,
      color: [1, 1, 1],
      intensity: 1
    });
    json.extensions[LIGHTS_EXTENSION] = ext;
    node.extensions = {
      [LIGHTS_EXTENSION]: { light: ext.lights.length - 1 }
    };
  }

  const nodes = nodesOf(json);
  nodes.push(node);
  const index = nodes.length - 1;
  activeScene(json).nodes?.push(index);
  ensureObjectIds(json);
  setSelectedId(json, idOf(node, index));
  return serializeObject(json, node, index, parentIndices(json));
}

/** Remap every node index in the document through `mapping` (-1 = removed). */
function remapNodeIndices(json: GltfJson, mapping: number[]): void {
  const remap = (index: number): number => mapping[index] ?? -1;
  const keepList = (list: number[] | undefined): number[] | undefined =>
    list?.map(remap).filter((index) => index >= 0);

  for (const node of nodesOf(json)) {
    const children = keepList(node.children);
    if (children && children.length > 0) {
      node.children = children;
    } else {
      delete node.children;
    }
  }
  for (const scene of json.scenes ?? []) {
    scene.nodes = keepList(scene.nodes) ?? [];
  }
  for (const animation of json.animations ?? []) {
    animation.channels = (animation.channels ?? []).filter((channel) => {
      const target = channel.target?.node;
      if (typeof target !== "number") {
        return true;
      }
      const next = remap(target);
      if (next < 0) {
        return false;
      }
      channel.target.node = next;
      return true;
    });
  }
  for (const skin of json.skins ?? []) {
    skin.joints = (skin.joints ?? []).map(remap).filter((index) => index >= 0);
    if (typeof skin.skeleton === "number") {
      const next = remap(skin.skeleton);
      if (next < 0) {
        delete skin.skeleton;
      } else {
        skin.skeleton = next;
      }
    }
  }
}

/** Delete an object and its descendants; returns what it removed. */
export function deleteObject(
  json: GltfJson,
  target: string
): Model3DSceneObject {
  ensureObjectIds(json);
  const index = resolveTarget(json, target);
  const nodes = nodesOf(json);
  const removed = serializeObject(json, nodes[index], index, parentIndices(json));

  const doomed = new Set<number>();
  const stack = [index];
  while (stack.length > 0) {
    const current = stack.pop() as number;
    if (doomed.has(current)) {
      continue;
    }
    doomed.add(current);
    for (const child of nodes[current]?.children ?? []) {
      stack.push(child);
    }
  }

  const mapping: number[] = [];
  const kept: GltfNode[] = [];
  nodes.forEach((node, i) => {
    if (doomed.has(i)) {
      mapping[i] = -1;
      return;
    }
    mapping[i] = kept.length;
    kept.push(node);
  });
  json.nodes = kept;
  remapNodeIndices(json, mapping);
  if (selectedId(json) === removed.uuid) {
    setSelectedId(json, null);
  }
  return removed;
}

export function setTransform(
  json: GltfJson,
  target: string,
  patch: Model3DTransformPatch
): Model3DSceneObject {
  ensureObjectIds(json);
  const index = resolveTarget(json, target);
  const node = nodesOf(json)[index];
  const current = readTransform(node);
  const next = {
    position: patch.position ?? current.position,
    rotation: patch.rotation ?? current.rotation,
    scale: patch.scale ?? current.scale
  };
  for (const [field, value] of Object.entries(next)) {
    if (value.some((n) => !Number.isFinite(n))) {
      throw new Model3DOperationError(
        `${field} must be three finite numbers; got [${value.join(", ")}].`
      );
    }
  }
  // A matrix and TRS cannot both be present, so the TRS form wins from here on.
  delete node.matrix;
  node.translation = [...next.position];
  node.rotation = [...eulerDegreesToQuaternion(next.rotation)];
  node.scale = [...next.scale];
  return serializeObject(json, node, index, parentIndices(json));
}

export function setVisibility(
  json: GltfJson,
  target: string,
  visible: boolean
): Model3DSceneObject {
  ensureObjectIds(json);
  const index = resolveTarget(json, target);
  const node = nodesOf(json)[index];
  const extras = extrasOf(node);
  if (visible) {
    delete extras[VISIBLE_KEY];
  } else {
    extras[VISIBLE_KEY] = false;
  }
  return serializeObject(json, node, index, parentIndices(json));
}

export function renameObject(
  json: GltfJson,
  target: string,
  name: string
): Model3DSceneObject {
  ensureObjectIds(json);
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Model3DOperationError("name must not be empty.");
  }
  const index = resolveTarget(json, target);
  const node = nodesOf(json)[index];
  node.name = trimmed;
  return serializeObject(json, node, index, parentIndices(json));
}

/**
 * Set a mesh's base color. A material shared with another mesh is copied
 * first, so recoloring one object never repaints the rest of the model.
 */
export function setMaterialColor(
  json: GltfJson,
  target: string,
  color: string
): Model3DSceneObject {
  ensureObjectIds(json);
  const rgb = hexToLinearRgb(color);
  if (!rgb) {
    throw new Model3DOperationError(
      `color must be a CSS hex string like "#ff8800"; got "${color}".`
    );
  }
  const index = resolveTarget(json, target);
  const node = nodesOf(json)[index];
  if (typeof node.mesh !== "number") {
    throw new Model3DOperationError(
      `"${node.name ?? target}" is a ${objectType(json, node)}, which has no material.`
    );
  }
  const mesh = json.meshes?.[node.mesh];
  if (!mesh) {
    throw new Model3DOperationError(
      `"${node.name ?? target}" references mesh ${node.mesh}, which the document does not have.`
    );
  }

  // Counted once for the document rather than per primitive: a model with
  // thousands of primitives would otherwise rescan every mesh for each of them.
  const users = new Map<number, number>();
  for (const candidate of json.meshes ?? []) {
    for (const primitive of candidate.primitives ?? []) {
      if (typeof primitive.material === "number") {
        users.set(primitive.material, (users.get(primitive.material) ?? 0) + 1);
      }
    }
  }

  json.materials ??= [];
  for (const primitive of mesh.primitives ?? []) {
    let materialIndex = primitive.material;
    if (materialIndex === undefined) {
      json.materials.push(defaultMaterial(`${node.name ?? "Object"} Material`));
      materialIndex = json.materials.length - 1;
      primitive.material = materialIndex;
    } else if ((users.get(materialIndex) ?? 0) > 1) {
      const source = json.materials[materialIndex] ?? {};
      json.materials.push(
        JSON.parse(JSON.stringify(source)) as GltfMaterial
      );
      materialIndex = json.materials.length - 1;
      primitive.material = materialIndex;
    }
    const material = json.materials[materialIndex] ?? {};
    const pbr = material.pbrMetallicRoughness ?? {};
    const alpha = pbr.baseColorFactor?.[3] ?? 1;
    material.pbrMetallicRoughness = {
      ...pbr,
      baseColorFactor: [...rgb, alpha]
    };
    json.materials[materialIndex] = material;
  }
  return serializeObject(json, node, index, parentIndices(json));
}

/** Record (or clear, with null) the document's selected object. */
export function selectObject(
  json: GltfJson,
  target: string | null
): Model3DSceneObject | null {
  ensureObjectIds(json);
  if (target === null || target.trim() === "") {
    setSelectedId(json, null);
    return null;
  }
  const index = resolveTarget(json, target);
  const node = nodesOf(json)[index];
  const object = serializeObject(json, node, index, parentIndices(json));
  setSelectedId(json, object.uuid);
  return object;
}

/**
 * The scene's axis-aligned bounds in world space, from each mesh's POSITION
 * accessor min/max transformed by its node. Null when nothing has geometry —
 * a scene of lights alone has no extent.
 */
export function sceneBounds(
  json: GltfJson
): { min: Vec3; max: Vec3; center: Vec3; size: Vec3 } | null {
  const nodes = nodesOf(json);
  const parents = parentIndices(json);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let found = false;

  nodes.forEach((node, index) => {
    if (typeof node.mesh !== "number") {
      return;
    }
    const mesh = json.meshes?.[node.mesh];
    if (!mesh) {
      return;
    }
    // Accumulate the node's world transform by walking up its parents. Only
    // translation and scale are applied: an oriented box needs the corners
    // rotated, and the extra precision is not worth the matrix stack here.
    let offset: Vec3 = [0, 0, 0];
    let factor: Vec3 = [1, 1, 1];
    let cursor = index;
    let guard = 0;
    while (cursor >= 0 && guard < nodes.length + 1) {
      const { position, scale } = readTransform(nodes[cursor]);
      offset = [
        offset[0] * scale[0] + position[0],
        offset[1] * scale[1] + position[1],
        offset[2] * scale[2] + position[2]
      ];
      factor = [factor[0] * scale[0], factor[1] * scale[1], factor[2] * scale[2]];
      cursor = parents[cursor];
      guard += 1;
    }

    for (const primitive of mesh.primitives ?? []) {
      const accessor = json.accessors?.[primitive.attributes?.POSITION ?? -1];
      if (!accessor?.min || !accessor.max) {
        continue;
      }
      found = true;
      for (let axis = 0; axis < 3; axis += 1) {
        const lo = accessor.min[axis] * factor[axis] + offset[axis];
        const hi = accessor.max[axis] * factor[axis] + offset[axis];
        min[axis] = Math.min(min[axis], lo, hi);
        max[axis] = Math.max(max[axis], lo, hi);
      }
    }
  });

  if (!found) {
    return null;
  }
  return {
    min: min.map(round6) as Vec3,
    max: max.map(round6) as Vec3,
    center: min.map((lo, axis) => round6((lo + max[axis]) / 2)) as Vec3,
    size: max.map((hi, axis) => round6(hi - min[axis])) as Vec3
  };
}

/** A fresh, empty document — the headless twin of "New scene" in the editor. */
export function createModel3DFile(name = "Scene"): Model3DFile {
  return { json: emptyGltf(name), bin: null, format: "gltf" };
}
