/**
 * The timeline's 3D bake: a sampled Blender render muxed into one video
 * (design §D6).
 *
 * The caller hands over one model time and one camera per output frame — the
 * evaluated clip, with its in point, speed, time remap, animation speed and
 * camera curves already applied — and gets back an MP4 the clip can play as
 * an ordinary video layer. Blender renders a still per entry rather than a
 * frame range, because a trimmed, sped-up, reversed or looped clip is not a
 * run of consecutive scene frames.
 *
 * The mux is ffmpeg and not Blender's own writer, which is what
 * `render_animation`'s video mode uses. Two reasons: one sequence feeds both
 * bake formats, and Blender cannot write VP9 with an alpha channel. ffmpeg is
 * therefore a host binary this path needs and the video mode does not; a
 * machine without it fails here with the binary named.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { runHostBinary } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import type {
  BakeCameraParams,
  BlenderJob,
  BlenderResultStats,
  RenderAnimationParams
} from "./job.js";
import { runBlenderJob } from "./run-job.js";
import { BlenderJobError } from "./runner.js";

/**
 * Ceiling on the frames one bake asks for. Every frame is a declared output
 * the runner reads into memory, so this is the bound on that, not a limit on
 * clip length in the abstract: two minutes at 30 fps.
 */
export const MAX_BAKE_FRAMES = 3600;

/** What one bake renders. Cameras and times are parallel, one pair per frame. */
export interface Model3DBakeRequest {
  /** Model time in seconds, one entry per output frame. */
  frameTimes: readonly number[];
  /** The camera each of those frames renders through. */
  cameras: readonly BakeCameraParams[];
  /** glTF animation to play; every one plays when absent (the D2 default). */
  animationName?: string;
  width: number;
  height: number;
  fps: number;
}

export interface Model3DBakeOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  /** Reported per rendered frame, before the mux. */
  onProgress?: (frame: number, total: number) => void;
}

/** The container, encoder and pixel format one bake is written as. */
export interface BakeVideoFormat {
  /** File extension of the muxed bytes, without the dot. */
  extension: "mp4" | "webm";
  mimeType: string;
  /** ffmpeg output arguments: the encoder and its pixel format. */
  encoderArgs: readonly string[];
}

/**
 * How a bake is encoded: opaque to MP4/H.264 `yuv420p`, transparent to WebM
 * VP9 `yuva420p` (design §D6).
 *
 * The alpha pair is the one `resolveTimelineOutput({ format: "webm", alpha:
 * true })` already declares for a timeline render, copied rather than imported
 * because `@nodetool-ai/blender-nodes` does not depend on
 * `@nodetool-ai/video-nodes` and a bake needs four strings from it, not a
 * package. `packages/agents/tests/timeline-bake-format.test.ts` depends on both
 * and fails when the two drift.
 */
export function bakeVideoFormat(alpha: boolean): BakeVideoFormat {
  if (alpha) {
    return {
      extension: "webm",
      mimeType: "video/webm",
      // VP9 is the only WebM video codec with an alpha plane, which is why the
      // format pins the codec instead of taking an override.
      encoderArgs: ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p"]
    };
  }
  return {
    extension: "mp4",
    mimeType: "video/mp4",
    encoderArgs: ["-c:v", "libx264", "-pix_fmt", "yuv420p"]
  };
}

export interface Model3DBakeResult {
  /** The muxed bytes, in {@link Model3DBakeResult.format}. */
  video: Uint8Array;
  /** What those bytes are, so the caller names and stores them correctly. */
  format: BakeVideoFormat;
  stats: BlenderResultStats;
}

/** Six-digit frame names, so the outputs sort the way they play. */
function frameName(index: number): string {
  return `frame_${String(index + 1).padStart(6, "0")}`;
}

/**
 * The `frame_*` outputs a sampled job declares: one per entry, in play order.
 * The op writes the file each name carries and reports the names back.
 */
export function bakeFrameOutputs(count: number): BlenderJob["outputs"] {
  const outputs: BlenderJob["outputs"] = {};
  for (let i = 0; i < count; i += 1) {
    outputs[frameName(i)] = `${frameName(i)}.png`;
  }
  return outputs;
}

function assertRequest(request: Model3DBakeRequest): void {
  const count = request.frameTimes.length;
  if (count === 0) {
    throw new BlenderJobError(
      "bad_job",
      "A 3D bake needs at least one frame; the clip resolved to none."
    );
  }
  if (count > MAX_BAKE_FRAMES) {
    throw new BlenderJobError(
      "bad_job",
      `A 3D bake of ${count} frames is above the ${MAX_BAKE_FRAMES}-frame cap. ` +
        `Shorten the clip or lower the sequence fps.`
    );
  }
  if (request.cameras.length !== count) {
    throw new BlenderJobError(
      "bad_job",
      `A 3D bake carries ${request.cameras.length} cameras for ${count} frames.`
    );
  }
}

