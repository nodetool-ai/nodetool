import { z } from "zod";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import type { GameAssetBinding3D, GamePreparedCollider3D } from "@nodetool-ai/protocol";
import { prepareGameModelBinding3D, selectedGameModelSceneRoots3D, type GameModelDiagnostic, type PrepareGameModelBinding3DResult } from "./preparation.js";

const integer = z.number().int().nonnegative();
const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const sourceProfile = z.object({
  asset: z.object({ version: z.literal("2.0") }).passthrough(),
  buffers: z.array(z.object({ byteLength: integer, uri: z.string().optional() }).passthrough()).max(64).default([]),
  bufferViews: z.array(z.object({ buffer: integer, byteOffset: integer.default(0), byteLength: integer, byteStride: integer.optional() }).passthrough()).max(10000).default([]),
  images: z.array(z.object({ bufferView: integer.optional(), uri: z.string().optional(), mimeType: z.string().optional() }).passthrough()).max(256).default([]),
  accessors: z.array(z.object({ bufferView: integer, byteOffset: integer.default(0), componentType: integer, count: integer,
    type: z.string(), normalized: z.boolean().optional(), min: z.array(z.number().finite()).optional(), max: z.array(z.number().finite()).optional() }).passthrough()).max(10000).default([]),
  nodes: z.array(z.object({ mesh: integer.optional(), skin: integer.optional(), children: z.array(integer).default([]),
    matrix: z.array(z.number().finite()).length(16).optional(), translation: vector.optional(),
    rotation: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]).optional(), scale: vector.optional() }).passthrough()).max(4096).default([]),
  meshes: z.array(z.object({ primitives: z.array(z.object({ attributes: z.record(z.string(), integer), indices: integer.optional(),
    targets: z.array(z.record(z.string(), integer)).optional() }).passthrough()) }).passthrough()).max(4096).default([]),
  skins: z.array(z.object({ inverseBindMatrices: integer.optional() }).passthrough()).default([]),
  animations: z.array(z.object({ samplers: z.array(z.object({ input: integer, output: integer }).passthrough()),
    channels: z.array(z.object({ sampler: integer, target: z.object({ path: z.string() }).passthrough() }).passthrough()) }).passthrough()).max(256).default([]),
  scenes: z.array(z.object({ nodes: z.array(integer).default([]) }).passthrough()).max(64).default([]),
  scene: integer.optional(),
}).passthrough();

export interface GameModelImportSettings3D {
  readonly scale: number;
  readonly forward: "-z" | "+z" | "+x" | "-x";
  readonly origin: "preserve" | "ground" | "centerGround";
}
export const DEFAULT_GAME_MODEL_IMPORT_SETTINGS_3D: GameModelImportSettings3D = { scale: 1, forward: "-z", origin: "preserve" };

function container(bytes: Uint8Array): { readonly json: unknown; readonly binary: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 20 && view.getUint32(0, true) === 0x46546c67) {
    if (view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length || view.getUint32(16, true) !== 0x4e4f534a) { throw new Error("Malformed GLB import container"); }
    const size = view.getUint32(12, true);
    if (size % 4 !== 0 || size + 20 > bytes.length) { throw new Error("Malformed GLB JSON chunk"); }
    const offset = 20 + size;
    const json: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(20, offset)).trim());
    if (offset === bytes.length) { return { json, binary: new Uint8Array() }; }
    if (offset + 8 > bytes.length || view.getUint32(offset + 4, true) !== 0x004e4942 || offset + 8 + view.getUint32(offset, true) !== bytes.length) { throw new Error("Malformed GLB binary chunk"); }
    return { json, binary: bytes.subarray(offset + 8) };
  }
  return { json: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), binary: new Uint8Array() };
}

