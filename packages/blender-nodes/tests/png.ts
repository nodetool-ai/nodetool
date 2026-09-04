/**
 * Minimal PNG decoder for the Blender render assertions (T4).
 *
 * Handles 8-bit RGB/RGBA non-interlaced output — everything Blender's PNG
 * writer produces — with no dependency. Enough to assert a render decodes,
 * has the requested size, and is not a flat field.
 */

import { inflateSync } from "node:zlib";

export interface DecodedPng {
  width: number;
  height: number;
  channels: number;
  pixels: Uint8Array;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function hasPngSignature(png: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, i) => png[i] === byte);
}

export function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export function decodePng(png: Uint8Array): DecodedPng {
  if (!hasPngSignature(png)) throw new Error("not a PNG");
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 1;
  const idat: number[] = [];
  while (pos < png.length) {
    const length = view.getUint32(pos);
    const type =
      String.fromCharCode(png[pos + 4]!) +
      String.fromCharCode(png[pos + 5]!) +
      String.fromCharCode(png[pos + 6]!) +
      String.fromCharCode(png[pos + 7]!);
    const data = png.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      const header = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = header.getUint32(0);
      height = header.getUint32(4);
      bitDepth = header.getUint8(8);
      colorType = header.getUint8(9);
      interlace = header.getUint8(12);
    } else if (type === "IDAT") {
      for (const byte of data) idat.push(byte);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + length;
  }
  if (bitDepth !== 8 || interlace !== 0) {
    throw new Error(`unsupported PNG (depth ${bitDepth}, interlace ${interlace})`);
  }
  const channelsByType: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const channels = channelsByType[colorType];
  if (!channels) throw new Error(`unsupported color type ${colorType}`);

  const raw = inflateSync(new Uint8Array(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * channels);
  let prev = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p]!;
    p += 1;
    const line = new Uint8Array(raw.subarray(p, p + stride));
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      if (filter === 1) line[i] = (line[i]! + a) & 255;
      else if (filter === 2) line[i] = (line[i]! + b) & 255;
      else if (filter === 3) line[i] = (line[i]! + ((a + b) >> 1)) & 255;
      else if (filter === 4) line[i] = (line[i]! + paeth(a, b, c)) & 255;
      else if (filter !== 0) throw new Error(`bad filter ${filter}`);
    }
    pixels.set(line, y * stride);
    prev = line;
  }
  return { width, height, channels, pixels };
}

/** Fraction of pixels equal to the most common RGB triple, in [0, 1]. */
export function topColorFraction(image: DecodedPng): number {
  const counts = new Map<number, number>();
  const { width, height, channels, pixels } = image;
  for (let i = 0; i < width * height; i++) {
    const key =
      (pixels[i * channels]! << 16) |
      (pixels[i * channels + 1]! << 8) |
      pixels[i * channels + 2]!;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(...counts.values()) / (width * height);
}

/** Mean RGB brightness of the center pixel. */
export function centerBrightness(image: DecodedPng): number {
  const { width, height, channels, pixels } = image;
  const at = ((height >> 1) * width + (width >> 1)) * channels;
  return (pixels[at]! + pixels[at + 1]! + pixels[at + 2]!) / 3;
}
