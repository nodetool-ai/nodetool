import { describe, expect, it } from "vitest";
import {
  DecimateNode,
  FormatConverterNode,
  GetModel3DMetadataNode
} from "../src/nodes/model3d.js";

function pad4(length: number): number {
  return (4 - (length % 4)) % 4;
}

function createTriangleGlb(): Uint8Array {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 2, 0
  ]);
  const indices = new Uint16Array([0, 1, 2]);

  const positionsBytes = new Uint8Array(positions.buffer);
  const indicesBytes = new Uint8Array(indices.buffer);
  const indexPadding = pad4(indicesBytes.byteLength);

  const positionByteLength = positionsBytes.byteLength;
  const indexByteOffset = positionByteLength;
  const indexByteLength = indicesBytes.byteLength;
  const totalBinaryLength = positionByteLength + indexByteLength + indexPadding;

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
    buffers: [{ byteLength: totalBinaryLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionByteLength },
      { buffer: 0, byteOffset: indexByteOffset, byteLength: indexByteLength }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 2, 0]
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: 3,
        type: "SCALAR"
      }
    ]
  };

  const jsonBytesRaw = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadding = pad4(jsonBytesRaw.byteLength);
  const jsonBytes = new Uint8Array(jsonBytesRaw.byteLength + jsonPadding);
  jsonBytes.set(jsonBytesRaw);
  jsonBytes.fill(0x20, jsonBytesRaw.byteLength);

  const binaryBytes = new Uint8Array(totalBinaryLength);
  binaryBytes.set(positionsBytes, 0);
  binaryBytes.set(indicesBytes, indexByteOffset);

  const totalLength = 12 + 8 + jsonBytes.byteLength + 8 + binaryBytes.byteLength;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);

  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.set(jsonBytes, 20);

  const binaryChunkOffset = 20 + jsonBytes.byteLength;
  view.setUint32(binaryChunkOffset, binaryBytes.byteLength, true);
  view.setUint32(binaryChunkOffset + 4, 0x004e4942, true);
  glb.set(binaryBytes, binaryChunkOffset + 8);

  return glb;
}

function createGridGlb(gridSize = 8): Uint8Array {
  const vertexCountPerSide = gridSize + 1;
  const positions: number[] = [];
  for (let y = 0; y <= gridSize; y++) {
    for (let x = 0; x <= gridSize; x++) {
      positions.push(x / gridSize, y / gridSize, 0);
    }
  }

  const indices: number[] = [];
  const stride = vertexCountPerSide;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const a = y * stride + x;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const positionsArray = new Float32Array(positions);
  const indicesArray = new Uint32Array(indices);
  const positionsBytes = new Uint8Array(positionsArray.buffer);
  const indicesBytes = new Uint8Array(indicesArray.buffer);
  const totalBinaryLength =
    positionsBytes.byteLength + indicesBytes.byteLength + pad4(indicesBytes.byteLength);

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
    buffers: [{ byteLength: totalBinaryLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionsBytes.byteLength },
      {
        buffer: 0,
        byteOffset: positionsBytes.byteLength,
        byteLength: indicesBytes.byteLength
      }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0]
      },
      {
        bufferView: 1,
        componentType: 5125,
        count: indices.length,
        type: "SCALAR"
      }
    ]
  };

  const jsonBytesRaw = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadding = pad4(jsonBytesRaw.byteLength);
  const jsonBytes = new Uint8Array(jsonBytesRaw.byteLength + jsonPadding);
  jsonBytes.set(jsonBytesRaw);
  jsonBytes.fill(0x20, jsonBytesRaw.byteLength);

  const binaryBytes = new Uint8Array(totalBinaryLength);
  binaryBytes.set(positionsBytes, 0);
  binaryBytes.set(indicesBytes, positionsBytes.byteLength);

  const totalLength = 12 + 8 + jsonBytes.byteLength + 8 + binaryBytes.byteLength;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.set(jsonBytes, 20);
  const binaryChunkOffset = 20 + jsonBytes.byteLength;
  view.setUint32(binaryChunkOffset, binaryBytes.byteLength, true);
  view.setUint32(binaryChunkOffset + 4, 0x004e4942, true);
  glb.set(binaryBytes, binaryChunkOffset + 8);
  return glb;
}

function modelRef(bytes: Uint8Array): Record<string, unknown> {
  return {
    type: "model3d",
    uri: "file://triangle.glb",
    format: "glb",
    data: Buffer.from(bytes).toString("base64")
  };
}

describe("model3d honest I/O", () => {
  it("FormatConverterNode converts GLB bytes into textual glTF JSON", async () => {
    const node = new FormatConverterNode();
    node.assign({
      model: modelRef(createTriangleGlb()),
      output_format: "gltf"
    });

    const result = await node.process();
    const output = result.output as { data: string; format: string };
    const jsonText = Buffer.from(output.data, "base64").toString("utf8");
    const json = JSON.parse(jsonText) as {
      asset?: { version?: string };
      meshes?: unknown[];
      buffers?: Array<{ uri?: string }>;
    };

    expect(output.format).toBe("gltf");
    expect(json.asset?.version).toBe("2.0");
    expect(json.meshes).toHaveLength(1);
    expect(json.buffers?.[0]?.uri?.startsWith("data:")).toBe(true);
  });

  it("FormatConverterNode rejects formats it cannot truthfully write yet", async () => {
    const node = new FormatConverterNode();
    node.assign({
      model: modelRef(createTriangleGlb()),
      output_format: "obj"
    });

    await expect(node.process()).rejects.toThrow(/unsupported/i);
  });

  it("GetModel3DMetadataNode reads real geometry from GLB", async () => {
    const node = new GetModel3DMetadataNode();
    node.assign({
      model: modelRef(createTriangleGlb())
    });

    const result = await node.process();
    const output = result.output as {
      format: string;
      vertex_count: number;
      face_count: number;
      mesh_count: number;
      primitive_count: number;
      bounds_min: number[];
      bounds_max: number[];
    };

    expect(output.format).toBe("glb");
    expect(output.vertex_count).toBe(3);
    expect(output.face_count).toBe(1);
    expect(output.mesh_count).toBe(1);
    expect(output.primitive_count).toBe(1);
    expect(output.bounds_min).toEqual([0, 0, 0]);
    expect(output.bounds_max).toEqual([1, 2, 0]);
  });

  it("DecimateNode reduces triangle count on a real GLB mesh", async () => {
    const inputModel = modelRef(createGridGlb(8));
    const metadataBefore = new GetModel3DMetadataNode();
    metadataBefore.assign({ model: inputModel });
    const before = (await metadataBefore.process()).output as { face_count: number };

    const node = new DecimateNode();
    node.assign({
      model: inputModel,
      target_ratio: 0.5
    });

    const decimated = (await node.process()).output as Record<string, unknown>;
    const metadataAfter = new GetModel3DMetadataNode();
    metadataAfter.assign({ model: decimated });
    const after = (await metadataAfter.process()).output as { face_count: number };

    expect(after.face_count).toBeLessThan(before.face_count);
    expect(after.face_count).toBeGreaterThan(0);
  });

  it("DecimateNode rejects non-GLB input in the first pass", async () => {
    const node = new DecimateNode();
    node.assign({
      model: {
        type: "model3d",
        uri: "file://mesh.obj",
        format: "obj",
        data: Buffer.from("o mesh\nv 0 0 0\n").toString("base64")
      },
      target_ratio: 0.5
    });

    await expect(node.process()).rejects.toThrow(/unsupported/i);
  });
});
