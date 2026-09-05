import type { AudioRef } from "@nodetool-ai/protocol";
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import { importHidden } from "@nodetool-ai/config";
import {
  requireAudioBytes,
  audioRefFromWav,
  decodeAudioToWav,
  encodeWav,
  type WavData
} from "../lib/audio-wav.js";

// ── DSP helpers ────────────────────────────────────────────────────

function processPerChannel(
  wav: WavData,
  fn: (channel: Float32Array, sampleRate: number) => Float32Array
) {
  const { samples, sampleRate, numChannels } = wav;
  const frameSamples = Math.floor(samples.length / numChannels);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = new Float32Array(frameSamples);
    for (let i = 0; i < frameSamples; i++) {
      channelData[i] = samples[i * numChannels + ch];
    }
    channels.push(fn(channelData, sampleRate));
  }

  const outFrames = channels[0].length;
  const outSamples = new Float32Array(outFrames * numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    for (let i = 0; i < outFrames; i++) {
      outSamples[i * numChannels + ch] = channels[ch][i];
    }
  }

  return { samples: outSamples, sampleRate, numChannels };
}

// ── Bitcrush ──────────────────────────────────────────────────────

/** Output handles BitcrushNode.process() emits. */
type BitcrushNodeOutputs = {
  output: AudioRef;
};

export class BitcrushNode extends BaseNode {
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

  @prop({
    type: "int",
    default: 8,
    title: "Bit Depth",
    description:
      "The bit depth to reduce the audio to. Lower values create more distortion.",
    min: 1,
    max: 16
  })
  declare bit_depth: number;

  @prop({
    type: "int",
    default: 1,
    title: "Sample Rate Reduction",
    description:
      "Factor by which to reduce the sample rate. Higher values create more aliasing.",
    min: 1,
    max: 100
  })
  declare sample_rate_reduction: number;

  async process(context?: ProcessingContext): Promise<BitcrushNodeOutputs> {
    const audio = this.audio;
    const bitDepth = this.bit_depth;
    const srrFactor = this.sample_rate_reduction;

    const bytes = await requireAudioBytes(audio, context);

    const wav = await decodeAudioToWav(bytes);
    const result = processPerChannel(wav, (ch) => {
      // Number of quantization steps for the target bit depth. Guard against
      // bitDepth === 1 (the prop minimum), which would otherwise yield 0 and
      // produce NaN samples via division by zero.
      const levels = Math.max(1, Math.pow(2, bitDepth) - 1);
      const out = new Float32Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        const idx = Math.floor(i / srrFactor) * srrFactor;
        const srcIdx = Math.min(idx, ch.length - 1);
        out[i] = Math.round(ch[srcIdx] * levels) / levels;
      }
      return out;
    });

    return {
      output: audioRefFromWav(
        encodeWav(result.samples, result.sampleRate, result.numChannels)
      )
    };
  }
}

// ── Compress ──────────────────────────────────────────────────────

/** Output handles CompressNode.process() emits. */
type CompressNodeOutputs = {
  output: AudioRef;
};

export class CompressNode extends BaseNode {
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

  @prop({
    type: "float",
    default: -20,
    title: "Threshold",
    description: "Threshold in dB above which compression is applied.",
    min: -60,
    max: 0
  })
  declare threshold: number;

  @prop({
    type: "float",
    default: 4,
    title: "Ratio",
    description: "Compression ratio. Higher values result in more compression.",
    min: 1,
    max: 20
  })
  declare ratio: number;

  @prop({
    type: "float",
    default: 5,
    title: "Attack",
    description: "Attack time in milliseconds.",
    min: 0.1,
    max: 100
  })
  declare attack: number;

  @prop({
    type: "float",
    default: 50,
    title: "Release",
    description: "Release time in milliseconds.",
    min: 5,
    max: 1000
  })
  declare release: number;

