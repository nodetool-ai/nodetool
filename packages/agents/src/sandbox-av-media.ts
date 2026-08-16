/**
 * Cross-platform audio and video operations for the JavaScript sandbox.
 *
 * Mediabunny owns container parsing, codecs, and conversion. Browsers use
 * WebCodecs. Node registers Mediabunny's official server codec adapter on
 * first use. The sandbox only sees byte arrays and media handles.
 */

import { importHidden, IS_NODE } from "@nodetool-ai/config";
import {
  ALL_FORMATS,
  BufferSource,
  Conversion,
  getFirstEncodableAudioCodec,
  Input,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  VideoSampleSink,
  WavOutputFormat,
  type ConversionAudioOptions,
  type ConversionOptions,
  type ConversionVideoOptions,
  type InputVideoTrack,
  type Rotation,
  type StreamTargetChunk
} from "mediabunny";

import { encodePixels } from "./sandbox-media.js";
import { isFiniteNumber, isNumber } from "./utils/type-guards.js";

interface MediabunnyServerModule {
  registerMediabunnyServer(): void;
}

interface WavData {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly channels: number;
}

let serverReady: Promise<void> | undefined;

async function ensureCodecs(): Promise<void> {
  if (!IS_NODE) return;
  serverReady ??= (async () => {
    const server =
      await importHidden<MediabunnyServerModule>("@mediabunny/server");
    if (!server) {
      throw new Error("Mediabunny's server codec adapter is unavailable");
    }
    server.registerMediabunnyServer();
  })();
  await serverReady;
}

function inputFrom(bytes: Uint8Array): Input {
  return new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
}

async function validateVideoDimensions(
  track: InputVideoTrack,
  maxBytes: number,
  where: string
): Promise<void> {
  const [displayWidth, displayHeight, codedWidth, codedHeight] =
    await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      track.getCodedWidth(),
      track.getCodedHeight()
    ]);
  validatePixelDimensions(displayWidth, displayHeight, maxBytes, where);
  validatePixelDimensions(codedWidth, codedHeight, maxBytes, where);
}

function validatePixelDimensions(
  width: number,
  height: number,
  maxBytes: number,
  where: string
): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > Math.floor(maxBytes / 4 / height)
  ) {
    throw new Error(`${where}: decoded frame exceeds the run media limit`);
  }
}

function limitedTarget(
  maxBytes: number,
  where: string
) {
  const chunks: { data: Uint8Array; position: number }[] = [];
  let byteLength = 0;
  const writable = new WritableStream<StreamTargetChunk>({
    write(chunk) {
      const end = chunk.position + chunk.data.length;
      if (!Number.isSafeInteger(end) || end > maxBytes) {
        throw new Error(
          `${where}: output exceeds the ${maxBytes} byte run media limit`
        );
      }
      chunks.push({ data: chunk.data.slice(), position: chunk.position });
      byteLength = Math.max(byteLength, end);
    }
  });
  return {
    target: new StreamTarget(writable),
    bytes() {
      if (byteLength === 0) {
        throw new Error(`${where}: conversion produced no data`);
      }
      const result = new Uint8Array(byteLength);
      for (const chunk of chunks) result.set(chunk.data, chunk.position);
      return result;
    }
  };
}

