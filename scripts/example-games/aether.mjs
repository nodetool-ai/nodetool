// Rebuild AETHER's authored geometry, audio, and native game document.
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Document, NodeIO } from "@gltf-transform/core";
import { CylinderGeometry, TorusGeometry, SphereGeometry, OctahedronGeometry, Color, Euler, Quaternion, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { normalizeGameModel3D } from "@nodetool-ai/game-renderer/preparation3d";
import { gameDocument3D } from "@nodetool-ai/protocol";
import sharp from "sharp";

const root = "packages/game-runtime/samples/aether";
await mkdir(`${root}/assets`, { recursive: true });
const v = (x, y, z) => ({ x, y, z });
const assets = {};
const stonePixels = Buffer.alloc(512 * 512 * 3);
for (let y = 0; y < 512; y++) {
  for (let x = 0; x < 512; x++) {
    const wave = Math.sin(x * 0.055 + Math.sin(y * 0.018) * 3 + Math.sin((x + y) * 0.033));
    const vein = Math.pow(Math.abs(wave), 24) * 30;
    const grain = Math.sin(x * 83.17 + y * 12.73) * 2;
    for (let c = 0; c < 3; c++) { stonePixels[(y * 512 + x) * 3 + c] = 248 - vein + grain; }
  }
}
const marble = await sharp(stonePixels, { raw: { width: 512, height: 512, channels: 3 } }).png().toBuffer();
const entities = [];
const script = (source) => ({ kind: "script", maxCommands: 32, maxTickMs: 50, source });
const islands = [
  [0, 0, 4, 8, 8], [0, 0.5, -4, 3.2, 3.2], [2, 1, -11, 2.6, 2.6],
  [-1, 1.5, -18, 5, 5], [0, 2, -25, 4, 4], [0, 2, -39, 5, 5],
  [-2, 2.8, -46, 2.8, 2.8], [1, 3.6, -53, 2.6, 2.6], [-1, 4.4, -60, 5, 5], [0, 5.2, -67, 3.4, 3.4],
  [3, 5.5, -74, 2.4, 2.4], [-1, 5.8, -80, 2.4, 2.4], [2, 6.1, -86, 2.4, 2.4],
  [0, 6.4, -93, 5, 5], [0, 6.4, -107, 5, 5], [-3, 7, -114, 2.8, 2.8],
  [1, 7.6, -120, 2.4, 2.4], [-2, 8.2, -127, 2.4, 2.4], [0, 8.5, -134, 5, 5],
  [-3, 9, -141, 2.6, 2.6], [1, 9.5, -147, 2.4, 2.4], [0, 10, -154, 9, 9]
];
const checkpointIndices = [3, 8, 13, 18];
const crumbleIndices = [10, 11, 12];
const laserIndices = [4, 6, 9, 15, 19];

function model() {
  const doc = new Document(), scene = doc.createScene(), buffer = doc.createBuffer();
  function mat(name, color, metal = 0, rough = 0.6, glow) {
    const c = new Color(color);
    const m = doc.createMaterial(name).setBaseColorFactor([c.r, c.g, c.b, 1]).setMetallicFactor(metal).setRoughnessFactor(rough);
    if (glow) { const e = new Color(glow); m.setEmissiveFactor([e.r, e.g, e.b]); }
    return m;
  }
  const m = {
    ivory: mat("Porcelain limestone", "#e6d9d4", 0.08, 0.72),
    dark: mat("Violet basalt", "#39354d", 0.15, 0.7),
    gold: mat("Brushed champagne brass", "#d9ad72", 0.45, 0.35),
    cyan: mat("Aether conduit", "#91fff1", 0, 0.3, "#65e8d7"),
    rose: mat("Rose crystal", "#ffb0c5", 0.1, 0.35, "#b45b88"),
    night: mat("Obsidian visor", "#122735", 0.5, 0.18),
    distant: mat("Distant architecture", "#9c809e", 0, 0.9)
  };
  const texture = doc.createTexture("Fine mineral veins").setImage(marble).setMimeType("image/png");
  m.ivory.setBaseColorTexture(texture);
  function add(name, g, material, position = [0, 0, 0], rotation) {
    const a = g.attributes;
    const p = doc.createPrimitive().setMaterial(material);
    for (const [key, attr, type] of [["POSITION", a.position, "VEC3"], ["NORMAL", a.normal, "VEC3"]]) {
      p.setAttribute(key, doc.createAccessor().setType(type).setArray(new Float32Array(attr.array)).setBuffer(buffer));
    }
    if (a.uv) { p.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(a.uv.array)).setBuffer(buffer)); }
    if (g.index) { p.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(g.index.array)).setBuffer(buffer)); }
    const node = doc.createNode(name).setMesh(doc.createMesh().addPrimitive(p)).setTranslation(position);
    if (rotation) { node.setRotation(rotation); }
    scene.addChild(node);
    return node;
  }
  const box = (name, pos, size, material, radius = 0.06) => add(name, new RoundedBoxGeometry(...size, 1, Math.min(radius, ...size.map(n => n / 4))), material, pos);
  const ring = (name, pos, radius, tube, material, rotation) => add(name, new TorusGeometry(radius, tube, 8, 96), material, pos, rotation);
  const qx = angle => [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
  return { doc, m, add, box, ring, qx };
}
async function saveModel(slot, model) {
  const raw = await new NodeIO().writeBinary(model.doc);
  const assetId = createHash("sha256").update(`aether:${slot}`).digest("hex").slice(0, 32);
  const result = await normalizeGameModel3D(raw, { assetId, importSettings: { scale: 1, forward: "-z", origin: "preserve" } });
  if (!result.ok) { throw new Error(JSON.stringify(result.diagnostics)); }
  assets[slot] = { ...result.binding, provenance: "Original AETHER geometry authored by scripts/example-games/aether.mjs" };
  await writeFile(`${root}/assets/${assetId}.glb`, result.bytes);
}

