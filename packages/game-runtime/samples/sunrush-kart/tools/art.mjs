import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { KHRMaterialsEmissiveStrength } from "@gltf-transform/extensions";
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import sharp from "sharp";
import { normalizeGameModel3D } from "@nodetool-ai/game-renderer/preparation3d";
import { COURSE, ROAD_HALF_WIDTH, RACER_COLORS, coursePose } from "./course.mjs";
import { createOceanArt } from "./ocean.mjs";

const PALETTE = { ivory: "#fff2d9", orange: "#fa6847", asphalt: "#41474c", rubber: "#152029", metal: "#beced1", gold: "#ffc457", leaf: "#237b4f", lime: "#76b75b", bark: "#aa7256", sand: "#efd39c", rock: "#cfae85", grass: "#5a9c68", teal: "#24bdbd", glass: "#1a6479", peach: "#f5ad8c", pink: "#eb91a0", blue: "#70bbd0" };

function sculpture() {
  const doc = new Document();
  const scene = doc.createScene("Sunrush hand-sculpted world");
  const buffer = doc.createBuffer();
  const batches = new Map();
  const materials = new Map();
  const textureJobs = [];
  function material(name, color, roughness = 0.66, metallic = 0) {
    if (materials.has(name)) { return materials.get(name); }
    const c = new Color(color);
    const mat = doc.createMaterial(name).setBaseColorFactor([c.r, c.g, c.b, 1]).setRoughnessFactor(roughness).setMetallicFactor(metallic);
    materials.set(name, mat);
    return mat;
  }
  const m = Object.fromEntries(Object.entries(PALETTE).map(([name, color]) => [name, material(name, color)]));
  m.metal.setMetallicFactor(0.55).setRoughnessFactor(0.3);
  m.glass.setMetallicFactor(0.45).setRoughnessFactor(0.15);
  function add(geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    for (const key of Object.keys(g.attributes)) {
      if (key !== "position" && key !== "normal" && key !== "uv") { g.deleteAttribute(key); }
    }
    if (!g.attributes.normal) { g.computeVertexNormals(); }
    if (!g.attributes.uv) { g.setAttribute("uv", new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
    const matrix = new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation, "YXZ")), new Vector3(...scale));
    g.applyMatrix4(matrix);
    if (!batches.has(mat)) { batches.set(mat, []); }
    batches.get(mat).push(g);
  }
  const box = (p, size, mat, rotation = [0, 0, 0], radius = 0) => add(radius ? new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(s => s / 2.1))) : new BoxGeometry(...size), mat, p, rotation);
  const ellipsoid = (p, size, mat, rotation = [0, 0, 0], segments = 20) => add(new SphereGeometry(1, segments, Math.floor(segments * 0.7)), mat, p, rotation, size);
  const cylinder = (p, top, bottom, height, mat, rotation = [0, 0, 0], sides = 12) => add(new CylinderGeometry(top, bottom, height, sides), mat, p, rotation);
  const tube = (a, b, radius, mat, sides = 8) => {
    const start = new Vector3(...a), end = new Vector3(...b), delta = end.clone().sub(start);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.clone().normalize());
    const e = new Euler().setFromQuaternion(q, "YXZ");
    cylinder(start.add(end).multiplyScalar(0.5).toArray(), radius, radius, delta.length(), mat, [e.x, e.y, e.z], sides);
  };
  const quad = (a, b, c, d, mat, uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]) => {
    const g = new BufferGeometry().setAttribute("position", new Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    add(g, mat);
  };
  function texture(mat, name, input, raw, channel = "color") {
    textureJobs.push(async () => {
      const pixels = await sharp(input, raw ? { raw } : {}).png().toBuffer();
      const image = doc.createTexture(name).setImage(pixels).setMimeType("image/png");
      if (channel === "normal") { mat.setNormalTexture(image).setNormalScale(0.38); }
      else { mat.setBaseColorTexture(image); }
    });
  }
  function grain(mat, name, size = 128, normal = false) {
    const pixels = Buffer.alloc(size * size * 3);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const seed = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        const noise = seed - Math.floor(seed);
        const value = Math.round(220 + noise * 35);
        const offset = (y * size + x) * 3;
        pixels[offset] = normal ? 128 + Math.round((noise - 0.5) * 35) : value;
        pixels[offset + 1] = normal ? 128 + Math.round((Math.sin(x * 23 + y * 17) * 0.5) * 35) : value;
        pixels[offset + 2] = normal ? 253 : value;
      }
    }
    texture(mat, name, pixels, { width: size, height: size, channels: 3 }, normal ? "normal" : "color");
  }
  async function bytes() {
    for (const job of textureJobs) { await job(); }
    for (const [mat, geometries] of batches) {
      const g = mergeGeometries(geometries);
      if (!g) { throw new Error("Unable to merge Sunrush art geometry"); }
      const primitive = doc.createPrimitive().setMaterial(mat);
      for (const [key, attr, type] of [["POSITION", "position", "VEC3"], ["NORMAL", "normal", "VEC3"], ["TEXCOORD_0", "uv", "VEC2"]]) {
        primitive.setAttribute(key, doc.createAccessor().setType(type).setArray(new Float32Array(g.attributes[attr].array)).setBuffer(buffer));
      }
      scene.addChild(doc.createNode(mat.getName()).setMesh(doc.createMesh().addPrimitive(primitive)));
      for (const part of geometries) { part.dispose(); }
      g.dispose();
    }
    return new NodeIO().registerExtensions([KHRMaterialsEmissiveStrength]).writeBinary(doc);
  }
  return { doc, m, material, add, box, ellipsoid, cylinder, tube, quad, texture, grain, bytes };
}

function roadPoint(index, lane, height = 0) {
  const pose = coursePose(index / COURSE.length, lane);
  return [pose.position.x, pose.position.y + height, pose.position.z];
}

function roadRibbon(art, from, to, height, material, first = 0, count = COURSE.length) {
  for (let j = first; j < first + count; j++) {
    const left = Math.min(from, to), right = Math.max(from, to);
    const a = roadPoint(j, left, height), b = roadPoint(j, right, height), c = roadPoint(j + 1, right, height), d = roadPoint(j + 1, left, height);
    const u = (right - left) / 2, v = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]) / 2;
    art.quad(a, b, c, d, material, [0, 0, u, 0, u, v, 0, 0, u, v, 0, v]);
  }
}

