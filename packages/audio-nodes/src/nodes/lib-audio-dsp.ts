import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { AudioRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import {
  requireAudioBytes,
  audioRefFromWav,
  decodeAudioToWav,
  encodeWav,
  type WavData
} from "../lib/audio-wav.js";
import {
  loadOfflineAudioContext,
  type OfflineAudioContextCtor
} from "../lib/audio-context.js";
import { applyBiquadToWav, DEFAULT_Q, type BiquadType } from "../lib/biquad.js";

// ── Part B: Audio filter/effect nodes (WebAudio / biquad) ─────────

export interface BiquadSpec {
  type: BiquadType;
  frequency: number;
  q?: number;
  gainDb?: number;
}

async function renderFilterWebAudio(
  Ctor: OfflineAudioContextCtor,
  wav: WavData,
  spec: BiquadSpec
): Promise<WavData> {
  const frameSamples = Math.floor(wav.samples.length / wav.numChannels);
  const ctx = new Ctor(wav.numChannels, frameSamples, wav.sampleRate);
  const buffer = ctx.createBuffer(
    wav.numChannels,
    frameSamples,
    wav.sampleRate
  );

  for (let ch = 0; ch < wav.numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < frameSamples; i++) {
      channelData[i] = wav.samples[i * wav.numChannels + ch];
    }
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = spec.type;
  filter.frequency.value = spec.frequency;
  if (spec.q !== undefined) filter.Q.value = spec.q;
  if (spec.gainDb !== undefined) filter.gain.value = spec.gainDb;
  source.connect(filter);
  filter.connect(ctx.destination);
  source.start();

  const renderedBuffer = await ctx.startRendering();

  const outSamples = new Float32Array(
    renderedBuffer.length * wav.numChannels
  );
  for (let ch = 0; ch < wav.numChannels; ch++) {
    const channelData = renderedBuffer.getChannelData(ch);
    for (let i = 0; i < renderedBuffer.length; i++) {
      outSamples[i * wav.numChannels + ch] = channelData[i];
    }
  }

  return {
    samples: outSamples,
    sampleRate: wav.sampleRate,
    numChannels: wav.numChannels
  };
}

/**
 * Apply a biquad filter to whole WAV data, preferring WebAudio's
 * `OfflineAudioContext` (node-web-audio-api on Node, the global in the
 * browser) and falling back to the pure-JS RBJ biquad when WebAudio is
 * unavailable (e.g. Web Workers without it). Exported for tests.
 */
export async function applyFilter(
  wav: WavData,
  spec: BiquadSpec
): Promise<AudioRef> {
  const Ctor = await loadOfflineAudioContext();
  const filtered = Ctor
    ? await renderFilterWebAudio(Ctor, wav, spec)
    : applyBiquadToWav(
        wav,
        spec.type,
        spec.frequency,
        spec.q ?? DEFAULT_Q,
        spec.gainDb ?? 0
      );
  return audioRefFromWav(
    encodeWav(filtered.samples, filtered.sampleRate, filtered.numChannels)
  );
}

export class GainNode_ extends BaseNode {
  static readonly nodeType = "lib.audio.Gain";
  static readonly title = "Gain";
  static readonly description =
    "Applies a gain (volume adjustment) to an audio file.\n    audio, effect, volume\n\n    Use cases:\n    - Increase or decrease overall volume of audio\n    - Balance levels between different audio tracks\n    - Prepare audio for further processing";
  static readonly metadataOutputTypes = {
    output: "audio"
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
    description: "The audio file to process."
  })
  declare audio: any;

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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const gainDb = Number(this.gain_db ?? 0);

    const bytes = await requireAudioBytes(audio, context);

    // A gain is a plain per-sample multiply — no WebAudio context needed.
    const wav = await decodeAudioToWav(bytes);
    const factor = Math.pow(10, gainDb / 20);
    const outSamples = new Float32Array(wav.samples.length);
    for (let i = 0; i < wav.samples.length; i++) {
      outSamples[i] = wav.samples[i] * factor;
    }

    return {
      output: audioRefFromWav(
        encodeWav(outSamples, wav.sampleRate, wav.numChannels)
      )
    };
  }
}

