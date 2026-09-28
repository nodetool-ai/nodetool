import sharp from "sharp";
import { z } from "zod";
import { gameLutPreparation, gameSheetPreparation, gameTilesetPreparation } from "@nodetool-ai/protocol";
import type { PreparedFrame, PreparedImage } from "./image-preparation.js";

const MAX_PIXELS = 4096 * 4096;

async function encode(pixels: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  return sharp(pixels, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false }).toBuffer();
}

export async function prepareSheet(bytes: Uint8Array, width: number, height: number,
  settings: z.infer<typeof gameSheetPreparation>): Promise<PreparedImage> {
  if (width % settings.cols !== 0 || height % settings.rows !== 0) {
    throw new Error("Sprite sheet dimensions must be divisible by cols and rows");
  }
  const cellWidth = width / settings.cols;
  const cellHeight = height / settings.rows;
  const baseline = settings.baseline ?? cellHeight - 1;
  if (baseline >= cellHeight) { throw new Error("Sprite sheet baseline must lie inside each cell"); }
  const source = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).ensureAlpha().raw().toBuffer();
  const output = Buffer.alloc(width * height * 4);
  const frames: PreparedFrame[] = [];
  for (let row = 0; row < settings.rows; row += 1) {
    for (let col = 0; col < settings.cols; col += 1) {
      const frame = { x: col * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight };
      frames.push(frame);
      let left = cellWidth;
      let top = cellHeight;
      let right = 0;
      let bottom = 0;
      for (let y = 0; y < cellHeight; y += 1) {
        for (let x = 0; x < cellWidth; x += 1) {
          if (source[((frame.y + y) * width + frame.x + x) * 4 + 3] === 0) { continue; }
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x + 1);
          bottom = Math.max(bottom, y + 1);
        }
      }
      if (bottom === 0) { continue; }
      const poseWidth = right - left;
      const poseHeight = bottom - top;
      if (poseHeight > baseline + 1) { throw new Error(`Sprite sheet baseline would clip pose ${frames.length - 1}`); }
      const xOffset = Math.floor((cellWidth - poseWidth) / 2);
      const yOffset = baseline + 1 - poseHeight;
      for (let y = 0; y < poseHeight; y += 1) {
        const start = ((frame.y + top + y) * width + frame.x + left) * 4;
        source.copy(output, ((frame.y + yOffset + y) * width + frame.x + xOffset) * 4,
          start, start + poseWidth * 4);
      }
    }
  }
  return { bytes: await encode(output, width, height), width, height, originalWidth: width,
    originalHeight: height, frames, baseline };
}

/** Edge bits are top=1, right=2, bottom=4, left=8. Mask zero is the interior tile. */
export async function prepareTileset(bytes: Uint8Array, originalWidth: number, originalHeight: number,
  settings: z.infer<typeof gameTilesetPreparation>, sampling: "nearest" | "linear"): Promise<PreparedImage> {
  const tileWidth = settings.tileWidth;
  const tileHeight = settings.tileHeight;
  const width = tileWidth * 4;
  const height = tileHeight * 4;
  const source = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).ensureAlpha()
    .resize(tileWidth, tileHeight, { fit: "cover", kernel: sampling === "nearest" ? "nearest" : "lanczos3" })
    .raw().toBuffer();
  const output = Buffer.alloc(width * height * 4);
  const tiles: Array<{ mask: number; frame: PreparedFrame }> = [];
  for (let mask = 0; mask < 16; mask += 1) {
    const frame = { x: (mask % 4) * tileWidth, y: Math.floor(mask / 4) * tileHeight, width: tileWidth, height: tileHeight };
    tiles.push({ mask, frame });
    for (let y = 0; y < tileHeight; y += 1) {
      for (let x = 0; x < tileWidth; x += 1) {
        const sourceOffset = (y * tileWidth + x) * 4;
        const destination = ((frame.y + y) * width + frame.x + x) * 4;
        const top = (mask & 1) !== 0 && y < settings.edges;
        const right = (mask & 2) !== 0 && x >= tileWidth - settings.edges;
        const bottom = (mask & 4) !== 0 && y >= tileHeight - settings.edges;
        const left = (mask & 8) !== 0 && x < settings.edges;
        const factor = (top || left ? settings.highlight : 1) * (right || bottom ? settings.shadow : 1);
        for (let channel = 0; channel < 3; channel += 1) {
          output[destination + channel] = Math.min(255, Math.round(source[sourceOffset + channel] * factor));
        }
        output[destination + 3] = source[sourceOffset + 3];
      }
    }
  }
  return { bytes: await encode(output, width, height), width, height, originalWidth, originalHeight, tiles };
}

/** Produce a color cube directly so LUTs never depend on an image model's pixels. */
export async function prepareLut(settings: z.infer<typeof gameLutPreparation>): Promise<PreparedImage> {
  const size = settings.size;
  const width = size * size;
  const height = size;
  const output = Buffer.alloc(width * height * 4);
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const values = [r, g, b].map((value) => value / (size - 1));
        const luma = values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
        const offset = (g * width + b * size + r) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const saturated = luma + (values[channel] - luma) * settings.saturation;
          const contrasted = (saturated - 0.5) * settings.contrast + 0.5 + settings.brightness;
          const lifted = clamp(contrasted + settings.lift[channel]);
          const graded = Math.pow(lifted, 1 / settings.gamma[channel]) * settings.gain[channel];
          output[offset + channel] = Math.round(clamp(graded) * 255);
        }
        output[offset + 3] = 255;
      }
    }
  }
  return { bytes: await encode(output, width, height), width, height, originalWidth: width,
    originalHeight: height, lutSize: size };
}
