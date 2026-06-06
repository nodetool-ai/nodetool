import type {
  GltfAccessor,
  GltfBufferView,
  GltfJson,
  Model3DMetadata,
  Model3DRefLike
} from "./types.js";
import { modelFormat } from "./utils.js";

export const GLB_MAGIC = 0x46546c67;
export const CHUNK_JSON = 0x4e4f534a;
export const CHUNK_BIN = 0x004e4942;
export const COMP_UNSIGNED_SHORT = 5123;
export const COMP_UNSIGNED_INT = 5125;
export const COMP_FLOAT = 5126;

export function parseGlb(
  data: Uint8Array
): { json: GltfJson; bin: Uint8Array } | null {
  if (data.length < 12) return null;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (dv.getUint32(0, true) !== GLB_MAGIC) return null;
  let off = 12;
  let json: GltfJson = {};
  let bin = new Uint8Array(0);
  while (off + 8 <= data.length) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    off += 8;
    if (type === CHUNK_JSON) {
      json = JSON.parse(
        new TextDecoder().decode(data.slice(off, off + len))
      ) as GltfJson;
    } else if (type === CHUNK_BIN) {
      bin = data.slice(off, off + len);
    }
    off += len;
  }
  return { json, bin };
}

export function buildGlb(json: GltfJson, bin: Uint8Array): Uint8Array {
  const jsonStr = JSON.stringify(json);
  const encodedJsonBytes = new TextEncoder().encode(jsonStr);
  const jsonPad = (4 - (encodedJsonBytes.length % 4)) % 4;
  const jsonBytes = new Uint8Array(encodedJsonBytes.length + jsonPad);
  jsonBytes.set(encodedJsonBytes);
  jsonBytes.fill(0x20, encodedJsonBytes.length);
  const binPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length + binPad;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, GLB_MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  const binOff = 20 + jsonBytes.length;
  dv.setUint32(binOff, bin.length + binPad, true);
  dv.setUint32(binOff + 4, CHUNK_BIN, true);
  out.set(bin, binOff + 8);
  return out;
}

export function glbReadVec3(
  bin: Uint8Array,
  acc: GltfAccessor,
  bv: GltfBufferView
): Float32Array {
  const baseOff = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = bv.byteStride ?? 12;
  const result = new Float32Array(acc.count * 3);
  const dv = new DataView(bin.buffer, bin.byteOffset);
  for (let i = 0; i < acc.count; i++) {
    const o = baseOff + i * stride;
    result[i * 3] = dv.getFloat32(o, true);
    result[i * 3 + 1] = dv.getFloat32(o + 4, true);
    result[i * 3 + 2] = dv.getFloat32(o + 8, true);
  }
  return result;
}

export function glbWriteVec3(
  bin: Uint8Array,
  acc: GltfAccessor,
  bv: GltfBufferView,
  data: Float32Array
): void {
  const baseOff = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = bv.byteStride ?? 12;
  const dv = new DataView(bin.buffer, bin.byteOffset);
  for (let i = 0; i < acc.count; i++) {
    const o = baseOff + i * stride;
    dv.setFloat32(o, data[i * 3], true);
    dv.setFloat32(o + 4, data[i * 3 + 1], true);
    dv.setFloat32(o + 8, data[i * 3 + 2], true);
  }
}

export function glbReadIndices(
  bin: Uint8Array,
  acc: GltfAccessor,
  bv: GltfBufferView
): Uint32Array | null {
  const baseOff = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const dv = new DataView(bin.buffer, bin.byteOffset);
  const result = new Uint32Array(acc.count);
  if (acc.componentType === COMP_UNSIGNED_SHORT) {
    for (let i = 0; i < acc.count; i++) {
      result[i] = dv.getUint16(baseOff + i * 2, true);
    }
  } else if (acc.componentType === COMP_UNSIGNED_INT) {
    for (let i = 0; i < acc.count; i++) {
      result[i] = dv.getUint32(baseOff + i * 4, true);
    }
  } else {
    return null;
  }
  return result;
}

export function glbWriteIndices(
  bin: Uint8Array,
  acc: GltfAccessor,
  bv: GltfBufferView,
  data: Uint32Array
): void {
  const baseOff = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const dv = new DataView(bin.buffer, bin.byteOffset);
  if (acc.componentType === COMP_UNSIGNED_SHORT) {
    for (let i = 0; i < data.length; i++) {
      dv.setUint16(baseOff + i * 2, data[i], true);
    }
  } else if (acc.componentType === COMP_UNSIGNED_INT) {
    for (let i = 0; i < data.length; i++) {
      dv.setUint32(baseOff + i * 4, data[i], true);
    }
  }
}

