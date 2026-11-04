import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { nativeGame3dDocument } from "@nodetool-ai/protocol/native-game";
import { executeSignalScript, signalAudio, signalController } from "./bindings.mjs";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const xyz = v => [v.x, v.y, v.z];

export function createSignalForgeDocument(source, prepared) {
  const scene = source.scenes[0], scripts = [], entities = [], originalScripts = [], omitted = [];
  const camera = scene.entities.find(e => e.camera3d).camera3d;
  const actor = scene.entities.find(e => e.id === "courier");
  const configuration = { speed: actor.character3d.speed, acceleration: actor.character3d.acceleration, camera: { ...camera.behavior, offset: xyz(camera.behavior.offset), lookAtOffset: xyz(camera.behavior.lookAtOffset) } };
  for (const original of scene.entities) {
    const entity = { id: original.id, name: original.name || original.id, ...(original.parentId ? { parentId: original.parentId } : {}), transform: { position: xyz(original.transform3d.position), rotation: original.transform3d.rotation, scale: xyz(original.transform3d.scale) }, props: { ...original.props, sourceEntityId: original.id, ...(original.tags ? { sourceTags: original.tags } : {}) }, behaviors: [], assetIds: [] };
    if (original.body3d) { entity.body = { type: original.body3d.type, mass: original.body3d.mass ?? 1, velocity: xyz(original.body3d.velocity) }; }
    if (original.collider3d) {
      const c = original.collider3d;
      if (c.kind === "triangleMesh") {
        const mesh = prepared.colliders[c.assetId];
        if (!mesh || mesh.vertices.length % 3) { throw new Error(`Missing collider mesh ${c.assetId}`); }
        entity.collider = { shape: "mesh", vertices: Array.from({ length: mesh.vertices.length / 3 }, (_, i) => mesh.vertices.slice(i * 3, i * 3 + 3)), indices: mesh.indices, sensor: false, layer: 0, mask: 65535 };
      } else {
        entity.collider = { shape: c.kind, ...(c.kind === "box" ? { halfExtents: xyz(c.halfExtents) } : c.kind === "sphere" ? { radius: c.radius } : { radius: c.radius, halfHeight: c.halfHeight }), sensor: c.sensor, layer: original.character3d ? 1 : c.sensor ? 2 : 0, mask: c.sensor ? 2 : c.mask };
      }
    }
    if (original.character3d) {
      delete entity.body;
      entity.character = { speed: original.character3d.speed, jumpSpeed: original.character3d.jumpSpeed, maxSlopeDegrees: original.character3d.slopeLimit, stepHeight: original.character3d.stepHeight };
      entity.gameplay = { health: 100 };
    }
    for (const field of ["light3d", "particles"]) {
      if (original[field]) { entity[field] = structuredClone(original[field]); }
    }
    if (entity.particles) { for (const emitter of entity.particles.emitters) { if (emitter.onDeath?.length) { throw new Error("Unexpected particle death chain"); } delete emitter.onDeath; } }
    if (original.camera3d) {
      entity.parentId = "native-camera-pivot"; entity.transform.position = xyz(camera.behavior.offset);
      const direction = xyz(camera.behavior.lookAtOffset).map((v, i) => v - entity.transform.position[i]);
      const yaw = Math.atan2(-direction[0], -direction[2]), pitch = Math.asin(direction[1] / Math.hypot(...direction));
      entity.transform.rotation = [Math.cos(yaw / 2) * Math.sin(pitch / 2), Math.sin(yaw / 2) * Math.cos(pitch / 2), -Math.sin(yaw / 2) * Math.sin(pitch / 2), Math.cos(yaw / 2) * Math.cos(pitch / 2)];
      entity.camera3d = { projection: original.camera3d.projection, behavior: { kind: "fixed" } };
    }
    for (const [i, behavior] of original.behaviors.entries()) {
      if (behavior.kind === "script") {
        const scriptId = `forge-${original.id}-${i}`;
        const config = { ...configuration, player: original.id === "courier" };
        scripts.push({ id: scriptId, source: `(native)=>{const original=(input,world)=>(${behavior.source})(input);return (${executeSignalScript.toString()})(native,original,${JSON.stringify(config)});}` });
        entity.behaviors.push({ id: `role-${i}`, scriptId, maxCommands: 16, maxTickMs: 20 });
        originalScripts.push({ entityId: original.id, sourceDigest: sha256(behavior.source), sourceBytes: Buffer.byteLength(behavior.source), scriptId });
      } else if (behavior.kind === "collectible") { entity.gameplay = { collectible: true, scoreValue: behavior.score }; }
      else if (behavior.kind !== "winWhenCollected") { throw new Error(`Unmapped Signal Forge behavior ${behavior.kind}`); }
    }
    if (original.id.startsWith("flywheel-") && original.body3d) { entity.body.type = "kinematic"; omitted.push({ entityId: original.id, component: "dynamic angular torque", reason: "Native angular impulse and per-body gravity scale are unavailable; decorative flywheel remains fixed." }); }
    if (original.id === "repulsor-field") { omitted.push({ entityId: original.id, component: "animated scale and opacity", reason: "Native 3D visual overrides admit rotation only; the authored initial tiny visual is retained without the pulse expansion." }); }
    entities.push(entity);
    if (original.model) {
      const parts = prepared.modelParts[original.id];
      if (!parts?.length) { throw new Error(`Missing prepared model selection ${original.id}`); }
      for (const [i, assetId] of parts.entries()) {
        entities.push({ id: `${original.id}-native-model-${i}`, parentId: original.id, props: { sourceModelOwner: original.id, sourceNodeId: original.model.nodeId ?? null }, visual: { kind: "model", assetId, castShadow: original.model.castShadow, receiveShadow: original.model.receiveShadow }, assetIds: [assetId] });
      }
    }
  }
  const beaconModel = scene.entities.find(e => e.id === "final-beacon-model");
  if (beaconModel.parentId !== "final-beacon" || JSON.stringify(beaconModel.transform3d) !== JSON.stringify({ position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1], scale: { x: 1, y: 1, z: 1 } }) || prepared.modelParts[beaconModel.id].length !== 1) { throw new Error("Collectible visual transfer requires one identity-local model child"); }
  const collectedVisualIndex = entities.findIndex(e => e.props?.sourceModelOwner === beaconModel.id);
  const collectedVisual = entities[collectedVisualIndex];
  const beacon = entities.find(e => e.id === "final-beacon");
  beacon.visual = collectedVisual.visual; beacon.assetIds = collectedVisual.assetIds;
  beacon.props.sourceModelOwner = beaconModel.id;
  entities.splice(collectedVisualIndex, 1);
  delete entities.find(e => e.id === beaconModel.id).parentId;
  entities.push({ id: "native-camera-pivot", parentId: "courier", props: { generatedHelper: "camera-orbit-pivot" } });
  const audio = { music: scene.music, sources: scene.entities.filter(e => e.audioSource).map(e => ({ ...e.audioSource, position: xyz(e.transform3d.position) })) };
  scripts.push({ id: "forge-audio", source: `i=>(${signalAudio.toString()})(i,${JSON.stringify(audio)})` });
  entities.find(e => e.id === "courier").behaviors.push({ id: "audio", scriptId: "forge-audio", maxCommands: 16, maxTickMs: 20 });
  const environment = structuredClone(scene.environment);
  delete environment.fog;
  const functions = Object.fromEntries(scene.entities.flatMap(e => e.behaviors.filter(b => b.kind === "script").map(b => [e.id, b.source])));
  const groups = [["beacon", "charge-orb", "coolant-bridge", "coolant-console"], ["courier", "audio", "courier-leg-left", "courier-leg-right", "final-beacon"], ["flywheel-0", "flywheel-1", "reactor-console", "reactor-gate", "relay-gate", "repulsor-field", "shuttle"]];
  for (const entity of entities) { entity.behaviors = []; }
  scripts.length = 0;
  for (const [index, roles] of groups.entries()) {
    const id = `forge-controller-${index}`;
    const originals = roles.filter(role => role !== "audio").map(role => `${JSON.stringify(role)}:(input,world)=>(${functions[role]})(input)`).join(",");
    scripts.push({ id, source: `native=>(${signalController.toString()})(native,{${originals}},${JSON.stringify(roles)},${JSON.stringify({ ...configuration, audio })},(${executeSignalScript.toString()}),(${signalAudio.toString()}))` });
    entities.find(e => e.id === roles[0]).behaviors.push({ id: "controller", scriptId: id, maxCommands: 16, maxTickMs: 20 });
    for (const entry of originalScripts) { if (roles.includes(entry.entityId)) { entry.scriptId = id; } }
  }
  const document = nativeGame3dDocument.parse({ engine: "native-cpp-1", dimension: "3d", schemaVersion: 4, id: "signal-forge-native", title: "Signal Forge", initialSceneId: scene.id, presentation: source.presentation, ui: source.ui, assets: prepared.assets, scripts,
    inputActions: [{ id: "jump", bindings: ["Space"] }, { id: "pulse", bindings: ["KeyE", "E"] }, { id: "respawn", bindings: ["KeyR", "R"] }, { id: "forward", bindings: ["KeyW", "ArrowUp"] }, { id: "backward", bindings: ["KeyS", "ArrowDown"] }, { id: "left", bindings: ["KeyA", "ArrowLeft"] }, { id: "right", bindings: ["KeyD", "ArrowRight"] }],
    scenes: [{ id: scene.id, activeCameraId: "camera", environment, entities }] });
  return { document, provenance: { sourceDigest: sha256(JSON.stringify(source)), originalEntityCount: scene.entities.length, originalScripts, controllerGroups: groups, previousNativeCallsPerTick: 16, nativeCallsPerTick: 3, collectibleVisualTransfer: { from: "final-beacon-model", to: "final-beacon", identityLocalTransform: true, reason: "Native collectible removal does not cascade through visual children; the original child ID remains a detached nonvisual marker." }, omissions: omitted, limits: ["Force maps to per-tick impulse force/60. Jolt replaces Rapier damping, friction and character grounding; exact legacy physics parity is not claimed.", "Native angular impulses are unavailable. Orb rolling orientation and decorative flywheel torque are omitted.", "setProp writes stay in each adapter role state; the original roles do not read those fields from another role.", "Native follow camera has no collision sphere sweep. Legacy linear near/far fog is omitted because the native contract admits height fog only.", "Audio uses retained WAV bytes and static bus gains; mixer limiter/reverb and music fade envelopes are not reproduced."] } };
}

