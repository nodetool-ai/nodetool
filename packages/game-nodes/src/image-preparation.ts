import sharp from "sharp";
import { z } from "zod";
import { gameImagePreparation } from "@nodetool-ai/protocol";
import { prepareSheet, prepareTileset, prepareLut } from "./atlas-preparation.js";

const MAX_DIMENSION = 4096;
const dimension = z.number().int().min(1).max(MAX_DIMENSION);
export const imagePreparationSettings = gameImagePreparation.extend({
  trimAlpha: z.boolean().default(false),
  targetWidth: dimension.optional(),
  targetHeight: dimension.optional(),
  cropPolicy: z.enum(["cover", "contain", "stretch"]).optional(),
  mirrorX: z.boolean().default(false),
  mirrorY: z.boolean().default(false),
  pivot: z.strictObject({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).default({ x: 0.5, y: 0.5 }),
  sampling: z.enum(["nearest", "linear"]).default("nearest")
}).refine((settings) => (settings.targetWidth === undefined) === (settings.targetHeight === undefined),
  "targetWidth and targetHeight must be set together")
  .refine((settings) => !settings.cropPolicy || settings.targetWidth !== undefined,
    "cropPolicy needs targetWidth and targetHeight")
  .refine((settings) => !(settings.trimAlpha && (settings.mirrorX || settings.mirrorY)),
    "alpha trimming and mirror tiling cannot be combined")
  .refine((settings) => [settings.sheet, settings.tileset, settings.lut].filter(Boolean).length <= 1,
    "choose only one of sheet, tileset or lut")
  .refine((settings) => !(settings.sheet || settings.tileset || settings.lut) ||
    !(settings.trimAlpha || settings.targetWidth || settings.mirrorX || settings.mirrorY),
    "sheet, tileset and lut cannot be combined with single-image transforms");
export type ImagePreparationSettings = z.infer<typeof imagePreparationSettings>;
/** One slot's `preparation` entry as a graph supplies it, before defaults apply. */
export type ImagePreparationInput = z.input<typeof imagePreparationSettings>;

export interface PreparedImage {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly originalWidth: number;
  readonly originalHeight: number;
  readonly trim?: { readonly sourceWidth: number; readonly sourceHeight: number; readonly x: number; readonly y: number };
  readonly frames?: readonly PreparedFrame[];
  readonly baseline?: number;
  readonly tiles?: readonly { readonly mask: number; readonly frame: PreparedFrame }[];
  readonly lutSize?: number;
}
export interface PreparedFrame { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export function imagePreparationMetadata(settings: ImagePreparationSettings): NonNullable<import("@nodetool-ai/protocol").GameAssetBinding["preparation"]> {
  const { pivot: _pivot, sampling: _sampling, ...metadata } = settings;
  return metadata;
}

/** Decode, transform and encode canonical PNG bytes before a digest is computed. */
export async function prepareGameImage(bytes: Uint8Array, settings: ImagePreparationSettings): Promise<PreparedImage> {
  if (settings.lut) { return prepareLut(settings.lut); }
  const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_DIMENSION * MAX_DIMENSION }).metadata();
  const originalWidth = metadata.width;
  const originalHeight = metadata.height;
  if (!originalWidth || !originalHeight || originalWidth > MAX_DIMENSION || originalHeight > MAX_DIMENSION) {
    throw new Error("Game image has invalid dimensions");
  }
  if (settings.sheet) { return prepareSheet(bytes, originalWidth, originalHeight, settings.sheet); }
  if (settings.tileset) { return prepareTileset(bytes, originalWidth, originalHeight, settings.tileset, settings.sampling); }
  const resized = sharp(bytes, { failOn: "error", limitInputPixels: MAX_DIMENSION * MAX_DIMENSION }).ensureAlpha();
  if (settings.targetWidth && settings.targetHeight) {
    resized.resize(settings.targetWidth, settings.targetHeight, {
      fit: settings.cropPolicy === "stretch" ? "fill" : settings.cropPolicy ?? "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: settings.sampling === "nearest" ? "nearest" : "lanczos3"
    });
  }
  const decoded = await resized.raw().toBuffer({ resolveWithObject: true });
  const source = decoded.data;
  const sourceWidth = decoded.info.width;
  const sourceHeight = decoded.info.height;
  let left = 0;
  let top = 0;
  let right = sourceWidth;
  let bottom = sourceHeight;
  if (settings.trimAlpha) {
    left = sourceWidth;
    top = sourceHeight;
    right = 0;
    bottom = 0;
    for (let y = 0; y < sourceHeight; y += 1) {
      for (let x = 0; x < sourceWidth; x += 1) {
        if (source[(y * sourceWidth + x) * 4 + 3] === 0) { continue; }
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
    }
    if (right === 0 || bottom === 0) { throw new Error("Cannot trim a fully transparent game image"); }
  }
  const contentWidth = right - left;
  const contentHeight = bottom - top;
  const width = contentWidth * (settings.mirrorX ? 2 : 1);
  const height = contentHeight * (settings.mirrorY ? 2 : 1);
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) { throw new Error("Prepared game image exceeds 4096 pixels per axis"); }
  const output = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const localY = y < contentHeight ? y : 2 * contentHeight - y - 1;
    for (let x = 0; x < width; x += 1) {
      const localX = x < contentWidth ? x : 2 * contentWidth - x - 1;
      const sourceOffset = ((top + localY) * sourceWidth + left + localX) * 4;
      source.copy(output, (y * width + x) * 4, sourceOffset, sourceOffset + 4);
    }
  }
  const prepared = await sharp(output, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9, palette: false }).toBuffer();
  const decodedPrepared = await sharp(prepared).metadata();
  if (decodedPrepared.width !== width || decodedPrepared.height !== height) { throw new Error("Prepared image dimensions changed during encoding"); }
  const trimmed = left !== 0 || top !== 0 || contentWidth !== sourceWidth || contentHeight !== sourceHeight;
  const result = { bytes: prepared, width, height, originalWidth, originalHeight };
  if (trimmed) { return { ...result, trim: { sourceWidth, sourceHeight, x: left, y: top } }; }
  return result;
}
