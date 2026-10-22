import { Document, NodeIO } from "@gltf-transform/core";
import { Color } from "three";
import sharp from "sharp";
import { COURSE, coursePose } from "./course.mjs";

const WATER_LEVEL = -0.17;
const TILE_METERS = 48;
// Two transparent ripple sheets slide across the static sea. Each loop moves a sheet by whole texture tiles, so the
// loop restarts on the same pattern. The sheets reach past the fog distance, so their edges are never visible.
const RIPPLE_LOOP_SECONDS = 72;
const RIPPLES = [
  { name: "Wind ripples", tile: TILE_METERS, swap: false, shift: [TILE_METERS, TILE_METERS], opacity: 0.38 },
  { name: "Cross ripples", tile: 30, swap: true, shift: [-60, 60], opacity: 0.3 }
];
const RIPPLE_EXTENT = 900;
const TEXTURE_SIZE = 512;
const CENTER = [30, 35];
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = value => value * value * (3 - 2 * value);
const shorelineLane = (sample, side) => side < 0 ? -29 - Math.sin(sample * 0.12) * 2 : 23 + Math.sin(sample * 0.1) * 2;
const isBeach = sample => sample <= 68 || sample >= 139;

function waveHeight(u, v) {
  const warpU = u + Math.sin(TAU * (u + 2 * v)) * 0.018 + Math.sin(TAU * (3 * u - v)) * 0.009;
  const warpV = v + Math.sin(TAU * (2 * u - v)) * 0.021;
  return 0.045 * Math.sin(TAU * (3 * warpU + 2 * warpV))
    + 0.025 * Math.cos(TAU * (5 * warpU - 4 * warpV) + 1.2)
    + 0.012 * Math.sin(TAU * (9 * warpU + 7 * warpV) + 2.6)
    + 0.004 * Math.cos(TAU * (15 * warpU - 11 * warpV) + 0.7);
}

async function textures() {
  const heights = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      heights[y * TEXTURE_SIZE + x] = waveHeight(x / TEXTURE_SIZE, y / TEXTURE_SIZE);
    }
  }
  const normal = Buffer.alloc(TEXTURE_SIZE * TEXTURE_SIZE * 3);
  const color = Buffer.alloc(TEXTURE_SIZE * TEXTURE_SIZE * 3);
  const foam = Buffer.alloc(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const sample = (x, y) => heights[((y + TEXTURE_SIZE) % TEXTURE_SIZE) * TEXTURE_SIZE + (x + TEXTURE_SIZE) % TEXTURE_SIZE];
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const u = x / TEXTURE_SIZE, v = y / TEXTURE_SIZE;
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * TEXTURE_SIZE / (2 * TILE_METERS);
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * TEXTURE_SIZE / (2 * TILE_METERS);
      const length = Math.hypot(dx, dy, 1);
      const pixel = y * TEXTURE_SIZE + x;
      normal[pixel * 3] = Math.round((0.5 - dx / length * 0.5) * 255);
      normal[pixel * 3 + 1] = Math.round((0.5 - dy / length * 0.5) * 255);
      normal[pixel * 3 + 2] = Math.round((0.5 + 1 / length * 0.5) * 255);
      const tint = 0.45 * Math.sin(TAU * (2 * u + v) + 0.6 * Math.cos(TAU * (u - v))) + 0.3 * Math.cos(TAU * (u - 3 * v)) + 0.25 * sample(x, y) / 0.1;
      const value = Math.round(clamp(243 + tint * 9, 230, 255));
      color[pixel * 3] = value;
      color[pixel * 3 + 1] = value;
      color[pixel * 3 + 2] = value;
      const cellular = Math.sin(TAU * (29 * u + 3 * v) + 2.5 * Math.sin(TAU * (7 * u - 9 * v)))
        * Math.cos(TAU * (5 * u - 23 * v) + 2 * Math.sin(TAU * (11 * u + 4 * v)));
      const alpha = smooth(clamp((cellular + 0.35) / 0.9, 0, 1));
      foam[pixel * 4] = 224;
      foam[pixel * 4 + 1] = 255;
      foam[pixel * 4 + 2] = 244;
      foam[pixel * 4 + 3] = Math.round(alpha * 190);
    }
  }
  const png = (data, channels) => sharp(data, { raw: { width: TEXTURE_SIZE, height: TEXTURE_SIZE, channels } }).png().toBuffer();
  const [normals, colors, foamMask] = await Promise.all([png(normal, 3), png(color, 3), png(foam, 4)]);
  return { normals, colors, foamMask };
}

