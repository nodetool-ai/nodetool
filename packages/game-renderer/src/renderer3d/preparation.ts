import { z } from "zod";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import type { GameAssetBinding3D } from "@nodetool-ai/protocol";

const integer = z.number().int().nonnegative();
const gltf = z.object({
  asset: z.object({ version: z.literal("2.0") }).passthrough(),
  extensionsRequired: z.array(z.string()).default([]),
  extensionsUsed: z.array(z.string()).default([]),
  buffers: z.array(z.object({ byteLength: integer, uri: z.string().optional() }).passthrough()).default([]),
  bufferViews: z.array(z.object({ buffer: integer, byteOffset: integer.default(0), byteLength: integer, byteStride: integer.optional() }).passthrough()).default([]),
  accessors: z.array(z.object({ bufferView: integer.optional(), byteOffset: integer.default(0), componentType: integer, normalized: z.boolean().optional(), count: integer, type: z.enum(["SCALAR", "VEC2", "VEC3", "VEC4", "MAT2", "MAT3", "MAT4"]), sparse: z.unknown().optional(), min: z.array(z.number().finite()).optional(), max: z.array(z.number().finite()).optional() }).passthrough()).default([]),
  images: z.array(z.object({ bufferView: integer.optional(), mimeType: z.string().optional(), uri: z.string().optional() }).passthrough()).default([]),
  meshes: z.array(z.object({ primitives: z.array(z.object({ attributes: z.record(z.string(), integer), indices: integer.optional(), mode: integer.default(4) }).passthrough()) }).passthrough()).default([]),
  nodes: z.array(z.object({ name: z.string().optional(), children: z.array(integer).default([]), mesh: integer.optional(), skin: integer.optional(),
    translation: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]).optional(),
    rotation: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]).optional(),
    scale: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]).optional(),
    matrix: z.array(z.number().finite()).length(16).optional() }).passthrough()).max(4096).default([]),
  scenes: z.array(z.object({ nodes: z.array(integer).default([]) }).passthrough()).max(64).default([]),
  scene: integer.optional(),
  skins: z.array(z.object({ joints: z.array(integer).max(512), inverseBindMatrices: integer.optional() }).passthrough()).default([]),
  animations: z.array(z.object({ name: z.string().optional(), samplers: z.array(z.object({ input: integer, output: integer }).passthrough()), channels: z.array(z.object({ sampler: integer, target: z.object({ node: integer.optional(), path: z.string() }).passthrough() }).passthrough()) }).passthrough()).default([]),
}).passthrough();

export interface GameModelBudgets {
  readonly maxSourceBytes: number;
  readonly maxGeometryBytes: number;
  readonly maxTextureBytes: number;
  readonly maxTriangles: number;
  readonly maxNodes: number;
}

export const GAME_MODEL_BUDGETS: GameModelBudgets = {
  maxSourceBytes: 64 * 1024 * 1024,
  maxGeometryBytes: 64 * 1024 * 1024,
  maxTextureBytes: 128 * 1024 * 1024,
  maxTriangles: 250_000,
  maxNodes: 4096,
};

export interface PreparedGameModel {
  readonly bytes: Uint8Array;
  readonly digest: string;
  readonly preparationVersion: "1";
  readonly nodeIds: readonly string[];
  readonly clipIds: readonly string[];
  readonly extensions: readonly string[];
  readonly geometryBytes: number;
  readonly textureBytes: number;
  readonly triangles: number;
  readonly bounds: { readonly min: { readonly x: number; readonly y: number; readonly z: number }; readonly max: { readonly x: number; readonly y: number; readonly z: number } };
}

export interface GameModelDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type PrepareGameModelResult =
  | { readonly ok: true; readonly model: PreparedGameModel }
  | { readonly ok: false; readonly diagnostics: readonly GameModelDiagnostic[] };

