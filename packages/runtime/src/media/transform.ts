/**
 * One output file from filtered or copied input streams: the in-process form
 * of the ffmpeg CLI invocations the video nodes ran, `-vf`, `-af`,
 * `-filter_complex` with `-map`, `-c copy` and `-shortest`. The graph strings
 * are the CLI's, unchanged.
 */

import {
  AV_NOPTS_VALUE,
  AVSEEK_FLAG_BACKWARD,
  Demuxer,
  Encoder,
  Rational,
  type Frame,
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
import type { MediaKind } from "./decode.js";
import {
  openFilterComplex,
  openFilterGraph,
  type FilterComplexInput,
  type FilterRun
} from "./filter-graph.js";
import type { VideoEncoderSpec } from "./rgba.js";

/** An input file, as `-ss S -to E -i path` named it. */
export interface TransformInput {
  filePath: string;
  /** Source seconds to start at (`-ss` before `-i`). */
  seekSec?: number;
  /** Source seconds to stop reading at (`-to` before `-i`). */
  toSec?: number;
}

/**
 * Where one output stream comes from.
 *
 * - `copy`: the input's first stream of the kind, packets unchanged (`-c copy`).
 * - `filter`: a `-vf` or `-af` chain over the input's first stream of the kind.
 * - `graph`: a `-filter_complex` graph whose inputs are labelled `[N:v]` and
 *   `[N:a]` after the input index, read at link `output`.
 *
 * A missing stream throws, as the CLI failed on a stream specifier that
 * matched nothing, unless `optional` is set: then the output has no such
 * stream, as the CLI's default stream selection left it out.
 */
export type StreamPlan =
  | { copy: number; optional?: boolean }
  | { filter: string; input?: number; optional?: boolean }
  | { graph: string; output: string };

/** The CLI's defaults for an `.mp4` output: H.264 in yuv420p. */
export const DEFAULT_VIDEO_ENCODER: VideoEncoderSpec = {
  codec: "libx264",
  pixelFormat: "yuv420p"
};

/** A source of packets for one output stream, in decode order. */
interface PacketSource {
  readonly index: number;
  next(): Promise<Packet | null>;
  close(): Promise<void>;
}

function seconds(ts: bigint, timeBase: { num: number; den: number }): number {
  return (Number(ts) * timeBase.num) / timeBase.den;
}

function packetSeconds(packet: Packet): number {
  const ts = packet.dts !== AV_NOPTS_VALUE ? packet.dts : packet.pts;
  if (ts === AV_NOPTS_VALUE || !(packet.timeBase.den > 0)) return Number.NEGATIVE_INFINITY;
  return seconds(ts, packet.timeBase);
}

function packetEndSeconds(packet: Packet): number {
  if (packet.pts === AV_NOPTS_VALUE || !(packet.timeBase.den > 0)) return Number.NEGATIVE_INFINITY;
  return seconds(packet.pts + packet.duration, packet.timeBase);
}

/** The `[N:v]` and `[N:a]` labels a graph reads, in order of appearance. */
function graphInputs(graph: string, inputs: TransformInput[]): FilterComplexInput[] {
  const seen = new Set<string>();
  const found: FilterComplexInput[] = [];
  for (const match of graph.matchAll(/\[(\d+):([va])\]/g)) {
    const label = `${match[1]}:${match[2]}`;
    if (seen.has(label)) continue;
    seen.add(label);
    const input = inputs[Number(match[1])];
    if (!input) throw new Error(`The graph reads [${label}] but there is no input ${match[1]}`);
    if (input.seekSec || input.toSec !== undefined) {
      throw new Error(`Input ${match[1]} is seeked; a filter_complex input cannot be`);
    }
    found.push({ filePath: input.filePath, kind: match[2] === "v" ? "video" : "audio", label });
  }
  return found;
}

/** Open the filtered frames a plan names, or `null` for a missing optional stream. */
async function openPlanFrames(
  plan: Exclude<StreamPlan, { copy: number }>,
  kind: MediaKind,
  inputs: TransformInput[],
  tail: string,
  signal: AbortSignal | undefined
): Promise<FilterRun | null> {
  if ("graph" in plan) {
    const output = tail ? "__transform_out" : plan.output;
    return openFilterComplex({
      inputs: graphInputs(plan.graph, inputs),
      graph: tail ? `${plan.graph};[${plan.output}]${tail}[${output}]` : plan.graph,
      output,
      outputKind: kind,
      signal
    });
  }
  const index = plan.input ?? 0;
  const input = inputs[index];
  if (!input) throw new Error(`There is no input ${index}`);
  const seekSec = input.seekSec && input.seekSec > 0 ? input.seekSec : 0;
  const prefix = kind === "audio" ? "a" : "";
  // Frames decoded from the keyframe before the seek point sit before zero; the
  // CLI dropped them, and `-to` ends the read at a source time.
  const trims = [
    seekSec > 0 ? `${prefix}trim=start=0` : null,
    input.toSec !== undefined && input.toSec > seekSec ? `${prefix}trim=end=${input.toSec - seekSec}` : null
  ];
  const run = await openFilterGraph({
    filePath: input.filePath,
    kind,
    filter: [...trims, plan.filter, tail].filter((step) => step).join(",") || (kind === "audio" ? "anull" : "null"),
    seekSec,
    signal
  });
  if (!run && !plan.optional) throw new Error(`${input.filePath} has no ${kind} stream`);
  return run;
}

/** Packets of an input stream, copied, rebased to start near zero. */
async function openCopySource(
  output: FileMuxer,
  input: TransformInput,
  kind: MediaKind,
  optional: boolean,
  startSec: { value: number | null },
  signal: AbortSignal | undefined
): Promise<PacketSource | null> {
  const demuxer = await Demuxer.open(input.filePath, { signal });
  try {
    const stream = kind === "video" ? demuxer.video() : demuxer.audio();
    if (!stream) {
      await demuxer.close();
      if (optional) return null;
      throw new Error(`${input.filePath} has no ${kind} stream`);
    }
    const formatStart = startTimeSeconds(demuxer.getFormatContext().startTime, { num: 1, den: 1_000_000 });
    const seekSec = input.seekSec && input.seekSec > 0 ? input.seekSec : 0;
    if (seekSec > 0) await demuxer.seek(formatStart + seekSec, -1, AVSEEK_FLAG_BACKWARD);
    const index = output.muxer.addStream(stream);
    const timeBase = stream.timeBase;
    const packets = demuxer.packets(stream.index);
    const endSec = input.toSec;
    let offsetTicks: bigint | null = null;
    let closed = false;
    return {
      index,
      async next(): Promise<Packet | null> {
        for (;;) {
          if (closed) return null;
          const { value, done } = await packets.next();
          if (done) return null;
          if (!value) continue;
          if (signal?.aborted) {
            value.free();
            throw abortError(signal);
          }
          const ts = value.pts !== AV_NOPTS_VALUE ? value.pts : value.dts;
          const sourceSec = ts === AV_NOPTS_VALUE ? 0 : seconds(ts, timeBase) - formatStart;
          if (endSec !== undefined && sourceSec >= endSec) {
            value.free();
            return null;
          }
          if (offsetTicks === null) {
            // A copy cannot cut between keyframes: the output starts at the
            // keyframe the seek landed on, which the first copied stream
            // fixes for every stream of the file.
            startSec.value ??= seekSec > 0 ? sourceSec : 0;
            offsetTicks = BigInt(Math.round(((formatStart + startSec.value) * timeBase.den) / timeBase.num));
          }
          if (seekSec > 0 && sourceSec < startSec.value!) {
            value.free();
            continue;
          }
          if (value.pts !== AV_NOPTS_VALUE) value.pts -= offsetTicks;
          if (value.dts !== AV_NOPTS_VALUE) value.dts -= offsetTicks;
          return value;
        }
      },
      async close(): Promise<void> {
        if (closed) return;
        closed = true;
        await packets.return(undefined);
        await demuxer.close();
      }
    };
  } catch (error) {
    await demuxer.close();
    throw error;
  }
}

/** Packets of filtered video frames, encoded at the graph's output rate. */
async function openVideoEncodeSource(
  output: FileMuxer,
  run: FilterRun,
  spec: VideoEncoderSpec,
  signal: AbortSignal | undefined
): Promise<PacketSource | null> {
  const codec = findEncoder(spec.codec);
  if (!codec) throw new Error(`This libav build has no ${spec.codec} encoder`);
  const frames = run.frames();
  const first = await frames.next();
  if (first.done) {
    await run.close();
    return null;
  }
  const head: Frame = first.value;
  // x264 sizes its rate control by the frame rate; without one it reads the
  // time base as the rate, and a flat picture drifts several levels.
  const rate = run.frameRate();
  let encoder: Encoder;
  try {
    encoder = await Encoder.create(codec, {
      options: spec.options,
      context: rate ? { framerate: new Rational(rate.num, rate.den) } : undefined,
      signal
    });
  } catch (error) {
    head.free();
    await run.close();
    throw error;
  }
  const index = output.muxer.addStream(encoder);
  return packetSourceFrom(
    index,
    replayRun(run, head, frames),
    (frame) => encoder.encodeAll(frame),
    () => encoder.encodeAll(null),
    () => encoder.close(),
    signal
  );
}

/** `run` with `head`, already pulled from `frames`, put back in front. */
function replayRun(run: FilterRun, head: Frame, frames: AsyncGenerator<Frame>): FilterRun {
  async function* replay(): AsyncGenerator<Frame> {
    yield head;
    yield* frames;
  }
  return { frames: replay, frameRate: () => run.frameRate(), close: () => run.close() };
}

/** Packets of filtered audio frames, encoded at the first frame's rate and channel count. */
async function openAudioEncodeSource(
  output: FileMuxer,
  run: FilterRun,
  codecName: string,
  signal: AbortSignal | undefined
): Promise<PacketSource | null> {
  const frames = run.frames();
  const first = await frames.next();
  if (first.done) {
    await run.close();
    return null;
  }
  const head: Frame = first.value;
  let encoder: AudioEncoder;
  try {
    encoder = await AudioEncoder.create(codecName, {
      sampleRate: head.sampleRate,
      channels: head.channels,
      signal
    });
  } catch (error) {
    head.free();
    await run.close();
    throw error;
  }
  const index = output.muxer.addStream(encoder.encoder);
  return packetSourceFrom(
    index,
    replayRun(run, head, frames),
    (frame) => encoder.encode(frame),
    () => encoder.flush(),
    () => encoder.close(),
    signal
  );
}

function packetSourceFrom(
  index: number,
  run: FilterRun,
  encode: (frame: Frame) => Promise<Packet[]>,
  flush: () => Promise<Packet[]>,
  release: () => void,
  signal: AbortSignal | undefined
): PacketSource {
  const frames = run.frames();
  const queue: Packet[] = [];
  let ended = false;
  let closed = false;
  return {
    index,
    async next(): Promise<Packet | null> {
      while (queue.length === 0 && !ended) {
        const { value, done } = await frames.next();
        if (done) {
          ended = true;
          queue.push(...(await flush()));
          break;
        }
        try {
          if (signal?.aborted) throw abortError(signal);
          queue.push(...(await encode(value)));
        } finally {
          value.free();
        }
      }
      return queue.shift() ?? null;
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      for (const packet of queue.splice(0)) packet.free();
      await run.close();
      release();
    }
  };
}

/**
 * Write `outPath` from `inputs`. `video` and `audio` name where each output
 * stream comes from, or `null` for none. Filtered streams are encoded with
 * `videoEncoder` (H.264 yuv420p by default) and `audioCodec` (AAC by default,
 * at the filtered rate and channel count). `shortest` ends the file when its
 * first stream ends, as `-shortest` did.
 */
export async function transformMedia(opts: {
  inputs: TransformInput[];
  outPath: string;
  video: StreamPlan | null;
  audio: StreamPlan | null;
  videoEncoder?: VideoEncoderSpec;
  audioCodec?: string;
  shortest?: boolean;
  /** Container muxer name; defaults to the one for the extension. */
  format?: string;
  muxerOptions?: Record<string, string>;
  signal?: AbortSignal;
}): Promise<void> {
  const { signal, inputs } = opts;
  quietLibav();
  throwIfAborted(signal);
  if (!opts.video && !opts.audio) throw new Error("The output has no stream");
  const videoSpec = opts.videoEncoder ?? DEFAULT_VIDEO_ENCODER;
  const output = await openFileMuxer(opts.outPath, {
    format: opts.format,
    muxerOptions: opts.muxerOptions,
    signal
  });
  const sources: PacketSource[] = [];
  const copyStart = { value: null as number | null };
  try {
    for (const [kind, plan] of [
      ["video", opts.video],
      ["audio", opts.audio]
    ] as const) {
      if (!plan) continue;
      if ("copy" in plan) {
        const input = inputs[plan.copy];
        if (!input) throw new Error(`There is no input ${plan.copy}`);
        const source = await openCopySource(output, input, kind, plan.optional ?? false, copyStart, signal);
        if (source) sources.push(source);
        continue;
      }
      const tail =
        kind === "video"
          ? [videoSpec.filter, `format=${videoSpec.pixelFormat}`].filter(Boolean).join(",")
          : "";
      const run = await openPlanFrames(plan, kind, inputs, tail, signal);
      if (!run) continue;
      const source =
        kind === "video"
          ? await openVideoEncodeSource(output, run, videoSpec, signal)
          : await openAudioEncodeSource(output, run, opts.audioCodec ?? "aac", signal);
      if (source) sources.push(source);
    }
    if (sources.length === 0) throw new Error("No input stream reached the output");
    await interleave(output, sources, opts.shortest ?? false, signal);
    await output.close();
  } finally {
    for (const source of sources) await source.close();
    await output.close();
  }
}

/**
 * Write every source's packets in time order. With `shortest`, the first
 * source to end sets the end of the file: later packets of the others are
 * dropped, which also stops an endless one (an `apad`).
 */
async function interleave(
  output: FileMuxer,
  sources: PacketSource[],
  shortest: boolean,
  signal: AbortSignal | undefined
): Promise<void> {
  // One at a time: the first copied stream fixes where every copy starts.
  const heads: Array<{ source: PacketSource; packet: Packet | null; end: number }> = [];
  for (const source of sources) {
    heads.push({ source, packet: await source.next(), end: Number.NEGATIVE_INFINITY });
  }
  let endSec = Number.POSITIVE_INFINITY;
  let written = 0;
  for (;;) {
    if (signal?.aborted) throw abortError(signal);
    let earliest: (typeof heads)[number] | null = null;
    for (const head of heads) {
      if (!head.packet) continue;
      if (!earliest || packetSeconds(head.packet) < packetSeconds(earliest.packet!)) earliest = head;
    }
    if (!earliest) break;
    const packet = earliest.packet!;
    if (packetSeconds(packet) >= endSec) {
      // Past the end the shortest stream set: this source is done.
      packet.free();
      earliest.packet = null;
      await earliest.source.close();
      continue;
    }
    earliest.end = Math.max(earliest.end, packetEndSeconds(packet));
    await output.muxer.writePacket(packet, earliest.source.index);
    packet.free();
    written += 1;
    earliest.packet = await earliest.source.next();
    if (!earliest.packet && shortest) endSec = Math.min(endSec, earliest.end);
  }
  if (written === 0) throw new Error("The inputs produced no packets");
}
