// Writes parity/cases/hand/image.json: cases for the image nodes with small
// real input images, the generators without inputs, and chains of GPU nodes.
// The default cases in cases/generated/ give these nodes an empty image,
// which only exercises the empty-input path.
//
//   node parity/generate-image-cases.mjs
//
// Every case leaves the node's output unconnected. Its result reaches the
// streams through node_update, output_update and generation_complete. An
// Output node would make the reference persist the image as an asset, which
// needs a database the sandboxed reference does not have.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "cases", "hand", "image.json");
const inventory = JSON.parse(readFileSync(join(here, "inventory.json"), "utf8"));
const nodes = Array.isArray(inventory) ? inventory : inventory.nodes;

// ------------------------------------------------------------------ images

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}
/** 8-bit RGBA PNG, filter 0 on every row. */
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (width * 4 + 1) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const W = 16;
const H = 12;
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
/** Colour ramps, a bright square, and alpha from opaque (left) to clear (right edge). */
const PHOTO = png(W, H, (x, y) => {
  const square = x >= 5 && x < 9 && y >= 4 && y < 8;
  return [
    square ? 250 : clamp((x * 255) / (W - 1)),
    square ? 235 : clamp((y * 255) / (H - 1)),
    clamp(60 + ((x + y) % 5) * 40),
    x < 10 ? 255 : x === W - 1 ? 0 : clamp(255 - (x - 9) * 40)
  ];
});
/** Opaque grey levels: a radial falloff, used for masks, displacement and overlays. */
const MASK = png(W, H, (x, y) => {
  const d = Math.hypot(x - W / 2, y - H / 2) / Math.hypot(W / 2, H / 2);
  const v = clamp(255 * (1 - d));
  return [v, clamp(v * 0.8 + 30), clamp(255 - v), 255];
});

const asData = (buf) => ({ type: "image", data: buf.toString("base64") });
const asDataUri = (buf) => ({ type: "image", uri: `data:image/png;base64,${buf.toString("base64")}` });

// ------------------------------------------------------------------ cases

/** Properties that make a node change its input where the default does little. */
const TWEAKS = {
  "lib.image.color.BrightnessContrast": { brightness: 0.15, contrast: 1.3 },
  "lib.image.color.Exposure": { stops: 0.7 },
  "lib.image.color.Grade": { brightness: 0.05, contrast: 1.2, saturation: 0.6, hue: 25, temperature: 0.2 },
  "lib.image.color.HSB": { hue: 40, saturation: 1.4, brightness: 1.1 },
  "lib.image.color_grading.CDL": { slope_r: 1.2, offset_g: 0.02, power_b: 0.9, saturation: 1.1 },
  "lib.image.color_grading.ColorBalance": { temperature: 0.3, tint: -0.2 },
  "lib.image.color_grading.Exposure": { exposure: 0.5, contrast: 1.2 },
  "lib.image.color_grading.HSLAdjust": { hue_shift: 30, saturation: 0.3, luminance: 0.1 },
  "lib.image.color_grading.SaturationVibrance": { saturation: 0.4, vibrance: 0.3 },
  "lib.image.warp.Offset": { dx: 5, dy: 2 },
  "lib.image.warp.Tile": { tiles_x: 2, tiles_y: 2 },
  "nodetool.image.Channels": { channel: "red" },
  "nodetool.image.Paste": { left: 3, top: 2 },
  "nodetool.image.Scale": { scale: 1.5 },
  "nodetool.image.Resize": { width: 10, height: 20 },
  "nodetool.image.ResizeImage": { width: 24, height: 9 },
  "nodetool.image.CanvasResize": { padding_unit: "px", top: 2, left: 3, right: 1, bottom: 4, color: { type: "color", value: "#ff000080" } },
  "nodetool.image.Crop": { left: 2, top: 1, right: 13, bottom: 10 },
  "nodetool.image.Fit": { width: 20, height: 20 },
  "nodetool.image.RotateAndFlip": { angle: 30, flip_horizontal: true },
  "nodetool.image.Levels": { r_black: 20, r_gamma: 1.4, g_white: 200, b_gamma: 0.7 }
};

