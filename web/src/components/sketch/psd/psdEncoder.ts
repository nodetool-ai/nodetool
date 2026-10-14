/**
 * psdEncoder – minimal layered Photoshop (PSD, version 1) writer.
 * `decodePsd` in `psdDecoder.ts` reads files back.
 *
 * Writes 8-bit RGB documents with:
 * - pixel layers carrying name, visibility, opacity, blend mode, position and
 *   transparency lock,
 * - layer groups (section dividers, pass-through blending),
 * - a flattened RGBA composite, so viewers that ignore layers still show the
 *   image.
 *
 * Channel data is PackBits (RLE) compressed. Layers are given bottom to top,
 * the order PSD stores them in.
 *
 * Format reference: Adobe Photoshop File Formats Specification,
 * "Layer and Mask Information Section".
 */

import type { BlendMode } from "../types";

/** PSD (version 1) caps each dimension at 30,000 pixels. */
export const PSD_MAX_DIMENSION = 30000;

export interface PsdPixelLayer {
  kind: "layer";
  name: string;
  visible: boolean;
  /** 0–1. */
  opacity: number;
  blendMode: BlendMode;
  /** When true, painting in Photoshop keeps the layer's transparency. */
  transparencyLocked?: boolean;
  /** Document-space position of the pixel rectangle. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Straight (non-premultiplied) RGBA, `width * height * 4` bytes. */
  pixels: Uint8ClampedArray;
}

export interface PsdGroup {
  kind: "group";
  name: string;
  visible: boolean;
  /** 0–1. */
  opacity: number;
  /** Collapsed in Photoshop's layers panel. */
  collapsed: boolean;
  /** Bottom to top. */
  children: PsdNode[];
}

export type PsdNode = PsdPixelLayer | PsdGroup;

export interface PsdDocument {
  width: number;
  height: number;
  /** Flattened straight RGBA, `width * height * 4` bytes. */
  composite: Uint8ClampedArray;
  /** Bottom to top. */
  layers: PsdNode[];
}

const BLEND_KEYS: Record<BlendMode, string> = {
  normal: "norm",
  multiply: "mul ",
  screen: "scrn",
  overlay: "over",
  darken: "dark",
  lighten: "lite",
  "color-dodge": "div ",
  "color-burn": "idiv",
  "hard-light": "hLit",
  "soft-light": "sLit",
  difference: "diff",
  exclusion: "smud",
  add: "lddg"
};

export function psdBlendKey(mode: BlendMode): string {
  return BLEND_KEYS[mode] ?? "norm";
}

/** The sketch blend mode for a PSD blend key, or null when it has none. */
export function blendModeFromPsdKey(key: string): BlendMode | null {
  for (const [mode, psdKey] of Object.entries(BLEND_KEYS)) {
    if (psdKey === key) {
      return mode as BlendMode;
    }
  }
  return null;
}

// ─── Byte writer ─────────────────────────────────────────────────────────────

class ByteWriter {
  private buffer = new Uint8Array(1 << 16);
  private view = new DataView(this.buffer.buffer);
  length = 0;

  private ensure(extra: number): void {
    const needed = this.length + extra;
    if (needed <= this.buffer.length) {
      return;
    }
    let size = this.buffer.length * 2;
    while (size < needed) {
      size *= 2;
    }
    const next = new Uint8Array(size);
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
    this.view = new DataView(next.buffer);
  }

  u8(value: number): void {
    this.ensure(1);
    this.buffer[this.length++] = value;
  }

  u16(value: number): void {
    this.ensure(2);
    this.view.setUint16(this.length, value);
    this.length += 2;
  }

  i16(value: number): void {
    this.ensure(2);
    this.view.setInt16(this.length, value);
    this.length += 2;
  }

  u32(value: number): void {
    this.ensure(4);
    this.view.setUint32(this.length, value);
    this.length += 4;
  }

  i32(value: number): void {
    this.ensure(4);
    this.view.setInt32(this.length, value);
    this.length += 4;
  }

  ascii(text: string): void {
    for (let i = 0; i < text.length; i++) {
      this.u8(text.charCodeAt(i) & 0x7f);
    }
  }

  bytes(data: Uint8Array): void {
    this.ensure(data.length);
    this.buffer.set(data, this.length);
    this.length += data.length;
  }

  zeros(count: number): void {
    this.ensure(count);
    this.buffer.fill(0, this.length, this.length + count);
    this.length += count;
  }

  /** Reserve a u32 length field; returns its offset for {@link patchLength}. */
  reserveLength(): number {
    const offset = this.length;
    this.u32(0);
    return offset;
  }

  /** Write the byte count since the reserved field into it. */
  patchLength(offset: number): void {
    this.view.setUint32(offset, this.length - offset - 4);
  }

