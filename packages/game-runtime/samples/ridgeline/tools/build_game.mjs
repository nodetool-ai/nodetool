#!/usr/bin/env node
// Assembles the RIDGELINE game document and its content-addressed assets.
//
// Run from the repository root after `npm run build:packages` and the Python
// generators (see README.md):
//
//   node packages/game-runtime/samples/ridgeline/tools/build_game.mjs MEDIA_DIR
//
// MEDIA_DIR holds the generator outputs: terrain-*.glb, forest-*.glb, river.glb,
// terrain.collider.json, layout.json, course.json, airfield.glb, gate.glb,
// water-normal.png, jet.glb and audio/*.wav plus audio/score.ogg. The builder
// prepares every model and image with the engine's own preparation code, copies
// the bytes to assets/<assetId>.<ext>, and writes game.json.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareGameModelBinding3D, prepareGameImage3D } from "@nodetool-ai/game-renderer/preparation3d";
import { gameDocument3D } from "@nodetool-ai/protocol";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.dirname(HERE);
const ROOT = path.resolve(SAMPLE, "../../../..");
const media = process.argv[2];
if (!media) throw new Error("usage: build_game.mjs MEDIA_DIR");
const read = (name) => readFileSync(path.join(media, name));
const layout = JSON.parse(read("layout.json"));
const course = JSON.parse(read("course.json"));

const ASSETS = path.join(SAMPLE, "assets");
rmSync(ASSETS, { recursive: true, force: true });
mkdirSync(ASSETS, { recursive: true });
const assets = {};
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function model(slot, file) {
  const bytes = new Uint8Array(read(file));
  const assetId = sha(bytes).slice(0, 32);
  const result = await prepareGameModelBinding3D(bytes, { assetId });
  if (!result.ok) throw new Error(`${file}: ${JSON.stringify(result.diagnostics)}`);
  assets[slot] = result.binding;
  writeFileSync(path.join(ASSETS, `${assetId}.glb`), result.bytes);
  return result.binding;
}

async function image(slot, file) {
  const bytes = new Uint8Array(read(file));
  const assetId = sha(bytes).slice(0, 32);
  const result = await prepareGameImage3D(bytes, { assetId });
  if (!result.ok) throw new Error(`${file}: ${JSON.stringify(result.diagnostics)}`);
  assets[slot] = result.image.binding;
  writeFileSync(path.join(ASSETS, `${assetId}${path.extname(file)}`), result.image.bytes);
}

function collider(slot, file) {
  const bytes = read(file);
  const geometry = JSON.parse(bytes.toString("utf8"));
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i < geometry.vertices.length; i += 3) {
    ["x", "y", "z"].forEach((axis, k) => { min[axis] = Math.min(min[axis], geometry.vertices[i + k]); max[axis] = Math.max(max[axis], geometry.vertices[i + k]); });
  }
  const digest = sha(bytes);
  const assetId = digest.slice(0, 32);
  assets[slot] = { mediaKind: "collider", assetId, digest, required: true, preparationVersion: "1", shape: "triangleMesh", bounds: { min, max },
    vertices: geometry.vertices.length / 3, triangles: geometry.indices.length / 3 };
  writeFileSync(path.join(ASSETS, `${assetId}.json`), bytes);
}

function plain(slot, file, mediaKind, extra = {}) {
  const bytes = readFileSync(file);
  const digest = sha(bytes);
  const assetId = digest.slice(0, 32);
  assets[slot] = { mediaKind, assetId, digest, required: true, ...extra };
  copyFileSync(file, path.join(ASSETS, `${assetId}${path.extname(file)}`));
}

for (let k = 0; k < 4; k += 1) {
  await model(`terrain-${k}`, `terrain-${k}.glb`);
  await model(`forest-${k}`, `forest-${k}.glb`);
}
await model("river", "river.glb");
await model("airfield", "airfield.glb");
await model("gate", "gate.glb");
const jet = await model("jet", "jet.glb");
collider("terrain-collider", "terrain.collider.json");
await image("water-normal", "water-normal.png");
const SOUNDS = ["engine-idle", "engine-mil", "engine-ab", "wind", "gear", "touchdown", "gate", "stall", "crash", "afterburner", "victory"];
for (const name of SOUNDS) plain(`sfx-${name}`, path.join(media, "audio", `${name}.wav`), "audio");
plain("score", path.join(media, "audio", "score.ogg"), "audio");
const FONTS = path.join(ROOT, "packages/game-runtime/samples/blacksite/assets");
plain("font-display", path.join(FONTS, "08e4623805102d819f58601e46e34564.ttf"), "font", { fontFormat: "ttf" });
plain("font-ui", path.join(FONTS, "a4086a4489237efa15b5c697f19a6d4f.ttf"), "font", { fontFormat: "ttf" });

