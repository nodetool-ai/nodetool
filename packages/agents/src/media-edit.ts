/**
 * The typed media operations behind the `media_edit` and `media_probe`
 * capabilities, run in process. No `ffmpeg` or `ffprobe` binary runs.
 *
 * Whole-file conversions (trim, scale, crop, rotate, convert, extract audio)
 * go through Mediabunny's `Conversion`. The operations that need a filter
 * graph (concat, the audio mix, fades, loudness, overlay) and frame
 * extraction go through node-av in `@nodetool-ai/runtime/media`.
 *
 * Every path this module receives is an absolute path the capability already
 * confined to the workspace. Nothing here takes a filter string or an argv
 * from the caller: each operation builds its own graph from checked numbers.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  concatSegments,
  decodeAudioToPcm,
  ensureMediabunnyServer,
  muxAudioWithVideoCopy,
  openFilterComplex,
  openFilterGraph,
  openRgbaFrameReader,
  openVideoFrameEncoder,
  probeMedia,
  transcodeVideo,
  type FilterRun,
  type MediaProbe,
  type VideoEncoderSpec
} from "@nodetool-ai/runtime/media";
import {
  AdtsOutputFormat,
  ALL_FORMATS,
  Conversion,
  FilePathSource,
  FilePathTarget,
  FlacOutputFormat,
  Input,
  MkvOutputFormat,
  MovOutputFormat,
  Mp3OutputFormat,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  WavOutputFormat,
  WebMOutputFormat,
  type ConversionOptions,
  type OutputFormat
} from "mediabunny";

import { encodePixels } from "./sandbox-media.js";
import { isFiniteNumber, isNonBlankString, isRecord } from "./utils/type-guards.js";

export const MEDIA_EDIT_OPERATIONS = [
  "trim",
  "concat",
  "extract_audio",
  "extract_frames",
  "scale",
  "crop",
  "rotate",
  "convert",
  "add_audio",
  "mix_audio",
  "fade",
  "normalize",
  "overlay"
] as const;

export type MediaEditOperation = (typeof MEDIA_EDIT_OPERATIONS)[number];

/** A checked edit. Paths are as the caller gave them; the capability resolves them. */
export interface MediaEditRequest {
  operation: MediaEditOperation;
  /** The one input file, for every operation but concat and mix_audio. */
  input?: string;
  /** Files joined (concat) or mixed (mix_audio), in order. */
  sources?: string[];
  /** The soundtrack for add_audio. */
  audio?: string;
  /** The picture laid over `input` by overlay. */
  overlay?: string;
  /** The output file, or the output folder for extract_frames. */
  output: string;
  start?: number;
  end?: number;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  degrees?: 90 | 180 | 270;
  fit?: "contain" | "cover" | "fill";
  times?: number[];
  fps?: number;
  maxFrames?: number;
  imageFormat?: "png" | "jpeg";
  fadeIn?: number;
  fadeOut?: number;
  mode?: "replace" | "mix";
  volume?: number;
  volumes?: number[];
}

/** Containers an output can be, by extension. */
const VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".mov", ".mkv", ".webm"]);
const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac"]);

const MAX_FRAMES = 100;
/** Inputs that hold one picture, which overlay repeats for the whole base. */
const STILL_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]);
const MIX_SAMPLE_RATE = 48000;
const LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11";
/** Even dimensions, which 4:2:0 encoders need. */
const EVEN_SIZE = "scale=trunc(iw/2)*2:trunc(ih/2)*2";

function extensionOf(file: string): string {
  return path.extname(file).toLowerCase();
}

function isVideoOutput(file: string): boolean {
  return VIDEO_EXTENSIONS.has(extensionOf(file));
}

function isAudioOutput(file: string): boolean {
  return AUDIO_EXTENSIONS.has(extensionOf(file));
}

