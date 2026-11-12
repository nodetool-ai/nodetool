import { SIGNAL_EFFECT_NODES } from "./signal-effects.js";
import { applyToSignal } from "../lib/signal-effect.js";
import { GainEffect } from "../lib/effect-descriptors.js";
import {
  GainProperties,
  LowPassFilterProperties,
  HighPassFilterProperties
} from "../lib/effect-properties.js";
import { getTransport } from "../lib/transport.js";
import {
  AUDIO_SAMPLE_RATE,
  MAX_AUDIO_RENDER_SECONDS
} from "@nodetool-ai/protocol";
/**
 * Realtime/streaming audio nodes — chunked PCM16LE audio flowing through the
 * kernel's streaming machinery.
 *
 * Chunk convention (shared with the elevenlabs realtime nodes and the web
 * app's `useRealtimeAudioStream`): `content` carries base64 PCM16LE bytes,
 * `content_type` is `"audio"`, `content_metadata` describes the format, and
 * end-of-stream is an empty-content chunk with `done: true`.
 *
 * The sample math runs in the kernel library (@nodetool-ai/kernels) — no
 * WebAudio, no node-only APIs — so these nodes run on Node and in the browser
 * workflow runner alike. The streaming filters keep biquad state across
 * chunks, which is the point: a per-chunk batch filter would lose its delay
 * line at every chunk boundary.
 */
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
  NodeClass,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool-ai/node-sdk";
import type { Chunk, OutputCorrelation } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsHybrid } from "@nodetool-ai/nodes-utils";
import { loadKernels, type BiquadType } from "@nodetool-ai/kernels";
import {
  audioBytesAsync,
  audioRefFromWav,
  encodeWav,
  parseWavBytes,
  decodeAudioToWav
} from "../lib/audio-wav.js";
import {
  CHUNK_PROP_DEFAULT,
  makeDoneSignalChunk,
  makeSignalChunk,
  readSignalChunk
} from "../lib/cv.js";
import { DEFAULT_Q } from "../lib/biquad.js";

// ── Chunk helpers ──────────────────────────────────────────────────
// Signal chunks (parse + build, both pcm16le and f32le CV encodings) live in
// ../lib/cv.ts — shared with the synthesis nodes so CV streams can be patched
// into any of these audio inputs.

const DEFAULT_SAMPLE_RATE = AUDIO_SAMPLE_RATE;

// ── AudioToChunks ──────────────────────────────────────────────────

export class AudioToChunksNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.realtime.AudioToChunks";
  static readonly title = "Audio To Chunks";
  static readonly description =
    "Slices an audio file into a stream of fixed-duration PCM16 chunks.\n    audio, stream, chunk, realtime\n\n    Use cases:\n    - Feed batch audio into realtime/streaming nodes\n    - Simulate a live audio feed from a recording\n    - Drive streaming effects and transcription nodes";
  static readonly metadataOutputTypes = {
    chunk: "chunk"
  };
  static readonly outputCorrelation = {
    chunk: { kind: "iteration", source: "__execution__", group: "stream" }
  } satisfies Record<string, OutputCorrelation>;
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
    description: "The audio file to play as chunks."
  })
  declare audio: Record<string, unknown>;

  @prop({
    type: "float",
    default: 0.25,
    title: "Chunk Duration",
    description: "Duration of each emitted chunk in seconds.",
    min: 0.01,
    max: 10
  })
  declare chunk_duration: number;

  @prop({
    type: "bool",
    default: false,
    title: "Loop",
    description: "Play the clip repeatedly until the run ends."
  })
  declare loop: boolean;

  // Required by BaseNode but unused — genProcess is the execution path
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const transport = getTransport(context);
    const bytes = await audioBytesAsync(this.audio, context);
    const wav =
      transport.mode === "free"
        ? parseWavBytes(bytes)
        : await decodeAudioToWav(bytes);
    if (!wav)
      throw new Error("AudioToChunks requires a valid WAV input in free mode");
    const channels = wav.numChannels;
    const sampleRate =
      transport.mode === "free" ? wav.sampleRate : transport.sampleRate;
    const kernels = await loadKernels();
    const samples =
      transport.mode === "free"
        ? wav.samples
        : kernels.resample(wav.samples, channels, wav.sampleRate, sampleRate);
    const totalFrames = Math.floor(samples.length / channels);
    const framesPerChunk = Math.max(
      1,
      Math.round(this.chunk_duration * sampleRate)
    );
    let frame = 0;
    const signal = context?.signal;
    while (
      totalFrames > 0 &&
      !signal?.aborted &&
      (this.loop || frame < totalFrames) &&
      (transport.endFrame === null || frame < transport.endFrame)
    ) {
      if (transport.mode !== "free" || this.loop)
        await transport.until(
          (frame * transport.sampleRate) / sampleRate,
          signal
        );
      if (signal?.aborted) break;
      const start = frame % totalFrames;
      const count = Math.min(
        framesPerChunk,
        totalFrames - start,
        transport.endFrame === null ? Infinity : transport.endFrame - frame
      );
      yield {
        chunk: makeSignalChunk(
          samples.subarray(start * channels, (start + count) * channels),
          sampleRate,
          channels,
          false,
          "pcm16le"
        )
      };
      frame += count;
    }
    yield { chunk: makeDoneSignalChunk(sampleRate, channels, "pcm16le") };
  }
}