export class DelayNode_ extends BaseNode {
  static readonly nodeType = "lib.audio.Delay";
  static readonly title = "Delay";
  static readonly description =
    "Applies a delay effect to an audio file.\n    audio, effect, time-based\n\n    Use cases:\n    - Create echo effects\n    - Add spaciousness to sounds\n    - Produce rhythmic patterns";
  static readonly metadataOutputTypes = {
    output: "audio"
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
    description: "The audio file to process."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Delay Seconds",
    description: "Delay time in seconds.",
    min: 0.01,
    max: 5
  })
  declare delay_seconds: any;

  @prop({
    type: "float",
    default: 0.3,
    title: "Feedback",
    description: "Amount of delayed signal fed back into the effect.",
    min: 0,
    max: 0.99
  })
  declare feedback: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Mix",
    description: "Mix between the dry (original) and wet (delayed) signals.",
    min: 0,
    max: 1
  })
  declare mix: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const delaySec = Number(this.delay_seconds ?? 0.5);
    const feedback = Number(this.feedback ?? 0.3);
    const mix = Number(this.mix ?? 0.5);

    const bytes = await requireAudioBytes(audio, context);

    const wav = await decodeAudioToWav(bytes);
    const frameSamples = Math.floor(wav.samples.length / wav.numChannels);
    const delaySamples = Math.floor(delaySec * wav.sampleRate);

    // Process delay manually for better control over feedback
    const outLength = frameSamples + delaySamples * 4; // extra space for echoes
    const outSamples = new Float32Array(outLength * wav.numChannels);

    for (let ch = 0; ch < wav.numChannels; ch++) {
      const dry = new Float32Array(outLength);
      const wet = new Float32Array(outLength);

      // Copy dry signal
      for (let i = 0; i < frameSamples; i++) {
        dry[i] = wav.samples[i * wav.numChannels + ch];
      }

      // Wet = echoes only (delayed dry plus feedback of the delay line), so
      // `mix` truly blends dry against wet instead of always passing dry.
      for (let i = delaySamples; i < outLength; i++) {
        wet[i] = dry[i - delaySamples] + wet[i - delaySamples] * feedback;
      }

      // Mix dry and wet
      for (let i = 0; i < outLength; i++) {
        outSamples[i * wav.numChannels + ch] =
          dry[i] * (1 - mix) + wet[i] * mix;
      }
    }

    return {
      output: audioRefFromWav(
        encodeWav(outSamples, wav.sampleRate, wav.numChannels)
      )
    };
  }
}

export class HighPassFilterNode extends BaseNode {
  static readonly nodeType = "lib.audio.HighPassFilter";
  static readonly title = "High Pass Filter";
  static readonly description =
    "Applies a high-pass filter to attenuate frequencies below a cutoff point.\n    audio, effect, equalizer\n\n    Use cases:\n    - Remove low-frequency rumble or noise\n    - Clean up the low end of a mix\n    - Create filter sweep effects";
  static readonly metadataOutputTypes = {
    output: "audio"
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
    description: "The audio file to process."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 80,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the high-pass filter in Hz.",
    min: 20,
    max: 5000
  })
  declare cutoff_frequency_hz: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const cutoff = Number(this.cutoff_frequency_hz ?? 80);

    const bytes = await requireAudioBytes(audio, context);

    const output = await applyFilter(await decodeAudioToWav(bytes), {
      type: "highpass",
      frequency: cutoff
    });

    return { output };
  }
}

export class LowPassFilterNode extends BaseNode {
  static readonly nodeType = "lib.audio.LowPassFilter";
  static readonly title = "Low Pass Filter";
  static readonly description =
    "Applies a low-pass filter to attenuate frequencies above a cutoff point.\n    audio, effect, equalizer\n\n    Use cases:\n    - Reduce high-frequency harshness\n    - Simulate muffled or distant sounds\n    - Create dub-style effects";
  static readonly metadataOutputTypes = {
    output: "audio"
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
    description: "The audio file to process."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 5000,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the low-pass filter in Hz.",
    min: 500,
    max: 20000
  })
  declare cutoff_frequency_hz: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const cutoff = Number(this.cutoff_frequency_hz ?? 5000);

    const bytes = await requireAudioBytes(audio, context);

    const output = await applyFilter(await decodeAudioToWav(bytes), {
      type: "lowpass",
      frequency: cutoff
    });

    return { output };
  }
}

