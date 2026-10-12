/**
 * psdDecoder – read a layered Photoshop (PSD, version 1) file.
 *
 * Reads 8-bit RGB and grayscale documents: pixel layers with name,
 * visibility, opacity, blend mode, position and transparency lock, layer
 * groups, and the flattened composite. Text, shape and smart-object layers
 * arrive as the pixels Photoshop stored for them. Layer masks, clipping,
 * layer styles and adjustment layers are not applied, and layers without
 * pixels are dropped. Blend modes the sketch editor lacks fall back to
 * normal and are listed in `unsupportedBlendKeys`.
 *
 * Format reference: Adobe Photoshop File Formats Specification.
 */

import {
  blendModeFromPsdKey,
  type PsdDocument,
  type PsdGroup,
  type PsdNode
} from "./psdEncoder";

export interface DecodedPsd extends PsdDocument {
  /** PSD blend keys that were imported as normal. */
  unsupportedBlendKeys: string[];
}

const MODE_GRAYSCALE = 1;
const MODE_RGB = 3;

const SECTION_OPEN_FOLDER = 1;
const SECTION_CLOSED_FOLDER = 2;
const SECTION_DIVIDER = 3;

class ByteReader {
  private readonly view: DataView;
  offset = 0;

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  need(count: number): void {
    if (this.offset + count > this.bytes.length) {
      throw new Error("The PSD file is truncated");
    }
  }

  u8(): number {
    this.need(1);
    return this.bytes[this.offset++];
  }

