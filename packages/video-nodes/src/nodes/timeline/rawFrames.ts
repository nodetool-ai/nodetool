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

import { MissingBinaryError, execFfprobe } from "../ffmpeg-helpers.js";

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

/** A running encoder that turns written RGBA frames into a video file. */
interface FrameEncoder {
  write(rgba: Uint8Array): Promise<void>;
  /** Close the input and wait for the file to be finalized. */
  finish(): Promise<void>;
  abort(): void;
}

/**
 * Start encoding RGBA frames written at `fps` into `outPath` (H.264/MP4). The
 * alpha channel is dropped by the `yuv420p` conversion — every frame arrives
 * composited over opaque black, so there is nothing to keep.
 */
export function openFrameEncoder(opts: {
  outPath: string;
  width: number;
  height: number;
  fps: number;
}): FrameEncoder {
  const { outPath, width, height, fps } = opts;
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
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    outPath
  ]);
  const stderr = captureStderr(child.stderr);
  // The encoder writes nothing to stdout, but an unread pipe would eventually
  // block the process.
  child.stdout.resume();

  let failure: Error | null = null;
  child.on("error", (error: NodeJS.ErrnoException) => {
    failure = error.code === "ENOENT" ? new MissingBinaryError("ffmpeg") : error;
  });
  const closed = new Promise<number | null>((resolve) =>
    child.on("close", (code) => resolve(code))
  );

  return {
    async write(rgba: Uint8Array): Promise<void> {
      if (failure) throw failure;
      const ok = child.stdin.write(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength));
      if (!ok) {
        await new Promise<void>((resolve) => child.stdin.once("drain", resolve));
      }
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
      child.stdin.destroy();
      child.kill("SIGKILL");
    }
  };
}
