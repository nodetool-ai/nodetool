import { BaseNode, prop } from "@nodetool/node-sdk";
import type { AudioRef } from "@nodetool/node-sdk";

type OscillatorWaveform = "sine" | "square" | "sawtooth" | "triangle";
type PitchEnvelopeCurve = "linear" | "exponential";

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
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
  return {
    type: "audio",
    uri: "",
    data: Buffer.from(wav).toString("base64")
  };
}

export class OscillatorLibNode extends BaseNode {
  static readonly nodeType = "lib.synthesis.Oscillator";
  static readonly title = "Oscillator";
  static readonly description =
    "Generates basic waveforms (sine, square, sawtooth, triangle).\n    audio, synthesis, waveform\n\n    Use cases:\n    - Create fundamental waveforms for synthesis\n    - Generate test signals\n    - Build complex sounds from basic waves";
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "enum",
    default: "sine",
    title: "Waveform",
    description:
      "Type of waveform to generate (sine, square, sawtooth, triangle).",
    values: ["sine", "square", "sawtooth", "triangle"]
  })
  declare waveform: any;

  @prop({
    type: "float",
    default: 440,
    title: "Frequency",
    description: "Frequency of the waveform in Hz.",
    min: 20,
    max: 20000
  })
  declare frequency: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Amplitude",
    description: "Amplitude of the waveform.",
    min: 0,
    max: 1
  })
  declare amplitude: any;

  @prop({
    type: "float",
    default: 1,
    title: "Duration",
    description: "Duration in seconds.",
    min: 0,
    max: 30
  })
  declare duration: any;

  @prop({
    type: "int",
    default: 44100,
    title: "Sample Rate",
    description: "Sampling rate in Hz."
  })
  declare sample_rate: any;

  @prop({
    type: "float",
    default: 0,
    title: "Pitch Envelope Amount",
    description: "Amount of pitch envelope in semitones",
    min: -24,
    max: 24
  })
  declare pitch_envelope_amount: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Pitch Envelope Time",
    description: "Duration of pitch envelope in seconds",
    min: 0,
    max: 10
  })
  declare pitch_envelope_time: any;

  @prop({
    type: "enum",
    default: "linear",
    title: "Pitch Envelope Curve",
    description: "Shape of pitch envelope (linear, exponential)",
    values: ["linear", "exponential"]
  })
  declare pitch_envelope_curve: any;

  async process(): Promise<Record<string, unknown>> {
    const waveform = String(this.waveform ?? "sine") as OscillatorWaveform;
    const frequency = Number(this.frequency ?? 440);
    const amplitude = Number(this.amplitude ?? 0.5);
    const duration = Number(this.duration ?? 1.0);
    const sampleRate = Number(this.sample_rate ?? 44100);
    const pitchEnvAmount = Number(
      this.pitch_envelope_amount ?? this.pitch_envelope_amount ?? 0.0
    );
    const pitchEnvTime = Number(this.pitch_envelope_time ?? 0.5);
    const pitchEnvCurve = String(
      this.pitch_envelope_curve ?? this.pitch_envelope_curve ?? "linear"
    ) as PitchEnvelopeCurve;

    const numSamples = Math.floor(sampleRate * duration);
    const t = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      t[i] = (i / numSamples) * duration;
    }

    // Pitch envelope
    const envSamples = Math.floor(
      Math.min(pitchEnvTime, duration) * sampleRate
    );
    const pitchEnv = new Float32Array(numSamples).fill(1);

    if (pitchEnvAmount !== 0) {
      const targetMult = Math.pow(2, pitchEnvAmount / 12);
      for (let i = 0; i < envSamples; i++) {
        const norm = i / (envSamples - 1 || 1);
        let envelope: number;
        if (pitchEnvCurve === "exponential") {
          envelope = Math.exp(-5 * norm);
        } else {
          envelope = 1 - norm;
        }
        pitchEnv[i] = 1 + (targetMult - 1) * (1 - envelope);
      }
      for (let i = envSamples; i < numSamples; i++) {
        pitchEnv[i] = targetMult;
      }
    }

    // Compute phase via cumulative sum
    const phase = new Float32Array(numSamples);
    let cumSum = 0;
    for (let i = 0; i < numSamples; i++) {
      cumSum += pitchEnv[i];
      phase[i] = ((2 * Math.PI * frequency) / sampleRate) * cumSum;
    }

    // Generate waveform
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      switch (waveform) {
        case "sine":
          samples[i] = amplitude * Math.sin(phase[i]);
          break;
        case "square":
          samples[i] = amplitude * Math.sign(Math.sin(phase[i]));
          break;
        case "sawtooth":
          samples[i] = amplitude * (2 * ((phase[i] / (2 * Math.PI)) % 1) - 1);
          break;
        case "triangle":
          samples[i] =
            amplitude *
            (2 * Math.abs(2 * ((phase[i] / (2 * Math.PI)) % 1) - 1) - 1);
          break;
        default:
          throw new Error(`Invalid waveform type: ${waveform}`);
      }
    }

    return { output: audioRefFromWav(encodeWav(samples, sampleRate)) };
  }
}

