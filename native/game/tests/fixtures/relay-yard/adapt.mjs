import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CapsuleGeometry, Color } from "three";
import { nativeGame3dDocument } from "@nodetool-ai/protocol/native-game";
import { executeRelayScript, relayTrigger, relayCamera, relayController } from "./bindings.mjs";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const xyz = value => [value.x, value.y, value.z];
export const nativeId = id => /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(id) ? id : `ry-hex-${Buffer.from(id).toString("hex")}`;
const material = value => ({ ...value });

function capsuleAsset(primitive) {
  const size = primitive.dimensions;
  const geometry = new CapsuleGeometry(size.x / 2, Math.max(0, size.y - size.x), 8, 16);
  geometry.scale(1, 1, size.z / size.x);
  const chunks = [], views = [], accessors = [];
  let length = 0;
  const add = (array, type, componentType, count) => {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const padding = Buffer.alloc((-length) & 3); chunks.push(padding); length += padding.length;
    const bufferView = views.length; views.push({ buffer: 0, byteOffset: length, byteLength: bytes.length }); chunks.push(bytes); length += bytes.length;
    accessors.push({ bufferView, componentType, count, type }); return accessors.length - 1;
  };
  const positions = geometry.getAttribute("position").array, normals = geometry.getAttribute("normal").array, uv = geometry.getAttribute("uv").array, indices = geometry.index.array;
  const p = add(positions, "VEC3", 5126, positions.length / 3), n = add(normals, "VEC3", 5126, normals.length / 3), t = add(uv, "VEC2", 5126, uv.length / 2), i = add(indices, "SCALAR", indices.BYTES_PER_ELEMENT === 2 ? 5123 : 5125, indices.length);
  const color = new Color(primitive.material.color), m = primitive.material;
  const json = { asset: { version: "2.0", generator: "Relay Yard native fixture / Three CapsuleGeometry" }, buffers: [{ byteLength: length }], bufferViews: views, accessors,
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [color.r, color.g, color.b, m.opacity], metallicFactor: m.metalness, roughnessFactor: m.roughness }, alphaMode: m.alphaMode.toUpperCase(), alphaCutoff: m.alphaCutoff }],
    meshes: [{ primitives: [{ attributes: { POSITION: p, NORMAL: n, TEXCOORD_0: t }, indices: i, material: 0 }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 };
  const encoded = Buffer.from(JSON.stringify(json)), jsonChunk = Buffer.concat([encoded, Buffer.alloc((-encoded.length) & 3, 32)]), binary = Buffer.concat([...chunks, Buffer.alloc((-length) & 3)]);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonChunk.length + binary.length, 8); header.writeUInt32LE(jsonChunk.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  const result = { bytes: Buffer.concat([header, jsonChunk, binHeader, binary]), positionsDigest: sha256(Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength)), indicesDigest: sha256(Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength)), vertices: positions.length / 3, indices: indices.length };
  geometry.dispose(); return result;
}

