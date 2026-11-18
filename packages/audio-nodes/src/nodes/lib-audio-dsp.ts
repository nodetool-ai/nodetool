import { GainProperties, DelayProperties, HighPassFilterProperties, LowPassFilterProperties, HighShelfFilterProperties, LowShelfFilterProperties, PeakFilterProperties } from "../lib/effect-properties.js";
import { GainEffect, DelayEffect, HighPassFilterEffect, LowPassFilterEffect, HighShelfFilterEffect, LowShelfFilterEffect, PeakFilterEffect } from "../lib/effect-descriptors.js";
import { applyToClip } from "../lib/signal-effect.js";
import { prop } from "@nodetool-ai/node-sdk";
import type { AudioRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import { loadKernels, type BiquadType } from "@nodetool-ai/kernels";
import {
  audioRefFromWav,
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


export class GainNode_ extends GainProperties {
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


  async process(context?: ProcessingContext): Promise<{ output: AudioRef }> {
    return { output: await applyToClip(GainEffect, this, this.audio, context) };
  }
}


export class DelayNode_ extends DelayProperties {
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




  async process(context?: ProcessingContext): Promise<{ output: AudioRef }> {
    return { output: await applyToClip(DelayEffect, this, this.audio, context) };
  }
}


export class HighPassFilterNode extends HighPassFilterProperties {
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


  async process(context?: ProcessingContext): Promise<{ output: AudioRef }> {
    return { output: await applyToClip(HighPassFilterEffect, this, this.audio, context) };
  }
}


export class LowPassFilterNode extends LowPassFilterProperties {
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


  async process(context?: ProcessingContext): Promise<{ output: AudioRef }> {
    return { output: await applyToClip(LowPassFilterEffect, this, this.audio, context) };
  }
}


export class HighShelfFilterNode extends HighShelfFilterProperties {
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



  async process(context?: ProcessingContext): Promise<{ output: AudioRef }> {
    return { output: await applyToClip(HighShelfFilterEffect, this, this.audio, context) };
  }
}


export class LowShelfFilterNode extends LowShelfFilterProperties {
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



  async process(context?: ProcessingContext): Promise<{ output: AudioRef }> {
    return { output: await applyToClip(LowShelfFilterEffect, this, this.audio, context) };
  }
}


export class PeakFilterNode extends PeakFilterProperties {
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




  async process(context?: ProcessingContext): Promise<{ output: AudioRef }> {
    return { output: await applyToClip(PeakFilterEffect, this, this.audio, context) };
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
