import { describe, it, expect } from "vitest";
import {
  // lib-pedalboard-extra
  BitcrushNode,
  CompressNode,
  DistortionNode,
  LimiterNode,
  ReverbNode,
  PitchShiftNode,
  TimeStretchNode,
  NoiseGateNode,
  PhaserNode,
  // data nodes
  ForEachRowNode,
  // lib-seaborn
  ChartRendererLibNode
} from "../src/index.js";
import { parseWavBytes, toBytes, type WavData } from "@nodetool-ai/audio-nodes";

// ── Helper: create a minimal WAV audio ref ──────────────────────────
function makeAudioRef(
  samples: Float32Array,
  sampleRate = 44100,
  numChannels = 1
): { uri: string; data: string } {
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
  return { uri: "", data: buffer.toString("base64") };
}

function makeShortSine(
  sr = 8000,
  dur = 0.05,
  freq = 440
): { uri: string; data: string } {
  const n = Math.floor(sr * dur);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / sr);
  }
  return makeAudioRef(samples, sr);
}

// Longer sine for spectral analysis (needs enough samples for FFT)
function makeLongerSine(
  sr = 8000,
  dur = 0.5,
  freq = 440
): { uri: string; data: string } {
  const n = Math.floor(sr * dur);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / sr);
  }
  return makeAudioRef(samples, sr);
}

/**
 * 0.6 s at 8 kHz: a near-silent first half well under the noise gate's default
 * -50 dB threshold, then a loud second half well over it.
 */
function makeQuietThenLoudSine(): { uri: string; data: string } {
  const sr = 8000;
  const half = Math.floor(sr * 0.3);
  const samples = new Float32Array(half * 2);
  for (let i = 0; i < samples.length; i++) {
    const amp = i < half ? 0.0005 : 0.5;
    samples[i] = amp * Math.sin((2 * Math.PI * 440 * i) / sr);
  }
  return makeAudioRef(samples, sr);
}

/** 0.2 s at 8 kHz: a loud first half and a quiet second half, 20 dB apart. */
function makeTwoLevelSine(): { uri: string; data: string } {
  const sr = 8000;
  const n = Math.floor(sr * 0.2);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const amp = i < n / 2 ? 0.9 : 0.09;
    samples[i] = amp * Math.sin((2 * Math.PI * 440 * i) / sr);
  }
  return makeAudioRef(samples, sr);
}

/** Decode an AudioRef back to interleaved PCM so its content can be asserted. */
function decode(ref: { data?: Uint8Array | string }): WavData {
  const wav = parseWavBytes(toBytes(ref.data));
  if (!wav) {
    throw new Error("audio ref is not decodable WAV");
  }
  return wav;
}

function decodeOutput(res: Record<string, unknown>): WavData {
  return decode(res.output as { data?: Uint8Array | string });
}

function peak(samples: Float32Array, from = 0, to = samples.length): number {
  let max = 0;
  for (let i = from; i < to; i++) {
    max = Math.max(max, Math.abs(samples[i]));
  }
  return max;
}

/**
 * Amplitude of `freq` in `samples[from, to)`, by Goertzel. The window must span
 * a whole number of cycles at `freq` or neighbouring content leaks into it.
 */
function amplitudeAt(
  samples: Float32Array,
  freq: number,
  sampleRate: number,
  from: number,
  to: number
): number {
  const w = (2 * Math.PI * freq) / sampleRate;
  let re = 0;
  let im = 0;
  for (let i = from; i < to; i++) {
    re += samples[i] * Math.cos(w * i);
    im += samples[i] * Math.sin(w * i);
  }
  return (2 * Math.hypot(re, im)) / (to - from);
}

function rms(samples: Float32Array, from: number, to: number): number {
  let total = 0;
  for (let i = from; i < to; i++) {
    total += samples[i] * samples[i];
  }
  return Math.sqrt(total / (to - from));
}

const arr = (data: number[], shape: number[]) => ({ data, shape });

// =====================================================================
// lib-pedalboard-extra
// =====================================================================

