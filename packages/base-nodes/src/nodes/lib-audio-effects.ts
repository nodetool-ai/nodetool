import { BaseNode, prop } from "@nodetool/node-sdk";
import type { AudioRef } from "@nodetool/node-sdk";

// ── WAV helpers (duplicated from lib-audio-dsp.ts) ─────────────────

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
  buffer.writeUInt16LE(1, 20);
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

// ── DSP helpers ────────────────────────────────────────────────────

function processPerChannel(
  wav: WavData,
  fn: (channel: Float32Array, sampleRate: number) => Float32Array
): { samples: Float32Array; sampleRate: number; numChannels: number } {
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

export class BitcrushNode extends BaseNode {
  static readonly nodeType = "lib.audio.Bitcrush";
  static readonly title = "Bitcrush";
  static readonly description =
    "Applies a bitcrushing effect to an audio file, reducing bit depth and/or sample rate.\n    audio, effect, distortion\n\n    Use cases:\n    - Create lo-fi or retro-style audio effects\n    - Simulate vintage digital audio equipment\n    - Add digital distortion and artifacts to sounds";
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
    type: "int",
    default: 8,
    title: "Bit Depth",
    description:
      "The bit depth to reduce the audio to. Lower values create more distortion.",
    min: 1,
    max: 16
  })
  declare bit_depth: any;

  @prop({
    type: "int",
    default: 1,
    title: "Sample Rate Reduction",
    description:
      "Factor by which to reduce the sample rate. Higher values create more aliasing.",
    min: 1,
    max: 100
  })
  declare sample_rate_reduction: any;

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const bitDepth = Number(this.bit_depth ?? 8);
    const srrFactor = Number(this.sample_rate_reduction ?? 1);

    if (!audio.data) return { output: audio };

    const wav = decodeWav(audio);
    const result = processPerChannel(wav, (ch) => {
      const levels = Math.pow(2, bitDepth - 1) - 1;
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

export class CompressNode extends BaseNode {
  static readonly nodeType = "lib.audio.Compress";
  static readonly title = "Compress";
  static readonly description =
    "Applies dynamic range compression to an audio file.\n    audio, effect, dynamics\n\n    Use cases:\n    - Even out volume levels in a recording\n    - Increase perceived loudness of audio\n    - Control peaks in audio signals";
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
    default: -20,
    title: "Threshold",
    description: "Threshold in dB above which compression is applied.",
    min: -60,
    max: 0
  })
  declare threshold: any;

  @prop({
    type: "float",
    default: 4,
    title: "Ratio",
    description: "Compression ratio. Higher values result in more compression.",
    min: 1,
    max: 20
  })
  declare ratio: any;

  @prop({
    type: "float",
    default: 5,
    title: "Attack",
    description: "Attack time in milliseconds.",
    min: 0.1,
    max: 100
  })
  declare attack: any;

  @prop({
    type: "float",
    default: 50,
    title: "Release",
    description: "Release time in milliseconds.",
    min: 5,
    max: 1000
  })
  declare release: any;

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const thresholdDb = Number(this.threshold ?? -20);
    const ratio = Number(this.ratio ?? 4);
    const attackMs = Number(this.attack ?? 5);
    const releaseMs = Number(this.release ?? 50);

    if (!audio.data) return { output: audio };

    const wav = decodeWav(audio);
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
          out[i] = ch[i] * gainReduction;
        } else {
          out[i] = ch[i];
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

export class DistortionNode extends BaseNode {
  static readonly nodeType = "lib.audio.Distortion";
  static readonly title = "Distortion";
  static readonly description =
    "Applies a distortion effect to an audio file.\n    audio, effect, distortion\n\n    Use cases:\n    - Add grit and character to instruments\n    - Create aggressive sound effects\n    - Simulate overdriven amplifiers";
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
    default: 25,
    title: "Drive Db",
    description: "Amount of distortion to apply in decibels.",
    min: 0,
    max: 100
  })
  declare drive_db: any;

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const driveDb = Number(this.drive_db ?? 25);

    if (!audio.data) return { output: audio };

    const wav = decodeWav(audio);
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