  /** Pad with zeros until the length since `start` is a multiple of `n`. */
  padFrom(start: number, n: number): void {
    const rem = (this.length - start) % n;
    if (rem !== 0) {
      this.zeros(n - rem);
    }
  }

  result(): Uint8Array<ArrayBuffer> {
    return this.buffer.slice(0, this.length);
  }
}

// ─── PackBits ────────────────────────────────────────────────────────────────

/**
 * PackBits-encode one row of one channel. `src` is interleaved RGBA, so the
 * row's samples are `src[start + i * 4]`. Returns the encoded byte count.
 */
function packBitsRow(
  src: Uint8ClampedArray,
  start: number,
  count: number,
  out: Uint8Array,
  outOffset: number
): number {
  let o = outOffset;
  let i = 0;
  const at = (k: number): number => src[start + k * 4];
  while (i < count) {
    let run = 1;
    while (i + run < count && run < 128 && at(i + run) === at(i)) {
      run++;
    }
    if (run >= 3) {
      out[o++] = 257 - run;
      out[o++] = at(i);
      i += run;
      continue;
    }
    let end = i;
    while (end < count && end - i < 128) {
      if (
        end + 2 < count &&
        at(end) === at(end + 1) &&
        at(end) === at(end + 2)
      ) {
        break;
      }
      end++;
    }
    out[o++] = end - i - 1;
    for (let k = i; k < end; k++) {
      out[o++] = at(k);
    }
    i = end;
  }
  return o - outOffset;
}

/**
 * RLE-compress one channel (`channelIndex` 0–3 of interleaved RGBA) into
 * per-row byte counts followed by the packed rows.
 */
function encodeChannel(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  channelIndex: number
): { rowCounts: Uint16Array; data: Uint8Array } {
  const rowCounts = new Uint16Array(height);
  const maxRow = width + Math.ceil(width / 128);
  const scratch = new Uint8Array(maxRow * height);
  let length = 0;
  for (let y = 0; y < height; y++) {
    const n = packBitsRow(
      pixels,
      y * width * 4 + channelIndex,
      width,
      scratch,
      length
    );
    rowCounts[y] = n;
    length += n;
  }
  return { rowCounts, data: scratch.subarray(0, length) };
}

// ─── Layer records ───────────────────────────────────────────────────────────

/** PSD channel ids in the order each record lists them: alpha, R, G, B. */
const LAYER_CHANNELS: ReadonlyArray<{ id: number; rgbaIndex: number }> = [
  { id: -1, rgbaIndex: 3 },
  { id: 0, rgbaIndex: 0 },
  { id: 1, rgbaIndex: 1 },
  { id: 2, rgbaIndex: 2 }
];

const SECTION_OPEN_FOLDER = 1;
const SECTION_CLOSED_FOLDER = 2;
const SECTION_DIVIDER = 3;

interface FlatRecord {
  name: string;
  visible: boolean;
  opacity: number;
  blendKey: string;
  transparencyLocked: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray | null;
  /** lsct section type, absent for pixel layers. */
  sectionType?: number;
}

/** Flatten the tree into PSD record order (bottom to top, dividers first). */
function flattenNodes(nodes: PsdNode[], out: FlatRecord[]): void {
  for (const node of nodes) {
    if (node.kind === "layer") {
      out.push({
        name: node.name,
        visible: node.visible,
        opacity: node.opacity,
        blendKey: psdBlendKey(node.blendMode),
        transparencyLocked: node.transparencyLocked ?? false,
        left: node.left,
        top: node.top,
        width: node.width,
        height: node.height,
        pixels: node.width > 0 && node.height > 0 ? node.pixels : null
      });
      continue;
    }
    const empty = {
      blendKey: "pass",
      transparencyLocked: false,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      pixels: null
    };
    out.push({
      ...empty,
      name: "</Layer group>",
      visible: true,
      opacity: 1,
      blendKey: "norm",
      sectionType: SECTION_DIVIDER
    });
    flattenNodes(node.children, out);
    out.push({
      ...empty,
      name: node.name,
      visible: node.visible,
      opacity: node.opacity,
      sectionType: node.collapsed ? SECTION_CLOSED_FOLDER : SECTION_OPEN_FOLDER
    });
  }
}

function toByte(opacity: number): number {
  return Math.round(Math.min(1, Math.max(0, opacity)) * 255);
}

function writePascalName(w: ByteWriter, name: string): void {
  // Legacy name field: ASCII only; `luni` carries the full Unicode name.
  const ascii = name.replace(/[^\x20-\x7e]/g, "?").slice(0, 255);
  const start = w.length;
  w.u8(ascii.length);
  w.ascii(ascii);
  w.padFrom(start, 4);
}