function kart(index) {
  const a = sculpture(), { m } = a;
  const paint = a.material("Painted racing shell", RACER_COLORS[index], 0.25, 0.22);
  const carbon = a.material("Carbon seats and engine recesses", "#10191d", 0.88);
  const tread = a.material("Tire grooves", "#080f13", 0.97);
  const tail = a.material("Rear amber lenses", "#ff6c31", 0.23).setEmissiveFactor([0.35, 0.045, 0.008]);
  const plate = a.material("Driver racing number", "#ffffff", 0.45);
  const numbers = ["07", "12", "23", "34", "56", "88"];
  a.texture(plate, "Original racing number", Buffer.from(`<svg width="256" height="128" xmlns="http://www.w3.org/2000/svg"><rect width="256" height="128" rx="20" fill="#fff2d9"/><rect x="0" y="0" width="27" height="128" fill="${RACER_COLORS[index]}"/><text x="145" y="105" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-weight="bold" font-style="italic" font-size="110" fill="#152d36">${numbers[index]}</text></svg>`));
  a.box([0, 0.48, 0], [1.66, 0.38, 2.25], m.rubber, [0, 0, 0], 0.17);
  a.ellipsoid([0, 0.72, -0.53], [0.85, 0.38, 1.12], paint);
  a.box([0, 0.8, -0.75], [0.2, 0.038, 1.3], m.ivory, [0.12, 0, 0], 0.014);
  a.box([0, 0.5, -1.42], [1.65, 0.19, 0.25], m.ivory, [0, 0, 0], 0.09);
  a.box([0, 0.4, -1.48], [1.88, 0.12, 0.19], m.rubber, [0, 0, 0], 0.05);
  for (const side of [-1, 1]) {
    a.ellipsoid([side * 0.79, 0.6, 0.28], [0.25, 0.28, 0.9], paint);
    a.box([side * 0.83, 0.61, 0.38], [0.08, 0.12, 0.9], m.ivory, [0, 0, 0], 0.02);
    a.box([side * 0.46, 1.08, 0.91], [0.11, 0.68, 0.15], m.metal);
    a.box([side * 1.02, 1.28, 0.93], [0.09, 0.38, 0.58], paint, [0, 0, 0], 0.035);
    a.cylinder([side * 0.52, 0.57, 1.17], 0.13, 0.13, 0.46, m.metal, [Math.PI / 2, 0, 0]);
    a.cylinder([side * 0.52, 0.57, 1.42], 0.085, 0.085, 0.018, m.rubber, [Math.PI / 2, 0, 0]);
    for (const z of [-0.82, 0.87]) {
      a.cylinder([side * 0.98, 0.4, z], 0.4, 0.4, 0.43, m.rubber, [0, 0, Math.PI / 2], 24);
      a.cylinder([side * 1.205, 0.4, z], 0.255, 0.255, 0.03, m.ivory, [0, 0, Math.PI / 2], 20);
      a.cylinder([side * 1.23, 0.4, z], 0.115, 0.115, 0.05, paint, [0, 0, Math.PI / 2], 12);
      for (let spoke = 0; spoke < 5; spoke++) {
        const angle = spoke * Math.PI * 2 / 5;
        a.tube([side * 1.235, 0.4 + Math.cos(angle) * 0.12, z + Math.sin(angle) * 0.12], [side * 1.235, 0.4 + Math.cos(angle) * 0.24, z + Math.sin(angle) * 0.24], 0.025, m.metal, 6);
      }
    }
    a.ellipsoid([side * 0.57, 0.8, -1.11], [0.18, 0.09, 0.07], m.gold);
  }
  a.box([0, 1.25, 0.94], [2.03, 0.13, 0.52], paint, [-0.08, 0, 0], 0.055);
  a.box([0, 1.33, 0.9], [1.88, 0.018, 0.12], m.ivory);
  a.ellipsoid([0, 0.91, 0.22], [0.52, 0.28, 0.55], carbon);
  a.box([0, 1.13, 0.6], [0.7, 0.78, 0.2], carbon, [-0.14, 0, 0], 0.13);
  a.ellipsoid([0, 1.3, 0.23], [0.38, 0.48, 0.3], paint);
  a.ellipsoid([0, 1.96, 0.12], [0.48, 0.46, 0.45], m.ivory, [0, 0, 0], 28);
  a.ellipsoid([0, 1.98, -0.23], [0.4, 0.22, 0.19], m.glass, [0.08, 0, 0], 24);
  a.box([0, 2.39, 0.1], [0.13, 0.03, 0.43], paint, [0, 0, 0], 0.015);
  for (const side of [-1, 1]) {
    a.ellipsoid([side * 0.46, 1.95, 0.11], [0.045, 0.13, 0.14], paint);
    a.tube([side * 0.28, 1.47, 0.13], [side * 0.34, 1.14, -0.39], 0.12, paint);
    a.ellipsoid([side * 0.29, 1.14, -0.42], [0.13, 0.12, 0.14], m.ivory);
  }
  a.add(new TorusGeometry(0.3, 0.035, 6, 20), m.rubber, [0, 1.14, -0.44], [-0.6, 0, 0]);
  for (let j = 0; j < 32; j++) {
    const t0 = j / 32 * Math.PI * 2, t1 = (j + 1) / 32 * Math.PI * 2;
    const P = (x, t) => [x, 1.96 + Math.cos(t) * 0.46, 0.12 + Math.sin(t) * 0.455];
    a.quad(P(0.082, t0), P(-0.082, t0), P(-0.082, t1), P(0.082, t1), paint);
  }
  a.add(new TorusGeometry(0.422, 0.022, 6, 32), carbon, [0, 1.75, 0.12], [Math.PI / 2, 0, 0], [1, 1, 0.72]);
  a.box([0, 0.75, 0.98], [0.67, 0.47, 0.57], carbon, [0, 0, 0], 0.06);
  for (let j = 0; j < 5; j++) { a.box([0, 0.58 + j * 0.077, 1.27], [0.6, 0.025, 0.08], m.metal); }
  a.box([0, 0.43, 1.32], [1.32, 0.13, 0.2], carbon, [0, 0, 0], 0.04);
  for (const side of [-1, 1]) {
    a.box([side * 0.62, 0.9, 1.13], [0.26, 0.1, 0.08], tail, [0, 0, 0], 0.035);
    a.tube([side * 0.76, 0.58, 0.8], [side * 0.95, 0.4, 0.88], 0.045, m.metal);
    a.box([side * 0.91, 0.7, 0.3], [0.035, 0.1, 0.55], carbon);
    for (const z of [-0.82, 0.87]) {
      for (let groove = 0; groove < 20; groove++) {
        const angle = groove / 20 * Math.PI * 2;
        a.box([side * 0.98, 0.4 + Math.cos(angle) * 0.399, z + Math.sin(angle) * 0.399], [0.33, 0.018, 0.028], tread, [angle, 0, 0]);
      }
      a.add(new TorusGeometry(0.278, 0.022, 6, 24), m.metal, [side * 1.232, 0.4, z], [0, Math.PI / 2, 0]);
    }
  }
  const numberUV = [0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0];
  a.quad([-0.37, 1.13, 1.223], [0.37, 1.13, 1.223], [0.37, 1.43, 1.223], [-0.37, 1.43, 1.223], plate, numberUV);
  a.quad([-0.13, 1.91, 0.575], [0.13, 1.91, 0.575], [0.13, 2.04, 0.575], [-0.13, 2.04, 0.575], plate, numberUV);
  return a;
}