const clip = (name) => {
  const index = ["Neutral", "Roll right", "Roll left", "Pitch up", "Pitch down", "Yaw right", "Yaw left", "Gear down", "Gear up"].indexOf(name);
  if (index < 0 || !jet.clipIds.includes(`clip:${index}`)) throw new Error(`jet clip ${name} is missing`);
  return `clip:${index}`;
};
const node = (index) => {
  if (!jet.nodeIds.includes(`node:${index}`)) throw new Error(`jet node ${index} is missing`);
  return `node:${index}`;
};

const script = (file, replacements = {}) => {
  let source = readFileSync(path.join(SAMPLE, "scripts", file), "utf8").trim();
  for (const [key, value] of Object.entries(replacements)) source = source.replace(key, JSON.stringify(value));
  return source;
};

const v3 = ([x, y, z]) => ({ x, y, z });
const lookRotation = (dir) => {
  // Quaternion turning local -Z toward `dir`.
  const len = Math.hypot(...dir);
  const f = dir.map((value) => value / len);
  const from = [0, 0, -1];
  const dot = from[0] * f[0] + from[1] * f[1] + from[2] * f[2];
  const axis = [from[1] * f[2] - from[2] * f[1], from[2] * f[0] - from[0] * f[2], from[0] * f[1] - from[1] * f[0]];
  const w = 1 + dot;
  const n = Math.hypot(axis[0], axis[1], axis[2], w);
  return [axis[0] / n, axis[1] / n, axis[2] / n, w / n];
};
const sunDirection = [-0.84, 0.25, 0.48];
const sunRotation = lookRotation(sunDirection.map((value) => -value));

const sound = (id, event, slot, volume, extra = {}) => ({
  id, parentId: "jet", transform3d: { position: { x: 0, y: 0, z: 4 } },
  audioSource: { assetId: slot, onEvent: event, volume, spatial: true, minDistance: 12, maxDistance: 3000, rolloff: 1, ...extra }
});

// Particle lifetimes stop at 60 s, so each bank is seeded once at full opacity and then
// refreshed by a slow stream that fades in, keeping the bank's density steady.
const cloud = (index, { p, r }) => {
  const layer = (id, count, size, y, colors, opacity, seed) => ({
    id, playOnStart: true, loop: !seed, duration: seed ? 1 : 60, rate: seed ? 0 : count / 45, bursts: seed ? [{ time: 0, count }] : [], maxParticles: count * 2,
    shape: { kind: "box", size: { x: r * 1.6, y, z: r * 1.1 } }, lifetime: seed ? { min: 30, max: 60 } : { min: 40, max: 60 }, speed: 0,
    size, color: colors, opacity, rotation: { min: 0, max: 6.28 },
    opacityOverLifetime: seed ? [{ t: 0, value: 1 }, { t: 0.85, value: 1 }, { t: 1, value: 0 }] : [{ t: 0, value: 0 }, { t: 0.15, value: 1 }, { t: 0.85, value: 1 }, { t: 1, value: 0 }],
    softness: 60
  });
  const body = [26, { min: r * 0.55, max: r * 0.95 }, r * 0.22, { min: "#d9dde4", max: "#ffffff" }, 0.42];
  const base = [10, { min: r * 0.5, max: r * 0.8 }, 1, { min: "#9aa3b4", max: "#b8bfcc" }, 0.3];
  return { id: `cloud-${index + 1}`, transform3d: { position: v3(p) }, particles: { emitters: [
    layer("body-seed", ...body, true), layer("body", ...body, false), layer("base-seed", ...base, true), layer("base", ...base, false)
  ] } };
};

const gates = course.gates.map((gate, index) => ({
  id: gate.id, tags: ["gate"], transform3d: { position: v3(gate.p), rotation: gate.q },
  model: { assetId: "gate", castShadow: false, receiveShadow: false },
  collider3d: { kind: "sphere", radius: 18.5, sensor: true, layer: "gates" }, body3d: { type: "static" },
  audioSource: { assetId: "sfx-gate", onEvent: "gate", volume: 0.9, spatial: true, minDistance: 40, maxDistance: 2000 },
  props: { order: index + 1 }
}));