function writeUnicodeName(w: ByteWriter, name: string): void {
  w.ascii("8BIM");
  w.ascii("luni");
  const lengthOffset = w.reserveLength();
  const start = w.length;
  w.u32(name.length);
  for (let i = 0; i < name.length; i++) {
    w.u16(name.charCodeAt(i));
  }
  w.padFrom(start, 4);
  w.patchLength(lengthOffset);
}

function writeSectionDivider(w: ByteWriter, record: FlatRecord): void {
  if (record.sectionType === undefined) {
    return;
  }
  w.ascii("8BIM");
  w.ascii("lsct");
  if (record.sectionType === SECTION_DIVIDER) {
    w.u32(4);
    w.u32(record.sectionType);
    return;
  }
  w.u32(12);
  w.u32(record.sectionType);
  w.ascii("8BIM");
  w.ascii(record.blendKey);
}

// ─── Document ────────────────────────────────────────────────────────────────

function validateDocument(doc: PsdDocument): void {
  const { width, height } = doc;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > PSD_MAX_DIMENSION ||
    height > PSD_MAX_DIMENSION
  ) {
    throw new Error(
      `PSD export supports 1–${PSD_MAX_DIMENSION} px per side, got ${width}×${height}`
    );
  }
  if (doc.composite.length !== width * height * 4) {
    throw new Error("PSD composite size does not match the document size");
  }
}

/** Encode a layered PSD file. */
export function encodePsd(doc: PsdDocument): Uint8Array<ArrayBuffer> {
  validateDocument(doc);
  const records: FlatRecord[] = [];
  flattenNodes(doc.layers, records);

  const channelData = records.map((record) => {
    if (!record.pixels) {
      return null;
    }
    if (record.pixels.length !== record.width * record.height * 4) {
      throw new Error(`PSD layer "${record.name}" has a mismatched pixel buffer`);
    }
    const pixels = record.pixels;
    return LAYER_CHANNELS.map((channel) =>
      encodeChannel(pixels, record.width, record.height, channel.rgbaIndex)
    );
  });

  const w = new ByteWriter();

  // Header
  w.ascii("8BPS");
  w.u16(1);
  w.zeros(6);
  w.u16(4);
  w.u32(doc.height);
  w.u32(doc.width);
  w.u16(8);
  w.u16(3);

  // Color mode data and image resources: none.
  w.u32(0);
  w.u32(0);

  // Layer and mask information
  const layerMaskOffset = w.reserveLength();
  const layerInfoOffset = w.reserveLength();
  const layerInfoStart = w.length;
  // Negative count: the composite's first alpha channel is its transparency.
  w.i16(records.length === 0 ? 0 : -records.length);

  records.forEach((record, index) => {
    const channels = channelData[index];
    w.i32(record.top);
    w.i32(record.left);
    w.i32(record.top + (channels ? record.height : 0));
    w.i32(record.left + (channels ? record.width : 0));
    w.u16(LAYER_CHANNELS.length);
    LAYER_CHANNELS.forEach((channel, c) => {
      w.i16(channel.id);
      const encoded = channels?.[c];
      w.u32(
        encoded ? 2 + encoded.rowCounts.length * 2 + encoded.data.length : 2
      );
    });
    w.ascii("8BIM");
    w.ascii(record.blendKey);
    w.u8(toByte(record.opacity));
    w.u8(0);
    let flags = 0;
    if (record.transparencyLocked) {
      flags |= 0x01;
    }
    if (!record.visible) {
      flags |= 0x02;
    }
    if (record.sectionType !== undefined) {
      // Bit 3 says bit 4 is meaningful; bit 4 marks pixel data irrelevant.
      flags |= 0x18;
    }
    w.u8(flags);
    w.u8(0);

    const extraOffset = w.reserveLength();
    w.u32(0); // layer mask data
    w.u32(0); // blending ranges
    writePascalName(w, record.name);
    writeUnicodeName(w, record.name);
    writeSectionDivider(w, record);
    w.patchLength(extraOffset);
  });

  channelData.forEach((channels) => {
    for (let c = 0; c < LAYER_CHANNELS.length; c++) {
      const encoded = channels?.[c];
      if (!encoded) {
        w.u16(0);
        continue;
      }
      w.u16(1);
      for (const count of encoded.rowCounts) {
        w.u16(count);
      }
      w.bytes(encoded.data);
    }
  });
  w.padFrom(layerInfoStart, 2);
  w.patchLength(layerInfoOffset);
  w.u32(0); // global layer mask info
  w.patchLength(layerMaskOffset);

  // Image data: the flattened composite, channels R, G, B, A.
  const composite = [0, 1, 2, 3].map((c) =>
    encodeChannel(doc.composite, doc.width, doc.height, c)
  );
  w.u16(1);
  for (const channel of composite) {
    for (const count of channel.rowCounts) {
      w.u16(count);
    }
  }
  for (const channel of composite) {
    w.bytes(channel.data);
  }

  return w.result();
}