function palm(a, p, height, seed) {
  const lean = Math.sin(seed * 2.1) * 1.4;
  const crown = [p[0] + lean, p[1] + height, p[2] + 0.4];
  for (let j = 0; j < 6; j++) {
    const t0 = j / 6, t1 = (j + 1) / 6;
    a.tube([p[0] + lean * t0 * t0, p[1] + height * t0, p[2] + 0.4 * t0], [p[0] + lean * t1 * t1, p[1] + height * t1, p[2] + 0.4 * t1], 0.25 - j * 0.018, a.m.bark);
  }
  for (let j = 0; j < 8; j++) {
    const angle = j * Math.PI / 4 + seed;
    const length = 3.5 + Math.sin(seed + j) * 0.7;
    const positions = [];
    for (let k = 0; k <= 7; k++) {
      const t = k / 7, r = t * length, y = Math.sin(t * Math.PI) * 0.9 - t * 0.5;
      const width = Math.sin(t * Math.PI) * 0.8;
      positions.push([[crown[0] + Math.cos(angle) * r - Math.sin(angle) * width, crown[1] + y, crown[2] + Math.sin(angle) * r + Math.cos(angle) * width], [crown[0] + Math.cos(angle) * r + Math.sin(angle) * width, crown[1] + y, crown[2] + Math.sin(angle) * r - Math.cos(angle) * width]]);
    }
    for (let k = 0; k < 7; k++) {
      const center = (i) => [(positions[i][0][0] + positions[i][1][0]) / 2, positions[i][0][1] + Math.sin(i / 7 * Math.PI) * 0.11, (positions[i][0][2] + positions[i][1][2]) / 2];
      a.quad(positions[k][0], center(k), center(k + 1), positions[k + 1][0], a.m.leaf);
      a.quad(center(k), positions[k][1], positions[k + 1][1], center(k + 1), a.m.lime);
    }
    a.tube(crown, [crown[0] + Math.cos(angle) * length * 0.74, crown[1] + 0.25, crown[2] + Math.sin(angle) * length * 0.74], 0.024, a.m.lime, 5);
  }
  for (let j = 0; j < 3; j++) { a.ellipsoid([crown[0] + Math.sin(j * 2) * 0.35, crown[1] - 0.25, crown[2] + Math.cos(j * 2) * 0.35], [0.3, 0.36, 0.3], a.m.bark, [0, 0, 0], 10); }
}

