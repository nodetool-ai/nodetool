/**
 * Raw RGBA plumbing between libav and the timeline compositor.
 *
 * The compositor wants CPU-side straight-alpha RGBA for every layer of every
 * frame, and hands back the composited frame in the same form. libav, in
 * process through `@nodetool-ai/runtime/media`, does the decoding and encoding
 * on both ends, with the filter strings the ffmpeg CLI ran:
 *
 * - {@link decodeImageRgba} decodes a still once.
 * - {@link openVideoFrameStream} decodes a clip lazily, one frame at a time.
 *   Frames are consumed in timeline order, which for a clip is source order, so
 *   a single streaming decode covers the whole render — no seeking, and no
 *   multi-gigabyte scratch file.
 * - {@link openFrameEncoder} pipes composited frames into one long-running
 *   encoder.
 */

import { open, readFile } from "node:fs/promises";

import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  hasEncoder,
  openRgbaFrameReader,
  openVideoFrameEncoder,
  packetTimes,
  probeMedia,
  probeVideoStream,
  type RgbaFrameReader,
  type VideoEncoderSpec,
  type VideoFrameEncoder
} from "@nodetool-ai/runtime/media";

/** Pixel dimensions of a decoded source. */
interface RawSize {
  width: number;
  height: number;
}

/** Decoded straight-alpha RGBA8 pixels. */
export interface RawImage extends RawSize {
  rgba: Uint8Array;
}

/**
 * Largest size that fits `source` inside `canvas` without upscaling and
 * without changing its aspect ratio. Decoding beyond the frame the layer is
 * composited into buys nothing; upscaling below it would change what a
 * source-pixel unit (a blur radius, a corner radius) means.
 */
export function fitWithin(source: RawSize, canvas: RawSize): RawSize {
  const scale = Math.min(
    1,
    canvas.width / Math.max(1, source.width),
    canvas.height / Math.max(1, source.height)
  );
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale))
  };
}

/** Probe a media file's video dimensions, or `null` when it has no video. */
export async function probeVideoSize(filePath: string): Promise<RawSize | null> {
  let video: Awaited<ReturnType<typeof probeMedia>>["video"];
  try {
    ({ video } = await probeMedia(filePath));
  } catch {
    // Not a container: a still format the image decoder may still read.
    return probeStillSize(filePath);
  }
  if (!video) return null;
  return { width: video.width, height: video.height };
}

/**
 * The size of a still Mediabunny does not read as a container (PNG, JPEG,
 * WebP), from the image decoder's first frame.
 */
async function probeStillSize(filePath: string): Promise<RawSize | null> {
  let reader: RgbaFrameReader | null = null;
  try {
    reader = await openRgbaFrameReader({ filePath, filter: "format=rgba", readAhead: 1 });
    const frame = await reader?.next();
    return frame ? { width: frame.width, height: frame.height } : null;
  } catch {
    // Neither a container nor an image.
    return null;
  } finally {
    await reader?.close();
  }
}

/**
 * The rate of the source's frame lattice, for the frame-grid cache in
 * {@link openSourceFrameStream}: the grid the timestamps sit on, even when
 * frames are missing from it. A source on no lattice answers 1, which no real
 * grid matches, so the cache stays off and each frame is an exact seek.
 */
export async function probeVideoFrameRate(filePath: string): Promise<number> {
  const rate = (await probeVideoStream(filePath))?.nominalFps;
  return rate !== null && rate !== undefined && Number.isFinite(rate) && rate > 0 ? rate : 1;
}

/**
 * swscale's default yuv420p → RGBA path repeats each chroma sample over a 2×2
 * block. Chrome interpolates it, so at every colour edge the two renderers
 * disagreed. Full chroma interpolation with accurate rounding matches.
 */
const SCALE_FLAGS = "accurate_rnd+full_chroma_int";

