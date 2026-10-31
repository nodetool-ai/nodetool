import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { nativeGame3dDocument } from "@nodetool-ai/protocol/native-game";
import { sunrushController, sunrushJsonState } from "./bindings.mjs";
import { partitionSunrushScenery, weldSunrushGeometry } from "./geometry.mjs";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const xyz = (v, fallback = [0, 0, 0]) => v ? [v.x, v.y, v.z] : fallback;
export function adaptSunrush(source, assets, modelParts = {}) {
  if (source.scenes.length !== 1 || source.prefabs.length) { throw new Error("Expected the single original Sunrush course without templates"); }
  const scene = source.scenes[0], entities = [], functions = [], originalScripts = [], headings = {}, initialRotations = {}, roles = [];
  const omissions = [
    { component: "hud.racer-map-0..5", native: "moving minimap dots omitted; native UI overrides cannot change positions, static course minimap retained" },
    { component: "environment.postProcessing", source: "neutral/msaa", native: "agx/smaa" },
    { component: "environment.fog", source: scene.environment.fog, native: "omitted; native height fog is a different contract" },
    { component: "setVisual.scale", native: "kart squash scaling omitted; source rotation and hop retained" },
    { component: "audio.mixer", native: "static bus gains baked into event volumes; reverb/ducking/fades/snapshots unsupported" },
    { component: "inputBindings.gamepad/touch", native: "recorded analog axes or keyboard actions; no controller/touch device binding claim" },
    { component: "particles.confetti.render", source: "box/ranged random color", native: "tetrahedron/fixed midpoint color" }
  ];
  for (const e of scene.entities) { if (e.body3d) { headings[e.id] = `native-heading-${e.id}`; } }
  for (const e of scene.entities) {
    const allowed = new Set(["id", "name", "templateOnly", "transform3d", "parentId", "model", "body3d", "camera3d", "light3d", "animator3d", "particles", "audioSource", "props", "tags", "behaviors"]);
    for (const key of Object.keys(e)) { if (!allowed.has(key)) { throw new Error(`Unmapped Sunrush component ${key}`); } }
    if (e.templateOnly) { throw new Error(`Unexpected Sunrush template ${e.id}`); }
    const t = e.transform3d ?? {}, rotation = t.rotation ?? [0, 0, 0, 1]; initialRotations[e.id] = rotation;
    const entity = { id: e.id, name: e.name || e.id, transform: { position: xyz(t.position), rotation: e.body3d ? [0, 0, 0, 1] : rotation, scale: xyz(t.scale, [1, 1, 1]) }, props: { ...e.props, sourceEntityId: e.id }, behaviors: [] };
    if (e.parentId) { entity.parentId = headings[e.parentId] ?? e.parentId; }
    if (e.model) {
      if (Object.keys(e.model).some(key => !["assetId", "castShadow", "receiveShadow"].includes(key))) { throw new Error("Unexpected model selection must be mapped explicitly"); }
      if (modelParts[e.model.assetId]) {
        for (const [index, assetId] of modelParts[e.model.assetId].entries()) {
          entities.push({ id: `${e.id}-part-${index}`, parentId: e.id, visual: { kind: "model", ...e.model, assetId }, props: { sourceAssetId: e.model.assetId, sourceEntityId: e.id }, behaviors: [] });
        }
      } else { entity.visual = { kind: "model", ...e.model }; }
    }
    for (const field of ["camera3d", "light3d", "animator3d"]) { if (e[field]) { entity[field] = structuredClone(e[field]); } }
    if (e.body3d) {
      entity.body = { type: "kinematic", mass: 1, velocity: [0, 0, 0] };
      entity.collider = { shape: "box", halfExtents: [.001, .001, .001], sensor: true, layer: 15, mask: 0 };
      const heading = { id: headings[e.id], parentId: e.id, transform: { position: [0, 0, 0], rotation, scale: [1, 1, 1] }, props: { sourcePoseOwner: e.id }, behaviors: [] };
      if (e.particles) { heading.particles = structuredClone(e.particles); for (const emitter of heading.particles.emitters) { if (emitter.onDeath?.length) { throw new Error("Sunrush particle death chains are unsupported"); } delete emitter.onDeath; if (typeof emitter.color === "object") { const a=emitter.color.min.slice(1),b=emitter.color.max.slice(1); emitter.color="#"+[0,2,4].map(o=>Math.round((parseInt(a.slice(o,o+2),16)+parseInt(b.slice(o,o+2),16))/2).toString(16).padStart(2,"0")).join(""); } if (emitter.render?.kind === "mesh" && emitter.render.shape === "box") { emitter.render.shape = "tetrahedron"; } } }
      entities.push(heading);
    } else if (e.particles) { throw new Error(`Unexpected unbound particles ${e.id}`); }
    for (const behavior of e.behaviors ?? []) {
      if (behavior.kind !== "script") { throw new Error(`Unmapped Sunrush behavior ${behavior.kind}`); }
      roles.push(e.id); functions.push(`${JSON.stringify(e.id)}:(input,world)=>(${behavior.source})(input)`);
      originalScripts.push({ entityId: e.id, digest: sha256(behavior.source), bytes: Buffer.byteLength(behavior.source) });
    }
    entities.push(entity);
  }
  const environment = structuredClone(scene.environment); delete environment.fog;
  environment.postProcessing.toneMapping = "agx"; environment.postProcessing.antialias = "smaa";
  const mixer = source.audio.mixer;
  const gain = bus => (mixer.buses[bus]?.volume ?? 1) * (mixer.buses[bus]?.parent ? (mixer.buses[mixer.buses[bus].parent]?.volume ?? 1) : 1);
  const config = { roles, headings, initialRotations, omitDynamicScale: true,
    music: { assetId: scene.music.assetId, volume: scene.music.volume * gain("music") },
    audio: scene.entities.filter(e => e.audioSource).map(e => { const bus = mixer.assetBuses[e.audioSource.assetId] ?? "sfx"; return { ...e.audioSource, bus, volume: (e.audioSource.volume ?? 1) * gain(bus) }; }) };
  const script = { id: "sunrush-controller", source: `i=>(${sunrushController.toString()})(i,{${functions.join(",")}},${JSON.stringify(config)},(${sunrushJsonState.toString()}))` };
  entities.find(e => e.id === "presentation").behaviors.push({ id: "controller", scriptId: script.id, maxCommands: 256, maxTickMs: 20, maxStateBytes: 131072 });
  const keyBindings = { start: ["Enter", "Return"], drift: ["ShiftLeft", "ShiftRight", "Shift"], item: ["Space", "KeyE", "E"], recover: ["KeyR", "R"], pause: ["KeyP", "P", "Escape", "Esc"], lookBack: ["KeyQ", "Q"],
    accelerate: ["KeyW", "W", "ArrowUp", "Up"], brake: ["KeyS", "S", "ArrowDown", "Down"], steerLeft: ["KeyA", "A", "ArrowLeft", "Left"], steerRight: ["KeyD", "D", "ArrowRight", "Right"] };
  const nativeUi = { safeArea: source.ui.safeArea, nodes: source.ui.nodes.flatMap(node => {
    if (node.kind !== "button") { return [node]; }
    const { text, action, background, size, fontId, kind, color, ...layout } = node;
    omissions.push({ component: `ui.button.${node.id}`, native: "static panel/text; use recorded keyboard action instead of pointer/focus activation", action });
    return [{ kind: "panel", ...layout, color: background, cornerRadius: 8 }, { kind: "text", id: `${node.id}-label`, parent: node.id, anchor: { x: .5, y: .5 }, pivot: { x: .5, y: .5 }, width: node.width, height: (size ?? 16) * 1.25, align: "center", color, size, fontId, text }];
  }) };
  const document = nativeGame3dDocument.parse({ schemaVersion: 4, engine: "native-cpp-1", dimension: "3d", id: "sunrush-kart-native", title: "Sunrush Kart", initialSceneId: scene.id,
    presentation: source.presentation, ui: nativeUi, assets, scripts: [script], inputActions: Object.entries(keyBindings).map(([id, bindings]) => ({ id, bindings })),
    scenes: [{ id: scene.id, name: scene.name, activeCameraId: scene.activeCameraId, environment, entities }] });
  return { document, provenance: { sourceEntityIds: scene.entities.map(e => e.id), originalScripts, headingHelpers: headings, omissions,
    stateCompatibility: "Sparse array holes become null, matching original JSON serialization. Explicit undefined values and nonfinite numbers remain errors.",
    physicsBinding: "Source collider-free scripted kinematic roots become noninteracting mask0 sensor pose markers; original custom racer overlap solver remains unchanged; original source rotation is applied to nonphysical descendants." } };
}