export class LimiterNode extends BaseNode {
  static readonly nodeType = "lib.audio.Limiter";
  static readonly title = "Limiter";
  static readonly description =
    "Applies a limiter effect to an audio file.\n    audio, effect, dynamics\n\n    Use cases:\n    - Prevent audio clipping\n    - Increase perceived loudness without distortion\n    - Control dynamic range of audio";
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
    default: -2,
    title: "Threshold Db",
    description: "Threshold in dB above which the limiter is applied.",
    min: -60,
    max: 0
  })
  declare threshold_db: any;

  @prop({
    type: "float",
    default: 250,
    title: "Release Ms",
    description: "Release time in milliseconds.",
    min: 1,
    max: 1000
  })
  declare release_ms: any;

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const thresholdDb = Number(this.threshold_db ?? -2);
    const releaseMs = Number(this.release_ms ?? 250);

    if (!audio.data) return { output: audio };

    const wav = decodeWav(audio);
    const threshold = Math.pow(10, thresholdDb / 20);
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
        out[i] = ch[i] * gainReduction;
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

export class ReverbNode extends BaseNode {
  static readonly nodeType = "lib.audio.Reverb";
  static readonly title = "Reverb";
  static readonly description =
    "Applies a reverb effect to an audio file.\n    audio, effect, reverb\n\n    Use cases:\n    - Add spatial depth to dry recordings\n    - Simulate different room acoustics\n    - Create atmospheric sound effects";
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
    title: "Room Scale",
    description:
      "Size of the simulated room. Higher values create larger spaces.",
    min: 0,
    max: 1
  })
  declare room_scale: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Damping",
    description:
      "Amount of high frequency absorption. Higher values create a duller sound.",
    min: 0,
    max: 1
  })
  declare damping: any;

  @prop({
    type: "float",
    default: 0.15,
    title: "Wet Level",
    description: "Level of the reverb effect in the output.",
    min: 0,
    max: 1
  })
  declare wet_level: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Dry Level",
    description: "Level of the original signal in the output.",
    min: 0,
    max: 1
  })
  declare dry_level: any;

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const roomScale = Number(this.room_scale ?? 0.5);
    const damping = Number(this.damping ?? 0.5);
    const wetLevel = Number(this.wet_level ?? 0.15);
    const dryLevel = Number(this.dry_level ?? 0.5);

    if (!audio.data) return { output: audio };

    const wav = decodeWav(audio);
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

// ── PitchShift (soundtouchjs) ────────────────────────────────────

export class PitchShiftNode extends BaseNode {
  static readonly nodeType = "lib.audio.PitchShift";
  static readonly title = "Pitch Shift";
  static readonly description =
    "Shifts the pitch of an audio file without changing its duration.\n    audio, effect, pitch\n\n    Use cases:\n    - Transpose audio to a different key\n    - Create harmonies or vocal effects\n    - Adjust instrument tuning";
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
    title: "Semitones",
    description:
      "Number of semitones to shift the pitch. Positive values shift up, negative values shift down.",
    min: -12,
    max: 12
  })
  declare semitones: any;

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const semitones = Number(this.semitones ?? 0);

    if (!audio.data) return { output: audio };
    if (semitones === 0) {
      return { output: audio };
    }

    const { SoundTouch } = await import("soundtouchjs");
    const wav = decodeWav(audio);
    const { samples, sampleRate, numChannels } = wav;
    const frameSamples = Math.floor(samples.length / numChannels);

    // SoundTouch works with stereo interleaved samples
    // Convert to stereo interleaved if mono
    let stereoInput: Float32Array;
    if (numChannels === 1) {
      stereoInput = new Float32Array(frameSamples * 2);
      for (let i = 0; i < frameSamples; i++) {
        stereoInput[i * 2] = samples[i];
        stereoInput[i * 2 + 1] = samples[i];
      }
    } else if (numChannels === 2) {
      stereoInput = samples;
    } else {
      // For >2 channels, just take first two
      stereoInput = new Float32Array(frameSamples * 2);
      for (let i = 0; i < frameSamples; i++) {
        stereoInput[i * 2] = samples[i * numChannels];
        stereoInput[i * 2 + 1] = samples[i * numChannels + 1];
      }
    }

    const st = new SoundTouch();
    st.sampleRate = sampleRate;
    st.pitchSemitones = semitones;

    // Feed in chunks
    const chunkSize = 4096;
    for (let offset = 0; offset < frameSamples; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, frameSamples);
      const chunk = stereoInput.slice(offset * 2, end * 2);
      st.inputBuffer.putSamples(chunk, 0, end - offset);
      st.process();
    }

    // Flush remaining
    st.inputBuffer.putSamples(new Float32Array(0), 0, 0);
    st.process();

    const available = st.outputBuffer.frameCount;
    const stereoOutput = new Float32Array(available * 2);
    st.outputBuffer.receiveSamples(stereoOutput, available);

    // Convert back to original channel count
    let outSamples: Float32Array;
    if (numChannels === 1) {
      outSamples = new Float32Array(available);
      for (let i = 0; i < available; i++) {
        outSamples[i] = (stereoOutput[i * 2] + stereoOutput[i * 2 + 1]) / 2;
      }
    } else {
      outSamples = new Float32Array(available * numChannels);
      for (let i = 0; i < available; i++) {
        outSamples[i * numChannels] = stereoOutput[i * 2];
        outSamples[i * numChannels + 1] = stereoOutput[i * 2 + 1];
        for (let ch = 2; ch < numChannels; ch++) {
          outSamples[i * numChannels + ch] = 0;
        }
      }
    }

    return {
      output: audioRefFromWav(encodeWav(outSamples, sampleRate, numChannels))
    };
  }
}

