import { BitcrushProperties, CompressProperties, DistortionProperties, LimiterProperties, ReverbProperties, NoiseGateProperties, PhaserProperties } from "../lib/effect-properties.js";
import { BitcrushEffect, CompressEffect, DistortionEffect, LimiterEffect, ReverbEffect, NoiseGateEffect, PhaserEffect } from "../lib/effect-descriptors.js";
import { applyToClip } from "../lib/signal-effect.js";
import type { AudioRef } from "@nodetool-ai/protocol";
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import { importHidden } from "@nodetool-ai/config";
import {
  requireAudioBytes,
  audioRefFromWav,
  decodeAudioToWav,
  encodeWav
} from "../lib/audio-wav.js";

// ── Bitcrush ──────────────────────────────────────────────────────


export class BitcrushNode extends BitcrushProperties {
  static readonly nodeType = "lib.audio.Bitcrush";
  static readonly title = "Bitcrush";
  static readonly description =
    "Applies a bitcrushing effect to an audio file, reducing bit depth and/or sample rate.\n    audio, effect, distortion\n\n    Use cases:\n    - Create lo-fi or retro-style audio effects\n    - Simulate vintage digital audio equipment\n    - Add digital distortion and artifacts to sounds";
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
    return { output: await applyToClip(BitcrushEffect, this, this.audio, context) };
  }
}

// ── Compress ──────────────────────────────────────────────────────


export class CompressNode extends CompressProperties {
  static readonly nodeType = "lib.audio.Compress";
  static readonly title = "Compress";
  static readonly description =
    "Applies dynamic range compression to an audio file.\n    audio, effect, dynamics\n\n    Use cases:\n    - Even out volume levels in a recording\n    - Increase perceived loudness of audio\n    - Control peaks in audio signals";
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
    return { output: await applyToClip(CompressEffect, this, this.audio, context) };
  }
}

// ── Distortion ────────────────────────────────────────────────────


export class DistortionNode extends DistortionProperties {
  static readonly nodeType = "lib.audio.Distortion";
  static readonly title = "Distortion";
  static readonly description =
    "Applies a distortion effect to an audio file.\n    audio, effect, distortion\n\n    Use cases:\n    - Add grit and character to instruments\n    - Create aggressive sound effects\n    - Simulate overdriven amplifiers";
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
    return { output: await applyToClip(DistortionEffect, this, this.audio, context) };
  }
}

// ── Limiter ───────────────────────────────────────────────────────


export class LimiterNode extends LimiterProperties {
  static readonly nodeType = "lib.audio.Limiter";
  static readonly title = "Limiter";
  static readonly description =
    "Applies a limiter effect to an audio file.\n    audio, effect, dynamics\n\n    Use cases:\n    - Prevent audio clipping\n    - Increase perceived loudness without distortion\n    - Control dynamic range of audio";
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
    return { output: await applyToClip(LimiterEffect, this, this.audio, context) };
  }
}

// ── Reverb (Schroeder) ───────────────────────────────────────────


export class ReverbNode extends ReverbProperties {
  static readonly nodeType = "lib.audio.Reverb";
  static readonly title = "Reverb";
  static readonly description =
    "Applies a reverb effect to an audio file.\n    audio, effect, reverb\n\n    Use cases:\n    - Add spatial depth to dry recordings\n    - Simulate different room acoustics\n    - Create atmospheric sound effects";
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
    return { output: await applyToClip(ReverbEffect, this, this.audio, context) };
  }
}

// ── PitchShift (rubberband WASM) ─────────────────────────────────

type RubberbandModule = typeof import("@k13engineering/rubberband");

/**
 * Lazily load rubberband via a bundler-hidden import. The hidden import keeps
 * the native/WASM package out of the web bundle (this file is loaded in the
 * browser for its hybrid effects); the two nodes that need it stay
 * server-only and throw when invoked off Node.
 */
async function loadRubberband(): Promise<RubberbandModule> {
  const mod = await importHidden<RubberbandModule>(
    "@k13engineering/rubberband"
  );
  if (!mod) {
    throw new Error(
      "PitchShift/TimeStretch require Node (rubberband is not available in the browser)"
    );
  }
  return mod;
}

