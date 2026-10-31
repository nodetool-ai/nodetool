import { createHash } from "node:crypto";
import type { NativePreparedImage } from "@nodetool-ai/protocol/native-game";
import type { NativePreparedModel } from "../../src/native-cpp/model3d-types.js";

/** Encodes the static visual feature fixture, preserving its exact admitted arrays and sampler settings. */
export function encodeNativeVisualFixture(
  model: NativePreparedModel,
  assetId: string,
  files: ReadonlyMap<string, Uint8Array>
): { bytes: Buffer; images: NativePreparedImage[] } {
  if (model.animations.length || model.skins.length) {
    throw new Error(
      "The visual material fixture exporter accepts static unskinned graphs"
    );
  }
  const parts: Buffer[] = [],
    views: { buffer: number; byteOffset: number; byteLength: number }[] = [],
    accessors: {
      bufferView: number;
      componentType: number;
      count: number;
      type: string;
    }[] = [];
  let length = 0;
  const append = (bytes: Uint8Array): number => {
    const padding = (4 - (length % 4)) % 4;
    if (padding) {
      parts.push(Buffer.alloc(padding));
      length += padding;
    }
    views.push({ buffer: 0, byteOffset: length, byteLength: bytes.length });
    parts.push(Buffer.from(bytes));
    length += bytes.length;
    return views.length - 1;
  };
  const floats = (
    values: readonly number[],
    type: string,
    width: number
  ): number => {
    const bytes = Buffer.alloc(values.length * 4);
    values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
    accessors.push({
      bufferView: append(bytes),
      componentType: 5126,
      count: values.length / width,
      type
    });
    return accessors.length - 1;
  };
  const meshes = model.meshes.map((mesh) => ({
    primitives: mesh.map((primitive) => {
      const positions = floats(
          primitive.vertices.flatMap((vertex) => [...vertex.position]),
          "VEC3",
          3
        ),
        normals = floats(
          primitive.vertices.flatMap((vertex) => [...vertex.normal]),
          "VEC3",
          3
        ),
        uv = floats(
          primitive.vertices.flatMap((vertex) => [...vertex.uv]),
          "VEC2",
          2
        ),
        indices = Buffer.alloc(primitive.indices.length * 4);
      primitive.indices.forEach((value, index) =>
        indices.writeUInt32LE(value, index * 4)
      );
      accessors.push({
        bufferView: append(indices),
        componentType: 5125,
        count: primitive.indices.length,
        type: "SCALAR"
      });
      return {
        attributes: { POSITION: positions, NORMAL: normals, TEXCOORD_0: uv },
        indices: accessors.length - 1,
        material: primitive.material
      };
    })
  }));
  const samplers: unknown[] = [],
    textures: { source: number; sampler: number }[] = [];
  const texture = (index: number, sampler: unknown): number => {
    samplers.push(
      sampler ?? {
        wrapS: 10497,
        wrapT: 10497,
        magFilter: 9729,
        minFilter: 9987
      }
    );
    textures.push({ source: index, sampler: samplers.length - 1 });
    return textures.length - 1;
  };
  const materials = model.materials.map((material) => ({
    pbrMetallicRoughness: {
      baseColorFactor: material.color,
      metallicFactor: material.metallic,
      roughnessFactor: material.roughness,
      ...(material.image < 0
        ? {}
        : {
            baseColorTexture: {
              index: texture(material.image, material.baseColorSampler)
            }
          })
    },
    doubleSided: material.doubleSided,
    alphaMode: material.alphaMode ?? "OPAQUE",
    alphaCutoff: material.alphaCutoff ?? 0.5,
    emissiveFactor: material.emissive ?? [0, 0, 0],
    ...((material.normalImage ?? -1) < 0
      ? {}
      : {
          normalTexture: {
            index: texture(material.normalImage ?? -1, material.normalSampler),
            scale: material.normalScale ?? 1
          }
        })
  }));
  const images = model.images.map((image) => {
    const file = files.get(image.source.assetId);
    if (!file) {
      throw new Error("Missing encoded fixture image file");
    }
    const bytes = file.subarray(
      image.source.offset,
      image.source.offset + image.source.length
    );
    if (
      bytes.length !== image.source.length ||
      createHash("sha256").update(bytes).digest("hex") !== image.source.digest
    ) {
      throw new Error("Fixture image provenance mismatch");
    }
    return { bufferView: append(bytes), mimeType: image.mimeType };
  });
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: length }],
    bufferViews: views,
    accessors,
    meshes,
    materials,
    images,
    samplers,
    textures,
    nodes: model.nodes.map((node) => ({
      matrix: node.local,
      children: node.children,
      ...(node.mesh < 0 ? {} : { mesh: node.mesh })
    })),
    scenes: [{ nodes: model.roots }],
    scene: 0
  };
  const json = Buffer.from(JSON.stringify(gltf)),
    jsonPadding = Buffer.alloc((4 - (json.length % 4)) % 4, 32),
    binary = Buffer.concat(parts),
    binaryPadding = Buffer.alloc((4 - (binary.length % 4)) % 4),
    header = Buffer.alloc(12),
    jsonHeader = Buffer.alloc(8),
    binaryHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(
    12 +
      8 +
      json.length +
      jsonPadding.length +
      8 +
      binary.length +
      binaryPadding.length,
    8
  );
  jsonHeader.writeUInt32LE(json.length + jsonPadding.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binaryHeader.writeUInt32LE(binary.length + binaryPadding.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  const bytes = Buffer.concat([
    header,
    jsonHeader,
    json,
    jsonPadding,
    binaryHeader,
    binary,
    binaryPadding
  ]);
  const binaryStart = 12 + 8 + json.length + jsonPadding.length + 8;
  return {
    bytes,
    images: model.images.map((image, index) => ({
      mimeType: image.mimeType,
      source: {
        assetId,
        offset: binaryStart + views[images[index].bufferView].byteOffset,
        length: image.source.length,
        digest: image.source.digest
      }
    }))
  };
}
