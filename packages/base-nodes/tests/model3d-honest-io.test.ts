import { describe, expect, it, vi } from "vitest";
import type { ProcessingContext } from "@nodetool/runtime";
import { getDeclaredPropertiesForClass } from "@nodetool/node-sdk";
import {
  Boolean3DNode,
  CenterMeshNode,
  DecimateNode,
  ExtractLargestComponentNode,
  FlipNormalsNode,
  FormatConverterNode,
  GetModel3DMetadataNode,
  ImageTo3DNode,
  MergeMeshesNode,
  NormalizeModel3DNode,
  RecalculateNormalsNode,
  RepairMeshNode,
  TextTo3DNode,
  Transform3DNode
} from "../src/nodes/model3d.js";

function pad4(length: number): number {
  return (4 - (length % 4)) % 4;
}

function createTriangleGlb(): Uint8Array {
  return createIndexedGlb(
    [
      0, 0, 0,
      1, 0, 0,
      0, 2, 0
    ],
    [0, 1, 2],
    [0, 0, 0],
    [1, 2, 0]
  );
}

function createTriangleWithNormalsGlb(): Uint8Array {
  return createIndexedGlb(
    [
      0, 0, 0,
      1, 0, 0,
      0, 2, 0
    ],
    [0, 1, 2],
    [0, 0, 0],
    [1, 2, 0],
    [
      0, 0, -1,
      0, 0, -1,
      0, 0, -1
    ]
  );
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

  return createIndexedGlb(positions, indices, [0, 0, 0], [1, 1, 0]);
}

function createBoxGlb(
  min: [number, number, number],
  max: [number, number, number]
): Uint8Array {
  const [minX, minY, minZ] = min;
  const [maxX, maxY, maxZ] = max;
  const positions = [
    minX, minY, minZ,
    maxX, minY, minZ,
    maxX, maxY, minZ,
    minX, maxY, minZ,
    minX, minY, maxZ,
    maxX, minY, maxZ,
    maxX, maxY, maxZ,
    minX, maxY, maxZ
  ];
  const indices = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5
  ];
  return createIndexedGlb(positions, indices, [...min], [...max]);
}

function createDisconnectedComponentsGlb(): Uint8Array {
  const boxPositions = [
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 1, 0,
    0, 0, 1,
    1, 0, 1,
    1, 1, 1,
    0, 1, 1
  ];
  const boxIndices = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5
  ];

  const trianglePositions = [
    5, 0, 0,
    6, 0, 0,
    5, 1, 0
  ];
  const triangleIndices = [8, 9, 10];

  return createIndexedGlb(
    [...boxPositions, ...trianglePositions],
    [...boxIndices, ...triangleIndices],
    [0, 0, 0],
    [6, 1, 1]
  );
}

function createNearDuplicateSharedEdgeGlb(): Uint8Array {
  return createIndexedGlb(
    [
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      1.00001, 0, 0,
      1, 1, 0,
      0, 0.99999, 0
    ],
    [0, 1, 2, 3, 4, 5],
    [0, 0, 0],
    [1.00001, 1, 0]
  );
}

function createDegenerateFaceGlb(): Uint8Array {
  return createIndexedGlb(
    [
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      2, 0, 0
    ],
    [0, 1, 2, 1, 3, 3],
    [0, 0, 0],
    [2, 1, 0]
  );
}