function encodeGlb(json: z.infer<typeof sourceProfile>, binary: Uint8Array): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonSize = Math.ceil(text.length / 4) * 4;
  const binarySize = Math.ceil(binary.length / 4) * 4;
  const bytes = new Uint8Array(20 + jsonSize + (binary.length ? 8 + binarySize : 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonSize, true); view.setUint32(16, 0x4e4f534a, true); bytes.fill(32, 20, 20 + jsonSize); bytes.set(text, 20);
  if (binary.length) { view.setUint32(20 + jsonSize, binarySize, true); view.setUint32(24 + jsonSize, 0x004e4942, true); bytes.set(binary, 28 + jsonSize); }
  return bytes;
}

function component(view: DataView, offset: number, type: number): number {
  if (type === 5120) { return view.getInt8(offset); }
  if (type === 5121) { return view.getUint8(offset); }
  if (type === 5122) { return view.getInt16(offset, true); }
  if (type === 5123) { return view.getUint16(offset, true); }
  if (type === 5125) { return view.getUint32(offset, true); }
  if (type === 5126) { return view.getFloat32(offset, true); }
  throw new Error("Unsupported accessor component type");
}
const widths = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]]);
const components = new Map([["SCALAR", 1], ["VEC2", 2], ["VEC3", 3], ["VEC4", 4], ["MAT4", 16]]);
function readAccessor(document: z.infer<typeof sourceProfile>, binary: Uint8Array, index: number): number[] {
  const accessor = document.accessors[index];
  const bufferView = accessor ? document.bufferViews[accessor.bufferView] : undefined;
  const width = accessor ? widths.get(accessor.componentType) : undefined;
  const count = accessor ? components.get(accessor.type) : undefined;
  if (!accessor || !bufferView || !width || !count || accessor.count * count > 4_000_000) { throw new Error("Malformed or over-budget geometry accessor"); }
  const stride = bufferView.byteStride ?? width * count;
  if (stride < width * count || accessor.byteOffset + (Math.max(0, accessor.count - 1) * stride) + width * count > bufferView.byteLength) { throw new Error("Geometry accessor exceeds its buffer view"); }
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const values: number[] = [];
  for (let item = 0; item < accessor.count; item++) {
    for (let axis = 0; axis < count; axis++) {
      let value = component(view, bufferView.byteOffset + accessor.byteOffset + item * stride + axis * width, accessor.componentType);
      if (accessor.normalized) {
        if (accessor.componentType === 5120) { value = Math.max(-1, value / 127); }
        else if (accessor.componentType === 5121) { value /= 255; }
        else if (accessor.componentType === 5122) { value = Math.max(-1, value / 32767); }
        else if (accessor.componentType === 5123) { value /= 65535; }
      }
      if (!Number.isFinite(value)) { throw new Error("Geometry contains non-finite values"); }
      values.push(value);
    }
  }
  return values;
}

