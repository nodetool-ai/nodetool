import {
  buildGlb,
  glbGetIndexAccessor,
  glbGetVec3Accessor,
  glbReadIndices,
  glbReadVec3,
  glbUpdateMinMax,
  glbWriteIndices,
  glbWriteVec3,
  parseGlb
} from "./glb.js";

export type TransformGlbOptions = {
  translateX: number;
  translateY: number;
  translateZ: number;
  rotateXDeg: number;
  rotateYDeg: number;
  rotateZDeg: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  uniformScale: number;
};

export type RecalculateNormalsOptions = {
  mode: string;
  fixWinding: boolean;
};

export type CenterGlbOptions = {
  useCentroid: boolean;
};

function buildSequentialIndices(vertexCount: number): Uint32Array {
  const indices = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    indices[i] = i;
  }
  return indices;
}

function transformNormal(
  data: Float32Array,
  r00: number,
  r01: number,
  r02: number,
  r10: number,
  r11: number,
  r12: number,
  r20: number,
  r21: number,
  r22: number
): void {
  for (let i = 0; i < data.length; i += 3) {
    const x = data[i];
    const y = data[i + 1];
    const z = data[i + 2];
    const nx = r00 * x + r01 * y + r02 * z;
    const ny = r10 * x + r11 * y + r12 * z;
    const nz = r20 * x + r21 * y + r22 * z;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    data[i] = nx / len;
    data[i + 1] = ny / len;
    data[i + 2] = nz / len;
  }
}

export function transformGlb(
  bytes: Uint8Array,
  options: TransformGlbOptions
): Uint8Array | null {
  const glb = parseGlb(bytes);
  if (!glb) return null;

  const tx = options.translateX;
  const ty = options.translateY;
  const tz = options.translateZ;
  const rx = (options.rotateXDeg * Math.PI) / 180;
  const ry = (options.rotateYDeg * Math.PI) / 180;
  const rz = (options.rotateZDeg * Math.PI) / 180;
  const scX = options.scaleX * options.uniformScale;
  const scY = options.scaleY * options.uniformScale;
  const scZ = options.scaleZ * options.uniformScale;

  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const r00 = cy * cz;
  const r01 = sx * sy * cz - cx * sz;
  const r02 = cx * sy * cz + sx * sz;
  const r10 = cy * sz;
  const r11 = sx * sy * sz + cx * cz;
  const r12 = cx * sy * sz - sx * cz;
  const r20 = -sy;
  const r21 = sx * cy;
  const r22 = cx * cy;

  for (const mesh of glb.json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const posIdx = primitive.attributes["POSITION"];
      if (posIdx !== undefined) {
        const position = glbGetVec3Accessor(glb.json, posIdx);
        if (position) {
          const data = glbReadVec3(glb.bin, position.acc, position.bv);
          for (let i = 0; i < data.length; i += 3) {
            const x = data[i] * scX;
            const y = data[i + 1] * scY;
            const z = data[i + 2] * scZ;
            data[i] = r00 * x + r01 * y + r02 * z + tx;
            data[i + 1] = r10 * x + r11 * y + r12 * z + ty;
            data[i + 2] = r20 * x + r21 * y + r22 * z + tz;
          }
          glbWriteVec3(glb.bin, position.acc, position.bv, data);
          glbUpdateMinMax(position.acc, data);
        }
      }

      const normIdx = primitive.attributes["NORMAL"];
      if (normIdx !== undefined) {
        const normal = glbGetVec3Accessor(glb.json, normIdx);
        if (normal) {
          const data = glbReadVec3(glb.bin, normal.acc, normal.bv);
          transformNormal(data, r00, r01, r02, r10, r11, r12, r20, r21, r22);
          glbWriteVec3(glb.bin, normal.acc, normal.bv, data);
        }
      }
    }
  }

  return buildGlb(glb.json, glb.bin);
}

