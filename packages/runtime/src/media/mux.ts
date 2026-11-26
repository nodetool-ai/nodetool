/**
 * Encode filtered audio onto an existing video without re-encoding the
 * picture: the in-process form of `ffmpeg -i base ... -map 0:v -map [aout]
 * -c:v copy -c:a <codec> -shortest out`.
 */

import {
  AV_SAMPLE_FMT_DBL,
  AV_SAMPLE_FMT_DBLP,
  AV_SAMPLE_FMT_FLT,
  AV_SAMPLE_FMT_FLTP,
  AV_SAMPLE_FMT_S16,
  AV_SAMPLE_FMT_S32,
  avChannelLayoutDefault,
  avGetCodecName,
  Demuxer,
  Encoder,
  FilterAPI,
  Frame,
  Rational,
  type Packet
} from "node-av";

import { AudioEncoder } from "./audio-encoder.js";
import {
  abortError,
  findEncoder,
  openFileMuxer,
  quietLibav,
  startTimeSeconds,
  throwIfAborted,
  type FileMuxer
} from "./av.js";
import { transformMedia } from "./transform.js";

type PcmWavCodec = "pcm_s16le" | "pcm_s24le" | "pcm_f32le";

function isPcmWavCodec(codec: string): codec is PcmWavCodec {
  return codec === "pcm_s16le" || codec === "pcm_s24le" || codec === "pcm_f32le";
}

interface StreamAudioEncoder {
  readonly encoder: Encoder;
  encode(frame: Frame): Promise<Packet[]>;
  flush(): Promise<Packet[]>;
  close(): void;
}

/** Deterministic xoshiro128** uniform PRNG in [0, 1) for 16-bit TPDF dither. */
function createUniformPrng(): () => number {
  let s0 = 0x243f6a88;
  let s1 = 0x85a308d3;
  let s2 = 0x13198a2e;
  let s3 = 0x03707344;
  return (): number => {
    const r = Math.imul(s1, 5);
    const result = Math.imul((r << 7) | (r >>> 25), 9) >>> 0;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = (s3 << 11) | (s3 >>> 21);
    return result / 0x100000000;
  };
}

/**
 * Replace NaN and ±Infinity samples with 0 in floating-point audio frames
 * before resampling or encoding so non-finite values neither smear across FIR
 * taps nor leak into float WAV outputs. Finite values (including > 1.0
 * headroom) are untouched.
 */
function sanitizeFloatFrame(frame: Frame): void {
  const format = frame.format;
  const isFloat32 = format === AV_SAMPLE_FMT_FLT || format === AV_SAMPLE_FMT_FLTP;
  const isFloat64 = format === AV_SAMPLE_FMT_DBL || format === AV_SAMPLE_FMT_DBLP;
  if (!isFloat32 && !isFloat64) return;
  const nbSamples = frame.nbSamples;
  const channels = frame.channels;
  if (nbSamples <= 0 || channels <= 0) return;

  const planar = format === AV_SAMPLE_FMT_FLTP || format === AV_SAMPLE_FMT_DBLP;
  const planeCount = planar ? channels : 1;
  const samplesPerPlane = planar ? nbSamples : nbSamples * channels;
  const elemBytes = isFloat32 ? 4 : 8;

  const readPlanes = (): Buffer[] | null => frame.extendedData ?? frame.data;
  const planes = readPlanes();
  if (!planes) return;

  let hasNonFinite = false;
  for (let p = 0; p < planeCount && p < planes.length && !hasNonFinite; p++) {
    const buf = planes[p];
    if (!buf) continue;
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const count = Math.min(samplesPerPlane, Math.floor(buf.byteLength / elemBytes));
    if (isFloat32) {
      for (let i = 0; i < count; i++) {
        if (!Number.isFinite(view.getFloat32(i * 4, true))) {
          hasNonFinite = true;
          break;
        }
      }
    } else {
      for (let i = 0; i < count; i++) {
        if (!Number.isFinite(view.getFloat64(i * 8, true))) {
          hasNonFinite = true;
          break;
        }
      }
    }
  }
  if (!hasNonFinite) return;

  const writable = frame.makeWritable();
  if (writable < 0) {
    throw new Error(`Could not make audio frame writable for sanitization (${writable})`);
  }
  const writablePlanes = readPlanes();
  if (!writablePlanes) return;
  for (let p = 0; p < planeCount && p < writablePlanes.length; p++) {
    const buf = writablePlanes[p];
    if (!buf) continue;
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const count = Math.min(samplesPerPlane, Math.floor(buf.byteLength / elemBytes));
    if (isFloat32) {
      for (let i = 0; i < count; i++) {
        if (!Number.isFinite(view.getFloat32(i * 4, true))) {
          view.setFloat32(i * 4, 0, true);
        }
      }
    } else {
      for (let i = 0; i < count; i++) {
        if (!Number.isFinite(view.getFloat64(i * 8, true))) {
          view.setFloat64(i * 8, 0, true);
        }
      }
    }
  }
}