/** Resolves authorized source dependencies and bakes source units into a closed runtime GLB. */
export async function normalizeGameModel3D(source: Uint8Array, options: {
  readonly assetId: string;
  readonly sourceAssetId?: string;
  readonly importSettings?: Partial<GameModelImportSettings3D>;
  readonly resolveDependency?: (uri: string, signal?: AbortSignal) => Promise<Uint8Array | null>;
  readonly signal?: AbortSignal;
  readonly provenance?: string;
}): Promise<PrepareGameModelBinding3DResult> {
  options.signal?.throwIfAborted();
  try {
    if (source.length > 64 * 1024 * 1024) { throw new Error("Model source exceeds import byte budget"); }
    const settings = { ...DEFAULT_GAME_MODEL_IMPORT_SETTINGS_3D, ...options.importSettings };
    if (!Number.isFinite(settings.scale) || settings.scale <= 0 || settings.scale > 10000 || !["-z", "+z", "+x", "-x"].includes(settings.forward) || !["preserve", "ground", "centerGround"].includes(settings.origin)) { throw new Error("Invalid model import settings"); }
    const decoded = container(source);
    const document = sourceProfile.parse(decoded.json);
    let length = 0;
    const parts: { readonly offset: number; readonly bytes: Uint8Array }[] = [];
    const append = (bytes: Uint8Array): number => {
      const offset = length; length += Math.ceil(bytes.length / 4) * 4;
      if (length > 64 * 1024 * 1024) { throw new Error("Resolved model dependencies exceed import byte budget"); }
      parts.push({ offset, bytes }); return offset;
    };
    const resolveDependency = async (uri: string): Promise<Uint8Array> => {
      options.signal?.throwIfAborted();
      if (uri.startsWith("data:")) {
        const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=]+)$/.exec(uri);
        if (!match?.[1] || match[1].length > 90 * 1024 * 1024) { throw new Error("Malformed or over-budget embedded source data"); }
        return Uint8Array.from(atob(match[1]), (value) => value.charCodeAt(0));
      }
      const result = await options.resolveDependency?.(uri, options.signal);
      options.signal?.throwIfAborted();
      if (!result) { throw new Error(`Unresolved authorized model dependency: ${uri}`); }
      return result;
    };
    const offsets: number[] = [];
    for (const [index, buffer] of document.buffers.entries()) {
      const bytes = buffer.uri ? await resolveDependency(buffer.uri) : index === 0 ? decoded.binary : new Uint8Array();
      if (bytes.length < buffer.byteLength || bytes.length - buffer.byteLength > 3) { throw new Error("Source buffer length does not match its declaration"); }
      offsets.push(append(bytes.subarray(0, buffer.byteLength)));
    }
    for (const view of document.bufferViews) {
      const buffer = document.buffers[view.buffer]; const offset = offsets[view.buffer];
      if (!buffer || offset === undefined || view.byteOffset + view.byteLength > buffer.byteLength) { throw new Error("Source buffer view is outside its buffer"); }
      view.byteOffset += offset; view.buffer = 0;
    }
    for (const image of document.images) {
      if (!image.uri) { continue; }
      const bytes = await resolveDependency(image.uri);
      const offset = append(bytes);
      image.bufferView = document.bufferViews.length;
      document.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
      image.mimeType = image.mimeType ?? (bytes[0] === 137 ? "image/png" : bytes[0] === 255 ? "image/jpeg" : "");
      delete image.uri;
    }
    const merge = (): Uint8Array => { const bytes = new Uint8Array(length); parts.forEach((part) => bytes.set(part.bytes, part.offset)); return bytes; };
    const original = merge();
    const rewritten = new Set<number>();
    const rewrite = (index: number, inverseBind = false): void => {
      if (rewritten.has(index)) { return; } rewritten.add(index);
      const accessor = document.accessors[index]; if (!accessor) { throw new Error("Import transform references a missing accessor"); }
      const count = components.get(accessor.type); if (!count) { throw new Error("Unsupported transformed accessor"); }
      const values = readAccessor(document, original, index);
      const minimum = Array.from({ length: count }, () => Infinity); const maximum = Array.from({ length: count }, () => -Infinity);
      values.forEach((value, offset) => {
        const axis = offset % count;
        values[offset] = inverseBind ? axis >= 12 && axis <= 14 ? value * settings.scale : value : value * settings.scale;
        minimum[axis] = Math.min(minimum[axis] ?? Infinity, values[offset] ?? 0); maximum[axis] = Math.max(maximum[axis] ?? -Infinity, values[offset] ?? 0);
      });
      const bytes = new Uint8Array(new Float32Array(values).buffer);
      accessor.bufferView = document.bufferViews.length;
      document.bufferViews.push({ buffer: 0, byteOffset: append(bytes), byteLength: bytes.length });
      accessor.byteOffset = 0; accessor.componentType = 5126; accessor.normalized = false;
      if (accessor.type !== "MAT4") { accessor.min = minimum; accessor.max = maximum; }
    };
    if (settings.scale !== 1) {
      for (const mesh of document.meshes) {
        for (const primitive of mesh.primitives) {
          if (primitive.attributes.POSITION !== undefined) { rewrite(primitive.attributes.POSITION); }
          primitive.targets?.forEach((target) => { if (target.POSITION !== undefined) { rewrite(target.POSITION); } });
        }
      }
      document.skins.forEach((skin) => { if (skin.inverseBindMatrices !== undefined) { rewrite(skin.inverseBindMatrices, true); } });
      for (const animation of document.animations) {
        for (const channel of animation.channels) { const sampler = animation.samplers[channel.sampler]; if (channel.target.path === "translation" && sampler) { rewrite(sampler.output); } }
      }
      for (const node of document.nodes) {
        if (node.translation) { node.translation = [node.translation[0] * settings.scale, node.translation[1] * settings.scale, node.translation[2] * settings.scale]; }
        if (node.matrix) { for (const index of [12, 13, 14]) { node.matrix[index] = (node.matrix[index] ?? 0) * settings.scale; } }
      }
    }
    const yaw = settings.forward === "+z" ? Math.PI : settings.forward === "+x" ? Math.PI / 2 : settings.forward === "-x" ? -Math.PI / 2 : 0;
    if (!document.scenes.length) {
      const children = new Set(document.nodes.flatMap((node) => node.children));
      document.scenes = [{ nodes: document.nodes.flatMap((_, index) => children.has(index) ? [] : [index]) }];
      document.scene = 0;
    }
    const roots = selectedGameModelSceneRoots3D(document);
    const selected = document.scenes[document.scene ?? 0];
    if (!selected) { throw new Error("Selected import scene is missing"); }
    const wrapper = document.nodes.length;
    document.nodes.push({ children: [...roots], matrix: new Matrix4().makeRotationY(yaw).toArray() });
    document.scenes = [{ ...selected, nodes: [wrapper] }];
    document.scene = 0;
    const wrapperIndices = [wrapper];
    const moveWrappers = (matrix: Matrix4): void => {
      for (const index of wrapperIndices) {
        const wrapper = document.nodes[index];
        if (!wrapper?.matrix) { throw new Error("Prepared import wrapper is missing"); }
        wrapper.matrix = matrix.clone().multiply(new Matrix4().fromArray(wrapper.matrix)).toArray();
      }
    };
    document.buffers = [{ byteLength: length }];
    let result = await prepareGameModelBinding3D(encodeGlb(document, merge()), { assetId: options.assetId, signal: options.signal, provenance: options.provenance });
    if (!result.ok) { return result; }
    if (settings.origin !== "preserve") {
      const bounds = result.binding.bounds;
      moveWrappers(new Matrix4().makeTranslation(settings.origin === "centerGround" ? -(bounds.min.x + bounds.max.x) / 2 : 0, -bounds.min.y,
        settings.origin === "centerGround" ? -(bounds.min.z + bounds.max.z) / 2 : 0));
      result = await prepareGameModelBinding3D(encodeGlb(document, merge()), { assetId: options.assetId, signal: options.signal, provenance: options.provenance });
      if (!result.ok) { return result; }
    }
    const sourceHash = await crypto.subtle.digest("SHA-256", new Uint8Array(source));
    options.signal?.throwIfAborted();
    const binding: Extract<GameAssetBinding3D, { readonly mediaKind: "model" }> = { ...result.binding, importSettings: settings,
      sourceDigest: Array.from(new Uint8Array(sourceHash), (byte) => byte.toString(16).padStart(2, "0")).join("") };
    if (options.sourceAssetId) { binding.sourceAssetId = options.sourceAssetId; }
    return { ...result, binding };
  } catch (error) {
    if (options.signal?.aborted) { options.signal.throwIfAborted(); }
    return { ok: false, diagnostics: [{ code: "model.import", path: "", message: error instanceof Error ? error.message : "Model import failed" }] };
  }
}