  @prop({
    type: "bool",
    default: true,
    title: "Auto Gain",
    description:
      "Apply automatic makeup gain to compensate for the level lost to compression, keeping the output roughly as loud as the input."
  })
  declare auto_gain: boolean;

  async process(context?: ProcessingContext): Promise<CompressNodeOutputs> {
    const audio = this.audio;
    const thresholdDb = this.threshold;
    const ratio = this.ratio;
    const attackMs = this.attack;
    const releaseMs = this.release;
    const autoGain = this.auto_gain;

    const bytes = await requireAudioBytes(audio, context);

    // Makeup gain: half of the reduction a 0 dBFS peak would receive — the
    // usual "auto" heuristic. It restores most of the loudness lost to
    // compression while staying clear of clipping the way full compensation
    // (referenced to 0 dBFS) would on under-compressed transients.
    const makeupDb = autoGain ? (-thresholdDb * (1 - 1 / ratio)) / 2 : 0;
    const makeup = Math.pow(10, makeupDb / 20);

    const wav = await decodeAudioToWav(bytes);
    const result = processPerChannel(wav, (ch, sr) => {
      const out = new Float32Array(ch.length);
      const attackCoeff = Math.exp(-1 / ((sr * attackMs) / 1000));
      const releaseCoeff = Math.exp(-1 / ((sr * releaseMs) / 1000));
      const thresholdLin = Math.pow(10, thresholdDb / 20);

      let envelope = 0;
      for (let i = 0; i < ch.length; i++) {
        const absVal = Math.abs(ch[i]);
        if (absVal > envelope) {
          envelope = attackCoeff * envelope + (1 - attackCoeff) * absVal;
        } else {
          envelope = releaseCoeff * envelope + (1 - releaseCoeff) * absVal;
        }

        if (envelope > thresholdLin) {
          const dbOver = 20 * Math.log10(envelope / thresholdLin);
          const dbReduction = dbOver * (1 - 1 / ratio);
          const gainReduction = Math.pow(10, -dbReduction / 20);
          out[i] = ch[i] * gainReduction * makeup;
        } else {
          out[i] = ch[i] * makeup;
        }
      }
      return out;
    });

    return {
      output: audioRefFromWav(
        encodeWav(result.samples, result.sampleRate, result.numChannels)
      )
    };
  }
}

// ── Distortion ────────────────────────────────────────────────────

/** Output handles DistortionNode.process() emits. */
type DistortionNodeOutputs = {
  output: AudioRef;
};

export class DistortionNode extends BaseNode {
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

  @prop({
    type: "float",
    default: 25,
    title: "Drive Db",
    description: "Amount of distortion to apply in decibels.",
    min: 0,
    max: 100
  })
  declare drive_db: number;

  async process(context?: ProcessingContext): Promise<DistortionNodeOutputs> {
    const audio = this.audio;
    const driveDb = this.drive_db;

    const bytes = await requireAudioBytes(audio, context);

    const wav = await decodeAudioToWav(bytes);
    const drive = Math.pow(10, driveDb / 20);
    const result = processPerChannel(wav, (ch) => {
      const out = new Float32Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        const driven = ch[i] * drive;
        out[i] = (2 / Math.PI) * Math.atan(driven);
      }
      return out;
    });

    return {
      output: audioRefFromWav(
        encodeWav(result.samples, result.sampleRate, result.numChannels)
      )
    };
  }
}

// ── Limiter ───────────────────────────────────────────────────────

/** Output handles LimiterNode.process() emits. */
type LimiterNodeOutputs = {
  output: AudioRef;
};

export class LimiterNode extends BaseNode {
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

  @prop({
    type: "float",
    default: -2,
    title: "Threshold Db",
    description: "Threshold in dB above which the limiter is applied.",
    min: -60,
    max: 0
  })
  declare threshold_db: number;

  @prop({
    type: "float",
    default: 250,
    title: "Release Ms",
    description: "Release time in milliseconds.",
    min: 1,
    max: 1000
  })
  declare release_ms: number;

