/**
 * Sample a video into still frames with ffmpeg.
 *
 * This is what lets a vision model that cannot read a clip still answer
 * questions about one: the bytes are decoded here, a bounded number of frames
 * come back as JPEGs, and the caller sends them as ordinary image content.
 *
 * The argv is ours, not a model's — the only input path is a temp file this
 * module wrote — so the containment `packages/agents/src/host-binary-guard.ts`
 * applies to a model-supplied argv is not needed. `-protocol_whitelist file`
 * and `-nostdin` still go in: an mp4 can name an external opener, and a child
 * that inherits the server's stdin outlives the call.
 */

import { importNodeBuiltin } from "@nodetool-ai/config";

/** A single sampled frame, JPEG-encoded. */
export type SampledFrame = {
  data: Uint8Array;
  mimeType: string;
  /** Seconds into the clip, derived from the sample rate. */
  timeSec: number;
};

export type VideoFrameSample = {
  frames: SampledFrame[];
  /** Clip length from ffprobe, or null when the probe did not answer. */
  durationSec: number | null;
  /** Frames per second actually requested of ffmpeg. */
  fps: number;
  /**
   * True when the frame cap stopped the sample before the end of the clip.
   * Only reachable with an unknown duration: once ffprobe answers, the rate is
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

/** ffmpeg or ffprobe is not installed. Names the binary and the way out. */
export class FrameSamplingUnavailableError extends Error {
  readonly binary: string;
  constructor(binary: string) {
    super(
      `${binary} is not installed or not on PATH. Reading a video with a ` +
        `provider that has no video content part samples frames with ffmpeg ` +
        `first — install ffmpeg (the Package Manager UI can do this), or use ` +
        `a provider whose chat models read video natively (gemini).`
    );
    this.name = "FrameSamplingUnavailableError";
    this.binary = binary;
  }
}

const DEFAULT_MAX_FRAMES = 16;
const DEFAULT_MAX_FPS = 1;
const DEFAULT_MAX_DIMENSION = 768;
/** ffmpeg `-q:v` for the JPEG encoder (2 = best, 31 = worst). */
const JPEG_QUALITY = 4;
const FFMPEG_MAX_BUFFER = 8 * 1024 * 1024;

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

type ExecResult = { stdout: string; stderr: string };

async function nodeModules(): Promise<{
  cp: typeof import("node:child_process");
  fs: typeof import("node:fs/promises");
  os: typeof import("node:os");
  path: typeof import("node:path");
}> {
  const [cp, fs, os, path] = await Promise.all([
    importNodeBuiltin<typeof import("node:child_process")>(
      "node:child_process"
    ),
    importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises"),
    importNodeBuiltin<typeof import("node:os")>("node:os"),
    importNodeBuiltin<typeof import("node:path")>("node:path")
  ]);
  if (!cp || !fs || !os || !path) {
    throw new Error("Video frame sampling requires Node built-in modules");
  }
  return { cp, fs, os, path };
}

/** Whether a spawn failed because the binary is not on PATH. */
function isSpawnEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

async function run(
  cp: typeof import("node:child_process"),
  binary: "ffmpeg" | "ffprobe",
  args: string[],
  signal?: AbortSignal
): Promise<ExecResult> {
  return await new Promise<ExecResult>((resolve, reject) => {
    cp.execFile(
      binary,
      args,
      { maxBuffer: FFMPEG_MAX_BUFFER, signal, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          if (isSpawnEnoent(error)) {
            reject(new FrameSamplingUnavailableError(binary));
            return;
          }
          reject(error);
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
    );
  });
}

/** Clip length in seconds, or null when ffprobe cannot say. */
async function probeDuration(
  cp: typeof import("node:child_process"),
  file: string,
  signal?: AbortSignal
): Promise<number | null> {
  try {
    const { stdout } = await run(
      cp,
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        file
      ],
      signal
    );
    const seconds = Number(stdout.trim().split("\n")[0]);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch (error) {
    // A missing binary is actionable and must reach the caller. A probe that
    // ran and failed (an odd container, no format header) is not: the sample
    // falls back to the ceiling rate below.
    if (error instanceof FrameSamplingUnavailableError) throw error;
    return null;
  }
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
 * Fit inside a square of `maxDimension` without upscaling. ffmpeg's
 * `force_original_aspect_ratio=decrease` would enlarge a smaller frame, which
 * costs tokens and adds no detail.
 */
function scaleFilter(maxDimension: number): string {
  const m = maxDimension;
  return `scale='if(gt(iw,ih),min(${m},iw),-2)':'if(gt(iw,ih),-2,min(${m},ih))'`;
}

/**
 * Decode `bytes` and return up to `maxFrames` JPEG stills spread across the
 * clip. Throws {@link FrameSamplingUnavailableError} when ffmpeg is absent.
 */
export async function sampleVideoFrames(
  bytes: Uint8Array,
  options: SampleVideoFramesOptions = {}
): Promise<VideoFrameSample> {
  const limits = frameSamplingLimits();
  const maxFrames = Math.max(1, options.maxFrames ?? limits.maxFrames);
  const maxFps = options.maxFps ?? limits.maxFps;
  const maxDimension = options.maxDimension ?? limits.maxDimension;

  const { cp, fs, os, path } = await nodeModules();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-vframes-"));
  const input = path.join(dir, "input.bin");
  const outDir = path.join(dir, "frames");
  try {
    await fs.writeFile(input, bytes);
    await fs.mkdir(outDir);

    const durationSec = await probeDuration(cp, input, options.signal);
    const fps = frameRateFor(durationSec, maxFrames, maxFps);

    await run(
      cp,
      "ffmpeg",
      [
        "-nostdin",
        "-y",
        "-v",
        "error",
        "-protocol_whitelist",
        "file",
        "-i",
        input,
        "-vf",
        `fps=${fps.toFixed(6)},${scaleFilter(maxDimension)}`,
        "-frames:v",
        String(maxFrames),
        "-q:v",
        String(JPEG_QUALITY),
        path.join(outDir, "frame_%04d.jpg")
      ],
      options.signal
    );

    const names = (await fs.readdir(outDir))
      .filter((n) => n.startsWith("frame_") && n.endsWith(".jpg"))
      .sort();
    const frames: SampledFrame[] = [];
    for (const [index, name] of names.entries()) {
      frames.push({
        data: new Uint8Array(await fs.readFile(path.join(outDir, name))),
        mimeType: "image/jpeg",
        timeSec: index / fps
      });
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
