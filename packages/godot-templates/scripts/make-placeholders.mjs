// Writes placeholder art, audio and Godot resources for every template so a
// template runs before any generated asset exists. Plain Node, no deps.
//
//   node packages/godot-templates/scripts/make-placeholders.mjs
//
// Per manifest slot, at the paths the Godot writer emits (`.` in an id → `_`):
//   spritesheet → assets/sprites/<id>.png + <id>.tres (SpriteFrames)
//   tileset     → assets/tiles/<id>.png   + <id>.tres (TileSet, one atlas source)
//   image       → assets/images/<id>.png
//   sfx, music  → assets/audio/<id>.wav   (16-bit mono sine)

import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");

/** Tiles that get a full-cell collision polygon, per template tileset. */
const SOLID_TILES = {
  platformer: () => true,
  topdown: (index) => index >= 4
};

const SHEET_COLUMNS = 8;
const TILE_COLUMNS = 4;

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA pixel buffer → PNG bytes. */
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Grid of solid-colour cells with a 1px dark border each. */
function cellGrid(cellW, cellH, columns, rows, hueOf) {
  const width = cellW * columns;
  const height = cellH * rows;
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = Math.floor(x / cellW);
      const cy = Math.floor(y / cellH);
      const index = cy * columns + cx;
      const lx = x % cellW;
      const ly = y % cellH;
      const border = lx === 0 || ly === 0 || lx === cellW - 1 || ly === cellH - 1;
      const [r, g, b] = border ? [24, 24, 32] : hsl(hueOf(index), 0.55, 0.55);
      const o = (y * width + x) * 4;
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = 255;
    }
  }
  return encodePng(width, height, px);
}

/** Flat colour with a 1px border and a diagonal band, so scrolling is visible. */
function flatImage(width, height, hue) {
  const px = Buffer.alloc(width * height * 4);
  const [r, g, b] = hsl(hue, 0.35, 0.3);
  const [r2, g2, b2] = hsl(hue, 0.35, 0.4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const band = ((x + y) >> 5) % 2 === 0;
      const o = (y * width + x) * 4;
      if (border) {
        px[o] = 24;
        px[o + 1] = 24;
        px[o + 2] = 32;
      } else {
        px[o] = band ? r : r2;
        px[o + 1] = band ? g : g2;
        px[o + 2] = band ? b : b2;
      }
      px[o + 3] = 255;
    }
  }
  return encodePng(width, height, px);
}

// ---------------------------------------------------------------------------
// WAV
// ---------------------------------------------------------------------------

function sineWav(seconds, frequency) {
  const rate = 22050;
  const samples = Math.round(rate * seconds);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const env = Math.min(1, (samples - i) / (rate * 0.05));
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * t) * 0.4 * env * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// ---------------------------------------------------------------------------
// Godot resources
// ---------------------------------------------------------------------------

const fileId = (slotId) => slotId.replaceAll(".", "_");

function spriteFramesTres(id, slot, columns) {
  const [w, h] = slot.cell;
  const frames = Object.values(slot.animations).reduce((a, b) => a + b, 0);
  const lines = [];
  const animations = [];
  let index = 0;
  for (const [name, count] of Object.entries(slot.animations)) {
    const refs = [];
    for (let i = 0; i < count; i++, index++) {
      const x = (index % columns) * w;
      const y = Math.floor(index / columns) * h;
      lines.push(
        `[sub_resource type="AtlasTexture" id="AtlasTexture_${index}"]`,
        `atlas = ExtResource("1_sheet")`,
        `region = Rect2(${x}, ${y}, ${w}, ${h})`,
        ""
      );
      refs.push(`{\n"duration": 1.0,\n"texture": SubResource("AtlasTexture_${index}")\n}`);
    }
    const loop = name !== "die" && name !== "hurt";
    animations.push(
      `{\n"frames": [${refs.join(", ")}],\n"loop": ${loop},\n"name": &"${name}",\n"speed": ${slot.fps}.0\n}`
    );
  }
  return [
    `[gd_resource type="SpriteFrames" load_steps=${frames + 2} format=3]`,
    "",
    `[ext_resource type="Texture2D" path="res://assets/sprites/${id}.png" id="1_sheet"]`,
    "",
    ...lines,
    "[resource]",
    `animations = [${animations.join(", ")}]`,
    ""
  ].join("\n");
}

function tileSetTres(id, slot, columns, isSolid) {
  const [w, h] = slot.cell;
  const tiles = [];
  for (let i = 0; i < slot.count; i++) {
    const x = i % columns;
    const y = Math.floor(i / columns);
    tiles.push(`${x}:${y}/0 = 0`);
    if (isSolid(i)) {
      const hw = w / 2;
      const hh = h / 2;
      tiles.push(
        `${x}:${y}/0/physics_layer_0/polygon_0/points = PackedVector2Array(${-hw}, ${-hh}, ${hw}, ${-hh}, ${hw}, ${hh}, ${-hw}, ${hh})`
      );
    }
  }
  return [
    `[gd_resource type="TileSet" load_steps=3 format=3]`,
    "",
    `[ext_resource type="Texture2D" path="res://assets/tiles/${id}.png" id="1_atlas"]`,
    "",
    `[sub_resource type="TileSetAtlasSource" id="TileSetAtlasSource_0"]`,
    `texture = ExtResource("1_atlas")`,
    `texture_region_size = Vector2i(${w}, ${h})`,
    ...tiles,
    "",
    "[resource]",
    `tile_size = Vector2i(${w}, ${h})`,
    "physics_layer_0/collision_layer = 1",
    `sources/0 = SubResource("TileSetAtlasSource_0")`,
    ""
  ].join("\n");
}

// ---------------------------------------------------------------------------

function write(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  console.log(`wrote ${path}`);
}

function generate(template) {
  const dir = join(TEMPLATES_DIR, template);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  let hue = 20;
  for (const slot of manifest.slots) {
    const id = fileId(slot.id);
    hue = (hue + 47) % 360;
    const base = hue;
    switch (slot.kind) {
      case "spritesheet": {
        const frames = Object.values(slot.animations).reduce((a, b) => a + b, 0);
        const columns = Math.min(SHEET_COLUMNS, frames);
        const rows = Math.ceil(frames / columns);
        write(
          join(dir, "assets/sprites", `${id}.png`),
          cellGrid(slot.cell[0], slot.cell[1], columns, rows, (i) => (base + i * 9) % 360)
        );
        write(join(dir, "assets/sprites", `${id}.tres`), spriteFramesTres(id, slot, columns));
        break;
      }
      case "tileset": {
        const rows = Math.ceil(slot.count / TILE_COLUMNS);
        write(
          join(dir, "assets/tiles", `${id}.png`),
          cellGrid(slot.cell[0], slot.cell[1], TILE_COLUMNS, rows, (i) => (base + i * 13) % 360)
        );
        write(
          join(dir, "assets/tiles", `${id}.tres`),
          tileSetTres(id, slot, TILE_COLUMNS, SOLID_TILES[template] ?? (() => true))
        );
        break;
      }
      case "image":
        write(join(dir, "assets/images", `${id}.png`), flatImage(slot.size[0], slot.size[1], base));
        break;
      case "sfx":
        write(join(dir, "assets/audio", `${id}.wav`), sineWav(0.3, 440 + (base % 5) * 110));
        break;
      case "music":
        write(join(dir, "assets/audio", `${id}.wav`), sineWav(1.0, 220));
        break;
      default:
        throw new Error(`unknown slot kind ${slot.kind}`);
    }
  }
}

for (const entry of readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    generate(entry.name);
  }
}