  @prop({
    type: "bool",
    default: true,
    title: "Auto Gain",
    description:
      "Apply automatic makeup gain so the limited peaks reach 0 dBFS, turning the headroom below the ceiling into added loudness (maximizer behaviour)."
  })
  declare auto_gain: boolean;

  async process(context?: ProcessingContext): Promise<LimiterNodeOutputs> {
    const audio = this.audio;
    const thresholdDb = this.threshold_db;
    const releaseMs = this.release_ms;
    const autoGain = this.auto_gain;

    const bytes = await requireAudioBytes(audio, context);

    const wav = await decodeAudioToWav(bytes);
    const threshold = Math.pow(10, thresholdDb / 20);
    // Makeup gain brings the ceiling up to 0 dBFS. Limited peaks sit at
    // `threshold`, so scaling by 1/threshold normalizes them to full scale
    // without pushing past it.
    const makeup = autoGain ? 1 / threshold : 1;
    const result = processPerChannel(wav, (ch, sr) => {
      const out = new Float32Array(ch.length);
      const releaseCoeff = Math.exp(-1 / ((sr * releaseMs) / 1000));
      let gainReduction = 1;

      for (let i = 0; i < ch.length; i++) {
        const absVal = Math.abs(ch[i]);
        if (absVal > threshold) {
          const targetGain = threshold / absVal;
          if (targetGain < gainReduction) {
            gainReduction = targetGain;
          }
        } else {
          gainReduction =
            releaseCoeff * gainReduction + (1 - releaseCoeff) * 1.0;
        }
        out[i] = ch[i] * gainReduction * makeup;
      }
      return out;
    });

    return {
      output: audioRefFromWav(
        encodeWav(result.samples, result.sampleRate, result.numChannels)
      )
    };
  }
}

// ── Reverb (Schroeder) ───────────────────────────────────────────

/** Output handles ReverbNode.process() emits. */
type ReverbNodeOutputs = {
  output: AudioRef;
};

export class ReverbNode extends BaseNode {
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

  @prop({
    type: "float",
    default: 0.5,
    title: "Room Scale",
    description:
      "Size of the simulated room. Higher values create larger spaces.",
    min: 0,
    max: 1
  })
  declare room_scale: number;

  @prop({
    type: "float",
    default: 0.5,
    title: "Damping",
    description:
      "Amount of high frequency absorption. Higher values create a duller sound.",
    min: 0,
    max: 1
  })
  declare damping: number;

  @prop({
    type: "float",
    default: 0.15,
    title: "Wet Level",
    description: "Level of the reverb effect in the output.",
    min: 0,
    max: 1
  })
  declare wet_level: number;

  @prop({
    type: "float",
    default: 0.5,
    title: "Dry Level",
    description: "Level of the original signal in the output.",
    min: 0,
    max: 1
  })
  declare dry_level: number;

