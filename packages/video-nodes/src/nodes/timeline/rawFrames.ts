/**
 * Raw RGBA plumbing between ffmpeg and the timeline compositor.
 *
 * The compositor wants CPU-side straight-alpha RGBA for every layer of every
 * frame, and hands back the composited frame in the same form. ffmpeg does the
 * decoding and encoding on both ends:
 *
 * - {@link decodeImageRgba} decodes a still once.
 * - {@link openVideoFrameStream} decodes a clip lazily, one frame at a time.
 *   Frames are consumed in timeline order, which for a clip is source order, so
 *   a single streaming decode covers the whole render — no seeking, and no
 *   multi-gigabyte scratch file.
 * - {@link openFrameEncoder} pipes composited frames into one long-running
 *   encoder.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable } from "node:stream";

import {
  MissingBinaryError,
  execFfmpeg,
  execFfprobe
} from "../ffmpeg-helpers.js";

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
  const { stdout } = await execFfprobe([
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0:s=x",
    filePath
  ]);
  const match = /^(\d+)x(\d+)/.exec(stdout.trim());
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function spawnFfmpeg(args: string[]): ChildProcessWithoutNullStreams {
  return spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
}

/** Collect a process's stderr so a failure can say what ffmpeg complained about. */
function captureStderr(stream: Readable): () => string {
  const chunks: Buffer[] = [];
  stream.on("data", (chunk: Buffer) => {
    // Keep the tail only: a failing decode can be verbose, and the last lines
    // are the ones that name the cause.
    chunks.push(chunk);
    if (chunks.length > 32) chunks.shift();
  });
  return () => Buffer.concat(chunks).toString("utf8").trim();
}