export function recalculateNormalsGlb(
  bytes: Uint8Array,
  options: RecalculateNormalsOptions
): Uint8Array | null {
  const glb = parseGlb(bytes);
  if (!glb) return null;

  const mode = options.mode.toLowerCase();

  for (const mesh of glb.json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const posIdx = primitive.attributes["POSITION"];
      const normIdx = primitive.attributes["NORMAL"];
      if (posIdx === undefined || normIdx === undefined) continue;

      const position = glbGetVec3Accessor(glb.json, posIdx);
      const normal = glbGetVec3Accessor(glb.json, normIdx);
      if (!position || !normal || position.acc.count !== normal.acc.count) {
        continue;
      }

      const pos = glbReadVec3(glb.bin, position.acc, position.bv);
      const normals = new Float32Array(pos.length);
      const vertexCount = position.acc.count;

      let indices: Uint32Array;
      if (primitive.indices !== undefined) {
        const indexAccessor = glbGetIndexAccessor(glb.json, primitive.indices);
        if (indexAccessor) {
          indices =
            glbReadIndices(glb.bin, indexAccessor.acc, indexAccessor.bv) ??
            new Uint32Array(0);
        } else {
          indices = new Uint32Array(0);
        }
      } else {
        indices = buildSequentialIndices(vertexCount);
      }

      const triCount = Math.floor(indices.length / 3);
      for (let t = 0; t < triCount; t++) {
        const i0 = indices[t * 3];
        const i1 = indices[t * 3 + 1];
        const i2 = indices[t * 3 + 2];
        const ax = pos[i1 * 3] - pos[i0 * 3];
        const ay = pos[i1 * 3 + 1] - pos[i0 * 3 + 1];
        const az = pos[i1 * 3 + 2] - pos[i0 * 3 + 2];
        const bx = pos[i2 * 3] - pos[i0 * 3];
        const by = pos[i2 * 3 + 1] - pos[i0 * 3 + 1];
        const bz = pos[i2 * 3 + 2] - pos[i0 * 3 + 2];
        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;

        if (mode === "flat") {
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          for (const idx of [i0, i1, i2]) {
            normals[idx * 3] = nx / len;
            normals[idx * 3 + 1] = ny / len;
            normals[idx * 3 + 2] = nz / len;
          }
        } else {
          for (const idx of [i0, i1, i2]) {
            normals[idx * 3] += nx;
            normals[idx * 3 + 1] += ny;
            normals[idx * 3 + 2] += nz;
          }
        }
      }

      if (mode !== "flat") {
        for (let i = 0; i < normals.length; i += 3) {
          const len =
            Math.sqrt(
              normals[i] * normals[i] +
                normals[i + 1] * normals[i + 1] +
                normals[i + 2] * normals[i + 2]
            ) || 1;
          normals[i] /= len;
          normals[i + 1] /= len;
          normals[i + 2] /= len;
        }
      }

      glbWriteVec3(glb.bin, normal.acc, normal.bv, normals);

      if (options.fixWinding && primitive.indices !== undefined) {
        const indexAccessor = glbGetIndexAccessor(glb.json, primitive.indices);
        if (indexAccessor) {
          const idx = glbReadIndices(glb.bin, indexAccessor.acc, indexAccessor.bv);
          if (idx) {
            let fixed = false;
            for (let t = 0; t < triCount; t++) {
              const i0 = idx[t * 3];
              const i1 = idx[t * 3 + 1];
              const i2 = idx[t * 3 + 2];
              const ax = pos[i1 * 3] - pos[i0 * 3];
              const ay = pos[i1 * 3 + 1] - pos[i0 * 3 + 1];
              const az = pos[i1 * 3 + 2] - pos[i0 * 3 + 2];
              const bx = pos[i2 * 3] - pos[i0 * 3];
              const by = pos[i2 * 3 + 1] - pos[i0 * 3 + 1];
              const bz = pos[i2 * 3 + 2] - pos[i0 * 3 + 2];
              const fnx = ay * bz - az * by;
              const fny = az * bx - ax * bz;
              const fnz = ax * by - ay * bx;
              const vn0 =
                normals[i0 * 3] * fnx +
                normals[i0 * 3 + 1] * fny +
                normals[i0 * 3 + 2] * fnz;
              if (vn0 < 0) {
                idx[t * 3 + 1] = i2;
                idx[t * 3 + 2] = i1;
                fixed = true;
              }
            }
            if (fixed) {
              glbWriteIndices(glb.bin, indexAccessor.acc, indexAccessor.bv, idx);
            }
          }
        }
      }
    }
  }

  return buildGlb(glb.json, glb.bin);
}

