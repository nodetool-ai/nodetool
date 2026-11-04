import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Color } from "three";
import { decodeGlb, encodeGlb } from "../blacksite/lossless-glb.mjs";
import { partitionSunrushScenery } from "../sunrush-kart/geometry.mjs";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const defaultSource = fileURLToPath(new URL("../../../../../packages/game-runtime/samples/signal-forge/", import.meta.url));
export const SIGNAL_FORGE_ASSET_LIMITS = Object.freeze({ file: 8 * 1024 * 1024, audio: 64 * 1024 * 1024, closure: 16 * 1024 * 1024, total: 256 * 1024 * 1024 });

/** Retain source roots and ancestors while hiding precisely the unselected meshes. */
export function selectSignalForgeModel(bytes, model) {
  const { gltf, binary } = decodeGlb(bytes);
  if (gltf.animations?.length || gltf.skins?.length || gltf.buffers.length !== 1 || gltf.buffers[0].uri) { throw new Error("Signal Forge model must be closed and static"); }
  const match = /^node:(0|[1-9][0-9]*)$/.exec(model.nodeId);
  if (!match || !gltf.nodes[Number(match[1])]) { throw new Error("Unknown Signal Forge selected node"); }
  const selected = new Set(), pending = [Number(match[1])];
  while (pending.length) {
    const id = pending.pop();
    if (selected.has(id)) { throw new Error("Signal Forge selected hierarchy is not a tree"); }
    const node = gltf.nodes[id];
    if (!node) { throw new Error("Signal Forge selected child is missing"); }
    selected.add(id); pending.push(...(node.children ?? []));
  }
  const meshes = [], meshMap = new Map();
  for (const [index, node] of gltf.nodes.entries()) {
    if (!selected.has(index)) { delete node.mesh; continue; }
    if (node.mesh === undefined) { continue; }
    if (!meshMap.has(node.mesh)) { meshMap.set(node.mesh, meshes.length); meshes.push(gltf.meshes[node.mesh]); }
    node.mesh = meshMap.get(node.mesh);
  }
  if (!meshes.length || meshes.some(mesh => !mesh)) { throw new Error("Signal Forge selected node has no meshes"); }
  gltf.meshes = meshes;
  if (model.material) {
    const override = model.material;
    for (const material of gltf.materials ?? []) {
      material.pbrMetallicRoughness ??= {};
      const pbr = material.pbrMetallicRoughness;
      const color = [...(pbr.baseColorFactor ?? [1, 1, 1, 1])];
      if (override.color !== undefined) { const value = new Color(override.color); color.splice(0, 3, value.r, value.g, value.b); }
      if (override.opacity !== undefined) { color[3] = override.opacity; }
      pbr.baseColorFactor = color;
      if (override.metalness !== undefined) { pbr.metallicFactor = override.metalness; }
      if (override.roughness !== undefined) { pbr.roughnessFactor = override.roughness; }
      if (override.emissive !== undefined) { const value = new Color(override.emissive); material.emissiveFactor = [value.r, value.g, value.b]; }
      if (override.alphaMode !== undefined) { material.alphaMode = override.alphaMode.toUpperCase(); }
      if (override.alphaMode === "mask" && override.alphaCutoff !== undefined) { material.alphaCutoff = override.alphaCutoff; }
    }
  }
  return { bytes: encodeGlb(gltf, binary), selectedNodes: [...selected], selectedMeshes: meshes.length };
}