const SUPPORTED_EXTENSIONS = new Set([
  "KHR_materials_unlit", "KHR_materials_emissive_strength", "KHR_texture_transform", "KHR_mesh_quantization",
]);
const COMPONENT_BYTES = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]]);
const COMPONENTS = new Map([["SCALAR", 1], ["VEC2", 2], ["VEC3", 3], ["VEC4", 4], ["MAT2", 4], ["MAT3", 9], ["MAT4", 16]]);

function imageDimensions(bytes: Uint8Array, mime: string): readonly [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png" && bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(12) === 0x49484452) {
    return [view.getUint32(16), view.getUint32(20)];
  }
  if (mime === "image/jpeg" && bytes.length >= 4 && view.getUint16(0) === 0xffd8) {
    let cursor = 2;
    while (cursor + 4 <= bytes.length) {
      if (bytes[cursor] !== 255) { throw new Error("Malformed JPEG marker"); }
      const marker = bytes[cursor + 1];
      const length = view.getUint16(cursor + 2);
      if (length < 2 || cursor + length + 2 > bytes.length) { throw new Error("Malformed JPEG segment"); }
      if (marker !== undefined && [192, 193, 194].includes(marker) && length >= 7) {
        return [view.getUint16(cursor + 7), view.getUint16(cursor + 5)];
      }
      cursor += length + 2;
    }
  }
  throw new Error(`Unsupported or malformed embedded image: ${mime}`);
}

export interface GameModelSceneGraph3D {
  readonly nodes: readonly { readonly children: readonly number[] }[];
  readonly scenes: readonly { readonly nodes: readonly number[] }[];
  readonly scene?: number;
}

/** Selects the same explicit/default scene as GLTFLoader and validates scene root references. */
export function selectedGameModelSceneRoots3D(document: GameModelSceneGraph3D): readonly number[] {
  const selected = document.scenes[document.scene ?? 0];
  if (!selected) { throw new Error("Prepared model requires an existing selected/default scene"); }
  const children = new Set(document.nodes.flatMap((node) => node.children));
  for (const scene of document.scenes) {
    const unique = new Set<number>();
    for (const root of scene.nodes) {
      if (!document.nodes[root] || children.has(root) || unique.has(root)) { throw new Error("Model scene contains a missing, parented or duplicate root node"); }
      unique.add(root);
    }
  }
  return selected.nodes;
}