export class WhiteNoiseLibNode extends BaseNode {
  static readonly nodeType = "lib.synthesis.WhiteNoise";
  static readonly title = "White Noise";
  static readonly description =
    "Generates white noise.\n    audio, synthesis, noise\n\n    Use cases:\n    - Create background ambience\n    - Generate percussion sounds\n    - Test audio equipment";
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 0.5,
    title: "Amplitude",
    description: "Amplitude of the noise.",
    min: 0,
    max: 1
  })
  declare amplitude: any;

  @prop({
    type: "float",
    default: 1,
    title: "Duration",
    description: "Duration in seconds.",
    min: 0,
    max: 30
  })
  declare duration: any;

  @prop({
    type: "int",
    default: 44100,
    title: "Sample Rate",
    description: "Sampling rate in Hz."
  })
  declare sample_rate: any;

  async process(): Promise<Record<string, unknown>> {
    const amplitude = Number(this.amplitude ?? 0.5);
    const duration = Number(this.duration ?? 1.0);
    const sampleRate = Number(this.sample_rate ?? 44100);

    const numSamples = Math.floor(sampleRate * duration);
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      samples[i] = amplitude * (Math.random() * 2 - 1);
    }

    return { output: audioRefFromWav(encodeWav(samples, sampleRate)) };
  }
}

export class PinkNoiseLibNode extends BaseNode {
  static readonly nodeType = "lib.synthesis.PinkNoise";
  static readonly title = "Pink Noise";
  static readonly description =
    "Generates pink noise (1/f noise).\n    audio, synthesis, noise\n\n    Use cases:\n    - Create natural-sounding background noise\n    - Test speaker response\n    - Sound masking";
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 0.5,
    title: "Amplitude",
    description: "Amplitude of the noise.",
    min: 0,
    max: 1
  })
  declare amplitude: any;

  @prop({
    type: "float",
    default: 1,
    title: "Duration",
    description: "Duration in seconds.",
    min: 0,
    max: 30
  })
  declare duration: any;

  @prop({
    type: "int",
    default: 44100,
    title: "Sample Rate",
    description: "Sampling rate in Hz."
  })
  declare sample_rate: any;

  async process(): Promise<Record<string, unknown>> {
    const amplitude = Number(this.amplitude ?? 0.5);
    const duration = Number(this.duration ?? 1.0);
    const sampleRate = Number(this.sample_rate ?? 44100);

    const numSamples = Math.floor(sampleRate * duration);

    // Voss-McCartney pink noise algorithm (time-domain, no FFT needed)
    const samples = new Float32Array(numSamples);
    const numRows = 16;
    const rows = new Float32Array(numRows);
    let runningSum = 0;

    for (let i = 0; i < numRows; i++) {
      const val = Math.random() * 2 - 1;
      rows[i] = val;
      runningSum += val;
    }

    let maxVal = 0;
    for (let i = 0; i < numSamples; i++) {
      // Determine which row to replace based on trailing zeros of i
      let n = i;
      let rowIdx = 0;
      while (rowIdx < numRows - 1 && (n & 1) === 0 && n > 0) {
        rowIdx++;
        n >>= 1;
      }

      runningSum -= rows[rowIdx];
      const newVal = Math.random() * 2 - 1;
      rows[rowIdx] = newVal;
      runningSum += newVal;

      // Add white noise for high-frequency content
      const white = Math.random() * 2 - 1;
      samples[i] = (runningSum + white) / (numRows + 1);
      const abs = Math.abs(samples[i]);
      if (abs > maxVal) maxVal = abs;
    }

    // Normalize and apply amplitude
    if (maxVal > 0) {
      for (let i = 0; i < numSamples; i++) {
        samples[i] = (amplitude * samples[i]) / maxVal;
      }
    }

    return { output: audioRefFromWav(encodeWav(samples, sampleRate)) };
  }
}