/** The sampled `render_animation` params for one bake. */
export function bakeRenderAnimationParams(
  request: Model3DBakeRequest
): RenderAnimationParams {
  const first = request.cameras[0];
  if (!first) {
    throw new BlenderJobError("bad_job", "A 3D bake carries no camera.");
  }
  const params: RenderAnimationParams = {
    ...first,
    width: Math.max(1, Math.round(request.width)),
    height: Math.max(1, Math.round(request.height)),
    // The sampled path renders stills and never reads the range, but the
    // runner's progress arithmetic does: `Fra:n` counts entries, so the range
    // is the entry count.
    frame_start: 1,
    frame_end: request.frameTimes.length,
    fps: Math.max(1, Math.round(request.fps)),
    orbit_degrees: 0,
    frame_times: [...request.frameTimes],
    cameras: [...request.cameras]
  };
  if (request.animationName !== undefined) {
    params.animation_name = request.animationName;
  }
  return params;
}

/** Render the sequence. Frames come back in play order. */
export async function renderModel3DBakeFrames(
  context: ProcessingContext,
  modelBytes: Uint8Array,
  request: Model3DBakeRequest,
  options: Model3DBakeOptions
): Promise<{ frames: Uint8Array[]; stats: BlenderResultStats }> {
  assertRequest(request);
  const count = request.frameTimes.length;
  const outputs = bakeFrameOutputs(count);
  const result = await runBlenderJob(
    context,
    modelBytes,
    { op: "render_animation", params: bakeRenderAnimationParams(request) },
    outputs,
    {
      timeoutMs: options.timeoutMs,
      signal: options.signal,
      onProgress: options.onProgress,
      // Every frame is one declared output, so the default ceiling on
      // declared outputs is the ceiling on a bake's length. The frame cap
      // above is the bound that matters here.
      maxOutputCount: MAX_BAKE_FRAMES
    }
  );
  const frames: Uint8Array[] = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = result.outputs[frameName(i)];
    if (!bytes || bytes.length === 0) {
      throw new BlenderJobError(
        "missing_output",
        `Blender produced no pixels for bake frame ${i + 1} of ${count}.`
      );
    }
    frames.push(bytes);
  }
  return { frames, stats: result.stats };
}

/**
 * The ffmpeg call that turns the numbered PNGs into one video.
 *
 * Pure, because the arguments are the whole difference between the two bakes
 * and a test should not need ffmpeg to read them.
 */
export function bakeMuxArgs(
  format: BakeVideoFormat,
  fps: number,
  output: string
): string[] {
  const rate = String(Math.max(1, Math.round(fps)));
  return [
    "-y",
    "-framerate",
    rate,
    "-start_number",
    "1",
    "-i",
    "frame_%06d.png",
    ...format.encoderArgs,
    // Every timeline decoder seeks this video, and a seek lands on the
    // preceding keyframe: one per second keeps a scrub inside a frame or two
    // of where it was asked for.
    "-g",
    rate,
    // MP4 keeps its index at the front so a decoder can seek before the whole
    // file has arrived; WebM has no such flag and needs none.
    ...(format.extension === "mp4" ? ["-movflags", "+faststart"] : []),
    output
  ];
}

/**
 * Mux a PNG sequence into one video through ffmpeg's image2 demuxer.
 *
 * The frames are written under the workspace's scratch directory rather than
 * piped: image2 reads a numbered pattern, and the same files reach either
 * encoder unchanged — an alpha bake differs only in the arguments
 * {@link bakeVideoFormat} names, because the PNGs already carry the channel.
 */
export async function muxPngSequenceToVideo(
  context: ProcessingContext,
  frames: readonly Uint8Array[],
  fps: number,
  format: BakeVideoFormat,
  options: Model3DBakeOptions
): Promise<Uint8Array> {
  const workspace = context.workspace;
  if (!workspace) {
    throw new BlenderJobError(
      "bad_job",
      "A 3D bake needs a processing context with a workspace to mux through."
    );
  }
  const cwd = await mkdtemp(
    path.join(await workspace.scratchDir(), "nodetool-bake-")
  );
  try {
    for (const [index, bytes] of frames.entries()) {
      await writeFile(path.join(cwd, `${frameName(index)}.png`), bytes);
    }
    const output = `bake.${format.extension}`;
    const argv = bakeMuxArgs(format, fps, output);
    const result = await runHostBinary("ffmpeg", argv, {
      cwd,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
      artifactPath: output
    });
    if (result.exitCode !== 0) {
      throw new BlenderJobError(
        "render_failed",
        `ffmpeg could not mux the bake (exit ${result.exitCode}): ${result.stderr.slice(-2000)}`
      );
    }
    return new Uint8Array(await readFile(path.join(cwd, output)));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

/**
 * Render the sampled sequence and mux it: the whole bake (§D6).
 *
 * Whether it carries alpha is read off the frames' own camera rather than
 * taken as a second field: `transparent` is what Blender rendered the film
 * under, so a separate flag could only ever disagree with the pixels.
 */
export async function bakeModel3DClipToVideo(
  context: ProcessingContext,
  modelBytes: Uint8Array,
  request: Model3DBakeRequest,
  options: Model3DBakeOptions
): Promise<Model3DBakeResult> {
  const format = bakeVideoFormat(request.cameras[0]?.transparent === true);
  const { frames, stats } = await renderModel3DBakeFrames(
    context,
    modelBytes,
    request,
    options
  );
  const video = await muxPngSequenceToVideo(
    context,
    frames,
    request.fps,
    format,
    options
  );
  return { video, format, stats };
}