/** Checks the closed GLB profile before any browser loader can issue a request. */
export async function prepareGameModel(
  source: Uint8Array,
  options: { readonly budgets?: Partial<GameModelBudgets>; readonly expectedDigest?: string; readonly signal?: AbortSignal } = {},
): Promise<PrepareGameModelResult> {
  options.signal?.throwIfAborted();
  const budget = { ...GAME_MODEL_BUDGETS, ...options.budgets };
  const diagnostics: GameModelDiagnostic[] = [];
  const fail = (code: string, path: string, message: string): void => { diagnostics.push({ code, path, message }); };
  if (source.length > budget.maxSourceBytes) {
    return { ok: false, diagnostics: [{ code: "model.sourceBudget", path: "", message: "GLB source exceeds byte budget" }] };
  }
  try {
    const bytes = new Uint8Array(source);
    const view = new DataView(bytes.buffer);
    if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) {
      throw new Error("Expected a complete glTF 2 GLB container");
    }
    let cursor = 12;
    let json: unknown;
    let binary = new Uint8Array();
    let sawBinary = false;
    while (cursor < bytes.length) {
      if (cursor + 8 > bytes.length) { throw new Error("Truncated GLB chunk"); }
      const length = view.getUint32(cursor, true);
      const kind = view.getUint32(cursor + 4, true);
      if (length % 4 !== 0 || cursor + 8 + length > bytes.length) { throw new Error("Malformed GLB chunk size"); }
      const chunk = bytes.subarray(cursor + 8, cursor + 8 + length);
      if (kind === 0x4e4f534a && cursor === 12) { json = JSON.parse(new TextDecoder().decode(chunk).trim()); }
      else if (kind === 0x004e4942 && json !== undefined && !sawBinary) { binary = chunk; sawBinary = true; }
      else { throw new Error("Unsupported or out-of-order GLB chunk"); }
      cursor += 8 + length;
    }
    const parsed = gltf.parse(json);
    for (const extension of parsed.extensionsUsed) {
      if (/draco|meshopt|basisu/i.test(extension)) { fail("model.decoder", "extensionsUsed", `Compression extension requires an unsupported decoder: ${extension}`); }
      else if (!SUPPORTED_EXTENSIONS.has(extension)) { fail("model.extension", "extensionsUsed", `Extension is outside the prepared visual profile: ${extension}`); }
    }
    const declaredExtensions = new Set(parsed.extensionsUsed);
    for (const extension of parsed.extensionsRequired) {
      if (!SUPPORTED_EXTENSIONS.has(extension)) { fail("model.extension", "extensionsRequired", `Unsupported required extension: ${extension}`); }
      if (!declaredExtensions.has(extension)) { fail("model.extension", "extensionsRequired", `Required extension is not declared in extensionsUsed: ${extension}`); }
    }
    const extensionOwners: unknown[] = [parsed];
    while (extensionOwners.length) {
      const owner = extensionOwners.pop();
      if (owner === null || typeof owner !== "object") { continue; }
      if (Array.isArray(owner)) { for (const entry of owner) { extensionOwners.push(entry); } continue; }
      for (const [key, value] of Object.entries(owner)) {
        if (key === "extras") { continue; }
        if (key === "extensions" && value !== null && typeof value === "object" && !Array.isArray(value)) {
          for (const extension of Object.keys(value)) {
            if (!SUPPORTED_EXTENSIONS.has(extension) || !declaredExtensions.has(extension)) {
              fail("model.extension", "extensions", `Extension object is undeclared or outside the prepared visual profile: ${extension}`);
            }
          }
        }
        extensionOwners.push(value);
      }
    }
    if (parsed.buffers.length > 1) { fail("model.buffers", "buffers", "Prepared models require one embedded buffer"); }
    for (const [index, buffer] of parsed.buffers.entries()) {
      if (buffer.uri !== undefined) { fail("model.externalResource", `buffers.${index}.uri`, "Runtime buffers must be embedded"); }
      if (buffer.byteLength > binary.length || binary.length - buffer.byteLength > 3) { fail("model.bufferBounds", `buffers.${index}`, "Embedded buffer length does not match GLB bytes"); }
    }
    for (const [index, bufferView] of parsed.bufferViews.entries()) {
      const buffer = parsed.buffers[bufferView.buffer];
      if (!buffer || bufferView.buffer !== 0 || bufferView.byteOffset + bufferView.byteLength > buffer.byteLength) { fail("model.bufferViewBounds", `bufferViews.${index}`, "Buffer view is outside the embedded buffer"); }
    }
    let geometryBytes = 0;
    for (const [index, accessor] of parsed.accessors.entries()) {
      const width = COMPONENT_BYTES.get(accessor.componentType);
      const components = COMPONENTS.get(accessor.type);
      const bufferView = accessor.bufferView === undefined ? undefined : parsed.bufferViews[accessor.bufferView];
      if (accessor.sparse !== undefined) { fail("model.sparse", `accessors.${index}`, "Sparse accessors are outside the initial prepared profile"); }
      if (!width || !components || !bufferView) { fail("model.accessor", `accessors.${index}`, "Accessor has unsupported components or missing buffer view"); continue; }
      const elementBytes = width * components;
      const stride = bufferView.byteStride ?? elementBytes;
      const required = accessor.count === 0 ? 0 : (accessor.count - 1) * stride + elementBytes;
      if (stride < elementBytes || stride > 252 || accessor.byteOffset + required > bufferView.byteLength) { fail("model.accessorBounds", `accessors.${index}`, "Accessor exceeds its buffer view"); }
      geometryBytes += accessor.count * elementBytes;
    }
    const normalizedComponent = (accessor: typeof parsed.accessors[number], value: number): number => {
      if (!accessor.normalized) { return value; }
      if (accessor.componentType === 5120) { return Math.max(-1, value / 127); }
      if (accessor.componentType === 5121) { return value / 255; }
      if (accessor.componentType === 5122) { return Math.max(-1, value / 32767); }
      if (accessor.componentType === 5123) { return value / 65535; }
      return value;
    };
    const readValue = (accessor: typeof parsed.accessors[number], item: number, axis: number): number => {
      const bufferView = accessor.bufferView === undefined ? undefined : parsed.bufferViews[accessor.bufferView];
      const width = COMPONENT_BYTES.get(accessor.componentType); const componentCount = COMPONENTS.get(accessor.type);
      if (!bufferView || !width || !componentCount) { throw new Error("Missing geometry accessor view"); }
      const offset = bufferView.byteOffset + accessor.byteOffset + item * (bufferView.byteStride ?? width * componentCount) + axis * width;
      const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
      let value: number;
      if (accessor.componentType === 5120) { value = data.getInt8(offset); }
      else if (accessor.componentType === 5121) { value = data.getUint8(offset); }
      else if (accessor.componentType === 5122) { value = data.getInt16(offset, true); }
      else if (accessor.componentType === 5123) { value = data.getUint16(offset, true); }
      else if (accessor.componentType === 5125) { value = data.getUint32(offset, true); }
      else { value = data.getFloat32(offset, true); }
      value = normalizedComponent(accessor, value);
      if (!Number.isFinite(value)) { throw new Error("Model geometry contains non-finite values"); }
      return value;
    };
    let triangles = 0;
    const meshBounds = parsed.meshes.map(() => new Box3());
    for (const [meshIndex, mesh] of parsed.meshes.entries()) {
      for (const [index, primitive] of mesh.primitives.entries()) {
        const path = `meshes.${meshIndex}.primitives.${index}`;
        if (primitive.mode !== 4) { fail("model.primitive", path, "Prepared models require triangle primitives"); }
        const positionIndex = primitive.attributes.POSITION;
        const position = positionIndex === undefined ? undefined : parsed.accessors[positionIndex];
        const indices = primitive.indices === undefined ? undefined : parsed.accessors[primitive.indices];
        if (!position || position.type !== "VEC3") { fail("model.position", path, "Triangle primitive requires VEC3 POSITION data"); }
        if (position?.min?.length !== 3 || position.max?.length !== 3) { fail("model.bounds", path, "POSITION requires bounded minimum and maximum"); }
        else {
          const minimum = new Vector3().fromArray(position.min.map((value) => normalizedComponent(position, value)));
          const maximum = new Vector3().fromArray(position.max.map((value) => normalizedComponent(position, value)));
          if (minimum.x > maximum.x || minimum.y > maximum.y || minimum.z > maximum.z) { fail("model.bounds", path, "POSITION bounds are reversed"); }
          if (position.count <= budget.maxTriangles * 3 && geometryBytes <= budget.maxGeometryBytes && diagnostics.length === 0) {
            const actual = new Box3();
            for (let item = 0; item < position.count; item++) { actual.expandByPoint(new Vector3(readValue(position, item, 0), readValue(position, item, 1), readValue(position, item, 2))); }
            for (const axis of ["x", "y", "z"] as const) {
              const tolerance = 0.000001 * Math.max(1, Math.abs(actual.min[axis]), Math.abs(actual.max[axis]));
              if (Math.abs(actual.min[axis] - minimum[axis]) > tolerance || Math.abs(actual.max[axis] - maximum[axis]) > tolerance) { fail("model.bounds", path, "Advertised POSITION bounds do not match decoded geometry"); }
            }
            meshBounds[meshIndex]?.union(actual);
          } else { meshBounds[meshIndex]?.union(new Box3(minimum, maximum)); }
        }
        if (primitive.indices !== undefined && (!indices || indices.type !== "SCALAR" || ![5121, 5123, 5125].includes(indices.componentType))) { fail("model.indices", path, "Invalid triangle indices accessor"); }
        for (const accessorIndex of Object.values(primitive.attributes)) {
          const attribute = parsed.accessors[accessorIndex];
          if (!attribute || (position && attribute.count !== position.count)) { fail("model.attribute", path, "Attribute accessor is missing or its count differs from POSITION"); }
        }
        const count = indices?.count ?? position?.count ?? 0;
        if (count % 3 !== 0) { fail("model.triangleCount", path, "Triangle primitive count must be divisible by three"); }
        triangles += count / 3;
        if (indices && position && triangles <= budget.maxTriangles && diagnostics.length === 0) {
          for (let item = 0; item < indices.count; item++) {
            const indexValue = readValue(indices, item, 0);
            if (!Number.isInteger(indexValue) || indexValue >= position.count) { fail("model.indices", path, "Triangle index exceeds vertex count"); break; }
          }
        }
      }
    }
    let textureBytes = 0;
    for (const [index, image] of parsed.images.entries()) {
      if (image.uri !== undefined) { fail("model.externalResource", `images.${index}.uri`, "Runtime images must be embedded buffer views"); continue; }
      const bufferView = image.bufferView === undefined ? undefined : parsed.bufferViews[image.bufferView];
      if (!bufferView) { fail("model.image", `images.${index}`, "Embedded image buffer view is missing"); continue; }
      const [width, height] = imageDimensions(binary.subarray(bufferView.byteOffset, bufferView.byteOffset + bufferView.byteLength), image.mimeType ?? "");
      if (width < 1 || height < 1 || width > 8192 || height > 8192) { fail("model.textureDimensions", `images.${index}`, "Decoded texture dimensions exceed the prepared profile"); }
      textureBytes += Math.ceil(width * height * 4 * 4 / 3);
    }
    if (geometryBytes > budget.maxGeometryBytes) { fail("model.geometryBudget", "accessors", "Decoded geometry exceeds byte budget"); }
    if (textureBytes > budget.maxTextureBytes) { fail("model.textureBudget", "images", "Decoded textures exceed byte budget"); }
    if (triangles > budget.maxTriangles) { fail("model.triangleBudget", "meshes", "Model exceeds triangle budget"); }
    if (parsed.nodes.length > budget.maxNodes) { fail("model.nodeBudget", "nodes", "Model exceeds node budget"); }
    const parents = new Map<number, number>();
    const colors = new Uint8Array(parsed.nodes.length);
    const visit = (index: number): void => {
      if (colors[index] === 1) { throw new Error("Model node hierarchy contains a cycle"); }
      if (colors[index] === 2) { return; }
      const node = parsed.nodes[index];
      if (!node) { throw new Error("Model node reference is missing"); }
      colors[index] = 1;
      if (node.mesh !== undefined && !parsed.meshes[node.mesh]) { throw new Error("Model mesh reference is missing"); }
      if (node.skin !== undefined && !parsed.skins[node.skin]) { fail("model.skin", `nodes.${index}.skin`, "Node skin is missing"); }
      if (node.matrix && (node.translation || node.rotation || node.scale)) { throw new Error("Model node mixes matrix and TRS transforms"); }
      if (node.rotation && Math.abs(node.rotation.reduce((sum, value) => sum + value * value, 0) - 1) > 0.00001) { throw new Error("Model node quaternion is not normalized"); }
      if (node.matrix && (node.matrix[3] !== 0 || node.matrix[7] !== 0 || node.matrix[11] !== 0 || node.matrix[15] !== 1)) { throw new Error("Model node matrix must be affine"); }
      for (const child of node.children) {
        if (parents.has(child) && parents.get(child) !== index) { throw new Error("Model node has multiple parents"); }
        parents.set(child, index);
        visit(child);
      }
      colors[index] = 2;
    };
    parsed.nodes.forEach((_, index) => visit(index));
    for (const [index, skin] of parsed.skins.entries()) {
      if (skin.joints.some((joint) => !parsed.nodes[joint]) || (skin.inverseBindMatrices !== undefined && !parsed.accessors[skin.inverseBindMatrices])) { fail("model.skin", `skins.${index}`, "Skin joint or inverse bind accessor is missing"); }
    }
    const roots = selectedGameModelSceneRoots3D(parsed);
    const visibleNodes = new Set<number>();
    const worldBounds = new Box3();
    const expandBounds = (index: number, parent: Matrix4): void => {
      const node = parsed.nodes[index];
      if (!node) { return; }
      visibleNodes.add(index);
      const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
        new Vector3().fromArray(node.translation ?? [0, 0, 0]), new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]), new Vector3().fromArray(node.scale ?? [1, 1, 1]));
      const world = parent.clone().multiply(local);
      const bounds = node.mesh === undefined ? undefined : meshBounds[node.mesh];
      if (bounds && !bounds.isEmpty()) { worldBounds.union(bounds.clone().applyMatrix4(world)); }
      node.children.forEach((child) => expandBounds(child, world));
    };
    roots.forEach((index) => expandBounds(index, new Matrix4()));
    if (worldBounds.isEmpty()) { worldBounds.set(new Vector3(0, 0, 0), new Vector3(0, 0, 0)); }
    for (const [animationIndex, animation] of parsed.animations.entries()) {
      for (const sampler of animation.samplers) {
        if (!parsed.accessors[sampler.input] || !parsed.accessors[sampler.output]) { fail("model.animation", `animations.${animationIndex}`, "Animation accessor is missing"); }
      }
      for (const channel of animation.channels) {
        if (!animation.samplers[channel.sampler] || channel.target.node === undefined || !parsed.nodes[channel.target.node]) { fail("model.animation", `animations.${animationIndex}`, "Animation target or sampler is missing"); }
      }
    }
    options.signal?.throwIfAborted();
    const digestBytes = await crypto.subtle.digest("SHA-256", bytes);
    const digest = Array.from(new Uint8Array(digestBytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
    options.signal?.throwIfAborted();
    if (options.expectedDigest !== undefined && digest !== options.expectedDigest) { fail("model.digest", "", "Prepared model digest does not match the binding"); }
    if (diagnostics.length) { return { ok: false, diagnostics }; }
    return { ok: true, model: { bytes, digest, preparationVersion: "1", nodeIds: parsed.nodes.flatMap((_, index) => visibleNodes.has(index) ? [`node:${index}`] : []), clipIds: parsed.animations.map((_, index) => `clip:${index}`), extensions: parsed.extensionsUsed, geometryBytes, textureBytes, triangles, bounds: { min: { x: worldBounds.min.x, y: worldBounds.min.y, z: worldBounds.min.z }, max: { x: worldBounds.max.x, y: worldBounds.max.y, z: worldBounds.max.z } } } };
  } catch (error) {
    if (options.signal?.aborted) { options.signal.throwIfAborted(); }
    return { ok: false, diagnostics: [...diagnostics, { code: "model.malformed", path: "", message: error instanceof Error ? error.message : "Malformed model" }] };
  }
}


