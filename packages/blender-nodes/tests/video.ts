/**
 * MP4 assertions for the `render_animation` suite (T4).
 *
 * Decoding and frame counting run through the system `ffprobe`/`ffmpeg`
 * (test-only: the package itself needs neither, per D5). Skipped when the
 * binaries are absent, the way the Blender suites skip without Blender.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { decodePng, type DecodedPng } from "./png.js";

export interface VideoProbe {
  frames: number;
  fps: number;
  pixFmt: string;
  codec: string;
  width: number;
  height: number;
}

function onPath(name: string): boolean {
  const pathEnv = process.env["PATH"] ?? "";
  return pathEnv.split(path.delimiter).some((dir) => {
    try {
      return dir !== "" && existsSync(path.join(dir, name));
    } catch {
      return false;
    }
  });
}

/** ffprobe and ffmpeg both resolve. */
export function ffmpegAvailable(): boolean {
  const exe = process.platform === "win32" ? ".exe" : "";
  return onPath(`ffprobe${exe}`) && onPath(`ffmpeg${exe}`);
}

/**
 * Fail the suite when Blender runs are required but ffmpeg is missing. Call
 * at module scope of every suite that decodes video, next to
 * `failWhenBlenderRequired`: CI sets `NODETOOL_REQUIRE_BLENDER=1` and
 * installs ffmpeg, so a skipped animation suite there is a broken install
 * rather than a pass.
 */
export function failWhenFfmpegRequired(): void {
  if (
    process.env["NODETOOL_REQUIRE_BLENDER"] === "1" &&
    !ffmpegAvailable()
  ) {
    throw new Error(
      "NODETOOL_REQUIRE_BLENDER=1 is set but ffprobe/ffmpeg were not found " +
        "on PATH. Install ffmpeg, or unset the variable to allow skips."
    );
  }
}

function ffprobeName(): string {
  return process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
}

function ffmpegName(): string {
  return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}

/** Frame count (decoded, exact), fps, pixel format, codec, and size. */
export function probeVideo(file: string): VideoProbe {
  const raw = execFileSync(
    ffprobeName(),
    [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=nb_read_frames,avg_frame_rate,pix_fmt,codec_name,width,height",
      "-of",
      "default=noprint_wrappers=1",
      file
    ],
    { encoding: "utf8", timeout: 120_000 }
  );
  const fields = Object.fromEntries(
    raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("="))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at), line.slice(at + 1)];
      })
  );
  const [num, den] = String(fields["avg_frame_rate"] ?? "0/1").split("/").map(Number);
  return {
    frames: Number(fields["nb_read_frames"]),
    fps: den ? num! / den! : 0,
    pixFmt: String(fields["pix_fmt"] ?? ""),
    codec: String(fields["codec_name"] ?? ""),
    width: Number(fields["width"]),
    height: Number(fields["height"])
  };
}

/** Decode one frame (0-based) to RGB pixels via ffmpeg PNG extraction. */
export function extractFrame(video: string, index: number): DecodedPng {
  const dir = mkdtempSync(path.join(os.tmpdir(), "blender-frame-"));
  try {
    const out = path.join(dir, "frame.png");
    execFileSync(
      ffmpegName(),
      [
        "-y",
        "-v",
        "error",
        "-i",
        video,
        "-vf",
        `select=eq(n\\,${index})`,
        "-vsync",
        "0",
        out
      ],
      { timeout: 120_000 }
    );
    return decodePng(new Uint8Array(readFileSync(out)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