function mediabunnyFormat(file: string): OutputFormat {
  switch (extensionOf(file)) {
    case ".mp4":
    case ".m4v":
    case ".m4a":
      return new Mp4OutputFormat({ fastStart: false });
    case ".mov":
      return new MovOutputFormat();
    case ".mkv":
      return new MkvOutputFormat();
    case ".webm":
      return new WebMOutputFormat();
    case ".wav":
      return new WavOutputFormat();
    case ".mp3":
      return new Mp3OutputFormat();
    case ".aac":
      return new AdtsOutputFormat();
    case ".ogg":
      return new OggOutputFormat();
    case ".flac":
      return new FlacOutputFormat();
    default:
      throw new Error(
        `${path.basename(file)}: unsupported output type. Use one of ` +
          `${[...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS].join(", ")}.`
      );
  }
}

/** The video encoder for a node-av output, by container. */
function videoSpecFor(file: string, filter?: string): VideoEncoderSpec {
  const steps = [filter, EVEN_SIZE].filter(isNonBlankString).join(",");
  if (extensionOf(file) === ".webm") {
    return {
      codec: "libvpx-vp9",
      pixelFormat: "yuv420p",
      filter: steps,
      options: { crf: "32", b: "0", "cpu-used": "4", "row-mt": "1" }
    };
  }
  return {
    codec: "libx264",
    pixelFormat: "yuv420p",
    filter: steps,
    options: { preset: "veryfast", crf: "20" }
  };
}

function audioCodecFor(file: string): string {
  return extensionOf(file) === ".webm" ? "libopus" : "aac";
}

function muxerOptionsFor(file: string): Record<string, string> | undefined {
  const ext = extensionOf(file);
  return ext === ".mp4" || ext === ".m4v" || ext === ".mov"
    ? { movflags: "+faststart" }
    : undefined;
}

function requireVideoOutput(file: string, operation: string): void {
  if (!isVideoOutput(file)) {
    throw new Error(
      `${operation} writes video: output must end in ${[...VIDEO_EXTENSIONS].join(", ")}.`
    );
  }
}

function requireAudioOutput(file: string, operation: string): void {
  if (!isAudioOutput(file)) {
    throw new Error(
      `${operation} writes audio: output must end in ${[...AUDIO_EXTENSIONS].join(", ")}.`
    );
  }
}

/** Seconds as a filter argument, to the millisecond. */
function sec(value: number): string {
  return (Math.round(value * 1000) / 1000).toString();
}

async function convertFile(
  inputPath: string,
  outputPath: string,
  options: Omit<ConversionOptions, "input" | "output">,
  signal: AbortSignal | undefined
): Promise<void> {
  signal?.throwIfAborted();
  ensureMediabunnyServer();
  const input = new Input({ source: new FilePathSource(inputPath), formats: ALL_FORMATS });
  const output = new Output({
    format: mediabunnyFormat(outputPath),
    target: new FilePathTarget(outputPath)
  });
  try {
    const conversion = await Conversion.init({ input, output, showWarnings: false, ...options });
    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks.map((entry) => entry.reason);
      throw new Error(
        `The conversion has nothing it can write: ${reasons.join(", ") || "no usable tracks"}`
      );
    }
    const cancel = (): void => {
      void conversion.cancel();
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      await conversion.execute();
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
    signal?.throwIfAborted();
  } finally {
    input.dispose();
  }
}

/** 16-bit PCM WAV from interleaved float samples. */
function wavBytes(samples: Float32Array, sampleRate: number, channels: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
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
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }
  return out;
}

/** Write float PCM as the output's audio type: WAV directly, anything else through Mediabunny. */
async function writeAudio(
  samples: Float32Array,
  sampleRate: number,
  channels: number,
  outputPath: string,
  signal: AbortSignal | undefined
): Promise<void> {
  const wav = wavBytes(samples, sampleRate, channels);
  if (extensionOf(outputPath) === ".wav") {
    await writeFile(outputPath, wav);
    return;
  }
  const staging = `${outputPath}.pcm.wav`;
  try {
    await writeFile(staging, wav);
    await convertFile(staging, outputPath, {}, signal);
  } finally {
    await rm(staging, { force: true });
  }
}