async function convert(
  bytes: Uint8Array,
  kind: "audio" | "video",
  options: Omit<ConversionOptions, "input" | "output"> = {},
  signal?: AbortSignal,
  maxBytes = 256 * 1024 * 1024
): Promise<Uint8Array> {
  signal?.throwIfAborted();
  await ensureCodecs();
  const collector = limitedTarget(maxBytes, `${kind}.convert`);
  const output = new Output({
    format: kind === "audio" ? new WavOutputFormat() : new Mp4OutputFormat(),
    target: collector.target
  });
  const input = inputFrom(bytes);
  const disposeInput = (): void => input.dispose();
  signal?.addEventListener("abort", disposeInput, { once: true });
  let conversion: Conversion | undefined;
  try {
    if (kind === "video") {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error("video conversion input has no video track");
      await validateVideoDimensions(track, maxBytes, "video.convert");
    }
    conversion = await Conversion.init({
      input,
      output,
      showWarnings: false,
      ...options
    });
    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks.map((entry) => entry.reason);
      throw new Error(
        `${kind} conversion is not supported: ${reasons.join(", ") || "no usable tracks"}`
      );
    }
    await executeConversion(conversion, signal);
    return collector.bytes();
  } catch (error) {
    await Promise.allSettled([
      ...(conversion ? [conversion.cancel()] : []),
      output.cancel()
    ]);
    throw error;
  } finally {
    signal?.removeEventListener("abort", disposeInput);
    input.dispose();
  }
}

async function executeConversion(
  conversion: Conversion,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted();
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
}

function isWav(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WAVE"
  );
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let result = "";
  for (let index = start; index < start + length; index += 1) {
    result += String.fromCharCode(bytes[index] ?? 0);
  }
  return result;
}

const MEDIA_LOOP_CHUNK = 256 * 1024;

async function mediaCheckpoint(
  index: number,
  signal?: AbortSignal
): Promise<void> {
  if (index === 0 || index % MEDIA_LOOP_CHUNK !== 0) return;
  signal?.throwIfAborted();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  signal?.throwIfAborted();
}

async function mediaChunkCheckpoint(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  signal?.throwIfAborted();
}

async function copySamples(
  source: Float32Array,
  signal: AbortSignal | undefined,
  start = 0,
  end = source.length
): Promise<Float32Array> {
  const result = new Float32Array(end - start);
  for (let offset = start; offset < end; offset += MEDIA_LOOP_CHUNK) {
    const next = Math.min(end, offset + MEDIA_LOOP_CHUNK);
    result.set(source.subarray(offset, next), offset - start);
    await mediaChunkCheckpoint(signal);
  }
  signal?.throwIfAborted();
  return result;
}

async function parseWav(
  bytes: Uint8Array,
  maxBytes = Number.MAX_SAFE_INTEGER,
  signal?: AbortSignal
): Promise<WavData> {
  if (!isWav(bytes)) throw new Error("Expected a WAV audio stream");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let format = 0;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (body + size > bytes.length) break;
    if (id === "fmt " && size >= 16) {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (id === "data") {
      dataOffset = body;
      dataLength = size;
      break;
    }
    offset = body + size + (size % 2);
  }
  if (
    format !== 1 ||
    bitsPerSample !== 16 ||
    channels < 1 ||
    sampleRate < 1 ||
    dataOffset < 0
  ) {
    throw new Error("Expected 16-bit PCM WAV audio");
  }
  const frames = Math.floor(dataLength / (channels * 2));
  ensureDecodedSize(frames * channels, maxBytes, "audio.decode");
  const samples = new Float32Array(frames * channels);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(dataOffset + index * 2, true) / 0x8000;
    await mediaCheckpoint(index, signal);
  }
  signal?.throwIfAborted();
  return { samples, sampleRate, channels };
}

function ensureDecodedSize(
  sampleCount: number,
  maxBytes: number,
  where: string
): void {
  if (
    !Number.isSafeInteger(sampleCount) ||
    sampleCount < 0 ||
    sampleCount * Float32Array.BYTES_PER_ELEMENT > maxBytes
  ) {
    throw new Error(`${where}: decoded audio exceeds the run media limit`);
  }
}