  async process(context?: ProcessingContext): Promise<ReverbNodeOutputs> {
    const audio = this.audio;
    const roomScale = this.room_scale;
    const damping = this.damping;
    const wetLevel = this.wet_level;
    const dryLevel = this.dry_level;

    const bytes = await requireAudioBytes(audio, context);

    const wav = await decodeAudioToWav(bytes);
    const result = processPerChannel(wav, (ch, sr) => {
      // Schroeder reverb: 4 parallel comb filters -> 2 series allpass filters
      const baseCombDelays = [1557, 1617, 1491, 1422];
      const baseAllpassDelays = [225, 556];
      const scale = sr / 44100;

      // Comb filter
      function combFilter(
        input: Float32Array,
        delaySamples: number,
        feedback: number,
        damp: number
      ): Float32Array {
        const out = new Float32Array(input.length);
        const buf = new Float32Array(delaySamples);
        let bufIdx = 0;
        let filterStore = 0;

        for (let i = 0; i < input.length; i++) {
          const delayed = buf[bufIdx];
          filterStore = delayed * (1 - damp) + filterStore * damp;
          buf[bufIdx] = input[i] + filterStore * feedback;
          out[i] = delayed;
          bufIdx = (bufIdx + 1) % delaySamples;
        }
        return out;
      }

      // Allpass filter
      function allpassFilter(
        input: Float32Array,
        delaySamples: number,
        feedback: number
      ): Float32Array {
        const out = new Float32Array(input.length);
        const buf = new Float32Array(delaySamples);
        let bufIdx = 0;

        for (let i = 0; i < input.length; i++) {
          const delayed = buf[bufIdx];
          buf[bufIdx] = input[i] + delayed * feedback;
          out[i] = delayed - input[i] * feedback;
          bufIdx = (bufIdx + 1) % delaySamples;
        }
        return out;
      }

      const feedback = roomScale * 0.28 + 0.7;

      // Sum comb filters
      const combOut = new Float32Array(ch.length);
      for (const baseDelay of baseCombDelays) {
        const delay = Math.round(baseDelay * scale);
        const filtered = combFilter(ch, delay, feedback, damping);
        for (let i = 0; i < ch.length; i++) {
          combOut[i] += filtered[i];
        }
      }

      // Series allpass filters
      let apOut: Float32Array = combOut;
      for (const baseDelay of baseAllpassDelays) {
        const delay = Math.round(baseDelay * scale);
        apOut = allpassFilter(apOut, delay, 0.5);
      }

      // Mix dry/wet
      const out = new Float32Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        out[i] = ch[i] * dryLevel + apOut[i] * wetLevel;
      }
      return out;
    });

    return {
      output: audioRefFromWav(
        encodeWav(result.samples, result.sampleRate, result.numChannels)
      )
    };
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

/** Output handles NoiseGateNode.process() emits. */
type NoiseGateNodeOutputs = {
  output: AudioRef;
};

export class NoiseGateNode extends BaseNode {
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

  @prop({
    type: "float",
    default: -50,
    title: "Threshold Db",
    description: "Threshold in dB below which the gate is active.",
    min: -90,
    max: 0
  })
  declare threshold_db: number;

  @prop({
    type: "float",
    default: 1,
    title: "Attack Ms",
    description: "Attack time in milliseconds.",
    min: 0.1,
    max: 100
  })
  declare attack_ms: number;

  @prop({
    type: "float",
    default: 100,
    title: "Release Ms",
    description: "Release time in milliseconds.",
    min: 5,
    max: 1000
  })
  declare release_ms: number;

  async process(context?: ProcessingContext): Promise<NoiseGateNodeOutputs> {
    const audio = this.audio;
    const thresholdDb = this.threshold_db;
    const attackMs = Math.max(0.1, this.attack_ms);
    const releaseMs = Math.max(1, this.release_ms);

    const bytes = await requireAudioBytes(audio, context);

    const wav = await decodeAudioToWav(bytes);
    const thresholdLin = Math.pow(10, thresholdDb / 20);

    const result = processPerChannel(wav, (ch, sr) => {
      const out = new Float32Array(ch.length);
      const attackCoeff = Math.exp(-1 / ((sr * attackMs) / 1000));
      const releaseCoeff = Math.exp(-1 / ((sr * releaseMs) / 1000));
      let envelope = 0;
      let gain = 0;

      for (let i = 0; i < ch.length; i++) {
        const absVal = Math.abs(ch[i]);
        // Envelope follower: fast attack, slow release
        if (absVal > envelope) {
          envelope = attackCoeff * envelope + (1 - attackCoeff) * absVal;
        } else {
          envelope = releaseCoeff * envelope + (1 - releaseCoeff) * absVal;
        }
        // Gate: open when above threshold, close when below. Smooth the gain
        // toward the target using the attack coefficient while opening and the
        // release coefficient while closing, so both controls take effect.
        const targetGain = envelope >= thresholdLin ? 1 : 0;
        const coeff = targetGain > gain ? attackCoeff : releaseCoeff;
        gain = coeff * gain + (1 - coeff) * targetGain;
        out[i] = ch[i] * gain;
      }
      return out;
    });

    return {
      output: audioRefFromWav(
        encodeWav(result.samples, result.sampleRate, result.numChannels)
      )
    };
  }
}

// ── Phaser ────────────────────────────────────────────────────────

/** Output handles PhaserNode.process() emits. */
type PhaserNodeOutputs = {
  output: AudioRef;
};

export class PhaserNode extends BaseNode {
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

