import ManifoldModule from "manifold-3d";

import {
  buildGlb,
  COMP_FLOAT,
  COMP_UNSIGNED_INT,
  glbGetIndexAccessor,
  glbGetVec3Accessor,
  glbReadIndices,
  glbReadVec3,
  parseGlb
} from "./glb.js";
import type {
  GltfJson,
  ManifoldApi,
  ManifoldInstance,
  ManifoldMeshLike
} from "./types.js";
import { pad4 } from "./utils.js";

let manifoldPromise: Promise<ManifoldApi> | null = null;

async function getManifoldApi(): Promise<ManifoldApi> {
  if (!manifoldPromise) {
    manifoldPromise = (ManifoldModule() as Promise<ManifoldApi>).then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return manifoldPromise;
}

function extractTriangleMeshForBoolean(bytes: Uint8Array): ManifoldMeshLike {
  const glb = parseGlb(bytes);
  if (!glb) {
    throw new Error("Unsupported model boolean: expected valid GLB bytes.");
  }

  const posChunks: Float32Array[] = [];
  const idxChunks: Uint32Array[] = [];
  let vertexOffset = 0;

  for (const mesh of glb.json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const mode = primitive.mode ?? 4;
      if (mode !== 4) {
        throw new Error(
          "Unsupported model boolean: only triangle primitives are supported."
        );
      }

      const positionIndex = primitive.attributes["POSITION"];
      if (positionIndex === undefined) {
        throw new Error(
          "Unsupported model boolean: POSITION accessor is required."
        );
      }

      const positionAccessor = glbGetVec3Accessor(glb.json, positionIndex);
      if (!positionAccessor) {
        throw new Error(
          "Unsupported model boolean: only float VEC3 positions are supported."
        );
      }

      const primitivePositions = glbReadVec3(
        glb.bin,
        positionAccessor.acc,
        positionAccessor.bv
      );
      posChunks.push(primitivePositions);

      let primitiveIndices: Uint32Array;
      if (primitive.indices !== undefined) {
        const indexAccessor = glbGetIndexAccessor(glb.json, primitive.indices);
        if (!indexAccessor) {
          throw new Error(
            "Unsupported model boolean: indexed triangle accessors are required."
          );
        }
        const read = glbReadIndices(glb.bin, indexAccessor.acc, indexAccessor.bv);
        if (!read) {
          throw new Error(
            "Unsupported model boolean: only unsigned integer indices are supported."
          );
        }
        primitiveIndices = read;
      } else {
        primitiveIndices = new Uint32Array(positionAccessor.acc.count);
        for (let i = 0; i < positionAccessor.acc.count; i++) {
          primitiveIndices[i] = i;
        }
      }

      const offsetted = new Uint32Array(primitiveIndices.length);
      for (let i = 0; i < primitiveIndices.length; i++) {
        offsetted[i] = primitiveIndices[i] + vertexOffset;
      }
      idxChunks.push(offsetted);
      vertexOffset += positionAccessor.acc.count;
    }
  }

  const totalPos = posChunks.reduce((s, c) => s + c.length, 0);
  const totalIdx = idxChunks.reduce((s, c) => s + c.length, 0);
  const vertProperties = new Float32Array(totalPos);
  const triVerts = new Uint32Array(totalIdx);
  let off = 0;
  for (const chunk of posChunks) { vertProperties.set(chunk, off); off += chunk.length; }
  off = 0;
  for (const chunk of idxChunks) { triVerts.set(chunk, off); off += chunk.length; }

  return { numProp: 3, triVerts, vertProperties };
}

function buildGlbFromTriangleMesh(mesh: ManifoldMeshLike): Uint8Array {
  const vertexCount = Math.floor(mesh.vertProperties.length / mesh.numProp);
  if (vertexCount === 0 || mesh.triVerts.length === 0) {
    throw new Error("Boolean operation produced an empty mesh.");
  }

  const positions = new Float32Array(vertexCount * 3);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < vertexCount; i++) {
    const base = i * mesh.numProp;
    for (let axis = 0; axis < 3; axis++) {
      const value = mesh.vertProperties[base + axis];
      positions[i * 3 + axis] = value;
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }

  const positionBytes = new Uint8Array(positions.buffer);
  const indexBytes = new Uint8Array(mesh.triVerts.buffer);
  const totalBinaryLength =
    positionBytes.byteLength + indexBytes.byteLength + pad4(indexBytes.byteLength);

  const json: GltfJson = {
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
    buffers: [{ byteLength: totalBinaryLength }],
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
        count: vertexCount,
        type: "VEC3",
        min,
        max
      },
      {
        bufferView: 1,
        componentType: COMP_UNSIGNED_INT,
        count: mesh.triVerts.length,
        type: "SCALAR"
      }
    ]
  };

  const binary = new Uint8Array(totalBinaryLength);
  binary.set(positionBytes, 0);
  binary.set(indexBytes, positionBytes.byteLength);
  return buildGlb(json, binary);
}

export async function booleanGlb(
  bytesA: Uint8Array,
  bytesB: Uint8Array,
  operation: string
): Promise<Uint8Array> {
  const wasm = await getManifoldApi();
  const manifoldA = wasm.Manifold.ofMesh(extractTriangleMeshForBoolean(bytesA));
  const manifoldB = wasm.Manifold.ofMesh(extractTriangleMeshForBoolean(bytesB));

  let result: ManifoldInstance | null = null;
  try {
    if (operation === "difference") {
      result = manifoldA.subtract(manifoldB);
    } else if (operation === "intersection") {
      result = manifoldA.intersect(manifoldB);
    } else {
      result = manifoldA.add(manifoldB);
    }

    const mesh = result.getMesh();
    return buildGlbFromTriangleMesh(mesh);
  } finally {
    manifoldA.delete();
    manifoldB.delete();
    result?.delete();
  }
}