const ui = {
  safeArea: true,
  nodes: [
    { kind: "panel", id: "brand-panel", anchor: { x: 0, y: 0 }, offset: { x: 28, y: 24 }, width: 236, height: 60, color: "#071019", opacity: 0.42, cornerRadius: 2 },
    { kind: "panel", id: "brand-accent", parent: "brand-panel", anchor: { x: 0, y: 0 }, width: 3, height: 60, color: "#ff8a2a" },
    { kind: "text", id: "brand", parent: "brand-panel", anchor: { x: 0, y: 0 }, offset: { x: 16, y: 5 }, text: "RIDGELINE", size: 34, color: "#f3f7fa", fontId: "font-display" },
    { kind: "text", id: "brand-sub", parent: "brand-panel", anchor: { x: 0, y: 0 }, offset: { x: 17, y: 40 }, text: "CANYON TIME TRIAL", size: 11, color: "#93a9b8", fontId: "font-ui" },

    { kind: "panel", id: "course-panel", anchor: { x: 1, y: 0 }, offset: { x: -28, y: 24 }, width: 236, height: 104, color: "#071019", opacity: 0.42, cornerRadius: 2 },
    { kind: "panel", id: "course-accent", parent: "course-panel", anchor: { x: 1, y: 0 }, width: 3, height: 104, color: "#ff8a2a" },
    { kind: "text", id: "gate-label", parent: "course-panel", anchor: { x: 1, y: 0 }, offset: { x: -16, y: 10 }, text: "GATE", size: 11, color: "#ff9d47", fontId: "font-ui", align: "right" },
    { kind: "text", id: "gate-value", parent: "course-panel", anchor: { x: 1, y: 0 }, offset: { x: -16, y: 24 }, text: "1 / 13", size: 32, color: "#f3f7fa", fontId: "font-display", align: "right" },
    { kind: "text", id: "gate-dist", parent: "course-panel", anchor: { x: 1, y: 0 }, offset: { x: -16, y: 58 }, text: "", size: 12, color: "#93a9b8", fontId: "font-ui", align: "right" },
    { kind: "text", id: "time-value", parent: "course-panel", anchor: { x: 1, y: 0 }, offset: { x: -16, y: 76 }, text: "0:00.0", size: 18, color: "#f3f7fa", fontId: "font-display", align: "right" },

    { kind: "panel", id: "flight-panel", anchor: { x: 0, y: 1 }, offset: { x: 28, y: -24 }, width: 380, height: 92, color: "#071019", opacity: 0.42, cornerRadius: 2 },
    { kind: "text", id: "spd-label", parent: "flight-panel", anchor: { x: 0, y: 0 }, offset: { x: 18, y: 10 }, text: "AIRSPEED KT", size: 10, color: "#93a9b8", fontId: "font-ui" },
    { kind: "text", id: "spd-value", parent: "flight-panel", anchor: { x: 0, y: 0 }, offset: { x: 17, y: 24 }, text: "0", size: 44, color: "#f3f7fa", fontId: "font-display" },
    { kind: "text", id: "alt-label", parent: "flight-panel", anchor: { x: 0, y: 0 }, offset: { x: 132, y: 10 }, text: "ALTITUDE FT", size: 10, color: "#93a9b8", fontId: "font-ui" },
    { kind: "text", id: "alt-value", parent: "flight-panel", anchor: { x: 0, y: 0 }, offset: { x: 131, y: 24 }, text: "0", size: 44, color: "#f3f7fa", fontId: "font-display" },
    { kind: "text", id: "hdg-label", parent: "flight-panel", anchor: { x: 0, y: 0 }, offset: { x: 262, y: 10 }, text: "HEADING", size: 10, color: "#93a9b8", fontId: "font-ui" },
    { kind: "text", id: "hdg-value", parent: "flight-panel", anchor: { x: 0, y: 0 }, offset: { x: 261, y: 24 }, text: "000", size: 44, color: "#f3f7fa", fontId: "font-display" },
    { kind: "text", id: "g-value", parent: "flight-panel", anchor: { x: 0, y: 0 }, offset: { x: 18, y: 70 }, text: "1.0 G", size: 11, color: "#ff9d47", fontId: "font-ui" },
    { kind: "text", id: "gear-label", parent: "flight-panel", anchor: { x: 0, y: 0 }, offset: { x: 132, y: 70 }, text: "GEAR", size: 11, color: "#93a9b8", fontId: "font-ui" },
    { kind: "text", id: "gear-value", parent: "flight-panel", anchor: { x: 0, y: 0 }, offset: { x: 172, y: 70 }, text: "DOWN", size: 11, color: "#f3f7fa", fontId: "font-ui" },

    { kind: "panel", id: "thr-panel", anchor: { x: 1, y: 1 }, offset: { x: -28, y: -24 }, width: 236, height: 92, color: "#071019", opacity: 0.42, cornerRadius: 2 },
    { kind: "text", id: "thr-label", parent: "thr-panel", anchor: { x: 0, y: 0 }, offset: { x: 18, y: 10 }, text: "THROTTLE", size: 10, color: "#93a9b8", fontId: "font-ui" },
    { kind: "text", id: "thr-value", parent: "thr-panel", anchor: { x: 1, y: 0 }, offset: { x: -18, y: 6 }, text: "0%", size: 26, color: "#f3f7fa", fontId: "font-display", align: "right" },
    { kind: "bar", id: "thr-bar", parent: "thr-panel", anchor: { x: 0, y: 0 }, offset: { x: 18, y: 42 }, width: 200, height: 8, value: 0, max: 1, color: "#ff8a2a", background: "#22313d" },
    { kind: "text", id: "keys", parent: "thr-panel", anchor: { x: 0, y: 0 }, offset: { x: 18, y: 62 }, text: "SHIFT / CTRL THROTTLE  ·  G GEAR  ·  C CAMERA", size: 9, color: "#93a9b8", fontId: "font-ui" },

    { kind: "panel", id: "stall", anchor: { x: 0.5, y: 0 }, offset: { x: 0, y: 30 }, pivot: { x: 0.5, y: 0 }, width: 160, height: 34, color: "#c81e12", opacity: 0.85, cornerRadius: 2, visible: false },
    { kind: "text", id: "stall-text", parent: "stall", anchor: { x: 0.5, y: 0.5 }, pivot: { x: 0.5, y: 0.5 }, text: "STALL", size: 24, color: "#ffffff", fontId: "font-display" },

    { kind: "panel", id: "finish", anchor: { x: 0.5, y: 0.42 }, pivot: { x: 0.5, y: 0.5 }, width: 420, height: 130, color: "#071019", opacity: 0.55, cornerRadius: 2, visible: false },
    { kind: "text", id: "finish-title", parent: "finish", anchor: { x: 0.5, y: 0 }, pivot: { x: 0.5, y: 0 }, offset: { x: 0, y: 14 }, text: "COURSE COMPLETE", size: 40, color: "#ff9d47", fontId: "font-display" },
    { kind: "text", id: "finish-time", parent: "finish", anchor: { x: 0.5, y: 0 }, pivot: { x: 0.5, y: 0 }, offset: { x: 0, y: 62 }, text: "", size: 48, color: "#f3f7fa", fontId: "font-display" }
  ]
};

