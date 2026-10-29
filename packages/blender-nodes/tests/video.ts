/**
 * MP4 assertions for the `render_animation` suite (T4), decoded in process
 * with the runtime's media helper.
 */

import { readRgbaFrames, inspectMedia, videoStreamFormat } from "@nodetool-ai/runtime/media/testing";

import type { DecodedPng } from "./png.js";

export interface VideoProbe {
  frames: number;
  fps: number;
  pixFmt: string;
  codec: string;
  width: number;
  height: number;
}

/** Frame count, fps, pixel format, codec, and size. */
export async function probeVideo(file: string): Promise<VideoProbe> {
  const report = await inspectMedia(file);
  const format = await videoStreamFormat(file);
  return {
    frames: report.frameTimes.length,
    fps: report.video?.averageFps ?? 0,
    pixFmt: format?.pixelFormat ?? "",
    codec: format?.codec ?? "",
    width: report.video?.width ?? 0,
    height: report.video?.height ?? 0
  };
}

/** Decode one frame (0-based) to RGB pixels. */
export async function extractFrame(video: string, index: number): Promise<DecodedPng> {
  const { video: stream } = await inspectMedia(video);
  if (!stream) throw new Error(`${video} has no video stream`);
  const frames = await readRgbaFrames(video, { width: stream.width, height: stream.height });
  const rgba = frames[index];
  if (!rgba) throw new Error(`${video} has no frame ${index}`);
  const pixels = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) {
    pixels[o] = rgba[i]!;
    pixels[o + 1] = rgba[i + 1]!;
    pixels[o + 2] = rgba[i + 2]!;
  }
  return { width: stream.width, height: stream.height, channels: 3, pixels };
}

/** Mean absolute per-channel difference in [0, 255]. */
export function meanAbsDiff(a: DecodedPng, b: DecodedPng): number {
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) {
    throw new Error("frame sizes disagree");
  }
  let total = 0;
  for (let i = 0; i < a.pixels.length; i++) total += Math.abs(a.pixels[i]! - b.pixels[i]!);
  return total / a.pixels.length;
}

/** Mean x of pixels brighter than `threshold` (grayscale mean). */
export function brightCentroidX(image: DecodedPng, threshold = 100): number {
  const { width, channels, pixels } = image;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < width * image.height; i++) {
    const mean = (pixels[i * channels]! + pixels[i * channels + 1]! + pixels[i * channels + 2]!) / 3;
    if (mean > threshold) {
      sum += i % width;
      count += 1;
    }
  }
  if (count === 0) throw new Error("no bright pixels for the centroid");
  return sum / count;
}