export class FM_SynthesisLibNode extends BaseNode {
  static readonly nodeType = "lib.synthesis.FM_Synthesis";
  static readonly title = "FM Synthesis";
  static readonly description =
    "Performs FM (Frequency Modulation) synthesis.\n    audio, synthesis, modulation\n\n    Use cases:\n    - Create complex timbres\n    - Generate bell-like sounds\n    - Synthesize metallic tones";
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "float",
    default: 440,
    title: "Carrier Freq",
    description: "Carrier frequency in Hz.",
    min: 20,
    max: 20000
  })
  declare carrier_freq: any;

  @prop({
    type: "float",
    default: 110,
    title: "Modulator Freq",
    description: "Modulator frequency in Hz.",
    min: 1,
    max: 20000
  })
  declare modulator_freq: any;

  @prop({
    type: "float",
    default: 5,
    title: "Modulation Index",
    description: "Modulation index (affects richness of sound).",
    min: 0,
    max: 100
  })
  declare modulation_index: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Amplitude",
    description: "Amplitude of the output.",
    min: 0,
    max: 1
  })
  declare amplitude: any;

  @prop({
    type: "float",
    default: 1,
    title: "Duration",
    description: "Duration in seconds.",
    min: 0,
    max: 30
  })
  declare duration: any;

  @prop({
    type: "int",
    default: 44100,
    title: "Sample Rate",
    description: "Sampling rate in Hz."
  })
  declare sample_rate: any;

  async process(): Promise<Record<string, unknown>> {
    const carrierFreq = Number(this.carrier_freq ?? 440);
    const modulatorFreq = Number(this.modulator_freq ?? 110);
    const modIndex = Number(this.modulation_index ?? 5);
    const amplitude = Number(this.amplitude ?? 0.5);
    const duration = Number(this.duration ?? 1.0);
    const sampleRate = Number(this.sample_rate ?? 44100);

    const numSamples = Math.floor(sampleRate * duration);
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const t = (i / numSamples) * duration;
      const modulator = Math.sin(2 * Math.PI * modulatorFreq * t);
      samples[i] =
        amplitude *
        Math.sin(2 * Math.PI * carrierFreq * t + modIndex * modulator);
    }

    return { output: audioRefFromWav(encodeWav(samples, sampleRate)) };
  }
}