async function encodeWav(
  data: WavData,
  maxBytes: number,
  signal?: AbortSignal
): Promise<Uint8Array> {
  ensureDecodedSize(data.samples.length, maxBytes, "audio.encode");
  const output = new Uint8Array(44 + data.samples.length * 2);
  if (output.length > maxBytes) {
    throw new Error("audio.encode: output exceeds the run media limit");
  }
  const view = new DataView(output.buffer);
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      output[offset + index] = value.charCodeAt(index);
    }
  };
  write(0, "RIFF");
  view.setUint32(4, output.length - 8, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, data.channels, true);
  view.setUint32(24, data.sampleRate, true);
  view.setUint32(28, data.sampleRate * data.channels * 2, true);
  view.setUint16(32, data.channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, data.samples.length * 2, true);
  for (let index = 0; index < data.samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, data.samples[index] ?? 0));
    view.setInt16(
      44 + index * 2,
      Math.round(value < 0 ? value * 0x8000 : value * 0x7fff),
      true
    );
    await mediaCheckpoint(index, signal);
  }
  signal?.throwIfAborted();
  return output;
}

async function wavData(
  bytes: Uint8Array,
  signal: AbortSignal | undefined,
  maxBytes: number
): Promise<WavData> {
  signal?.throwIfAborted();
  if (isWav(bytes)) {
    try {
      return await parseWav(bytes, maxBytes, signal);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("decoded audio exceeds")
      ) {
        throw error;
      }
      // Mediabunny normalizes float, wide PCM, and extensible WAV variants to
      // the one PCM16 form the low-level editing loops use.
    }
  }
  const wav = await convert(
    bytes,
    "audio",
    {
      video: { discard: true },
      audio: { codec: "pcm-s16" }
    },
    signal,
    maxBytes
  );
  return parseWav(wav, maxBytes, signal);
}

