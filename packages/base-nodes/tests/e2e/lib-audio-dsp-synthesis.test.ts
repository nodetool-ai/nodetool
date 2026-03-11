import { describe, expect, it } from "vitest";
import {
  AmplitudeToDBNode,
  DBToAmplitudeNode,
  DBToPowerNode,
  PowerToDBNode,
  PlotSpectrogramNode,
  GainNode_,
  DelayNode_,
  HighPassFilterNode,
  LowPassFilterNode,
  HighShelfFilterNode,
  LowShelfFilterNode,
  PeakFilterNode,
  OscillatorLibNode,
  WhiteNoiseLibNode,
  PinkNoiseLibNode,
  FM_SynthesisLibNode,
  EnvelopeLibNode,
} from "../../src/index.js";

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

// Short sine wave for filter tests (440 Hz, 0.05s at 8000 Hz sample rate)
function makeShortSine(): { uri: string; data: string } {
  const sr = 8000;
  const dur = 0.05;
  const n = Math.floor(sr * dur);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr);
  }
  return makeAudioRef(samples, sr);
}

// ── dB math nodes ───────────────────────────────────────────────────

describe("AmplitudeToDB", () => {
  it("converts amplitude 1.0 to 0 dB", async () => {
    const res = await new AmplitudeToDBNode().process({
      tensor: { data: [1.0] },
    });
    const out = res.output as { data: number[] };
    expect(out.data[0]).toBeCloseTo(0, 5);
  });

  it("converts amplitude 0.5 to ~-6.02 dB", async () => {
    const res = await new AmplitudeToDBNode().process({
      tensor: { data: [0.5] },
    });
    const out = res.output as { data: number[] };
    expect(out.data[0]).toBeCloseTo(20 * Math.log10(0.5), 5);
  });

  it("handles 2D arrays", async () => {
    const res = await new AmplitudeToDBNode().process({
      tensor: { data: [[1.0, 10.0], [0.1]] },
    });
    const out = res.output as { data: number[][] };
    expect(out.data[0][0]).toBeCloseTo(0, 5);
    expect(out.data[0][1]).toBeCloseTo(20, 5);
  });

  it("clamps near-zero values", async () => {
    const res = await new AmplitudeToDBNode().process({
      tensor: { data: [0] },
    });
    const out = res.output as { data: number[] };
    // 20 * log10(1e-10) = -200
    expect(out.data[0]).toBeCloseTo(-200, 0);
  });
});

describe("DBToAmplitude", () => {
  it("converts 0 dB to amplitude 1.0", async () => {
    const res = await new DBToAmplitudeNode().process({
      tensor: { data: [0] },
    });
    const out = res.output as { data: number[] };
    expect(out.data[0]).toBeCloseTo(1.0, 5);
  });

  it("converts -6.02 dB to ~0.5", async () => {
    const db = 20 * Math.log10(0.5);
    const res = await new DBToAmplitudeNode().process({
      tensor: { data: [db] },
    });
    const out = res.output as { data: number[] };
    expect(out.data[0]).toBeCloseTo(0.5, 4);
  });

  it("converts 20 dB to amplitude 10", async () => {
    const res = await new DBToAmplitudeNode().process({
      tensor: { data: [20] },
    });
    const out = res.output as { data: number[] };
    expect(out.data[0]).toBeCloseTo(10, 4);
  });
});

describe("PowerToDB", () => {
  it("converts power 1.0 to 0 dB", async () => {
    const res = await new PowerToDBNode().process({
      tensor: { data: [1.0] },
    });
    const out = res.output as { data: number[] };
    expect(out.data[0]).toBeCloseTo(0, 5);
  });

  it("converts power 100 to 20 dB", async () => {
    const res = await new PowerToDBNode().process({
      tensor: { data: [100] },
    });
    const out = res.output as { data: number[] };
    expect(out.data[0]).toBeCloseTo(20, 5);
  });

  it("clamps near-zero values", async () => {
    const res = await new PowerToDBNode().process({
      tensor: { data: [0] },
    });
    const out = res.output as { data: number[] };
    expect(out.data[0]).toBeCloseTo(-100, 0);
  });
});

