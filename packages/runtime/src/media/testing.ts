/**
 * Test media without the ffmpeg CLI: generate inputs from libavfilter
 * sources (`testsrc2`, `color`, `sine`, `anullsrc`) or from RGBA frames, and
 * measure outputs (duration, size, frame times, pixels, PCM loudness).
 *
 * These run on the same node-av build the server uses, so a test that passes
 * here needs no `ffmpeg` on PATH.
 */

import { ALL_FORMATS, EncodedPacketSink, FilePathSource, Input } from "mediabunny";
import {
  avGetCodecName,
  avGetPixFmtName,
  Decoder,
  Demuxer,
  Encoder,
  FilterAPI,
  type AVPixelFormat,
  type Frame,
  type Packet
} from "node-av";

import { findEncoder, openFileMuxer, quietLibav, type FileMuxer } from "./av.js";
import { decodeAudioToPcm, type PcmAudio } from "./audio.js";
import { AudioEncoder } from "./audio-encoder.js";
import { packetTimes, probeMedia, type MediaProbe } from "./probe.js";
import { openRgbaFrameReader, openVideoFrameEncoder, type VideoEncoderSpec } from "./rgba.js";

/** One generated stream: a lavfi source graph and how to encode it. */
export interface GeneratedStream {
  /**
   * A lavfi source with its own length, e.g.
   * `testsrc2=size=64x48:rate=24:duration=2` or `sine=frequency=440:duration=2`.
   */
  source: string;
  /** Encoder name. Defaults to `libx264` for video and `aac` for audio. */
  codec?: string;
  /** Video pixel format. Defaults to `yuv420p`. */
  pixelFormat?: string;
  /** Filters between the source and the encoder. */
  filter?: string;
  /** Encoder AVOptions, e.g. `{ g: "12", bf: "2", colorspace: "bt709" }`. */
  options?: Record<string, string>;
}

interface TimedPacket {
  packet: Packet;
  sec: number;
  stream: number;
}

interface EncodedSource {
  packets: Packet[];
  index: number;
  close(): void;
}

async function encodeSource(
  stream: GeneratedStream,
  kind: "audio" | "video",
  output: FileMuxer
): Promise<EncodedSource> {
  const codecName = stream.codec ?? (kind === "video" ? "libx264" : "aac");
  const demuxer = await Demuxer.open(stream.source, { format: "lavfi" });
  const source = demuxer.streams[0];
  if (!source) {
    await demuxer.close();
    throw new Error(`lavfi source produced no stream: ${stream.source}`);
  }
  const decoder = await Decoder.create(source);
  const steps = [stream.filter, kind === "video" ? `format=${stream.pixelFormat ?? "yuv420p"}` : undefined];
  const chain = steps.filter((step): step is string => Boolean(step)).join(",");
  const filter = FilterAPI.create(chain.length > 0 ? chain : kind === "video" ? "null" : "anull");
  let encode: (frame: Frame) => Promise<Packet[]>;
  let flush: () => Promise<Packet[]>;
  let closeEncoder: () => void;
  let index: number;
  if (kind === "video") {
    const codec = findEncoder(codecName);
    if (!codec) throw new Error(`This libav build has no ${codecName} encoder`);
    const encoder = await Encoder.create(codec, { options: stream.options });
    // The muxer sets the global-header flag, which only an unopened encoder takes.
    index = output.muxer.addStream(encoder);
    encode = (frame) => encoder.encodeAll(frame);
    flush = () => encoder.encodeAll(null);
    closeEncoder = () => encoder.close();
  } else {
    const encoder = await AudioEncoder.create(codecName, {
      sampleRate: source.codecpar.sampleRate,
      channels: source.codecpar.channels,
      options: stream.options
    });
    index = output.muxer.addStream(encoder.encoder);
    encode = (frame) => encoder.encode(frame);
    flush = () => encoder.flush();
    closeEncoder = () => encoder.close();
  }
  const packets: Packet[] = [];
  try {
    for await (const decoded of decoder.frames(demuxer.packets(source.index))) {
      if (!decoded) continue;
      for (const frame of await filter.processAll(decoded)) {
        packets.push(...(await encode(frame)));
        frame.free();
      }
      decoded.free();
    }
    for (const frame of await filter.processAll(null)) {
      packets.push(...(await encode(frame)));
      frame.free();
    }
    packets.push(...(await flush()));
  } finally {
    filter.close();
    decoder.close();
    await demuxer.close();
  }
  return {
    packets,
    index,
    close(): void {
      for (const packet of packets) packet.free();
      closeEncoder();
    }
  };
}