/**
 * Uncompressed PCM WAV encoder matching native ExportEngine semantics:
 * - Resamples/remixes into 32-bit float first (preserving finite headroom).
 * - Sanitizes NaN and ±Infinity to 0 before resampling and before quantization.
 * - Applies TPDF dither in (-1, 1) LSB only at the final 16-bit quantization.
 * - Leaves 24-bit (rounded cleanly to the 24-bit grid) and 32-bit float
 *   (headroom preserved, unclamped) undithered.
 */
class PcmAudioEncoder implements StreamAudioEncoder {
  private readonly prng: (() => number) | null;

  private constructor(
    readonly encoder: Encoder,
    private readonly toFloat: FilterAPI,
    private readonly codecName: PcmWavCodec,
    private readonly sampleRate: number,
    private readonly channels: number
  ) {
    this.prng = codecName === "pcm_s16le" ? createUniformPrng() : null;
  }

  static async create(
    codecName: PcmWavCodec,
    opts: { sampleRate: number; channels: number; signal?: AbortSignal }
  ): Promise<PcmAudioEncoder> {
    quietLibav();
    const codec = findEncoder(codecName);
    if (!codec) throw new Error(`This libav build has no ${codecName} encoder`);
    const layout =
      opts.channels === 1 ? "mono" : opts.channels === 2 ? "stereo" : `${opts.channels}c`;
    const toFloat = FilterAPI.create(
      `aresample=${opts.sampleRate},aformat=sample_fmts=flt:sample_rates=${opts.sampleRate}:channel_layouts=${layout}`,
      { signal: opts.signal }
    );
    try {
      const encoder = await Encoder.create(codec, { signal: opts.signal });
      return new PcmAudioEncoder(encoder, toFloat, codecName, opts.sampleRate, opts.channels);
    } catch (error) {
      toFloat.close();
      throw error;
    }
  }

  async encode(frame: Frame): Promise<Packet[]> {
    sanitizeFloatFrame(frame);
    return this.encodeFloatFrames(await this.toFloat.processAll(frame));
  }

  async flush(): Promise<Packet[]> {
    const packets = await this.encodeFloatFrames(await this.toFloat.processAll(null));
    try {
      packets.push(...(await this.encoder.encodeAll(null)));
      return packets;
    } catch (error) {
      for (const packet of packets) packet.free();
      throw error;
    }
  }

  close(): void {
    this.toFloat.close();
    this.encoder.close();
  }

  private async encodeFloatFrames(floatFrames: Frame[]): Promise<Packet[]> {
    const packets: Packet[] = [];
    let index = 0;
    try {
      for (; index < floatFrames.length; index++) {
        const flt = floatFrames[index]!;
        try {
          if (flt.nbSamples <= 0) continue;
          const quantized = this.quantizeFrame(flt);
          try {
            packets.push(...(await this.encoder.encodeAll(quantized)));
          } finally {
            quantized.free();
          }
        } finally {
          flt.free();
        }
      }
      return packets;
    } catch (error) {
      for (let rest = index + 1; rest < floatFrames.length; rest++) {
        floatFrames[rest]?.free();
      }
      for (const packet of packets) packet.free();
      throw error;
    }
  }