export function centerGlb(
  bytes: Uint8Array,
  options: CenterGlbOptions
): Uint8Array | null {
  const glb = parseGlb(bytes);
  if (!glb) return null;

  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let totalVerts = 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const mesh of glb.json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const posIdx = primitive.attributes["POSITION"];
      if (posIdx === undefined) continue;
      const position = glbGetVec3Accessor(glb.json, posIdx);
      if (!position) continue;

      const data = glbReadVec3(glb.bin, position.acc, position.bv);
      for (let i = 0; i < data.length; i += 3) {
        sumX += data[i];
        sumY += data[i + 1];
        sumZ += data[i + 2];
        minX = Math.min(minX, data[i]);
        minY = Math.min(minY, data[i + 1]);
        minZ = Math.min(minZ, data[i + 2]);
        maxX = Math.max(maxX, data[i]);
        maxY = Math.max(maxY, data[i + 1]);
        maxZ = Math.max(maxZ, data[i + 2]);
        totalVerts++;
      }
    }
  }

  if (totalVerts === 0) {
    return buildGlb(glb.json, glb.bin);
  }

  let cx: number;
  let cy: number;
  let cz: number;
  if (options.useCentroid) {
    cx = sumX / totalVerts;
    cy = sumY / totalVerts;
    cz = sumZ / totalVerts;
  } else {
    cx = (minX + maxX) / 2;
    cy = (minY + maxY) / 2;
    cz = (minZ + maxZ) / 2;
  }

  for (const mesh of glb.json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const posIdx = primitive.attributes["POSITION"];
      if (posIdx === undefined) continue;
      const position = glbGetVec3Accessor(glb.json, posIdx);
      if (!position) continue;

      const data = glbReadVec3(glb.bin, position.acc, position.bv);
      for (let i = 0; i < data.length; i += 3) {
        data[i] -= cx;
        data[i + 1] -= cy;
        data[i + 2] -= cz;
      }
      glbWriteVec3(glb.bin, position.acc, position.bv, data);
      glbUpdateMinMax(position.acc, data);
    }
  }

  return buildGlb(glb.json, glb.bin);
}

export function flipNormalsGlb(bytes: Uint8Array): Uint8Array | null {
  const glb = parseGlb(bytes);
  if (!glb) return null;

  for (const mesh of glb.json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const normIdx = primitive.attributes["NORMAL"];
      if (normIdx !== undefined) {
        const normal = glbGetVec3Accessor(glb.json, normIdx);
        if (normal) {
          const data = glbReadVec3(glb.bin, normal.acc, normal.bv);
          for (let i = 0; i < data.length; i++) {
            data[i] = -data[i];
          }
          glbWriteVec3(glb.bin, normal.acc, normal.bv, data);
        }
      }

      if (primitive.indices !== undefined) {
        const indexAccessor = glbGetIndexAccessor(glb.json, primitive.indices);
        if (indexAccessor) {
          const idx = glbReadIndices(glb.bin, indexAccessor.acc, indexAccessor.bv);
          if (idx) {
            const triCount = Math.floor(idx.length / 3);
            for (let t = 0; t < triCount; t++) {
              const tmp = idx[t * 3 + 1];
              idx[t * 3 + 1] = idx[t * 3 + 2];
              idx[t * 3 + 2] = tmp;
            }
            glbWriteIndices(glb.bin, indexAccessor.acc, indexAccessor.bv, idx);
          }
        }
      }
    }
  }

  return buildGlb(glb.json, glb.bin);
}