export type PrepareGameModelBinding3DResult =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly binding: Extract<GameAssetBinding3D, { readonly mediaKind: "model" }> }
  | { readonly ok: false; readonly diagnostics: readonly GameModelDiagnostic[] };

/** Derives installation metadata from verified bytes rather than caller-supplied claims. */
export async function prepareGameModelBinding3D(bytes: Uint8Array, options: {
  readonly assetId: string; readonly expectedDigest?: string; readonly signal?: AbortSignal; readonly provenance?: string;
}): Promise<PrepareGameModelBinding3DResult> {
  const result = await prepareGameModel(bytes, options);
  if (!result.ok) { return result; }
  const model = result.model;
  const binding: Extract<GameAssetBinding3D, { readonly mediaKind: "model" }> = {
    mediaKind: "model", assetId: options.assetId, digest: model.digest, required: true, format: "glb", preparationVersion: model.preparationVersion,
    bounds: model.bounds, nodeIds: [...model.nodeIds], clipIds: [...model.clipIds], geometryBytes: model.geometryBytes,
    textureBytes: model.textureBytes, triangles: model.triangles, supportedExtensions: [...model.extensions]
  };
  if (options.provenance !== undefined) { binding.provenance = options.provenance; }
  return { ok: true, bytes: model.bytes, binding };
}