export class HighShelfFilterNode extends BaseNode {
  static readonly nodeType = "lib.audio.HighShelfFilter";
  static readonly title = "High Shelf Filter";
  static readonly description =
    "Applies a high shelf filter to boost or cut high frequencies.\n    audio, effect, equalizer\n\n    Use cases:\n    - Enhance or reduce treble frequencies\n    - Add brightness or air to audio\n    - Tame harsh high frequencies";
  static readonly metadataOutputTypes = {
    output: "audio"
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
    description: "The audio file to process."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 5000,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the shelf filter in Hz.",
    min: 1000,
    max: 20000
  })
  declare cutoff_frequency_hz: any;

  @prop({
    type: "float",
    default: 0,
    title: "Gain Db",
    description:
      "The gain to apply to the frequencies above the cutoff, in dB.",
    min: -24,
    max: 24
  })
  declare gain_db: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const cutoff = Number(this.cutoff_frequency_hz ?? 5000);
    const gainDb = Number(this.gain_db ?? 0);

    const bytes = await requireAudioBytes(audio, context);

    const output = await applyFilter(await decodeAudioToWav(bytes), {
      type: "highshelf",
      frequency: cutoff,
      gainDb
    });

    return { output };
  }
}

export class LowShelfFilterNode extends BaseNode {
  static readonly nodeType = "lib.audio.LowShelfFilter";
  static readonly title = "Low Shelf Filter";
  static readonly description =
    "Applies a low shelf filter to boost or cut low frequencies.\n    audio, effect, equalizer\n\n    Use cases:\n    - Enhance or reduce bass frequencies\n    - Shape the low-end response of audio\n    - Compensate for speaker or room deficiencies";
  static readonly metadataOutputTypes = {
    output: "audio"
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
    description: "The audio file to process."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 200,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the shelf filter in Hz.",
    min: 20,
    max: 1000
  })
  declare cutoff_frequency_hz: any;

  @prop({
    type: "float",
    default: 0,
    title: "Gain Db",
    description:
      "The gain to apply to the frequencies below the cutoff, in dB.",
    min: -24,
    max: 24
  })
  declare gain_db: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const cutoff = Number(this.cutoff_frequency_hz ?? 200);
    const gainDb = Number(this.gain_db ?? 0);

    const bytes = await requireAudioBytes(audio, context);

    const output = await applyFilter(await decodeAudioToWav(bytes), {
      type: "lowshelf",
      frequency: cutoff,
      gainDb
    });

    return { output };
  }
}

export class PeakFilterNode extends BaseNode {
  static readonly nodeType = "lib.audio.PeakFilter";
  static readonly title = "Peak Filter";
  static readonly description =
    "Applies a peak filter to boost or cut a specific frequency range.\n    audio, effect, equalizer\n\n    Use cases:\n    - Isolate specific frequency ranges\n    - Create telephone or radio voice effects\n    - Focus on particular instrument ranges in a mix";
  static readonly metadataOutputTypes = {
    output: "audio"
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
    description: "The audio file to process."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 1000,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the band-pass filter in Hz.",
    min: 20,
    max: 20000
  })
  declare cutoff_frequency_hz: any;

  @prop({
    type: "float",
    default: 1,
    title: "Q Factor",
    description:
      "The Q factor, determining the width of the band. Higher values create narrower bands.",
    min: 0.1,
    max: 10
  })
  declare q_factor: any;

  @prop({
    type: "float",
    default: 0,
    title: "Gain Db",
    description:
      "The gain to apply at the centre frequency, in dB. Positive values boost, negative values cut.",
    min: -24,
    max: 24
  })
  declare gain_db: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const cutoff = Number(this.cutoff_frequency_hz ?? 1000);
    const q = Number(this.q_factor ?? 1.0);
    const gainDb = Number(this.gain_db ?? 0);

    const bytes = await requireAudioBytes(audio, context);

    const output = await applyFilter(await decodeAudioToWav(bytes), {
      type: "peaking",
      frequency: cutoff,
      q,
      gainDb
    });

    return { output };
  }
}

// Server-only: these decode the input audio to PCM (WAV directly, or mp3/flac/
// … via WebAudio `decodeAudioData`), which needs Node's `node-web-audio-api`.
export const LIB_AUDIO_DSP_NODES = tagAsServer([
  GainNode_,
  DelayNode_,
  HighPassFilterNode,
  LowPassFilterNode,
  HighShelfFilterNode,
  LowShelfFilterNode,
  PeakFilterNode
]);