/** Generators: small sizes, and a pinned seed where the default is random. */
const GENERATORS = {
  "lib.image.draw.LinearGradient": { angle: 30, color_a: { type: "color", value: "#ff0000" }, color_b: { type: "color", value: "#0000ff80" } },
  "lib.image.draw.RadialGradient": {},
  "lib.image.draw.AngularGradient": {},
  "lib.image.draw.DiamondGradient": {},
  "lib.image.draw.Checkerboard": {},
  "lib.image.draw.Background": { color: { type: "color", value: "#3366cc" } },
  "lib.image.draw.GaussianNoise": { seed: 7, mean: 0.5, stddev: 0.2 }
};

const IMAGE_NODE =
  /^(lib\.image\.|nodetool\.image\.(Blur|Channels|Paste|Scale|Resize|ResizeImage|CanvasResize|Crop|Fit|RotateAndFlip|Levels)$)/;

function imageProps(node) {
  return node.properties.filter((p) => p.type === "image" || p.type?.type === "image").map((p) => p.name);
}

const cases = [];
for (const node of nodes) {
  if (!IMAGE_NODE.test(node.type) || GENERATORS[node.type]) continue;
  const images = imageProps(node);
  if (images.length === 0) continue;
  const properties = { ...(TWEAKS[node.type] ?? {}) };
  images.forEach((name, i) => (properties[name] = i === 0 ? asData(PHOTO) : asData(MASK)));
  cases.push({ id: `${node.type}#image`, node: node.type, graph: { nodes: [{ id: "n", type: node.type, properties }], edges: [] } });
}
for (const [type, props] of Object.entries(GENERATORS)) {
  if (!nodes.some((n) => n.type === type)) continue;
  cases.push({
    id: `${type}#small`,
    node: type,
    graph: { nodes: [{ id: "n", type, properties: { width: 20, height: 14, ...props } }], edges: [] }
  });
}

// GPU node chains: the first node's output is a host texture the second
// samples directly. One input arrives as a data: URI.
const chain = (id, node, first, second, input = asData(PHOTO)) => ({
  id,
  node,
  graph: {
    nodes: [
      { id: "a", type: first.type, properties: { image: input, ...(first.props ?? {}) } },
      { id: "b", type: second.type, properties: second.props ?? {} }
    ],
    edges: [{ id: "e1", source: "a", sourceHandle: "output", target: "b", targetHandle: "image" }]
  }
});
cases.push({
  id: "nodetool.image.RotateAndFlip#quarter-turn",
  node: "nodetool.image.RotateAndFlip",
  graph: { nodes: [{ id: "n", type: "nodetool.image.RotateAndFlip", properties: { image: asData(PHOTO), angle: 90, flip_vertical: true } }], edges: [] }
});
cases.push(
  chain("lib.image.color.Invert#after-raw-autocontrast", "lib.image.color.Invert", { type: "lib.image.enhance.AutoContrast" }, { type: "lib.image.color.Invert" }),
  chain("lib.image.enhance.Equalize#after-raw-rank", "lib.image.enhance.Equalize", { type: "lib.image.enhance.RankFilter" }, { type: "lib.image.enhance.Equalize" }),
  chain("lib.image.filter.GaussianBlur#after-invert", "lib.image.filter.GaussianBlur", { type: "lib.image.color.Invert" }, { type: "lib.image.filter.GaussianBlur" }),
  chain("lib.image.effects.DropShadow#after-grade", "lib.image.effects.DropShadow", { type: "lib.image.color.Grade", props: TWEAKS["lib.image.color.Grade"] }, { type: "lib.image.effects.DropShadow" }),
  chain("lib.image.keyer.ChromaKey#data-uri-after-hsb", "lib.image.keyer.ChromaKey", { type: "lib.image.color.HSB", props: TWEAKS["lib.image.color.HSB"] }, { type: "lib.image.keyer.ChromaKey" }, asDataUri(PHOTO))
);

writeFileSync(OUT, JSON.stringify({ cases }, null, 1) + "\n");
console.log(`${cases.length} cases -> ${OUT}`);
