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
  buildFigure,
  FIGURE_DEFAULT_BODY,
  FIGURE_DEFAULT_COLOR,
  FIGURE_DEFAULT_HEIGHT,
  FIGURE_DEFAULT_POSE,
  FIGURE_EXTRA,
  FIGURE_JOINTS,
  FIGURE_MAX_HEIGHT,
  FIGURE_MIN_HEIGHT,
  FIGURE_PART_EXTRA,
  isFigureBody,
  isFigureJoint,
  isFigurePose,
  type FigureBody,
  type FigureInfo,
  type FigureJoint,
  type FigurePart,
  type FigurePose
} from "./figure.js";
import {
  emptyGltf,
  type GltfAnimationChannel,
  type GltfCamera,
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
  lookAtQuaternion,
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
  type Geometry,
  type PrimitiveKind
} from "./primitives.js";

/** A camera object's lens, in the units the editor shows. */
export interface Model3DCameraInfo {
  projection: "perspective" | "orthographic";
  /** Vertical field of view in degrees. Perspective cameras only. */
  fovDeg?: number;
  aspectRatio?: number;
  znear?: number;
  zfar?: number;
}

/**
 * One object in the scene, in the shape the browser bridge returns:
 * position/scale in world units, rotation in degrees.
 */
export interface Model3DSceneObject {
  uuid: string;
  name: string;
  /**
   * three.js-style object type, e.g. "Mesh", "Group", "DirectionalLight",
   * "PerspectiveCamera", or "Figure" for a blockout figure.
   */
  type: string;
  visible: boolean;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  parentUuid: string | null;
  /** Base color of the object's material, when it has a single-colored one. */
  materialColor?: string;
  /** Body, pose, height and cast link of a figure. */
  figure?: FigureInfo;
  /** Lens of a camera. */
  camera?: Model3DCameraInfo;
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

/**
 * The id each node of `nodes` lists under, in node order. The browser editor
 * stamps these onto the objects it loads, so an id an agent read from the
 * file keeps naming the same object after the editor saves it in its own
 * node order.
 */
export const listObjectIds = (nodes: readonly GltfNode[]): string[] => objectIds(nodes);

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
const LIGHT_OBJECT_TYPES: Record<string, string> = {
  directional: "DirectionalLight",
  spot: "SpotLight"
};

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
  return Object.hasOwn(LIGHT_OBJECT_TYPES, type)
    ? LIGHT_OBJECT_TYPES[type]
    : "PointLight";
}

/** True for a joint node of a figure, which is addressed through its root. */
const isFigurePart = (node: GltfNode | undefined): boolean =>
  isRecord(node?.extras) && isFigureJoint(node.extras[FIGURE_PART_EXTRA]);

/** The figure a root node declares, with unreadable fields set to defaults. */
function figureInfoOf(node: GltfNode): FigureInfo | null {
  const raw = isRecord(node.extras) ? node.extras[FIGURE_EXTRA] : undefined;
  if (!isRecord(raw)) {
    return null;
  }
  const body = isFigureBody(raw.body) ? raw.body : FIGURE_DEFAULT_BODY;
  const info: FigureInfo = {
    body,
    pose: isFigurePose(raw.pose) ? raw.pose : FIGURE_DEFAULT_POSE,
    height:
      typeof raw.height === "number" && Number.isFinite(raw.height) && raw.height > 0
        ? raw.height
        : FIGURE_DEFAULT_HEIGHT[body]
  };
  if (typeof raw.entityId === "string" && raw.entityId !== "") {
    info.entityId = raw.entityId;
  }
  if (typeof raw.label === "string" && raw.label !== "") {
    info.label = raw.label;
  }
  return info;
}