const jetEntity = {
  id: "jet", name: "RJ-7 Kestrel", tags: ["player"],
  transform3d: { position: v3(course.spawn.p), rotation: course.spawn.q },
  body3d: { type: "dynamic", mass: 8000, ccd: true, angularDamping: 0.05 },
  collider3d: { kind: "box", halfExtents: { x: 1.6, y: 0.75, z: 6.6 }, offset: { x: 0, y: 0.05, z: -0.4 }, layer: "aircraft", physicsMaterial: "airframe" },
  model: { assetId: "jet" },
  animator3d: { graph: "jet", clips: { neutral: clip("Neutral"), rollRight: clip("Roll right"), rollLeft: clip("Roll left"), pitchUp: clip("Pitch up"),
    pitchDown: clip("Pitch down"), yawRight: clip("Yaw right"), yawLeft: clip("Yaw left"), gearDown: clip("Gear down"), gearUp: clip("Gear up") } },
  behaviors: [{ kind: "script", source: script("jet.js", { __GATES__: course.gates.map((gate) => ({ id: gate.id, p: gate.p, q: gate.q, air: true })),
    __SPAWN__: { p: course.spawn.p, q: course.spawn.q, air: false }, __WATER__: layout.waterLevel }), maxCommands: 64, maxTickMs: 20 }]
};

