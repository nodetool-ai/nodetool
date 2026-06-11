/**
 * Realtime/streaming audio nodes — chunked PCM16LE audio flowing through the
 * kernel's streaming machinery.
 *
 * Chunk convention (shared with the elevenlabs realtime nodes and the web
 * app's `useRealtimeAudioStream`): `content` carries base64 PCM16LE bytes,
 * `content_type` is `"audio"`, `content_metadata` describes the format, and
 * end-of-stream is an empty-content chunk with `done: true`.
 *
 * All nodes here are pure sample math — no WebAudio, no node-only APIs — so
 * they run on Node and in the browser workflow runner alike. The streaming
 * filters keep biquad state across chunks (see `lib/biquad.ts`), which is the
 * point: a per-chunk batch filter would lose its delay line at every chunk
 * boundary.
 */
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
  NodeClass,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool-ai/node-sdk";
import type { OutputCorrelation } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsHybrid } from "@nodetool-ai/nodes-utils";
import {
  audioBytesAsync,
  audioRefFromWav,
  deinterleave,
  encodeWav,
  interleave,
  parseWavBytes
} from "../lib/audio-wav.js";
import {
  CHUNK_PROP_DEFAULT,
  makeDoneSignalChunk,
  makeSignalChunk,
  readSignalChunk,
  SYNTH_SAMPLE_RATE
} from "../lib/cv.js";
import {
  biquadCoeffs,
  createBiquadState,
  processBiquad,
  DEFAULT_Q,
  type BiquadState,
  type BiquadType
} from "../lib/biquad.js";

// ── Chunk helpers ──────────────────────────────────────────────────
// Signal chunks (parse + build, both pcm16le and f32le CV encodings) live in
// ../lib/cv.ts — shared with the synthesis nodes so CV streams can be patched
// into any of these audio inputs.

const DEFAULT_SAMPLE_RATE = SYNTH_SAMPLE_RATE;

// ── AudioToChunks ──────────────────────────────────────────────────

export class AudioToChunksNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.realtime.AudioToChunks";
  static readonly title = "Audio To Chunks";
  static readonly description =
    "Slices an audio file into a stream of fixed-duration PCM16 chunks.\n    audio, stream, chunk, realtime\n\n    Use cases:\n    - Feed batch audio into realtime/streaming nodes\n    - Simulate a live audio feed from a recording\n    - Drive streaming effects and transcription nodes";
  static readonly metadataOutputTypes = {
    chunk: "chunk"
  };
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    chunk: { kind: "iteration", source: "__execution__", group: "stream" }
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio file to slice into chunks (must be WAV)."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 0.25,
    title: "Chunk Duration",
    description: "Duration of each emitted chunk in seconds.",
    min: 0.01,
    max: 10
  })
  declare chunk_duration: any;

  // Required by BaseNode but unused — genProcess is the execution path
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const chunkDuration = Number(this.chunk_duration ?? 0.25);

    const bytes = await audioBytesAsync(audio, context);
    const wav = parseWavBytes(bytes);
    if (!wav) throw new Error("AudioToChunks requires a valid WAV input");

    const { samples, sampleRate, numChannels } = wav;
    const channels = Math.max(1, numChannels);
    const totalFrames = Math.floor(samples.length / channels);
    const framesPerChunk = Math.max(1, Math.round(chunkDuration * sampleRate));

    for (let start = 0; start < totalFrames; start += framesPerChunk) {
      const end = Math.min(start + framesPerChunk, totalFrames);
      const slice = samples.subarray(start * channels, end * channels);
      yield {
        chunk: makeSignalChunk(slice, sampleRate, channels, false, "pcm16le")
      };
    }

    yield { chunk: makeDoneSignalChunk(sampleRate, channels, "pcm16le") };
  }
}

// ── ChunksToAudio ──────────────────────────────────────────────────

export class ChunksToAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.realtime.ChunksToAudio";
  static readonly title = "Chunks To Audio";
  static readonly description =
    "Accumulates a stream of PCM16 audio chunks into a single audio file.\n    audio, stream, chunk, realtime, accumulate\n\n    Use cases:\n    - Capture the output of streaming TTS or effects as a file\n    - Terminate a realtime audio chain with a playable result\n    - Record a processed live feed";
  static readonly metadataOutputTypes = {
    audio: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["chunk"];
  static readonly isStreamingInput = true;

  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Stream of PCM16LE audio chunks to accumulate."
  })
  declare chunk: any;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    const parts: Float32Array[] = [];
    let total = 0;
    let sampleRate = DEFAULT_SAMPLE_RATE;
    let channels = 1;
    let formatSeen = false;

    for await (const item of inputs.stream("chunk")) {
      const chunk = readSignalChunk(item);
      if (!chunk) continue;
      if (!formatSeen && chunk.samples.length > 0) {
        sampleRate = chunk.sampleRate;
        channels = chunk.channels;
        formatSeen = true;
      }
      if (chunk.samples.length > 0) {
        parts.push(chunk.samples);
        total += chunk.samples.length;
      }
      if (chunk.done) break;
    }

    const samples = new Float32Array(total);
    let offset = 0;
    for (const part of parts) {
      samples.set(part, offset);
      offset += part.length;
    }
    await outputs.emit(
      "audio",
      audioRefFromWav(encodeWav(samples, sampleRate, channels))
    );
  }
}

// ── StreamingGain ──────────────────────────────────────────────────