/** Collect a filter run's audio frames, which must be packed float, as one buffer. */
async function collectFloatAudio(
  run: FilterRun
): Promise<{ samples: Float32Array; sampleRate: number; channels: number }> {
  const chunks: Float32Array[] = [];
  let length = 0;
  let sampleRate = MIX_SAMPLE_RATE;
  let channels = 2;
  try {
    for await (const frame of run.frames()) {
      try {
        const bytes = frame.toBuffer();
        const chunk = new Float32Array(bytes.byteLength / 4);
        new Uint8Array(chunk.buffer).set(bytes);
        chunks.push(chunk);
        length += chunk.length;
        sampleRate = frame.sampleRate;
        channels = frame.channels;
      } finally {
        frame.free();
      }
    }
  } finally {
    await run.close();
  }
  const samples = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return { samples, sampleRate, channels };
}

/** Put `audioFilter`'s output of `audioSource` beside `videoPath`'s video, copied. */
async function muxFilteredAudio(opts: {
  videoPath: string;
  audioSource: string;
  audioFilter: string;
  outputPath: string;
  signal: AbortSignal | undefined;
}): Promise<void> {
  const run = await openFilterGraph({
    filePath: opts.audioSource,
    kind: "audio",
    filter: opts.audioFilter,
    signal: opts.signal
  });
  if (!run) throw new Error(`${path.basename(opts.audioSource)} has no audio`);
  try {
    await muxAudioWithVideoCopy({
      videoPath: opts.videoPath,
      audio: run.frames(),
      outPath: opts.outputPath,
      codec: audioCodecFor(opts.outputPath),
      sampleRate: MIX_SAMPLE_RATE,
      signal: opts.signal
    });
  } finally {
    await run.close();
  }
}

/** Re-encode a video's picture through `videoFilter` and its sound through `audioFilter`. */
async function renderVideo(opts: {
  inputPath: string;
  outputPath: string;
  probe: MediaProbe;
  videoFilter?: string;
  audioFilter?: string;
  signal: AbortSignal | undefined;
}): Promise<void> {
  const { inputPath, outputPath, signal } = opts;
  const spec = videoSpecFor(outputPath, opts.videoFilter);
  if (!opts.probe.audio) {
    await transcodeVideo({
      inputPath,
      outPath: outputPath,
      spec,
      muxerOptions: muxerOptionsFor(outputPath),
      signal
    });
    return;
  }
  const pictureOnly = `${outputPath}.video${extensionOf(outputPath)}`;
  try {
    await transcodeVideo({ inputPath, outPath: pictureOnly, spec, signal });
    await muxFilteredAudio({
      videoPath: pictureOnly,
      audioSource: inputPath,
      audioFilter: opts.audioFilter ?? "anull",
      outputPath,
      signal
    });
  } finally {
    await rm(pictureOnly, { force: true });
  }
}

/** What `media_probe` answers: a probe as plain numbers and booleans. */
export interface MediaProbeSummary {
  format: string;
  duration_seconds: number | null;
  has_video: boolean;
  has_audio: boolean;
  width?: number;
  height?: number;
  rotation?: number;
  fps?: number;
  video_codec?: string | null;
  alpha?: boolean;
  audio_codec?: string | null;
  sample_rate?: number;
  channels?: number;
}

export function probeSummary(probe: MediaProbe): MediaProbeSummary {
  const summary: MediaProbeSummary = {
    format: probe.format,
    duration_seconds: probe.durationSec,
    has_video: probe.video !== null,
    has_audio: probe.audio !== null
  };
  if (probe.video) {
    summary.width = probe.video.displayWidth;
    summary.height = probe.video.displayHeight;
    summary.rotation = probe.video.rotation;
    summary.fps = Math.round(probe.video.averageFps * 1000) / 1000;
    summary.video_codec = probe.video.codec;
    summary.alpha = probe.video.alpha;
  }
  if (probe.audio) {
    summary.audio_codec = probe.audio.codec;
    summary.sample_rate = probe.audio.sampleRate;
    summary.channels = probe.audio.channels;
  }
  return summary;
}

export async function probeFile(
  filePath: string,
  signal?: AbortSignal
): Promise<MediaProbeSummary> {
  return probeSummary(await probeMedia(filePath, { signal }));
}

/** A stream's frame rate rounded to a whole number, 30 when it has none. */
function frameRateOf(probe: MediaProbe): number {
  const fps = probe.video?.averageFps ?? 0;
  return fps > 0 && Number.isFinite(fps) ? Math.min(120, Math.max(1, Math.round(fps))) : 30;
}