function numberOption(
  options: Record<string, unknown> | undefined,
  name: string,
  fallback: number
): number {
  const value = options?.[name];
  if (value === undefined) return fallback;
  if (!isNumber(value) || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

function matchingAudio(inputs: readonly WavData[], where: string): WavData {
  const first = inputs[0];
  if (!first) throw new Error(`${where}: at least one audio input is required`);
  for (const input of inputs.slice(1)) {
    if (
      input.sampleRate !== first.sampleRate ||
      input.channels !== first.channels
    ) {
      throw new Error(`${where}: all inputs must have the same audio format`);
    }
  }
  return first;
}

export interface AudioBridge {
  info(bytes: Uint8Array): Promise<Record<string, unknown>>;
  normalize(bytes: Uint8Array): Promise<Uint8Array>;
  trim(
    bytes: Uint8Array,
    options?: Record<string, unknown>
  ): Promise<Uint8Array>;
  concat(inputs: Uint8Array[]): Promise<Uint8Array>;
  mix(inputs: Uint8Array[]): Promise<Uint8Array>;
  reverse(bytes: Uint8Array): Promise<Uint8Array>;
  fadeIn(
    bytes: Uint8Array,
    options?: Record<string, unknown>
  ): Promise<Uint8Array>;
  fadeOut(
    bytes: Uint8Array,
    options?: Record<string, unknown>
  ): Promise<Uint8Array>;
  repeat(
    bytes: Uint8Array,
    options?: Record<string, unknown>
  ): Promise<Uint8Array>;
}

export interface VideoBridge {
  info(bytes: Uint8Array): Promise<Record<string, unknown>>;
  trim(
    bytes: Uint8Array,
    options?: Record<string, unknown>
  ): Promise<Uint8Array>;
  resize(
    bytes: Uint8Array,
    options?: Record<string, unknown>
  ): Promise<Uint8Array>;
  rotate(bytes: Uint8Array, degrees: unknown): Promise<Uint8Array>;
  addAudio(
    video: Uint8Array,
    audio: Uint8Array,
    options?: Record<string, unknown>
  ): Promise<Uint8Array>;
  extractAudio(bytes: Uint8Array): Promise<Uint8Array>;
  extractFrame(bytes: Uint8Array, time?: unknown): Promise<Uint8Array>;
}

export function createAudioBridge(
  signal?: AbortSignal,
  maxBytes = 256 * 1024 * 1024
): AudioBridge {
  const decode = (bytes: Uint8Array): Promise<WavData> =>
    wavData(bytes, signal, maxBytes);
  const decodeMany = async (
    inputs: Uint8Array[],
    where: string
  ): Promise<WavData[]> => {
    const decoded: WavData[] = [];
    let aggregateSamples = 0;
    for (const input of inputs) {
      const remainingBytes =
        maxBytes - aggregateSamples * Float32Array.BYTES_PER_ELEMENT;
      const data = await wavData(input, signal, remainingBytes);
      aggregateSamples += data.samples.length;
      ensureDecodedSize(aggregateSamples, maxBytes, where);
      decoded.push(data);
    }
    return decoded;
  };
  return {
    async info(bytes) {
      signal?.throwIfAborted();
      await ensureCodecs();
      const input = inputFrom(bytes);
      const disposeInput = (): void => input.dispose();
      signal?.addEventListener("abort", disposeInput, { once: true });
      try {
        const track = await input.getPrimaryAudioTrack();
        if (!track) throw new Error("audio.info: no audio track found");
        const [duration, codec, channels, sampleRate] = await Promise.all([
          track.computeDuration(),
          track.getCodec(),
          track.getNumberOfChannels(),
          track.getSampleRate()
        ]);
        return {
          format: isWav(bytes) ? "wav" : codec,
          codec,
          duration,
          channels,
          sample_rate: sampleRate,
          size_bytes: bytes.length
        };
      } finally {
        signal?.removeEventListener("abort", disposeInput);
        input.dispose();
      }
    },
    async normalize(bytes) {
      const data = await decode(bytes);
      let peak = 0;
      for (let index = 0; index < data.samples.length; index += 1) {
        peak = Math.max(peak, Math.abs(data.samples[index] ?? 0));
        await mediaCheckpoint(index, signal);
      }
      if (peak === 0) return encodeWav(data, maxBytes, signal);
      const samples = new Float32Array(data.samples.length);
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = (data.samples[index] ?? 0) / peak;
        await mediaCheckpoint(index, signal);
      }
      return encodeWav({ ...data, samples }, maxBytes, signal);
    },
    async trim(bytes, options) {
      const data = await decode(bytes);
      const duration = data.samples.length / data.channels / data.sampleRate;
      const start = Math.max(0, numberOption(options, "start", 0));
      const end = Math.min(duration, numberOption(options, "end", duration));
      if (end <= start) throw new Error("audio.trim: end must be after start");
      const first = Math.floor(start * data.sampleRate) * data.channels;
      const last = Math.ceil(end * data.sampleRate) * data.channels;
      return encodeWav(
        {
          ...data,
          samples: await copySamples(data.samples, signal, first, last)
        },
        maxBytes,
        signal
      );
    },
    async concat(inputs) {
      const decoded = await decodeMany(inputs, "audio.concat");
      const first = matchingAudio(decoded, "audio.concat");
      const length = decoded.reduce(
        (sum, item) => sum + item.samples.length,
        0
      );
      ensureDecodedSize(length, maxBytes, "audio.concat");
      const samples = new Float32Array(length);
      let offset = 0;
      for (const item of decoded) {
        for (
          let inputOffset = 0;
          inputOffset < item.samples.length;
          inputOffset += MEDIA_LOOP_CHUNK
        ) {
          const next = Math.min(
            item.samples.length,
            inputOffset + MEDIA_LOOP_CHUNK
          );
          samples.set(
            item.samples.subarray(inputOffset, next),
            offset + inputOffset
          );
          await mediaChunkCheckpoint(signal);
        }
        offset += item.samples.length;
      }
      return encodeWav({ ...first, samples }, maxBytes, signal);
    },
    async mix(inputs) {
      const decoded = await decodeMany(inputs, "audio.mix");
      const first = matchingAudio(decoded, "audio.mix");
      const length = Math.max(...decoded.map((item) => item.samples.length));
      ensureDecodedSize(length, maxBytes, "audio.mix");
      const samples = new Float32Array(length);
      for (const item of decoded) {
        for (let index = 0; index < item.samples.length; index += 1) {
          samples[index] += (item.samples[index] ?? 0) / decoded.length;
          await mediaCheckpoint(index, signal);
        }
      }
      return encodeWav({ ...first, samples }, maxBytes, signal);
    },
    async reverse(bytes) {
      const data = await decode(bytes);
      const frames = data.samples.length / data.channels;
      const samples = new Float32Array(data.samples.length);
      for (let frame = 0; frame < frames; frame += 1) {
        for (let channel = 0; channel < data.channels; channel += 1) {
          samples[(frames - frame - 1) * data.channels + channel] =
            data.samples[frame * data.channels + channel] ?? 0;
        }
        await mediaCheckpoint(frame * data.channels, signal);
      }
      return encodeWav({ ...data, samples }, maxBytes, signal);
    },
    async fadeIn(bytes, options) {
      const data = await decode(bytes);
      const fadeFrames = Math.max(
        1,
        Math.round(numberOption(options, "duration", 1) * data.sampleRate)
      );
      const samples = await copySamples(data.samples, signal);
      for (
        let frame = 0;
        frame < Math.min(fadeFrames, samples.length / data.channels);
        frame += 1
      ) {
        const gain = frame / fadeFrames;
        for (let channel = 0; channel < data.channels; channel += 1) {
          samples[frame * data.channels + channel] *= gain;
        }
        await mediaCheckpoint(frame * data.channels, signal);
      }
      return encodeWav({ ...data, samples }, maxBytes, signal);
    },
    async fadeOut(bytes, options) {
      const data = await decode(bytes);
      const frames = data.samples.length / data.channels;
      const fadeFrames = Math.max(
        1,
        Math.min(
          frames,
          Math.round(numberOption(options, "duration", 1) * data.sampleRate)
        )
      );
      const samples = await copySamples(data.samples, signal);
      for (let offset = 0; offset < fadeFrames; offset += 1) {
        const gain = offset / fadeFrames;
        const frame = frames - offset - 1;
        for (let channel = 0; channel < data.channels; channel += 1) {
          samples[frame * data.channels + channel] *= gain;
        }
        await mediaCheckpoint(offset * data.channels, signal);
      }
      return encodeWav({ ...data, samples }, maxBytes, signal);
    },
    async repeat(bytes, options) {
      const data = await decode(bytes);
      const loops = numberOption(options, "loops", 2);
      if (!Number.isInteger(loops) || loops < 1 || loops > 100) {
        throw new Error("audio.repeat: loops must be an integer from 1 to 100");
      }
      ensureDecodedSize(data.samples.length * loops, maxBytes, "audio.repeat");
      const samples = new Float32Array(data.samples.length * loops);
      for (let index = 0; index < loops; index += 1) {
        const base = index * data.samples.length;
        for (
          let offset = 0;
          offset < data.samples.length;
          offset += MEDIA_LOOP_CHUNK
        ) {
          const next = Math.min(data.samples.length, offset + MEDIA_LOOP_CHUNK);
          samples.set(data.samples.subarray(offset, next), base + offset);
          await mediaChunkCheckpoint(signal);
        }
      }
      return encodeWav({ ...data, samples }, maxBytes, signal);
    }
  };
}

async function videoConvert(
  bytes: Uint8Array,
  options: {
    trim?: ConversionOptions["trim"];
    video?: ConversionVideoOptions;
  },
  signal?: AbortSignal,
  maxBytes = 256 * 1024 * 1024
): Promise<Uint8Array> {
  return convert(bytes, "video", options, signal, maxBytes);
}

/** A video trim window; `end` only when the caller bounded it. */
type VideoTrimRange = { start: number; end?: number };

/** A video resize target; `fit` only when the caller chose one. */
type VideoResizeTarget = {
  width: number;
  height: number;
  fit?: "fill" | "contain" | "cover";
};

export function createVideoBridge(
  signal?: AbortSignal,
  maxBytes = 256 * 1024 * 1024
): VideoBridge {
  return {
    async info(bytes) {
      signal?.throwIfAborted();
      await ensureCodecs();
      const input = inputFrom(bytes);
      const disposeInput = (): void => input.dispose();
      signal?.addEventListener("abort", disposeInput, { once: true });
      try {
        const [video, audio, duration] = await Promise.all([
          input.getPrimaryVideoTrack(),
          input.getPrimaryAudioTrack(),
          input.computeDuration()
        ]);
        if (!video) throw new Error("video.info: no video track found");
        await validateVideoDimensions(video, maxBytes, "video.info");
        const [width, height, rotation, codec] = await Promise.all([
          video.getDisplayWidth(),
          video.getDisplayHeight(),
          video.getRotation(),
          video.getCodec()
        ]);
        return { width, height, rotation, codec, duration, has_audio: !!audio };
      } finally {
        signal?.removeEventListener("abort", disposeInput);
        input.dispose();
      }
    },
    async trim(bytes, options) {
      const start = Math.max(0, numberOption(options, "start", 0));
      const endValue = options?.end;
      const end =
        endValue === undefined ? undefined : numberOption(options, "end", 0);
      if (end !== undefined && end <= start) {
        throw new Error("video.trim: end must be after start");
      }
      const trim: VideoTrimRange = { start };
      if (end !== undefined) trim.end = end;
      return videoConvert(bytes, { trim }, signal, maxBytes);
    },
    async resize(bytes, options) {
      const width = numberOption(options, "width", 0);
      const height = numberOption(options, "height", 0);
      if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1
      ) {
        throw new Error(
          "video.resize: width and height must be positive integers"
        );
      }
      validatePixelDimensions(width, height, maxBytes, "video.resize");
      const fit = options?.fit;
      if (
        fit !== undefined &&
        fit !== "fill" &&
        fit !== "contain" &&
        fit !== "cover"
      ) {
        throw new Error("video.resize: fit must be fill, contain, or cover");
      }
      const video: VideoResizeTarget = { width, height };
      if (fit !== undefined) video.fit = fit;
      return videoConvert(bytes, { video }, signal, maxBytes);
    },
    async rotate(bytes, rawDegrees) {
      if (
        rawDegrees !== 0 &&
        rawDegrees !== 90 &&
        rawDegrees !== 180 &&
        rawDegrees !== 270
      ) {
        throw new Error("video.rotate: degrees must be 0, 90, 180, or 270");
      }
      return videoConvert(
        bytes,
        {
          video: { rotate: rawDegrees as Rotation }
        },
        signal,
        maxBytes
      );
    },
    async addAudio(videoBytes, audioBytes, options) {
      await ensureCodecs();
      signal?.throwIfAborted();
      const videoInput = inputFrom(videoBytes);
      const audioInput = inputFrom(audioBytes);
      const disposeInputs = (): void => {
        videoInput.dispose();
        audioInput.dispose();
      };
      signal?.addEventListener("abort", disposeInputs, { once: true });
      const collector = limitedTarget(maxBytes, "video.addAudio");
      const output = new Output({
        format: new Mp4OutputFormat(),
        target: collector.target
      });
      let videoConversion: Conversion | undefined;
      let audioConversion: Conversion | undefined;
      try {
        const [videoTrack, audioTrack] = await Promise.all([
          videoInput.getPrimaryVideoTrack(),
          audioInput.getPrimaryAudioTrack()
        ]);
        if (!videoTrack) {
          throw new Error(
            "video.addAudio: video input has no usable video track"
          );
        }
        if (!audioTrack) {
          throw new Error(
            "video.addAudio: audio input has no usable audio track"
          );
        }
        await validateVideoDimensions(videoTrack, maxBytes, "video.addAudio");
        const keepOriginal = options?.keepOriginalAudio === true;
        videoConversion = await Conversion.init({
          input: videoInput,
          output,
          composable: true,
          showWarnings: false,
          audio: { discard: !keepOriginal }
        });
        // AAC first — every MP4 player takes it. Chrome ships no AAC encoder on
        // Linux (it encodes through Media Foundation on Windows and
        // AudioToolbox on macOS), so fall back to Opus, which MP4 also carries.
        const [numberOfChannels, sampleRate] = await Promise.all([
          audioTrack.getNumberOfChannels(),
          audioTrack.getSampleRate()
        ]);
        const audioCodec = await getFirstEncodableAudioCodec(["aac", "opus"], {
          numberOfChannels,
          sampleRate
        });
        if (!audioCodec) {
          throw new Error(
            "video.addAudio: this platform can encode neither AAC nor Opus audio"
          );
        }
        const audioOptions: ConversionAudioOptions = { codec: audioCodec };
        audioConversion = await Conversion.init({
          input: audioInput,
          output,
          composable: true,
          showWarnings: false,
          video: { discard: true },
          audio: audioOptions
        });
        if (
          !videoConversion.utilizedTracks.includes(videoTrack) ||
          !audioConversion.utilizedTracks.includes(audioTrack)
        ) {
          throw new Error(
            "video.addAudio: required tracks cannot be encoded as MP4"
          );
        }
        await output.start();
        await Promise.all([
          executeConversion(videoConversion, signal),
          executeConversion(audioConversion, signal)
        ]);
        await output.finalize();
        return collector.bytes();
      } catch (error) {
        await Promise.allSettled([
          ...(videoConversion ? [videoConversion.cancel()] : []),
          ...(audioConversion ? [audioConversion.cancel()] : []),
          output.cancel()
        ]);
        throw error;
      } finally {
        signal?.removeEventListener("abort", disposeInputs);
        videoInput.dispose();
        audioInput.dispose();
      }
    },
    async extractAudio(bytes) {
      return convert(
        bytes,
        "audio",
        {
          video: { discard: true },
          audio: { codec: "pcm-s16" }
        },
        signal,
        maxBytes
      );
    },
    async extractFrame(bytes, rawTime) {
      signal?.throwIfAborted();
      await ensureCodecs();
      const time =
        rawTime === undefined
          ? 0
          : isFiniteNumber(rawTime)
            ? Math.max(0, rawTime)
            : NaN;
      if (!Number.isFinite(time)) {
        throw new Error("video.extractFrame: time must be a finite number");
      }
      const input = inputFrom(bytes);
      const dispose = (): void => input.dispose();
      signal?.addEventListener("abort", dispose, { once: true });
      try {
        const track = await input.getPrimaryVideoTrack();
        if (!track) throw new Error("video.extractFrame: no video track found");
        await validateVideoDimensions(track, maxBytes, "video.extractFrame");
        const sample = await new VideoSampleSink(track).getSample(time);
        if (!sample) {
          throw new Error("video.extractFrame: no frame found at that time");
        }
        try {
          const width = sample.displayWidth;
          const height = sample.displayHeight;
          if (
            !Number.isSafeInteger(width) ||
            !Number.isSafeInteger(height) ||
            width < 1 ||
            height < 1 ||
            width > Math.floor(maxBytes / 4 / height)
          ) {
            throw new Error(
              "video.extractFrame: decoded frame exceeds the run media limit"
            );
          }
          const pixels = new Uint8Array(width * height * 4);
          await sample.copyTo(pixels, { format: "RGBA" });
          signal?.throwIfAborted();
          return encodePixels(pixels, width, height, { format: "png" });
        } finally {
          sample.close();
        }
      } finally {
        signal?.removeEventListener("abort", dispose);
        input.dispose();
      }
    }
  };
}

export const audioOps = createAudioBridge();
export const videoOps = createVideoBridge();