describe("BitcrushNode", () => {
  it("quantizes to the bit depth and holds samples across the reduced rate", async () => {
    const audio = makeShortSine();
    const __n303 = new BitcrushNode();
    __n303.assign({
      audio,
      bit_depth: 4,
      sample_rate_reduction: 2
    });
    const out = decodeOutput(await __n303.process()).samples;

    // 4 bits => 15 quantization steps, so the sine's 101 distinct input levels
    // collapse onto a 15-step grid.
    const levels = Math.pow(2, 4) - 1;
    expect(new Set(out).size).toBeLessThanOrEqual(levels + 1);
    let maxGridError = 0;
    for (const s of out) {
      maxGridError = Math.max(
        maxGridError,
        Math.abs(s * levels - Math.round(s * levels)) / levels
      );
    }
    expect(maxGridError).toBeLessThan(1e-3);

    // sample_rate_reduction: 2 holds each source sample for two output frames.
    let heldPairs = 0;
    for (let i = 0; i + 1 < out.length; i += 2) {
      if (out[i] === out[i + 1]) {
        heldPairs++;
      }
    }
    expect(heldPairs).toBe(Math.floor(out.length / 2));
  });

  it("throws when no audio data", async () => {
    const __n304 = new BitcrushNode();
    __n304.assign({ audio: {}, bit_depth: 8 });
    await expect(__n304.process()).rejects.toThrow("No audio connected");
  });
});

describe("CompressNode", () => {
  it("narrows dynamic range, and narrows it further at a higher ratio", async () => {
    const audio = makeTwoLevelSine();
    const range = (s: Float32Array) => rms(s, 100, 800) / rms(s, 900, 1600);

    const rangeAtRatio = async (ratio: number) => {
      const node = new CompressNode();
      node.assign({
        audio,
        threshold: -10,
        ratio,
        attack: 5,
        release: 50,
        // Makeup gain would rescale both halves equally; off, so the assertion
        // reads the compression itself rather than the level it restores.
        auto_gain: false
      });
      return range(decodeOutput(await node.process()).samples);
    };

    expect(range(decode(audio).samples)).toBeCloseTo(10, 1);

    const atFour = await rangeAtRatio(4);
    expect(atFour).toBeLessThan(7);
    expect(await rangeAtRatio(8)).toBeLessThan(atFour);
  });

  it("throws when no audio data", async () => {
    const __n306 = new CompressNode();
    __n306.assign({ audio: {} });
    await expect(__n306.process()).rejects.toThrow("No audio connected");
  });
});

describe("DistortionNode", () => {
  it("saturates through the atan curve without clipping", async () => {
    const audio = makeShortSine();
    const __n307 = new DistortionNode();
    __n307.assign({
      audio,
      drive_db: 20
    });
    const outPeak = peak(decodeOutput(await __n307.process()).samples);

    // 20 dB of drive is x10, so the sine's 0.5 peak maps to (2/pi)*atan(5).
    expect(outPeak).toBeCloseTo((2 / Math.PI) * Math.atan(5), 3);
    expect(outPeak).toBeLessThan(1);
  });

  it("throws when no audio data", async () => {
    const __n308 = new DistortionNode();
    __n308.assign({ audio: {} });
    await expect(__n308.process()).rejects.toThrow("No audio connected");
  });
});

describe("LimiterNode", () => {
  it("lifts peaks to the auto-gain ceiling without passing it", async () => {
    const audio = makeShortSine();
    const __n309 = new LimiterNode();
    __n309.assign({
      audio,
      threshold_db: -6,
      release_ms: 100
    });
    const outPeak = peak(decodeOutput(await __n309.process()).samples);

    // auto_gain (on by default) normalizes the -6 dB ceiling to full scale, so
    // the 0.5 input peak ends up just under 1 and never above it.
    expect(outPeak).toBeGreaterThan(0.9);
    expect(outPeak).toBeLessThanOrEqual(1);
  });

  it("throws when no audio data", async () => {
    const __n310 = new LimiterNode();
    __n310.assign({ audio: {} });
    await expect(__n310.process()).rejects.toThrow("No audio connected");
  });
});