function requireProbeVideo(probe: MediaProbe, file: string): NonNullable<MediaProbe["video"]> {
  if (!probe.video) throw new Error(`${path.basename(file)} has no video`);
  return probe.video;
}

/** The files an edit wrote, workspace-relative, in order. */
export interface MediaEditResult {
  outputs: string[];
}

/**
 * Run a checked edit. `resolve` turns a request path into an absolute path
 * inside the workspace; the capability confined every one already.
 */
export async function runMediaEdit(
  request: MediaEditRequest,
  resolve: (file: string) => string,
  signal?: AbortSignal
): Promise<MediaEditResult> {
  const out = resolve(request.output);
  const input = request.input ? resolve(request.input) : "";
  switch (request.operation) {
    case "trim": {
      const start = request.start ?? 0;
      const trim = request.end === undefined ? { start } : { start, end: request.end };
      await convertFile(input, out, { trim }, signal);
      break;
    }
    case "convert":
      await convertFile(input, out, {}, signal);
      break;
    case "extract_audio":
      requireAudioOutput(out, "extract_audio");
      await convertFile(input, out, { video: { discard: true } }, signal);
      break;
    case "scale": {
      requireVideoOutput(out, "scale");
      const video: NonNullable<ConversionOptions["video"]> = {};
      if (request.width !== undefined) video.width = request.width;
      if (request.height !== undefined) video.height = request.height;
      if (request.width !== undefined && request.height !== undefined) {
        // Both sides given: stretch to them unless the caller chose a fit.
        video.fit = request.fit ?? "fill";
      }
      await convertFile(input, out, { video }, signal);
      break;
    }
    case "crop":
      requireVideoOutput(out, "crop");
      await convertFile(
        input,
        out,
        {
          video: {
            crop: {
              left: request.x ?? 0,
              top: request.y ?? 0,
              width: request.width ?? 0,
              height: request.height ?? 0
            }
          }
        },
        signal
      );
      break;
    case "rotate":
      requireVideoOutput(out, "rotate");
      await convertFile(input, out, { video: { rotate: request.degrees ?? 90 } }, signal);
      break;
    case "concat":
      await concat(request, resolve, out, signal);
      break;
    case "add_audio":
      await addAudio(request, resolve, input, out, signal);
      break;
    case "mix_audio":
      await mixAudio(request, resolve, out, signal);
      break;
    case "fade":
      await fade(request, input, out, signal);
      break;
    case "normalize":
      await normalize(input, out, signal);
      break;
    case "overlay":
      await overlay(request, resolve, input, out, signal);
      break;
    case "extract_frames":
      return { outputs: await extractFrames(request, input, out, signal) };
  }
  return { outputs: [request.output] };
}

async function concat(
  request: MediaEditRequest,
  resolve: (file: string) => string,
  out: string,
  signal: AbortSignal | undefined
): Promise<void> {
  requireVideoOutput(out, "concat");
  const files = (request.sources ?? []).map(resolve);
  const probes = await Promise.all(files.map((file) => probeMedia(file, { signal })));
  const first = probes[0];
  if (!first) throw new Error("concat needs at least two sources");
  const firstVideo = requireProbeVideo(first, files[0] ?? "");
  const width = request.width ?? Math.floor(firstVideo.width / 2) * 2;
  const height = request.height ?? Math.floor(firstVideo.height / 2) * 2;
  const fps = request.fps ?? frameRateOf(first);
  const segments = probes.map((probe, i) => {
    const file = files[i] ?? "";
    requireProbeVideo(probe, file);
    if (!(probe.durationSec && probe.durationSec > 0)) {
      throw new Error(`${path.basename(file)} has no duration`);
    }
    return {
      kind: "video" as const,
      filePath: file,
      durationSec: probe.durationSec,
      withAudio: probe.audio !== null
    };
  });
  await concatSegments({
    outPath: out,
    width,
    height,
    fps,
    segments,
    videoFilter:
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
    video: videoSpecFor(out),
    audioCodec: audioCodecFor(out),
    signal
  });
}