/** Decode a still image to straight-alpha RGBA at `size`. */
export async function decodeImageRgba(
  filePath: string,
  size: RawSize
): Promise<RawImage> {
  const reader = await openRgbaFrameReader({
    filePath,
    filter: `scale=${size.width}:${size.height}:flags=${SCALE_FLAGS},format=rgba`,
    readAhead: 1
  });
  if (!reader) throw new Error(`No picture to decode in ${filePath}`);
  try {
    const frame = await reader.next();
    const expected = size.width * size.height * 4;
    if (!frame || frame.rgba.length < expected) {
      throw new Error(
        `Decoded ${frame?.rgba.length ?? 0} bytes for a ${size.width}x${size.height} frame (expected ${expected})`
      );
    }
    return { rgba: frame.rgba.subarray(0, expected), ...size };
  } finally {
    await reader.close();
  }
}

/** Whether `filePath` holds SVG markup. Stored assets often have no extension. */
async function isSvgFile(filePath: string): Promise<boolean> {
  const handle = await open(filePath, "r");
  try {
    const head = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(head, 0, head.length, 0);
    const text = head.subarray(0, bytesRead).toString("utf8").replace(/^\uFEFF/, "");
    return text.trimStart().startsWith("<") && /<svg[\s>]/i.test(text);
  } finally {
    await handle.close();
  }
}

/**
 * Rasterize an SVG with Skia. Many ffmpeg builds (Homebrew's default among
 * them) have no SVG decoder, and a logo is the usual SVG on a timeline. The
 * intrinsic size plays the role a raster's pixel size does in {@link fitWithin}.
 */
async function rasterizeSvg(filePath: string, canvas: RawSize): Promise<RawImage> {
  let image: Awaited<ReturnType<typeof loadImage>>;
  try {
    image = await loadImage(await readFile(filePath));
  } catch (error) {
    throw new Error(`Could not rasterize SVG ${filePath}: ${(error as Error).message}`);
  }
  if (!(image.width > 0 && image.height > 0)) {
    throw new Error(`Could not rasterize SVG ${filePath}: it has no size`);
  }
  const size = fitWithin({ width: image.width, height: image.height }, canvas);
  const surface = createCanvas(size.width, size.height);
  const context = surface.getContext("2d");
  context.drawImage(image, 0, 0, size.width, size.height);
  const { data } = context.getImageData(0, 0, size.width, size.height);
  return { rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), ...size };
}

/**
 * Decode a still fitted inside `canvas`, or `null` when the probe finds no
 * picture in it.
 */
export async function decodeStillRgba(
  filePath: string,
  canvas: RawSize
): Promise<RawImage | null> {
  if (await isSvgFile(filePath)) return rasterizeSvg(filePath, canvas);
  const size = await probeVideoSize(filePath);
  return size ? decodeImageRgba(filePath, fitWithin(size, canvas)) : null;
}

/**
 * A clip's frames, decoded on demand in timeline order.
 *
 * `frameAt` may only move forward: intermediate frames are decoded and dropped,
 * which is what happens when a layer is skipped for a few frames (a video layer
 * past the simultaneous-layer cap, say). Once the source runs out, the last
 * frame is held — the same thing a `<video>` element shows in the preview when
 * a clip outlives its media.
 */
export interface VideoFrameStream extends RawSize {
  frameAt(index: number): Promise<Uint8Array | null>;
  close(): void;
}

/** How many decoded frames may wait ahead of the consumer. */
const READAHEAD_FRAMES = 4;

interface VideoFrameStreamOptions {
  filePath: string;
  /** Decoded frame size (already fitted to the sequence frame). */
  size: RawSize;
  /** Timeline frame rate — one decoded frame per timeline frame. */
  fps: number;
  /** Source seconds to skip before the first frame (the clip's in point). */
  startSec: number;
  /** Playback rate: >1 consumes the source faster than the timeline. */
  speed: number;
  nativeSampling?: boolean;
}

