import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodeGlb, encodeGlb, partitionFacility, verifyFacilityPartition } from "./lossless-glb.mjs";

test("portable BLACKSITE chunks preserve actual expanded triangle attributes and reject altered bytes", async () => {
  const source = await readFile(new URL("../../../../../packages/game-runtime/samples/blacksite/assets/accaba3a436c4d11b334fe5a5ad07006.glb", import.meta.url));
  const partition = partitionFacility(source);
  const images = new Map(partition.imageAssets.map((image) => [image.uri, image.bytes]));
  const verified = verifyFacilityPartition(source, partition.chunks, images);
  assert.equal(partition.originalIndices, 714156);
  assert.equal(partition.chunks.reduce((sum, chunk) => sum + chunk.indices, 0), partition.originalIndices);
  assert.equal(verified.originalExpandedTriangleAttributesDigest, verified.adaptedExpandedTriangleAttributesDigest);
  assert.ok(verified.inspectedPrimitives > 0);
  assert.ok(partition.chunks.every((chunk) => chunk.vertices <= 50000 && chunk.indices <= 150000));

  const changed = partition.chunks.map((chunk) => ({ ...chunk, bytes: Buffer.from(chunk.bytes) }));
  const first = decodeGlb(changed[0].bytes);
  const primitive = first.gltf.meshes[0].primitives[0];
  const accessor = first.gltf.accessors[primitive.attributes.POSITION];
  const view = first.gltf.bufferViews[accessor.bufferView];
  first.binary[(view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)] ^= 1;
  changed[0].bytes = encodeGlb(first.gltf, first.binary);
  assert.throws(() => verifyFacilityPartition(source, changed, images), /expanded triangle attributes changed/);

  const alteredMaterial = partition.chunks.map((chunk) => ({ ...chunk }));
  const model = decodeGlb(alteredMaterial[0].bytes);
  model.gltf.materials[0].emissiveFactor = [1, 0, 0];
  alteredMaterial[0].bytes = encodeGlb(model.gltf, model.binary);
  assert.throws(() => verifyFacilityPartition(source, alteredMaterial, images), /materials changed/);
  const changedImages = new Map(images);
  const firstImage = Buffer.from(partition.imageAssets[0].bytes);
  firstImage[0] ^= 1;
  changedImages.set(partition.imageAssets[0].uri, firstImage);
  assert.throws(() => verifyFacilityPartition(source, partition.chunks, changedImages), /image bytes changed/);
  assert.throws(() => verifyFacilityPartition(source, partition.chunks, new Map()), /closed dependency/);
  assert.throws(() => verifyFacilityPartition(source, []), /coverage is incomplete/);
});