async function addAudio(
  request: MediaEditRequest,
  resolve: (file: string) => string,
  input: string,
  out: string,
  signal: AbortSignal | undefined
): Promise<void> {
  requireVideoOutput(out, "add_audio");
  const soundtrack = resolve(request.audio ?? "");
  const volume = request.volume ?? 1;
  const probe = await probeMedia(input, { signal });
  requireProbeVideo(probe, input);
  if (request.mode === "mix" && probe.audio) {
    const run = await openFilterComplex({
      inputs: [
        { filePath: input, kind: "audio", label: "0:a" },
        { filePath: soundtrack, kind: "audio", label: "1:a" }
      ],
      graph: `[1:a]volume=${volume},apad[music];[0:a][music]amix=inputs=2:duration=first:normalize=0[aout]`,
      output: "aout",
      outputKind: "audio",
      signal
    });
    try {
      await muxAudioWithVideoCopy({
        videoPath: input,
        audio: run.frames(),
        outPath: out,
        codec: audioCodecFor(out),
        sampleRate: MIX_SAMPLE_RATE,
        signal
      });
    } finally {
      await run.close();
    }
    return;
  }
  // The soundtrack is padded with silence, and the mux ends it with the picture.
  await muxFilteredAudio({
    videoPath: input,
    audioSource: soundtrack,
    audioFilter: `volume=${volume},apad`,
    outputPath: out,
    signal
  });
}

async function mixAudio(
  request: MediaEditRequest,
  resolve: (file: string) => string,
  out: string,
  signal: AbortSignal | undefined
): Promise<void> {
  requireAudioOutput(out, "mix_audio");
  const files = (request.sources ?? []).map(resolve);
  const branches = files.map(
    (_, i) =>
      `[${i}:a]volume=${request.volumes?.[i] ?? 1},aresample=${MIX_SAMPLE_RATE},` +
      `aformat=sample_fmts=flt:channel_layouts=stereo[m${i}]`
  );
  const mixed =
    files.map((_, i) => `[m${i}]`).join("") +
    `amix=inputs=${files.length}:duration=longest:normalize=0,` +
    "aformat=sample_fmts=flt:channel_layouts=stereo[aout]";
  const run = await openFilterComplex({
    inputs: files.map((filePath, i) => ({ filePath, kind: "audio" as const, label: `${i}:a` })),
    graph: [...branches, mixed].join(";"),
    output: "aout",
    outputKind: "audio",
    signal
  });
  const pcm = await collectFloatAudio(run);
  await writeAudio(pcm.samples, pcm.sampleRate, pcm.channels, out, signal);
}

async function fade(
  request: MediaEditRequest,
  input: string,
  out: string,
  signal: AbortSignal | undefined
): Promise<void> {
  const probe = await probeMedia(input, { signal });
  const duration = probe.durationSec ?? 0;
  const fadeIn = request.fadeIn ?? 0;
  const fadeOut = Math.min(request.fadeOut ?? 0, duration);
  const outStart = Math.max(0, duration - fadeOut);
  const audioSteps = [
    fadeIn > 0 ? `afade=t=in:st=0:d=${sec(fadeIn)}` : "",
    fadeOut > 0 ? `afade=t=out:st=${sec(outStart)}:d=${sec(fadeOut)}` : ""
  ].filter(Boolean);
  const audioFilter = audioSteps.length > 0 ? audioSteps.join(",") : "anull";
  if (!probe.video) {
    requireAudioOutput(out, "fade");
    if (!probe.audio) throw new Error(`${path.basename(input)} has no audio or video`);
    const pcm = await decodeAudioToPcm(input, {
      sampleRate: probe.audio.sampleRate,
      channels: probe.audio.channels,
      filter: audioFilter,
      signal
    });
    await writeAudio(pcm.samples, pcm.sampleRate, pcm.channels, out, signal);
    return;
  }
  requireVideoOutput(out, "fade");
  const videoSteps = [
    fadeIn > 0 ? `fade=t=in:st=0:d=${sec(fadeIn)}` : "",
    fadeOut > 0 ? `fade=t=out:st=${sec(outStart)}:d=${sec(fadeOut)}` : ""
  ].filter(Boolean);
  await renderVideo({
    inputPath: input,
    outputPath: out,
    probe,
    videoFilter: videoSteps.join(","),
    audioFilter,
    signal
  });
}