export class PitchShiftNode extends BaseNode {
  static readonly nodeType = "lib.audio.PitchShift";
  static readonly title = "Pitch Shift";
  static readonly description =
    "Shifts the pitch of an audio file without changing its duration.\n    audio, effect, pitch\n\n    Use cases:\n    - Transpose audio to a different key\n    - Create harmonies or vocal effects\n    - Adjust instrument tuning";
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
    title: "Semitones",
    description:
      "Number of semitones to shift the pitch. Positive values shift up, negative values shift down.",
    min: -12,
    max: 12
  })
  declare semitones: number;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const audio = this.audio;
    const semitones = this.semitones;

    if (semitones === 0) {
      return { output: audio };
    }
    const bytes = await requireAudioBytes(audio, context);

    const { createRubberbandWrapper } = await loadRubberband();
    const wav = await decodeAudioToWav(bytes);
    const { samples, sampleRate, numChannels } = wav;
    const frameSamples = Math.floor(samples.length / numChannels);

    const CHUNK_SIZE = 8192;
    const rb = createRubberbandWrapper({
      sampleRate,
      channelCount: numChannels,
      maxBufferSizeInFrames: CHUNK_SIZE,
      options: {
        processMode: "realtime",
        engineMode: "finer",
        pitchMode: "highquality"
      }
    });

    rb.requestPitchScale({ pitchScale: Math.pow(2, semitones / 12) });

    // Deinterleave into per-channel planes
    const planes: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const plane = new Float32Array(frameSamples);
      for (let i = 0; i < frameSamples; i++) {
        plane[i] = samples[i * numChannels + ch];
      }
      planes.push(plane);
    }

    // Process in chunks, collecting output
    const outputParts: Float32Array[][] = [];
    const collectAvailable = () => {
      let avail = rb.available();
      while (avail > 0) {
        const count = Math.min(avail, CHUNK_SIZE);
        outputParts.push(rb.retrieve({ sampleCount: count }).planes);
        avail = rb.available();
      }
    };

    for (let offset = 0; offset < frameSamples; offset += CHUNK_SIZE) {
      const end = Math.min(offset + CHUNK_SIZE, frameSamples);
      const chunkPlanes = planes.map((p) => p.slice(offset, end));
      rb.process({ audioData: { planes: chunkPlanes } });
      collectAvailable();
    }
    rb.end();
    collectAvailable();

    // Concatenate output per channel
    const totalOutFrames = outputParts.reduce(
      (s, p) => s + p[0].length,
      0
    );
    const outPlanes: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const plane = new Float32Array(totalOutFrames);
      let pos = 0;
      for (const part of outputParts) {
        plane.set(part[ch], pos);
        pos += part[ch].length;
      }
      outPlanes.push(plane);
    }

    // Trim processing latency — pitch shift preserves duration
    const latency = rb.latencyInSamples();
    const trimStart = Math.min(latency, totalOutFrames);
    const trimEnd = Math.min(trimStart + frameSamples, totalOutFrames);
    const outFrames = trimEnd - trimStart;

    // Re-interleave trimmed output
    const outSamples = new Float32Array(outFrames * numChannels);
    for (let i = 0; i < outFrames; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        outSamples[i * numChannels + ch] = outPlanes[ch][trimStart + i];
      }
    }

    return {
      output: audioRefFromWav(encodeWav(outSamples, sampleRate, numChannels))
    };
  }
}

// ── TimeStretch (rubberband WASM) ────────────────────────────────

