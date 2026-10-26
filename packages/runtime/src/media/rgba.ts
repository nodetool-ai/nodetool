/**
 * Raw RGBA frames in and out of libav with node-av: a bounded decode reader
 * for the compositor's inputs and an encoder for its output.
 */

import {
  AV_CODEC_ID_PNG,
  AV_PIX_FMT_RGBA,
  Codec,
  CodecContext,
  Encoder,
  FilterAPI,
  Frame,
  Packet,
  Rational
} from "node-av";

import {
  abortError,
  findEncoder,
  openFileMuxer,
  quietLibav,
  rationalFor,
  throwIfAborted,
  type FileMuxer
} from "./av.js";
import { openFilterGraph, type FilterRun } from "./filter-graph.js";

/** One decoded frame as packed RGBA8. */
export interface RgbaFrame {
  rgba: Uint8Array;
  width: number;
  height: number;
  /** Presentation time after the seek, in seconds. */
  ptsSec: number;
}

/** Frames read ahead of the consumer, so decode overlaps compositing. */
export interface RgbaFrameReader {
  /** The next frame, or `null` once the source is exhausted. */
  next(): Promise<RgbaFrame | null>;
  /** Stop decoding and free the decoder. Waits for a decode in progress. */
  close(): Promise<void>;
}

/**
 * Decode `filePath`'s first video stream through `filter` and hand out the
 * frames as RGBA. `filter` is a `-vf` chain that ends in `format=rgba`.
 *
 * `seekSec` reproduces the CLI's `-ss` before `-i`: seek to the keyframe at or
 * before it, drop every frame before it, and count time from it. At most
 * `readAhead` frames wait decoded; at 1080p each is 8 MB.
 */
export async function openRgbaFrameReader(opts: {
  filePath: string;
  filter: string;
  seekSec?: number;
  readAhead?: number;
  signal?: AbortSignal;
}): Promise<RgbaFrameReader | null> {
  const seekSec = opts.seekSec && opts.seekSec > 0 ? opts.seekSec : 0;
  const run: FilterRun | null = await openFilterGraph({
    filePath: opts.filePath,
    kind: "video",
    // The decoder has already moved the seek point to zero, so `trim` drops
    // the frames decoded on the way from the keyframe to it.
    filter: seekSec > 0 ? `trim=start=0,${opts.filter}` : opts.filter,
    seekSec,
    signal: opts.signal
  });
  if (!run) return null;
  const readAhead = Math.max(1, opts.readAhead ?? 4);
  const queue: RgbaFrame[] = [];
  let failure: unknown = null;
  let ended = false;
  let closed = false;
  let wakeConsumer: (() => void) | null = null;
  let wakeProducer: (() => void) | null = null;

  const wake = (): void => {
    wakeConsumer?.();
    wakeConsumer = null;
  };

  const pump = (async () => {
    try {
      for await (const frame of run.frames()) {
        try {
          const { timeBase } = frame;
          queue.push({
            rgba: new Uint8Array(frame.toBuffer()),
            width: frame.width,
            height: frame.height,
            ptsSec: timeBase.den > 0 ? (Number(frame.pts) * timeBase.num) / timeBase.den : 0
          });
        } finally {
          frame.free();
        }
        wake();
        while (queue.length >= readAhead && !closed) {
          await new Promise<void>((resolve) => {
            wakeProducer = resolve;
          });
        }
        if (closed) break;
      }
    } catch (error) {
      failure = error;
    } finally {
      ended = true;
      wake();
    }
  })();

  return {
    async next(): Promise<RgbaFrame | null> {
      for (;;) {
        if (closed) return null;
        const frame = queue.shift();
        if (frame) {
          wakeProducer?.();
          wakeProducer = null;
          return frame;
        }
        if (failure) throw failure;
        if (ended) return null;
        await new Promise<void>((resolve) => {
          wakeConsumer = resolve;
        });
      }
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      queue.length = 0;
      wakeProducer?.();
      wakeProducer = null;
      wake();
      await pump;
      await run.close();
    }
  };
}

/** Codec settings for {@link openVideoFrameEncoder}, the CLI's output arguments as data. */
export interface VideoEncoderSpec {
  /** Encoder name, e.g. `libx264`, `prores_ks`, `libvpx-vp9`, `ffv1`. */
  codec: string;
  /** Pixel format the encoder receives, e.g. `yuv420p`. */
  pixelFormat: string;
  /** A `-vf` chain run before the pixel format conversion. */
  filter?: string;
  /**
   * Encoder AVOptions: private ones (`preset`, `profile`) and generic ones
   * (`b`, `level`, `colorspace`, `color_primaries`, `color_trc`).
   */
  options?: Record<string, string>;
}

/** A running encode that turns written frames into a finished file. */
export interface VideoFrameEncoder {
  /** One frame: packed RGBA8 at the encoder's size, or one PNG file. */
  write(frame: Uint8Array): Promise<void>;
  /** Flush the encoder and finalize the file. */
  finish(): Promise<void>;
  /** Stop and free everything. The file is left incomplete. */
  abort(): Promise<void>;
}