async function normalize(
  input: string,
  out: string,
  signal: AbortSignal | undefined
): Promise<void> {
  const probe = await probeMedia(input, { signal });
  if (!probe.audio) throw new Error(`${path.basename(input)} has no audio to normalize`);
  if (!probe.video) {
    requireAudioOutput(out, "normalize");
    const pcm = await decodeAudioToPcm(input, {
      sampleRate: probe.audio.sampleRate,
      channels: probe.audio.channels,
      filter: LOUDNORM,
      signal
    });
    await writeAudio(pcm.samples, pcm.sampleRate, pcm.channels, out, signal);
    return;
  }
  requireVideoOutput(out, "normalize");
  // The picture is copied; only the sound is re-encoded.
  await muxFilteredAudio({
    videoPath: input,
    audioSource: input,
    audioFilter: LOUDNORM,
    outputPath: out,
    signal
  });
}

async function overlay(
  request: MediaEditRequest,
  resolve: (file: string) => string,
  input: string,
  out: string,
  signal: AbortSignal | undefined
): Promise<void> {
  requireVideoOutput(out, "overlay");
  const top = resolve(request.overlay ?? "");
  const probe = await probeMedia(input, { signal });
  const base = requireProbeVideo(probe, input);
  const width = Math.floor(base.width / 2) * 2;
  const height = Math.floor(base.height / 2) * 2;
  const fps = frameRateOf(probe);
  const enable =
    request.start !== undefined || request.end !== undefined
      ? `:enable='between(t,${sec(request.start ?? 0)},${sec(request.end ?? 1e9)})'`
      : "";
  const scaleTop =
    request.width !== undefined
      ? `scale=${request.width}:${request.height ?? -1},`
      : "";
  // A still is looped into a stream, so the overlay holds it for as long as
  // the base runs and `shortest` ends the output with the base.
  const still = STILL_EXTENSIONS.has(extensionOf(top));
  const loopTop = still ? "loop=loop=-1:size=1:start=0," : "";
  const run = await openFilterComplex({
    inputs: [
      { filePath: input, kind: "video", label: "0:v" },
      { filePath: top, kind: "video", label: "1:v" }
    ],
    graph:
      `[0:v]fps=${fps},scale=${width}:${height},format=rgba[base];` +
      `[1:v]${loopTop}${scaleTop}format=rgba[top];` +
      `[base][top]overlay=x=${request.x ?? 0}:y=${request.y ?? 0}:eof_action=repeat` +
      `${still ? ":shortest=1" : ""}${enable},` +
      "format=rgba[vout]",
    output: "vout",
    outputKind: "video",
    signal
  });
  const pictureOnly = probe.audio ? `${out}.video${extensionOf(out)}` : out;
  try {
    const encoder = await openVideoFrameEncoder({
      outPath: pictureOnly,
      fps,
      input: "rgba",
      width,
      height,
      spec: videoSpecFor(out),
      signal
    });
    try {
      for await (const frame of run.frames()) {
        try {
          await encoder.write(new Uint8Array(frame.toBuffer()));
        } finally {
          frame.free();
        }
      }
      await encoder.finish();
    } catch (error) {
      await encoder.abort();
      throw error;
    }
    if (probe.audio) {
      await muxFilteredAudio({
        videoPath: pictureOnly,
        audioSource: input,
        audioFilter: "anull",
        outputPath: out,
        signal
      });
    }
  } finally {
    await run.close();
    if (pictureOnly !== out) await rm(pictureOnly, { force: true });
  }
}