describe("ReverbNode", () => {
  it("mixes a wet tail on top of the dry signal", async () => {
    const audio = makeShortSine();
    const __n311 = new ReverbNode();
    __n311.assign({
      audio,
      room_scale: 0.5,
      damping: 0.5,
      wet_level: 0.3,
      dry_level: 0.7
    });
    const out = decodeOutput(await __n311.process()).samples;
    const dry = decode(audio).samples;

    expect(out.length).toBe(dry.length);
    // Without the comb/allpass path the output would be exactly dry * 0.7.
    let maxWet = 0;
    for (let i = 0; i < dry.length; i++) {
      maxWet = Math.max(maxWet, Math.abs(out[i] - dry[i] * 0.7));
    }
    expect(maxWet).toBeGreaterThan(0.1);
  });

  it("throws when no audio data", async () => {
    const __n312 = new ReverbNode();
    __n312.assign({ audio: {} });
    await expect(__n312.process()).rejects.toThrow("No audio connected");
  });
});

describe("PitchShiftNode", () => {
  it("passes through when semitones=0", async () => {
    const audio = makeShortSine();
    const __n313 = new PitchShiftNode();
    __n313.assign({
      audio,
      semitones: 0
    });
    const res = await __n313.process();
    expect(res.output).toEqual(audio);
  });

  it("throws when no audio data", async () => {
    const __n314 = new PitchShiftNode();
    __n314.assign({ audio: {}, semitones: 5 });
    await expect(__n314.process()).rejects.toThrow("No audio connected");
  });

  it("moves the tone up an octave and keeps the duration", async () => {
    const audio = makeLongerSine();
    const inputFrames = decode(audio).samples.length;
    const __n315 = new PitchShiftNode();
    __n315.assign({
      audio,
      semitones: 12
    });
    const out = decodeOutput(await __n315.process()).samples;

    // Measured past the shifter's warm-up, over a whole number of cycles of
    // both 440 Hz and 880 Hz.
    const from = Math.floor(out.length / 2);
    expect(amplitudeAt(out, 880, 8000, from, out.length)).toBeGreaterThan(0.1);
    expect(amplitudeAt(out, 440, 8000, from, out.length)).toBeLessThan(0.05);
    // Pitch, not speed: the output runs as long as the input.
    expect(out.length / inputFrames).toBeGreaterThan(0.95);
    expect(out.length / inputFrames).toBeLessThan(1.05);
  });
});

describe("TimeStretchNode", () => {
  it("passes through when rate=1.0", async () => {
    const audio = makeShortSine();
    const __n316 = new TimeStretchNode();
    __n316.assign({
      audio,
      rate: 1.0
    });
    const res = await __n316.process();
    expect(res.output).toEqual(audio);
  });

  it("throws when no audio data", async () => {
    const __n317 = new TimeStretchNode();
    __n317.assign({ audio: {}, rate: 2.0 });
    await expect(__n317.process()).rejects.toThrow("No audio connected");
  });

  it("scales the duration by the rate", async () => {
    const audio = makeLongerSine();
    const inputFrames = decode(audio).samples.length;
    for (const rate of [1.5, 0.5]) {
      const __n318 = new TimeStretchNode();
      __n318.assign({ audio, rate });
      const out = decodeOutput(await __n318.process()).samples;
      expect(out.length / (inputFrames / rate)).toBeCloseTo(1, 1);
    }
  });
});

describe("NoiseGateNode", () => {
  it("silences below the threshold and passes above it", async () => {
    const audio = makeQuietThenLoudSine();
    const quietFrames = decode(audio).samples.length / 2;
    const __n319 = new NoiseGateNode();
    __n319.assign({ audio });
    const out = decodeOutput(await __n319.process()).samples;

    expect(peak(out, 0, quietFrames)).toBeLessThan(0.00005);
    // Measured past the 1 ms attack, so the gate is fully open.
    expect(peak(out, quietFrames + 100, out.length)).toBeCloseTo(0.5, 2);
  });
});

