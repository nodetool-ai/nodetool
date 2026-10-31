import { decodeGlb, encodeGlb, partitionFacility } from "../blacksite/lossless-glb.mjs";
import { createHash } from "node:crypto";

const componentSize = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]]);
const typeSize = new Map([["SCALAR", 1], ["VEC2", 2], ["VEC3", 3], ["VEC4", 4], ["MAT4", 16]]);
function accessorRows(gltf, binary, index) {
  const accessor = gltf.accessors[index], view = gltf.bufferViews[accessor?.bufferView];
  if (!accessor || accessor.sparse || !view || view.buffer !== 0) { throw new Error("Sunrush accessor requires one closed nonsparse buffer"); }
  const width = componentSize.get(accessor.componentType) * typeSize.get(accessor.type), stride = view.byteStride ?? width;
  const offset = accessor.byteOffset ?? 0, base = (view.byteOffset ?? 0) + offset;
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(accessor.count) || accessor.count < 1 || stride < width ||
      offset + (accessor.count - 1) * stride + width > view.byteLength || base + (accessor.count - 1) * stride + width > binary.length) { throw new Error("Sunrush accessor outside its declared view"); }
  return { accessor, width, row: index => binary.subarray(base + index * stride, base + index * stride + width) };
}
function indicesOf(gltf, binary, primitive) {
  const count = gltf.accessors[primitive.attributes.POSITION].count;
  if (primitive.indices === undefined) { return Array.from({ length: count }, (_, index) => index); }
  const rows = accessorRows(gltf, binary, primitive.indices), type = rows.accessor.componentType;
  if (rows.accessor.type !== "SCALAR" || ![5121, 5123, 5125].includes(type)) { throw new Error("Invalid Sunrush index accessor"); }
  return Array.from({ length: rows.accessor.count }, (_, index) => {
    const bytes = rows.row(index), value = type === 5121 ? bytes.readUInt8() : type === 5123 ? bytes.readUInt16LE() : bytes.readUInt32LE();
    if (value >= count) { throw new Error("Sunrush triangle index outside vertex accessor"); } return value;
  });
}

/** Hashes every expanded triangle attribute byte and immutable scene/material metadata. */
export function expandedSunrushDigest(bytes) {
  const { gltf, binary } = decodeGlb(bytes), digest = createHash("sha256");
  const { accessors, bufferViews, buffers, meshes, ...metadata } = gltf;
  digest.update(JSON.stringify(metadata));
  for (const mesh of meshes) {
    const { primitives, ...meshMetadata } = mesh; digest.update(JSON.stringify(meshMetadata));
    for (const primitive of primitives) {
      const { attributes, indices, ...primitiveMetadata } = primitive; digest.update(JSON.stringify(primitiveMetadata));
      const order = indicesOf(gltf, binary, primitive);
      for (const name of Object.keys(attributes).sort()) {
        const rows = accessorRows(gltf, binary, attributes[name]);
        digest.update(JSON.stringify({ name, componentType: rows.accessor.componentType, type: rows.accessor.type, normalized: rows.accessor.normalized ?? false }));
        for (const index of order) { digest.update(rows.row(index)); }
      }
    }
  }
  return digest.digest("hex");
}

