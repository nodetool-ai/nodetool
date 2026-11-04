import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Color } from "three";
import { decodeGlb } from "../blacksite/lossless-glb.mjs";
import { prepareSignalForgeAssets, selectSignalForgeModel, sha256, SIGNAL_FORGE_ASSET_LIMITS } from "./prepare-assets.mjs";

const sourceRoot = new URL("../../../../../packages/game-runtime/samples/signal-forge/", import.meta.url);
const sourceBytes = await readFile(new URL("game.json", sourceRoot));
const source = JSON.parse(sourceBytes);
const sourceModel = await readFile(new URL(`assets/${source.assets["forge-crafted"].assetId}.glb`, sourceRoot));

test("selected models retain source ancestors and exact selected geometry without rendering sibling models", () => {
  const model = source.scenes[0].entities.find(entity => entity.id === "courier-model").model;
  const selected = selectSignalForgeModel(sourceModel, model);
  const original = decodeGlb(sourceModel).gltf, prepared = decodeGlb(selected.bytes).gltf;
  assert.deepEqual(selected.selectedNodes, [16, 23, 22, 21, 20, 19, 18, 17]);
  assert.deepEqual(prepared.scenes, original.scenes);
  assert.equal(prepared.scene, original.scene);
  assert.equal(prepared.nodes.length, original.nodes.length);
  assert.ok(prepared.meshes.length > 0 && prepared.meshes.length < original.meshes.length);
  for (const [index, node] of original.nodes.entries()) {
    const { mesh, ...metadata } = node;
    const { mesh: preparedMesh, ...preparedMetadata } = prepared.nodes[index];
    assert.deepEqual(preparedMetadata, metadata);
    if (mesh !== undefined && selected.selectedNodes.includes(index)) { assert.deepEqual(prepared.meshes[preparedMesh], original.meshes[mesh]); }
    else { assert.equal(preparedMesh, undefined); }
  }
});

test("baked material overrides match the original instance's linear color and preserve textures", () => {
  const model = source.scenes[0].entities.find(entity => entity.id === "repulsor-field").model;
  const selected = decodeGlb(selectSignalForgeModel(sourceModel, model).bytes).gltf;
  const original = decodeGlb(sourceModel).gltf;
  const color = new Color(model.material.color), emissive = new Color(model.material.emissive);
  assert.ok(selected.materials.length > 0);
  for (const [index, material] of selected.materials.entries()) {
    assert.deepEqual(material.pbrMetallicRoughness.baseColorFactor, [color.r, color.g, color.b, model.material.opacity]);
    assert.deepEqual(material.emissiveFactor, [emissive.r, emissive.g, emissive.b]);
    assert.equal(material.alphaMode, "BLEND");
    assert.deepEqual(material.pbrMetallicRoughness.baseColorTexture, original.materials[index].pbrMetallicRoughness?.baseColorTexture);
    assert.deepEqual(material.normalTexture, original.materials[index].normalTexture);
    assert.deepEqual(material.extensions, original.materials[index].extensions);
  }
});

test("unknown selected nodes are rejected instead of falling back to the whole model", () => {
  assert.throws(() => selectSignalForgeModel(sourceModel, { nodeId: "node:999999" }), /Unknown .* selected node/);
  assert.throws(() => selectSignalForgeModel(sourceModel, { nodeId: "node:-1" }), /Unknown .* selected node/);
  assert.throws(() => selectSignalForgeModel(sourceModel, { nodeId: "node:0x10" }), /Unknown .* selected node/);
});