/** Decode a still image to straight-alpha RGBA at `size`. */
export async function decodeImageRgba(
  filePath: string,
  size: RawSize
): Promise<RawImage> {
  const child = spawnFfmpeg([
    "-v",
    "error",
    "-i",
    filePath,
    "-vf",
    `scale=${size.width}:${size.height}`,
    "-frames:v",
    "1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "pipe:1"
  ]);
  const stderr = captureStderr(child.stderr);
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve, reject) => {
    child.on("error", (error: NodeJS.ErrnoException) =>
      reject(
        error.code === "ENOENT" ? new MissingBinaryError("ffmpeg") : error
      )
    );
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg failed to decode image: ${stderr()}`))
    );
  });

  const rgba = new Uint8Array(Buffer.concat(chunks));
  const expected = size.width * size.height * 4;
  if (rgba.length < expected) {
    throw new Error(
      `ffmpeg produced ${rgba.length} bytes for a ${size.width}x${size.height} frame (expected ${expected})`
    );
  }
  return { rgba: rgba.subarray(0, expected), ...size };
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

/** How many decoded frames ffmpeg may run ahead of the consumer. */
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
    `fps=${fps}`,
    `scale=${size.width}:${size.height}`,
    "format=rgba"
  ].filter((f): f is string => f !== null);

  const child = spawnFfmpeg([
    "-v",
    "error",
    ...(startSec > 0 ? ["-ss", String(startSec)] : []),
    "-i",
    filePath,
    "-vf",
    filters.join(","),
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "pipe:1"
  ]);
  const stderr = captureStderr(child.stderr);

  const frameBytes = size.width * size.height * 4;
  const reader = new FrameReader(child.stdout, frameBytes);
  let spawnError: Error | null = null;
  child.on("error", (error: NodeJS.ErrnoException) => {
    spawnError =
      error.code === "ENOENT" ? new MissingBinaryError("ffmpeg") : error;
    reader.fail(spawnError);
  });
  child.on("close", (code) => {
    if (code !== 0 && code !== null && !reader.done) {
      reader.fail(new Error(`ffmpeg failed to decode clip: ${stderr()}`));
    }
  });

  let nextIndex = 0;
  let last: Uint8Array | null = null;

  return {
    width: size.width,
    height: size.height,
    async frameAt(index: number): Promise<Uint8Array | null> {
      if (spawnError) throw spawnError;
      while (nextIndex <= index) {
        const frame = await reader.next();
        nextIndex += 1;
        if (!frame) return last;
        last = frame;
      }
      return last;
    },
    close(): void {
      reader.close();
      child.kill("SIGKILL");
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

/** Only a verified regular source grid can be indexed inside a decode window. */
async function hasRegularFrameGrid(filePath: string, fps: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  const stdout = await new Promise<string | null>((resolve) => {
    const child = spawn("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "packet=pts_time", "-of", "csv=p=0", filePath
    ], { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      signal.removeEventListener("abort", cancel);
      resolve(value);
    };
    const cancel = (): void => {
      child.kill("SIGKILL");
      finish(null);
    };
    const deadline = setTimeout(cancel, 1000);
    signal.addEventListener("abort", cancel, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 8 * 1024 * 1024) {
        cancel();
      } else {
        chunks.push(chunk);
      }
    });
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code === 0 ? Buffer.concat(chunks).toString("utf8") : null));
    if (signal.aborted) cancel();
  });
  if (stdout === null) return false;
  const times = stdout.trim().split(/\r?\n/).map(Number);
  if (times.length < 2 || times.some((time) => !Number.isFinite(time))) return false;
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
  const regularGrid = hasRegularFrameGrid(filePath, fps, probeController.signal);

  const openAt = (sec: number): VideoFrameStream => openVideoFrameStream({
    filePath, size, fps, startSec: sec, speed: 1
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
        const frame = await active.frameAt(0);
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
 * Pull exact-size frames out of a byte stream, with the read-ahead bounded by
 * pausing the stream — a 1080p frame is 8 MB, so an unbounded buffer would let
 * a fast decoder outrun the compositor into gigabytes of RAM.
 */
class FrameReader {
  private chunks: Buffer[] = [];
  private buffered = 0;
  private waiting: ((frame: Uint8Array | null) => void) | null = null;
  private failure: Error | null = null;
  private rejectWaiting: ((error: Error) => void) | null = null;
  private ended = false;
  private closed = false;

  constructor(
    private readonly stream: Readable,
    private readonly frameBytes: number
  ) {
    stream.on("data", (chunk: Buffer) => {
      this.chunks.push(chunk);
      this.buffered += chunk.length;
      this.drain();
      if (this.buffered > this.frameBytes * READAHEAD_FRAMES) {
        stream.pause();
      }
    });
    stream.on("end", () => {
      this.ended = true;
      this.drain();
    });
    stream.on("error", (error: Error) => this.fail(error));
  }

  get done(): boolean {
    return this.ended || this.closed;
  }

  next(): Promise<Uint8Array | null> {
    if (this.failure) return Promise.reject(this.failure);
    const ready = this.take();
    if (ready) return Promise.resolve(ready);
    if (this.ended || this.closed) return Promise.resolve(null);
    this.stream.resume();
    return new Promise<Uint8Array | null>((resolve, reject) => {
      this.waiting = resolve;
      this.rejectWaiting = reject;
    });
  }

  fail(error: Error): void {
    this.failure = error;
    const reject = this.rejectWaiting;
    this.waiting = null;
    this.rejectWaiting = null;
    reject?.(error);
  }

  close(): void {
    this.closed = true;
    this.chunks = [];
    this.buffered = 0;
    this.waiting?.(null);
    this.waiting = null;
    this.rejectWaiting = null;
  }

  private drain(): void {
    if (!this.waiting) return;
    const frame = this.take();
    if (frame) {
      const resolve = this.waiting;
      this.waiting = null;
      this.rejectWaiting = null;
      resolve(frame);
      return;
    }
    if (this.ended) {
      const resolve = this.waiting;
      this.waiting = null;
      this.rejectWaiting = null;
      resolve(null);
    }
  }

  /** Splice one frame out of the buffered chunks, or `null` if short. */
  private take(): Uint8Array | null {
    if (this.buffered < this.frameBytes) return null;
    const merged =
      this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks);
    const frame = merged.subarray(0, this.frameBytes);
    const rest = merged.subarray(this.frameBytes);
    this.chunks = rest.length > 0 ? [rest] : [];
    this.buffered = rest.length;
    if (this.buffered <= this.frameBytes * READAHEAD_FRAMES) {
      this.stream.resume();
    }
    return new Uint8Array(frame);
  }
}

/** A running encoder that turns written RGBA frames into an output file. */
export interface FrameEncoder {
  write(rgba: Uint8Array): Promise<void>;
  /** Close the input and wait for the file to be finalized. */
  finish(): Promise<void>;
  abort(): void;
}

/**
 * Report whether this ffmpeg build ships `encoder`.
 *
 * ProRes 4444 and VP9 are both optional at build time — a distro ffmpeg may
 * carry neither — and a render that discovers this after compositing every
 * frame has burned the whole render. Probed once before the frame loop starts.
 *
 * A build that cannot be asked (no ffmpeg, an unparsable listing) answers
 * `false`, so the caller refuses with a message naming the encoder rather than
 * failing on ffmpeg's own output an hour later.
 */
export async function ffmpegHasEncoder(encoder: string): Promise<boolean> {
  try {
    const { stdout } = await execFfmpeg(["-hide_banner", "-encoders"], {
      maxBuffer: 8 * 1024 * 1024
    });
    // The listing is `<flags> <name> <description>`; match the name column so
    // an encoder merely mentioned in a description does not count.
    return stdout
      .split("\n")
      .some((line) => line.trim().split(/\s+/)[1] === encoder);
  } catch {
    return false;
  }
}

/**
 * H.264 at `yuv420p`, converted to BT.709 and tagged as such.
 *
 * The same reasoning as `outputFormats.ts`: raw RGBA in, YUV out, and without
 * the scaler and the tags ffmpeg uses BT.601 and records nothing, so the file
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
  const { outPath, width, height, fps } = opts;
  const encoderArgs = opts.encoderArgs ?? defaultEncoderArgs();
  const child = spawnFfmpeg([
    "-y",
    "-v",
    "error",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${width}x${height}`,
    "-r",
    String(fps),
    "-i",
    "pipe:0",
    ...encoderArgs,
    outPath
  ]);
  const stderr = captureStderr(child.stderr);
  // The encoder writes nothing to stdout, but an unread pipe would eventually
  // block the process.
  child.stdout.resume();

  let failure: Error | null = null;
  const pendingDrains = new Set<(error: Error) => void>();
  const fail = (error: Error): void => {
    if (failure) return;
    failure = error;
    for (const reject of pendingDrains) reject(error);
    pendingDrains.clear();
  };
  child.on("error", (error: NodeJS.ErrnoException) => {
    fail(error.code === "ENOENT" ? new MissingBinaryError("ffmpeg") : error);
  });
  child.stdin.on("error", fail);
  const closed = new Promise<number | null>((resolve) =>
    child.on("close", (code) => {
      if (code !== 0) {
        fail(new Error(`ffmpeg failed to encode the timeline: ${stderr()}`));
      } else if (pendingDrains.size > 0) {
        fail(new Error("ffmpeg closed before the frame write drained"));
      }
      resolve(code);
    })
  );

  return {
    async write(rgba: Uint8Array): Promise<void> {
      if (failure) throw failure;
      const ok = child.stdin.write(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength));
      if (!ok) {
        await new Promise<void>((resolve, reject) => {
          const rejectPending = (error: Error): void => {
            child.stdin.off("drain", onDrain);
            pendingDrains.delete(rejectPending);
            reject(error);
          };
          const onDrain = (): void => {
            pendingDrains.delete(rejectPending);
            resolve();
          };
          pendingDrains.add(rejectPending);
          child.stdin.once("drain", onDrain);
          if (failure) rejectPending(failure);
        });
      }
      if (failure) throw failure;
    },
    async finish(): Promise<void> {
      if (failure) throw failure;
      child.stdin.end();
      const code = await closed;
      if (failure) throw failure;
      if (code !== 0) {
        throw new Error(`ffmpeg failed to encode the timeline: ${stderr()}`);
      }
    },
    abort(): void {
      fail(new Error("ffmpeg encoding aborted"));
      child.stdin.destroy();
      child.kill("SIGKILL");
    }
  };
}
