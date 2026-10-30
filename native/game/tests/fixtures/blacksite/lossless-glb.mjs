import { createHash } from "node:crypto";

const componentBytes = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]]);
const typeWidths = new Map([["SCALAR", 1], ["VEC2", 2], ["VEC3", 3], ["VEC4", 4], ["MAT4", 16]]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function decodeGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error("Expected GLB 2.0");
  }
  const length = bytes.readUInt32LE(12);
  const binOffset = 20 + length;
  if (bytes.readUInt32LE(binOffset + 4) !== 0x004e4942) {
    throw new Error("BLACKSITE facility requires one embedded BIN chunk");
  }
  return {
    gltf: JSON.parse(bytes.subarray(20, binOffset).toString("utf8")),
    binary: bytes.subarray(binOffset + 8, binOffset + 8 + bytes.readUInt32LE(binOffset))
  };
}

export function encodeGlb(gltf, binary) {
  const json = Buffer.from(JSON.stringify(gltf));
  const jsonPadded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(jsonPadded);
  const binaryPadded = Buffer.alloc(Math.ceil(binary.length / 4) * 4);
  binary.copy(binaryPadded);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonPadded.length + binaryPadded.length, 8);
  header.writeUInt32LE(jsonPadded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binaryPadded.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonPadded, binHeader, binaryPadded]);
}

