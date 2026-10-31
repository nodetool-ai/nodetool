import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import type { NativePreparedModel } from "../../src/native-cpp/model3d-types.js";

/** The same closed glTF payload and native draw data drive both capture paths. */
export function native3DConformanceFixture(): {
  document: unknown;
  bytes: Uint8Array;
  prepared: NativePreparedModel;
} {
  const canvas = createCanvas(2, 2),
    context = canvas.getContext("2d");
  context.fillStyle = "#ff0000";
  context.fillRect(0, 0, 2, 2);
  context.fillStyle = "#0000ff";
  context.fillRect(1, 0, 1, 2);
  const image = canvas.toBuffer("image/png");
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const vertices = [
    [-1, 0, 0],
    [1, 0, 0],
    [0, 2, 0]
  ].map((position, index) => ({
    position,
    normal: [0, Math.SQRT1_2, Math.SQRT1_2],
    uv: index === 0 ? [0, 1] : index === 1 ? [1, 1] : [0.5, 0],
    joints: [0, 0, 0, 0],
    weights: [1, 0, 0, 0]
  }));
  const prepared: NativePreparedModel = {
    meshes: [[{ vertices, indices: [0, 1, 2], material: 0 }]],
    materials: [
      {
        color: [1, 1, 1, 1],
        metallic: 1,
        roughness: 1,
        image: 0,
        doubleSided: false
      }
    ],
    images: [],
    nodes: [
      { local: identity, children: [1], mesh: -1, skin: -1 },
      {
        local: [1, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        children: [],
        mesh: 0,
        skin: 0
      }
    ],
    roots: [0],
    skins: [{ joints: [1], inverseBind: [identity] }],
    animations: [
      {
        name: "move",
        duration: 2,
        channels: [
          {
            node: 0,
            path: "translation",
            interpolation: "LINEAR",
            times: [0, 2],
            values: [
              [0, 0, 0, 0],
              [2, 0, 0, 0]
            ]
          }
        ]
      }
    ]
  };
  const chunks: Buffer[] = [];
  const views: { buffer: number; byteOffset: number; byteLength: number }[] =
    [];
  const accessors: {
    bufferView: number;
    componentType: number;
    count: number;
    type: string;
  }[] = [];
  let length = 0;
  function append(bytes: Uint8Array): number {
    const padding = (4 - (length % 4)) % 4;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      length += padding;
    }
    const offset = length;
    chunks.push(Buffer.from(bytes));
    length += bytes.length;
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    return views.length - 1;
  }
  function floats(
    values: readonly number[],
    type: string,
    count: number
  ): number {
    const array = new Float32Array(values);
    const view = append(new Uint8Array(array.buffer));
    accessors.push({ bufferView: view, componentType: 5126, count, type });
    return accessors.length - 1;
  }
  const position = floats(
      vertices.flatMap((v) => v.position),
      "VEC3",
      3
    ),
    normal = floats(
      vertices.flatMap((v) => v.normal),
      "VEC3",
      3
    ),
    uv = floats(
      vertices.flatMap((v) => v.uv),
      "VEC2",
      3
    );
  const joints = new Uint16Array(vertices.flatMap((v) => v.joints));
  accessors.push({
    bufferView: append(new Uint8Array(joints.buffer)),
    componentType: 5123,
    count: 3,
    type: "VEC4"
  });
  const joint = accessors.length - 1;
  const weights = floats(
      vertices.flatMap((v) => v.weights),
      "VEC4",
      3
    ),
    times = floats([0, 2], "SCALAR", 2),
    translation = floats([0, 0, 0, 2, 0, 0], "VEC3", 2),
    imageView = append(image);
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: length }],
    bufferViews: views,
    accessors,
    images: [{ bufferView: imageView, mimeType: "image/png" }],
    textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: position,
              NORMAL: normal,
              TEXCOORD_0: uv,
              JOINTS_0: joint,
              WEIGHTS_0: weights
            },
            material: 0
          }
        ]
      }
    ],
    nodes: [{ children: [1] }, { mesh: 0, skin: 0, scale: [1, 4, 1] }],
    skins: [{ joints: [1] }],
    scenes: [{ nodes: [0] }],
    scene: 0,
    animations: [
      {
        name: "move",
        samplers: [
          { input: times, output: translation, interpolation: "LINEAR" }
        ],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }]
      }
    ]
  };
  const json = Buffer.from(JSON.stringify(gltf));
  const jsonPadding = Buffer.alloc((4 - (json.length % 4)) % 4, 32),
    binary = Buffer.concat(chunks),
    binPadding = Buffer.alloc((4 - (binary.length % 4)) % 4);
  const header = Buffer.alloc(12),
    jsonHeader = Buffer.alloc(8),
    binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(
    12 +
      8 +
      json.length +
      jsonPadding.length +
      8 +
      binary.length +
      binPadding.length,
    8
  );
  jsonHeader.writeUInt32LE(json.length + jsonPadding.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(binary.length + binPadding.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const entities = [
    {
      id: "imported",
      transform: {
        rotation: [0, Math.sin(0.1), 0, Math.cos(0.1)],
        scale: [0.8, 0.25, 0.8]
      },
      visual: { kind: "model", assetId: "model" }
    },
    {
      id: "floor",
      transform: { position: [0, -0.1, 0] },
      visual: {
        kind: "primitive",
        shape: "box",
        size: [10, 0.2, 10],
        color: [1, 1, 1, 1]
      }
    },
    {
      id: "box",
      transform: { position: [-2, 1, -1] },
      visual: {
        kind: "primitive",
        shape: "box",
        size: [1, 2, 1],
        color: [1, 0.2, 0.1, 1]
      }
    },
    {
      id: "ball",
      transform: { position: [-3, 0.5, 1] },
      visual: {
        kind: "primitive",
        shape: "sphere",
        size: [1, 1, 1],
        color: [0.1, 1, 0.2, 1]
      }
    },
    {
      id: "pill",
      transform: { position: [3, 0.75, 0] },
      visual: {
        kind: "primitive",
        shape: "capsule",
        size: [1, 1, 1],
        color: [0.2, 0.1, 1, 1]
      }
    }
  ];
  return {
    bytes: new Uint8Array(
      Buffer.concat([
        header,
        jsonHeader,
        json,
        jsonPadding,
        binHeader,
        binary,
        binPadding
      ])
    ),
    prepared: {
      ...prepared,
      images: [
        {
          mimeType: "image/png",
          source: {
            assetId: "model",
            offset:
              12 +
              8 +
              json.length +
              jsonPadding.length +
              8 +
              views[imageView].byteOffset,
            length: image.length,
            digest: createHash("sha256").update(image).digest("hex")
          }
        }
      ]
    },
    document: {
      schemaVersion: 4,
      engine: "native-cpp-1",
      dimension: "3d",
      id: "conformance",
      title: "Native browser3D conformance",
      initialSceneId: "scene",
      scenes: [{ id: "scene", entities }],
      assets: [],
      camera: { position: [4, 3, 6], target: [0, 1, 0], fov: 60 }
    }
  };
}