  private quantizeFrame(flt: Frame): Frame {
    const inBuf = flt.data?.[0];
    if (!inBuf) {
      throw new Error("Audio filter produced a float frame with no sample buffer");
    }
    const nbSamples = flt.nbSamples;
    const count = nbSamples * this.channels;
    const inView = new DataView(inBuf.buffer, inBuf.byteOffset, inBuf.byteLength);
    const out = new Frame();
    out.alloc();
    try {
      out.format =
        this.codecName === "pcm_s16le"
          ? AV_SAMPLE_FMT_S16
          : this.codecName === "pcm_s24le"
            ? AV_SAMPLE_FMT_S32
            : AV_SAMPLE_FMT_FLT;
      out.sampleRate = this.sampleRate;
      out.channelLayout = avChannelLayoutDefault(this.channels);
      out.nbSamples = nbSamples;
      out.pts = flt.pts;
      out.timeBase =
        flt.timeBase.den > 0 ? flt.timeBase : new Rational(1, this.sampleRate);
      const allocated = out.getBuffer(0);
      if (allocated < 0) {
        throw new Error(`Could not allocate PCM audio frame (${allocated})`);
      }
      const outBuf = out.data?.[0];
      if (!outBuf) {
        throw new Error("Allocated PCM audio frame has no sample buffer");
      }
      const outView = new DataView(outBuf.buffer, outBuf.byteOffset, outBuf.byteLength);

      if (this.codecName === "pcm_s16le") {
        const nextUniform = this.prng!;
        for (let i = 0; i < count; i++) {
          const raw = inView.getFloat32(i * 4, true);
          const sample = Number.isFinite(raw) ? raw : 0;
          const dither = nextUniform() - nextUniform();
          const scaled = Math.max(-32768, Math.min(32767, sample * 32768 + dither));
          outView.setInt16(i * 2, Math.round(scaled), true);
        }
      } else if (this.codecName === "pcm_s24le") {
        for (let i = 0; i < count; i++) {
          const raw = inView.getFloat32(i * 4, true);
          const sample = Number.isFinite(raw) ? raw : 0;
          const scaled = Math.max(-8388608, Math.min(8388607, sample * 8388608));
          outView.setInt32(i * 4, Math.round(scaled) * 256, true);
        }
      } else {
        for (let i = 0; i < count; i++) {
          const raw = inView.getFloat32(i * 4, true);
          outView.setFloat32(i * 4, Number.isFinite(raw) ? raw : 0, true);
        }
      }
      return out;
    } catch (error) {
      out.free();
      throw error;
    }
  }
}

async function createStreamAudioEncoder(
  codec: string,
  opts: { sampleRate: number; channels: number; signal?: AbortSignal }
): Promise<StreamAudioEncoder> {
  if (isPcmWavCodec(codec)) {
    return PcmAudioEncoder.create(codec, opts);
  }
  const base = await AudioEncoder.create(codec, opts);
  return {
    encoder: base.encoder,
    encode: (frame) => {
      sanitizeFloatFrame(frame);
      return base.encode(frame);
    },
    flush: () => base.flush(),
    close: () => base.close()
  };
}

function seconds(ts: bigint, timeBase: { num: number; den: number }): number {
  return (Number(ts) * timeBase.num) / timeBase.den;
}

/** The end of the video stream in seconds: last packet's pts plus its duration. */
async function videoEndSec(filePath: string, signal?: AbortSignal): Promise<number> {
  const demuxer = await Demuxer.open(filePath, { signal });
  try {
    const stream = demuxer.video();
    if (!stream) throw new Error(`${filePath} has no video stream`);
    const formatStart = startTimeSeconds(demuxer.getFormatContext().startTime, {
      num: 1,
      den: 1_000_000
    });
    let end = 0;
    for await (const packet of demuxer.packets(stream.index)) {
      if (!packet) continue;
      throwIfAborted(signal);
      end = Math.max(
        end,
        seconds(packet.pts + packet.duration, stream.timeBase) - formatStart
      );
      packet.free();
    }
    return end;
  } finally {
    await demuxer.close();
  }
}

/**
 * Copy `videoPath`'s video stream into `outPath` and encode `audio` beside it
 * as `codec` at `sampleRate`, stereo. The audio is cut at the end of the
 * picture, as `-shortest` cut it, so a padded mix never outlasts the video.
 * `audio`'s frames are consumed and freed.
 */