function accessorView(gltf, binary, index) {
  const accessor = gltf.accessors[index];
  if (accessor.sparse || accessor.bufferView === undefined) {
    throw new Error("Sparse or implicit facility attributes need an explicit lossless mapping");
  }
  const view = gltf.bufferViews[accessor.bufferView];
  const width = componentBytes.get(accessor.componentType) * typeWidths.get(accessor.type);
  if (view.buffer !== 0 || !Number.isFinite(width)) {
    throw new Error("Unsupported facility accessor layout");
  }
  return { accessor, bytes: binary, base: (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride: view.byteStride ?? width, width };
}

function readIndices(gltf, binary, index) {
  const view = accessorView(gltf, binary, index);
  const result = new Uint32Array(view.accessor.count);
  const readers = new Map([[5121, "readUInt8"], [5123, "readUInt16LE"], [5125, "readUInt32LE"]]);
  const reader = readers.get(view.accessor.componentType);
  if (view.accessor.type !== "SCALAR" || !reader) {
    throw new Error("Facility indices must be unsigned scalar integers");
  }
  for (let index = 0; index < result.length; index++) {
    result[index] = binary[reader](view.base + index * view.stride);
  }
  return result;
}

function imageBytes(gltf, binary, externalImages = new Map()) {
  return (gltf.images ?? []).map((image) => {
    if (image.uri) {
      const bytes = externalImages.get(image.uri);
      if (!bytes) {
        throw new Error("Facility image URI is not a supplied closed dependency");
      }
      return bytes;
    }
    if (image.bufferView === undefined) {
      throw new Error("Facility image has neither embedded bytes nor a closed dependency");
    }
    const view = gltf.bufferViews[image.bufferView];
    if (view.buffer !== 0) {
      throw new Error("Facility image uses an external buffer");
    }
    const start = view.byteOffset ?? 0;
    return binary.subarray(start, start + view.byteLength);
  });
}

function updateExpanded(digest, gltf, binary, primitive, indices) {
  const names = Object.keys(primitive.attributes).sort();
  const channels = names.map((name) => accessorView(gltf, binary, primitive.attributes[name]));
  digest.update(JSON.stringify(names.map((name, index) => ({ name, componentType: channels[index].accessor.componentType, type: channels[index].accessor.type, normalized: channels[index].accessor.normalized ?? false }))));
  const batch = Buffer.alloc(65536);
  let used = 0;
  for (const index of indices) {
    for (const channel of channels) {
      if (index >= channel.accessor.count) {
        throw new Error("Facility index exceeds an attribute's vertex count");
      }
      if (used + channel.width > batch.length) {
        digest.update(batch.subarray(0, used));
        used = 0;
      }
      const start = channel.base + index * channel.stride;
      channel.bytes.copy(batch, used, start, start + channel.width);
      used += channel.width;
    }
  }
  if (used > 0) {
    digest.update(batch.subarray(0, used));
  }
}

export function partitionFacility(bytes, limits = { vertices: 50000, indices: 150000 }) {
  const { gltf, binary } = decodeGlb(bytes);
  if (gltf.animations?.length || gltf.skins?.length) {
    throw new Error("Facility skin/animation references require a separate lossless mapping");
  }
  const pieces = [];
  let originalIndices = 0;
  let originalVertices = 0;
  for (const [meshIndex, mesh] of gltf.meshes.entries()) {
    for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
      const indices = readIndices(gltf, binary, primitive.indices);
      if ((primitive.mode ?? 4) !== 4 || indices.length % 3 !== 0 || primitive.targets) {
        throw new Error("Facility primitive requires triangles without morph targets");
      }
      originalIndices += indices.length;
      originalVertices += gltf.accessors[primitive.attributes.POSITION].count;
      let vertexMap = new Map();
      let sourceVertices = [];
      let remapped = [];
      let start = 0;
      const flush = () => {
        if (remapped.length === 0) {
          return;
        }
        pieces.push({ meshIndex, primitiveIndex, start, count: remapped.length, sourceIndices: indices.subarray(start, start + remapped.length), sourceVertices: Uint32Array.from(sourceVertices), remapped: Uint32Array.from(remapped) });
        start += remapped.length;
        vertexMap = new Map();
        sourceVertices = [];
        remapped = [];
      };
      for (let offset = 0; offset < indices.length; offset += 3) {
        const a = indices[offset], b = indices[offset + 1], c = indices[offset + 2];
        const additional = Number(!vertexMap.has(a)) + Number(b !== a && !vertexMap.has(b)) + Number(c !== a && c !== b && !vertexMap.has(c));
        if (remapped.length > 0 && (vertexMap.size + additional > limits.vertices || remapped.length + 3 > limits.indices)) {
          flush();
        }
        for (let vertex = offset; vertex < offset + 3; vertex++) {
          const original = indices[vertex];
          if (!vertexMap.has(original)) {
            vertexMap.set(original, sourceVertices.length);
            sourceVertices.push(original);
          }
          remapped.push(vertexMap.get(original));
        }
      }
      flush();
    }
  }
  if (pieces.length === 0 || pieces.length > 512) {
    throw new Error("Facility partition must inspect a bounded nonempty primitive set");
  }

  // A sequential pack keeps both the triangle walk and descriptor packing linear.
  const groups = [];
  for (const piece of pieces) {
    let group = groups.at(-1);
    if (!group || group.vertices + piece.sourceVertices.length > limits.vertices || group.indices + piece.count > limits.indices) {
      group = { vertices: 0, indices: 0, pieces: [] };
      groups.push(group);
    }
    group.vertices += piece.sourceVertices.length;
    group.indices += piece.count;
    group.pieces.push(piece);
  }
  const sourceImages = imageBytes(gltf, binary);
  const sourceImageDigests = sourceImages.map(hash);
  const imageAssets = sourceImages.map((bytes, index) => ({ id: `facility-image-${index}`, uri: `facility-image-${index}.png`, bytes, digest: hash(bytes) }));
  const externalImages = new Map(imageAssets.map((image) => [image.uri, image.bytes]));
  const before = createHash("sha256"), after = createHash("sha256");
  const chunks = groups.map((group) => {
    const chunk = structuredClone(gltf);
    chunk.meshes = [];
    chunk.accessors = [];
    chunk.bufferViews = [];
    const parts = [];
    let size = 0;
    const append = (data) => {
      const padding = (4 - size % 4) % 4;
      if (padding) {
        parts.push(Buffer.alloc(padding));
        size += padding;
      }
      const offset = size;
      parts.push(data);
      size += data.length;
      const index = chunk.bufferViews.length;
      chunk.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
      return index;
    };
    chunk.images = (chunk.images ?? []).map((image, index) => {
      const external = { ...image, uri: imageAssets[index].uri };
      delete external.bufferView;
      return external;
    });
    const meshMapping = new Map();
    const prepared = [];
    for (const piece of group.pieces) {
      const original = gltf.meshes[piece.meshIndex].primitives[piece.primitiveIndex];
      const primitive = structuredClone(original);
      for (const [name, index] of Object.entries(original.attributes)) {
        const source = accessorView(gltf, binary, index);
        const data = Buffer.alloc(piece.sourceVertices.length * source.width);
        for (const [target, originalVertex] of piece.sourceVertices.entries()) {
          const start = source.base + originalVertex * source.stride;
          source.bytes.copy(data, target * source.width, start, start + source.width);
        }
        primitive.attributes[name] = chunk.accessors.length;
        chunk.accessors.push({ ...source.accessor, count: piece.sourceVertices.length, byteOffset: 0, bufferView: append(data) });
      }
      const indexBytes = Buffer.alloc(piece.remapped.length * 4);
      for (const [index, value] of piece.remapped.entries()) {
        indexBytes.writeUInt32LE(value, index * 4);
      }
      primitive.indices = chunk.accessors.length;
      chunk.accessors.push({ bufferView: append(indexBytes), componentType: 5125, count: piece.count, type: "SCALAR" });
      if (!meshMapping.has(piece.meshIndex)) {
        meshMapping.set(piece.meshIndex, chunk.meshes.length);
        chunk.meshes.push({ primitives: [] });
      }
      chunk.meshes[meshMapping.get(piece.meshIndex)].primitives.push(primitive);
      prepared.push({ piece, primitive });
    }
    for (const node of chunk.nodes) {
      if (meshMapping.has(node.mesh)) {
        node.mesh = meshMapping.get(node.mesh);
      } else {
        delete node.mesh;
      }
    }
    chunk.buffers = [{ byteLength: size }];
    const encoded = encodeGlb(chunk, Buffer.concat(parts));
    const decoded = decodeGlb(encoded);
    if (JSON.stringify(imageBytes(decoded.gltf, decoded.binary, externalImages).map(hash)) !== JSON.stringify(sourceImageDigests)) {
      throw new Error("Facility texture image bytes changed");
    }
    for (const { piece, primitive } of prepared) {
      const identity = JSON.stringify({ mesh: piece.meshIndex, primitive: piece.primitiveIndex, start: piece.start, count: piece.count });
      before.update(identity);
      after.update(identity);
      updateExpanded(before, gltf, binary, gltf.meshes[piece.meshIndex].primitives[piece.primitiveIndex], piece.sourceIndices);
      updateExpanded(after, decoded.gltf, decoded.binary, primitive, readIndices(decoded.gltf, decoded.binary, primitive.indices));
    }
    return { bytes: encoded, vertices: group.vertices, indices: group.indices, slices: group.pieces.map(({ meshIndex, primitiveIndex, start, count }) => ({ meshIndex, primitiveIndex, start, count })) };
  });
  const expandedBefore = before.digest("hex"), expandedAfter = after.digest("hex");
  if (expandedBefore !== expandedAfter || chunks.reduce((sum, chunk) => sum + chunk.indices, 0) !== originalIndices) {
    throw new Error("Facility expanded triangle attributes differ after partitioning");
  }
  return { chunks, imageAssets, originalIndices, originalVertices, expandedTriangleAttributesDigest: expandedBefore, originalExpandedTriangleAttributesDigest: expandedBefore, adaptedExpandedTriangleAttributesDigest: expandedAfter, sourceImageDigests, limits };
}

