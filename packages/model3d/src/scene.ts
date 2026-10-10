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
  type GltfAnimationChannel,
  type GltfJson,
  type GltfMaterial,
  type GltfMesh,
  type GltfNode,
  type Model3DFile
} from "./gltf.js";
import {
  composeMatrix,
  decomposeMatrix,
  multiplyMatrices,
  transformPoint,
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
/** The key the browser editor writes for a hidden object. */
const EDITOR_HIDDEN_KEY = "nodetool_hidden";
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

/** The node list for reading. Unlike {@link nodesOf} it never adds a field. */
const readNodes = (json: GltfJson): readonly GltfNode[] => json.nodes ?? [];

/** The active scene's root node indices, read without changing the document. */
const sceneRootIndices = (json: GltfJson): readonly number[] => {
  const scenes = json.scenes ?? [];
  const index = typeof json.scene === "number" ? json.scene : 0;
  return (scenes[index] ?? scenes[0])?.nodes ?? [];
};

const activeScene = (json: GltfJson) => {
  json.scenes ??= [];
  if (json.scenes.length === 0) {
    json.scenes.push({ nodes: [] });
  }
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
  objectIds(nodes).forEach((id, index) => {
    if (extrasOf(nodes[index])[ID_KEY] !== id) {
      extrasOf(nodes[index])[ID_KEY] = id;
    }
  });
}

/**
 * The id each node answers to: the one {@link ensureObjectIds} gives it.
 * Listing and lookup read ids through here too, so an id shown before the
 * first edit always names the object it named in the listing, even when two
 * nodes carry the same stored id or a stored id equals another's fallback.
 */
function objectIds(nodes: readonly GltfNode[]): string[] {
  const ids: string[] = [];
  const used = new Set<string>();
  // Claim first, mint second, so a minted id cannot collide with one a later
  // node already holds. A repeated id (a .glb whose objects were duplicated in
  // another tool carries the same extras twice) is kept by the first node —
  // the one `resolveTarget` resolves it to — and the rest are re-minted.
  nodes.forEach((node, index) => {
    const id = isRecord(node?.extras) ? node.extras[ID_KEY] : undefined;
    if (typeof id === "string" && id.length > 0 && !used.has(id)) {
      ids[index] = id;
      used.add(id);
    }
  });
  let seq = 1;
  nodes.forEach((_node, index) => {
    if (ids[index] !== undefined) {
      return;
    }
    // Prefer `node-<index>`, the id a document without stored ids lists.
    const fallback = `node-${index}`;
    if (!used.has(fallback)) {
      ids[index] = fallback;
      used.add(fallback);
      return;
    }
    while (used.has(`obj_${seq}`)) {
      seq += 1;
    }
    ids[index] = `obj_${seq}`;
    used.add(`obj_${seq}`);
  });
  return ids;
}

/** A 32-hex id, the repository's resource id form. */
const freshObjectId = (): string =>
  Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

const idOf = (json: GltfJson, index: number): string => objectIds(readNodes(json))[index];

/** Every node's parent index, or -1 for a scene root. */
function parentIndices(json: GltfJson): number[] {
  const nodes = readNodes(json);
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

interface TransformFields {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

/** A node's transform at full precision, rotation in Euler degrees. */
function readRawTransform(node: GltfNode): TransformFields {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    const trs = decomposeMatrix(node.matrix);
    return {
      position: trs.translation,
      rotation: quaternionToEulerDegrees(trs.rotation),
      scale: trs.scale
    };
  }
  const rotation = (node.rotation ?? [0, 0, 0, 1]) as Quat;
  return {
    position: [...(node.translation ?? [0, 0, 0])] as Vec3,
    rotation: quaternionToEulerDegrees(rotation),
    scale: [...(node.scale ?? [1, 1, 1])] as Vec3
  };
}

/** {@link readRawTransform} rounded for display. */
function readTransform(node: GltfNode): TransformFields {
  const raw = readRawTransform(node);
  return {
    position: raw.position.map(round6) as Vec3,
    rotation: raw.rotation.map(round6) as Vec3,
    scale: raw.scale.map(round6) as Vec3
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
  parents: number[],
  ids: string[] = objectIds(readNodes(json))
): Model3DSceneObject {
  const parent = parents[index];
  const extras = isRecord(node.extras) ? node.extras : {};
  const color = materialColorOf(json, node);
  const object: Model3DSceneObject = {
    uuid: ids[index],
    name: node.name ?? objectType(json, node),
    type: objectType(json, node),
    visible: extras[VISIBLE_KEY] !== false && extras[EDITOR_HIDDEN_KEY] !== true,
    ...readTransform(node),
    parentUuid: parent >= 0 ? ids[parent] : null
  };
  if (color) {
    object.materialColor = color;
  }
  return object;
}

/**
 * Every object in the document's active scene, parents before children. The
 * walk is iterative, so a deep hierarchy cannot overflow the stack, and it
 * only reads the document.
 */
export function listScene(json: GltfJson): Model3DSceneObject[] {
  const nodes = readNodes(json);
  const parents = parentIndices(json);
  const ids = objectIds(nodes);
  const out: Model3DSceneObject[] = [];
  const seen = new Set<number>();
  const visitFrom = (start: number): void => {
    const stack = [start];
    while (stack.length > 0) {
      const index = stack.pop() as number;
      const node = nodes[index];
      if (!node || seen.has(index)) {
        continue;
      }
      seen.add(index);
      out.push(serializeObject(json, node, index, parents, ids));
      const children = node.children ?? [];
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push(children[i]);
      }
    }
  };
  for (const root of sceneRootIndices(json)) {
    visitFrom(root);
  }
  // A node outside the active scene is still in the file; report it rather
  // than pretending the document is smaller than it is.
  nodes.forEach((_, index) => visitFrom(index));
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
  const nodes = readNodes(json);
  const raw = target.trim();
  const byId = objectIds(nodes).indexOf(raw);
  if (byId >= 0) {
    return byId;
  }
  const lower = raw.toLowerCase();
  const byName = nodes.findIndex(
    (node) => (node.name ?? "").trim().toLowerCase() === lower
  );
  if (byName >= 0) {
    return byName;
  }
  throw new Model3DOperationError(`No object found matching "${target}".`);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * `base`, or `base N` with the first free N. Names are compared without case,
 * because {@link resolveTarget} looks them up without case.
 */
function uniqueName(json: GltfJson, base: string): string {
  // Trimmed too, as resolveTarget trims: "Box " must count as taken by "Box".
  const taken = new Set(
    readNodes(json).map((node) => (node.name ?? "").trim().toLowerCase())
  );
  if (!taken.has(base.toLowerCase())) {
    return base;
  }
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) {
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

  // A new node needs an id no earlier object ever held. Left to
  // `ensureObjectIds`, it would take `node-<index>`, which a deleted object
  // may have answered to, so an agent holding that id would edit this one.
  extrasOf(node)[ID_KEY] = freshObjectId();
  const nodes = nodesOf(json);
  nodes.push(node);
  const index = nodes.length - 1;
  activeScene(json).nodes?.push(index);
  ensureObjectIds(json);
  setSelectedId(json, idOf(json, index));
  return serializeObject(json, node, index, parentIndices(json));
}

/**
 * Rewrite a `KHR_animation_pointer` target such as `/nodes/3/translation`
 * through `remap`. Returns false when the pointer names a removed node.
 */
function remapAnimationPointer(
  target: GltfAnimationChannel["target"] | undefined,
  remap: (index: number) => number
): boolean {
  const extensions = target?.extensions;
  const ext = isRecord(extensions) ? extensions["KHR_animation_pointer"] : undefined;
  if (!isRecord(ext) || typeof ext.pointer !== "string") {
    return true;
  }
  const match = /^\/nodes\/(\d+)(\/.*)?$/.exec(ext.pointer);
  if (!match) {
    return true;
  }
  const next = remap(Number(match[1]));
  if (next < 0) {
    return false;
  }
  ext.pointer = `/nodes/${next}${match[2] ?? ""}`;
  return true;
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
      if (!remapAnimationPointer(channel.target, remap)) {
        return false;
      }
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
  // A sampler only the dropped channels played would still count toward the
  // clip's length (animationDurations reads every sampler), so it goes too.
  for (const animation of json.animations ?? []) {
    const samplers = animation.samplers ?? [];
    const samplerMapping = new Map<number, number>();
    const keptSamplers: unknown[] = [];
    for (const channel of animation.channels) {
      const index = channel.sampler;
      if (!samplerMapping.has(index) && index >= 0 && index < samplers.length) {
        samplerMapping.set(index, keptSamplers.length);
        keptSamplers.push(samplers[index]);
      }
    }
    if (keptSamplers.length === samplers.length) {
      continue;
    }
    animation.samplers = keptSamplers;
    for (const channel of animation.channels) {
      channel.sampler = samplerMapping.get(channel.sampler) ?? channel.sampler;
    }
  }
  // glTF requires every animation to have a channel.
  if (json.animations) {
    json.animations = json.animations.filter(
      (animation) => (animation.channels ?? []).length > 0
    );
    if (json.animations.length === 0) {
      delete json.animations;
    }
  }
  // A skin that lost a joint no longer matches its inverse bind matrices, so
  // it goes, and the meshes it deformed stay as they are in the bind pose.
  if (json.skins) {
    const skinMapping: number[] = [];
    const keptSkins: NonNullable<GltfJson["skins"]> = [];
    json.skins.forEach((skin, index) => {
      const joints = skin.joints ?? [];
      if (joints.length === 0 || joints.some((joint) => remap(joint) < 0)) {
        skinMapping[index] = -1;
        return;
      }
      skin.joints = joints.map(remap);
      if (typeof skin.skeleton === "number") {
        const next = remap(skin.skeleton);
        if (next < 0) {
          delete skin.skeleton;
        } else {
          skin.skeleton = next;
        }
      }
      skinMapping[index] = keptSkins.length;
      keptSkins.push(skin);
    });
    for (const node of nodesOf(json)) {
      if (typeof node.skin !== "number") {
        continue;
      }
      const next = skinMapping[node.skin] ?? -1;
      if (next < 0) {
        delete node.skin;
      } else {
        node.skin = next;
      }
    }
    if (keptSkins.length > 0) {
      json.skins = keptSkins;
    } else {
      delete json.skins;
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

  const selected = selectedId(json);
  const ids = objectIds(nodes);
  const selectionDoomed = [...doomed].some((i) => ids[i] === selected);
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
  if (selectionDoomed) {
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
  // Unpatched fields keep full precision: the rounded listing would turn a
  // scale of 1e-7 into 0 and make the object vanish.
  const current = readRawTransform(node);
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
    delete extras[EDITOR_HIDDEN_KEY];
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
  let mesh = json.meshes?.[node.mesh];
  if (!mesh) {
    throw new Model3DOperationError(
      `"${node.name ?? target}" references mesh ${node.mesh}, which the document does not have.`
    );
  }
  // Another node drawing the same mesh would change color too, so this node
  // gets its own copy of the mesh. The copy shares geometry accessors; only
  // its material slots are its own.
  const meshIndex = node.mesh;
  const meshUsers = readNodes(json).filter((other) => other.mesh === meshIndex).length;
  if (meshUsers > 1 && json.meshes) {
    mesh = JSON.parse(JSON.stringify(mesh)) as GltfMesh;
    json.meshes.push(mesh);
    node.mesh = json.meshes.length - 1;
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
  const nodes = readNodes(json);
  const parents = parentIndices(json);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let found = false;

  const localMatrix = (node: GltfNode): number[] =>
    Array.isArray(node.matrix) && node.matrix.length === 16
      ? node.matrix
      : composeMatrix(
          (node.translation ?? [0, 0, 0]) as Vec3,
          (node.rotation ?? [0, 0, 0, 1]) as Quat,
          (node.scale ?? [1, 1, 1]) as Vec3
        );

  // World matrices, filled in from the root down along each node's ancestry.
  // The walk is iterative and stops at a repeated node, so neither a deep
  // hierarchy nor a cycle can hang it.
  const world = new Map<number, number[]>();
  const worldOf = (index: number): number[] => {
    const chain: number[] = [];
    const onChain = new Set<number>();
    let cursor = index;
    while (cursor >= 0 && !world.has(cursor) && !onChain.has(cursor)) {
      chain.push(cursor);
      onChain.add(cursor);
      cursor = parents[cursor];
    }
    let matrix = cursor >= 0 && world.has(cursor) ? (world.get(cursor) as number[]) : null;
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const local = localMatrix(nodes[chain[i]]);
      matrix = matrix ? multiplyMatrices(matrix, local) : local;
      world.set(chain[i], matrix);
    }
    return world.get(index) as number[];
  };

  nodes.forEach((node, index) => {
    if (typeof node.mesh !== "number") {
      return;
    }
    const mesh = json.meshes?.[node.mesh];
    if (!mesh) {
      return;
    }
    for (const primitive of mesh.primitives ?? []) {
      const accessor = json.accessors?.[primitive.attributes?.POSITION ?? -1];
      if (!accessor?.min || !accessor.max) {
        continue;
      }
      found = true;
      const matrix = worldOf(index);
      const lo = accessor.min;
      const hi = accessor.max;
      // Transform all eight corners, so a rotated box is bounded correctly.
      for (let corner = 0; corner < 8; corner += 1) {
        const point = transformPoint(matrix, [
          corner & 1 ? hi[0] : lo[0],
          corner & 2 ? hi[1] : lo[1],
          corner & 4 ? hi[2] : lo[2]
        ]);
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], point[axis]);
          max[axis] = Math.max(max[axis], point[axis]);
        }
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