export async function muxAudioWithVideoCopy(opts: {
  videoPath: string;
  audio: AsyncIterable<Frame>;
  outPath: string;
  codec: string;
  sampleRate: number;
  signal?: AbortSignal;
}): Promise<void> {
  const { signal } = opts;
  quietLibav();
  throwIfAborted(signal);
  const endSec = await videoEndSec(opts.videoPath, signal);

  const demuxer = await Demuxer.open(opts.videoPath, { signal });
  let output: FileMuxer | null = null;
  let audioEncoder: AudioEncoder | null = null;
  try {
    const videoStream = demuxer.video();
    if (!videoStream) throw new Error(`${opts.videoPath} has no video stream`);
    output = await openFileMuxer(opts.outPath, { signal });
    const videoIndex = output.muxer.addStream(videoStream);
    // The CLI converted at the output: `-ar` and `-ac 2` after the graph.
    audioEncoder = await AudioEncoder.create(opts.codec, {
      sampleRate: opts.sampleRate,
      channels: 2,
      signal
    });
    const audioIndex = output.muxer.addStream(audioEncoder.encoder);
    const activeEncoder = audioEncoder;
    const activeOutput = output;
    const formatStart = startTimeSeconds(demuxer.getFormatContext().startTime, {
      num: 1,
      den: 1_000_000
    });

    const videoPackets = demuxer.packets(videoStream.index);
    let pendingVideo: Packet | null = null;
    let videoDone = false;
    const nextVideo = async (): Promise<void> => {
      while (!pendingVideo && !videoDone) {
        const { value, done } = await videoPackets.next();
        if (done) videoDone = true;
        else if (value) pendingVideo = value;
      }
    };
    const pendingVideoSec = (): number =>
      pendingVideo
        ? seconds(pendingVideo.dts ?? pendingVideo.pts, videoStream.timeBase) - formatStart
        : Number.POSITIVE_INFINITY;
    /** Write every video packet that sorts before `untilSec`. */
    const drainVideo = async (untilSec: number): Promise<void> => {
      await nextVideo();
      while (pendingVideo && pendingVideoSec() <= untilSec) {
        const packet: Packet = pendingVideo;
        pendingVideo = null;
        await activeOutput.muxer.writePacket(packet, videoIndex);
        packet.free();
        await nextVideo();
      }
    };

    const writePackets = async (packets: Packet[]): Promise<void> => {
      for (const packet of packets) {
        await drainVideo(seconds(packet.pts, packet.timeBase));
        await activeOutput.muxer.writePacket(packet, audioIndex);
        packet.free();
      }
    };

    for await (const mixed of opts.audio) {
      try {
        if (signal?.aborted) throw abortError(signal);
        const startSec = seconds(mixed.pts, mixed.timeBase);
        if (startSec >= endSec) break;
        const samples = mixed.nbSamples;
        const keep = Math.min(samples, Math.ceil((endSec - startSec) * mixed.sampleRate));
        if (keep < samples) {
          // The frame crosses the end of the picture: keep only what lies before it.
          mixed.nbSamples = keep;
        }
        await writePackets(await activeEncoder.encode(mixed));
        if (keep < samples) break;
      } finally {
        mixed.free();
      }
    }
    await writePackets(await activeEncoder.flush());
    await drainVideo(Number.POSITIVE_INFINITY);
    await output.close();
  } finally {
    audioEncoder?.close();
    await output?.close();
    await demuxer.close();
  }
}

/**
 * Encode `audio` into an audio-only container at `outPath` using `codec` at
 * `sampleRate` Hz. Cuts the stream at `durationSec` when given (matching how
 * `muxAudioWithVideoCopy` ends an `apad`-tailed mix at the video duration).
 * `audio`'s frames are consumed and freed.
 */
export async function encodeAudioToFile(opts: {
  audio: AsyncIterable<Frame>;
  outPath: string;
  codec: string;
  sampleRate: number;
  channels?: number;
  durationSec?: number;
  signal?: AbortSignal;
}): Promise<void> {
  const { signal } = opts;
  const channels = opts.channels ?? 2;
  const endSec = opts.durationSec;
  quietLibav();
  throwIfAborted(signal);

  let output: FileMuxer | null = null;
  let audioEncoder: StreamAudioEncoder | null = null;
  try {
    output = await openFileMuxer(opts.outPath, { signal });
    audioEncoder = await createStreamAudioEncoder(opts.codec, {
      sampleRate: opts.sampleRate,
      channels,
      signal
    });
    const audioIndex = output.muxer.addStream(audioEncoder.encoder);
    const activeEncoder = audioEncoder;
    const activeOutput = output;

    const writePackets = async (packets: Packet[]): Promise<void> => {
      for (const packet of packets) {
        await activeOutput.muxer.writePacket(packet, audioIndex);
        packet.free();
      }
    };

    for await (const mixed of opts.audio) {
      try {
        if (signal?.aborted) throw abortError(signal);
        if (endSec !== undefined) {
          const startSec = seconds(mixed.pts, mixed.timeBase);
          if (startSec >= endSec) break;
          const samples = mixed.nbSamples;
          const keep = Math.min(samples, Math.ceil((endSec - startSec) * mixed.sampleRate));
          if (keep <= 0) break;
          if (keep < samples) {
            mixed.nbSamples = keep;
          }
          await writePackets(await activeEncoder.encode(mixed));
          if (keep < samples) break;
        } else {
          await writePackets(await activeEncoder.encode(mixed));
        }
      } finally {
        mixed.free();
      }
    }
    await writePackets(await activeEncoder.flush());
    await output.close();
  } finally {
    audioEncoder?.close();
    await output?.close();
  }
}