// One child at the nozzle carries every engine and airframe effect, so a single script drives them. The entity is
// turned a quarter turn about X, so emitter +Y points aft and a box's local z extent is vertical.
const effects = {
  id: "effects", parentId: "jet", transform3d: { position: { x: 0, y: 0.1, z: 6.7 }, rotation: [0.7071068, 0, 0, 0.7071068] },
  particles: { emitters: [
    { id: "flame", playOnStart: false, rate: 0, maxParticles: 220, space: "local", shape: { kind: "cone", angle: 3, radius: 0.35 },
      lifetime: { min: 0.06, max: 0.12 }, speed: { min: 28, max: 40 }, size: { min: 0.55, max: 0.8 }, color: "#ffb15a",
      sizeOverLifetime: [{ t: 0, value: 1 }, { t: 1, value: 0.35 }], opacityOverLifetime: [{ t: 0, value: 0.9 }, { t: 1, value: 0 }],
      colorOverLifetime: [{ t: 0, color: "#fff1d8" }, { t: 0.35, color: "#ff9a3c" }, { t: 1, color: "#d0401c" }], blend: "additive", unlit: true },
    { id: "diamonds", playOnStart: false, rate: 0, maxParticles: 64, space: "local", shape: { kind: "point" },
      lifetime: 0.05, speed: { min: 2, max: 30 }, size: { min: 0.4, max: 0.55 }, color: "#fff3e0",
      opacityOverLifetime: [{ t: 0, value: 1 }, { t: 1, value: 0 }], blend: "additive", unlit: true },
    { id: "heat", playOnStart: false, rate: 0, maxParticles: 120, space: "world", shape: { kind: "cone", angle: 6, radius: 0.3 },
      lifetime: { min: 0.3, max: 0.6 }, speed: { min: 8, max: 14 }, size: { min: 0.6, max: 1.2 }, color: "#a7a39c", opacity: 0.08,
      sizeOverLifetime: [{ t: 0, value: 0.6 }, { t: 1, value: 2.4 }], opacityOverLifetime: [{ t: 0, value: 0 }, { t: 0.2, value: 1 }, { t: 1, value: 0 }], unlit: true },
    { id: "wing", playOnStart: false, rate: 0, maxParticles: 400, space: "world", shape: { kind: "box", size: { x: 9.6, y: 3.2, z: 0.1 } },
      lifetime: { min: 0.18, max: 0.35 }, speed: { min: 0, max: 0.5 }, size: { min: 0.5, max: 1.1 }, color: "#f4f7fb", opacity: 0.32,
      sizeOverLifetime: [{ t: 0, value: 0.6 }, { t: 1, value: 1.8 }], opacityOverLifetime: [{ t: 0, value: 0 }, { t: 0.2, value: 1 }, { t: 1, value: 0 }], unlit: true },
    { id: "tips", playOnStart: false, rate: 0, maxParticles: 600, space: "world", shape: { kind: "box", size: { x: 10.2, y: 0.1, z: 0.02 } },
      lifetime: { min: 0.9, max: 1.4 }, speed: 0, size: { min: 0.16, max: 0.24 }, color: "#ffffff", opacity: 0.55,
      sizeOverLifetime: [{ t: 0, value: 0.6 }, { t: 1, value: 2.2 }], opacityOverLifetime: [{ t: 0, value: 0 }, { t: 0.05, value: 1 }, { t: 1, value: 0 }], unlit: true }
  ] },
  behaviors: [{ kind: "script", source: script("fx.js"), maxTickMs: 20 }]
};

// Gameplay cameras cannot carry a body, so the script poses a kinematic rig and the camera rides on it.
const cameraRig = {
  id: "camera-rig", transform3d: { position: v3([course.spawn.p[0], course.spawn.p[1] + 5, course.spawn.p[2] + 20]) }, body3d: { type: "kinematic" },
  behaviors: [{ kind: "script", source: script("camera.js"), maxTickMs: 20 }]
};
const camera = {
  id: "camera", parentId: "camera-rig", transform3d: { position: { x: 0, y: 0, z: 0 } },
  camera3d: { projection: { kind: "perspective", fov: 62, near: 0.5, far: 24000 }, behavior: { kind: "fixed" } }
};

const parked = [[-60, 300, 0.92], [-60, 360, 0.92], [205, 520, -0.38]].map(([x, z, yaw], index) => ({
  id: `parked-${index + 1}`, transform3d: { position: { x, y: layout.airfieldHeight + 1.86, z }, rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)] },
  model: { assetId: "jet" }
}));