function waterGeometry() {
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  const shore = [];
  for (let i = 0; i < COURSE.length; i += 2) {
    if (!isBeach(i)) { continue; }
    for (const side of [-1, 1]) {
      const p = coursePose(i / COURSE.length, shorelineLane(i, side)).position;
      shore.push([p.x, p.z]);
    }
  }
  const shallows = new Color("#3fc7b6");
  const coastal = new Color("#1799a5");
  const deep = new Color("#176581");
  const distantIslands = [[151, 1, 15], [-150, -130, 30], [240, -170, 43], [-110, 250, 25], [240, 220, 30]];
  const vertex = (x, z) => {
    let depthDistance = 1000;
    for (const p of shore) { depthDistance = Math.min(depthDistance, Math.hypot(x - p[0], z - p[1])); }
    for (const [islandX, islandZ, radius] of distantIslands) { depthDistance = Math.min(depthDistance, Math.max(0, Math.hypot(x - islandX, z - islandZ) - radius)); }
    const near = smooth(clamp(depthDistance / 35, 0, 1));
    const far = smooth(clamp((depthDistance - 35) / 155, 0, 1));
    const c = shallows.clone().lerp(coastal, near).lerp(deep, far);
    const undulation = (Math.sin(x * 0.19 + z * 0.13) * 0.021 + Math.cos(x * 0.11 - z * 0.17) * 0.013) * (1 - smooth(clamp(depthDistance / 500, 0, 1)));
    const index = positions.length / 3;
    positions.push(x, WATER_LEVEL + undulation, z);
    normals.push(0, 1, 0);
    uvs.push(x / TILE_METERS, -z / TILE_METERS);
    colors.push(c.r, c.g, c.b);
    return index;
  };
  const count = 64, extent = 320;
  for (let z = 0; z <= count; z += 1) {
    for (let x = 0; x <= count; x += 1) { vertex(CENTER[0] - extent + x / count * extent * 2, CENTER[1] - extent + z / count * extent * 2); }
  }
  for (let z = 0; z < count; z += 1) {
    for (let x = 0; x < count; x += 1) {
      const a = z * (count + 1) + x, b = a + 1, c = a + count + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  let boundary = [];
  for (let x = 0; x <= count; x += 1) { boundary.push(x); }
  for (let z = 1; z <= count; z += 1) { boundary.push(z * (count + 1) + count); }
  for (let x = count - 1; x >= 0; x -= 1) { boundary.push(count * (count + 1) + x); }
  for (let z = count - 1; z > 0; z -= 1) { boundary.push(z * (count + 1)); }
  let previousExtent = extent;
  for (const outerExtent of [900, 30000]) {
    const outer = boundary.map(index => vertex(CENTER[0] + (positions[index * 3] - CENTER[0]) * outerExtent / previousExtent, CENTER[1] + (positions[index * 3 + 2] - CENTER[1]) * outerExtent / previousExtent));
    for (let i = 0; i < boundary.length; i += 1) {
      const next = (i + 1) % boundary.length;
      indices.push(boundary[i], boundary[next], outer[next], boundary[i], outer[next], outer[i]);
    }
    boundary = outer;
    previousExtent = outerExtent;
  }
  return { positions, normals, uvs, colors, indices, colorSize: 3 };
}

function rippleGeometry({ tile, swap }) {
  const positions = [], normals = [], uvs = [], indices = [], count = 6;
  for (let z = 0; z <= count; z += 1) {
    for (let x = 0; x <= count; x += 1) {
      const px = CENTER[0] - RIPPLE_EXTENT + x / count * RIPPLE_EXTENT * 2, pz = CENTER[1] - RIPPLE_EXTENT + z / count * RIPPLE_EXTENT * 2;
      positions.push(px, WATER_LEVEL + 0.045, pz);
      normals.push(0, 1, 0);
      uvs.push(...(swap ? [pz / tile, px / tile] : [px / tile, -pz / tile]));
    }
  }
  for (let z = 0; z < count; z += 1) {
    for (let x = 0; x < count; x += 1) {
      const a = z * (count + 1) + x, b = a + 1, c = a + count + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions, normals, uvs, indices };
}

function foamGeometry() {
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  const bands = [0, 0.22, 0.72, 1.2];
  const bandAlpha = [0, 0.7, 0.26, 0];
  const vertex = (sample, side, band) => {
    const broken = smooth(clamp((Math.sin(sample * 0.21 + side) + Math.cos(sample * 0.57 - side) + 0.8) / 2, 0, 1));
    const width = 0.75 + 0.25 * Math.sin(sample * 0.38 + side) + 0.13 * Math.sin(sample * 1.1);
    const lane = shorelineLane(sample, side) + side * (0.15 + bands[band] * width);
    const p = coursePose(sample / COURSE.length, lane).position;
    const index = positions.length / 3;
    positions.push(p.x, WATER_LEVEL + 0.065, p.z);
    normals.push(0, 1, 0);
    uvs.push(p.x / 7, -p.z / 7);
    colors.push(1, 1, 1, bandAlpha[band] * broken);
    return index;
  };
  const triangle = (a, b, c) => {
    const x1 = positions[b * 3] - positions[a * 3], z1 = positions[b * 3 + 2] - positions[a * 3 + 2];
    const x2 = positions[c * 3] - positions[a * 3], z2 = positions[c * 3 + 2] - positions[a * 3 + 2];
    if (z1 * x2 - x1 * z2 >= 0) { indices.push(a, b, c); }
    else { indices.push(a, c, b); }
  };
  for (let sample = 0; sample < COURSE.length; sample += 0.5) {
    if (!isBeach(sample) || !isBeach(sample + 0.5)) { continue; }
    for (const side of [-1, 1]) {
      const a = bands.map((_, band) => vertex(sample, side, band));
      const b = bands.map((_, band) => vertex(sample + 0.5, side, band));
      for (let band = 0; band < bands.length - 1; band += 1) {
        triangle(a[band], b[band], a[band + 1]);
        triangle(a[band + 1], b[band], b[band + 1]);
      }
    }
  }
  return { positions, normals, uvs, colors, indices, colorSize: 4 };
}

/** Creates a coastal sea with soft beach foam and two looping ripple sheets in one animation clip. */
export async function createOceanArt() {
  const doc = new Document();
  const scene = doc.createScene("Sunrush coastal water");
  const buffer = doc.createBuffer();
  const image = await textures();
  const normal = doc.createTexture("Seamless wind ripple normals").setImage(image.normals).setMimeType("image/png");
  const color = doc.createTexture("Subtle shallow-water variation").setImage(image.colors).setMimeType("image/png");
  const foam = doc.createTexture("Broken shoreline foam").setImage(image.foamMask).setMimeType("image/png");
  const waterMaterial = doc.createMaterial("Turquoise sea")
    .setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(color)
    .setNormalTexture(normal).setNormalScale(0.3).setRoughnessFactor(0.35).setMetallicFactor(0);
  const foamMaterial = doc.createMaterial("Soft shoreline foam")
    .setBaseColorFactor([1, 1, 1, 0.78]).setBaseColorTexture(foam)
    .setAlphaMode("BLEND").setRoughnessFactor(0.8).setMetallicFactor(0);
  for (const info of [waterMaterial.getBaseColorTextureInfo(), waterMaterial.getNormalTextureInfo(), foamMaterial.getBaseColorTextureInfo()]) {
    info.setWrapS(10497).setWrapT(10497).setMagFilter(9729).setMinFilter(9987);
  }
  const mesh = (name, geometry, material) => {
    const primitive = doc.createPrimitive().setMaterial(material);
    for (const [semantic, values, type] of [["POSITION", geometry.positions, "VEC3"], ["NORMAL", geometry.normals, "VEC3"], ["TEXCOORD_0", geometry.uvs, "VEC2"], ["COLOR_0", geometry.colors, geometry.colorSize === 4 ? "VEC4" : "VEC3"]]) {
      if (values) { primitive.setAttribute(semantic, doc.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer)); }
    }
    primitive.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(geometry.indices)).setBuffer(buffer));
    const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive));
    scene.addChild(node);
    return node;
  };
  mesh("Ocean surface", waterGeometry(), waterMaterial);
  mesh("Beach foam", foamGeometry(), foamMaterial);
  const animation = doc.createAnimation("Ripples");
  const times = doc.createAccessor().setType("SCALAR").setArray(new Float32Array([0, RIPPLE_LOOP_SECONDS])).setBuffer(buffer);
  for (const ripple of RIPPLES) {
    const material = doc.createMaterial(ripple.name)
      .setBaseColorFactor([0.09, 0.6, 0.65, ripple.opacity]).setAlphaMode("BLEND")
      .setNormalTexture(normal).setNormalScale(1).setRoughnessFactor(0.12).setMetallicFactor(0);
    material.getNormalTextureInfo().setWrapS(10497).setWrapT(10497).setMagFilter(9729).setMinFilter(9987);
    const node = mesh(ripple.name, rippleGeometry(ripple), material);
    const values = doc.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 0, ripple.shift[0], 0, ripple.shift[1]])).setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(times).setOutput(values).setInterpolation("LINEAR");
    animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath("translation").setSampler(sampler));
  }
  return { bytes: () => new NodeIO().writeBinary(doc) };
}