function villa(a, p, yaw, index) {
  const height = 5.4 + index % 3 * 1.5, width = 6 + index % 2 * 2;
  const colors = [a.m.peach, a.m.ivory, a.m.pink, a.m.blue, a.m.gold];
  const point = (x, y, z) => [p[0] + Math.cos(yaw) * x + Math.sin(yaw) * z, p[1] + y, p[2] - Math.sin(yaw) * x + Math.cos(yaw) * z];
  const box = (local, size, mat, rx = 0) => a.box(point(...local), size, mat, [rx, yaw, 0], Math.min(...size) > 1 ? 0.06 : 0);
  box([0, height / 2, 0], [width, height, 6], colors[index % colors.length]);
  box([0, 0.25, 0], [width + 0.6, 0.5, 6.6], a.m.ivory);
  box([0, height + 0.12, 0], [width + 0.5, 0.25, 6.5], a.m.ivory);
  box([0, height + 0.9, -1.6], [width + 0.8, 0.22, 3.8], a.m.orange, -0.43);
  box([0, height + 0.9, 1.6], [width + 0.8, 0.22, 3.8], a.m.orange, 0.43);
  for (const x of [-width * 0.29, width * 0.29]) {
    for (let floor = 0; floor < 2; floor++) {
      box([x, 1.9 + floor * 2.5, 3.03], [1.5, 1.8, 0.15], a.m.ivory);
      box([x, 1.9 + floor * 2.5, 3.13], [1.1, 1.43, 0.05], a.m.glass);
      box([x, 1.9 + floor * 2.5, 3.17], [0.09, 1.45, 0.05], a.m.ivory);
      box([x, 1.9 + floor * 2.5, 3.17], [1.1, 0.09, 0.05], a.m.ivory);
      for (const side of [-1, 1]) { box([x + side * 0.93, 1.9 + floor * 2.5, 3.1], [0.4, 1.6, 0.13], a.m.teal); }
    }
  }
  for (const x of [-width * 0.29, width * 0.29]) {
    for (let floor = 0; floor < 2; floor++) {
      box([x, 1.9 + floor * 2.5, -3.03], [1.5, 1.8, 0.15], a.m.ivory);
      box([x, 1.9 + floor * 2.5, -3.13], [1.1, 1.43, 0.05], a.m.glass);
      box([x, 1.9 + floor * 2.5, -3.17], [0.09, 1.45, 0.05], a.m.ivory);
      for (const side of [-1, 1]) { box([x + side * 0.93, 1.9 + floor * 2.5, -3.1], [0.4, 1.6, 0.13], a.m.teal); }
    }
  }
  for (const side of [-1, 1]) {
    for (const z of [-1.6, 1.6]) {
      for (let floor = 0; floor < 2; floor++) {
        box([side * (width / 2 + 0.04), 1.9 + floor * 2.5, z], [0.14, 1.8, 1.5], a.m.ivory);
        box([side * (width / 2 + 0.13), 1.9 + floor * 2.5, z], [0.05, 1.43, 1.1], a.m.glass);
        box([side * (width / 2 + 0.17), 1.9 + floor * 2.5, z], [0.05, 1.45, 0.09], a.m.ivory);
      }
    }
  }
  box([0, 1.2, 3.08], [1.1, 2.3, 0.15], a.m.bark);
  for (let j = 0; j < 8; j++) { box([-width / 2 + (j + 0.5) * width / 8, 2.8, 4], [width / 8, 0.12, 2.4], j % 2 ? a.m.ivory : colors[(index + 2) % colors.length], -0.16); }
  for (const x of [-width / 2 + 0.2, width / 2 - 0.2]) { a.tube(point(x, 0, 4.8), point(x, 2.6, 4.8), 0.06, a.m.ivory); }
  a.cylinder(point(width / 2 + 1.5, 0.38, 2), 0.6, 0.45, 0.76, a.m.orange);
  a.ellipsoid(point(width / 2 + 1.5, 1.1, 2), [0.85, 0.85, 0.85], a.m.leaf, [0, 0, 0], 12);
  const clay = a.material("Terracotta tile edges", "#b74f35", 0.84);
  const flowers = a.material("Bougainvillea flowers", "#d65b86", 0.8);
  const paving = a.material("Warm limestone paving", "#d4c4a1", 0.94);
  for (const side of [-1, 1]) {
    a.quad(point(side * width / 2, height, side * 3), point(side * width / 2, height, -side * 3), point(side * width / 2, height + 1.7, 0), point(side * width / 2, height + 1.7, 0), colors[index % colors.length]);
    for (let row = 0; row < 5; row++) {
      const z = side * (0.2 + row * 0.68), y = height + 1.68 - Math.abs(z) * 0.46;
      a.tube(point(-width / 2 - 0.35, y, z), point(width / 2 + 0.35, y, z), 0.038, clay, 6);
    }
    for (let column = 0; column < 11; column++) {
      const x = -width / 2 + column * width / 10;
      a.tube(point(x, height + 1.72, 0), point(x, height + 0.22, side * 3.28), 0.022, clay, 5);
    }
    for (const x of [-width * 0.29, width * 0.29]) {
      box([x, 3.42, side * 3.5], [1.85, 0.16, 1.05], a.m.ivory);
      a.tube(point(x - 0.88, 4.17, side * 3.94), point(x + 0.88, 4.17, side * 3.94), 0.043, a.m.teal, 6);
      for (let k = 0; k < 6; k++) { a.tube(point(x - 0.82 + k * 0.328, 3.5, side * 3.94), point(x - 0.82 + k * 0.328, 4.17, side * 3.94), 0.022, a.m.teal, 5); }
      box([x, 3.62, side * 4], [1.2, 0.26, 0.35], clay);
      for (let k = 0; k < 4; k++) {
        a.ellipsoid(point(x - 0.45 + k * 0.3, 3.85, side * 4), [0.3, 0.24, 0.25], k % 2 ? flowers : a.m.leaf, [0, 0, 0], 8);
      }
    }
  }
  a.tube(point(-width / 2 - 0.4, height + 1.74, 0), point(width / 2 + 0.4, height + 1.74, 0), 0.11, clay, 8);
  box([0, 0.05, 4.3], [width + 1.4, 0.16, 3.2], paving);
  for (let j = 0; j < 5; j++) { box([-width / 2 + j * width / 4, 0.14, 4.3], [0.025, 0.012, 3.2], a.m.rock); }
  for (const z of [3.3, 4.4, 5.5]) { box([0, 0.14, z], [width + 1.4, 0.012, 0.025], a.m.rock); }
  const lamp = point(-width / 2 - 0.6, 0.1, 5.3);
  a.cylinder([lamp[0], lamp[1] + 1.8, lamp[2]], 0.065, 0.09, 3.6, a.m.teal);
  a.cylinder([lamp[0], lamp[1] + 0.12, lamp[2]], 0.2, 0.24, 0.24, a.m.teal);
  a.ellipsoid([lamp[0], lamp[1] + 3.9, lamp[2]], [0.28, 0.4, 0.28], a.m.gold, [0, 0, 0], 12);
  a.cylinder([lamp[0], lamp[1] + 4.3, lamp[2]], 0, 0.4, 0.24, a.m.teal);
  const umbrella = point(width / 2 + 2.5, 0.1, 0);
  a.cylinder([umbrella[0], umbrella[1] + 1.5, umbrella[2]], 0.045, 0.045, 3, a.m.ivory);
  for (let j = 0; j < 12; j++) {
    a.add(new CylinderGeometry(0, 1.65, 0.6, 1, 1, true, j * Math.PI / 6, Math.PI / 6), j % 2 ? a.m.ivory : colors[(index + 1) % colors.length], [umbrella[0], umbrella[1] + 2.9, umbrella[2]]);
  }
  a.cylinder([umbrella[0], umbrella[1] + 1.1, umbrella[2]], 0.7, 0.7, 0.12, a.m.ivory, [0, 0, 0], 16);
}