const world = model();
for (const [index, [x, y, z, w, d]] of islands.entries()) {
  if (crumbleIndices.includes(index)) { continue; }
  entities.push({ id: `island-${index}`, transform3d: { position: v(x, y - 0.3, z) }, body3d: { type: "static" }, collider3d: { kind: "box", halfExtents: v(w / 2, 0.3, d / 2) } });
  world.box("Ivory landing terrace", [x, y - 0.2, z], [w, 0.4, d], world.m.ivory, 0.12);
  world.box("Gold perimeter", [x, y - 0.48, z], [w + 0.12, 0.16, d + 0.12], world.m.gold);
  world.box("Basalt foundation", [x, y - 0.9, z], [w - 0.3, 0.8, d - 0.3], world.m.dark);
  world.add("Suspended crystal foundation", new CylinderGeometry(w * 0.62, 0.2, 5, 4), world.m.dark, [x, y - 3.6, z], [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)]);
  world.ring("Antigravity halo", [x, y - 2, z], w * 0.62, 0.055, world.m.cyan, world.qx(Math.PI / 2));
  for (const side of [-1, 1]) {
    world.box("Inlaid light", [x + side * (w / 2 - 0.25), y + 0.008, z], [0.065, 0.016, d - 0.65], world.m.cyan, 0.005);
    for (let j = 0; j < 3; j++) {
      world.box("Brass floor inlay", [x + side * (0.55 + j * 0.28), y + 0.01, z + d / 2 - 0.7], [0.12, 0.02, 0.55], world.m.gold, 0.005);
    }
  }
  for (let j = 1; j < d; j++) { world.box("Stone tile joint", [x, y + 0.005, z - d / 2 + j], [w - 0.5, 0.01, 0.015], world.m.gold, 0.002); }
  if ([0, ...checkpointIndices, 21].includes(index)) {
    for (const side of [-1, 1]) {
      const px = x + side * (w / 2 - 0.55);
      world.add("Column foot", new CylinderGeometry(0.45, 0.6, 0.35, 12), world.m.gold, [px, y + 0.17, z]);
      world.add("Observatory column", new CylinderGeometry(0.25, 0.32, 4.5, 12), world.m.ivory, [px, y + 2.4, z]);
      world.add("Column crown", new OctahedronGeometry(0.48), world.m.cyan, [px, y + 4.9, z]);
      for (let j = 0; j < 3; j++) { world.ring("Capital ring", [px, y + 4.2 + j * 0.17, z], 0.37, 0.035, world.m.gold, world.qx(Math.PI / 2)); }
    }
  }
}
// Monumental rings and distant islands establish depth without blocking jumps.
for (let j = 0; j < 3; j++) {
  world.ring("Celestial armillary", [0, 19, -168], 14 + j * 2.2, 0.15, j === 1 ? world.m.cyan : world.m.gold,
    new Quaternion().setFromEuler(new Euler(0.2 + j * 0.35, j * 0.65, j * 0.3)).toArray());
}
world.add("Celestial core", new SphereGeometry(7, 48, 32), world.m.rose, [0, 19, -168]);
world.ring("Extraction portal", [0, 13.3, -156], 3.1, 0.18, world.m.gold);
world.ring("Portal energy", [0, 13.3, -156.1], 2.85, 0.07, world.m.cyan);
for (let j = 0; j < 38; j++) {
  const side = j % 2 ? 1 : -1, x = side * (22 + (j * 13 % 31)), z = 15 - j * 5, y = -8 + (j * 7 % 15);
  world.add("Distant floating island", new CylinderGeometry(3 + j % 4, 0.1, 12 + j % 6, 5), world.m.distant, [x, y - 7, z]);
  for (const dx of [-1.8, 1.8]) {
    world.add("Distant temple column", new CylinderGeometry(0.45, 0.65, 8, 8), world.m.distant, [x + dx, y + 2, z]);
    world.add("Distant temple capital", new CylinderGeometry(0.8, 0.6, 0.4, 8), world.m.gold, [x + dx, y + 6, z]);
  }
  world.box("Temple lintel", [x, y + 6.6, z], [5.3, 0.8, 1.6], world.m.distant);
  world.ring("Distant orbit", [x, y + 4, z], 3.5, 0.045, world.m.gold, world.qx(Math.PI / 2));
}
const skyPixels = Buffer.alloc(1024 * 512 * 3);
for (let y = 0; y < 512; y++) {
  const t = y / 511;
  const stops = [[28, 36, 76], [99, 107, 155], [238, 172, 178], [88, 82, 127]];
  const segment = Math.min(2, Math.floor(t * 3)), mix = t * 3 - segment;
  for (let x = 0; x < 1024; x++) {
    const cloud = Math.pow(Math.max(0, Math.sin(x * 0.015 + Math.sin(y * 0.05) * 2) * Math.sin(y * 0.043 + x * 0.005)), 3) * 19;
    const star = y < 220 && Math.sin(x * 127.1 + y * 311.7) > 0.99985 ? 85 : 0;
    for (let c = 0; c < 3; c++) { skyPixels[(y * 1024 + x) * 3 + c] = Math.min(255, stops[segment][c] * (1 - mix) + stops[segment + 1][c] * mix + cloud + star); }
  }
}
const skyTexture = world.doc.createTexture("Painted celestial atmosphere").setImage(await sharp(skyPixels, { raw: { width: 1024, height: 512, channels: 3 } }).png().toBuffer()).setMimeType("image/png");
const skyMaterial = world.doc.createMaterial("Luminous atmosphere").setBaseColorFactor([0, 0, 0, 1]).setEmissiveFactor([1, 1, 1]).setEmissiveTexture(skyTexture).setDoubleSided(true);
world.add("Sky vault", new SphereGeometry(140, 48, 32), skyMaterial, [0, 0, -30]);
for (let j = 0; j < 90; j++) {
  world.add("Suspended starlight", new OctahedronGeometry(0.035 + j % 3 * 0.025), world.m.cyan, [Math.sin(j * 7.1) * 26, -3 + j % 11, 7 - j * 1.1]);
}
await saveModel("observatory", world);
entities.push({ id: "observatory-art", transform3d: {}, model: { assetId: "observatory" } });

