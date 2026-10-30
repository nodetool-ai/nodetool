import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";

const sourceRoot = new URL("../../../../../packages/game-runtime/samples/blacksite/", import.meta.url);
const source = await readFile(new URL("game.json", sourceRoot));
const game = JSON.parse(source);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const entries = Object.entries(game.assets);
if (entries.length === 0 || game.scenes.length === 0) {
  throw new Error("BLACKSITE inventory inspected no assets or scenes");
}

function inspectGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error("BLACKSITE model is not a GLB 2.0 file");
  }
  const length = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString("utf8"));
  const primitives = gltf.meshes.flatMap((mesh) => mesh.primitives);
  return {
    binaryChunkDigest: hash(bytes.subarray(20 + length)),
    vertices: primitives.reduce((sum, primitive) => sum + gltf.accessors[primitive.attributes.POSITION].count, 0),
    indices: primitives.reduce((sum, primitive) => sum + gltf.accessors[primitive.indices].count, 0),
    materials: gltf.materials,
    textures: gltf.textures ?? [],
    samplers: gltf.samplers ?? [],
    nodes: gltf.nodes,
    animations: (gltf.animations ?? []).map((animation) => ({
      name: animation.name ?? null,
      channels: animation.channels,
      samplers: animation.samplers
    }))
  };
}

const assets = [];
const assetFiles = await readdir(new URL("assets/", sourceRoot));
for (const [slot, asset] of entries) {
  const matches = assetFiles.filter((name) => name.startsWith(`${asset.assetId}.`));
  if (matches.length !== 1) {
    throw new Error(`BLACKSITE ${slot} must resolve to exactly one owned asset`);
  }
  const relativePath = `assets/${matches[0]}`;
  const bytes = await readFile(new URL(relativePath, sourceRoot));
  const digest = hash(bytes);
  if (digest !== asset.digest) {
    throw new Error(`BLACKSITE ${slot} digest differs from the source manifest`);
  }
  assets.push({
    slot,
    path: `packages/game-runtime/samples/blacksite/${relativePath}`,
    kind: asset.mediaKind,
    digest,
    size: bytes.length,
    ...(asset.mediaKind === "model" ? { model: inspectGlb(bytes) } : {})
  });
}

const componentNames = ["model", "primitive", "light3d", "decal3d", "particles", "animator3d", "audioSource", "camera3d", "body3d", "collider3d", "character3d"];
function inspectEntities(entities) {
  return entities.map((entity) => ({
    id: entity.id,
    ...(entity.parentId ? { parentId: entity.parentId } : {}),
    transform3d: entity.transform3d ?? {},
    ...(entity.tags ? { tags: entity.tags } : {}),
    ...Object.fromEntries(componentNames.filter((name) => entity[name]).map((name) => [name, entity[name]])),
    behaviors: (entity.behaviors ?? []).map((behavior) => ({
      ...Object.fromEntries(Object.entries(behavior).filter(([name]) => name !== "source")),
      ...(behavior.source ? {
        sourceDigest: hash(behavior.source),
        literalCommandKinds: [...new Set([...behavior.source.matchAll(/kind\s*:\s*["']([^"']+)["']/g)].map((match) => match[1]))].sort()
      } : {})
    }))
  }));
}

const route = await readFile(new URL("completion.inputs.json", sourceRoot));
const inventory = {
  source: "packages/game-runtime/samples/blacksite/game.json",
  sourceDigest: hash(source),
  legacyEngine: { schemaVersion: game.schemaVersion, engineVersion: game.engineVersion, dimension: game.dimension },
  presentation: game.presentation,
  inputActions: game.inputActions,
  inputAxes: game.inputAxes,
  route: {
    source: "packages/game-runtime/samples/blacksite/completion.inputs.json",
    digest: hash(route),
    ticks: JSON.parse(route).length,
    seed: 1,
    legacyAssertions: "packages/game-runtime/samples/blacksite/completion.assertions.json"
  },
  assets,
  scenes: game.scenes.map((scene) => ({
    id: scene.id,
    activeCameraId: scene.activeCameraId,
    environment: scene.environment,
    music: scene.music,
    entities: inspectEntities(scene.entities)
  })),
  prefabs: Object.fromEntries(Object.entries(game.prefabs).map(([name, prefab]) => [name, {
    rootId: prefab.rootId,
    entities: inspectEntities(prefab.entities)
  }])),
  ui: game.ui,
  audio: game.audio
};
const serialized = JSON.stringify(inventory, null, 2) + "\n";
const destination = process.argv[2];
if (destination) {
  await writeFile(destination, serialized);
  process.stdout.write(`Wrote BLACKSITE inventory to ${destination}\n`);
} else {
  process.stdout.write(serialized);
}