export function verifyFacilityPartition(sourceBytes, chunks, externalImages, limits = { vertices: 50000, indices: 150000 }) {
  const source = decodeGlb(sourceBytes);
  const imageDigests = imageBytes(source.gltf, source.binary).map(hash);
  const before = createHash("sha256"), after = createHash("sha256");
  const sourceIndices = new Map();
  const consumed = new Map();
  let inspected = 0;
  for (const chunk of chunks) {
    const prepared = decodeGlb(chunk.bytes);
    for (const field of ["materials", "textures", "samplers"]) {
      if (JSON.stringify(prepared.gltf[field]) !== JSON.stringify(source.gltf[field])) {
        throw new Error(`Facility ${field} changed`);
      }
    }
    if (JSON.stringify(imageBytes(prepared.gltf, prepared.binary, externalImages).map(hash)) !== JSON.stringify(imageDigests)) {
      throw new Error("Facility image bytes changed");
    }
    const primitives = prepared.gltf.meshes.flatMap((mesh) => mesh.primitives);
    if (primitives.length !== chunk.slices.length || prepared.gltf.nodes.length !== source.gltf.nodes.length) {
      throw new Error("Facility primitive or node inventory changed");
    }
    const meshMapping = new Map();
    for (const slice of chunk.slices) {
      if (!meshMapping.has(slice.meshIndex)) {
        meshMapping.set(slice.meshIndex, meshMapping.size);
      }
    }
    for (const [index, node] of prepared.gltf.nodes.entries()) {
      const expected = structuredClone(source.gltf.nodes[index]);
      if (meshMapping.has(expected.mesh)) {
        expected.mesh = meshMapping.get(expected.mesh);
      } else {
        delete expected.mesh;
      }
      if (JSON.stringify(node) !== JSON.stringify(expected)) {
        throw new Error("Facility node transform or hierarchy changed");
      }
    }
    let vertices = 0, indices = 0;
    for (const [index, slice] of chunk.slices.entries()) {
      const primitive = primitives[index];
      const original = source.gltf.meshes[slice.meshIndex].primitives[slice.primitiveIndex];
      const key = `${slice.meshIndex}:${slice.primitiveIndex}`;
      if (!sourceIndices.has(key)) {
        sourceIndices.set(key, readIndices(source.gltf, source.binary, original.indices));
      }
      if ((consumed.get(key) ?? 0) !== slice.start || primitive.material !== original.material) {
        throw new Error("Facility triangle range or material binding changed");
      }
      const preparedIndices = readIndices(prepared.gltf, prepared.binary, primitive.indices);
      if (preparedIndices.length !== slice.count) {
        throw new Error("Facility triangle count changed");
      }
      consumed.set(key, slice.start + slice.count);
      vertices += prepared.gltf.accessors[primitive.attributes.POSITION].count;
      indices += preparedIndices.length;
      const identity = JSON.stringify({ mesh: slice.meshIndex, primitive: slice.primitiveIndex, start: slice.start, count: slice.count });
      before.update(identity);
      after.update(identity);
      updateExpanded(before, source.gltf, source.binary, original, sourceIndices.get(key).subarray(slice.start, slice.start + slice.count));
      updateExpanded(after, prepared.gltf, prepared.binary, primitive, preparedIndices);
      inspected++;
    }
    if (vertices > limits.vertices || indices > limits.indices) {
      throw new Error("Facility chunk exceeds portable model limits");
    }
  }
  for (const [meshIndex, mesh] of source.gltf.meshes.entries()) {
    for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
      if (consumed.get(`${meshIndex}:${primitiveIndex}`) !== source.gltf.accessors[primitive.indices].count) {
        throw new Error("Facility triangle coverage is incomplete");
      }
    }
  }
  const originalDigest = before.digest("hex"), preparedDigest = after.digest("hex");
  if (inspected === 0 || originalDigest !== preparedDigest) {
    throw new Error("Facility expanded triangle attributes changed");
  }
  return { inspectedPrimitives: inspected, originalExpandedTriangleAttributesDigest: originalDigest, adaptedExpandedTriangleAttributesDigest: preparedDigest, sourceImageDigests: imageDigests };
}