const bridge = model();
bridge.box("Ferry deck", [0, -0.2, 0], [4, 0.4, 4], bridge.m.ivory);
bridge.box("Ferry rim", [0, -0.45, 0], [4.15, 0.15, 4.15], bridge.m.gold);
bridge.ring("Ferry levitation", [0, -0.8, 0], 2.4, 0.09, bridge.m.cyan, bridge.qx(Math.PI / 2));
for (const x of [-1.7, 1.7]) { bridge.box("Ferry edge", [x, 0.015, 0], [0.08, 0.03, 3.5], bridge.m.cyan); }
await saveModel("ferry", bridge);
entities.push({ id: "ferry", transform3d: { position: v(0, 2, -32) }, model: { assetId: "ferry" }, body3d: { type: "kinematic" }, collider3d: { kind: "box", halfExtents: v(2, 0.2, 2), offset: v(0, -0.2, 0) }, behaviors: [script(`i => ({ state: null, commands: [{ kind: 'setKinematicPose', position: { x: 0, y: 2, z: -32 + Math.sin((i.tick + 1) / 90) * 3.5 } }] })`)] });
entities.push({ id: "ferry-2", transform3d: { position: v(0, 6.4, -100) }, model: { assetId: "ferry" }, body3d: { type: "kinematic" }, collider3d: { kind: "box", halfExtents: v(2, 0.2, 2), offset: v(0, -0.2, 0) }, behaviors: [script(`i => ({ state: null, commands: [{ kind: 'setKinematicPose', position: { x: Math.sin((i.tick+1)/65)*2, y: 6.4, z: -100 + Math.sin((i.tick + 1) / 80) * 3.5 } }] })`)] });
for (const index of crumbleIndices) {
  const [x, y, z, w, d] = islands[index];
  entities.push({ id: `island-${index}`, transform3d: { position: v(x, y - 0.2, z) }, body3d: { type: "kinematic" }, collider3d: { kind: "box", halfExtents: v(w/2, 0.2, d/2) }, primitive: { kind: "box", dimensions: v(w, 0.4, d), material: { color: "#e1ab78", emissive: "#392014" } }, behaviors: [script(`i => {
    const s=i.state||{collapse:0,rebuild:0};
    const p=i.world.find(e=>e.id==='player');
    if(!s.collapse && p.grounded && Math.abs(p.position.x-(${x}))<${w/2+0.2} && Math.abs(p.position.z-(${z}))<${d/2+0.2} && Math.abs(p.position.y-${y+0.81})<0.2) {s.collapse=i.tick+42;s.rebuild=i.tick+240;}
    if(s.rebuild && i.tick>=s.rebuild){s.collapse=0;s.rebuild=0;}
    const down=s.collapse && i.tick>=s.collapse;
    return {state:s,commands:[{kind:'setKinematicPose',position:{x:${x},y:down?-25:${y-0.2},z:${z}}}]};
  }`)] });
  entities.push({ id: `crumble-warning-${index}`, parentId: `island-${index}`, transform3d: { position: v(0, 0.23, 0) }, primitive: { kind: "box", dimensions: v(w-0.2, 0.04, 0.1), material: { color: "#ffdc99", emissive: "#ffab40" } } });
}
const laserModel = model();
const laserMaterial = laserModel.doc.createMaterial("Laser plasma").setBaseColorFactor([1, 0.15, 0.08, 1]).setEmissiveFactor([1, 0.15, 0.05]).setMetallicFactor(0);
const laserBeam = laserModel.box("Pulsing beam", [0, 0, 0], [1, 0.12, 0.12], laserMaterial);
const laserBuffer = laserModel.doc.getRoot().listBuffers()[0];
for (const index of laserIndices) {
  const animation = laserModel.doc.createAnimation(`pulse-${index}`), scales = [], times = [];
  for (let tick = 0; tick <= 180; tick++) {
    const phase = (tick + index * 17) % 180;
    times.push(tick / 60);
    scales.push(1, phase >= 90 && phase < 165 ? 1 : 0.001, phase >= 90 && phase < 165 ? 1 : 0.001);
  }
  const input = laserModel.doc.createAccessor().setType("SCALAR").setArray(new Float32Array(times)).setBuffer(laserBuffer);
  const output = laserModel.doc.createAccessor().setType("VEC3").setArray(new Float32Array(scales)).setBuffer(laserBuffer);
  const sampler = laserModel.doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("STEP");
  animation.addSampler(sampler).addChannel(laserModel.doc.createAnimationChannel().setTargetNode(laserBeam).setTargetPath("scale").setSampler(sampler));
}
await saveModel("laser", laserModel);
for (const index of laserIndices) {
  const [x, y, z, w] = islands[index];
  for (const side of [-1, 1]) {
    entities.push({ id: `laser-post-${index}-${side}`, transform3d: { position: v(x+side*(w/2+0.15), y+0.55, z) }, primitive: { kind: "box", dimensions: v(0.22, 1.1, 0.35), material: { color: "#563944", emissive: "#622b25" } } });
  }
  entities.push({ id: `laser-${index}`, transform3d: { position: v(x, y+0.42, z) }, body3d: { type: "static" }, collider3d: { kind: "box", halfExtents: v(w/2+0.2, 0.32, 0.14), sensor: true } });
  entities.push({ id: `laser-beam-${index}`, parentId: `laser-${index}`, transform3d: { scale: v(w+0.4, 1, 1) }, model: { assetId: "laser" }, animator3d: { clips: { pulse: assets.laser.clipIds[laserIndices.indexOf(index)] }, initialClip: "pulse", transitionTicks: 0 } });
  entities.push({ id: `laser-warning-${index}`, transform3d: { position: v(x, y+0.015, z) }, primitive: { kind: "box", dimensions: v(w, 0.025, 0.12), material: { color: "#ffbe69", emissive: "#bb541f" } } });
}