/**
 * Write a file holding the given streams, as
 * `ffmpeg -f lavfi -i <video> -f lavfi -i <audio> <encoder args> out` did.
 */
export async function generateMedia(opts: {
  outPath: string;
  video?: GeneratedStream;
  audio?: GeneratedStream;
  /** Muxer AVOptions, e.g. `{ movflags: "+faststart" }`. */
  muxerOptions?: Record<string, string>;
}): Promise<void> {
  quietLibav();
  if (!opts.video && !opts.audio) throw new Error("Give a video or an audio stream");
  const output = await openFileMuxer(opts.outPath, { muxerOptions: opts.muxerOptions });
  const encoded: EncodedSource[] = [];
  try {
    if (opts.video) encoded.push(await encodeSource(opts.video, "video", output));
    if (opts.audio) encoded.push(await encodeSource(opts.audio, "audio", output));
    const timed: TimedPacket[] = [];
    for (const { packets, index } of encoded) {
      for (const packet of packets) {
        const { timeBase } = packet;
        timed.push({
          packet,
          stream: index,
          sec: (Number(packet.dts) * timeBase.num) / timeBase.den
        });
      }
    }
    timed.sort((a, b) => a.sec - b.sec);
    for (const { packet, stream } of timed) {
      await output.muxer.writePacket(packet, stream);
    }
    await output.close();
  } finally {
    await output.close();
    for (const source of encoded) source.close();
  }
}

/**
 * Encode frames produced by `frameAt` (packed RGBA8) at `fps`. Defaults to
 * lossless FFV1 so a test reads back exactly what it wrote.
 */
export async function writeRgbaVideo(opts: {
  outPath: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  frameAt: (index: number) => Uint8Array;
  spec?: VideoEncoderSpec;
}): Promise<void> {
  const encoder = await openVideoFrameEncoder({
    outPath: opts.outPath,
    fps: opts.fps,
    input: "rgba",
    width: opts.width,
    height: opts.height,
    spec: opts.spec ?? { codec: "ffv1", pixelFormat: "bgra", options: { level: "3" } }
  });
  try {
    for (let index = 0; index < opts.frames; index++) {
      await encoder.write(opts.frameAt(index));
    }
    await encoder.finish();
  } catch (error) {
    await encoder.abort();
    throw error;
  }
}

/** A solid RGBA frame. */
export function solidRgba(
  width: number,
  height: number,
  [r, g, b, a]: readonly [number, number, number, number]
): Uint8Array {
  const frame = new Uint8Array(width * height * 4);
  for (let i = 0; i < frame.length; i += 4) {
    frame[i] = r;
    frame[i + 1] = g;
    frame[i + 2] = b;
    frame[i + 3] = a;
  }
  return frame;
}

/** Write 16-bit PCM WAV bytes for interleaved float `samples`. */
export function encodeWav(samples: Float32Array, sampleRate: number, channels: number): Uint8Array {
  const data = samples.length * 2;
  const bytes = new Uint8Array(44 + data);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + data, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }
  return bytes;
}