/** The joint nodes under a figure root, by joint. */
function figurePartIndices(json: GltfJson, root: number): Map<FigureJoint, number> {
  const nodes = readNodes(json);
  const found = new Map<FigureJoint, number>();
  const seen = new Set<number>([root]);
  const stack = [...(nodes[root]?.children ?? [])];
  while (stack.length > 0) {
    const index = stack.pop() as number;
    const node = nodes[index];
    if (!node || seen.has(index)) {
      continue;
    }
    seen.add(index);
    const joint = isRecord(node.extras) ? node.extras[FIGURE_PART_EXTRA] : undefined;
    if (isFigureJoint(joint) && !found.has(joint)) {
      found.set(joint, index);
    }
    stack.push(...(node.children ?? []));
  }
  return found;
}

const RAD_TO_DEG = 180 / Math.PI;

function cameraDefOf(json: GltfJson, node: GltfNode): GltfCamera | null {
  if (typeof node.camera !== "number" || !Array.isArray(json.cameras)) {
    return null;
  }
  const def = json.cameras[node.camera];
  return isRecord(def) ? (def as GltfCamera) : null;
}

function cameraInfoOf(json: GltfJson, node: GltfNode): Model3DCameraInfo | null {
  if (typeof node.camera !== "number") {
    return null;
  }
  const def = cameraDefOf(json, node);
  if (def?.type === "orthographic") {
    return { projection: "orthographic" };
  }
  const info: Model3DCameraInfo = { projection: "perspective" };
  const lens = isRecord(def?.perspective) ? def.perspective : undefined;
  if (typeof lens?.yfov === "number") {
    info.fovDeg = round6(lens.yfov * RAD_TO_DEG);
  }
  if (typeof lens?.aspectRatio === "number") {
    info.aspectRatio = round6(lens.aspectRatio);
  }
  if (typeof lens?.znear === "number") {
    info.znear = lens.znear;
  }
  if (typeof lens?.zfar === "number") {
    info.zfar = lens.zfar;
  }
  return info;
}

function objectType(json: GltfJson, node: GltfNode): string {
  const light = lightTypeOf(json, node);
  if (light) {
    return light;
  }
  if (isRecord(node.extras) && isRecord(node.extras[FIGURE_EXTRA])) {
    return "Figure";
  }
  if (typeof node.mesh === "number") {
    return typeof node.skin === "number" ? "SkinnedMesh" : "Mesh";
  }
  if (typeof node.camera === "number") {
    return cameraDefOf(json, node)?.type === "orthographic"
      ? "OrthographicCamera"
      : "PerspectiveCamera";
  }
  return "Group";
}

/** Material indices a node's mesh draws with. */
function materialIndices(json: GltfJson, node: GltfNode): number[] {
  const mesh = typeof node.mesh === "number" ? json.meshes?.[node.mesh] : undefined;
  return (mesh?.primitives ?? []).flatMap((primitive) =>
    typeof primitive.material === "number" ? [primitive.material] : []
  );
}

function materialColorOf(
  json: GltfJson,
  node: GltfNode,
  index: number
): string | undefined {
  let source = node;
  if (figureInfoOf(node)) {
    // A figure's color is the color of its limbs, which share one material.
    const nodes = readNodes(json);
    const [part] = [...figurePartIndices(json, index).values()].sort((a, b) => a - b);
    if (part === undefined) {
      return undefined;
    }
    source = nodes[part];
  }
  const [first] = materialIndices(json, source);
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
  const color = materialColorOf(json, node, index);
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
  const figure = figureInfoOf(node);
  if (figure) {
    object.figure = figure;
  }
  const camera = cameraInfoOf(json, node);
  if (camera) {
    object.camera = camera;
  }
  return object;
}

/**
 * Every object in the document's active scene, parents before children. The
 * walk is iterative, so a deep hierarchy cannot overflow the stack, and it
 * only reads the document. A figure is one object: its joint nodes are left
 * out, as the browser editor leaves them out of its outliner.
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
      if (!isFigurePart(node)) {
        out.push(serializeObject(json, node, index, parents, ids));
      }
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

/**
 * Resolve a target by id or case-insensitive name. Throws when nothing
 * matches. A figure's joint nodes do not resolve: the figure is the object.
 */