/** Decodes standalone PNG files, one packet per file. */
class PngDecoder {
  private readonly context = new CodecContext();
  private readonly packet = new Packet();
  private opened = false;

  async decode(bytes: Uint8Array): Promise<Frame> {
    if (!this.opened) {
      const codec = Codec.findDecoder(AV_CODEC_ID_PNG);
      if (!codec) throw new Error("This libav build has no PNG decoder");
      this.context.allocContext3(codec);
      const opened = await this.context.open2(codec, null);
      if (opened < 0) throw new Error(`Could not open the PNG decoder (${opened})`);
      this.packet.alloc();
      this.opened = true;
    }
    this.packet.data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sent = await this.context.sendPacket(this.packet);
    this.packet.unref();
    if (sent < 0) throw new Error(`The PNG decoder refused a frame (${sent})`);
    const frame = new Frame();
    frame.alloc();
    const received = await this.context.receiveFrame(frame);
    if (received < 0) {
      frame.free();
      throw new Error(`The PNG decoder returned no picture (${received})`);
    }
    return frame;
  }

  free(): void {
    if (!this.opened) return;
    this.packet.free();
    this.context.freeContext();
    this.opened = false;
  }
}

/**
 * Encode frames written at `fps` into `outPath`, the in-process form of
 * `ffmpeg -f rawvideo -pix_fmt rgba -s WxH -r FPS -i pipe:0 <args> out` (and of
 * `-f image2pipe -c:v png` for `input: "png"`). Frames are converted by the
 * spec's filter and then to its pixel format, as the CLI's `-vf` and
 * `-pix_fmt` did.
 */
export async function openVideoFrameEncoder(opts: {
  outPath: string;
  fps: number;
  input: "rgba" | "png";
  /** Frame size. Required for RGBA input; a PNG carries its own. */
  width?: number;
  height?: number;
  spec: VideoEncoderSpec;
  signal?: AbortSignal;
}): Promise<VideoFrameEncoder> {
  quietLibav();
  throwIfAborted(opts.signal);
  const { spec, signal } = opts;
  if (opts.input === "rgba" && !(opts.width && opts.height)) {
    throw new Error("RGBA input needs the frame size");
  }
  const codec = findEncoder(spec.codec);
  if (!codec) throw new Error(`This libav build has no ${spec.codec} encoder`);
  const rate = rationalFor(opts.fps);
  const timeBase = new Rational(rate.den, rate.num);
  const filter = FilterAPI.create(
    [spec.filter, `format=${spec.pixelFormat}`].filter(Boolean).join(","),
    { signal }
  );
  let encoder: Encoder | null = null;
  let output: FileMuxer | null = null;
  let streamIndex = -1;
  const png = opts.input === "png" ? new PngDecoder() : null;
  let index = 0;
  let failure: unknown = null;
  let done = false;

  const release = async (): Promise<void> => {
    if (done) return;
    done = true;
    png?.free();
    filter.close();
    encoder?.close();
    await output?.close();
  };

  const writePackets = async (frame: Frame | null): Promise<void> => {
    if (!encoder || !output) return;
    for (const packet of await encoder.encodeAll(frame)) {
      await output.muxer.writePacket(packet, streamIndex);
      packet.free();
    }
  };

  const encodeFiltered = async (frame: Frame | null): Promise<void> => {
    for (const filtered of await filter.processAll(frame)) {
      try {
        if (!encoder) {
          encoder = await Encoder.create(codec, {
            options: spec.options,
            context: { framerate: new Rational(rate.num, rate.den) },
            signal
          });
          output = await openFileMuxer(opts.outPath, { signal });
          streamIndex = output.muxer.addStream(encoder);
        }
        await writePackets(filtered);
      } finally {
        filtered.free();
      }
    }
  };

  const guard = async (work: () => Promise<void>): Promise<void> => {
    if (failure) throw failure;
    if (done) throw new Error("The encoder is closed");
    if (signal?.aborted) {
      failure = abortError(signal);
      await release();
      throw failure;
    }
    try {
      await work();
    } catch (error) {
      failure = error;
      await release();
      throw error;
    }
  };

  return {
    write(bytes: Uint8Array): Promise<void> {
      return guard(async () => {
        let frame: Frame;
        if (png) {
          frame = await png.decode(bytes);
        } else {
          const width = opts.width ?? 0;
          const height = opts.height ?? 0;
          if (bytes.byteLength !== width * height * 4) {
            throw new Error(
              `Expected a ${width}x${height} RGBA frame (${width * height * 4} bytes), got ${bytes.byteLength}`
            );
          }
          frame = Frame.fromVideoBuffer(
            Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
            { width, height, format: AV_PIX_FMT_RGBA, timeBase }
          );
        }
        frame.pts = BigInt(index);
        frame.timeBase = timeBase;
        index += 1;
        try {
          await encodeFiltered(frame);
        } finally {
          frame.free();
        }
      });
    },
    finish(): Promise<void> {
      return guard(async () => {
        await encodeFiltered(null);
        await writePackets(null);
        if (!output) throw new Error("No frames were written");
        await release();
      });
    },
    abort: release
  };
}