/**
 * Start decoding `filePath` into RGBA frames at the timeline's frame rate.
 * `setpts` applies the clip's speed so decoded frame *k* is exactly the source
 * frame the preview shows at timeline frame *k* of the clip.
 */
export function openVideoFrameStream(
  opts: VideoFrameStreamOptions
): VideoFrameStream {
  const { filePath, size, fps, startSec, speed } = opts;
  const filters = [
    speed !== 1 ? `setpts=PTS/${speed}` : null,
    // `round=up` puts a source frame in the first output slot at or after
    // its timestamp, so slot k holds the latest frame at or before k / fps:
    // the frame a player, and the preview, shows at that instant.
    opts.nativeSampling ? null : `fps=${fps}:round=up`,
    `scale=${size.width}:${size.height}:flags=${SCALE_FLAGS}`,
    "format=rgba"
  ].filter((f): f is string => f !== null);

  // Opening starts now, so the first frame is decoding before it is asked for.
  const opening = openRgbaFrameReader({
    filePath,
    filter: filters.join(","),
    seekSec: startSec,
    readAhead: READAHEAD_FRAMES
  });
  // A failed open surfaces at the first frameAt; never as an unhandled rejection.
  opening.catch(() => {});
  let closed = false;
  let nextIndex = 0;
  let last: Uint8Array | null = null;

  return {
    width: size.width,
    height: size.height,
    async frameAt(index: number): Promise<Uint8Array | null> {
      const reader = await opening;
      if (!reader) throw new Error(`No video stream to decode in ${filePath}`);
      while (nextIndex <= index) {
        if (closed) return last;
        const frame = await reader.next();
        nextIndex += 1;
        if (!frame) return last;
        last = frame.rgba;
      }
      return last;
    },
    close(): void {
      closed = true;
      void opening.then((reader) => reader?.close()).catch(() => {});
    }
  };
}

/**
 * A clip's frames addressed by absolute source time rather than by frame index.
 *
 * The forward-only stream above is enough while a clip consumes its source at a
 * constant rate: decoded frame *k* is the frame the timeline wants at clip
 * frame *k*. A time remap breaks that — the source position is a curve, and a
 * reverse curve walks it backwards. A bounded window retains decoded frames
 * for descending requests and reopens the forward-only decode when a request
 * falls outside that window.
 */
export interface SourceFrameStream extends RawSize {
  /** The frame at absolute source time `sec`, or `null` past the media's end. */
  frameAtSourceSec(sec: number): Promise<Uint8Array | null>;
  /** Number of decoder reopens. */
  readonly reopens: number;
  /** Decoded bytes currently retained for reverse reads. */
  readonly reverseWindowBytes: number;
  close(): void;
}

/**
 * How long the grid probe may run. A miss falls back to a fresh seek per
 * frame, so the budget must hold on a loaded machine: a 1s budget expired on
 * CI for a 60-frame clip and turned every reverse read into a reopen.
 */
const GRID_PROBE_TIMEOUT_MS = 10_000;

/** Packets the grid probe reads before it gives up on a source as too long. */
const GRID_PROBE_MAX_PACKETS = 1_000_000;

/** Only a verified regular source grid can be indexed inside a decode window. */
async function hasRegularFrameGrid(filePath: string, fps: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  const probe = new AbortController();
  const cancel = (): void => probe.abort();
  const deadline = setTimeout(cancel, GRID_PROBE_TIMEOUT_MS);
  signal.addEventListener("abort", cancel, { once: true });
  let times: number[] | null;
  try {
    times = await packetTimes(filePath, {
      signal: probe.signal,
      maxPackets: GRID_PROBE_MAX_PACKETS
    });
  } catch {
    return false;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener("abort", cancel);
  }
  if (!times || times.length < 2 || times.some((time) => !Number.isFinite(time))) return false;
  times.sort((left, right) => left - right);
  for (const [index, time] of times.entries()) {
    const expected = index / fps;
    const millisecondGrid = Math.round(expected * 1000) / 1000;
    if (Math.min(Math.abs(time - expected), Math.abs(time - millisecondGrid)) > 0.000002) return false;
  }
  return true;
}

