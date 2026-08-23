/**
 * The glTF 2.0 container: the JSON shapes this package reads and writes, plus
 * the two envelopes it comes in — binary `.glb` and plain `.gltf` JSON.
 *
 * Only the fields the scene operations touch are typed. Everything else rides
 * through untouched: a document this package rewrites keeps its meshes,
 * animations, skins, textures and extensions byte-for-byte unless an operation
 * asked for a change.
 */

export interface GltfAsset {
  version: string;
  generator?: string;
  [key: string]: unknown;
}

export interface GltfNode {
  name?: string;
  children?: number[];
  mesh?: number;
  camera?: number;
  skin?: number;
  matrix?: number[];
  translation?: [number, number, number];
  /** Quaternion, `[x, y, z, w]`. */
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  extras?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GltfScene {
  name?: string;
  nodes?: number[];
  [key: string]: unknown;
}

export interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
  [key: string]: unknown;
}

export interface GltfMesh {
  name?: string;
  primitives: GltfPrimitive[];
  [key: string]: unknown;
}

export interface GltfMaterial {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: number[];
    metallicFactor?: number;
    roughnessFactor?: number;
    [key: string]: unknown;
  };
  doubleSided?: boolean;
  [key: string]: unknown;
}

export interface GltfBuffer {
  byteLength: number;
  uri?: string;
  [key: string]: unknown;
}

export interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
  [key: string]: unknown;
}

export interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
  normalized?: boolean;
  [key: string]: unknown;
}

export interface GltfAnimationChannel {
  sampler: number;
  target: { node?: number; path: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface GltfAnimation {
  channels: GltfAnimationChannel[];
  samplers: unknown[];
  [key: string]: unknown;
}

export interface GltfSkin {
  joints: number[];
  skeleton?: number;
  [key: string]: unknown;
}

/** A punctual light, as `KHR_lights_punctual` declares it. */
export interface GltfPunctualLight {
  type: "directional" | "point" | "spot";
  name?: string;
  color?: [number, number, number];
  intensity?: number;
  range?: number;
  spot?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GltfJson {
  asset: GltfAsset;
  scene?: number;
  scenes?: GltfScene[];
  nodes?: GltfNode[];
  meshes?: GltfMesh[];
  materials?: GltfMaterial[];
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: GltfBuffer[];
  animations?: GltfAnimation[];
  skins?: GltfSkin[];
  cameras?: unknown[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

/** How a document arrived, so writing it back keeps the same envelope. */
export type Model3DFormat = "glb" | "gltf";

/**
 * A parsed document: the JSON plus the GLB binary chunk, when there was one.
 * Buffer 0 of a `.glb` lives in {@link bin}; every other buffer keeps its own
 * `uri`, which is where geometry this package appends goes.
 */
export interface Model3DFile {
  json: GltfJson;
  bin: Uint8Array | null;
  format: Model3DFormat;
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export class Model3DParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Model3DParseError";
  }
}

const isGlb = (bytes: Uint8Array): boolean =>
  bytes.length >= 12 &&
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    0,
    true
  ) === GLB_MAGIC;

function parseGlbBytes(bytes: Uint8Array): Model3DFile {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    offset += 8;
    const chunk = bytes.slice(offset, offset + length);
    if (type === CHUNK_JSON) {
      json = JSON.parse(textDecoder.decode(chunk)) as GltfJson;
    } else if (type === CHUNK_BIN) {
      bin = chunk;
    }
    offset += length;
  }
  if (!json) {
    throw new Model3DParseError("GLB has no JSON chunk.");
  }
  return { json, bin, format: "glb" };
}

/** Read a `.glb` or `.gltf` document. Throws {@link Model3DParseError}. */
export function parseModel3D(bytes: Uint8Array): Model3DFile {
  if (isGlb(bytes)) {
    return parseGlbBytes(bytes);
  }
  let json: unknown;
  try {
    json = JSON.parse(textDecoder.decode(bytes));
  } catch (error) {
    throw new Model3DParseError(
      `Not a glTF document: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Model3DParseError("glTF JSON must be an object.");
  }
  const doc = json as GltfJson;
  if (!doc.asset || typeof doc.asset.version !== "string") {
    throw new Model3DParseError(
      "glTF JSON has no `asset.version` — this is not a glTF 2.0 document."
    );
  }
  return { json: doc, bin: null, format: "gltf" };
}

function buildGlb(json: GltfJson, bin: Uint8Array | null): Uint8Array {
  const jsonBytes = textEncoder.encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunk = new Uint8Array(jsonBytes.length + jsonPad);
  jsonChunk.set(jsonBytes);
  jsonChunk.fill(0x20, jsonBytes.length);

  const binBytes = bin ?? new Uint8Array(0);
  const binPad = (4 - (binBytes.length % 4)) % 4;
  const hasBin = binBytes.length > 0;
  const binChunkLength = hasBin ? 8 + binBytes.length + binPad : 0;

  const total = 12 + 8 + jsonChunk.length + binChunkLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunk.length, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.set(jsonChunk, 20);
  if (hasBin) {
    const binOffset = 20 + jsonChunk.length;
    view.setUint32(binOffset, binBytes.length + binPad, true);
    view.setUint32(binOffset + 4, CHUNK_BIN, true);
    out.set(binBytes, binOffset + 8);
  }
  return out;
}

/** Serialize a document back into the envelope it came in. */
export function serializeModel3D(file: Model3DFile): Uint8Array {
  if (file.format === "glb") {
    return buildGlb(file.json, file.bin);
  }
  return textEncoder.encode(JSON.stringify(file.json, null, 2));
}

export const MIME_FOR_FORMAT: Record<Model3DFormat, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json"
};

/** An empty glTF 2.0 scene — the document `create_model3d` starts from. */
export function emptyGltf(name = "Scene"): GltfJson {
  return {
    asset: { version: "2.0", generator: "NodeTool" },
    scene: 0,
    scenes: [{ name, nodes: [] }],
    nodes: []
  };
}