/** Merges only identical complete attribute byte tuples, retaining first occurrence order. */
export function weldSunrushGeometry(bytes) {
  const { gltf, binary } = decodeGlb(bytes), parts = [binary];
  let length = binary.length, originalVertices = 0, weldedVertices = 0;
  const append = data => {
    const padding = Buffer.alloc((-length) & 3); parts.push(padding); length += padding.length;
    const index = gltf.bufferViews.length; gltf.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length });
    parts.push(data); length += data.length; return index;
  };
  for (const mesh of gltf.meshes) {
    for (const primitive of mesh.primitives) {
      if ((primitive.mode ?? 4) !== 4 || primitive.targets) { throw new Error("Sunrush weld requires triangles without morph targets"); }
      const names = Object.keys(primitive.attributes).sort(), rows = names.map(name => accessorRows(gltf, binary, primitive.attributes[name]));
      const count = gltf.accessors[primitive.attributes.POSITION].count;
      if (rows.some(value => value.accessor.count !== count)) { throw new Error("Sunrush attribute counts differ"); }
      const sourceIndices = indicesOf(gltf, binary, primitive);
      if (sourceIndices.length % 3) { throw new Error("Sunrush triangle indices must be divisible by three"); }
      const tuples = new Map(), sources = [], remap = new Uint32Array(count);
      for (let index = 0; index < count; index++) {
        const key = rows.map(value => value.row(index).toString("hex")).join(":");
        if (!tuples.has(key)) { tuples.set(key, sources.length); sources.push(index); }
        remap[index] = tuples.get(key);
      }
      for (const [index, name] of names.entries()) {
        const source = rows[index], data = Buffer.alloc(sources.length * source.width);
        for (const [target, vertex] of sources.entries()) { source.row(vertex).copy(data, target * source.width); }
        primitive.attributes[name] = gltf.accessors.length;
        gltf.accessors.push({ ...source.accessor, bufferView: append(data), byteOffset: 0, count: sources.length });
      }
      const data = Buffer.alloc(sourceIndices.length * 4);
      for (const [index, vertex] of sourceIndices.entries()) { data.writeUInt32LE(remap[vertex], index * 4); }
      primitive.indices = gltf.accessors.length;
      gltf.accessors.push({ bufferView: append(data), componentType: 5125, type: "SCALAR", count: sourceIndices.length });
      originalVertices += count; weldedVertices += sources.length;
    }
  }
  gltf.buffers[0].byteLength = length;
  const result = encodeGlb(gltf, Buffer.concat(parts)), before = expandedSunrushDigest(bytes), after = expandedSunrushDigest(result);
  if (before !== after) { throw new Error("Sunrush weld changed expanded attributes or scene metadata"); }
  return { bytes: result, originalVertices, weldedVertices, originalExpandedDigest: before, weldedExpandedDigest: after };
}

/** Adds explicit sequential indices without changing any source vertex bytes. */
export function indexSunrushTriangles(bytes) {
  const { gltf, binary } = decodeGlb(bytes), parts = [binary];
  let length = binary.length, added = 0;
  for (const mesh of gltf.meshes) {
    for (const primitive of mesh.primitives) {
      if (primitive.indices !== undefined) { continue; }
      if ((primitive.mode ?? 4) !== 4 || primitive.targets) { throw new Error("Sunrush indexing requires triangles without morph targets"); }
      const count = gltf.accessors[primitive.attributes.POSITION].count;
      if (count % 3) { throw new Error("Unindexed Sunrush triangle count must be divisible by three"); }
      const padding = Buffer.alloc((-length) & 3); parts.push(padding); length += padding.length;
      const indices = Buffer.alloc(count * 4);
      for (let index = 0; index < count; index++) { indices.writeUInt32LE(index, index * 4); }
      const view = gltf.bufferViews.length;
      gltf.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: indices.length });
      primitive.indices = gltf.accessors.length;
      gltf.accessors.push({ bufferView: view, componentType: 5125, count, type: "SCALAR", min: [0], max: [count - 1] });
      parts.push(indices); length += indices.length; added++;
    }
  }
  gltf.buffers[0].byteLength = length;
  return { bytes: encodeGlb(gltf, Buffer.concat(parts)), indexedPrimitives: added };
}

/** Reuses the audited triangle partitioner, preserving selected scenes and materials. */
export function partitionSunrushScenery(bytes, slot) {
  if (!/^[a-z0-9-]+$/.test(slot)) { throw new Error("Invalid Sunrush asset slot"); }
  const indexed = indexSunrushTriangles(bytes);
  const partition = partitionFacility(indexed.bytes);
  const images = partition.imageAssets.map((image, index) => ({ ...image, id: `${slot}-image-${index}`, uri: `${slot}-image-${index}.png` }));
  const chunks = partition.chunks.map((chunk, index) => {
    const { gltf, binary } = decodeGlb(chunk.bytes);
    for (const [imageIndex, image] of (gltf.images ?? []).entries()) { image.uri = images[imageIndex].uri; }
    return { ...chunk, id: `${slot}-chunk-${index}`, bytes: encodeGlb(gltf, binary) };
  });
  return { ...partition, chunks, imageAssets: images, indexedPrimitives: indexed.indexedPrimitives };
}