/**
 * Open a source-time-addressed decode of `filePath`, sampling the source on a
 * `1/fps` grid when it matches a verified regular source grid. Other requests
 * use a fresh FFmpeg seek to retain its timestamp and timebase behavior.
 *
 * The underlying decode always runs at the source's own rate (`speed: 1`): the
 * remap curve, not `setpts`, decides which source instant a timeline frame
 * shows.
 */
export function openSourceFrameStream(opts: {
  filePath: string;
  size: RawSize;
  fps: number;
  startSec: number;
  /** Preserve native frames instead of resampling onto the requested grid. */
  nativeSampling?: boolean;
  /** Maximum decoded bytes retained in one reverse window. */
  maxWindowBytes?: number;
  /** Maximum source-time span retained in one reverse window. */
  maxWindowMs?: number;
}): SourceFrameStream {
  const { filePath, size, fps } = opts;
  const frameBytes = size.width * size.height * 4;
  const byteLimit = opts.maxWindowBytes ?? 128 * 1024 * 1024;
  const durationLimitMs = opts.maxWindowMs ?? 2000;
  // One frame is the minimum useful window, even when its dimensions alone
  // exceed the configured byte limit.
  const windowFrames = Math.max(1, Math.min(
    Math.floor(byteLimit / frameBytes),
    Math.floor((durationLimitMs * fps) / 1000) + 1
  ));
  let originFrame = 0;
  let decodedIndex = -1;
  let reopens = 0;
  let reverseWindow: Uint8Array[] = [];
  let closed = false;
  let stream: VideoFrameStream | null = null;
  let mode: "window" | "seek" | null = null;
  let lastSeekTarget: number | null = null;
  let lastFrame: Uint8Array | null = null;
  const probeController = new AbortController();
  const regularGrid = hasRegularFrameGrid(
    filePath,
    fps,
    probeController.signal
  );

  const openAt = (sec: number): VideoFrameStream =>
    openVideoFrameStream({
      filePath,
      size,
      fps,
      startSec: sec,
      speed: 1,
      nativeSampling: opts.nativeSampling
    });
  const replaceStream = (sec: number): VideoFrameStream => {
    if (stream) {
      stream.close();
      reopens += 1;
    }
    stream = openAt(sec);
    return stream;
  };

  return {
    width: size.width,
    height: size.height,
    get reopens(): number {
      return reopens;
    },
    get reverseWindowBytes(): number {
      return reverseWindow.length * frameBytes;
    },
    async frameAtSourceSec(sec: number): Promise<Uint8Array | null> {
      if (closed) return null;
      const target = Math.max(0, sec);
      const regular = await regularGrid;
      if (closed) return null;
      const position = target * fps;
      const targetFrame = Math.round(position);
      const aligned = Math.abs(position - targetFrame) <= 1e-7;
      if (!regular || !aligned) {
        // A source-grid index cannot identify a fractional fresh seek or an
        // unknown/different-rate frame grid. Use FFmpeg's exact seek instead.
        let active = stream;
        if (mode !== "seek" || lastSeekTarget !== target || !active) {
          active = replaceStream(target);
          mode = "seek";
          lastSeekTarget = target;
          reverseWindow = [];
          decodedIndex = -1;
        }
        let frame = await active.frameAt(0);
        if (!frame && target > 0) {
          // A fresh seek beyond EOF has no frame to hold. Decode to the end
          // instead of reusing whichever earlier frame the caller requested.
          active = replaceStream(0);
          frame = await active.frameAt(Number.MAX_SAFE_INTEGER);
        }
        if (closed) return null;
        if (frame) lastFrame = frame;
        return frame ?? lastFrame;
      }
      if (mode !== "window" || !stream) {
        replaceStream(targetFrame / fps);
        mode = "window";
        originFrame = targetFrame;
        decodedIndex = -1;
        reverseWindow = [];
        lastSeekTarget = null;
      }
      let index = targetFrame - originFrame;
      if (index >= 0 && index < reverseWindow.length) {
        const frame = reverseWindow[index] ?? null;
        if (frame) lastFrame = frame;
        return frame;
      }
      if (index < 0 || index < decodedIndex) {
        // Decode a bounded window ending at the requested source instant.
        // Later descending requests read its retained frames without seeking.
        const count = Math.min(windowFrames, targetFrame + 1);
        reverseWindow = [];
        if (closed) return null;
        originFrame = targetFrame - (count - 1);
        decodedIndex = -1;
        stream = replaceStream(originFrame / fps);
        for (let i = 0; i < count; i++) {
          const frame = await stream.frameAt(i);
          if (closed || !frame) return null;
          reverseWindow.push(frame);
          decodedIndex = i;
        }
        index = targetFrame - originFrame;
      }
      if (index < reverseWindow.length) {
        const frame = reverseWindow[index] ?? null;
        if (frame) lastFrame = frame;
        return frame;
      }
      reverseWindow = [];
      const active = stream;
      if (!active) return null;
      const frame = await active.frameAt(index);
      decodedIndex = Math.max(decodedIndex, index);
      if (frame) lastFrame = frame;
      return frame;
    },
    close(): void {
      closed = true;
      reverseWindow = [];
      probeController.abort();
      stream?.close();
    }
  };
}