const entities = [
  { id: "sun", name: "Sun", transform3d: { position: { x: 0, y: 3000, z: 0 }, rotation: sunRotation },
    light3d: { kind: "directional", color: "#ffd6a8", intensity: 3.4, castShadow: true, shadowNormalBias: 0.04, shadowBias: -0.0004 } },
  { id: "sky-fill", transform3d: { position: { x: 0, y: 1000, z: 0 }, rotation: lookRotation([0.5, -0.6, -0.6]) },
    light3d: { kind: "directional", color: "#9fb8de", intensity: 0.35, castShadow: false } },
  ...[0, 1, 2, 3].map((k) => ({ id: `terrain-${k}`, name: "Terrain", transform3d: { position: { x: 0, y: 0, z: 0 } }, model: { assetId: `terrain-${k}`, castShadow: true } })),
  ...[0, 1, 2, 3].map((k) => ({ id: `forest-${k}`, name: "Forest", transform3d: { position: { x: 0, y: 0, z: 0 } }, model: { assetId: `forest-${k}`, castShadow: true, receiveShadow: true } })),
  { id: "ground", name: "Terrain collider", transform3d: { position: { x: 0, y: 0, z: 0 } }, body3d: { type: "static" },
    collider3d: { kind: "triangleMesh", assetId: "terrain-collider", layer: "world", physicsMaterial: "runway" } },
  { id: "river", transform3d: { position: { x: 0, y: 0, z: 0 } }, model: { assetId: "river", castShadow: false } },
  { id: "airfield", transform3d: { position: { x: 0, y: 0, z: 0 } }, model: { assetId: "airfield" } },
  { id: "sea", transform3d: { position: { x: 0, y: layout.waterLevel, z: 0 } },
    primitive: { kind: "plane", dimensions: { x: 60000, y: 1, z: 60000 }, castShadow: false, receiveShadow: true,
      material: { color: "#1d3a4a", metalness: 0.15, roughness: 0.12, normalTexture: { assetId: "water-normal", tiling: { x: 900, y: 900 } } } } },
  ...parked,
  jetEntity, effects,
  sound("snd-idle", "engine-idle", "sfx-engine-idle", 0.55), sound("snd-mil", "engine-mil", "sfx-engine-mil", 0.7),
  sound("snd-ab", "engine-ab", "sfx-engine-ab", 0.85), sound("snd-wind", "wind", "sfx-wind", 0.35),
  sound("snd-gear", "gear", "sfx-gear", 0.6), sound("snd-touchdown", "touchdown", "sfx-touchdown", 0.8),
  sound("snd-stall", "stall", "sfx-stall", 0.6), sound("snd-ab-light", "afterburner", "sfx-afterburner", 0.9),
  { id: "snd-crash", transform3d: { position: { x: 0, y: 0, z: 0 } }, audioSource: { assetId: "sfx-crash", onEvent: "crash", volume: 1 } },
  { id: "snd-victory", transform3d: { position: { x: 0, y: 0, z: 0 } }, audioSource: { assetId: "sfx-victory", onEvent: "victory", volume: 0.9 } },
  cameraRig, camera, ...gates,
  ...course.clouds.map((entry, index) => cloud(index, entry))
];

const burst = (id, emitters, ticks) => ({ rootId: id, entities: [{ id, transform3d: { position: { x: 0, y: 0, z: 0 } }, particles: { emitters },
  behaviors: [{ kind: "lifetime", ticks, fade: false }] }], externalAssets: [] });