test("full original preparation preserves all audio and selected triangles inside unchanged native budgets", async () => {
  const output = await mkdtemp(join(tmpdir(), "signal-forge-assets-"));
  try {
    const result = await prepareSignalForgeAssets(output);
    const byId = new Map(result.assets.map(asset => [asset.id, asset]));
    assert.equal(result.provenance.models.length, 17);
    assert.equal(result.provenance.originals.length, 11);
    assert.equal(byId.size, result.assets.length);
    assert.equal(Object.keys(result.modelParts).length, 17);
    assert.ok(result.assets.length > 0);
    assert.ok(result.assets.reduce((sum, asset) => sum + asset.size, 0) <= SIGNAL_FORGE_ASSET_LIMITS.total);
    for (const asset of result.assets) {
      const bytes = await readFile(join(output, asset.path));
      assert.equal(bytes.length, asset.size);
      assert.equal(sha256(bytes), asset.digest);
      assert.ok(asset.size <= (asset.kind === "audio" ? SIGNAL_FORGE_ASSET_LIMITS.audio : SIGNAL_FORGE_ASSET_LIMITS.file));
      if (asset.kind === "model") {
        assert.ok(asset.dependencies.length > 0);
        assert.ok(asset.size + asset.dependencies.reduce((sum, id) => sum + byId.get(id).size, 0) <= SIGNAL_FORGE_ASSET_LIMITS.closure);
        const prepared = decodeGlb(bytes).gltf;
        assert.equal(prepared.buffers.length, 1);
        assert.equal(prepared.buffers[0].uri, undefined);
        assert.ok(prepared.images.every(image => asset.dependencies.some(id => byId.get(id).path === `assets/${image.uri}`)));
      }
    }
    for (const model of result.provenance.models) {
      assert.ok(model.originalSelectedIndices > 0);
      assert.equal(model.originalSelectedIndices, model.preparedIndices);
      assert.equal(model.originalExpandedTriangleAttributesDigest, model.preparedExpandedTriangleAttributesDigest);
      assert.ok(model.chunks.every(chunk => chunk.vertices <= 50_000 && chunk.indices <= 150_000));
      assert.deepEqual(model.chunks.map(chunk => chunk.id), result.modelParts[model.entityId]);
    }
    for (const [slot, binding] of Object.entries(source.assets).filter(([, binding]) => binding.mediaKind !== "model")) {
      assert.equal(byId.get(slot).digest, binding.digest);
      if (binding.mediaKind === "audio") {
        const bytes = await readFile(join(output, byId.get(slot).path));
        assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
        assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
      }
    }
    assert.deepEqual(result.colliders["forge-static-collisions"], JSON.parse(await readFile(new URL(`assets/${source.assets["forge-static-collisions"].assetId}.json`, sourceRoot))));
    assert.ok(sourceModel.length > SIGNAL_FORGE_ASSET_LIMITS.file, "copying the original GLB would fail existing per-file admission");
    assert.equal(sha256(await readFile(new URL("game.json", sourceRoot))), sha256(sourceBytes));
    assert.equal(sha256(await readFile(new URL(`assets/${source.assets["forge-crafted"].assetId}.glb`, sourceRoot))), sha256(sourceModel));
    await assert.rejects(prepareSignalForgeAssets(output), /EEXIST/);
  } finally { await rm(output, { recursive: true, force: true }); }
});

test("a modified owned source fails its pinned digest before preparation", async () => {
  const root = await mkdtemp(join(tmpdir(), "signal-forge-invalid-"));
  try {
    const input = join(root, "source"), assets = join(input, "assets");
    await mkdir(assets, { recursive: true });
    await writeFile(join(input, "game.json"), sourceBytes);
    for (const [slot, binding] of Object.entries(source.assets)) {
      const extension = binding.mediaKind === "model" ? "glb" : binding.mediaKind === "audio" ? "wav" : "json";
      const name = `${binding.assetId}.${extension}`;
      if (slot === "forge-crafted") { await writeFile(join(assets, name), Buffer.from("corrupted source")); }
      else { await symlink(new URL(`assets/${name}`, sourceRoot), join(assets, name)); }
    }
    await assert.rejects(prepareSignalForgeAssets(join(root, "out"), { sourceDirectory: input }), /source digest mismatch: forge-crafted/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