async function extractFrames(
  request: MediaEditRequest,
  input: string,
  outDir: string,
  signal: AbortSignal | undefined
): Promise<string[]> {
  const format = request.imageFormat ?? "png";
  const extension = format === "jpeg" ? "jpg" : "png";
  const frames: Array<{ rgba: Uint8Array; width: number; height: number }> = [];
  if (request.times && request.times.length > 0) {
    for (const time of request.times.slice(0, MAX_FRAMES)) {
      const reader = await openRgbaFrameReader({
        filePath: input,
        filter: "format=rgba",
        seekSec: time,
        readAhead: 1,
        signal
      });
      if (!reader) throw new Error(`${path.basename(input)} has no video`);
      try {
        const frame = await reader.next();
        if (!frame) throw new Error(`${path.basename(input)} has no frame at ${time}s`);
        frames.push(frame);
      } finally {
        await reader.close();
      }
    }
  } else {
    const limit = Math.min(request.maxFrames ?? 10, MAX_FRAMES);
    const reader = await openRgbaFrameReader({
      filePath: input,
      filter: `fps=${request.fps ?? 1},format=rgba`,
      seekSec: request.start,
      readAhead: 1,
      signal
    });
    if (!reader) throw new Error(`${path.basename(input)} has no video`);
    try {
      while (frames.length < limit) {
        const frame = await reader.next();
        if (!frame) break;
        frames.push(frame);
      }
    } finally {
      await reader.close();
    }
  }
  if (frames.length === 0) throw new Error(`${path.basename(input)} decoded to no frames`);
  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  for (const [i, frame] of frames.entries()) {
    const name = `frame_${String(i + 1).padStart(4, "0")}.${extension}`;
    const bytes = await encodePixels(frame.rgba, frame.width, frame.height, { format });
    await writeFile(path.join(outDir, name), bytes);
    written.push(path.posix.join(request.output, name));
  }
  return written;
}

// ── Parameters ────────────────────────────────────────────────────────────

function optionalNumber(
  params: Record<string, unknown>,
  key: string,
  check: (value: number) => boolean,
  rule: string
): number | undefined | { error: string } {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  if (!isFiniteNumber(value) || !check(value)) return { error: `${key} must be ${rule}` };
  return value;
}

function numberList(
  params: Record<string, unknown>,
  key: string,
  check: (value: number) => boolean,
  rule: string
): number[] | undefined | { error: string } {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  const error = { error: `${key} must be an array of ${rule}` };
  if (!Array.isArray(value)) return error;
  const numbers: number[] = [];
  for (const item of value) {
    if (!isFiniteNumber(item) || !check(item)) return error;
    numbers.push(item);
  }
  return numbers;
}

function stringList(params: Record<string, unknown>, key: string): string[] | undefined | { error: string } {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  const error = { error: `${key} must be an array of file paths` };
  if (!Array.isArray(value)) return error;
  const paths: string[] = [];
  for (const item of value) {
    if (!isNonBlankString(item)) return error;
    paths.push(item.trim());
  }
  return paths;
}

function isError(value: unknown): value is { error: string } {
  return isRecord(value) && typeof value["error"] === "string";
}

const nonNegative = (v: number): boolean => v >= 0;
const positive = (v: number): boolean => v > 0;
const positiveInt = (v: number): boolean => Number.isInteger(v) && v > 0;
const nonNegativeInt = (v: number): boolean => Number.isInteger(v) && v >= 0;

function isMediaEditOperation(value: unknown): value is MediaEditOperation {
  return MEDIA_EDIT_OPERATIONS.some((operation) => operation === value);
}

/** The request fields that take one checked number. */
type NumberField =
  | "start"
  | "end"
  | "width"
  | "height"
  | "x"
  | "y"
  | "fps"
  | "maxFrames"
  | "fadeIn"
  | "fadeOut"
  | "volume";