// ── ChunksToAudio ──────────────────────────────────────────────────

export class ChunksToAudioNode extends BaseNode {
  static readonly audioSink = "render" as const;

  @prop({
    type: "float",
    default: 0,
    title: "Duration",
    description: "Seconds to record. Zero records until the stream ends.",
    min: 0,
    max: MAX_AUDIO_RENDER_SECONDS
  })
  declare duration: number;
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
  declare chunk: Chunk;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs,
    context?: ProcessingContext
  ): Promise<void> {
    const parts: Float32Array[] = [];
    let total = 0;
    let sampleRate = DEFAULT_SAMPLE_RATE;
    let channels = 1;
    let formatSeen = false;
    let captured = false;
    const live = getTransport(context).mode === "live";
    const emitRecording = async (): Promise<void> => {
      const samples = new Float32Array(total);
      let offset = 0;
      for (const part of parts) {
        samples.set(part, offset);
        offset += part.length;
      }
      parts.length = 0;
      await outputs.emit(
        "audio",
        audioRefFromWav(encodeWav(samples, sampleRate, channels))
      );
    };

    for await (const item of inputs.stream("chunk")) {
      const chunk = readSignalChunk(item);
      if (!chunk) {
        continue;
      }
      if (captured) {
        if (chunk.done) {
          break;
        }
        continue;
      }
      if (!formatSeen && chunk.samples.length > 0) {
        sampleRate = chunk.sampleRate;
        channels = chunk.channels;
        formatSeen = true;
      }
      if (chunk.samples.length > 0) {
        const limit =
          this.duration > 0
            ? Math.round(
                Math.min(this.duration, MAX_AUDIO_RENDER_SECONDS) * sampleRate
              ) * channels
            : null;
        const remaining =
          limit === null ? chunk.samples.length : Math.max(0, limit - total);
        const part = chunk.samples.subarray(0, remaining);
        parts.push(part);
        total += part.length;
        if (limit !== null && total >= limit) {
          captured = true;
          await emitRecording();
          if (!live) {
            return;
          }
          // Keep this live edge drained after capture without retaining PCM.
          // The other sinks continue playing until the run is cancelled.
        }
      }
      if (chunk.done) {
        break;
      }
    }
    if (!captured) {
      await emitRecording();
    }
  }
}

// ── AudioOutput ────────────────────────────────────────────────────