export type GameColliderCandidate3DResult =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly binding: Extract<GameAssetBinding3D, { readonly mediaKind: "collider" }> }
  | { readonly ok: false; readonly diagnostics: readonly GameModelDiagnostic[] };

/** Creates a conservative convex bound or authored static triangle mesh from prepared geometry. */
export async function createGameColliderCandidate3D(preparedBytes: Uint8Array, options: {
  readonly assetId: string; readonly shape: "convexHull" | "triangleMesh"; readonly signal?: AbortSignal;
}): Promise<GameColliderCandidate3DResult> {
  const checked = await prepareGameModelBinding3D(preparedBytes, { assetId: options.assetId, signal: options.signal });
  if (!checked.ok) { return checked; }
  try {
    const vertices: number[] = []; const indices: number[] = [];
    if (options.shape === "convexHull") {
      const bounds = checked.binding.bounds;
      for (const x of [bounds.min.x, bounds.max.x]) { for (const y of [bounds.min.y, bounds.max.y]) { for (const z of [bounds.min.z, bounds.max.z]) { vertices.push(x, y, z); } } }
      if (bounds.min.x === bounds.max.x || bounds.min.y === bounds.max.y || bounds.min.z === bounds.max.z) { throw new Error("Convex candidate requires three-dimensional model bounds"); }
    } else {
      const decoded = container(preparedBytes); const document = sourceProfile.parse(decoded.json);
      const roots = selectedGameModelSceneRoots3D(document);
      const visit = (index: number, parent: Matrix4): void => {
        const node = document.nodes[index]; if (!node) { throw new Error("Collider model node is missing"); }
        const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3().fromArray(node.translation ?? [0, 0, 0]), new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]), new Vector3().fromArray(node.scale ?? [1, 1, 1]));
        const world = parent.clone().multiply(local);
        const mesh = node.mesh === undefined ? undefined : document.meshes[node.mesh];
        for (const primitive of mesh?.primitives ?? []) {
          const position = primitive.attributes.POSITION; if (position === undefined) { throw new Error("Collider model POSITION is missing"); }
          const data = readAccessor(document, decoded.binary, position); const base = vertices.length / 3;
          for (let offset = 0; offset < data.length; offset += 3) { const point = new Vector3(data[offset], data[offset + 1], data[offset + 2]).applyMatrix4(world); vertices.push(point.x, point.y, point.z); }
          const triangles = primitive.indices === undefined ? Array.from({ length: data.length / 3 }, (_, number) => number) : readAccessor(document, decoded.binary, primitive.indices);
          for (let offset = 0; offset < triangles.length; offset += 3) {
            const a = triangles[offset]; const b = triangles[offset + 1]; const c = triangles[offset + 2];
            if (a === undefined || b === undefined || c === undefined || a >= data.length / 3 || b >= data.length / 3 || c >= data.length / 3) { throw new Error("Collider model index is invalid"); }
            indices.push(base + a, base + (world.determinant() < 0 ? c : b), base + (world.determinant() < 0 ? b : c));
          }
          if (vertices.length > 750_000 || indices.length > 750_000) { throw new Error("Collider candidate exceeds geometry budget"); }
        }
        node.children.forEach((child) => visit(child, world));
      };
      roots.forEach((index) => visit(index, new Matrix4()));
    }
    const bounds = new Box3();
    for (let offset = 0; offset < vertices.length; offset += 3) { bounds.expandByPoint(new Vector3(vertices[offset], vertices[offset + 1], vertices[offset + 2])); }
    if (bounds.isEmpty()) { throw new Error("Collider candidate has no geometry"); }
    const artifact: GamePreparedCollider3D = { vertices };
    if (options.shape === "triangleMesh") { artifact.indices = indices; }
    const bytes = new TextEncoder().encode(JSON.stringify(artifact));
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    options.signal?.throwIfAborted();
    return { ok: true, bytes, binding: { mediaKind: "collider", assetId: options.assetId, digest: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(""), required: true,
      preparationVersion: "1", shape: options.shape, vertices: vertices.length / 3, triangles: indices.length / 3,
      bounds: { min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z }, max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z } } } };
  } catch (error) {
    if (options.signal?.aborted) { options.signal.throwIfAborted(); }
    return { ok: false, diagnostics: [{ code: "collider.preparation", path: "", message: error instanceof Error ? error.message : "Collider preparation failed" }] };
  }
}