const prefabs = {
  "gate-burst": burst("gate-burst", [
    { id: "ring", playOnStart: true, loop: false, duration: 0.1, rate: 0, bursts: [{ time: 0, count: 140 }], shape: { kind: "circle", radius: 17, fromEdge: true },
      lifetime: { min: 0.6, max: 1.1 }, speed: { min: 2, max: 10 }, size: { min: 0.5, max: 1.2 }, color: "#ffc27a",
      colorOverLifetime: [{ t: 0, color: "#fff4dc" }, { t: 1, color: "#ff7a1c" }], opacityOverLifetime: [{ t: 0, value: 1 }, { t: 1, value: 0 }],
      drag: 1.2, blend: "additive", unlit: true },
    { id: "flash", playOnStart: true, loop: false, duration: 0.1, rate: 0, bursts: [{ time: 0, count: 2 }], lifetime: 0.25, speed: 0, size: 46,
      color: "#ffd7a0", opacityOverLifetime: [{ t: 0, value: 0.6 }, { t: 1, value: 0 }], blend: "additive", unlit: true }
  ], 30),
  "crash-burst": burst("crash-burst", [
    { id: "fireball", playOnStart: true, loop: false, duration: 0.1, rate: 0, bursts: [{ time: 0, count: 90 }], shape: { kind: "sphere", radius: 3 },
      lifetime: { min: 0.6, max: 1.6 }, speed: { min: 6, max: 26 }, size: { min: 3, max: 7 }, color: "#ff9b30",
      sizeOverLifetime: [{ t: 0, value: 0.6 }, { t: 0.3, value: 1.4 }, { t: 1, value: 0.3 }],
      colorOverLifetime: [{ t: 0, color: "#fff6d0" }, { t: 0.3, color: "#ffa236" }, { t: 1, color: "#7a1e10" }], drag: 2.5, blend: "additive", unlit: true },
    { id: "smoke", playOnStart: true, loop: false, duration: 0.1, rate: 0, bursts: [{ time: 0, count: 60 }], shape: { kind: "sphere", radius: 4 },
      lifetime: { min: 3, max: 6 }, speed: { min: 2, max: 9 }, size: { min: 5, max: 10 }, color: "#3b3936", opacity: 0.7,
      sizeOverLifetime: [{ t: 0, value: 0.5 }, { t: 1, value: 2.6 }], opacityOverLifetime: [{ t: 0, value: 0 }, { t: 0.1, value: 1 }, { t: 1, value: 0 }],
      gravity: { x: 0, y: 3, z: 0 }, drag: 1.5 },
    { id: "debris", playOnStart: true, loop: false, duration: 0.1, rate: 0, bursts: [{ time: 0, count: 40 }], shape: { kind: "sphere", radius: 1 },
      lifetime: { min: 1, max: 2.4 }, speed: { min: 10, max: 40 }, size: { min: 0.2, max: 0.6 }, color: "#2a2a2a",
      gravity: { x: 0, y: -9.8, z: 0 }, render: { kind: "mesh", shape: "tetrahedron", align: "velocity" } }
  ], 30)
};

const blend = (parameter, low, mid, high) => ({ kind: "blend1d", parameter, points: [{ value: -1, clip: low }, { value: 0, clip: mid }, { value: 1, clip: high }] });
const animationGraphs = {
  jet: {
    parameters: { roll: { kind: "float", default: 0 }, pitch: { kind: "float", default: 0 }, yaw: { kind: "float", default: 0 }, gear: { kind: "bool", default: true } },
    layers: [
      { id: "gear", mode: "override", weight: 1, initialState: "deployed",
        states: { deployed: { motion: { kind: "clip", clip: "neutral" } }, retract: { motion: { kind: "clip", clip: "gearUp" }, loop: false },
          extend: { motion: { kind: "clip", clip: "gearDown" }, loop: false } },
        transitions: [
          { from: "deployed", to: "retract", conditions: [{ parameter: "gear", op: "false" }], durationTicks: 0 },
          { from: "extend", to: "retract", conditions: [{ parameter: "gear", op: "false" }], durationTicks: 0 },
          { from: "retract", to: "extend", conditions: [{ parameter: "gear", op: "true" }], durationTicks: 0 }
        ] },
      { id: "ailerons", mode: "override", weight: 1, mask: [node(2), node(3)], initialState: "roll",
        states: { roll: { motion: blend("roll", "rollLeft", "neutral", "rollRight") } } },
      { id: "stabilators", mode: "override", weight: 1, mask: [node(4), node(5)], initialState: "pitch",
        states: { pitch: { motion: blend("pitch", "pitchDown", "neutral", "pitchUp") } } },
      { id: "rudder", mode: "override", weight: 1, mask: [node(6)], initialState: "yaw",
        states: { yaw: { motion: blend("yaw", "yawLeft", "neutral", "yawRight") } } }
    ]
  }
};