export class AudioOutputNode extends BaseNode {
  static readonly audioSink = "live" as const;
  static readonly nodeType = "nodetool.audio.realtime.AudioOutput";
  static readonly title = "Audio Out";
  static readonly description =
    "Plays a realtime audio chunk stream — the patch's speaker.\n    audio, stream, chunk, realtime, output, speaker, monitor\n\n    Passes every chunk through verbatim; the editor picks the chunks up from the live stream and plays them as they arrive. Terminate any synth patch or streaming effect chain here to hear it.\n\n    Use cases:\n    - Monitor a live modular synth patch\n    - Hear streaming TTS or effects output as it renders\n    - Audition a chain before recording it with ChunksToAudio";
  static readonly metadataOutputTypes = {
    chunk: "chunk"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["chunk"];
  static readonly isStreamingInput = true;
  // The editor's monitor buffer is fed by this node's output_updates; keep
  // them flowing even when the pass-through output is patched into a
  // recorder (the runner suppresses connected handles by default).
  static readonly alwaysEmitOutputUpdates = true;

  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Stream of PCM16LE audio chunks to play."
  })
  declare chunk: Chunk;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    for await (const item of inputs.stream("chunk")) {
      const chunk = readSignalChunk(item);
      if (!chunk) continue;
      // Verbatim pass-through: each emit becomes an output_update the
      // editor's playback buffer consumes; downstream nodes can still
      // record the same stream.
      await outputs.emit("chunk", item);
      if (chunk.done) break;
    }
  }
}

// ── StreamingGain ──────────────────────────────────────────────────

export class StreamingGainNode extends GainProperties {
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
  declare chunk: Chunk;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await applyToSignal(GainEffect, this, inputs, outputs);
  }
}

// ── Streaming biquad filters ───────────────────────────────────────

/**
 * Shared body of the streaming low/high-pass filters: one biquad per channel
 * whose state persists across chunk boundaries, so the filter behaves exactly
 * as if it had processed the unchunked signal. The cutoff/Q are read via
 * `params` and coefficients recomputed per chunk, so live updates apply.
 */
async function runStreamingFilter(
  type: BiquadType,
  params: () => { frequency: number; q: number },
  inputs: StreamingInputs,
  outputs: StreamingOutputs
): Promise<void> {
  await applyToSignal(
    {
      kernel: "nt_biquad_process",
      create: (_n, k, c) => k.createBiquadState(c),
      process: (_n, k, state, samples, c, r) => {
        const p = params();
        return k.biquadProcess(
          k.biquadDesign("rbj", type, r, p.frequency, p.q),
          state,
          samples,
          c
        );
      }
    },
    undefined,
    inputs,
    outputs
  );
}

export class StreamingLowPassNode extends LowPassFilterProperties {
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
  declare chunk: Chunk;

  @prop({
    type: "float",
    default: DEFAULT_Q,
    title: "Q",
    description: "Filter resonance (quality factor).",
    min: 0.1,
    max: 10
  })
  declare q: number;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await runStreamingFilter(
      "lowpass",
      () => ({
        frequency: this.cutoff_frequency_hz,
        q: this.q
      }),
      inputs,
      outputs
    );
  }
}

export class StreamingHighPassNode extends HighPassFilterProperties {
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
  declare chunk: Chunk;

  @prop({
    type: "float",
    default: DEFAULT_Q,
    title: "Q",
    description: "Filter resonance (quality factor).",
    min: 0.1,
    max: 10
  })
  declare q: number;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await runStreamingFilter(
      "highpass",
      () => ({
        frequency: this.cutoff_frequency_hz,
        q: this.q
      }),
      inputs,
      outputs
    );
  }
}

export const REALTIME_AUDIO_NODES: readonly NodeClass[] = tagAsHybrid([
  ...SIGNAL_EFFECT_NODES,
  AudioToChunksNode,
  AudioOutputNode,
  ChunksToAudioNode,
  StreamingGainNode,
  StreamingLowPassNode,
  StreamingHighPassNode
]);
