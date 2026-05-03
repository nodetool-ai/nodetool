import {
  buildGlb,
  COMP_FLOAT,
  COMP_UNSIGNED_INT,
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

export type NormalizeGlbOptions = {
  centerMode: "bounds" | "centroid" | "none";
  axisPreset: "keep" | "z_to_y" | "y_to_z";
  scaleToSize: boolean;
  targetSize: number;
  placeOnGround: boolean;
  groundAxis: "y" | "z";
};

type TriangleMeshData = {
  positions: number[];
  indices: number[];
};

export type RepairGlbOptions = {
  mergeDuplicateVertices: boolean;
  removeDegenerateFaces: boolean;
  positionTolerance: number;
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

function applyAxisPreset(
  data: Float32Array,
  axisPreset: NormalizeGlbOptions["axisPreset"]
): void {
  if (axisPreset === "keep") return;
  for (let i = 0; i < data.length; i += 3) {
    const x = data[i];
    const y = data[i + 1];
    const z = data[i + 2];
    if (axisPreset === "z_to_y") {
      data[i] = x;
      data[i + 1] = z;
      data[i + 2] = -y;
    } else {
      data[i] = x;
      data[i + 1] = -z;
      data[i + 2] = y;
    }
  }
}

function computeBoundsAndCentroid(glb: NonNullable<ReturnType<typeof parseGlb>>): {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  centroidX: number;
  centroidY: number;
  centroidZ: number;
  totalVerts: number;
} {
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

  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    centroidX: totalVerts > 0 ? sumX / totalVerts : 0,
    centroidY: totalVerts > 0 ? sumY / totalVerts : 0,
    centroidZ: totalVerts > 0 ? sumZ / totalVerts : 0,
    totalVerts
  };
}

function collectTriangleMeshData(
  glb: NonNullable<ReturnType<typeof parseGlb>>
): TriangleMeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const mesh of glb.json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const mode = primitive.mode ?? 4;
      if (mode !== 4) {
        continue;
      }

      const posIdx = primitive.attributes["POSITION"];
      if (posIdx === undefined) {
        continue;
      }

      const position = glbGetVec3Accessor(glb.json, posIdx);
      if (!position) {
        continue;
      }

      const primitivePositions = glbReadVec3(glb.bin, position.acc, position.bv);
      positions.push(...primitivePositions);

      let primitiveIndices: Uint32Array;
      if (primitive.indices !== undefined) {
        const indexAccessor = glbGetIndexAccessor(glb.json, primitive.indices);
        const read =
          indexAccessor &&
          glbReadIndices(glb.bin, indexAccessor.acc, indexAccessor.bv);
        if (!read) {
          vertexOffset += position.acc.count;
          continue;
        }
        primitiveIndices = read;
      } else {
        primitiveIndices = buildSequentialIndices(position.acc.count);
      }

      for (const index of primitiveIndices) {
        indices.push(index + vertexOffset);
      }
      vertexOffset += position.acc.count;
    }
  }

  return { positions, indices };
}

function buildTriangleOnlyGlb(
  positions: number[],
  indices: number[]
): Uint8Array {
  const positionsArray = new Float32Array(positions);
  const indicesArray = new Uint32Array(indices);
  const positionBytes = new Uint8Array(positionsArray.buffer);
  const indexBytes = new Uint8Array(indicesArray.buffer);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], positions[i + axis]);
      max[axis] = Math.max(max[axis], positions[i + axis]);
    }
  }

  const json = {
    asset: { version: "2.0" },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1
          }
        ]
      }
    ],
    buffers: [{ byteLength: positionBytes.byteLength + indexBytes.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength },
      {
        buffer: 0,
        byteOffset: positionBytes.byteLength,
        byteLength: indexBytes.byteLength
      }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: COMP_FLOAT,
        count: positions.length / 3,
        type: "VEC3",
        min,
        max
      },
      {
        bufferView: 1,
        componentType: COMP_UNSIGNED_INT,
        count: indices.length,
        type: "SCALAR"
      }
    ]
  };

  const bin = new Uint8Array(positionBytes.byteLength + indexBytes.byteLength);
  bin.set(positionBytes, 0);
  bin.set(indexBytes, positionBytes.byteLength);
  return buildGlb(json, bin);
}

function compactTriangleMesh(mesh: TriangleMeshData): TriangleMeshData {
  const remap = new Map<number, number>();
  const positions: number[] = [];
  const indices: number[] = [];

  for (const sourceIndex of mesh.indices) {
    if (!remap.has(sourceIndex)) {
      const targetIndex = remap.size;
      remap.set(sourceIndex, targetIndex);
      positions.push(
        mesh.positions[sourceIndex * 3],
        mesh.positions[sourceIndex * 3 + 1],
        mesh.positions[sourceIndex * 3 + 2]
      );
    }
    indices.push(remap.get(sourceIndex)!);
  }

  return { positions, indices };
}