export class StreamingGainNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.realtime.StreamingGain";
  static readonly title = "Streaming Gain";
  static readonly description =
    "Applies a gain (volume adjustment) to each chunk of a realtime audio stream.\n    audio, stream, chunk, realtime, effect, volume\n\n    Use cases:\n    - Adjust the level of a live audio feed\n    - Balance streaming sources before mixing\n    - Attenuate or boost streaming TTS output";
  static readonly metadataOutputTypes = {
    chunk: "chunk"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["chunk"];
  static readonly isStreamingInput = true;

  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Stream of PCM16LE audio chunks to process."
  })
  declare chunk: any;

  @prop({
    type: "float",
    default: 0,
    title: "Gain Db",
    description:
      "Gain to apply in decibels. Positive values increase volume, negative values decrease it.",
    min: -60,
    max: 24
  })
  declare gain_db: any;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    const gainDb = Number(this.gain_db ?? 0);
    const factor = Math.pow(10, gainDb / 20);

    for await (const item of inputs.stream("chunk")) {
      const chunk = readSignalChunk(item);
      if (!chunk) continue;

      if (chunk.done) {
        await outputs.emit(
          "chunk",
          makeDoneSignalChunk(chunk.sampleRate, chunk.channels, "pcm16le")
        );
        break;
      }
      if (chunk.samples.length === 0) continue;

      const samples = chunk.samples;
      for (let i = 0; i < samples.length; i++) samples[i] *= factor;
      await outputs.emit(
        "chunk",
        makeSignalChunk(
          samples,
          chunk.sampleRate,
          chunk.channels,
          false,
          "pcm16le"
        )
      );
    }
  }
}

// ── Streaming biquad filters ───────────────────────────────────────

/**
 * Shared body of the streaming low/high-pass filters: one biquad per channel
 * whose state persists across chunk boundaries, so the filter behaves exactly
 * as if it had processed the unchunked signal.
 */
async function runStreamingFilter(
  type: BiquadType,
  frequency: number,
  q: number,
  inputs: StreamingInputs,
  outputs: StreamingOutputs
): Promise<void> {
  let coeffs: ReturnType<typeof biquadCoeffs> | null = null;
  let states: BiquadState[] = [];

  for await (const item of inputs.stream("chunk")) {
    const chunk = readSignalChunk(item);
    if (!chunk) continue;

    if (chunk.done) {
      await outputs.emit(
        "chunk",
        makeDoneSignalChunk(chunk.sampleRate, chunk.channels, "pcm16le")
      );
      break;
    }
    if (chunk.samples.length === 0) continue;

    if (!coeffs) {
      coeffs = biquadCoeffs(type, chunk.sampleRate, frequency, q, 0);
      states = Array.from({ length: chunk.channels }, createBiquadState);
    }

    const planes = deinterleave(chunk.samples, chunk.channels);
    const filtered = planes.map((plane, ch) =>
      processBiquad(coeffs!, states[ch] ?? createBiquadState(), plane)
    );
    await outputs.emit(
      "chunk",
      makeSignalChunk(
        interleave(filtered),
        chunk.sampleRate,
        chunk.channels,
        false,
        "pcm16le"
      )
    );
  }
}

export class StreamingLowPassNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.realtime.StreamingLowPass";
  static readonly title = "Streaming Low Pass";
  static readonly description =
    "Applies a low-pass filter to a realtime audio stream, keeping filter state across chunks.\n    audio, stream, chunk, realtime, effect, equalizer\n\n    Use cases:\n    - Soften a live audio feed\n    - Remove high-frequency noise from streaming audio\n    - Create realtime dub-style effects";
  static readonly metadataOutputTypes = {
    chunk: "chunk"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["chunk"];
  static readonly isStreamingInput = true;

  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Stream of PCM16LE audio chunks to process."
  })
  declare chunk: any;

  @prop({
    type: "float",
    default: 5000,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the low-pass filter in Hz.",
    min: 500,
    max: 20000
  })
  declare cutoff_frequency_hz: any;

  @prop({
    type: "float",
    default: DEFAULT_Q,
    title: "Q",
    description: "Filter resonance (quality factor).",
    min: 0.1,
    max: 10
  })
  declare q: any;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await runStreamingFilter(
      "lowpass",
      Number(this.cutoff_frequency_hz ?? 5000),
      Number(this.q ?? DEFAULT_Q),
      inputs,
      outputs
    );
  }
}

export class StreamingHighPassNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.realtime.StreamingHighPass";
  static readonly title = "Streaming High Pass";
  static readonly description =
    "Applies a high-pass filter to a realtime audio stream, keeping filter state across chunks.\n    audio, stream, chunk, realtime, effect, equalizer\n\n    Use cases:\n    - Remove rumble from a live microphone feed\n    - Clean up the low end of streaming audio\n    - Thin out streaming sources before mixing";
  static readonly metadataOutputTypes = {
    chunk: "chunk"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["chunk"];
  static readonly isStreamingInput = true;

  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Stream of PCM16LE audio chunks to process."
  })
  declare chunk: any;

  @prop({
    type: "float",
    default: 80,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the high-pass filter in Hz.",
    min: 20,
    max: 5000
  })
  declare cutoff_frequency_hz: any;

  @prop({
    type: "float",
    default: DEFAULT_Q,
    title: "Q",
    description: "Filter resonance (quality factor).",
    min: 0.1,
    max: 10
  })
  declare q: any;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await runStreamingFilter(
      "highpass",
      Number(this.cutoff_frequency_hz ?? 80),
      Number(this.q ?? DEFAULT_Q),
      inputs,
      outputs
    );
  }
}

export const REALTIME_AUDIO_NODES: readonly NodeClass[] = tagAsHybrid([
  AudioToChunksNode,
  ChunksToAudioNode,
  StreamingGainNode,
  StreamingLowPassNode,
  StreamingHighPassNode
]);