/** Check a `media_edit` call's parameters and name what each operation needs. */
export function parseMediaEditRequest(
  params: Record<string, unknown>
): MediaEditRequest | { error: string } {
  const op = params["operation"];
  if (!isMediaEditOperation(op)) {
    return { error: `operation must be one of ${MEDIA_EDIT_OPERATIONS.join(", ")}` };
  }
  const output = params["output_file"];
  if (!isNonBlankString(output)) {
    return {
      error:
        op === "extract_frames"
          ? "output_file is required: the workspace folder the frames go in"
          : "output_file is required"
    };
  }
  const request: MediaEditRequest = { operation: op, output: output.trim() };

  const numbers: Array<[NumberField, string, (v: number) => boolean, string]> = [
    ["start", "start", nonNegative, "a number of seconds >= 0"],
    ["end", "end", positive, "a number of seconds > 0"],
    ["width", "width", positiveInt, "a positive integer"],
    ["height", "height", positiveInt, "a positive integer"],
    ["x", "x", nonNegativeInt, "an integer >= 0"],
    ["y", "y", nonNegativeInt, "an integer >= 0"],
    ["fps", "fps", (v) => v > 0 && v <= 120, "a number in (0, 120]"],
    ["maxFrames", "max_frames", positiveInt, "a positive integer"],
    ["fadeIn", "fade_in", nonNegative, "a number of seconds >= 0"],
    ["fadeOut", "fade_out", nonNegative, "a number of seconds >= 0"],
    ["volume", "volume", (v) => v >= 0 && v <= 10, "a gain in [0, 10]"]
  ];
  for (const [field, key, check, rule] of numbers) {
    const value = optionalNumber(params, key, check, rule);
    if (isError(value)) return value;
    if (value !== undefined) request[field] = value;
  }
  const times = numberList(params, "times", nonNegative, "seconds >= 0");
  if (isError(times)) return times;
  if (times) request.times = times;
  const volumes = numberList(params, "volumes", (v) => v >= 0 && v <= 10, "gains in [0, 10]");
  if (isError(volumes)) return volumes;
  if (volumes) request.volumes = volumes;
  const sources = stringList(params, "sources");
  if (isError(sources)) return sources;
  if (sources) request.sources = sources;

  for (const key of ["input", "audio", "overlay"] as const) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    if (!isNonBlankString(value)) return { error: `${key} must be a file path` };
    request[key] = value.trim();
  }
  const degrees = params["degrees"];
  if (degrees !== undefined && degrees !== null) {
    if (degrees !== 90 && degrees !== 180 && degrees !== 270) {
      return { error: "degrees must be 90, 180 or 270" };
    }
    request.degrees = degrees;
  }
  const fit = params["fit"];
  if (fit !== undefined && fit !== null) {
    if (fit !== "contain" && fit !== "cover" && fit !== "fill") {
      return { error: "fit must be contain, cover or fill" };
    }
    request.fit = fit;
  }
  const mode = params["mode"];
  if (mode !== undefined && mode !== null) {
    if (mode !== "replace" && mode !== "mix") return { error: "mode must be replace or mix" };
    request.mode = mode;
  }
  const imageFormat = params["image_format"];
  if (imageFormat !== undefined && imageFormat !== null) {
    if (imageFormat !== "png" && imageFormat !== "jpeg") {
      return { error: "image_format must be png or jpeg" };
    }
    request.imageFormat = imageFormat;
  }

  const needs = (condition: boolean, message: string): { error: string } | undefined =>
    condition ? undefined : { error: `${op}: ${message}` };
  const usesSources = op === "concat" || op === "mix_audio";
  const missing =
    (usesSources
      ? needs((request.sources?.length ?? 0) >= 2, "sources needs at least two files")
      : needs(request.input !== undefined, "input is required")) ??
    (op === "trim"
      ? needs(
          request.end === undefined || request.end > (request.start ?? 0),
          "end must be after start"
        )
      : undefined) ??
    (op === "scale"
      ? needs(request.width !== undefined || request.height !== undefined, "width or height is required")
      : undefined) ??
    (op === "crop"
      ? needs(request.width !== undefined && request.height !== undefined, "width and height are required")
      : undefined) ??
    (op === "rotate" ? needs(request.degrees !== undefined, "degrees is required") : undefined) ??
    (op === "add_audio" ? needs(request.audio !== undefined, "audio is required") : undefined) ??
    (op === "overlay" ? needs(request.overlay !== undefined, "overlay is required") : undefined) ??
    (op === "fade"
      ? needs(
          (request.fadeIn ?? 0) > 0 || (request.fadeOut ?? 0) > 0,
          "fade_in or fade_out must be above 0"
        )
      : undefined) ??
    (op === "mix_audio" && request.volumes
      ? needs(request.volumes.length === request.sources?.length, "volumes needs one gain per source")
      : undefined) ??
    (op === "overlay" && request.start !== undefined && request.end !== undefined
      ? needs(request.end > request.start, "end must be after start")
      : undefined);
  return missing ?? request;
}

/** The files a request reads, in the order the capability stages and confines them. */
export function mediaEditInputs(request: MediaEditRequest): string[] {
  return [
    ...(request.input ? [request.input] : []),
    ...(request.sources ?? []),
    ...(request.audio ? [request.audio] : []),
    ...(request.overlay ? [request.overlay] : [])
  ];
}