// ── TimeStretch (soundtouchjs) ───────────────────────────────────

export class TimeStretchNode extends BaseNode {
  static readonly nodeType = "lib.audio.TimeStretch";
  static readonly title = "Time Stretch";
  static readonly description =
    "Changes the speed of an audio file without altering its pitch.\n    audio, transform, time\n\n    Use cases:\n    - Adjust audio duration to fit video length\n    - Create slow-motion or fast-motion audio effects\n    - Synchronize audio tracks of different lengths";
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
    default: 1,
    title: "Rate",
    description: "Time stretch factor. Values > 1 speed up, < 1 slow down.",
    min: 0.5,
    max: 2
  })
  declare rate: any;

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const rate = Number(this.rate ?? 1.0);

    if (!audio.data) return { output: audio };
    if (rate === 1.0) {
      return { output: audio };
    }

    const { SoundTouch } = await import("soundtouchjs");
    const wav = decodeWav(audio);
    const { samples, sampleRate, numChannels } = wav;
    const frameSamples = Math.floor(samples.length / numChannels);

    let stereoInput: Float32Array;
    if (numChannels === 1) {
      stereoInput = new Float32Array(frameSamples * 2);
      for (let i = 0; i < frameSamples; i++) {
        stereoInput[i * 2] = samples[i];
        stereoInput[i * 2 + 1] = samples[i];
      }
    } else if (numChannels === 2) {
      stereoInput = samples;
    } else {
      stereoInput = new Float32Array(frameSamples * 2);
      for (let i = 0; i < frameSamples; i++) {
        stereoInput[i * 2] = samples[i * numChannels];
        stereoInput[i * 2 + 1] = samples[i * numChannels + 1];
      }
    }

    const st = new SoundTouch();
    st.sampleRate = sampleRate;
    st.tempo = rate;

    const chunkSize = 4096;
    for (let offset = 0; offset < frameSamples; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, frameSamples);
      const chunk = stereoInput.slice(offset * 2, end * 2);
      st.inputBuffer.putSamples(chunk, 0, end - offset);
      st.process();
    }

    st.inputBuffer.putSamples(new Float32Array(0), 0, 0);
    st.process();

    const available = st.outputBuffer.frameCount;
    const stereoOutput = new Float32Array(available * 2);
    st.outputBuffer.receiveSamples(stereoOutput, available);

    let outSamples: Float32Array;
    if (numChannels === 1) {
      outSamples = new Float32Array(available);
      for (let i = 0; i < available; i++) {
        outSamples[i] = (stereoOutput[i * 2] + stereoOutput[i * 2 + 1]) / 2;
      }
    } else {
      outSamples = new Float32Array(available * numChannels);
      for (let i = 0; i < available; i++) {
        outSamples[i * numChannels] = stereoOutput[i * 2];
        outSamples[i * numChannels + 1] = stereoOutput[i * 2 + 1];
        for (let ch = 2; ch < numChannels; ch++) {
          outSamples[i * numChannels + ch] = 0;
        }
      }
    }

    return {
      output: audioRefFromWav(encodeWav(outSamples, sampleRate, numChannels))
    };
  }
}