const hero = model();
hero.box("Explorer torso", [0, -0.03, 0], [0.58, 0.63, 0.4], hero.m.ivory, 0.14);
hero.add("Explorer helmet", new SphereGeometry(0.36, 24, 16), hero.m.ivory, [0, 0.48, 0]);
hero.box("Dark visor", [0, 0.49, -0.29], [0.48, 0.2, 0.15], hero.m.night, 0.07);
hero.box("Visor light", [0, 0.48, -0.372], [0.29, 0.028, 0.012], hero.m.cyan);
hero.box("Life support", [0, 0.05, 0.3], [0.42, 0.52, 0.23], hero.m.gold, 0.07);
hero.ring("Back reactor", [0, 0.09, 0.43], 0.15, 0.04, hero.m.cyan);
for (const side of [-1, 1]) {
  hero.box("Arm", [side * 0.38, -0.12, 0], [0.18, 0.55, 0.22], hero.m.ivory, 0.08);
  hero.box("Boot", [side * 0.18, -0.6, -0.02], [0.23, 0.36, 0.33], hero.m.dark, 0.07);
  hero.box("Boot trim", [side * 0.18, -0.72, -0.08], [0.24, 0.055, 0.34], hero.m.gold);
}
const heroScene = hero.doc.getRoot().listScenes()[0];
const torso = hero.doc.createNode("Torso pivot");
const limbs = [];
for (const side of [-1, 1]) {
  for (const [name, height] of [["Arm", 0.16], ["Boot", -0.36]]) {
    const pivot = hero.doc.createNode(`${side < 0 ? "Left" : "Right"} ${name} pivot`).setTranslation([side * (name === "Arm" ? 0.38 : 0.18), height, 0]);
    for (const node of [...heroScene.listChildren()]) {
      if (node.getName().startsWith(name) && Math.sign(node.getTranslation()[0]) === side) {
        const position = node.getTranslation(), origin = pivot.getTranslation();
        node.setTranslation(position.map((value, index) => value - origin[index]));
        heroScene.removeChild(node);
        pivot.addChild(node);
      }
    }
    torso.addChild(pivot);
    limbs.push({ pivot, side, arm: name === "Arm" });
  }
}
for (const node of [...heroScene.listChildren()]) { heroScene.removeChild(node); torso.addChild(node); }
heroScene.addChild(torso);
const animationBuffer = hero.doc.getRoot().listBuffers()[0];
const poses = [
  { name: "idle", duration: 2, angles: [0, 0.025, 0, -0.025, 0], bob: [0, 0.018, 0, -0.008, 0] },
  { name: "run", duration: 0.5, angles: [0.8, 0, -0.8, 0, 0.8], bob: [0.035, 0, 0.035, 0, 0.035] },
  { name: "jump", duration: 0.4, angles: [0.65, 0.8, 0.85, 0.8, 0.65], bob: [0, 0.025, 0.03, 0.025, 0] },
  { name: "fall", duration: 0.6, angles: [0.3, 0.35, 0.3, 0.25, 0.3], bob: [0, 0, 0, 0, 0] },
  { name: "land", duration: 0.18, angles: [0.1, 0.6, 0.4, 0.15, 0.1], bob: [0, -0.11, -0.07, -0.02, 0] }
];
for (const pose of poses) {
  const animation = hero.doc.createAnimation(pose.name);
  const times = hero.doc.createAccessor().setType("SCALAR").setArray(new Float32Array([0, 0.25, 0.5, 0.75, 1].map(t => t * pose.duration))).setBuffer(animationBuffer);
  function track(node, path, values, type) {
    const output = hero.doc.createAccessor().setType(type).setArray(new Float32Array(values.flat())).setBuffer(animationBuffer);
    const sampler = hero.doc.createAnimationSampler().setInput(times).setOutput(output).setInterpolation("LINEAR");
    animation.addSampler(sampler).addChannel(hero.doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
  }
  track(torso, "translation", pose.bob.map(y => [0, y, 0]), "VEC3");
  for (const { pivot, side, arm } of limbs) {
    track(pivot, "rotation", pose.angles.map(angle => {
      const swing = pose.name === "run" || pose.name === "idle" ? angle * side * (arm ? -0.85 : 1) : angle * (arm ? -1 : side === -1 ? 1 : -0.45);
      return new Quaternion().setFromEuler(new Euler(swing, 0, arm && pose.name === "fall" ? -side * 0.65 : 0)).toArray();
    }), "VEC4");
  }
}
await saveModel("explorer", hero);
const gem = model();
gem.add("Energy prism", new OctahedronGeometry(0.45), gem.m.cyan);
gem.ring("Prism orbit", [0, 0, 0], 0.68, 0.035, gem.m.gold);
await saveModel("prism", gem);

for (const index of [...checkpointIndices, 21]) {
  const [x, y, z] = islands[index];
  entities.push({ id: `prism-${index}`, transform3d: { position: v(x, y + 1.15, z) }, body3d: { type: "static" }, collider3d: { kind: "sphere", radius: 0.85, sensor: true }, model: { assetId: "prism" }, behaviors: [{ kind: "collectible", score: 1 }] });
}
const checkpoints = checkpointIndices.map(index => ({ index, x: islands[index][0], y: islands[index][1] + 0.82, z: islands[index][2] }));
entities.push({ id: "player", transform3d: { position: v(0, 0.82, 5) }, body3d: { type: "kinematic" }, collider3d: { kind: "capsule", radius: 0.3, halfHeight: 0.5 }, character3d: { speed: 7, acceleration: 46, jumpSpeed: 8.8, coyoteTicks: 8, jumpBufferTicks: 8 }, interactionActor: { collects: true, activatesTriggers: true }, behaviors: [{ kind: "winWhenCollected", count: 5 }, script(`i => {
  const s = i.state || { checkpoint: { x: 0, y: 0.82, z: 5 }, section: 0, falls: 0, prisms: 0, won: false, notice: 0, started: 0, finish: 0 };
  const c = [], p = i.entity.position;
  let laserHit = false;
  for (const event of i.events) {
    if(event.kind !== 'contact' || event.phase === 'exit') continue;
    const other = event.entityId === 'player' ? event.otherId : event.otherId === 'player' ? event.entityId : '';
    if(!other.startsWith('laser-')) continue;
    const phase=(i.tick+Number(other.slice(6))*17)%180;
    if(phase>=90&&phase<165) laserHit=true;
  }
  s.prisms += i.events.filter(e => e.kind === 'collected' && e.byId === 'player').length;
  for (const cp of ${JSON.stringify(checkpoints)}) {
    if (cp.index > s.section && i.entity.grounded && Math.abs(p.x - cp.x) < 2.7 && Math.abs(p.z - cp.z) < 2.7 && Math.abs(p.y - cp.y) < 0.2) {
      s.checkpoint = { x: cp.x, y: cp.y, z: cp.z }; s.section = cp.index; s.notice = i.tick + 120;
      c.push({ kind: 'emit', event: 'checkpoint' });
    }
  }
  if (!s.started && (Math.abs(i.axes.moveX || 0) + Math.abs(i.axes.moveZ || 0) > 0)) s.started = i.tick;
  if (i.events.some(e => e.kind === 'win')) { s.won = true; s.finish = i.tick; c.push({kind:'emit',event:'victory'}); }
  if (p.y < -9 || i.justPressed.includes('respawn') || laserHit) { s.falls++; c.push({ kind: 'teleport', position: s.checkpoint }, {kind:'emit',event:'return'}); if(laserHit)c.push({kind:'emit',event:'laser-hit'}); }
  if (i.justPressed.includes('jump') && i.entity.grounded) c.push({kind:'emit',event:'leap'});
  const hud = (id,text,x,y,size,color,align='left') => c.push({kind:'hud',id,text,x,y,size,color,align});
  hud('title','A E T H E R',40,42,27,'#fff3e9');
  hud('subtitle','S K Y B O U N D   /   THE CELESTIAL OBSERVATORY',42,70,11,'#e5cbd8');
  hud('score',s.prisms+' / 5  AETHER PRISMS',1240,42,13,'#bdfff0','right');
  hud('stage',s.section>=18?'05  /  THE FINAL GAUNTLET':s.section>=13?'04  /  CROSSWINDS':s.section>=8?'03  /  FRACTURE RUN':s.section>=3?'02  /  THE SKY FERRY':'01  /  FIRST LIGHT',40,642,15,'#fff3e9');
  hud('help','WASD  MOVE     SPACE  JUMP     DRAG  LOOK     R  CHECKPOINT',40,680,12,'#e5cbd8');
  hud('challenge',s.section>=18?'NARROW LANDINGS / WATCH THE LAST LASER':s.section>=13?'FERRY DRIFTS SIDEWAYS / LEAD YOUR JUMP':s.section>=8?'AMBER STEPS COLLAPSE / KEEP MOVING':s.section>=3?'LASERS PULSE / WAIT FOR A CLEAR LANDING':'PRECISION JUMPS / BRAKE BEFORE THE EDGE',40,614,11,'#ffdaa5');
  hud('returns',s.falls+' RETURNS',1240,680,12,'#e5cbd8','right');
  hud('timer',(s.started?((Math.max(0,(s.won?s.finish:i.tick)-s.started))/60).toFixed(1):'0.0')+' s',1240,642,24,'#fff3e9','right');
  hud('notice',i.tick<s.notice?'CHECKPOINT ATTUNED':'',640,118,18,'#bdfff0','center');
  hud('win',s.won?'THE SKY REMEMBERS':'',640,290,44,'#fff3e9','center');
  hud('finish',s.won?'ALL FIVE PRISMS RESTORED  /  OBSERVATORY ONLINE':'',640,334,15,'#bdfff0','center');
  return {state:s,commands:c};
}`)] });
entities.push({ id: "explorer-visual", parentId: "player", transform3d: {}, model: { assetId: "explorer" }, animator3d: { clips: Object.fromEntries(poses.map((pose, index) => [pose.name, assets.explorer.clipIds[index]])), initialClip: "idle", transitionTicks: 5 }, behaviors: [script(`i => {
  const p = i.world.find(e => e.id === 'player'), s = i.state || {yaw:0, grounded:true, landing:0};
  const speed = Math.hypot(p.velocity.x,p.velocity.z);
  if (speed > 0.5) {
    const target = Math.atan2(-p.velocity.x,-p.velocity.z), delta = Math.atan2(Math.sin(target-s.yaw),Math.cos(target-s.yaw));
    s.yaw += Math.max(-0.22,Math.min(0.22,delta));
  }
  if (p.grounded && !s.grounded) s.landing = i.tick + 10;
  s.grounded = p.grounded;
  const clip = !p.grounded ? (p.velocity.y > 0 ? 'jump' : 'fall') : i.tick < s.landing ? 'land' : speed > 0.5 ? 'run' : 'idle';
  return {state:s,commands:[{kind:'setVisual',rotation:[0,Math.sin(s.yaw/2),0,Math.cos(s.yaw/2)]},{kind:'playAnimation',clip}]};
}`)] });
entities.push({ id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective", fov: 65, far: 280 }, behavior: { kind: "follow", targetId: "player", offset: v(0, 4.5, 8), lookAtOffset: v(0, 0.9, -1.6) } } });
entities.push({ id: "sun", transform3d: { position: v(-20, 35, 10), rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(0.3, -0.8, -0.6).normalize()).toArray() }, light3d: { kind: "directional", color: "#ffe0ca", intensity: 3.4, castShadow: true } });
entities.push({ id: "sky-fill", transform3d: { rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(-0.6, -0.3, 0.6).normalize()).toArray() }, light3d: { kind: "directional", color: "#b5dfff", intensity: 1.4 } });

// Original synthesized chimes keep the example self-contained.
for (const [slot, frequencies, duration] of [["leap", [440, 880], 0.18], ["checkpoint", [523.25, 659.25, 783.99], 0.65], ["return", [330, 220], 0.35], ["victory", [523.25, 659.25, 783.99, 1046.5], 1.8]]) {
  const rate = 22050, samples = Math.floor(rate * duration), bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let n = 0; n < samples; n++) {
    const t = n / rate, envelope = Math.min(1, t * 80) * Math.pow(1 - t / duration, 2);
    const value = frequencies.reduce((sum, f, j) => sum + Math.sin(2 * Math.PI * f * t) / (j + 1), 0) / frequencies.length;
    bytes.writeInt16LE(Math.round(value * envelope * 18000), 44 + n * 2);
  }
  const digest = createHash("sha256").update(bytes).digest("hex"), assetId = digest.slice(0, 32);
  assets[slot] = { mediaKind: "audio", assetId, digest, provenance: "Original synthesized AETHER chime" };
  await writeFile(`${root}/assets/${assetId}.wav`, bytes);
  entities.push({ id: `sound-${slot}`, transform3d: {}, audioSource: { assetId: slot, onEvent: slot, volume: 0.45 } });
}
const document = gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "eed43a3d038b4eeca73261ed02205d09", revision: "aether-v2-challenge", entrySceneId: "observatory", tickRate: 60, presentation: { aspectRatio: 16 / 9, hudWidth: 1280, hudHeight: 720 }, inputActions: ["jump", "respawn"], inputAxes: ["moveX", "moveZ"], assets, prefabs: {}, scenes: [{ id: "observatory", name: "The Celestial Observatory", activeCameraId: "camera", gravity: v(0, -17, 0), environment: { background: "#89718d", ambient: { color: "#e3d3ef", intensity: 1.4 }, fog: { color: "#ac8fa5", near: 55, far: 300 }, shadows: { enabled: true, mapSize: 2048, extent: 55 } }, entities }] });
await writeFile(`${root}/game.json`, `${JSON.stringify(document, null, 2)}\n`);
console.log(`AETHER: ${entities.length} entities, ${Object.keys(assets).length} assets`);