describe("DBToPower", () => {
  it("converts 0 dB to power 1.0", async () => {
    const res = await new DBToPowerNode().process({
      tensor: { data: [0] },
    });
    const out = res.output as { data: number[] };
    expect(out.data[0]).toBeCloseTo(1.0, 5);
  });

  it("converts 10 dB to power 10", async () => {
    const res = await new DBToPowerNode().process({
      tensor: { data: [10] },
    });
    const out = res.output as { data: number[] };
    expect(out.data[0]).toBeCloseTo(10, 4);
  });

  it("converts 20 dB to power 100", async () => {
    const res = await new DBToPowerNode().process({
      tensor: { data: [20] },
    });
    const out = res.output as { data: number[] };
    expect(out.data[0]).toBeCloseTo(100, 3);
  });
});

describe("AmplitudeToDB <-> DBToAmplitude roundtrip", () => {
  it("roundtrips correctly", async () => {
    const values = [0.01, 0.1, 0.5, 1.0, 2.0, 10.0];
    const dbRes = await new AmplitudeToDBNode().process({
      tensor: { data: values },
    });
    const ampRes = await new DBToAmplitudeNode().process({
      tensor: dbRes.output as { data: number[] },
    });
    const out = (ampRes.output as { data: number[] }).data;
    for (let i = 0; i < values.length; i++) {
      expect(out[i]).toBeCloseTo(values[i], 4);
    }
  });
});

describe("PowerToDB <-> DBToPower roundtrip", () => {
  it("roundtrips correctly", async () => {
    const values = [0.01, 0.1, 1.0, 10.0, 100.0];
    const dbRes = await new PowerToDBNode().process({
      tensor: { data: values },
    });
    const powRes = await new DBToPowerNode().process({
      tensor: dbRes.output as { data: number[] },
    });
    const out = (powRes.output as { data: number[] }).data;
    for (let i = 0; i < values.length; i++) {
      expect(out[i]).toBeCloseTo(values[i], 4);
    }
  });
});

describe("PlotSpectrogram", () => {
  it("returns empty output for empty spectrogram", async () => {
    const res = await new PlotSpectrogramNode().process({
      tensor: { data: [] },
    });
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBe("");
  });

  it("returns a PNG base64 string for valid spectrogram", async () => {
    // 4 freq bins x 8 time frames
    const spec = Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 8 }, (_, c) => r * 8 + c)
    );
    const res = await new PlotSpectrogramNode().process({
      tensor: { data: spec },
    });
    const out = res.output as { uri: string; data: string };
    expect(out.data.length).toBeGreaterThan(0);
    // Verify it decodes to valid PNG (starts with PNG signature)
    const buf = Buffer.from(out.data, "base64");
    expect(buf[0]).toBe(0x89);
    expect(buf.toString("ascii", 1, 4)).toBe("PNG");
  });
});

// ── Audio filter nodes ──────────────────────────────────────────────

