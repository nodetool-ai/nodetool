/**
 * The Sampler (`nodetool.audio.synth.Sampler`): a polyphonic sample player
 * for the modular synthesis nodes. A gate CV stream triggers the voices and a
 * pitch CV stream tunes them, with the conventions of ./synthesis.ts.
 *
 * The voice loop runs in the kernel library (`nt_sampler_process`). The
 * kernel keeps every voice in a state array that this node owns, so a voice
 * that starts in one chunk continues in the next.
 *
 * Both kernel hosts copy the clip for each block. The node therefore passes
 * only the played region, and limits it to MAX_SAMPLER_SECONDS.
 */
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
  StreamingInputs,
  StreamingOutputs
} from "@nodetool-ai/node-sdk";
import type { Chunk } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  loadKernels,
  MAX_SAMPLER_VOICES,
  type SamplerBlock,
  type SamplerMode
} from "@nodetool-ai/kernels";
import { decodeAudioToWav, requireAudioBytes } from "../lib/audio-wav.js";
import {
  alignedSignalStreams,
  CHUNK_PROP_DEFAULT,
  makeDoneSignalChunk,
  makeSignalChunk
} from "../lib/cv.js";
import { getTransport } from "../lib/transport.js";

/** The longest region that a Sampler plays, in seconds. */
export const MAX_SAMPLER_SECONDS = 30;

