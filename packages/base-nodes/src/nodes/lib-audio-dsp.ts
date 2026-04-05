import { BaseNode, prop } from "@nodetool/node-sdk";
import type { AudioRef } from "@nodetool/node-sdk";

// ── WAV helpers (shared with lib-synthesis.ts pattern) ──────────────

function encodeWav(
  samples: Float32Array,
  sampleRate: number,
  numChannels = 1
): Uint8Array {
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 0x7fff), 44 + i * 2);
  }
  return new Uint8Array(buffer);
}

function audioRefFromWav(wav: Uint8Array): AudioRef {
  return { type: "audio", uri: "", data: Buffer.from(wav).toString("base64") };
}

interface WavData {
  samples: Float32Array;
  sampleRate: number;
  numChannels: number;
}

function decodeWav(audio: Record<string, unknown>): WavData {
  let rawData: Uint8Array;
  if (typeof audio.data === "string") {
    rawData = Uint8Array.from(Buffer.from(audio.data, "base64"));
  } else if (audio.data instanceof Uint8Array) {
    rawData = audio.data;
  } else {
    throw new Error("Invalid audio data");
  }

  const buf = Buffer.from(rawData);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.length < 44) {
    throw new Error("Invalid WAV file");
  }

  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  const numChannels = buf.readUInt16LE(22);

  let dataOffset = 36;
  while (dataOffset < buf.length - 8) {
    const chunkId = buf.toString("ascii", dataOffset, dataOffset + 4);
    const chunkSize = buf.readUInt32LE(dataOffset + 4);
    if (chunkId === "data") {
      dataOffset += 8;
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor((buf.length - dataOffset) / bytesPerSample);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const pos = dataOffset + i * bytesPerSample;
    if (bitsPerSample === 16) {
      samples[i] = buf.readInt16LE(pos) / 0x7fff;
    } else if (bitsPerSample === 8) {
      samples[i] = (buf.readUInt8(pos) - 128) / 128;
    }
  }

  return { samples, sampleRate, numChannels };
}

// ── Part B: Audio filter/effect nodes (node-web-audio-api) ─────────

async function processAudioWithEffect(
  audio: Record<string, unknown>,
  setupEffect: (ctx: any, source: any) => void,
  extraLength = 0
): Promise<Record<string, unknown>> {
  const { OfflineAudioContext } = await import("node-web-audio-api");
  const wav = decodeWav(audio);
  const frameSamples = Math.floor(wav.samples.length / wav.numChannels);
  const totalFrames = frameSamples + extraLength;

  const ctx = new OfflineAudioContext(
    wav.numChannels,
    totalFrames,
    wav.sampleRate
  );
  const buffer = ctx.createBuffer(
    wav.numChannels,
    frameSamples,
    wav.sampleRate
  );

  // Fill buffer channels
  for (let ch = 0; ch < wav.numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < frameSamples; i++) {
      channelData[i] = wav.samples[i * wav.numChannels + ch];
    }
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  setupEffect(ctx, source);
  source.start();

  const renderedBuffer = await ctx.startRendering();

  // Interleave channels back
  const outLength = renderedBuffer.length * wav.numChannels;
  const outSamples = new Float32Array(outLength);
  for (let ch = 0; ch < wav.numChannels; ch++) {
    const channelData = renderedBuffer.getChannelData(ch);
    for (let i = 0; i < renderedBuffer.length; i++) {
      outSamples[i * wav.numChannels + ch] = channelData[i];
    }
  }

  return audioRefFromWav(
    encodeWav(outSamples, wav.sampleRate, wav.numChannels)
  ) as unknown as Record<string, unknown>;
}