  @prop({
    type: "float",
    default: 1,
    title: "Rate Hz",
    description: "Rate of the phaser effect in Hz.",
    min: 0.1,
    max: 10
  })
  declare rate_hz: number;

  @prop({
    type: "float",
    default: 0.5,
    title: "Depth",
    description: "Depth of the phaser effect.",
    min: 0,
    max: 1
  })
  declare depth: number;

  @prop({
    type: "float",
    default: 1300,
    title: "Centre Frequency Hz",
    description: "Centre frequency of the phaser in Hz.",
    min: 100,
    max: 5000
  })
  declare centre_frequency_hz: number;

  @prop({
    type: "float",
    default: 0,
    title: "Feedback",
    description:
      "Feedback of the phaser effect. Negative values invert the phase.",
    min: -1,
    max: 1
  })
  declare feedback: number;

  @prop({
    type: "float",
    default: 0.5,
    title: "Mix",
    description: "Mix between the dry (original) and wet (effected) signals.",
    min: 0,
    max: 1
  })
  declare mix: number;

  async process(context?: ProcessingContext): Promise<PhaserNodeOutputs> {
    const audio = this.audio;
    const rateHz = this.rate_hz;
    const depth = this.depth;
    const centreFreqHz = this.centre_frequency_hz;
    const feedback = this.feedback;
    const mix = this.mix;

    const bytes = await requireAudioBytes(audio, context);

    const wav = await decodeAudioToWav(bytes);
    const result = processPerChannel(wav, (ch, sr) => {
      const out = new Float32Array(ch.length);
      // 4-stage first-order all-pass phaser
      const numStages = 4;
      // Delay buffers: x[n-1] and y[n-1] for each stage
      const xPrev = new Float32Array(numStages);
      const yPrev = new Float32Array(numStages);
      // Feedback delay
      let feedbackSample = 0;
      let lfoPhase = 0;
      const lfoIncrement = (2 * Math.PI * rateHz) / sr;

      for (let i = 0; i < ch.length; i++) {
        // LFO modulates centre frequency
        const lfo = Math.sin(lfoPhase) * depth;
        lfoPhase += lfoIncrement;
        if (lfoPhase > 2 * Math.PI) lfoPhase -= 2 * Math.PI;

        // Modulated frequency (centre ± depth range)
        const modFreq = Math.max(
          20,
          Math.min(sr / 2 - 1, centreFreqHz * (1 + lfo))
        );
        const tanVal = Math.tan((Math.PI * modFreq) / sr);
        const a = (tanVal - 1) / (tanVal + 1);

        // Input with feedback
        const signal = ch[i] + feedbackSample * feedback;

        // Apply all-pass filter stages
        let apOut = signal;
        for (let s = 0; s < numStages; s++) {
          const newOut = a * apOut + xPrev[s] - a * yPrev[s];
          xPrev[s] = apOut;
          yPrev[s] = newOut;
          apOut = newOut;
        }
        feedbackSample = apOut;

        // Mix dry and wet
        out[i] = ch[i] * (1 - mix) + apOut * mix;
      }
      return out;
    });

    return {
      output: audioRefFromWav(
        encodeWav(result.samples, result.sampleRate, result.numChannels)
      )
    };
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