function boat(a, p, yaw, size = 1) {
  const local = (x, y, z) => [p[0] + (Math.cos(yaw) * x + Math.sin(yaw) * z) * size, p[1] + y * size, p[2] + (-Math.sin(yaw) * x + Math.cos(yaw) * z) * size];
  a.ellipsoid(p, [1.2 * size, 0.5 * size, 3.2 * size], a.m.ivory, [0, yaw, 0]);
  a.ellipsoid(local(0, 0.32, 0), [0.88 * size, 0.13 * size, 2.7 * size], a.m.bark, [0, yaw, 0]);
  a.tube(local(0, 0.3, 0), local(0, 7, 0), 0.06 * size, a.m.ivory);
  a.quad(local(0.08, 6.9, 0), local(0.08, 1.1, -2.7), local(0.08, 1.1, 0), local(0.08, 6.9, 0), a.m.ivory);
  a.quad(local(-0.08, 5.8, 0.1), local(-0.08, 1.2, 0.1), local(-0.08, 1.2, 2.2), local(-0.08, 5.8, 0.1), a.m.orange);
}

async function courseArt() {
  const a = sculpture(), { m } = a;
  m.asphalt.setRoughnessFactor(0.96);
  a.grain(m.asphalt, "Fine asphalt aggregate", 256);
  a.grain(m.asphalt, "Asphalt micro normal", 256, true);
  const emission = a.doc.createExtension(KHRMaterialsEmissiveStrength);
  const pickupGold = a.material("Pickup golden energy", "#ffc95c", 0.3).setEmissiveFactor([1, 0.32, 0.035]).setExtension("KHR_materials_emissive_strength", emission.createEmissiveStrength().setEmissiveStrength(2.8));
  const pickupCyan = a.material("Pickup turquoise energy", "#18bfc8", 0.26).setEmissiveFactor([0.02, 0.55, 0.65]).setExtension("KHR_materials_emissive_strength", emission.createEmissiveStrength().setEmissiveStrength(2.6));
  const boostLight = a.material("Boost pad luminous arrows", "#d7fff0", 0.4).setEmissiveFactor([0.3, 0.8, 0.6]).setExtension("KHR_materials_emissive_strength", emission.createEmissiveStrength().setEmissiveStrength(1.8));
  m.leaf.setDoubleSided(true); m.lime.setDoubleSided(true); m.ivory.setDoubleSided(true); m.orange.setDoubleSided(true);
  roadRibbon(a, -ROAD_HALF_WIDTH - 0.8, ROAD_HALF_WIDTH + 0.8, -0.2, m.rock);
  roadRibbon(a, -ROAD_HALF_WIDTH, ROAD_HALF_WIDTH, 0, m.asphalt);
  for (const side of [-1, 1]) {
    roadRibbon(a, side * 6.18, side * 6.32, 0.018, m.ivory);
    for (let j = 0; j < COURSE.length; j++) {
      roadRibbon(a, side * 6.65, side * 7.2, 0.045, j % 2 ? m.ivory : m.orange, j, 1);
      if (j % 3 === 0) {
        const p = roadPoint(j, side * 7.7, 0.55);
        a.cylinder(p, 0.075, 0.1, 1.1, m.ivory);
      }
      if ((j > 65 && j < 140) || j < 30 || j > 232) {
        a.tube(roadPoint(j, side * 7.7, 0.9), roadPoint(j + 1, side * 7.7, 0.9), 0.075, m.ivory);
        a.tube(roadPoint(j, side * 7.7, 0.4), roadPoint(j + 1, side * 7.7, 0.4), 0.05, m.orange);
      }
    }
  }
  for (let j = 0; j < COURSE.length; j += 5) {
    roadRibbon(a, -0.075, 0.075, 0.023, m.ivory, j, 2);
  }
  const worn = a.material("Rubber worn corner lines", "#30373c", 1);
  for (const [first, count, lane] of [[28, 17, 2.3], [89, 20, -2], [154, 16, 2.8], [214, 18, -2.6]]) {
    for (const tire of [-0.65, 0.65]) { roadRibbon(a, lane + tire - 0.055, lane + tire + 0.055, 0.004, worn, first, count); }
  }
  for (let j = 4; j < COURSE.length; j += 11) {
    const pose = coursePose(j / COURSE.length, -6.45);
    a.box([pose.position.x, pose.position.y + 0.02, pose.position.z], [0.35, 0.025, 0.75], m.rubber, [0, pose.yaw, 0]);
    for (let k = 0; k < 5; k++) {
      const forward = (k - 2) * 0.13;
      a.box([pose.position.x + Math.sin(pose.yaw) * forward, pose.position.y + 0.039, pose.position.z + Math.cos(pose.yaw) * forward], [0.34, 0.012, 0.025], m.metal, [0, pose.yaw, 0]);
    }
  }
  for (let i = 0; i < 14; i++) {
    for (let row = 0; row < 2; row++) {
      const pose = coursePose(row * 0.0018, i - 6.5);
      a.box([pose.position.x, pose.position.y + 0.025, pose.position.z], [1, 0.03, 1.1], (i + row) % 2 ? m.ivory : m.rubber, [0, pose.yaw, 0]);
    }
  }
  for (const progress of [0.12, 0.43, 0.72]) {
    const pose = coursePose(progress);
    const at = (lane, height, forward = 0) => [pose.position.x + Math.cos(pose.yaw) * lane - Math.sin(pose.yaw) * forward, pose.position.y + height, pose.position.z - Math.sin(pose.yaw) * lane - Math.cos(pose.yaw) * forward];
    for (const side of [-1, 1]) {
      a.cylinder(at(side * 8.2, 2.3), 0.16, 0.24, 4.6, pickupCyan);
      a.add(new TorusGeometry(0.5, 0.1, 8, 20), pickupGold, at(side * 8.2, 4.7), [0, pose.yaw, 0]);
    }
    for (const lane of [-4, 0, 4]) {
      a.box(at(lane, 1.45), [0.9, 0.9, 0.9], pickupCyan, [0.25, pose.yaw + Math.PI / 4, 0.2], 0.12);
      a.ellipsoid(at(lane, 1.5, -0.5), [0.16, 0.28, 0.07], pickupGold, [0, pose.yaw, 0], 12);
      a.add(new TorusGeometry(0.72, 0.055, 6, 28), pickupGold, at(lane, 1.45), [0, pose.yaw, 0]);
      for (let arrow = 0; arrow < 3; arrow++) {
        const f = -4 + arrow * 1.2;
        a.quad(at(lane - 0.6, 0.035, f), at(lane, 0.035, f + 0.5), at(lane + 0.6, 0.035, f), at(lane, 0.035, f + 0.9), pickupGold);
      }
    }
  }
  for (const progress of [0.3, 0.83]) {
    const pose = coursePose(progress, -2);
    const P = (x, z) => [pose.position.x + Math.cos(pose.yaw) * x + Math.sin(pose.yaw) * z, pose.position.y + 0.055, pose.position.z - Math.sin(pose.yaw) * x + Math.cos(pose.yaw) * z];
    a.quad(P(-1.4, 2), P(1.4, 2), P(1.4, -2), P(-1.4, -2), pickupCyan);
    for (let j = 0; j < 3; j++) {
      const z = 1.35 - j * 1.05;
      const points = [P(-1.05, z), P(0, z - 0.7), P(1.05, z), P(0, z - 0.38)].map(p => [p[0], p[1] + 0.015, p[2]]);
      a.quad(...points, boostLight);
    }
  }
  for (let i = 72; i < 140; i += 7) {
    for (const side of [-1, 1]) {
      const p = roadPoint(i, side * 5.6, -0.3);
      a.cylinder([p[0], p[1] / 2, p[2]], 0.8, 1.1, p[1], m.ivory);
    }
  }
  return a;
}