function quantizedKey(
  x: number,
  y: number,
  z: number,
  tolerance: number
): string {
  if (tolerance <= 0) {
    return `${x}:${y}:${z}`;
  }

  return [
    Math.round(x / tolerance),
    Math.round(y / tolerance),
    Math.round(z / tolerance)
  ].join(":");
}

function mergeDuplicateVertices(
  mesh: TriangleMeshData,
  tolerance: number
): TriangleMeshData {
  const indexMap = new Map<string, number>();
  const remap = new Uint32Array(Math.floor(mesh.positions.length / 3));
  const positions: number[] = [];

  for (let i = 0; i < remap.length; i++) {
    const x = mesh.positions[i * 3];
    const y = mesh.positions[i * 3 + 1];
    const z = mesh.positions[i * 3 + 2];
    const key = quantizedKey(x, y, z, tolerance);
    const existing = indexMap.get(key);
    if (existing !== undefined) {
      remap[i] = existing;
      continue;
    }

    const next = Math.floor(positions.length / 3);
    indexMap.set(key, next);
    remap[i] = next;
    positions.push(x, y, z);
  }

  const indices = mesh.indices.map((index) => remap[index]);
  return compactTriangleMesh({ positions, indices });
}

function removeDegenerateFaces(
  mesh: TriangleMeshData,
  tolerance: number
): TriangleMeshData {
  const keptIndices: number[] = [];
  const areaThreshold = tolerance > 0 ? tolerance * tolerance : 0;

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i];
    const b = mesh.indices[i + 1];
    const c = mesh.indices[i + 2];
    if (a === b || b === c || a === c) {
      continue;
    }

    const ax = mesh.positions[a * 3];
    const ay = mesh.positions[a * 3 + 1];
    const az = mesh.positions[a * 3 + 2];
    const bx = mesh.positions[b * 3];
    const by = mesh.positions[b * 3 + 1];
    const bz = mesh.positions[b * 3 + 2];
    const cx = mesh.positions[c * 3];
    const cy = mesh.positions[c * 3 + 1];
    const cz = mesh.positions[c * 3 + 2];

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const areaSquared =
      crossX * crossX + crossY * crossY + crossZ * crossZ;
    if (areaSquared <= areaThreshold) {
      continue;
    }

    keptIndices.push(a, b, c);
  }

  return compactTriangleMesh({
    positions: mesh.positions,
    indices: keptIndices
  });
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

export function normalizeGlb(
  bytes: Uint8Array,
  options: NormalizeGlbOptions
): Uint8Array | null {
  const glb = parseGlb(bytes);
  if (!glb) return null;

  for (const mesh of glb.json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const posIdx = primitive.attributes["POSITION"];
      if (posIdx !== undefined) {
        const position = glbGetVec3Accessor(glb.json, posIdx);
        if (position) {
          const data = glbReadVec3(glb.bin, position.acc, position.bv);
          applyAxisPreset(data, options.axisPreset);
          glbWriteVec3(glb.bin, position.acc, position.bv, data);
          glbUpdateMinMax(position.acc, data);
        }
      }

      const normIdx = primitive.attributes["NORMAL"];
      if (normIdx !== undefined) {
        const normal = glbGetVec3Accessor(glb.json, normIdx);
        if (normal) {
          const data = glbReadVec3(glb.bin, normal.acc, normal.bv);
          applyAxisPreset(data, options.axisPreset);
          glbWriteVec3(glb.bin, normal.acc, normal.bv, data);
        }
      }
    }
  }

  let summary = computeBoundsAndCentroid(glb);
  if (summary.totalVerts === 0) {
    return buildGlb(glb.json, glb.bin);
  }

  let translateX = 0;
  let translateY = 0;
  let translateZ = 0;
  if (options.centerMode === "bounds") {
    translateX = -((summary.minX + summary.maxX) / 2);
    translateY = -((summary.minY + summary.maxY) / 2);
    translateZ = -((summary.minZ + summary.maxZ) / 2);
  } else if (options.centerMode === "centroid") {
    translateX = -summary.centroidX;
    translateY = -summary.centroidY;
    translateZ = -summary.centroidZ;
  }

  for (const mesh of glb.json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const posIdx = primitive.attributes["POSITION"];
      if (posIdx === undefined) continue;
      const position = glbGetVec3Accessor(glb.json, posIdx);
      if (!position) continue;

      const data = glbReadVec3(glb.bin, position.acc, position.bv);
      for (let i = 0; i < data.length; i += 3) {
        data[i] += translateX;
        data[i + 1] += translateY;
        data[i + 2] += translateZ;
      }
      glbWriteVec3(glb.bin, position.acc, position.bv, data);
      glbUpdateMinMax(position.acc, data);
    }
  }

  summary = computeBoundsAndCentroid(glb);
  const sizeX = summary.maxX - summary.minX;
  const sizeY = summary.maxY - summary.minY;
  const sizeZ = summary.maxZ - summary.minZ;
  const longest = Math.max(sizeX, sizeY, sizeZ);
  if (options.scaleToSize && options.targetSize > 0 && longest > 0) {
    const scale = options.targetSize / longest;
    for (const mesh of glb.json.meshes ?? []) {
      for (const primitive of mesh.primitives) {
        const posIdx = primitive.attributes["POSITION"];
        if (posIdx !== undefined) {
          const position = glbGetVec3Accessor(glb.json, posIdx);
          if (position) {
            const data = glbReadVec3(glb.bin, position.acc, position.bv);
            for (let i = 0; i < data.length; i++) {
              data[i] *= scale;
            }
            glbWriteVec3(glb.bin, position.acc, position.bv, data);
            glbUpdateMinMax(position.acc, data);
          }
        }
      }
    }
  }

  summary = computeBoundsAndCentroid(glb);
  if (options.placeOnGround) {
    const groundOffset =
      options.groundAxis === "y" ? -summary.minY : -summary.minZ;
    for (const mesh of glb.json.meshes ?? []) {
      for (const primitive of mesh.primitives) {
        const posIdx = primitive.attributes["POSITION"];
        if (posIdx === undefined) continue;
        const position = glbGetVec3Accessor(glb.json, posIdx);
        if (!position) continue;

        const data = glbReadVec3(glb.bin, position.acc, position.bv);
        for (let i = 0; i < data.length; i += 3) {
          if (options.groundAxis === "y") {
            data[i + 1] += groundOffset;
          } else {
            data[i + 2] += groundOffset;
          }
        }
        glbWriteVec3(glb.bin, position.acc, position.bv, data);
        glbUpdateMinMax(position.acc, data);
      }
    }
  }

  return buildGlb(glb.json, glb.bin);
}

