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

const arr = (data: number[], shape: number[]) => ({ data, shape });

// =====================================================================
// lib-pedalboard-extra
// =====================================================================

describe("BitcrushNode", () => {
  it("applies bitcrushing effect", async () => {
    const audio = makeShortSine();
    const __n303 = new BitcrushNode();
    __n303.assign({
      audio,
      bit_depth: 4,
      sample_rate_reduction: 2
    });
    const res = await __n303.process();
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });

  it("throws when no audio data", async () => {
    const __n304 = new BitcrushNode();
    __n304.assign({ audio: {}, bit_depth: 8 });
    await expect(__n304.process()).rejects.toThrow("No audio connected");
  });
});

describe("CompressNode", () => {
  it("applies compression", async () => {
    const audio = makeShortSine();
    const __n305 = new CompressNode();
    __n305.assign({
      audio,
      threshold: -10,
      ratio: 4,
      attack: 5,
      release: 50
    });
    const res = await __n305.process();
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });

  it("throws when no audio data", async () => {
    const __n306 = new CompressNode();
    __n306.assign({ audio: {} });
    await expect(__n306.process()).rejects.toThrow("No audio connected");
  });
});

describe("DistortionNode", () => {
  it("applies distortion effect", async () => {
    const audio = makeShortSine();
    const __n307 = new DistortionNode();
    __n307.assign({
      audio,
      drive_db: 20
    });
    const res = await __n307.process();
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });

  it("throws when no audio data", async () => {
    const __n308 = new DistortionNode();
    __n308.assign({ audio: {} });
    await expect(__n308.process()).rejects.toThrow("No audio connected");
  });
});

describe("LimiterNode", () => {
  it("applies limiter effect", async () => {
    const audio = makeShortSine();
    const __n309 = new LimiterNode();
    __n309.assign({
      audio,
      threshold_db: -6,
      release_ms: 100
    });
    const res = await __n309.process();
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });

  it("throws when no audio data", async () => {
    const __n310 = new LimiterNode();
    __n310.assign({ audio: {} });
    await expect(__n310.process()).rejects.toThrow("No audio connected");
  });
});

describe("ReverbNode", () => {
  it("applies reverb effect", async () => {
    const audio = makeShortSine();
    const __n311 = new ReverbNode();
    __n311.assign({
      audio,
      room_scale: 0.5,
      damping: 0.5,
      wet_level: 0.3,
      dry_level: 0.7
    });
    const res = await __n311.process();
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
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

  it("shifts pitch by semitones", async () => {
    const audio = makeShortSine(8000, 0.1);
    const __n315 = new PitchShiftNode();
    __n315.assign({
      audio,
      semitones: 3
    });
    const res = await __n315.process();
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
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

  it("stretches audio at different rate", async () => {
    const audio = makeShortSine(8000, 0.1);
    const __n318 = new TimeStretchNode();
    __n318.assign({
      audio,
      rate: 1.5
    });
    const res = await __n318.process();
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });
});

describe("NoiseGateNode", () => {
  it("applies noise gate to audio", async () => {
    const __n319 = new NoiseGateNode();
    __n319.assign({ audio: makeShortSine() });
    const res = await __n319.process();
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });
});

describe("PhaserNode", () => {
  it("applies phaser effect to audio", async () => {
    const __n320 = new PhaserNode();
    __n320.assign({ audio: makeShortSine() });
    const res = await __n320.process();
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
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