/**
 * Source-time frames of a clip that plays forward at a constant rate: no time
 * remap, no bake. One decode resampled to the timeline's frame rate covers the
 * whole clip, and each request takes the nearest decoded frame.
 *
 * {@link openSourceFrameStream} only indexes a source whose packets sit on
 * an exact grid, and seeks afresh for every other frame. Generated clips often
 * do not: a Seedance or Dreamina file reports `r_frame_rate=60/1` with an
 * average near 24, so every frame of the render respawned ffmpeg (320 ms a
 * frame against 1.4 ms streamed). Resampling onto the output grid needs no
 * source grid at all, and a forward clip never asks for an earlier frame.
 */
export function openForwardSourceFrameStream(opts: {
  filePath: string;
  size: RawSize;
  /** The timeline's frame rate: the grid the decode is resampled onto. */
  fps: number;
  /** Source seconds at the clip's first frame. */
  startSec: number;
  /** Source seconds consumed per timeline second (`sourceRate`). */
  speed: number;
}): SourceFrameStream {
  const { fps, startSec, speed } = opts;
  const stream = openVideoFrameStream({
    filePath: opts.filePath,
    size: opts.size,
    fps,
    startSec,
    speed
  });
  let closed = false;
  return {
    width: stream.width,
    height: stream.height,
    reopens: 0,
    reverseWindowBytes: 0,
    async frameAtSourceSec(sec: number): Promise<Uint8Array | null> {
      if (closed) return null;
      // Decoded frame k shows source time startSec + k * speed / fps.
      const index = Math.max(0, Math.round(((sec - startSec) * fps) / speed));
      return stream.frameAt(index);
    },
    close(): void {
      closed = true;
      stream.close();
    }
  };
}

/** A running encoder that turns written RGBA frames into an output file. */
export interface FrameEncoder {
  /** One frame: RGBA8 for {@link openFrameEncoder}, a PNG for {@link openPngFrameEncoder}. */
  write(frame: Uint8Array): Promise<void>;
  /** Close the input and wait for the file to be finalized. */
  finish(): Promise<void>;
  abort(): void;
}

/**
 * Report whether the bundled libav ships `encoder`.
 *
 * ProRes 4444 and VP9 are both optional at build time, and a render that
 * discovers this after compositing every frame has burned the whole render.
 * Probed once before the frame loop starts.
 */