async function harborArt() {
  const a = sculpture(), { m } = a;
  m.leaf.setDoubleSided(true); m.lime.setDoubleSided(true); m.ivory.setDoubleSided(true); m.orange.setDoubleSided(true);
  for (let j = 0; j < 42; j++) {
    const progress = (j + 0.4) / 42;
    if (progress > 0.27 && progress < 0.52) { continue; }
    for (const side of [-1, 1]) {
      const p = coursePose(progress, side * (11.5 + j % 3 * 1.4)).position;
      palm(a, [p.x, 0.5, p.z], 6 + j % 4 * 0.7, j + side);
    }
  }
  for (let j = 0; j < 13; j++) {
    const progress = j < 7 ? 0.015 + j * 0.025 : 0.72 + (j - 7) * 0.037;
    const pose = coursePose(progress, j < 7 ? -19 : 21);
    villa(a, [pose.position.x, 0.5, pose.position.z], pose.yaw + (j < 7 ? Math.PI / 2 : -Math.PI / 2), j);
  }
  const blossom = a.material("Coastal flower blossoms", "#e17e86", 0.8);
  for (let j = 0; j < 50; j++) {
    const progress = (j + 0.65) / 50;
    if (progress > 0.27 && progress < 0.52) { continue; }
    const pose = coursePose(progress, (j % 2 ? -1 : 1) * (11.2 + j % 4 * 0.8));
    for (let k = 0; k < 3; k++) {
      const x = pose.position.x + Math.sin(k * 2.2) * 0.4, z = pose.position.z + Math.cos(k * 2.2) * 0.4;
      a.ellipsoid([x, 0.78, z], [0.65, 0.38, 0.58], k % 2 ? m.leaf : m.lime, [0, j, 0], 10);
      if (j % 3 === 0) { a.ellipsoid([x, 1.13, z], [0.18, 0.13, 0.18], blossom, [0, 0, 0], 8); }
    }
  }
  const arch = coursePose(0.025);
  const P = (x, y, z) => [arch.position.x + Math.cos(arch.yaw) * x + Math.sin(arch.yaw) * z, arch.position.y + y, arch.position.z - Math.sin(arch.yaw) * x + Math.cos(arch.yaw) * z];
  for (const side of [-1, 1]) {
    a.box(P(side * 8.3, 3.6, 0), [0.85, 7.2, 1], m.orange, [0, arch.yaw, 0], 0.18);
    a.box(P(side * 8.3, 0.4, 0), [1.7, 0.8, 1.6], m.ivory, [0, arch.yaw, 0], 0.15);
    for (let j = 0; j < 4; j++) { a.box(P(side * 8.3, 1.8 + j, 0.54), [0.87, 0.4, 0.03], m.ivory, [0, arch.yaw, 0]); }
  }
  a.box(P(0, 7, 0), [17.2, 1.7, 0.8], m.orange, [0, arch.yaw, 0], 0.2);
  const banner = await sharp(Buffer.from('<svg width="2048" height="256" xmlns="http://www.w3.org/2000/svg"><rect width="2048" height="256" fill="#fa6847"/><text x="1024" y="185" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-style="italic" font-size="178" fill="#fff2d9" letter-spacing="15">SUNRUSH KART</text></svg>')).png().toBuffer();
  const texture = a.doc.createTexture("Original Sunrush start banner").setImage(banner).setMimeType("image/png");
  const lettering = a.material("Sunrush lettering", "#ffffff").setBaseColorTexture(texture);
  for (const side of [-1, 1]) {
    const bottomLeft = P(-7.8 * side, 6.25, 0.42 * side);
    const bottomRight = P(7.8 * side, 6.25, 0.42 * side);
    const topRight = P(7.8 * side, 7.75, 0.42 * side);
    const topLeft = P(-7.8 * side, 7.75, 0.42 * side);
    const face = new BufferGeometry().setAttribute("position", new Float32BufferAttribute([...bottomLeft, ...bottomRight, ...topRight, ...bottomLeft, ...topRight, ...topLeft], 3));
    face.setAttribute("uv", new Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2));
    a.add(face, lettering);
  }
  const pennantGold = a.material("Festival golden cloth", "#ffc457", 0.85).setDoubleSided(true);
  const pennantTeal = a.material("Festival turquoise cloth", "#20aebb", 0.85).setDoubleSided(true);
  for (let j = 0; j < 12; j++) {
    const x = -7.5 + j * 1.36;
    a.tube(P(x, 8, 0), P(x, 9.4, 0), 0.035, m.ivory);
    a.quad(P(x, 9.4, 0), P(x + 0.9, 9.1, 0), P(x, 8.8, 0), P(x, 9.4, 0), j % 2 ? pennantGold : pennantTeal);
  }
  for (let j = 0; j < 7; j++) {
    const p = coursePose(0.045 + j * 0.014, 14).position;
    a.box([p.x + 4, 0.3, p.z], [8, 0.5, 2.7], m.bark);
    for (const z of [-1, 1]) { a.cylinder([p.x + 7, 0.7, p.z + z], 0.14, 0.14, 1.5, m.ivory); }
    boat(a, [p.x + 13 + j % 2 * 6, 0.1, p.z], Math.PI / 2 + 0.2 * Math.sin(j), 0.75 + j % 3 * 0.2);
  }
  return a;
}