  u16(): number {
    this.need(2);
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  i16(): number {
    this.need(2);
    const value = this.view.getInt16(this.offset);
    this.offset += 2;
    return value;
  }

  u32(): number {
    this.need(4);
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  i32(): number {
    this.need(4);
    const value = this.view.getInt32(this.offset);
    this.offset += 4;
    return value;
  }

  ascii(count: number): string {
    this.need(count);
    let text = "";
    for (let i = 0; i < count; i++) {
      text += String.fromCharCode(this.bytes[this.offset + i]);
    }
    this.offset += count;
    return text;
  }

  skip(count: number): void {
    this.need(count);
    this.offset += count;
  }
}

// ─── Channel data ────────────────────────────────────────────────────────────

/** Decode PackBits `src[start, start + length)` into `out` from `outOffset`. */
function unpackBits(
  src: Uint8Array,
  start: number,
  length: number,
  out: Uint8Array,
  outOffset: number,
  expected: number
): void {
  let i = start;
  const end = start + length;
  let o = outOffset;
  const limit = outOffset + expected;
  while (i < end && o < limit) {
    const header = src[i++];
    if (header > 128) {
      const count = 257 - header;
      const value = src[i++];
      out.fill(value, o, Math.min(limit, o + count));
      o += count;
    } else if (header < 128) {
      const count = header + 1;
      out.set(src.subarray(i, i + Math.min(count, limit - o)), o);
      i += count;
      o += count;
    }
  }
  if (o < limit) {
    throw new Error("The PSD file has a corrupt compressed row");
  }
}

/**
 * Read `channelCount` planes of `width * height` bytes that share one
 * compression field, as the merged image does.
 */
function readPlanes(
  r: ByteReader,
  compression: number,
  width: number,
  height: number,
  channelCount: number
): Uint8Array[] {
  const size = width * height;
  const planes = Array.from({ length: channelCount }, () => new Uint8Array(size));
  if (compression === 0) {
    for (const plane of planes) {
      r.need(size);
      plane.set(r.bytes.subarray(r.offset, r.offset + size));
      r.offset += size;
    }
    return planes;
  }
  if (compression !== 1) {
    throw new Error(
      "This PSD uses ZIP compression, which is not supported. Re-save it from Photoshop with Maximize Compatibility."
    );
  }
  const rowCounts: number[] = [];
  for (let i = 0; i < channelCount * height; i++) {
    rowCounts.push(r.u16());
  }
  planes.forEach((plane, c) => {
    for (let y = 0; y < height; y++) {
      const count = rowCounts[c * height + y];
      r.need(count);
      unpackBits(r.bytes, r.offset, count, plane, y * width, width);
      r.offset += count;
    }
  });
  return planes;
}

/** Interleave colour planes (1 gray or 3 RGB) and an optional alpha plane. */
function interleave(
  colors: Uint8Array[],
  alpha: Uint8Array | null,
  size: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * 4);
  const [r, g = r, b = r] = colors;
  for (let i = 0; i < size; i++) {
    out[i * 4] = r[i];
    out[i * 4 + 1] = g[i];
    out[i * 4 + 2] = b[i];
    out[i * 4 + 3] = alpha ? alpha[i] : 255;
  }
  return out;
}

// ─── Layer records ───────────────────────────────────────────────────────────

interface LayerRecord {
  name: string;
  top: number;
  left: number;
  width: number;
  height: number;
  channels: Array<{ id: number; length: number }>;
  blendKey: string;
  opacity: number;
  transparencyLocked: boolean;
  visible: boolean;
  sectionType: number;
}

function readLayerRecord(r: ByteReader): LayerRecord {
  const top = r.i32();
  const left = r.i32();
  const bottom = r.i32();
  const right = r.i32();
  const channelCount = r.u16();
  const channels: Array<{ id: number; length: number }> = [];
  for (let c = 0; c < channelCount; c++) {
    channels.push({ id: r.i16(), length: r.u32() });
  }
  const signature = r.ascii(4);
  if (signature !== "8BIM") {
    throw new Error("The PSD file has a corrupt layer record");
  }
  const blendKey = r.ascii(4);
  const opacity = r.u8();
  r.u8(); // clipping
  const flags = r.u8();
  r.u8(); // filler
  const extraLength = r.u32();
  const extraEnd = r.offset + extraLength;
  r.skip(r.u32()); // layer mask data
  r.skip(r.u32()); // blending ranges
  const nameStart = r.offset;
  const nameLength = r.u8();
  let name = r.ascii(nameLength);
  r.offset = nameStart + Math.ceil((nameLength + 1) / 4) * 4;

  let sectionType = 0;
  while (r.offset + 12 <= extraEnd) {
    const signature = r.ascii(4);
    if (signature !== "8BIM" && signature !== "8B64") {
      break;
    }
    const key = r.ascii(4);
    const length = r.u32();
    const dataStart = r.offset;
    if (key === "luni" && length >= 4) {
      const chars = r.u32();
      let unicode = "";
      for (let i = 0; i < chars && r.offset + 2 <= dataStart + length; i++) {
        const code = r.u16();
        if (code !== 0) {
          unicode += String.fromCharCode(code);
        }
      }
      name = unicode;
    } else if ((key === "lsct" || key === "lsdk") && length >= 4) {
      sectionType = r.u32();
    }
    r.offset = dataStart + length;
  }
  r.offset = extraEnd;

  return {
    name,
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    channels,
    blendKey,
    opacity: opacity / 255,
    transparencyLocked: (flags & 0x01) !== 0,
    visible: (flags & 0x02) === 0,
    sectionType
  };
}

/** Read one layer channel; returns null for a channel with no pixels. */
function readLayerChannel(
  r: ByteReader,
  length: number,
  width: number,
  height: number
): Uint8Array | null {
  const end = r.offset + length;
  if (length < 2 || width === 0 || height === 0) {
    r.offset = end;
    return null;
  }
  const compression = r.u16();
  const [plane] = readPlanes(r, compression, width, height, 1);
  r.offset = end;
  return plane;
}

/** Assemble records (bottom to top) into a tree using section dividers. */
function buildTree(
  records: LayerRecord[],
  pixels: Array<Uint8ClampedArray | null>,
  unsupported: Set<string>
): PsdNode[] {
  const root: PsdNode[] = [];
  const stack: PsdNode[][] = [root];
  records.forEach((record, index) => {
    const siblings = stack[stack.length - 1];
    if (record.sectionType === SECTION_DIVIDER) {
      stack.push([]);
      return;
    }
    if (
      record.sectionType === SECTION_OPEN_FOLDER ||
      record.sectionType === SECTION_CLOSED_FOLDER
    ) {
      const children = stack.length > 1 ? stack.pop()! : [];
      const group: PsdGroup = {
        kind: "group",
        name: record.name,
        visible: record.visible,
        opacity: record.opacity,
        collapsed: record.sectionType === SECTION_CLOSED_FOLDER,
        children
      };
      stack[stack.length - 1].push(group);
      return;
    }
    const layerPixels = pixels[index];
    if (!layerPixels) {
      return;
    }
    const blendMode = blendModeFromPsdKey(record.blendKey);
    if (!blendMode) {
      unsupported.add(record.blendKey);
    }
    siblings.push({
      kind: "layer",
      name: record.name,
      visible: record.visible,
      opacity: record.opacity,
      blendMode: blendMode ?? "normal",
      transparencyLocked: record.transparencyLocked,
      left: record.left,
      top: record.top,
      width: record.width,
      height: record.height,
      pixels: layerPixels
    });
  });
  // An unterminated divider: keep its layers at the root.
  while (stack.length > 1) {
    const orphans = stack.pop()!;
    stack[stack.length - 1].push(...orphans);
  }
  return root;
}

// ─── Document ────────────────────────────────────────────────────────────────

/** Decode a PSD file. Throws a user-readable error for unsupported files. */
export function decodePsd(bytes: Uint8Array): DecodedPsd {
  const r = new ByteReader(bytes);
  if (bytes.length < 26 || r.ascii(4) !== "8BPS") {
    throw new Error("Not a Photoshop (PSD) file");
  }
  const version = r.u16();
  if (version !== 1) {
    throw new Error("Large-document (PSB) files are not supported");
  }
  r.skip(6);
  const channelCount = r.u16();
  const height = r.u32();
  const width = r.u32();
  const depth = r.u16();
  const mode = r.u16();
  if (depth !== 8) {
    throw new Error(`Only 8-bit PSD files are supported (this one is ${depth}-bit)`);
  }
  if (mode !== MODE_RGB && mode !== MODE_GRAYSCALE) {
    throw new Error("Only RGB and grayscale PSD files are supported");
  }
  const colorCount = mode === MODE_RGB ? 3 : 1;
  if (channelCount < colorCount || width < 1 || height < 1) {
    throw new Error("The PSD file has an invalid header");
  }

  r.skip(r.u32()); // color mode data
  r.skip(r.u32()); // image resources

  const layerMaskLength = r.u32();
  const layerMaskEnd = r.offset + layerMaskLength;
  let layers: PsdNode[] = [];
  let compositeHasAlpha = false;
  const unsupported = new Set<string>();
  if (layerMaskLength > 0) {
    const layerInfoLength = r.u32();
    const layerInfoEnd = r.offset + layerInfoLength;
    if (layerInfoLength > 0) {
      const rawCount = r.i16();
      compositeHasAlpha = rawCount < 0;
      const count = Math.abs(rawCount);
      const records: LayerRecord[] = [];
      for (let i = 0; i < count; i++) {
        records.push(readLayerRecord(r));
      }
      const pixels = records.map((record) => {
        const planes = new Map<number, Uint8Array | null>();
        for (const channel of record.channels) {
          // Mask channels (-2, -3) cover the mask's own rectangle; skip them.
          if (channel.id < -1) {
            r.skip(channel.length);
            continue;
          }
          planes.set(
            channel.id,
            readLayerChannel(r, channel.length, record.width, record.height)
          );
        }
        const colors = Array.from({ length: colorCount }, (_, c) => planes.get(c));
        if (colors.some((plane) => !plane)) {
          return null;
        }
        return interleave(
          colors as Uint8Array[],
          planes.get(-1) ?? null,
          record.width * record.height
        );
      });
      layers = buildTree(records, pixels, unsupported);
    }
    r.offset = layerInfoEnd;
  }
  r.offset = layerMaskEnd;

  const compression = r.u16();
  const planes = readPlanes(r, compression, width, height, channelCount);
  const composite = interleave(
    planes.slice(0, colorCount),
    compositeHasAlpha && channelCount > colorCount ? planes[colorCount] : null,
    width * height
  );

  return {
    width,
    height,
    composite,
    layers,
    unsupportedBlendKeys: [...unsupported]
  };
}