export function libavHasEncoder(encoder: string): Promise<boolean> {
  return hasEncoder(encoder);
}

/**
 * H.264 at `yuv420p`, converted to BT.709 and tagged as such.
 *
 * The same reasoning as `outputFormats.ts`: raw RGBA in, YUV out, and without
 * the scaler and the tags libav uses BT.601 and records nothing, so the file
 * plays back off-hue everywhere. A caller that passes its own `encoderArgs`
 * owns its own colour handling.
 */
export function defaultEncoderArgs(): string[] {
  return [
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-vf",
    "scale=out_color_matrix=bt709:out_range=tv",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709"
  ];
}

/**
 * Read the ffmpeg output arguments `outputFormats.ts` writes as an encoder
 * spec: `-c:v`, `-pix_fmt` and `-vf` name the codec, pixel format and filter,
 * and every other `-name value` pair (`-preset`, `-profile:v`, `-b:v`,
 * `-colorspace`, ...) becomes an encoder option.
 */
export function encoderSpecFromArgs(args: readonly string[]): VideoEncoderSpec {
  let codec = "libx264";
  let pixelFormat = "yuv420p";
  let filter: string | undefined;
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!flag?.startsWith("-") || value === undefined) {
      throw new Error(`Unreadable encoder arguments: ${args.join(" ")}`);
    }
    const name = flag.slice(1).replace(/:v$/, "");
    if (name === "c") codec = value;
    else if (name === "pix_fmt") pixelFormat = value;
    else if (name === "vf") filter = value;
    else options[name] = value;
  }
  return { codec, pixelFormat, filter, options };
}

/**
 * Wrap an encoder that is still opening: writes wait for it, and an abort
 * before it opened stops it as soon as it does.
 */
function pendingEncoder(opening: Promise<VideoFrameEncoder>): FrameEncoder {
  opening.catch(() => {});
  let aborted = false;
  return {
    async write(frame: Uint8Array): Promise<void> {
      if (aborted) throw new Error("Encoding aborted");
      await (await opening).write(frame);
    },
    async finish(): Promise<void> {
      if (aborted) throw new Error("Encoding aborted");
      await (await opening).finish();
    },
    abort(): void {
      aborted = true;
      void opening.then((encoder) => encoder.abort()).catch(() => {});
    }
  };
}

/**
 * Start encoding RGBA frames written at `fps` into `outPath`.
 *
 * `encoderArgs` decides the codec, profile and pixel format — the alpha-capable
 * combinations are the table in `outputFormats.ts`. Frames arrive as
 * straight-alpha RGBA either way; a `yuv*` pixel format drops the channel, a
 * `yuva*` one keeps it.
 */
export function openFrameEncoder(opts: {
  outPath: string;
  width: number;
  height: number;
  fps: number;
  /** Output codec arguments. Defaults to H.264 at `yuv420p`. */
  encoderArgs?: readonly string[];
}): FrameEncoder {
  return pendingEncoder(
    openVideoFrameEncoder({
      outPath: opts.outPath,
      fps: opts.fps,
      input: "rgba",
      width: opts.width,
      height: opts.height,
      spec: encoderSpecFromArgs(opts.encoderArgs ?? defaultEncoderArgs())
    })
  );
}

/**
 * Start encoding PNG frames written at `fps` into `outPath`. The headless
 * browser render sends PNGs, which keep straight alpha losslessly, for the
 * formats its WebCodecs cannot write (ProRes, and VP9 with alpha).
 */
export function openPngFrameEncoder(opts: {
  outPath: string;
  fps: number;
  encoderArgs: readonly string[];
}): FrameEncoder {
  return pendingEncoder(
    openVideoFrameEncoder({
      outPath: opts.outPath,
      fps: opts.fps,
      input: "png",
      spec: encoderSpecFromArgs(opts.encoderArgs)
    })
  );
}