export function resolveTarget(json: GltfJson, target: string): number {
  const nodes = readNodes(json);
  const raw = target.trim();
  const byId = objectIds(nodes).indexOf(raw);
  if (byId >= 0 && !isFigurePart(nodes[byId])) {
    return byId;
  }
  const lower = raw.toLowerCase();
  const byName = nodes.findIndex(
    (node) => !isFigurePart(node) && (node.name ?? "").trim().toLowerCase() === lower
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
    readNodes(json)
      .filter((node) => !isFigurePart(node))
      .map((node) => (node.name ?? "").trim().toLowerCase())
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
    byteOffset?: number;
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

/** What `add_object` and `set_figure` accept for a figure. */
export interface FigureOptions {
  body?: FigureBody;
  pose?: FigurePose;
  /** Standing height in meters. Defaults to the body's own. */
  height?: number;
  /** CSS hex color of the whole figure. */
  color?: string;
  /** The cast entity the figure stands in for. Null clears it. */
  entityId?: string | null;
  /** A free-text label such as a character name. Null clears it. */
  label?: string | null;
}

/** What `add_object` and `set_camera` accept for a camera. */
export interface CameraOptions {
  /** Vertical field of view in degrees. */
  fovDeg?: number;
  aspectRatio?: number;
  znear?: number;
  zfar?: number;
  /** A point the camera is turned to face. */
  lookAt?: Vec3;
}

export const CAMERA_DEFAULT_FOV_DEG = 40;
export const CAMERA_DEFAULT_ASPECT = 16 / 9;
export const CAMERA_DEFAULT_ZNEAR = 0.1;
export const CAMERA_DEFAULT_ZFAR = 1000;

export interface AddObjectOptions {
  /** Encoder for the appended geometry buffer (injected so this stays pure). */
  base64Encode: (bytes: Uint8Array) => string;
  /** Where the object goes, in place of the kind's default position. */
  position?: Vec3;
  /** Settings of a `figure`. */
  figure?: FigureOptions;
  /** Settings of a `camera`. */
  camera?: CameraOptions;
}

interface MeshAccessors {
  POSITION: number;
  NORMAL: number;
  indices: number;
}

/**
 * Append geometries as one data-URI buffer (all positions, then all normals,
 * then all indices) and return each one's accessors.
 */
function appendGeometries(
  json: GltfJson,
  geometries: readonly Geometry[],
  base64: (bytes: Uint8Array) => string
): MeshAccessors[] {
  const total = (pick: (g: Geometry) => { byteLength: number }): number =>
    geometries.reduce((sum, geometry) => sum + pick(geometry).byteLength, 0);
  const positionBytes = total((g) => g.positions);
  const normalBytes = total((g) => g.normals);
  const indexBytes = total((g) => g.indices);
  const packed = new Uint8Array(positionBytes + normalBytes + indexBytes);
  const bytesOf = (array: Float32Array | Uint32Array): Uint8Array =>
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

  let positionOffset = 0;
  let normalOffset = 0;
  let indexOffset = 0;
  const placed = geometries.map((geometry) => {
    const at = { position: positionOffset, normal: normalOffset, index: indexOffset };
    packed.set(bytesOf(geometry.positions), at.position);
    packed.set(bytesOf(geometry.normals), positionBytes + at.normal);
    packed.set(bytesOf(geometry.indices), positionBytes + normalBytes + at.index);
    positionOffset += geometry.positions.byteLength;
    normalOffset += geometry.normals.byteLength;
    indexOffset += geometry.indices.byteLength;
    return at;
  });

  const buffer = appendBuffer(json, packed, base64);
  const positionView = appendBufferView(json, buffer, 0, positionBytes, TARGET_ARRAY_BUFFER);
  const normalView = appendBufferView(
    json,
    buffer,
    positionBytes,
    normalBytes,
    TARGET_ARRAY_BUFFER
  );
  const indexView = appendBufferView(
    json,
    buffer,
    positionBytes + normalBytes,
    indexBytes,
    TARGET_ELEMENT_ARRAY_BUFFER
  );

  // A zero offset is left out, as glTF's default.
  const offset = (byteOffset: number): { byteOffset?: number } =>
    byteOffset > 0 ? { byteOffset } : {};
  return geometries.map((geometry, order) => {
    const { min, max } = boundsOf(geometry.positions);
    return {
      POSITION: appendAccessor(json, {
        bufferView: positionView,
        ...offset(placed[order].position),
        componentType: COMPONENT_FLOAT,
        count: geometry.positions.length / 3,
        type: "VEC3",
        min,
        max
      }),
      NORMAL: appendAccessor(json, {
        bufferView: normalView,
        ...offset(placed[order].normal),
        componentType: COMPONENT_FLOAT,
        count: geometry.normals.length / 3,
        type: "VEC3"
      }),
      indices: appendAccessor(json, {
        bufferView: indexView,
        ...offset(placed[order].index),
        componentType: COMPONENT_UNSIGNED_INT,
        count: geometry.indices.length,
        type: "SCALAR"
      })
    };
  });
}

function appendMesh(
  json: GltfJson,
  name: string,
  accessors: MeshAccessors,
  material: number
): number {
  json.meshes ??= [];
  json.meshes.push({
    name,
    primitives: [
      {
        attributes: { POSITION: accessors.POSITION, NORMAL: accessors.NORMAL },
        indices: accessors.indices,
        material
      }
    ]
  });
  return json.meshes.length - 1;
}

function requireFigureHeight(height: number): number {
  if (!Number.isFinite(height) || height < FIGURE_MIN_HEIGHT || height > FIGURE_MAX_HEIGHT) {
    throw new Model3DOperationError(
      `A figure's height must be between ${FIGURE_MIN_HEIGHT} and ${FIGURE_MAX_HEIGHT} meters; got ${height}.`
    );
  }
  return height;
}

function requireHexColor(color: string): Vec3 {
  const rgb = hexToLinearRgb(color);
  if (!rgb) {
    throw new Model3DOperationError(
      `color must be a CSS hex string like "#ff8800"; got "${color}".`
    );
  }
  return rgb;
}

/** Write or clear the optional text fields of a figure's extra. */
function applyFigureLinks(info: FigureInfo, options: FigureOptions): void {
  if (options.entityId !== undefined) {
    const entityId = options.entityId?.trim() ?? "";
    if (entityId === "") {
      delete info.entityId;
    } else {
      info.entityId = entityId;
    }
  }
  if (options.label !== undefined) {
    const label = options.label?.trim() ?? "";
    if (label === "") {
      delete info.label;
    } else {
      info.label = label;
    }
  }
}

const partTransform = (part: FigurePart, node: GltfNode): void => {
  delete node.matrix;
  node.translation = part.translation.map(round6) as Vec3;
  node.rotation = [...eulerDegreesToQuaternion(part.rotation)];
};

/** Create a figure's joint nodes under `root`, which is not in `nodes` yet. */
function addFigureParts(
  json: GltfJson,
  root: GltfNode,
  options: FigureOptions,
  base64: (bytes: Uint8Array) => string
): void {
  const body = options.body ?? FIGURE_DEFAULT_BODY;
  const pose = options.pose ?? FIGURE_DEFAULT_POSE;
  const height = requireFigureHeight(options.height ?? FIGURE_DEFAULT_HEIGHT[body]);
  const color = requireHexColor(options.color ?? FIGURE_DEFAULT_COLOR);
  const { parts } = buildFigure(body, pose, height);

  json.materials ??= [];
  const figureMaterial = defaultMaterial(`${root.name} Material`);
  (figureMaterial.pbrMetallicRoughness as { baseColorFactor: number[] }).baseColorFactor = [
    ...color,
    1
  ];
  json.materials.push(figureMaterial);
  const material = json.materials.length - 1;

  const accessors = appendGeometries(
    json,
    parts.map((part) => part.geometry),
    base64
  );
  const nodes = nodesOf(json);
  // The root is pushed by the caller right after, so it takes this index.
  const rootIndex = nodes.length;
  const indexOf = new Map<FigureJoint, number>();
  parts.forEach((part, order) => indexOf.set(part.joint, rootIndex + 1 + order));
  const partNodes = parts.map((part, order) => {
    const node: GltfNode = {
      name: part.name,
      mesh: appendMesh(json, `${root.name} ${part.name}`, accessors[order], material),
      extras: { [ID_KEY]: freshObjectId(), [FIGURE_PART_EXTRA]: part.joint }
    };
    partTransform(part, node);
    const children = parts
      .filter((child) => child.parent === part.joint)
      .map((child) => indexOf.get(child.joint) as number);
    if (children.length > 0) {
      node.children = children;
    }
    return node;
  });
  root.children = [indexOf.get("pelvis") as number];
  const info: FigureInfo = { body, pose, height };
  applyFigureLinks(info, options);
  extrasOf(root)[FIGURE_EXTRA] = info;
  nodes.push(root, ...partNodes);
}

function lensOf(options: CameraOptions, current?: GltfCamera["perspective"]): NonNullable<GltfCamera["perspective"]> {
  const fovDeg = options.fovDeg;
  if (fovDeg !== undefined && !(Number.isFinite(fovDeg) && fovDeg >= 1 && fovDeg <= 179)) {
    throw new Model3DOperationError(`fovDeg must be between 1 and 179 degrees; got ${fovDeg}.`);
  }
  for (const key of ["aspectRatio", "znear", "zfar"] as const) {
    const value = options[key];
    if (value !== undefined && !(Number.isFinite(value) && value > 0)) {
      throw new Model3DOperationError(`${key} must be a number above 0; got ${value}.`);
    }
  }
  const lens = {
    ...current,
    yfov:
      fovDeg !== undefined
        ? fovDeg / RAD_TO_DEG
        : (current?.yfov ?? CAMERA_DEFAULT_FOV_DEG / RAD_TO_DEG),
    znear: options.znear ?? current?.znear ?? CAMERA_DEFAULT_ZNEAR,
    zfar: options.zfar ?? current?.zfar ?? CAMERA_DEFAULT_ZFAR,
    aspectRatio: options.aspectRatio ?? current?.aspectRatio ?? CAMERA_DEFAULT_ASPECT
  };
  if (lens.zfar <= lens.znear) {
    throw new Model3DOperationError(
      `zfar (${lens.zfar}) must be greater than znear (${lens.znear}).`
    );
  }
  return lens;
}

/** Turn `node` so its -Z axis points from its position at `target`. */
function aimNode(node: GltfNode, target: Vec3): void {
  const eye = (node.translation ?? [0, 0, 0]) as Vec3;
  const rotation = lookAtQuaternion(eye, target);
  if (!rotation) {
    throw new Model3DOperationError(
      `lookAt [${target.join(", ")}] is the camera's own position, so there is no direction to face.`
    );
  }
  node.rotation = rotation.map(round6) as Quat;
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
  const position = options.position ?? defaults.position;
  if (position.some((n) => !Number.isFinite(n))) {
    throw new Model3DOperationError(
      `position must be three finite numbers; got [${position.join(", ")}].`
    );
  }
  const node: GltfNode = {
    name: uniqueName(json, name?.trim() || PRIMITIVE_LABELS[kind]),
    translation: [...position],
    rotation: [...eulerDegreesToQuaternion(defaults.rotation)],
    scale: [...defaults.scale]
  };
  // A new node needs an id no earlier object ever held. Left to
  // `ensureObjectIds`, it would take `node-<index>`, which a deleted object
  // may have answered to, so an agent holding that id would edit this one.
  extrasOf(node)[ID_KEY] = freshObjectId();
  const nodes = nodesOf(json);
  const index = nodes.length;

  if (kind === "figure") {
    addFigureParts(json, node, options.figure ?? {}, options.base64Encode);
  } else if (kind === "camera") {
    const lens = lensOf(options.camera ?? {});
    if (options.camera?.lookAt) {
      aimNode(node, options.camera.lookAt);
    }
    // The camera entry carries no name: GLTFLoader would give the name to the
    // camera first and the node a suffixed one, so the scene would list
    // "Camera_1" for a camera saved as "Camera".
    json.cameras = Array.isArray(json.cameras) ? json.cameras : [];
    json.cameras.push({ type: "perspective", perspective: lens } satisfies GltfCamera);
    node.camera = json.cameras.length - 1;
    nodes.push(node);
  } else if (isMeshKind(kind)) {
    const [accessors] = appendGeometries(
      json,
      [buildPrimitiveGeometry(kind)],
      options.base64Encode
    );
    json.materials ??= [];
    const meshMaterial = defaultMaterial(`${node.name} Material`);
    if (kind === "plane") {
      // A plane has no back face of its own; without this it disappears from
      // half the angles a camera can look at it from.
      meshMaterial.doubleSided = true;
    }
    json.materials.push(meshMaterial);
    node.mesh = appendMesh(json, node.name as string, accessors, json.materials.length - 1);
    nodes.push(node);
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
    nodes.push(node);
  }

  activeScene(json).nodes?.push(index);
  ensureObjectIds(json);
  setSelectedId(json, idOf(json, index));
  return serializeObject(json, node, index, parentIndices(json));
}

/**
 * Change a figure's body, pose, height or cast link. Joint nodes are posed in
 * place. A new body or height also gives them new meshes, and the old
 * geometry stays in the file unreferenced.
 */
export function setFigure(
  json: GltfJson,
  target: string,
  options: FigureOptions,
  base64: (bytes: Uint8Array) => string
): Model3DSceneObject {
  ensureObjectIds(json);
  const index = resolveTarget(json, target);
  const nodes = nodesOf(json);
  const node = nodes[index];
  const current = figureInfoOf(node);
  if (!current) {
    throw new Model3DOperationError(
      `"${node.name ?? target}" is a ${objectType(json, node)}, not a figure.`
    );
  }
  const body = options.body ?? current.body;
  const height = requireFigureHeight(
    options.height ?? (options.body ? FIGURE_DEFAULT_HEIGHT[body] : current.height)
  );
  const next: FigureInfo = { ...current, body, pose: options.pose ?? current.pose, height };
  applyFigureLinks(next, options);
  const color = options.color === undefined ? null : requireHexColor(options.color);

  const partIndices = figurePartIndices(json, index);
  const missing = FIGURE_JOINTS.filter((joint) => !partIndices.has(joint));
  if (missing.length > 0) {
    throw new Model3DOperationError(
      `"${node.name ?? target}" has lost its ${missing.join(", ")} joint(s), so it cannot be posed. Delete it and add a new figure.`
    );
  }
  const { parts } = buildFigure(next.body, next.pose, next.height);
  const reshaped = next.body !== current.body || next.height !== current.height;
  const accessors = reshaped
    ? appendGeometries(
        json,
        parts.map((part) => part.geometry),
        base64
      )
    : [];
  parts.forEach((part, order) => {
    const partNode = nodes[partIndices.get(part.joint) as number];
    partTransform(part, partNode);
    if (!reshaped) {
      return;
    }
    const primitive = json.meshes?.[partNode.mesh ?? -1]?.primitives?.[0];
    const material = primitive?.material ?? materialIndices(json, nodes[partIndices.get("pelvis") as number])[0] ?? 0;
    partNode.mesh = appendMesh(
      json,
      `${node.name ?? "Figure"} ${part.name}`,
      accessors[order],
      material
    );
  });
  extrasOf(node)[FIGURE_EXTRA] = next;
  if (color) {
    paintFigure(json, index, color);
  }
  return serializeObject(json, node, index, parentIndices(json));
}

/** Set the base color of every limb of a figure. */
function paintFigure(json: GltfJson, root: number, rgb: Vec3): void {
  const nodes = readNodes(json);
  const own = new Set<number>();
  for (const part of figurePartIndices(json, root).values()) {
    const mesh = nodes[part].mesh;
    if (typeof mesh === "number") {
      own.add(mesh);
    }
  }
  // A material another object also draws with is copied once for the figure.
  const foreign = new Set<number>();
  (json.meshes ?? []).forEach((mesh, meshIndex) => {
    if (own.has(meshIndex)) {
      return;
    }
    for (const primitive of mesh.primitives ?? []) {
      if (typeof primitive.material === "number") {
        foreign.add(primitive.material);
      }
    }
  });
  json.materials ??= [];
  const copies = new Map<number, number>();
  for (const meshIndex of own) {
    for (const primitive of json.meshes?.[meshIndex]?.primitives ?? []) {
      let materialIndex = primitive.material;
      if (materialIndex === undefined) {
        json.materials.push(defaultMaterial("Figure Material"));
        materialIndex = json.materials.length - 1;
      } else if (foreign.has(materialIndex)) {
        if (!copies.has(materialIndex)) {
          json.materials.push(
            JSON.parse(JSON.stringify(json.materials[materialIndex] ?? {})) as GltfMaterial
          );
          copies.set(materialIndex, json.materials.length - 1);
        }
        materialIndex = copies.get(materialIndex) as number;
      }
      primitive.material = materialIndex;
      const material = json.materials[materialIndex] ?? {};
      const pbr = material.pbrMetallicRoughness ?? {};
      material.pbrMetallicRoughness = {
        ...pbr,
        baseColorFactor: [...rgb, pbr.baseColorFactor?.[3] ?? 1]
      };
      json.materials[materialIndex] = material;
    }
  }
}

/** Change a camera's lens, move it, or turn it to face a point. */
export function setCamera(
  json: GltfJson,
  target: string,
  options: CameraOptions & { position?: Vec3 }
): Model3DSceneObject {
  ensureObjectIds(json);
  const index = resolveTarget(json, target);
  const node = nodesOf(json)[index];
  const cameraIndex = node.camera;
  if (typeof cameraIndex !== "number") {
    throw new Model3DOperationError(
      `"${node.name ?? target}" is a ${objectType(json, node)}, not a camera.`
    );
  }
  const changesLens = (["fovDeg", "aspectRatio", "znear", "zfar"] as const).some(
    (key) => options[key] !== undefined
  );
  if (changesLens) {
    const def = cameraDefOf(json, node);
    if (!def || def.type !== "perspective") {
      throw new Model3DOperationError(
        `"${node.name ?? target}" is not a perspective camera, so it has no field of view to set.`
      );
    }
    const lens = lensOf(options, def.perspective);
    // Another node showing through the same camera entry keeps its lens.
    const shared = readNodes(json).filter((other) => other.camera === cameraIndex).length > 1;
    if (shared) {
      const cameras = json.cameras as unknown[];
      cameras.push({ ...(JSON.parse(JSON.stringify(def)) as GltfCamera), perspective: lens });
      node.camera = cameras.length - 1;
    } else {
      def.perspective = lens;
    }
  }
  if (options.position || options.lookAt) {
    const raw = readRawTransform(node);
    const position = options.position ?? raw.position;
    if (position.some((n) => !Number.isFinite(n))) {
      throw new Model3DOperationError(
        `position must be three finite numbers; got [${position.join(", ")}].`
      );
    }
    const rotation = node.matrix
      ? eulerDegreesToQuaternion(raw.rotation)
      : ((node.rotation ?? [0, 0, 0, 1]) as Quat);
    delete node.matrix;
    node.translation = [...position];
    node.rotation = [...rotation];
    node.scale = [...raw.scale];
    if (options.lookAt) {
      aimNode(node, options.lookAt);
    }
  }
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
  if (figureInfoOf(node)) {
    paintFigure(json, index, rgb);
    return serializeObject(json, node, index, parentIndices(json));
  }
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