export function adaptRelayYard(source) {
  if (source.scenes.length !== 1 || Object.keys(source.assets).length) { throw new Error("Relay Yard fixture must remain one asset-free source scene"); }
  const scene = source.scenes[0], idMap = Object.fromEntries(scene.entities.map(entity => [entity.id, nativeId(entity.id)]));
  if (new Set(Object.values(idMap)).size !== scene.entities.length) { throw new Error("Relay Yard entity-ID mapping is ambiguous"); }
  const sourceCamera = scene.entities.find(entity => entity.id === "camera"), follow = sourceCamera.camera3d.behavior;
  const player = scene.entities.find(entity => entity.id === "player"), capsule = scene.entities.find(entity => entity.id === "player-visual"), generated = capsuleAsset(capsule.primitive);
  const scripts = [], entities = [], originalScripts = [], helpers = [], roles = [], triggers = [], functions = [];
  const config = { cells: scene.entities.filter(entity => entity.behaviors.some(behavior => behavior.kind === "collectible")).map(entity => idMap[entity.id]), count: player.behaviors.find(behavior => behavior.kind === "winWhenCollected").count, speed: player.character3d.speed, acceleration: player.character3d.acceleration, sensitivity: follow.sensitivity };
  config.playerId = idMap.player; config.cameraId = idMap.camera; config.idMap = idMap;
  const hud = [
    ["title", "RELAY YARD", 24, 32, 26, "#eef5ff", "left"], ["score", "Collect the two amber cells", 24, 61, 17, "#ffd273", "left"],
    ["win", "Follow the amber line through the blue gate.", 24, 86, 14, "#c1d4ea", "left"], ["checkpoint-status", "CHECKPOINT AHEAD", 936, 32, 14, "#67e7c5", "right"],
    ["stations", "LEFT: STEPS + LIFT     RIGHT: RAMP + CRATE", 480, 475, 14, "#c1d4ea", "center"], ["help", "WASD / arrows: move     Space: jump     R: respawn     Drag: camera", 480, 510, 15, "#eef5ff", "center"]
  ].map(([id, text, x, y, size, color, align]) => ({ kind: "text", id, text, size, color, align, anchor: { x: 0, y: 0 }, pivot: { x: align === "right" ? 1 : align === "center" ? .5 : 0, y: 0 }, offset: { x, y } }));
  for (const original of scene.entities) {
    const admitted = new Set(["id", "name", "templateOnly", "transform3d", "parentId", "primitive", "light3d", "camera3d", "character3d", "body3d", "collider3d", "interactionActor", "behaviors"]);
    for (const key of Object.keys(original)) { if (!admitted.has(key)) { throw new Error(`Unmapped Relay Yard component: ${key}`); } }
    const entity = { id: idMap[original.id], name: original.name || original.id, transform: { position: xyz(original.transform3d.position), rotation: original.transform3d.rotation, scale: xyz(original.transform3d.scale) }, props: { sourceEntityId: original.id }, behaviors: [] };
    if (original.parentId) { entity.parentId = idMap[original.parentId]; }
    if (original.primitive) {
      const p = original.primitive;
      entity.visual = p.kind === "capsule" ? { kind: "model", assetId: "relay-player-capsule", castShadow: p.castShadow, receiveShadow: p.receiveShadow } : { kind: "primitive", shape: p.kind, size: xyz(p.dimensions), material: material(p.material), castShadow: p.castShadow, receiveShadow: p.receiveShadow };
    }
    if (original.light3d) { entity.light3d = structuredClone(original.light3d); }
    if (original.character3d) { const c = original.character3d; entity.character = { speed: c.speed, jumpSpeed: c.jumpSpeed, maxSlopeDegrees: c.slopeLimit, stepHeight: c.stepHeight }; }
    else if (original.body3d) { entity.body = { type: original.body3d.type, mass: original.body3d.mass ?? 1, velocity: xyz(original.body3d.velocity) }; }
    let physical = entity;
    if (original.collider3d) {
      const c = original.collider3d;
      if (xyz(c.offset).some(value => value !== 0)) {
        physical = { id: `${entity.id}-sensor-offset`, name: `${original.id} offset sensor`, transform: { ...entity.transform, position: entity.transform.position.map((value, index) => value + xyz(c.offset)[index]) }, body: entity.body, props: { sourceColliderOwner: original.id, generatedHelper: "collider-offset" }, behaviors: [] };
        delete entity.body; helpers.push(physical.id);
      }
      physical.collider = { shape: c.kind, ...(c.kind === "box" ? { halfExtents: xyz(c.halfExtents) } : c.kind === "capsule" ? { radius: c.radius, halfHeight: c.halfHeight } : { radius: c.radius }), sensor: c.sensor, layer: original.character3d ? 1 : c.sensor ? 2 : 0, mask: c.sensor ? 2 : c.mask };
    }
    for (const behavior of original.behaviors) {
      if (behavior.kind === "script") {
        roles.push({ id: original.id, entityId: entity.id }); functions.push(`${JSON.stringify(original.id)}:(${behavior.source})`);
        originalScripts.push({ entityId: original.id, scriptId: "relay-controller", digest: sha256(behavior.source) });
      } else if (behavior.kind === "collectible") { physical.gameplay = { collectible: true, scoreValue: behavior.score }; }
      else if (behavior.kind === "trigger") {
        triggers.push({ entityId: physical.id, event: behavior.event });
      } else if (behavior.kind !== "winWhenCollected") { throw new Error(`Unmapped Relay Yard behavior: ${behavior.kind}`); }
    }
    if (original.camera3d) {
      entity.camera3d = { projection: original.camera3d.projection, behavior: { kind: "fixed" } };
      const pivot = "native-camera-orbit-pivot";
      const cameraConfig = { ...follow, player: idMap.player, pivot, offset: xyz(follow.offset), lookAtOffset: xyz(follow.lookAtOffset) };
      entity.parentId = pivot;
      entity.transform.position = xyz(follow.offset);
      entities.push({ id: pivot, parentId: idMap.player, props: { generatedHelper: "camera-orbit-pivot", sourceCameraOwner: original.id } }); helpers.push(pivot);
      const angle = Math.atan2(3.3, 7.5); entity.transform.rotation = [-Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
      config.camera = cameraConfig;
    }
    entities.push(entity); if (physical !== entity) { entities.push(physical); }
  }
  config.roles = roles; config.triggers = triggers;
  scripts.push({ id: "relay-controller", source: `i => (${relayController.toString()})(i, {${functions.join(",")}}, (${executeRelayScript.toString()}), (${relayCamera.toString()}), (${relayTrigger.toString()}), ${JSON.stringify(config)})` });
  entities.find(entity => entity.id === idMap.player).behaviors.push({ id: "controller", scriptId: "relay-controller", maxCommands: 16, maxTickMs: 20 });
  const environment = { ...scene.environment, sky: { kind: "color" }, postProcessing: { enabled: true, toneMapping: "agx", antialias: "smaa", exposure: 1 } };
  const document = nativeGame3dDocument.parse({ schemaVersion: 4, engine: "native-cpp-1", dimension: "3d", id: "relay-yard-native", title: "Relay Yard", initialSceneId: scene.id,
    presentation: source.presentation, ui: { nodes: hud }, inputActions: [{ id: "jump", bindings: ["Space"] }, { id: "respawn", bindings: ["KeyR"] }, { id: "forward", bindings: ["KeyW", "ArrowUp"] }, { id: "backward", bindings: ["KeyS", "ArrowDown"] }, { id: "left", bindings: ["KeyA", "ArrowLeft"] }, { id: "right", bindings: ["KeyD", "ArrowRight"] }],
    scripts, scenes: [{ id: scene.id, name: scene.name, activeCameraId: idMap.camera, environment, entities }],
    assets: [{ id: "relay-player-capsule", kind: "model", path: "player-capsule.glb", size: generated.bytes.length, digest: sha256(generated.bytes), dependencies: [] }] });
  return { document, files: new Map([["player-capsule.glb", generated.bytes]]), provenance: { sourceDigest: sha256(JSON.stringify(source)), idMap, reverseIdMap: Object.fromEntries(Object.entries(idMap).map(([a, b]) => [b, a])), sourceEntities: scene.entities.length, sourceVisuals: scene.entities.filter(entity => entity.primitive).length, helpers, originalScripts, nativeBehaviorCallsPerTick: 1, previousNativeBehaviorCallsPerTick: 8, capsule: { ...generated, bytes: undefined }, limits: ["Native ray queries cannot reproduce the legacy sphere camera-occlusion sweep (radius 0.2). Follow/orbit is preserved without camera obstruction correction.", "Native environment requires explicit AgX/SMAA; source had implicit legacy tone mapping. Source background, ambient, shadows and sun are retained.", "Jolt controller replaces Rapier ground snapping, coyote and jump-buffer internals; speed/acceleration/jump/slope/step settings are mapped where admitted.", "Native setPosition drives the original kinematic target formula; exact legacy platform carry and per-body damping/friction are not asserted."] } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = resolve(process.argv[2]); await mkdir(out, { recursive: true });
  const sourcePath = new URL("../../../../../packages/game-runtime/samples/relay-yard/game.json", import.meta.url), raw = await readFile(sourcePath);
  const adapted = adaptRelayYard(JSON.parse(raw));
  await writeFile(resolve(out, "game.json"), JSON.stringify(adapted.document, null, 2) + "\n");
  for (const [path, bytes] of adapted.files) { await writeFile(resolve(out, path), bytes); }
  await writeFile(resolve(out, "provenance.json"), JSON.stringify({ ...adapted.provenance, sourceFileDigest: sha256(raw) }, null, 2) + "\n");
  console.log(JSON.stringify({ out, entities: adapted.document.scenes[0].entities.length, visuals: adapted.provenance.sourceVisuals, assets: adapted.document.assets }));
}
