import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { AudioRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import { loadKernels, type BiquadType } from "@nodetool-ai/kernels";
import {
  requireAudioBytes,
  audioRefFromWav,
  decodeAudioToWav,
  encodeWav,
  type WavData
} from "../lib/audio-wav.js";

// ── Part B: Audio filter/effect nodes (biquad) ─────────────────────

export interface BiquadSpec {
  type: BiquadType;
  frequency: number;
  q?: number;
  gainDb?: number;
}

/** BiquadFilterNode's default Q, which the high- and low-pass nodes keep. */
const WEBAUDIO_DEFAULT_Q = 1;

/**
 * Apply a biquad filter to whole WAV data with the Web Audio
 * BiquadFilterNode design (lowpass and highpass Q in dB, shelves without Q).
 * The kernel gives the same samples as node-web-audio-api's
 * OfflineAudioContext, on every host, and needs no WebAudio. Exported for
 * tests.
 */
export async function applyFilter(
  wav: WavData,
  spec: BiquadSpec
): Promise<AudioRef> {
  const kernels = await loadKernels();
  const coeffs = kernels.biquadDesign(
    "webaudio",
    spec.type,
    wav.sampleRate,
    spec.frequency,
    spec.q ?? WEBAUDIO_DEFAULT_Q,
    spec.gainDb ?? 0
  );
  const filtered = kernels.biquadProcess(
    coeffs,
    kernels.createBiquadState(wav.numChannels),
    wav.samples,
    wav.numChannels
  );
  return audioRefFromWav(encodeWav(filtered, wav.sampleRate, wav.numChannels));
}

/** Output handles GainNode_.process() emits. */
type GainNode_Outputs = {
  output: AudioRef;
};

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
  declare audio: Record<string, unknown>;

  @prop({
    type: "float",
    default: 0,
    title: "Gain Db",
    description:
      "Gain to apply in decibels. Positive values increase volume, negative values decrease it.",
    min: -60,
    max: 24
  })
  declare gain_db: number;

  async process(context?: ProcessingContext): Promise<GainNode_Outputs> {
    const audio = this.audio;
    const gainDb = this.gain_db;

    const bytes = await requireAudioBytes(audio, context);

    const wav = await decodeAudioToWav(bytes);
    const kernels = await loadKernels();
    const outSamples = kernels.scaleOffset(wav.samples, Math.pow(10, gainDb / 20));

    return {
      output: audioRefFromWav(
        encodeWav(outSamples, wav.sampleRate, wav.numChannels)
      )
    };
  }
}

/** Output handles DelayNode_.process() emits. */
type DelayNode_Outputs = {
  output: AudioRef;
};

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
  declare audio: Record<string, unknown>;

  @prop({
    type: "float",
    default: 0.5,
    title: "Delay Seconds",
    description: "Delay time in seconds.",
    min: 0.01,
    max: 5
  })
  declare delay_seconds: number;

  @prop({
    type: "float",
    default: 0.3,
    title: "Feedback",
    description: "Amount of delayed signal fed back into the effect.",
    min: 0,
    max: 0.99
  })
  declare feedback: number;

  @prop({
    type: "float",
    default: 0.5,
    title: "Mix",
    description: "Mix between the dry (original) and wet (delayed) signals.",
    min: 0,
    max: 1
  })
  declare mix: number;

  async process(context?: ProcessingContext): Promise<DelayNode_Outputs> {
    const audio = this.audio;
    const delaySec = this.delay_seconds;
    const feedback = this.feedback;
    const mix = this.mix;

    const bytes = await requireAudioBytes(audio, context);

    const wav = await decodeAudioToWav(bytes);
    // The output holds the input and four echoes of the delay.
    const kernels = await loadKernels();
    const outSamples = kernels.delay(wav.samples, wav.numChannels, wav.sampleRate, {
      delaySeconds: delaySec,
      feedback,
      mix
    });

    return {
      output: audioRefFromWav(
        encodeWav(outSamples, wav.sampleRate, wav.numChannels)
      )
    };
  }
}