export function glbUpdateMinMax(acc: GltfAccessor, data: Float32Array): void {
  if (acc.type !== "VEC3") return;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < data.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      if (data[i + j] < min[j]) min[j] = data[i + j];
      if (data[i + j] > max[j]) max[j] = data[i + j];
    }
  }
  acc.min = min;
  acc.max = max;
}

export function glbGetVec3Accessor(
  json: GltfJson,
  accIdx: number
): { acc: GltfAccessor; bv: GltfBufferView } | null {
  const acc = json.accessors?.[accIdx];
  if (!acc || acc.componentType !== COMP_FLOAT || acc.type !== "VEC3") {
    return null;
  }
  const bv = json.bufferViews?.[acc.bufferView];
  if (!bv) return null;
  return { acc, bv };
}

export function glbGetIndexAccessor(
  json: GltfJson,
  accIdx: number
): { acc: GltfAccessor; bv: GltfBufferView } | null {
  const acc = json.accessors?.[accIdx];
  if (!acc) return null;
  const bv = json.bufferViews?.[acc.bufferView];
  if (!bv) return null;
  return { acc, bv };
}

export function analyzeGlbMetadata(
  model: Model3DRefLike,
  bytes: Uint8Array
): Model3DMetadata {
  const glb = parseGlb(bytes);
  if (!glb) {
    throw new Error("Expected valid GLB bytes.");
  }

  let vertexCount = 0;
  let faceCount = 0;
  let primitiveCount = 0;
  const meshCount = glb.json.meshes?.length ?? 0;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let hasBounds = false;

  for (const mesh of glb.json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      primitiveCount += 1;

      const posIndex = primitive.attributes["POSITION"];
      if (posIndex !== undefined) {
        const accessorRef = glbGetVec3Accessor(glb.json, posIndex);
        if (accessorRef) {
          vertexCount += accessorRef.acc.count;

          const accMin = accessorRef.acc.min;
          const accMax = accessorRef.acc.max;
          if (accMin && accMax && accMin.length >= 3 && accMax.length >= 3) {
            for (let i = 0; i < 3; i++) {
              if (accMin[i] < min[i]) min[i] = accMin[i];
              if (accMax[i] > max[i]) max[i] = accMax[i];
            }
            hasBounds = true;
          } else {
            const positions = glbReadVec3(
              glb.bin,
              accessorRef.acc,
              accessorRef.bv
            );
            for (let i = 0; i < positions.length; i += 3) {
              for (let j = 0; j < 3; j++) {
                if (positions[i + j] < min[j]) min[j] = positions[i + j];
                if (positions[i + j] > max[j]) max[j] = positions[i + j];
              }
            }
            hasBounds = positions.length > 0 || hasBounds;
          }
        }
      }

      const mode = primitive.mode ?? 4;
      if (mode !== 4) continue;

      if (primitive.indices !== undefined) {
        const indexRef = glbGetIndexAccessor(glb.json, primitive.indices);
        if (indexRef) {
          faceCount += Math.floor(indexRef.acc.count / 3);
          continue;
        }
      }

      const positionAccessor =
        posIndex !== undefined ? glbGetVec3Accessor(glb.json, posIndex) : null;
      if (positionAccessor) {
        faceCount += Math.floor(positionAccessor.acc.count / 3);
      }
    }
  }

  return {
    uri: model.uri ?? "",
    format: "glb",
    size_bytes: bytes.length,
    vertices: vertexCount,
    faces: faceCount,
    vertex_count: vertexCount,
    face_count: faceCount,
    mesh_count: meshCount,
    primitive_count: primitiveCount,
    bounds_min: hasBounds ? min : [],
    bounds_max: hasBounds ? max : [],
    is_watertight: false,
    center_of_mass: null,
    volume: null,
    surface_area: null
  };
}

export function fallbackMetadata(
  model: Model3DRefLike,
  bytes: Uint8Array
): Model3DMetadata {
  const vertices = model.vertices ?? Math.floor(bytes.length / 32);
  const faces = model.faces ?? Math.floor(vertices / 3);
  return {
    uri: model.uri ?? "",
    format: modelFormat(model),
    size_bytes: bytes.length,
    vertices,
    faces,
    vertex_count: vertices,
    face_count: faces,
    mesh_count: 0,
    primitive_count: 0,
    bounds_min: [],
    bounds_max: [],
    is_watertight: false,
    center_of_mass: null,
    volume: null,
    surface_area: null
  };
}

export function requireGlbBytes(
  model: Model3DRefLike,
  bytes: Uint8Array,
  purpose: string
): Uint8Array {
  if (modelFormat(model) !== "glb") {
    throw new Error(`Unsupported model ${purpose}: only GLB is supported.`);
  }
  if (!parseGlb(bytes)) {
    throw new Error(`Unsupported model ${purpose}: expected valid GLB bytes.`);
  }
  return bytes;
}