function createIndexedGlb(
  positions: number[],
  indices: number[],
  min: number[],
  max: number[],
  normals?: number[]
): Uint8Array {
  const positionsArray = new Float32Array(positions);
  const normalsArray = normals ? new Float32Array(normals) : null;
  const indicesArray = new Uint32Array(indices);
  const positionsBytes = new Uint8Array(positionsArray.buffer);
  const normalsBytes = normalsArray ? new Uint8Array(normalsArray.buffer) : null;
  const indicesBytes = new Uint8Array(indicesArray.buffer);
  const totalBinaryLength =
    positionsBytes.byteLength +
    (normalsBytes?.byteLength ?? 0) +
    indicesBytes.byteLength +
    pad4(indicesBytes.byteLength);

  const normalBufferViewIndex = normalsBytes ? 1 : undefined;
  const indexBufferViewIndex = normalsBytes ? 2 : 1;
  const normalAccessorIndex = normalsBytes ? 1 : undefined;
  const indexAccessorIndex = normalsBytes ? 2 : 1;

  const json = {
    asset: { version: "2.0" },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0,
              ...(normalAccessorIndex !== undefined
                ? { NORMAL: normalAccessorIndex }
                : {})
            },
            indices: indexAccessorIndex
          }
        ]
      }
    ],
    buffers: [{ byteLength: totalBinaryLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionsBytes.byteLength },
      ...(normalsBytes
        ? [
            {
              buffer: 0,
              byteOffset: positionsBytes.byteLength,
              byteLength: normalsBytes.byteLength
            }
          ]
        : []),
      {
        buffer: 0,
        byteOffset: positionsBytes.byteLength + (normalsBytes?.byteLength ?? 0),
        byteLength: indicesBytes.byteLength
      }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min,
        max
      },
      ...(normalsBytes
        ? [
            {
              bufferView: normalBufferViewIndex,
              componentType: 5126,
              count: normals!.length / 3,
              type: "VEC3"
            }
          ]
        : []),
      {
        bufferView: indexBufferViewIndex,
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
  if (normalsBytes) {
    binaryBytes.set(normalsBytes, positionsBytes.byteLength);
  }
  binaryBytes.set(
    indicesBytes,
    positionsBytes.byteLength + (normalsBytes?.byteLength ?? 0)
  );

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

function expectBoundsClose(
  actual: number[],
  expected: [number, number, number]
): void {
  expect(actual).toHaveLength(3);
  for (let i = 0; i < 3; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], 5);
  }
}

function parseGlb(bytes: Uint8Array): {
  json: {
    accessors: Array<{
      bufferView: number;
      byteOffset?: number;
      componentType: number;
      count: number;
      type: string;
    }>;
    bufferViews: Array<{
      buffer: number;
      byteOffset?: number;
      byteLength: number;
      byteStride?: number;
    }>;
    meshes: Array<{
      primitives: Array<{
        attributes: Record<string, number>;
        indices?: number;
      }>;
    }>;
  };
  bin: Uint8Array;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let json = {} as {
    accessors: Array<{
      bufferView: number;
      byteOffset?: number;
      componentType: number;
      count: number;
      type: string;
    }>;
    bufferViews: Array<{
      buffer: number;
      byteOffset?: number;
      byteLength: number;
      byteStride?: number;
    }>;
    meshes: Array<{
      primitives: Array<{
        attributes: Record<string, number>;
        indices?: number;
      }>;
    }>;
  };
  let bin = new Uint8Array(0);

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    offset += 8;
    if (type === 0x4e4f534a) {
      json = JSON.parse(
        new TextDecoder().decode(bytes.slice(offset, offset + length))
      ) as typeof json;
    } else if (type === 0x004e4942) {
      bin = bytes.slice(offset, offset + length);
    }
    offset += length;
  }

  return { json, bin };
}

function readVec3Accessor(bytes: Uint8Array, accessorIndex: number): number[] {
  const glb = parseGlb(bytes);
  const accessor = glb.json.accessors[accessorIndex];
  const bufferView = glb.json.bufferViews[accessor.bufferView];
  const baseOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = bufferView.byteStride ?? 12;
  const view = new DataView(glb.bin.buffer, glb.bin.byteOffset);
  const values: number[] = [];
  for (let i = 0; i < accessor.count; i++) {
    const offset = baseOffset + i * stride;
    values.push(
      view.getFloat32(offset, true),
      view.getFloat32(offset + 4, true),
      view.getFloat32(offset + 8, true)
    );
  }
  return values;
}