export async function prepareSignalForgeAssets(outputDirectory, { sourceDirectory = defaultSource } = {}) {
  const output = resolve(outputDirectory), input = resolve(sourceDirectory);
  const sourceBytes = await readFile(resolve(input, "game.json")), source = JSON.parse(sourceBytes);
  const names = await readdir(resolve(input, "assets"));
  const originals = new Map();
  for (const [slot, binding] of Object.entries(source.assets)) {
    const matches = names.filter(name => name.startsWith(`${binding.assetId}.`));
    if (matches.length !== 1) { throw new Error(`Expected one closed Signal Forge source asset: ${slot}`); }
    const bytes = await readFile(resolve(input, "assets", matches[0]));
    if (sha256(bytes) !== binding.digest) { throw new Error(`Signal Forge source digest mismatch: ${slot}`); }
    originals.set(slot, { bytes, name: matches[0], binding });
  }
  if (originals.size !== 11) { throw new Error("Signal Forge must inspect all eleven original assets"); }
  await mkdir(resolve(output, "assets"), { recursive: true });
  const assets = [], byId = new Map(), modelParts = {}, colliders = {};
  const provenance = { source: "packages/game-runtime/samples/signal-forge/game.json", sourceDigest: sha256(sourceBytes), originals: [...originals].map(([slot, value]) => ({ slot, digest: value.binding.digest, size: value.bytes.length })), models: [] };
  let total = 0;
  const register = async (id, name, bytes, kind, dependencies = []) => {
    const asset = { id, kind, path: `assets/${name}`, size: bytes.length, digest: sha256(bytes), dependencies };
    if (byId.has(id)) {
      if (JSON.stringify(byId.get(id)) !== JSON.stringify(asset)) { throw new Error(`Signal Forge prepared asset identity collision: ${id}`); }
      return;
    }
    if (asset.size > (kind === "audio" ? SIGNAL_FORGE_ASSET_LIMITS.audio : SIGNAL_FORGE_ASSET_LIMITS.file)) { throw new Error(`Signal Forge prepared file exceeds native admission: ${id}`); }
    if (total + asset.size > SIGNAL_FORGE_ASSET_LIMITS.total) { throw new Error("Signal Forge aggregate byte budget exceeded"); }
    await writeFile(resolve(output, asset.path), bytes, { flag: "wx" });
    total += asset.size; assets.push(asset); byId.set(id, asset);
  };
  for (const [slot, { bytes, name, binding }] of originals) {
    if (binding.mediaKind === "model") { continue; }
    if (binding.mediaKind === "audio" && (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE")) { throw new Error(`Signal Forge audio is not its original WAV: ${slot}`); }
    if (binding.mediaKind === "collider") { colliders[slot] = JSON.parse(bytes); }
    await register(slot, name, bytes, binding.mediaKind);
  }
  for (const entity of source.scenes.flatMap(scene => scene.entities).filter(entity => entity.model)) {
    const original = originals.get(entity.model.assetId);
    if (!original || original.binding.mediaKind !== "model") { throw new Error(`Unknown Signal Forge model binding: ${entity.id}`); }
    const selection = selectSignalForgeModel(original.bytes, entity.model);
    const partition = partitionSunrushScenery(selection.bytes, entity.model.assetId);
    for (const image of partition.imageAssets) { await register(image.id, image.uri, image.bytes, "image"); }
    const dependencies = partition.imageAssets.map(image => image.id);
    modelParts[entity.id] = [];
    for (const [index, chunk] of partition.chunks.entries()) {
      const id = `${entity.id}-part-${index}`;
      await register(id, `${id}.glb`, chunk.bytes, "model", dependencies);
      const closure = chunk.bytes.length + partition.imageAssets.reduce((sum, image) => sum + image.bytes.length, 0);
      if (closure > SIGNAL_FORGE_ASSET_LIMITS.closure) { throw new Error(`Signal Forge model closure exceeds native admission: ${id}`); }
      modelParts[entity.id].push(id);
    }
    provenance.models.push({ entityId: entity.id, sourceSlot: entity.model.assetId, sourceNodeId: entity.model.nodeId, selectedNodes: selection.selectedNodes, materialOverride: entity.model.material ?? null, originalSelectedIndices: partition.originalIndices, preparedIndices: partition.chunks.reduce((sum, chunk) => sum + chunk.indices, 0), originalExpandedTriangleAttributesDigest: partition.originalExpandedTriangleAttributesDigest, preparedExpandedTriangleAttributesDigest: partition.adaptedExpandedTriangleAttributesDigest, images: partition.sourceImageDigests, chunks: partition.chunks.map(({ vertices, indices, slices }, index) => ({ id: modelParts[entity.id][index], vertices, indices, slices })) });
  }
  if (provenance.models.length !== 17 || assets.length === 0) { throw new Error("Signal Forge model inventory was not fully inspected"); }
  await writeFile(resolve(output, "native-assets.json"), JSON.stringify(assets, null, 2) + "\n", { flag: "wx" });
  await writeFile(resolve(output, "asset-provenance.json"), JSON.stringify(provenance, null, 2) + "\n", { flag: "wx" });
  return { source, assets, modelParts, colliders, provenance };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4 || process.argv[2] !== "--out") { throw new Error("Usage: node prepare-assets.mjs --out <empty-directory>"); }
  const result = await prepareSignalForgeAssets(process.argv[3]);
  process.stdout.write(JSON.stringify({ assets: result.assets.length, models: result.provenance.models.length, modelParts: result.modelParts }) + "\n");
}