export function extractLargestComponentGlb(bytes: Uint8Array): Uint8Array | null {
  const glb = parseGlb(bytes);
  if (!glb) return null;

  const mesh = collectTriangleMeshData(glb);
  if (mesh.positions.length === 0 || mesh.indices.length === 0) {
    return buildGlb(glb.json, glb.bin);
  }

  const vertexCount = Math.floor(mesh.positions.length / 3);
  const parent = new Uint32Array(vertexCount);
  const rank = new Uint8Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    parent[i] = i;
  }

  const find = (value: number): number => {
    let current = value;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };

  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    if (rank[rootA] < rank[rootB]) {
      parent[rootA] = rootB;
    } else if (rank[rootA] > rank[rootB]) {
      parent[rootB] = rootA;
    } else {
      parent[rootB] = rootA;
      rank[rootA] += 1;
    }
  };

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i];
    const b = mesh.indices[i + 1];
    const c = mesh.indices[i + 2];
    union(a, b);
    union(b, c);
    union(a, c);
  }

  const faceCounts = new Map<number, number>();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const root = find(mesh.indices[i]);
    faceCounts.set(root, (faceCounts.get(root) ?? 0) + 1);
  }

  let largestRoot = -1;
  let largestFaceCount = -1;
  for (const [root, faceCount] of faceCounts.entries()) {
    if (faceCount > largestFaceCount) {
      largestRoot = root;
      largestFaceCount = faceCount;
    }
  }

  if (largestRoot < 0) {
    return buildGlb(glb.json, glb.bin);
  }

  const remap = new Map<number, number>();
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i];
    const b = mesh.indices[i + 1];
    const c = mesh.indices[i + 2];
    if (find(a) !== largestRoot) continue;

    for (const sourceIndex of [a, b, c]) {
      if (!remap.has(sourceIndex)) {
        const targetIndex = remap.size;
        remap.set(sourceIndex, targetIndex);
        positions.push(
          mesh.positions[sourceIndex * 3],
          mesh.positions[sourceIndex * 3 + 1],
          mesh.positions[sourceIndex * 3 + 2]
        );
      }
      indices.push(remap.get(sourceIndex)!);
    }
  }

  if (positions.length === 0 || indices.length === 0) {
    return buildGlb(glb.json, glb.bin);
  }

  return buildTriangleOnlyGlb(positions, indices);
}

export function repairGlb(
  bytes: Uint8Array,
  options: RepairGlbOptions
): Uint8Array | null {
  const glb = parseGlb(bytes);
  if (!glb) return null;

  const collected = collectTriangleMeshData(glb);
  if (collected.positions.length === 0 || collected.indices.length === 0) {
    return buildGlb(glb.json, glb.bin);
  }

  let repaired = collected;
  if (options.mergeDuplicateVertices) {
    repaired = mergeDuplicateVertices(
      repaired,
      Math.max(0, Number(options.positionTolerance) || 0)
    );
  }

  if (options.removeDegenerateFaces) {
    repaired = removeDegenerateFaces(
      repaired,
      Math.max(0, Number(options.positionTolerance) || 0)
    );
  }

  if (repaired.positions.length === 0 || repaired.indices.length === 0) {
    return buildGlb(glb.json, glb.bin);
  }

  return buildTriangleOnlyGlb(repaired.positions, repaired.indices);
}