export class GainNode_ extends BaseNode {
  static readonly nodeType = "lib.audio.Gain";
  static readonly title = "Gain";
  static readonly description =
    "Applies a gain (volume adjustment) to an audio file.\n    audio, effect, volume\n\n    Use cases:\n    - Increase or decrease overall volume of audio\n    - Balance levels between different audio tracks\n    - Prepare audio for further processing";
  static readonly metadataOutputTypes = {
    output: "audio"
  };

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

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const gainDb = Number(this.gain_db ?? 0);

    if (!audio.data) return { output: audio };

    const output = await processAudioWithEffect(
      audio,
      (ctx: any, source: any) => {
        const gainNode = ctx.createGain();
        gainNode.gain.value = Math.pow(10, gainDb / 20);
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
      }
    );

    return { output };
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

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const delaySec = Number(this.delay_seconds ?? 0.5);
    const feedback = Number(this.feedback ?? 0.3);
    const mix = Number(this.mix ?? 0.5);

    if (!audio.data) return { output: audio };

    const wav = decodeWav(audio);
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

      // Apply delay with feedback
      for (let i = 0; i < outLength; i++) {
        const dryVal = i < frameSamples ? dry[i] : 0;
        const delayedVal = i >= delaySamples ? wet[i - delaySamples] : 0;
        wet[i] = dryVal + delayedVal * feedback;
      }

      // Mix dry and wet
      for (let i = 0; i < outLength; i++) {
        const dryVal = i < frameSamples ? dry[i] : 0;
        outSamples[i * wav.numChannels + ch] =
          dryVal * (1 - mix) + wet[i] * mix;
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

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const cutoff = Number(this.cutoff_frequency_hz ?? 80);

    if (!audio.data) return { output: audio };

    const output = await processAudioWithEffect(
      audio,
      (ctx: any, source: any) => {
        const filter = ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = cutoff;
        source.connect(filter);
        filter.connect(ctx.destination);
      }
    );

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

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const cutoff = Number(this.cutoff_frequency_hz ?? 5000);

    if (!audio.data) return { output: audio };

    const output = await processAudioWithEffect(
      audio,
      (ctx: any, source: any) => {
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = cutoff;
        source.connect(filter);
        filter.connect(ctx.destination);
      }
    );

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

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const cutoff = Number(this.cutoff_frequency_hz ?? 5000);
    const gainDb = Number(this.gain_db ?? 0);

    if (!audio.data) return { output: audio };

    const output = await processAudioWithEffect(
      audio,
      (ctx: any, source: any) => {
        const filter = ctx.createBiquadFilter();
        filter.type = "highshelf";
        filter.frequency.value = cutoff;
        filter.gain.value = gainDb;
        source.connect(filter);
        filter.connect(ctx.destination);
      }
    );

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

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const cutoff = Number(this.cutoff_frequency_hz ?? 200);
    const gainDb = Number(this.gain_db ?? 0);

    if (!audio.data) return { output: audio };

    const output = await processAudioWithEffect(
      audio,
      (ctx: any, source: any) => {
        const filter = ctx.createBiquadFilter();
        filter.type = "lowshelf";
        filter.frequency.value = cutoff;
        filter.gain.value = gainDb;
        source.connect(filter);
        filter.connect(ctx.destination);
      }
    );

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

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const cutoff = Number(this.cutoff_frequency_hz ?? 1000);
    const q = Number(this.q_factor ?? 1.0);

    if (!audio.data) return { output: audio };

    const output = await processAudioWithEffect(
      audio,
      (ctx: any, source: any) => {
        const filter = ctx.createBiquadFilter();
        filter.type = "peaking";
        filter.frequency.value = cutoff;
        filter.Q.value = q;
        filter.gain.value = 0;
        source.connect(filter);
        filter.connect(ctx.destination);
      }
    );

    return { output };
  }
}

export const LIB_AUDIO_DSP_NODES = [
  GainNode_,
  DelayNode_,
  HighPassFilterNode,
  LowPassFilterNode,
  HighShelfFilterNode,
  LowShelfFilterNode,
  PeakFilterNode
] as const;