describe("PhaserNode", () => {
  it("alters the waveform in proportion to the mix", async () => {
    const audio = makeLongerSine();
    const dry = decode(audio).samples;

    const maxDelta = async (mix: number) => {
      const node = new PhaserNode();
      node.assign({ audio, mix });
      const out = decodeOutput(await node.process()).samples;
      expect(out.length).toBe(dry.length);
      let max = 0;
      for (let i = 0; i < dry.length; i++) {
        max = Math.max(max, Math.abs(out[i] - dry[i]));
      }
      return max;
    };

    // mix=0 is the dry signal, off by 16-bit quantization at most.
    expect(await maxDelta(0)).toBeLessThan(0.01);
    expect(await maxDelta(1)).toBeGreaterThan(0.1);
  });
});

// =====================================================================
// data.ts nodes
describe("data streaming nodes", () => {
  it("ForEachRowNode yields rows", async () => {
    const node = new ForEachRowNode();
    const rows: any[] = [];
    node.assign({
      dataframe: { rows: [{ x: 10 }, { x: 20 }] }
    });
    for await (const item of node.genProcess()) {
      rows.push(item);
    }
    expect(rows.length).toBe(2);
    expect(rows[0].row).toEqual({ x: 10 });
    expect(rows[1].index).toBe(1);
  });
});


// =====================================================================
// lib-seaborn: ChartRendererLibNode
// =====================================================================

let hasCanvas = false;
try {
  require("canvas");
  hasCanvas = true;
} catch {
  /* not installed */
}

describe.skipIf(!hasCanvas)("ChartRendererLibNode", () => {
  it("throws when no data rows provided", async () => {
    const __n397 = new ChartRendererLibNode();
    __n397.assign({
      chart_config: { title: "Test", data: { series: [] } },
      data: { columns: [], data: [] }
    });
    await expect(__n397.process()).rejects.toThrow("Data is required");
  });

  it("renders a bar chart", async () => {
    const __n398 = new ChartRendererLibNode();
    __n398.assign({
      chart_config: {
        title: "Sales",
        x_label: "Product",
        y_label: "Revenue",
        data: {
          series: [{ x: "product", y: "revenue", plot_type: "barplot" }]
        }
      },
      width: 400,
      height: 300,
      data: {
        columns: [{ name: "product" }, { name: "revenue" }],
        data: [
          ["A", 100],
          ["B", 200],
          ["C", 150]
        ]
      }
    });
    const res = await __n398.process();
    const out = res.output as { type: string; data: string };
    expect(out.type).toBe("image");
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("renders a line chart", async () => {
    const __n399 = new ChartRendererLibNode();
    __n399.assign({
      chart_config: {
        data: {
          series: [{ x: "x", y: "y", plot_type: "line" }]
        }
      },
      data: {
        columns: [{ name: "x" }, { name: "y" }],
        data: [
          [1, 10],
          [2, 20],
          [3, 15]
        ]
      }
    });
    const res = await __n399.process();
    const out = res.output as { type: string; data: string };
    expect(out.type).toBe("image");
  });

  it("renders a scatter chart", async () => {
    const __n400 = new ChartRendererLibNode();
    __n400.assign({
      chart_config: {
        data: {
          series: [{ x: "x", y: "y", plot_type: "scatter" }]
        }
      },
      data: {
        columns: [{ name: "x" }, { name: "y" }],
        data: [
          [1, 5],
          [2, 8],
          [3, 3]
        ]
      }
    });
    const res = await __n400.process();
    const out = res.output as { type: string; data: string };
    expect(out.type).toBe("image");
  });

  it("renders with default series (no explicit series)", async () => {
    const __n401 = new ChartRendererLibNode();
    __n401.assign({
      chart_config: {
        data: { series: [] }
      },
      data: {
        columns: [{ name: "x" }, { name: "y" }],
        data: [
          [1, 10],
          [2, 20]
        ]
      }
    });
    const res = await __n401.process();
    const out = res.output as { type: string; data: string };
    expect(out.type).toBe("image");
  });
});