describe("GainNode_", () => {
  it("returns audio ref with data when given valid audio", async () => {
    const audio = makeShortSine();
    const res = await new GainNode_().process({ audio, gain_db: 0 });
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("passes through when no audio data", async () => {
    const res = await new GainNode_().process({ audio: {}, gain_db: 6 });
    expect(res.output).toEqual({});
  });
});

describe("DelayNode_", () => {
  it("produces output longer than input (extra echoes)", async () => {
    const audio = makeShortSine();
    const res = await new DelayNode_().process({
      audio,
      delay_seconds: 0.01,
      feedback: 0.3,
      mix: 0.5,
    });
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
    // Delay output should be longer due to echo tail
    expect(out.data.length).toBeGreaterThan(audio.data.length);
  });
});

describe("HighPassFilterNode", () => {
  it("returns audio ref with data", async () => {
    const audio = makeShortSine();
    const res = await new HighPassFilterNode().process({
      audio,
      cutoff_frequency_hz: 200,
    });
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
    expect(out.data.length).toBeGreaterThan(0);
  });
});

describe("LowPassFilterNode", () => {
  it("returns audio ref with data", async () => {
    const audio = makeShortSine();
    const res = await new LowPassFilterNode().process({
      audio,
      cutoff_frequency_hz: 2000,
    });
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
  });
});

describe("HighShelfFilterNode", () => {
  it("returns audio ref with data", async () => {
    const audio = makeShortSine();
    const res = await new HighShelfFilterNode().process({
      audio,
      cutoff_frequency_hz: 3000,
      gain_db: 6,
    });
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
  });
});

describe("LowShelfFilterNode", () => {
  it("returns audio ref with data", async () => {
    const audio = makeShortSine();
    const res = await new LowShelfFilterNode().process({
      audio,
      cutoff_frequency_hz: 300,
      gain_db: -3,
    });
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
  });
});

describe("PeakFilterNode", () => {
  it("returns audio ref with data", async () => {
    const audio = makeShortSine();
    const res = await new PeakFilterNode().process({
      audio,
      cutoff_frequency_hz: 1000,
      q_factor: 2.0,
    });
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
  });
});

// ── Synthesis nodes ─────────────────────────────────────────────────

describe("OscillatorLibNode", () => {
  it("generates sine wave audio", async () => {
    const res = await new OscillatorLibNode().process({
      waveform: "sine",
      frequency: 440,
      amplitude: 0.5,
      duration: 0.1,
      sample_rate: 8000,
    });
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
    expect(out.data.length).toBeGreaterThan(0);
    // Verify it's valid WAV
    const buf = Buffer.from(out.data, "base64");
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  });

  it("generates all waveform types", async () => {
    for (const waveform of ["sine", "square", "sawtooth", "triangle"]) {
      const res = await new OscillatorLibNode().process({
        waveform,
        frequency: 440,
        amplitude: 0.5,
        duration: 0.05,
        sample_rate: 8000,
      });
      const out = res.output as { uri: string; data: string };
      expect(out.data.length).toBeGreaterThan(0);
    }
  });

  it("respects duration parameter", async () => {
    const short = await new OscillatorLibNode().process({
      duration: 0.05,
      sample_rate: 8000,
    });
    const long = await new OscillatorLibNode().process({
      duration: 0.2,
      sample_rate: 8000,
    });
    const shortData = (short.output as { data: string }).data;
    const longData = (long.output as { data: string }).data;
    expect(longData.length).toBeGreaterThan(shortData.length);
  });
});

describe("WhiteNoiseLibNode", () => {
  it("generates non-empty audio", async () => {
    const res = await new WhiteNoiseLibNode().process({
      amplitude: 0.5,
      duration: 0.1,
      sample_rate: 8000,
    });
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
    const buf = Buffer.from(out.data, "base64");
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  });
});

describe("PinkNoiseLibNode", () => {
  it("generates non-empty audio", async () => {
    const res = await new PinkNoiseLibNode().process({
      amplitude: 0.5,
      duration: 0.1,
      sample_rate: 8000,
    });
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
    const buf = Buffer.from(out.data, "base64");
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  });
});

describe("FM_SynthesisLibNode", () => {
  it("generates FM synthesis audio", async () => {
    const res = await new FM_SynthesisLibNode().process({
      carrier_freq: 440,
      modulator_freq: 110,
      modulation_index: 5,
      amplitude: 0.5,
      duration: 0.1,
      sample_rate: 8000,
    });
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
    const buf = Buffer.from(out.data, "base64");
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  });
});

describe("EnvelopeLibNode", () => {
  it("applies envelope to oscillator output", async () => {
    // First generate audio
    const oscRes = await new OscillatorLibNode().process({
      waveform: "sine",
      frequency: 440,
      amplitude: 1.0,
      duration: 0.1,
      sample_rate: 8000,
    });
    const audio = oscRes.output;

    const res = await new EnvelopeLibNode().process({
      audio,
      attack: 0.02,
      decay: 0.03,
      release: 0.05,
      peak_amplitude: 1.0,
    });
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
    const buf = Buffer.from(out.data, "base64");
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  });

  it("passes through when no audio data", async () => {
    const res = await new EnvelopeLibNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });
});