function islandMound(a, center, scale, material, seed, faceted = false) {
  let geometry = new SphereGeometry(1, 20, 12);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const theta = Math.atan2(z, x);
    const irregular = 1 + 0.11 * Math.sin(theta * 3 + seed) + 0.075 * Math.sin(theta * 5 - seed * 1.7);
    positions.setXYZ(i, x * irregular, y * (1 + 0.08 * Math.sin(x * 5 + z * 7 + seed)), z * irregular);
  }
  if (faceted) {
    const indexed = geometry;
    geometry = indexed.toNonIndexed();
    indexed.dispose();
  }
  geometry.computeVertexNormals();
  a.add(geometry, material, center, [0, seed * 0.2, 0], scale);
}

function landscapeArt() {
  const a = sculpture(), { m } = a;
  a.grain(m.sand, "Fine warm beach grain");
  a.grain(m.rock, "Limestone surface variation");
  a.grain(m.grass, "Coastal turf texture");
  m.leaf.setDoubleSided(true); m.ivory.setDoubleSided(true); m.orange.setDoubleSided(true); m.rock.setDoubleSided(true);
  const groundPoint = (index, lane, height) => { const p = roadPoint(index, lane); return [p[0], height, p[2]]; };
  const paleLimestone = a.material("Exposed pale limestone strata", "#dbc39c", 0.95).setDoubleSided(true);
  const limestoneSeam = a.material("Weathered limestone seams", "#af9672", 1).setDoubleSided(true);
  const cliffPoint = (index, side, depth) => {
    const ledge = Math.sin(depth * Math.PI) * (0.3 * Math.sin(index * 0.71) + (depth > 0.23 && depth < 0.61 ? 0.38 : 0));
    const point = roadPoint(index, side * (7.8 + depth * 3.2 + ledge));
    return [point[0], (point[1] - 0.23) * (1 - depth) + 0.4 * depth, point[2]];
  };
  for (let j = 0; j < COURSE.length; j++) {
    if (j > 68 && j < 139) { continue; }
    const beachLeft = -29 - Math.sin(j * 0.12) * 2, beachRight = 23 + Math.sin(j * 0.1) * 2;
    a.quad(groundPoint(j, beachLeft, 0.15), groundPoint(j, beachRight, 0.15), groundPoint(j + 1, beachRight, 0.15), groundPoint(j + 1, beachLeft, 0.15), m.sand);
    a.quad(groundPoint(j, -25, 0.42), groundPoint(j, 17, 0.42), groundPoint(j + 1, 17, 0.42), groundPoint(j + 1, -25, 0.42), m.grass);

    for (const side of [-1, 1]) {
      const height = COURSE[j][1];
      if (height < 4.5) {
        a.quad(roadPoint(j, side * 7.8, -0.23), roadPoint(j + 1, side * 7.8, -0.23), groundPoint(j + 1, side * 11, 0.4), groundPoint(j, side * 11, 0.4), m.rock);
        continue;
      }
      const depths = [0, 0.08, 0.23, 0.28, 0.55, 0.61, 0.82, 1];
      for (let band = 0; band < depths.length - 1; band++) {
        const material = band === 0 ? m.grass : band === 2 || band === 4 ? limestoneSeam : band % 2 ? paleLimestone : m.rock;
        a.quad(cliffPoint(j, side, depths[band]), cliffPoint(j + 1, side, depths[band]), cliffPoint(j + 1, side, depths[band + 1]), cliffPoint(j, side, depths[band + 1]), material);
      }
      if (j % 6 === 0) {
        const pose = coursePose(j / COURSE.length, side * 10.2);
        for (let chunk = 0; chunk < 2; chunk++) {
          const x = pose.position.x + Math.sin(pose.yaw) * chunk * 1.25;
          const z = pose.position.z + Math.cos(pose.yaw) * chunk * 1.25;
          const rockHeight = height * (chunk ? 0.35 : 0.52);
          a.add(new CylinderGeometry(0.7, 1.25, rockHeight, 5), chunk ? m.rock : paleLimestone, [x, 0.45 + rockHeight / 2, z], [0.08, pose.yaw + chunk * 0.6, side * 0.12], [1, 1, 1.3]);
        }
        const base = groundPoint(j, side * 12.2, 0.65);
        islandMound(a, base, [1.1, 0.4, 1.6], m.leaf, j * 0.7);
        const rim = roadPoint(j, side * 8.8, -0.32);
        islandMound(a, rim, [0.68, 0.22, 0.9], m.grass, j * 0.3);
      }
    }
    if (j % 13 === 0) {
      const p = groundPoint(j, beachLeft - 1, -0.1);
      a.ellipsoid(p, [2.5, 1.2, 3.4], m.rock, [0, j, 0], 12);
    }
  }
  // The lighthouse sits beyond the bridge, clear of the sampled driving ribbon.
  const lx = 151, lz = 1;
  islandMound(a, [lx, -5, lz], [19, 8, 23], m.sand, 2.3);
  islandMound(a, [lx + 1, -3, lz - 1], [13, 6.4, 16], m.rock, 4.8, true);
  for (let j = 0; j < 7; j++) {
    const angle = j * Math.PI * 2 / 7;
    islandMound(a, [lx + Math.sin(angle) * 13.5, 0.2, lz + Math.cos(angle) * 16.5], [3.5 + j % 2, 1.5 + j % 3 * 0.4, 4.2], j % 3 ? m.rock : m.sand, j + 1, true);
  }
  a.cylinder([lx, 2.25, lz], 5.2, 5.8, 0.8, m.ivory, [0, 0, 0], 24);
  for (let j = 0; j < 5; j++) { a.cylinder([lx, 4 + j * 3, lz], 3.3 - j * 0.25, 3.55 - j * 0.25, 3, j % 2 ? m.orange : m.ivory, [0, 0, 0], 24); }
  a.cylinder([lx, 17, lz], 3.8, 3.8, 0.5, m.ivory, [0, 0, 0], 24);
  a.cylinder([lx, 19, lz], 2.5, 2.5, 3.7, m.glass, [0, 0, 0], 24);
  for (let j = 0; j < 8; j++) {
    const angle = j * Math.PI / 4;
    a.tube([lx + Math.sin(angle) * 2.6, 17.2, lz + Math.cos(angle) * 2.6], [lx + Math.sin(angle) * 2.6, 20.9, lz + Math.cos(angle) * 2.6], 0.12, m.ivory);
  }
  a.cylinder([lx, 21.8, lz], 0, 3.8, 2.3, m.orange, [0, 0, 0], 24);
  a.cylinder([lx, 23.7, lz], 0.08, 0.08, 2.6, m.ivory);
  for (const [x, z, s] of [[-150, -130, 1], [240, -170, 1.4], [-110, 250, 0.85], [240, 220, 1]]) {
    const seed = (x + z) * 0.01;
    islandMound(a, [x, -7, z], [35 * s, 9, 42 * s], m.sand, seed);
    islandMound(a, [x - 2 * s, -2.5, z + 1.5 * s], [28 * s, 8.5 * s, 33 * s], m.rock, seed + 2, true);
    for (let j = 0; j < 7; j++) {
      const angle = j * Math.PI * 2 / 7;
      islandMound(a, [x + Math.sin(angle) * 25 * s, -0.4, z + Math.cos(angle) * 29 * s], [(5 + j % 3) * s, (2.5 + j % 3) * s, (6 + j % 2) * s], m.rock, seed + j, true);
    }
    islandMound(a, [x - 11 * s, 2 * s, z - 5 * s], [14 * s, 5 * s, 17 * s], m.leaf, seed + 5);
    islandMound(a, [x + 9 * s, 1.6 * s, z + 3 * s], [13 * s, 3.8 * s, 18 * s], m.grass, seed + 9);
    islandMound(a, [x + 1 * s, 2.1 * s, z - 14 * s], [11 * s, 5.8 * s, 12 * s], m.lime, seed + 13);
    for (let j = 0; j < 5; j++) { palm(a, [x + (-13 + j * 6) * s, 5 * s, z + Math.sin(j) * 10 * s], (6 + j % 2) * s, j + seed); }
  }
  for (let j = 0; j < 4; j++) {
    const x = -65 + j * 73, z = -85 - j % 2 * 45, y = 39 + j * 9;
    const balloon = a.material(`Balloon ${j}`, RACER_COLORS[(j + 2) % 6]);
    a.ellipsoid([x, y, z], [5, 6.8, 5], balloon, [0, 0, 0], 24);
    for (let stripe = 0; stripe < 8; stripe++) {
      a.add(new SphereGeometry(1, 3, 16, stripe * Math.PI / 4, 0.15), m.ivory, [x, y, z], [0, 0, 0], [5.018, 6.82, 5.018]);
    }
    for (let k = 0; k < 8; k++) {
      const angle = k * Math.PI / 4;
      a.tube([x + Math.sin(angle) * 0.9, y - 8, z + Math.cos(angle) * 0.9], [x + Math.sin(angle) * 2.7, y - 5, z + Math.cos(angle) * 2.7], 0.035, m.ivory);
    }
    a.box([x, y - 8.7, z], [2, 1.3, 1.8], m.bark, [0, 0, 0], 0.12);
  }
  for (let j = 0; j < 15; j++) {
    const angle = j * Math.PI * 2 / 15;
    const x = 30 + Math.sin(angle) * 250, y = 48 + j % 4 * 6, z = 35 + Math.cos(angle) * 250;
    for (let k = 0; k < 3; k++) { a.ellipsoid([x + k * 5, y + (k === 1 ? 1.4 : 0), z], [8, 3.2 + k % 2, 4.5], m.ivory, [0, 0, 0], 12); }
  }
  return a;
}