/** Output handles HighPassFilterNode.process() emits. */
type HighPassFilterNodeOutputs = {
  output: AudioRef;
};

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
  declare audio: Record<string, unknown>;

  @prop({
    type: "float",
    default: 80,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the high-pass filter in Hz.",
    min: 20,
    max: 5000
  })
  declare cutoff_frequency_hz: number;

  async process(context?: ProcessingContext): Promise<HighPassFilterNodeOutputs> {
    const audio = this.audio;
    const cutoff = this.cutoff_frequency_hz;

    const bytes = await requireAudioBytes(audio, context);

    const output = await applyFilter(await decodeAudioToWav(bytes), {
      type: "highpass",
      frequency: cutoff
    });

    return { output };
  }
}

/** Output handles LowPassFilterNode.process() emits. */
type LowPassFilterNodeOutputs = {
  output: AudioRef;
};

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
  declare audio: Record<string, unknown>;

  @prop({
    type: "float",
    default: 5000,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the low-pass filter in Hz.",
    min: 500,
    max: 20000
  })
  declare cutoff_frequency_hz: number;

  async process(context?: ProcessingContext): Promise<LowPassFilterNodeOutputs> {
    const audio = this.audio;
    const cutoff = this.cutoff_frequency_hz;

    const bytes = await requireAudioBytes(audio, context);

    const output = await applyFilter(await decodeAudioToWav(bytes), {
      type: "lowpass",
      frequency: cutoff
    });

    return { output };
  }
}

/** Output handles HighShelfFilterNode.process() emits. */
type HighShelfFilterNodeOutputs = {
  output: AudioRef;
};

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
  declare audio: Record<string, unknown>;

  @prop({
    type: "float",
    default: 5000,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the shelf filter in Hz.",
    min: 1000,
    max: 20000
  })
  declare cutoff_frequency_hz: number;

  @prop({
    type: "float",
    default: 0,
    title: "Gain Db",
    description:
      "The gain to apply to the frequencies above the cutoff, in dB.",
    min: -24,
    max: 24
  })
  declare gain_db: number;

  async process(context?: ProcessingContext): Promise<HighShelfFilterNodeOutputs> {
    const audio = this.audio;
    const cutoff = this.cutoff_frequency_hz;
    const gainDb = this.gain_db;

    const bytes = await requireAudioBytes(audio, context);

    const output = await applyFilter(await decodeAudioToWav(bytes), {
      type: "highshelf",
      frequency: cutoff,
      gainDb
    });

    return { output };
  }
}

/** Output handles LowShelfFilterNode.process() emits. */
type LowShelfFilterNodeOutputs = {
  output: AudioRef;
};

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
  declare audio: Record<string, unknown>;

  @prop({
    type: "float",
    default: 200,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the shelf filter in Hz.",
    min: 20,
    max: 1000
  })
  declare cutoff_frequency_hz: number;

  @prop({
    type: "float",
    default: 0,
    title: "Gain Db",
    description:
      "The gain to apply to the frequencies below the cutoff, in dB.",
    min: -24,
    max: 24
  })
  declare gain_db: number;

  async process(context?: ProcessingContext): Promise<LowShelfFilterNodeOutputs> {
    const audio = this.audio;
    const cutoff = this.cutoff_frequency_hz;
    const gainDb = this.gain_db;

    const bytes = await requireAudioBytes(audio, context);

    const output = await applyFilter(await decodeAudioToWav(bytes), {
      type: "lowshelf",
      frequency: cutoff,
      gainDb
    });

    return { output };
  }
}

/** Output handles PeakFilterNode.process() emits. */
type PeakFilterNodeOutputs = {
  output: AudioRef;
};

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
  declare audio: Record<string, unknown>;

  @prop({
    type: "float",
    default: 1000,
    title: "Cutoff Frequency Hz",
    description: "The cutoff frequency of the band-pass filter in Hz.",
    min: 20,
    max: 20000
  })
  declare cutoff_frequency_hz: number;

  @prop({
    type: "float",
    default: 1,
    title: "Q Factor",
    description:
      "The Q factor, determining the width of the band. Higher values create narrower bands.",
    min: 0.1,
    max: 10
  })
  declare q_factor: number;

  @prop({
    type: "float",
    default: 0,
    title: "Gain Db",
    description:
      "The gain to apply at the centre frequency, in dB. Positive values boost, negative values cut.",
    min: -24,
    max: 24
  })
  declare gain_db: number;

  async process(context?: ProcessingContext): Promise<PeakFilterNodeOutputs> {
    const audio = this.audio;
    const cutoff = this.cutoff_frequency_hz;
    const q = this.q_factor;
    const gainDb = this.gain_db;

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