/** Interleaved samples of a sine, or silence at `amplitude: 0`. */
export function sineSamples(opts: {
  sampleRate: number;
  channels: number;
  durationSec: number;
  frequency: number;
  amplitude?: number;
}): Float32Array {
  const frames = Math.round(opts.sampleRate * opts.durationSec);
  const amplitude = opts.amplitude ?? 0.5;
  const samples = new Float32Array(frames * opts.channels);
  for (let i = 0; i < frames; i++) {
    const value = amplitude * Math.sin((2 * Math.PI * opts.frequency * i) / opts.sampleRate);
    for (let c = 0; c < opts.channels; c++) samples[i * opts.channels + c] = value;
  }
  return samples;
}

/** What a test asks of an output file. */
export interface MediaReport extends MediaProbe {
  /** Video packet times in seconds, sorted. Empty without video. */
  frameTimes: number[];
}

/** Probe `filePath` and list its video frame times. */
export async function inspectMedia(filePath: string): Promise<MediaReport> {
  const probe = await probeMedia(filePath, { frameRatePackets: Number.POSITIVE_INFINITY });
  const times = probe.video ? ((await packetTimes(filePath)) ?? []) : [];
  return { ...probe, frameTimes: [...times].sort((a, b) => a - b) };
}

/**
 * Every video packet's presentation time (seconds, rounded to the
 * microsecond as ffprobe prints `pts_time`) and keyframe flag, in
 * presentation order.
 */
export async function videoPacketInfo(
  filePath: string
): Promise<Array<{ pts: number; key: boolean }>> {
  const input = new Input({ source: new FilePathSource(filePath), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return [];
    const packets: Array<{ pts: number; key: boolean }> = [];
    for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, {
      metadataOnly: true
    })) {
      packets.push({ pts: Math.round(packet.timestamp * 1e6) / 1e6, key: packet.type === "key" });
    }
    return packets.sort((a, b) => a.pts - b.pts);
  } finally {
    input.dispose();
  }
}

/** Every video frame of `filePath` as RGBA at `width`x`height`, in order. */
export async function readRgbaFrames(
  filePath: string,
  size: { width: number; height: number }
): Promise<Uint8Array[]> {
  const reader = await openRgbaFrameReader({
    filePath,
    filter: `scale=${size.width}:${size.height}:flags=accurate_rnd+full_chroma_int,format=rgba`
  });
  if (!reader) return [];
  const frames: Uint8Array[] = [];
  try {
    for (let frame = await reader.next(); frame; frame = await reader.next()) {
      frames.push(frame.rgba);
    }
  } finally {
    await reader.close();
  }
  return frames;
}

/** Mean of each RGBA channel over a frame. */
export function meanRgba(rgba: Uint8Array): [number, number, number, number] {
  const sums = [0, 0, 0, 0];
  for (let i = 0; i < rgba.length; i += 4) {
    for (let c = 0; c < 4; c++) sums[c] += rgba[i + c] ?? 0;
  }
  const pixels = Math.max(1, rgba.length / 4);
  return [sums[0] / pixels, sums[1] / pixels, sums[2] / pixels, sums[3] / pixels];
}

/** `filePath`'s audio as interleaved float PCM. */
export function readPcm(
  filePath: string,
  options: { sampleRate: number; channels?: number }
): Promise<PcmAudio> {
  return decodeAudioToPcm(filePath, options);
}

/** RMS of `audio` between two times, over every channel. */
export function rmsBetween(audio: PcmAudio, startSec: number, endSec: number): number {
  const first = Math.max(0, Math.floor(startSec * audio.sampleRate)) * audio.channels;
  const last = Math.min(
    audio.samples.length,
    Math.floor(endSec * audio.sampleRate) * audio.channels
  );
  if (last <= first) return 0;
  let sum = 0;
  for (let i = first; i < last; i++) sum += (audio.samples[i] ?? 0) ** 2;
  return Math.sqrt(sum / (last - first));
}