/** Builds original course and kart assets with verified native-engine bindings. */
export async function createArt({ assetsDir }) {
  await mkdir(assetsDir, { recursive: true });
  const assets = {}, entities = [];
  async function save(slot, model) {
    const bytes = await model.bytes();
    const assetId = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    const result = await normalizeGameModel3D(bytes, { assetId, importSettings: { scale: 1, forward: "-z", origin: "preserve" } });
    if (!result.ok) { throw new Error(`${slot}: ${JSON.stringify(result.diagnostics)}`); }
    assets[slot] = { ...result.binding, provenance: "Original Sunrush geometry authored by tools/art.mjs" };
    await writeFile(join(assetsDir, `${assetId}.glb`), result.bytes);
  }
  for (let index = 0; index < 6; index++) { await save(`kart-${index}`, kart(index)); }
  await save("coastal-circuit", await courseArt());
  await save("harbor-village", await harborArt());
  await save("island-landmarks", landscapeArt());
  await save("coastal-water", await createOceanArt());
  for (const slot of ["coastal-circuit", "harbor-village", "island-landmarks"]) {
    entities.push({ id: `${slot}-art`, transform3d: {}, model: { assetId: slot, castShadow: slot === "harbor-village", receiveShadow: true } });
  }
  entities.push({ id: "turquoise-ocean", transform3d: {}, model: { assetId: "coastal-water", castShadow: false, receiveShadow: false } });
  entities.push({ id: "sun", transform3d: { rotation: new Quaternion(-0.42, -0.28, -0.1, 0.8574).normalize().toArray() }, light3d: { kind: "directional", color: "#fff0d5", intensity: 2.8, castShadow: true, shadowNormalBias: 0.025, shadowBias: -0.00015 } });
  return { assets, entities, environment: {
    background: "#80c8e4", ambient: { color: "#edf3ff", intensity: 0.45 },
    fog: { color: "#acd7df", near: 190, far: 680 },
    shadows: { enabled: true, mapSize: 2048, extent: 70, cascades: { count: 2, split: 0.8, maxDistance: 105 } },
    sky: { kind: "procedural", sunEntityId: "sun", turbidity: 2, rayleigh: 1.6, groundColor: "#b5d9dd", intensity: 0.12 },
    postProcessing: { enabled: true, exposure: 1, toneMapping: "neutral", antialias: "msaa" }
  } };
}