// ── NoiseGate ─────────────────────────────────────────────────────

export class NoiseGateNode extends BaseNode {
  static readonly nodeType = "lib.audio.NoiseGate";
  static readonly title = "Noise Gate";
  static readonly description =
    "Applies a noise gate effect to an audio file.\n    audio, effect, dynamics\n\n    Use cases:\n    - Reduce background noise in recordings\n    - Clean up audio tracks with unwanted low-level sounds\n    - Create rhythmic effects by gating sustained sounds";
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
    default: -50,
    title: "Threshold Db",
    description: "Threshold in dB below which the gate is active.",
    min: -90,
    max: 0
  })
  declare threshold_db: any;

  @prop({
    type: "float",
    default: 1,
    title: "Attack Ms",
    description: "Attack time in milliseconds.",
    min: 0.1,
    max: 100
  })
  declare attack_ms: any;

  @prop({
    type: "float",
    default: 100,
    title: "Release Ms",
    description: "Release time in milliseconds.",
    min: 5,
    max: 1000
  })
  declare release_ms: any;

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const thresholdDb = Number(this.threshold_db ?? -50);
    const attackMs = Math.max(0.1, Number(this.attack_ms ?? 1));
    const releaseMs = Math.max(1, Number(this.release_ms ?? 100));

    if (!audio.data) return { output: audio };

    const wav = decodeWav(audio);
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
        // Gate: open when above threshold, close when below
        const targetGain = envelope >= thresholdLin ? 1 : 0;
        gain = releaseCoeff * gain + (1 - releaseCoeff) * targetGain;
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

export class PhaserNode extends BaseNode {
  static readonly nodeType = "lib.audio.Phaser";
  static readonly title = "Phaser";
  static readonly description =
    "Applies a phaser effect to an audio file.\n    audio, effect, modulation\n\n    Use cases:\n    - Create sweeping, swooshing sounds\n    - Add movement to static sounds\n    - Produce psychedelic or space-like effects";
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
    default: 1,
    title: "Rate Hz",
    description: "Rate of the phaser effect in Hz.",
    min: 0.1,
    max: 10
  })
  declare rate_hz: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Depth",
    description: "Depth of the phaser effect.",
    min: 0,
    max: 1
  })
  declare depth: any;

  @prop({
    type: "float",
    default: 1300,
    title: "Centre Frequency Hz",
    description: "Centre frequency of the phaser in Hz.",
    min: 100,
    max: 5000
  })
  declare centre_frequency_hz: any;

  @prop({
    type: "float",
    default: 0,
    title: "Feedback",
    description:
      "Feedback of the phaser effect. Negative values invert the phase.",
    min: -1,
    max: 1
  })
  declare feedback: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Mix",
    description: "Mix between the dry (original) and wet (effected) signals.",
    min: 0,
    max: 1
  })
  declare mix: any;

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const rateHz = Number(this.rate_hz ?? 1);
    const depth = Number(this.depth ?? 0.5);
    const centreFreqHz = Number(this.centre_frequency_hz ?? 1300);
    const feedback = Number(this.feedback ?? 0);
    const mix = Number(this.mix ?? 0.5);

    if (!audio.data) return { output: audio };

    const wav = decodeWav(audio);
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

export const LIB_PEDALBOARD_EXTRA_NODES = [
  BitcrushNode,
  CompressNode,
  DistortionNode,
  LimiterNode,
  ReverbNode,
  PitchShiftNode,
  TimeStretchNode,
  NoiseGateNode,
  PhaserNode
] as const;