/** ffprobe's names for the color tags a test checks; anything else reads as its number. */
const COLOR_SPACES: Record<number, string> = { 0: "gbr", 1: "bt709", 2: "unknown", 5: "bt470bg", 6: "smpte170m", 9: "bt2020nc" };
const COLOR_PRIMARIES: Record<number, string> = { 1: "bt709", 2: "unknown", 5: "bt470bg", 6: "smpte170m", 9: "bt2020" };
const COLOR_TRANSFERS: Record<number, string> = { 1: "bt709", 2: "unknown", 6: "smpte170m", 13: "iec61966-2-1", 14: "bt2020-10" };
const COLOR_RANGES: Record<number, string> = { 0: "unknown", 1: "tv", 2: "pc" };

/** What ffprobe's `-show_streams` printed for a video stream, by its names. */
export interface VideoStreamFormat {
  /** `h264`, `vp9`, `prores`. */
  codec: string;
  /** `yuv420p`, `yuva420p`, `yuv422p10le`. */
  pixelFormat: string;
  colorSpace: string;
  colorPrimaries: string;
  colorTransfer: string;
  colorRange: string;
  /** Stream tags, e.g. Matroska's `alpha_mode`. */
  tags: Record<string, string>;
}

/** The first video stream's codec, pixel format and tags, or null without one. */
export async function videoStreamFormat(filePath: string): Promise<VideoStreamFormat | null> {
  const demuxer = await Demuxer.open(filePath);
  try {
    const stream = demuxer.video();
    if (!stream) return null;
    const { codecpar } = stream;
    const name = (table: Record<number, string>, value: number): string => table[value] ?? String(value);
    return {
      codec: avGetCodecName(codecpar.codecId) ?? "",
      // SAFETY: a video stream's `format` is a pixel format.
      pixelFormat: avGetPixFmtName(codecpar.format as AVPixelFormat) ?? "",
      colorSpace: name(COLOR_SPACES, codecpar.colorSpace),
      colorPrimaries: name(COLOR_PRIMARIES, codecpar.colorPrimaries),
      colorTransfer: name(COLOR_TRANSFERS, codecpar.colorTrc),
      colorRange: name(COLOR_RANGES, codecpar.colorRange),
      tags: stream.metadata?.getAll() ?? {}
    };
  } finally {
    await demuxer.close();
  }
}

/**
 * Every video frame of `filePath` as RGBA at `width`x`height`, decoded by the
 * named libav decoder rather than the default one. A test of VP9 alpha needs
 * `libvpx-vp9`: libav's native vp9 decoder drops the alpha plane WebM keeps
 * in BlockAdditions, as `ffmpeg -c:v libvpx-vp9 -i` was needed to read it.
 */
export async function readRgbaFramesWith(
  filePath: string,
  decoderName: string,
  size: { width: number; height: number }
): Promise<Uint8Array[]> {
  quietLibav();
  const demuxer = await Demuxer.open(filePath);
  let decoder: Decoder | null = null;
  let filter: FilterAPI | null = null;
  try {
    const stream = demuxer.video();
    if (!stream) return [];
    // SAFETY: `decoderName` is a libav decoder name; an unknown one makes
    // `create` throw, which fails the test that named it.
    decoder = await Decoder.create(stream, decoderName as Parameters<typeof Decoder.create>[1] & string);
    const activeFilter = FilterAPI.create(
      `scale=${size.width}:${size.height}:flags=accurate_rnd+full_chroma_int,format=rgba`
    );
    filter = activeFilter;
    const frames: Uint8Array[] = [];
    const take = async (frame: Frame | null): Promise<void> => {
      for (const out of await activeFilter.processAll(frame)) {
        frames.push(new Uint8Array(out.toBuffer()));
        out.free();
      }
    };
    for await (const frame of decoder.frames(demuxer.packets(stream.index))) {
      if (!frame) continue;
      await take(frame);
      frame.free();
    }
    await take(null);
    return frames;
  } finally {
    filter?.close();
    decoder?.close();
    await demuxer.close();
  }
}