export class TimeStretchNode extends BaseNode {
  static readonly nodeType = "lib.audio.TimeStretch";
  static readonly title = "Time Stretch";
  static readonly description =
    "Changes the speed of an audio file without altering its pitch.\n    audio, transform, time\n\n    Use cases:\n    - Adjust audio duration to fit video length\n    - Create slow-motion or fast-motion audio effects\n    - Synchronize audio tracks of different lengths";
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
    default: 1,
    title: "Rate",
    description: "Time stretch factor. Values > 1 speed up, < 1 slow down.",
    min: 0.5,
    max: 2
  })
  declare rate: number;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const audio = this.audio;
    const rate = this.rate;

    if (rate === 1.0) {
      return { output: audio };
    }
    const bytes = await requireAudioBytes(audio, context);

    const { createRubberbandWrapper } = await loadRubberband();
    const wav = await decodeAudioToWav(bytes);
    const { samples, sampleRate, numChannels } = wav;
    const frameSamples = Math.floor(samples.length / numChannels);

    const CHUNK_SIZE = 8192;
    const rb = createRubberbandWrapper({
      sampleRate,
      channelCount: numChannels,
      maxBufferSizeInFrames: CHUNK_SIZE,
      options: {
        processMode: "realtime",
        engineMode: "finer"
      }
    });

    // Rubber Band timeRatio = output_duration / input_duration
    // rate > 1 means faster (shorter output), so timeRatio = 1 / rate
    rb.requestTimeRatio({ timeRatio: 1 / rate });

    // Deinterleave into per-channel planes
    const planes: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const plane = new Float32Array(frameSamples);
      for (let i = 0; i < frameSamples; i++) {
        plane[i] = samples[i * numChannels + ch];
      }
      planes.push(plane);
    }

    // Process in chunks, collecting output
    const outputParts: Float32Array[][] = [];
    const collectAvailable = () => {
      let avail = rb.available();
      while (avail > 0) {
        const count = Math.min(avail, CHUNK_SIZE);
        outputParts.push(rb.retrieve({ sampleCount: count }).planes);
        avail = rb.available();
      }
    };

    for (let offset = 0; offset < frameSamples; offset += CHUNK_SIZE) {
      const end = Math.min(offset + CHUNK_SIZE, frameSamples);
      const chunkPlanes = planes.map((p) => p.slice(offset, end));
      rb.process({ audioData: { planes: chunkPlanes } });
      collectAvailable();
    }
    rb.end();
    collectAvailable();

    // Concatenate output per channel
    const totalOutFrames = outputParts.reduce(
      (s, p) => s + p[0].length,
      0
    );
    const outPlanes: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const plane = new Float32Array(totalOutFrames);
      let pos = 0;
      for (const part of outputParts) {
        plane.set(part[ch], pos);
        pos += part[ch].length;
      }
      outPlanes.push(plane);
    }

    // Trim processing latency — expected output = input / rate
    const latency = rb.latencyInSamples();
    const expectedFrames = Math.round(frameSamples / rate);
    const trimStart = Math.min(latency, totalOutFrames);
    const trimEnd = Math.min(trimStart + expectedFrames, totalOutFrames);
    const outFrames = trimEnd - trimStart;

    // Re-interleave trimmed output
    const outSamples = new Float32Array(outFrames * numChannels);
    for (let i = 0; i < outFrames; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        outSamples[i * numChannels + ch] = outPlanes[ch][trimStart + i];
      }
    }

    return {
      output: audioRefFromWav(encodeWav(outSamples, sampleRate, numChannels))
    };
  }
}

// ── NoiseGate ─────────────────────────────────────────────────────


export class NoiseGateNode extends NoiseGateProperties {
  static readonly nodeType = "lib.audio.NoiseGate";
  static readonly title = "Noise Gate";
  static readonly description =
    "Applies a noise gate effect to an audio file.\n    audio, effect, dynamics\n\n    Use cases:\n    - Reduce background noise in recordings\n    - Clean up audio tracks with unwanted low-level sounds\n    - Create rhythmic effects by gating sustained sounds";
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
    return { output: await applyToClip(NoiseGateEffect, this, this.audio, context) };
  }
}

// ── Phaser ────────────────────────────────────────────────────────


export class PhaserNode extends PhaserProperties {
  static readonly nodeType = "lib.audio.Phaser";
  static readonly title = "Phaser";
  static readonly description =
    "Applies a phaser effect to an audio file.\n    audio, effect, modulation\n\n    Use cases:\n    - Create sweeping, swooshing sounds\n    - Add movement to static sounds\n    - Produce psychedelic or space-like effects";
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
    return { output: await applyToClip(PhaserEffect, this, this.audio, context) };
  }
}

// ── Export ────────────────────────────────────────────────────────

/**
 * All pedalboard effects run on the server. They decode the input audio to PCM
 * (WAV directly, or mp3/flac/… via WebAudio `decodeAudioData`), which needs
 * Node's `node-web-audio-api`; the rubberband-backed nodes additionally use a
 * native/WASM addon that only loads on Node.
 */
export const LIB_AUDIO_EFFECTS_NODES = tagAsServer([
  BitcrushNode,
  CompressNode,
  DistortionNode,
  LimiterNode,
  ReverbNode,
  NoiseGateNode,
  PhaserNode,
  PitchShiftNode,
  TimeStretchNode
]);

export const LIB_PEDALBOARD_EXTRA_NODES = LIB_AUDIO_EFFECTS_NODES;