export class SamplerNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.synth.Sampler";
  static readonly title = "Sampler";
  static readonly description =
    "Plays an audio clip as a polyphonic instrument: each gate trigger starts a voice.\n    audio, synthesis, sampler, sample, drum, voice, polyphonic, modular\n\n    Each rising edge of the gate (≥ 0.5) starts a voice at the start of the region. The voice reads pitch_cv at that sample (volts/octave: rate = 2^(cv + tune / 12)) and keeps that rate, so voices at different pitches sound together. When all voices sound, a new trigger replaces the oldest voice. The gate drives chunk cadence (sample-aligned). With no gate patched, the gate is high from the first frame, so the clip plays one time. The output has the channels of the clip.\n\n    Use cases:\n    - Play drum hits from gate patterns\n    - Play a melody from one recorded note\n    - Loop or stutter a slice of a clip";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio", "gate", "pitch_cv"];
  static readonly isStreamingInput = true;

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
    description: "The clip that the voices play."
  })
  declare audio: Record<string, unknown>;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "Gate",
    description:
      "Gate CV stream. Each rising edge (≥ 0.5) starts a voice. When patched, drives the output chunk cadence."
  })
  declare gate: Chunk;

  @prop({
    type: "cv",
    default: CHUNK_PROP_DEFAULT,
    title: "Pitch CV",
    description:
      "Pitch control stream in octaves (volts/octave). A voice keeps the value of its trigger sample."
  })
  declare pitch_cv: Chunk;

  @prop({
    type: "enum",
    default: "one_shot",
    title: "Mode",
    description:
      "one_shot plays each voice to the end of the region. gated fades a voice out when the gate falls. loop also repeats the region.",
    values: ["one_shot", "gated", "loop"]
  })
  declare mode: SamplerMode;

  @prop({
    type: "int",
    default: 8,
    title: "Voices",
    description:
      "Voices that can sound together. A trigger beyond this number replaces the oldest voice.",
    min: 1,
    max: MAX_SAMPLER_VOICES
  })
  declare voices: number;

  @prop({
    type: "float",
    default: 0,
    title: "Tune",
    description: "Pitch offset in semitones.",
    min: -48,
    max: 48
  })
  declare tune: number;

  @prop({
    type: "float",
    default: 0,
    title: "Start",
    description: "Start of the played region in seconds.",
    min: 0,
    max: 600
  })
  declare start: number;

  @prop({
    type: "float",
    default: 0,
    title: "Length",
    // A plain string: the docs and DSL generators read the source text.
    description:
      "Length of the played region in seconds. Zero plays to the end of the clip. The region is at most 30 s.",
    min: 0,
    max: MAX_SAMPLER_SECONDS
  })
  declare length: number;

  @prop({
    type: "float",
    default: 0,
    title: "Attack",
    description: "Fade-in time of each voice in seconds.",
    min: 0,
    max: 10
  })
  declare attack: number;

  @prop({
    type: "float",
    default: 0.05,
    title: "Release",
    description:
      "Fade-out time in seconds after the gate falls, in the gated and loop modes.",
    min: 0,
    max: 10
  })
  declare release: number;

  @prop({
    type: "float",
    default: 1,
    title: "Gain",
    description: "Output level (linear).",
    min: 0,
    max: 4
  })
  declare gain: number;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs,
    context?: ProcessingContext
  ): Promise<void> {
    const kernels = await loadKernels();
    // A connected clip arrives on the input stream. An unconnected one is
    // the property value.
    const audio = inputs.hasStream("audio")
      ? await inputs.first("audio")
      : this.audio;
    const clip = await decodeAudioToWav(await requireAudioBytes(audio, context));
    const channels = clip.numChannels;
    if (clip.samples.length < channels) {
      throw new Error("The Sampler clip has no audio frames.");
    }
    const transport = getTransport(context);
    const signal = inputs.signal;

    let sampleRate = transport.sampleRate;
    let emitted = 0;
    let active = 0;
    // The clip at `clipRate`, and the voices of `state`.
    let clipRate = 0;
    let source = clip.samples;
    let voices = 0;
    let state: Float64Array | undefined;

    // One block at `sampleRate`. The controls are read here, so a change
    // applies at the next block. A new rate or voice count starts new state.
    const render = (
      frames: number,
      gate?: Float32Array,
      pitch?: Float32Array
    ): SamplerBlock => {
      if (clipRate !== sampleRate) {
        clipRate = sampleRate;
        source = kernels.resample(
          clip.samples,
          channels,
          clip.sampleRate,
          clipRate
        );
        state = undefined;
      }
      const wanted = Math.min(
        MAX_SAMPLER_VOICES,
        Math.max(1, Math.floor(this.voices))
      );
      if (!state || voices !== wanted) {
        voices = wanted;
        state = kernels.createSamplerState(voices, channels);
      }
      const total = Math.floor(source.length / channels);
      const start = Math.min(
        total,
        Math.max(0, Math.round(this.start * clipRate))
      );
      const seconds =
        this.length > 0
          ? Math.min(this.length, MAX_SAMPLER_SECONDS)
          : MAX_SAMPLER_SECONDS;
      const length = Math.min(total - start, Math.round(seconds * clipRate));
      return kernels.sampler(
        state,
        voices,
        source.subarray(start * channels, (start + length) * channels),
        channels,
        frames,
        {
          mode: this.mode,
          rate: 2 ** (this.tune / 12),
          attackFrames: this.attack * clipRate,
          releaseFrames: this.release * clipRate,
          gain: this.gain
        },
        gate,
        pitch
      );
    };

    const emit = async (
      frames: number,
      gate?: Float32Array,
      pitch?: Float32Array
    ): Promise<void> => {
      const block = render(frames, gate, pitch);
      await outputs.emit(
        "chunk",
        makeSignalChunk(block.samples, sampleRate, channels, false, "pcm16le")
      );
      emitted += frames;
      active = block.active;
    };

    // Frames of the next block: a transport block, cut at the end of a render.
    const nextFrames = (): number =>
      transport.endFrame === null
        ? transport.blockFrames
        : Math.min(transport.blockFrames, transport.endFrame - emitted);

    const hasGate = inputs.hasStream("gate");
    if (hasGate || inputs.hasStream("pitch_cv")) {
      // Clocked: the gate drives chunk cadence, and the pitch is
      // frame-aligned to it. With only the pitch patched, the pitch drives
      // and the gate is high.
      for await (const frame of alignedSignalStreams(inputs, {
        primary: hasGate ? "gate" : "pitch_cv",
        cvHandles: hasGate ? ["pitch_cv"] : []
      })) {
        sampleRate = frame.primary.sampleRate;
        const drive = kernels.extractChannel(
          frame.primary.samples,
          frame.primary.channels
        );
        await emit(
          drive.length,
          hasGate ? drive : undefined,
          hasGate ? frame.cv["pitch_cv"] : drive
        );
      }
      // The clock has ended: the gate falls, and the voices that still
      // sound play out, up to the end of a render.
      const low = new Float32Array(transport.blockFrames);
      while (active > 0 && !signal.aborted && nextFrames() > 0) {
        const frames = nextFrames();
        await emit(frames, low.subarray(0, frames));
      }
    } else {
      // Free-running: the gate is high from the first frame. The stream ends
      // with the last voice, at the end of a render, or when the run stops.
      while (!signal.aborted && nextFrames() > 0) {
        await transport.until(emitted, signal);
        if (signal.aborted) break;
        await emit(nextFrames());
        if (active === 0) break;
      }
    }
    await outputs.emit(
      "chunk",
      makeDoneSignalChunk(sampleRate, channels, "pcm16le")
    );
  }
}