export async function prepareSunrush(sourceRoot, out) {
  const raw = await readFile(resolve(sourceRoot, "game.json")), source = JSON.parse(raw), names = await readdir(resolve(sourceRoot, "assets"));
  await mkdir(resolve(out, "assets"), { recursive: true });
  const assets = [], provenance = [], partitions = {}, welding = {}, modelParts = {};
  const register = async (id, path, bytes, kind, dependencies = []) => {
    if (bytes.length > 64 * 1024 * 1024) { throw new Error(`Sunrush asset exceeds unchanged native file bound ${id}`); }
    if (assets.reduce((total, asset) => total + asset.size, bytes.length) > 256 * 1024 * 1024) { throw new Error("Sunrush aggregate asset bound exceeded"); }
    await writeFile(resolve(out, path), bytes); assets.push({ id, kind, digest: sha256(bytes), path, size: bytes.length, dependencies });
  };
  for (const [id, binding] of Object.entries(source.assets)) {
    const matches = names.filter(name => name.startsWith(`${binding.assetId}.`));
    if (matches.length !== 1) { throw new Error(`Ambiguous Sunrush source asset ${id}`); }
    let bytes = await readFile(resolve(sourceRoot, "assets", matches[0])); const digest = sha256(bytes);
    if (digest !== binding.digest) { throw new Error(`Sunrush source digest mismatch ${id}`); }
    if (binding.mediaKind === "model") {
      const welded = weldSunrushGeometry(bytes); bytes = welded.bytes;
      const { bytes: unused, ...metadata } = welded; welding[id] = metadata;
    }
    const path = `assets/${matches[0]}`;
    if (["coastal-circuit", "harbor-village", "island-landmarks"].includes(id)) {
      const partition = partitionSunrushScenery(bytes, id);
      for (const image of partition.imageAssets) { await register(image.id, `assets/${image.uri}`, image.bytes, "image"); }
      for (const chunk of partition.chunks) { await register(chunk.id, `assets/${chunk.id}.glb`, chunk.bytes, "model", partition.imageAssets.map(image => image.id)); }
      modelParts[id] = partition.chunks.map(chunk => chunk.id);
      partitions[id] = { sourceVertices: welding[id].originalVertices, partitionInputVertices: partition.originalVertices, sourceIndices: partition.originalIndices, originalExpandedTriangleAttributesDigest: partition.originalExpandedTriangleAttributesDigest,
        adaptedExpandedTriangleAttributesDigest: partition.adaptedExpandedTriangleAttributesDigest, sourceImageDigests: partition.sourceImageDigests, limits: partition.limits,
        indexedPrimitives: partition.indexedPrimitives, chunks: partition.chunks.map(chunk => ({ id: chunk.id, vertices: chunk.vertices, indices: chunk.indices })), images: partition.imageAssets.map(({ id, uri, digest }) => ({ id, uri, digest })) };
    } else { await register(id, path, bytes, binding.mediaKind); }
    provenance.push({ id, source: path, digest, size: bytes.length, modelAdmissionPending: binding.mediaKind === "model" });
  }
  const adapted = adaptSunrush(source, assets, modelParts);
  adapted.provenance.sourceDocumentDigest = sha256(raw); adapted.provenance.assets = provenance;
  adapted.provenance.partitions = partitions;
  adapted.provenance.welding = welding;
  adapted.provenance.preparedDrawnVertices = Object.entries(welding).reduce((total, [id, model]) => total + (partitions[id] ? partitions[id].chunks.reduce((sum, chunk) => sum + chunk.vertices, 0) : model.weldedVertices), 0);
  await writeFile(resolve(out, "game.json"), JSON.stringify(adapted.document, null, 2) + "\n");
  await writeFile(resolve(out, "provenance.json"), JSON.stringify(adapted.provenance, null, 2) + "\n");
  return adapted;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2] || !process.argv[3]) { throw new Error("Provide source sample directory and output directory"); }
  const result = await prepareSunrush(resolve(process.argv[2]), resolve(process.argv[3]));
  console.log(JSON.stringify({ entities: result.document.scenes[0].entities.length, originalScripts: result.provenance.originalScripts.length, assets: result.document.assets.length, modelAdmissionPending: true }));
}