const document = {
  schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "5d0c7a4e9b2f4f83a1e6c2d8b7f40a19", revision: "ridgeline-v1",
  entrySceneId: "island", tickRate: 60, presentation: { aspectRatio: 16 / 9, hudWidth: 1280, hudHeight: 720 },
  inputActions: ["gear", "brake", "camera", "reset"], inputAxes: ["pitch", "roll", "yaw", "throttle"],
  inputBindings: {
    actions: {
      gear: [{ kind: "key", code: "KeyG" }, { kind: "gamepadButton", button: 3 }, { kind: "touchButton", label: "Gear" }],
      brake: [{ kind: "key", code: "KeyB" }, { kind: "gamepadButton", button: 1 }, { kind: "touchButton", label: "Brake" }],
      camera: [{ kind: "key", code: "KeyC" }, { kind: "gamepadButton", button: 2 }, { kind: "touchButton", label: "Cam" }],
      reset: [{ kind: "key", code: "KeyR" }, { kind: "gamepadButton", button: 8 }]
    },
    axes: {
      pitch: [{ kind: "keys", negative: ["KeyW", "ArrowUp"], positive: ["KeyS", "ArrowDown"] }, { kind: "gamepadAxis", axis: 1, deadZone: 0.12 }, { kind: "touchStick", axis: "y" }],
      roll: [{ kind: "keys", negative: ["KeyA", "ArrowLeft"], positive: ["KeyD", "ArrowRight"] }, { kind: "gamepadAxis", axis: 0, deadZone: 0.12 }, { kind: "touchStick", axis: "x" }],
      yaw: [{ kind: "keys", negative: ["KeyQ"], positive: ["KeyE"] }, { kind: "gamepadButtons", negative: 4, positive: 5 }],
      throttle: [{ kind: "keys", negative: ["ControlLeft", "KeyX"], positive: ["ShiftLeft", "KeyZ"] }, { kind: "gamepadButtons", negative: 6, positive: 7 }]
    },
    look: [{ kind: "mouse", sensitivity: 1 }, { kind: "gamepadStick", xAxis: 2, yAxis: 3, deadZone: 0.15 }, { kind: "touchDrag" }]
  },
  collisionLayers: ["world", "aircraft", "gates"], collisionMatrix: [["gates", "world"], ["gates", "gates"], ["aircraft", "aircraft"]],
  physicsMaterials: { runway: { friction: 0.6, restitution: 0 }, airframe: { friction: 0.4, restitution: 0.05 } },
  assets, prefabs, animationGraphs,
  scenes: [{
    id: "island", name: "island", activeCameraId: "camera", gravity: { x: 0, y: -9.81, z: 0 },
    environment: {
      background: "#9fb6cf", ambient: { color: "#b7c8e0", intensity: 0.22 },
      fog: { kind: "height", color: "#c8c3bb", density: 0.00006, baseHeight: 0, heightFalloff: 0.0009, maxOpacity: 0.85 },
      shadows: { enabled: true, mapSize: 2048, extent: 400, cascades: { count: 4, split: 0.82, maxDistance: 4500 } },
      sky: { kind: "procedural", sunEntityId: "sun", turbidity: 5, rayleigh: 2.2, groundColor: "#5d6a72", intensity: 0.85 },
      postProcessing: { enabled: true, exposure: 1.0, toneMapping: "agx", bloom: { threshold: 3, softness: 0.2, radius: 0.12, intensity: 0.35 },
        vignette: { intensity: 0.32, radius: 0.5, softness: 0.6 }, antialias: "smaa" }
    },
    music: { assetId: "score", volume: 0.5, fadeInTicks: 120, fadeOutTicks: 120, streaming: { loopStartSeconds: 0 } },
    entities
  }],
  audio: { mixer: {
    buses: { music: { volume: 0.45 }, sfx: { volume: 0.9, reverbSend: 0.08 }, engine: { parent: "sfx", volume: 0.8 }, ui: { volume: 0.75 } },
    assetBuses: { "sfx-engine-idle": "engine", "sfx-engine-mil": "engine", "sfx-engine-ab": "engine", "sfx-wind": "engine", "sfx-gate": "ui", "sfx-victory": "ui", "sfx-stall": "ui" },
    reverb: { decaySeconds: 1.8 },
    ducking: [{ bus: "music", when: "ui", gain: 0.7, attackTicks: 2, releaseTicks: 50 }],
    snapshots: { finish: { buses: { music: { volume: 0.7 }, engine: { volume: 0.35, lowpassHz: 1400 } } } },
    transitions: [{ on: { kind: "trigger", event: "victory" }, snapshot: "finish", fadeTicks: 120 }]
  } },
  ui,
  performance: { budgets: { drawCalls: 1000, triangles: 5000000, particles: 4096, voices: 24 } }
};

const parsed = gameDocument3D.safeParse(document);
if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
writeFileSync(path.join(SAMPLE, "game.json"), `${JSON.stringify(document, null, 1)}\n`);
console.log(`game.json written with ${Object.keys(assets).length} assets and ${entities.length} entities`);
console.log(readdirSync(ASSETS).length, "asset files");