export class EnvelopeLibNode extends BaseNode {
  static readonly nodeType = "lib.synthesis.Envelope";
  static readonly title = "Envelope";
  static readonly description =
    "Applies an ADR (Attack-Decay-Release) envelope to an audio signal.\n    audio, synthesis, envelope\n\n    Use cases:\n    - Shape the amplitude of synthesized sounds\n    - Create percussion-like instruments\n    - Control sound dynamics";
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
    description: "The audio to apply the envelope to."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 0.1,
    title: "Attack",
    description: "Attack time in seconds.",
    min: 0,
    max: 5
  })
  declare attack: any;

  @prop({
    type: "float",
    default: 0.3,
    title: "Decay",
    description: "Decay time in seconds.",
    min: 0,
    max: 5
  })
  declare decay: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Release",
    description: "Release time in seconds.",
    min: 0,
    max: 5
  })
  declare release: any;

  @prop({
    type: "float",
    default: 1,
    title: "Peak Amplitude",
    description: "Peak amplitude after attack phase (0-1).",
    min: 0,
    max: 1
  })
  declare peak_amplitude: any;

  async process(): Promise<Record<string, unknown>> {
    const audio = (this.audio ?? {}) as {
      data?: string | Uint8Array;
    };
    const attack = Number(this.attack ?? 0.1);
    const decay = Number(this.decay ?? 0.3);
    const release = Number(this.release ?? 0.5);
    const peakAmp = Number(this.peak_amplitude ?? 1.0);

    // Decode WAV data
    let rawData: Uint8Array;
    if (!audio.data) {
      return { output: audio };
    }
    if (typeof audio.data === "string") {
      rawData = Uint8Array.from(Buffer.from(audio.data, "base64"));
    } else {
      rawData = audio.data;
    }

    const buf = Buffer.from(rawData);
    // Parse WAV header to get sample rate and sample data offset
    const riff = buf.toString("ascii", 0, 4);
    if (riff !== "RIFF" || buf.length < 44) {
      // Not a WAV file, return as-is
      return { output: audio };
    }

    const sampleRate = buf.readUInt32LE(24);
    const bitsPerSample = buf.readUInt16LE(34);
    const numChannels = buf.readUInt16LE(22);

    // Find data chunk
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
    const frameSamples = Math.floor(totalSamples / numChannels);

    // Compute envelope sample counts
    let attackSamples = Math.floor(attack * sampleRate);
    let decaySamples = Math.floor(decay * sampleRate);
    let releaseSamples = Math.floor(release * sampleRate);

    const totalEnv = attackSamples + decaySamples + releaseSamples;
    if (totalEnv > frameSamples) {
      const scale = frameSamples / totalEnv;
      attackSamples = Math.floor(attackSamples * scale);
      decaySamples = Math.floor(decaySamples * scale);
      releaseSamples = frameSamples - (attackSamples + decaySamples);
    }

    // Build envelope array
    const envelope = new Float32Array(frameSamples);
    let pos = 0;

    // Attack
    for (let i = 0; i < attackSamples && pos < frameSamples; i++, pos++) {
      envelope[pos] = (peakAmp * i) / (attackSamples || 1);
    }

    // Decay
    const sustainLevel = peakAmp * 0.3;
    for (let i = 0; i < decaySamples && pos < frameSamples; i++, pos++) {
      envelope[pos] =
        peakAmp - ((peakAmp - sustainLevel) * i) / (decaySamples || 1);
    }

    // Release
    const releaseStart = pos > 0 ? envelope[pos - 1] : sustainLevel;
    for (let i = 0; i < releaseSamples && pos < frameSamples; i++, pos++) {
      envelope[pos] = releaseStart - (releaseStart * i) / (releaseSamples || 1);
    }
    // Remaining samples stay 0

    // Apply envelope to PCM data (in-place on a copy)
    const outBuf = Buffer.from(rawData);
    for (let frame = 0; frame < frameSamples; frame++) {
      const envVal = envelope[frame];
      for (let ch = 0; ch < numChannels; ch++) {
        const sampleIdx = frame * numChannels + ch;
        const bytePos = dataOffset + sampleIdx * bytesPerSample;
        if (bytePos + bytesPerSample > outBuf.length) break;
        if (bitsPerSample === 16) {
          const sample = outBuf.readInt16LE(bytePos);
          outBuf.writeInt16LE(
            Math.round(Math.max(-32768, Math.min(32767, sample * envVal))),
            bytePos
          );
        }
      }
    }

    return {
      output: {
        uri: "",
        data: outBuf.toString("base64")
      }
    };
  }
}

export const LIB_SYNTHESIS_NODES = [
  OscillatorLibNode,
  WhiteNoiseLibNode,
  PinkNoiseLibNode,
  FM_SynthesisLibNode,
  EnvelopeLibNode
] as const;