function readIndexAccessor(bytes: Uint8Array, accessorIndex: number): number[] {
  const glb = parseGlb(bytes);
  const accessor = glb.json.accessors[accessorIndex];
  const bufferView = glb.json.bufferViews[accessor.bufferView];
  const baseOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const view = new DataView(glb.bin.buffer, glb.bin.byteOffset);
  const values: number[] = [];
  for (let i = 0; i < accessor.count; i++) {
    values.push(view.getUint32(baseOffset + i * 4, true));
  }
  return values;
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

  it("Transform3DNode applies translation and scaling to real GLB geometry", async () => {
    const node = new Transform3DNode();
    node.assign({
      model: modelRef(createTriangleGlb()),
      translate_x: 1,
      translate_y: -2,
      translate_z: 3,
      scale_x: 2,
      scale_y: 3,
      scale_z: 1,
      uniform_scale: 1
    });

    const result = await node.process();
    const metadataNode = new GetModel3DMetadataNode();
    metadataNode.assign({ model: result.output });
    const output = (await metadataNode.process()).output as {
      bounds_min: number[];
      bounds_max: number[];
    };

    expectBoundsClose(output.bounds_min, [1, -2, 3]);
    expectBoundsClose(output.bounds_max, [3, 4, 3]);
  });

  it("CenterMeshNode recenters geometry around the bounding-box midpoint", async () => {
    const node = new CenterMeshNode();
    node.assign({
      model: modelRef(createTriangleGlb()),
      use_centroid: false
    });

    const result = await node.process();
    const metadataNode = new GetModel3DMetadataNode();
    metadataNode.assign({ model: result.output });
    const output = (await metadataNode.process()).output as {
      bounds_min: number[];
      bounds_max: number[];
    };

    expectBoundsClose(output.bounds_min, [-0.5, -1, 0]);
    expectBoundsClose(output.bounds_max, [0.5, 1, 0]);
  });

  it("RecalculateNormalsNode rewrites vertex normals from real triangle geometry", async () => {
    const node = new RecalculateNormalsNode();
    node.assign({
      model: modelRef(createTriangleWithNormalsGlb()),
      mode: "smooth",
      fix_winding: false
    });

    const result = await node.process();
    const output = result.output as { data: string };
    const normals = readVec3Accessor(Buffer.from(output.data, "base64"), 1);

    expect(normals).toEqual([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1
    ]);
  });

  it("FlipNormalsNode negates normals and reverses triangle winding", async () => {
    const node = new FlipNormalsNode();
    node.assign({
      model: modelRef(createTriangleWithNormalsGlb())
    });

    const result = await node.process();
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");
    const normals = readVec3Accessor(bytes, 1).map((value) =>
      Object.is(value, -0) ? 0 : value
    );
    const indices = readIndexAccessor(bytes, 2);

    expect(normals).toEqual([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1
    ]);
    expect(indices).toEqual([0, 2, 1]);
  });

  it("NormalizeModel3DNode centers, scales, and grounds a GLB using honest geometry", async () => {
    const node = new NormalizeModel3DNode();
    node.assign({
      model: modelRef(createBoxGlb([2, 3, 4], [4, 7, 8])),
      center_mode: "bounds",
      axis_preset: "keep",
      scale_to_size: true,
      target_size: 2,
      place_on_ground: true,
      ground_axis: "y"
    });

    const result = await node.process();
    const metadataNode = new GetModel3DMetadataNode();
    metadataNode.assign({ model: result.output });
    const output = (await metadataNode.process()).output as {
      bounds_min: number[];
      bounds_max: number[];
    };

    expectBoundsClose(output.bounds_min, [-0.5, 0, -1]);
    expectBoundsClose(output.bounds_max, [0.5, 2, 1]);
  });

  it("NormalizeModel3DNode applies explicit axis normalization before other cleanup", async () => {
    const node = new NormalizeModel3DNode();
    node.assign({
      model: modelRef(createBoxGlb([0, 0, 0], [1, 2, 3])),
      center_mode: "none",
      axis_preset: "z_to_y",
      scale_to_size: false,
      target_size: 1,
      place_on_ground: false,
      ground_axis: "y"
    });

    const result = await node.process();
    const metadataNode = new GetModel3DMetadataNode();
    metadataNode.assign({ model: result.output });
    const output = (await metadataNode.process()).output as {
      bounds_min: number[];
      bounds_max: number[];
    };

    expectBoundsClose(output.bounds_min, [0, 0, -2]);
    expectBoundsClose(output.bounds_max, [1, 3, 0]);
  });

  it("ExtractLargestComponentNode keeps the largest disconnected triangle component", async () => {
    const node = new ExtractLargestComponentNode();
    node.assign({
      model: modelRef(createDisconnectedComponentsGlb())
    });

    const result = await node.process();
    const metadataNode = new GetModel3DMetadataNode();
    metadataNode.assign({ model: result.output });
    const output = (await metadataNode.process()).output as {
      face_count: number;
      bounds_min: number[];
      bounds_max: number[];
    };

    expect(output.face_count).toBe(12);
    expectBoundsClose(output.bounds_min, [0, 0, 0]);
    expectBoundsClose(output.bounds_max, [1, 1, 1]);
  });

  it("RepairMeshNode merges near-duplicate vertices before rebuilding the mesh", async () => {
    const node = new RepairMeshNode();
    node.assign({
      model: modelRef(createNearDuplicateSharedEdgeGlb())
    });

    const result = await node.process();
    const metadataNode = new GetModel3DMetadataNode();
    metadataNode.assign({ model: result.output });
    const output = (await metadataNode.process()).output as {
      vertex_count: number;
      face_count: number;
      bounds_min: number[];
      bounds_max: number[];
    };

    expect(output.vertex_count).toBe(4);
    expect(output.face_count).toBe(2);
    expectBoundsClose(output.bounds_min, [0, 0, 0]);
    expectBoundsClose(output.bounds_max, [1, 1, 0]);
  });

  it("RepairMeshNode removes degenerate faces and compacts away unused vertices", async () => {
    const node = new RepairMeshNode();
    node.assign({
      model: modelRef(createDegenerateFaceGlb())
    });

    const result = await node.process();
    const metadataNode = new GetModel3DMetadataNode();
    metadataNode.assign({ model: result.output });
    const output = (await metadataNode.process()).output as {
      vertex_count: number;
      face_count: number;
      bounds_min: number[];
      bounds_max: number[];
    };

    expect(output.vertex_count).toBe(3);
    expect(output.face_count).toBe(1);
    expectBoundsClose(output.bounds_min, [0, 0, 0]);
    expectBoundsClose(output.bounds_max, [1, 1, 0]);
  });

  it("MergeMeshesNode performs an honest GLB scene merge", async () => {
    const node = new MergeMeshesNode();
    node.assign({
      models: [modelRef(createTriangleGlb()), modelRef(createBoxGlb([2, 0, 0], [3, 1, 1]))]
    });

    const result = await node.process();
    const metadataNode = new GetModel3DMetadataNode();
    metadataNode.assign({ model: result.output });
    const output = (await metadataNode.process()).output as {
      format: string;
      mesh_count: number;
      primitive_count: number;
      face_count: number;
      bounds_min: number[];
      bounds_max: number[];
    };

    expect(output.format).toBe("glb");
    expect(output.mesh_count).toBe(2);
    expect(output.primitive_count).toBe(2);
    expect(output.face_count).toBeGreaterThanOrEqual(13);
    expectBoundsClose(output.bounds_min, [0, 0, 0]);
    expectBoundsClose(output.bounds_max, [3, 2, 1]);
  });

  it("Boolean3DNode performs geometry-aware union", async () => {
    const node = new Boolean3DNode();
    node.assign({
      model_a: modelRef(createBoxGlb([0, 0, 0], [1, 1, 1])),
      model_b: modelRef(createBoxGlb([0.5, 0, 0], [1.5, 1, 1])),
      operation: "union"
    });

    const result = await node.process();
    const metadataNode = new GetModel3DMetadataNode();
    metadataNode.assign({ model: result.output });
    const output = (await metadataNode.process()).output as {
      format: string;
      face_count: number;
      bounds_min: number[];
      bounds_max: number[];
    };

    expect(output.format).toBe("glb");
    expect(output.face_count).toBeGreaterThan(0);
    expectBoundsClose(output.bounds_min, [0, 0, 0]);
    expectBoundsClose(output.bounds_max, [1.5, 1, 1]);
  });

  it("Boolean3DNode performs geometry-aware difference", async () => {
    const node = new Boolean3DNode();
    node.assign({
      model_a: modelRef(createBoxGlb([0, 0, 0], [1, 1, 1])),
      model_b: modelRef(createBoxGlb([0.5, 0, 0], [1.5, 1, 1])),
      operation: "difference"
    });

    const result = await node.process();
    const metadataNode = new GetModel3DMetadataNode();
    metadataNode.assign({ model: result.output });
    const output = (await metadataNode.process()).output as {
      face_count: number;
      bounds_min: number[];
      bounds_max: number[];
    };

    expect(output.face_count).toBeGreaterThan(0);
    expectBoundsClose(output.bounds_min, [0, 0, 0]);
    expectBoundsClose(output.bounds_max, [0.5, 1, 1]);
  });

  it("Boolean3DNode performs geometry-aware intersection", async () => {
    const node = new Boolean3DNode();
    node.assign({
      model_a: modelRef(createBoxGlb([0, 0, 0], [1, 1, 1])),
      model_b: modelRef(createBoxGlb([0.5, 0, 0], [1.5, 1, 1])),
      operation: "intersection"
    });

    const result = await node.process();
    const metadataNode = new GetModel3DMetadataNode();
    metadataNode.assign({ model: result.output });
    const output = (await metadataNode.process()).output as {
      face_count: number;
      bounds_min: number[];
      bounds_max: number[];
    };

    expect(output.face_count).toBeGreaterThan(0);
    expectBoundsClose(output.bounds_min, [0.5, 0, 0]);
    expectBoundsClose(output.bounds_max, [1, 1, 1]);
  });

  it("Boolean3DNode rejects non-GLB input in the first honest pass", async () => {
    const node = new Boolean3DNode();
    node.assign({
      model_a: {
        type: "model3d",
        uri: "file://mesh-a.obj",
        format: "obj",
        data: Buffer.from("o meshA\n").toString("base64")
      },
      model_b: modelRef(createBoxGlb([0, 0, 0], [1, 1, 1])),
      operation: "union"
    });

    await expect(node.process()).rejects.toThrow(/unsupported/i);
  });

  it("CenterMeshNode has exactly one @prop on model with type model_3d (no dict from old base)", () => {
    // GlbTransformNode does not declare @prop on model; CenterMeshNode does.
    // getDeclaredPropertiesForClass merges the hierarchy — model should appear once as model_3d.
    const props = getDeclaredPropertiesForClass(CenterMeshNode);
    const modelProps = props.filter((p) => p.name === "model");
    expect(modelProps).toHaveLength(1);
    expect(modelProps[0].options.type).toBe("model_3d");
  });

  it("TextTo3DNode requires a ProcessingContext to resolve a provider", async () => {
    const node = new TextTo3DNode();
    node.assign({ prompt: "a red dragon" });
    await expect(node.process()).rejects.toThrow(/ProcessingContext/i);
  });

  it("ImageTo3DNode requires a ProcessingContext to resolve a provider", async () => {
    const node = new ImageTo3DNode();
    node.assign({ image: { type: "image", uri: "", data: null } });
    await expect(node.process()).rejects.toThrow(/ProcessingContext/i);
  });

  it("TextTo3DNode delegates to the resolved provider's textTo3D", async () => {
    const meshBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
    const textTo3D = vi.fn().mockResolvedValue(meshBytes);
    const ctx = {
      getProvider: vi.fn().mockResolvedValue({ textTo3D })
    } as unknown as ProcessingContext;
    const node = new TextTo3DNode();
    node.assign({
      model: { type: "model_3d_model", provider: "meshy", id: "meshy-4" },
      prompt: "a red dragon"
    });
    const result = await node.process(ctx);
    expect(textTo3D).toHaveBeenCalledTimes(1);
    expect((result.output as Record<string, unknown>).format).toBe("glb");
  });
});
