import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gameDocument, gameDocument3D } from "@nodetool-ai/protocol";
import { validateAnyGame } from "@nodetool-ai/game-runtime";

const script = { kind: "script", source: "input => ({ state: (input.state || 0) + 1, commands: [] })", maxTickMs: 50 };
const imageId = "1".repeat(32);
const modelId = "2".repeat(32);
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr1sAAAAASUVORK5CYII=", "base64");
const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "Benchmark model", mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }] }));
const jsonLength = Math.ceil(json.length / 4) * 4;
const model = Buffer.alloc(28 + jsonLength + 36, 0);
model.writeUInt32LE(0x46546c67, 0); model.writeUInt32LE(2, 4); model.writeUInt32LE(model.length, 8);
model.writeUInt32LE(jsonLength, 12); model.writeUInt32LE(0x4e4f534a, 16);
model.fill(0x20, 20, 20 + jsonLength); json.copy(model, 20);
model.writeUInt32LE(36, 20 + jsonLength); model.writeUInt32LE(0x004e4942, 24 + jsonLength);
[0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => model.writeFloatLE(value, 28 + jsonLength + index * 4));
const digest = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const legacy = gameDocument.parse({ schemaVersion: 2, engineVersion: "1", id: "bench-2d-500", revision: "benchmark-1", entrySceneId: "bench",
  pixelsPerUnit: 16, inputActions: [], tickRate: 60, assets: { pixel: { assetId: imageId, digest: digest(image), width: 1, height: 1 } },
  scenes: [{ id: "bench", name: "2D benchmark", entities: [
    { id: "camera", transform2d: { x: 0, y: 0 }, camera2d: { width: 40, height: 24, zoom: 1 } },
    { id: "tiles", transform2d: { x: 0, y: 0 }, tilemap: { assetId: "pixel", tiles: Array.from({ length: 40 }, (_, index) => ({ x: index - 20, y: 10, width: 1, height: 1, solid: true })) } },
    ...Array.from({ length: 498 }, (_, index) => ({ id: `sprite-${index}`, transform2d: { x: index % 25 - 12, y: Math.floor(index / 25) - 10 }, sprite: { assetId: "pixel", width: 0.5, height: 0.5 }, behaviors: index < 32 ? [script] : [] }))
  ] }] });
const spatial = gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", inputActions: [], id: "bench-3d-1000", revision: "benchmark-1", entrySceneId: "bench", tickRate: 60,
  presentation: { aspectRatio: 16 / 9, hudWidth: 960, hudHeight: 540 }, assets: { triangle: { mediaKind: "model", assetId: modelId, digest: digest(model), bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 0 } }, nodeIds: ["Benchmark model"], clipIds: [], geometryBytes: 36, textureBytes: 0, triangles: 1 } },
  scenes: [{ id: "bench", name: "3D benchmark", activeCameraId: "camera", entities: [
    { id: "camera", transform3d: { position: { x: 0, y: 12, z: 45 } }, camera3d: { projection: { kind: "perspective", far: 200 } } },
    { id: "floor", transform3d: { position: { x: 0, y: -1, z: 0 } }, body3d: { type: "static" }, collider3d: { kind: "box", halfExtents: { x: 35, y: 0.5, z: 35 } } },
    { id: "sun", transform3d: {}, light3d: { kind: "directional", color: "#ffffff", intensity: 1, castShadow: false } },
    ...Array.from({ length: 997 }, (_, index) => ({ id: `object-${index}`, transform3d: { position: { x: (index % 32 - 16) * 1.5, y: 0, z: (Math.floor(index / 32) - 16) * 1.5 } },
      ...(index < 10 ? { model: { assetId: "triangle" } } : { primitive: { kind: "box", dimensions: { x: 0.5, y: 0.5, z: 0.5 } } }),
      ...(index < 100 ? { body3d: { type: "dynamic", gravityScale: 0 }, collider3d: { kind: "box", halfExtents: { x: 0.25, y: 0.25, z: 0.25 } } } : {}), behaviors: [] }))
  ] }] });
const scriptedSpatial = gameDocument3D.parse({ ...spatial, id: "bench-3d-64-scripted", scenes: spatial.scenes.map((scene) => ({ ...scene, name: "3D scripted benchmark", entities: scene.entities.slice(0, 64).map((entity, index) => ({ ...entity, behaviors: index >= 3 && index < 33 ? [script] : [] })) })) });
for (const document of [legacy, spatial, scriptedSpatial]) {
  const validation = validateAnyGame(document);
  if (!validation.valid) { throw new Error(validation.diagnostics.map((issue) => issue.message).join(", ")); }
  await writeFile(fileURLToPath(new URL(`./${document.id}.json`, import.meta.url)), JSON.stringify(document) + "\n");
}
await writeFile(fileURLToPath(new URL(`./assets/${imageId}.png`, import.meta.url)), image);
await writeFile(fileURLToPath(new URL(`./assets/${modelId}.glb`, import.meta.url)), model);