export async function adaptSignalForge(output) {
  const { prepareSignalForgeAssets } = await import("./prepare-assets.mjs");
  const prepared = await prepareSignalForgeAssets(output);
  const result = createSignalForgeDocument(prepared.source, prepared);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "game.json"), JSON.stringify(result.document, null, 2) + "\n", { flag: "wx" });
  await writeFile(resolve(output, "provenance.json"), JSON.stringify({ ...result.provenance, assets: prepared.provenance }, null, 2) + "\n", { flag: "wx" });
  await writeFile(resolve(output, "inputs.json"), await readFile(new URL("../../../../../packages/game-runtime/samples/signal-forge/completion.inputs.json", import.meta.url)), { flag: "wx" });
  return result;
}
export async function reusePreparedSignalForge(output) {
  const source = JSON.parse(await readFile(new URL("../../../../../packages/game-runtime/samples/signal-forge/game.json", import.meta.url), "utf8"));
  const assets = JSON.parse(await readFile(resolve(output, "native-assets.json"), "utf8"));
  const provenance = JSON.parse(await readFile(resolve(output, "asset-provenance.json"), "utf8"));
  const collider = JSON.parse(await readFile(new URL("../../../../../packages/game-runtime/samples/signal-forge/assets/4083a3fff3aeda59dc2b9d8bc35f2789.json", import.meta.url), "utf8"));
  const result = createSignalForgeDocument(source, { assets, modelParts: Object.fromEntries(provenance.models.map(model => [model.entityId, model.chunks.map(chunk => chunk.id)])), colliders: { "forge-static-collisions": collider } });
  await writeFile(resolve(output, "game.json"), JSON.stringify(result.document, null, 2) + "\n");
  await writeFile(resolve(output, "provenance.json"), JSON.stringify({ ...result.provenance, assets: provenance }, null, 2) + "\n");
  await writeFile(resolve(output, "inputs.json"), await readFile(new URL("../../../../../packages/game-runtime/samples/signal-forge/completion.inputs.json", import.meta.url)));
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) { const output = resolve(process.argv[2]); const result = process.argv.includes("--reuse-prepared") ? await reusePreparedSignalForge(output) : await adaptSignalForge(output); console.log(JSON.stringify({ entities: result.document.scenes[0].entities.length, assets: result.document.assets.length, scripts: result.document.scripts.length })); }