/** The video and audio codec of a file, in libav's names; `null` for none. */
export async function streamCodecs(
  filePath: string,
  signal?: AbortSignal
): Promise<{ video: string | null; audio: string | null }> {
  quietLibav();
  const demuxer = await Demuxer.open(filePath, { signal });
  try {
    const name = (stream: ReturnType<Demuxer["video"]>): string | null =>
      stream ? (avGetCodecName(stream.codecpar.codecId) ?? "unknown") : null;
    return { video: name(demuxer.video()), audio: name(demuxer.audio()) };
  } finally {
    await demuxer.close();
  }
}

/** A container `muxStreamCopy` writes. */
export type CopyContainer = "mp4" | "mov" | "webm" | "mkv";

/** The codecs each container takes without re-encoding; `null` takes any. */
const COPY_CODECS: Record<CopyContainer, { video: Set<string>; audio: Set<string> } | null> = {
  mp4: {
    video: new Set(["h264", "hevc", "av1", "vp9", "mpeg4"]),
    audio: new Set(["aac", "mp3", "opus", "flac", "alac", "ac3", "eac3"])
  },
  mov: {
    video: new Set(["h264", "hevc", "av1", "vp9", "mpeg4", "prores"]),
    audio: new Set(["aac", "mp3", "opus", "flac", "alac", "ac3", "eac3", "pcm_s16le"])
  },
  webm: {
    video: new Set(["vp8", "vp9", "av1"]),
    audio: new Set(["opus", "vorbis"])
  },
  mkv: null
};

function isCopyContainer(name: string): name is CopyContainer {
  return Object.hasOwn(COPY_CODECS, name);
}

/** Whether `container` holds `video` and `audio` (either may be absent) as they are. */
function holds(container: CopyContainer, video: string | null, audio: string | null): boolean {
  const codecs = COPY_CODECS[container];
  if (!codecs) return true;
  return (!video || codecs.video.has(video)) && (!audio || codecs.audio.has(audio));
}

/**
 * The container a stream copy of `video` and `audio` goes into, as yt-dlp
 * picked one when it merged: WebM when both are WebM codecs, else MP4 when
 * MP4 holds both, else Matroska, which holds anything.
 */
export function copyContainerFor(video: string | null, audio: string | null): CopyContainer {
  if (holds("webm", video, audio)) return "webm";
  if (holds("mp4", video, audio)) return "mp4";
  return "mkv";
}

/**
 * Copy the video stream of `videoPath` and the audio stream of `audioPath`
 * into one file, packets unchanged: the in-process form of
 * `ffmpeg -i v -i a -map 0:v -map 1:a -c copy out`, which is what yt-dlp ran
 * to merge formats.
 *
 * `container` is `auto` (see {@link copyContainerFor}) or a
 * {@link CopyContainer}; the output is `<outStem>.<container>`. A container
 * that cannot hold the codecs without re-encoding throws an error naming
 * both codecs and the container, before any file is written. When the two
 * paths are the same file, its audio stream is optional.
 */
export async function muxStreamCopy(opts: {
  videoPath: string;
  audioPath: string;
  outStem: string;
  container: string;
  signal?: AbortSignal;
}): Promise<{ outPath: string; container: CopyContainer; video: string; audio: string | null }> {
  const { signal } = opts;
  const sameFile = opts.videoPath === opts.audioPath;
  const video = (await streamCodecs(opts.videoPath, signal)).video;
  if (!video) throw new Error(`${opts.videoPath} has no video stream`);
  const audio = (await streamCodecs(opts.audioPath, signal)).audio;
  if (!audio && !sameFile) throw new Error(`${opts.audioPath} has no audio stream`);
  const requested = opts.container.trim().toLowerCase().replace(/^\./, "");
  const container =
    requested === "" || requested === "auto" ? copyContainerFor(video, audio) : requested;
  if (!isCopyContainer(container)) {
    throw new Error(
      `Cannot write container "${opts.container}": use auto, mp4, mov, webm or mkv`
    );
  }
  const pair = audio ? `${video} video with ${audio} audio` : `${video} video`;
  if (!holds(container, video, audio)) {
    throw new Error(
      `Cannot stream-copy ${pair} into ${container} without re-encoding. ` +
        `Use container auto or mkv.`
    );
  }
  const outPath = `${opts.outStem}.${container}`;
  try {
    await transformMedia({
      inputs: [{ filePath: opts.videoPath }, { filePath: opts.audioPath }],
      outPath,
      video: { copy: 0 },
      audio: { copy: 1, optional: sameFile },
      signal
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      `Could not stream-copy ${pair} into ${container}: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }
  return { outPath, container, video, audio };
}
