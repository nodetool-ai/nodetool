/**
 * Sample a video into still frames, decoded in process.
 *
 * This is what lets a vision model that cannot read a clip still answer
 * questions about one: the bytes are decoded here, a bounded number of frames
 * come back as JPEGs, and the caller sends them as ordinary image content.
 * The only input is a temp file this module wrote.
 */

import { importNodeBuiltin } from "@nodetool-ai/config";
import { loadSharpOrThrow } from "../image-codec.js";
import { loadMediaModule } from "../media-loader.js";
import { withSpan } from "../tracing-helpers.js";
import { mp4DurationSeconds } from "./video-duration.js";

/** A single sampled frame, JPEG-encoded. */
export type SampledFrame = {
  data: Uint8Array;
  mimeType: string;
  /** Seconds into the clip, derived from the sample rate. */
  timeSec: number;
};

export type VideoFrameSample = {
  frames: SampledFrame[];
  /** Clip length from the probe, or null when the probe did not answer. */
  durationSec: number | null;
  /** Frames per second the clip was sampled at. */
  fps: number;
  /**
   * True when the frame cap stopped the sample before the end of the clip.
   * Only reachable with an unknown duration: once the probe answers, the rate is
   * chosen to fit the budget across the whole clip and the cap never bites.
   */
  truncated: boolean;
};

export type SampleVideoFramesOptions = {
  /** Hard cap on frames returned. */
  maxFrames?: number;
  /** Ceiling on the sample rate; a short clip is sampled no denser than this. */
  maxFps?: number;
  /** Longest edge of each frame, in pixels. Frames are never upscaled. */
  maxDimension?: number;
  signal?: AbortSignal;
};

const DEFAULT_MAX_FRAMES = 16;
const DEFAULT_MAX_FPS = 1;
const DEFAULT_MAX_DIMENSION = 768;
/** sharp JPEG quality, about what ffmpeg's `-q:v 4` gave. */
const JPEG_QUALITY = 85;

/** Read a positive number from the environment, or fall back. */
function envNumber(name: string, fallback: number): number {
  const raw = Number(globalThis.process?.env?.[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/** Frame-sampling limits, env-overridable. Read per call so a test can vary them. */
function frameSamplingLimits(): Required<
  Pick<SampleVideoFramesOptions, "maxFrames" | "maxFps" | "maxDimension">
> {
  return {
    maxFrames: Math.floor(
      envNumber("NODETOOL_VIDEO_FRAME_MAX_FRAMES", DEFAULT_MAX_FRAMES)
    ),
    maxFps: envNumber("NODETOOL_VIDEO_FRAME_MAX_FPS", DEFAULT_MAX_FPS),
    maxDimension: Math.floor(
      envNumber("NODETOOL_VIDEO_FRAME_MAX_DIMENSION", DEFAULT_MAX_DIMENSION)
    )
  };
}

async function nodeModules(): Promise<{
  fs: typeof import("node:fs/promises");
  os: typeof import("node:os");
  path: typeof import("node:path");
}> {
  const [fs, os, path] = await Promise.all([
    importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises"),
    importNodeBuiltin<typeof import("node:os")>("node:os"),
    importNodeBuiltin<typeof import("node:path")>("node:path")
  ]);
  if (!fs || !os || !path) {
    throw new Error("Video frame sampling requires Node built-in modules");
  }
  return { fs, os, path };
}

/** Read a video duration from its bytes without decoding frames. */
export async function probeVideoDurationSeconds(
  bytes: Uint8Array,
  signal: AbortSignal
): Promise<number | null> {
  signal.throwIfAborted();
  const mp4Duration = mp4DurationSeconds(bytes);
  if (mp4Duration !== null) {
    signal.throwIfAborted();
    return mp4Duration;
  }
  return withSpan(
    "media.probe_video_duration",
    { "media.byte_length": bytes.byteLength },
    async () => {
      // Loaded on demand: the media module is Node-only, and node-av is the
      // optional media-codecs package.
      const { probeDurationSec } = await loadMediaModule();
      const durationSec = await probeDurationSec(bytes, { signal });
      return durationSec !== null && durationSec > 0 ? durationSec : null;
    }
  );
}

/**
 * The sample rate that spreads `maxFrames` across the whole clip without
 * exceeding `maxFps`. An unknown duration samples at the ceiling and lets the
 * frame cap stop it.
 */
export function frameRateFor(
  durationSec: number | null,
  maxFrames: number,
  maxFps: number
): number {
  if (durationSec === null || durationSec <= 0) return maxFps;
  // The first frame lands at t=0, so N frames need N-1 intervals to reach the
  // end of the clip. Sampling at N/duration instead leaves the tail unseen.
  const spread = maxFrames > 1 ? (maxFrames - 1) / durationSec : 1 / durationSec;
  return Math.min(maxFps, Math.max(spread, 0.01));
}

/**
 * Fit inside a square of `maxDimension` without upscaling. libav's
 * `force_original_aspect_ratio=decrease` would enlarge a smaller frame, which
 * costs tokens and adds no detail.
 */
function scaleFilter(maxDimension: number): string {
  const m = maxDimension;
  return `scale='if(gt(iw,ih),min(${m},iw),-2)':'if(gt(iw,ih),-2,min(${m},ih))'`;
}

/**
 * Decode `bytes` and return up to `maxFrames` JPEG stills spread across the
 * clip.
 */
export async function sampleVideoFrames(
  bytes: Uint8Array,
  options: SampleVideoFramesOptions = {}
): Promise<VideoFrameSample> {
  const limits = frameSamplingLimits();
  const maxFrames = Math.max(1, options.maxFrames ?? limits.maxFrames);
  const maxFps = options.maxFps ?? limits.maxFps;
  const maxDimension = options.maxDimension ?? limits.maxDimension;
  const signal = options.signal ?? new AbortController().signal;

  const { fs, os, path } = await nodeModules();
  const [{ openRgbaFrameReader }, sharp] = await Promise.all([
    loadMediaModule(),
    loadSharpOrThrow()
  ]);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-vframes-"));
  const input = path.join(dir, "input.bin");
  try {
    await fs.writeFile(input, bytes);

    const durationSec = await probeVideoDurationSeconds(bytes, signal);
    const fps = frameRateFor(durationSec, maxFrames, maxFps);

    const reader = await openRgbaFrameReader({
      filePath: input,
      filter: `fps=${fps.toFixed(6)},${scaleFilter(maxDimension)},format=rgba`,
      signal
    });
    if (!reader) throw new Error("The video has no picture to sample");
    const frames: SampledFrame[] = [];
    try {
      while (frames.length < maxFrames) {
        const frame = await reader.next();
        if (!frame) break;
        const jpeg = await sharp(Buffer.from(frame.rgba.buffer, frame.rgba.byteOffset, frame.rgba.byteLength), {
          raw: { width: frame.width, height: frame.height, channels: 4 }
        })
          .jpeg({ quality: JPEG_QUALITY })
          .toBuffer();
        frames.push({
          data: new Uint8Array(jpeg),
          mimeType: "image/jpeg",
          timeSec: frames.length / fps
        });
      }
    } finally {
      await reader.close();
    }
    return {
      frames,
      durationSec,
      fps,
      truncated: durationSec === null && frames.length >= maxFrames
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
