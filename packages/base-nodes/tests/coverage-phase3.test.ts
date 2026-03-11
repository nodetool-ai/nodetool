import { describe, it, expect, vi } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  // lib-numpy (uncovered: ConvertToImage, ConvertToAudio, ConvertToArray, SaveArray, PlotArray)
  NumpyConvertToImageNode,
  NumpyConvertToAudioNode,
  ConvertToArrayNumpyNode,
  SaveArrayNode,
  PlotArrayNode,
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
  SchemaNode,
  FilterDataframeNode,
  SliceDataframeNode,
  SaveDataframeNode,
  ImportCSVNode,
  LoadCSVFileDataNode,
  FromListNode,
  JSONToDataframeNode,
  ToListNode,
  SelectColumnNode,
  ExtractColumnNode,
  AddColumnNode,
  MergeDataframeNode,
  AppendDataframeNode,
  JoinDataframeNode,
  RowIteratorNode,
  FindRowNode,
  SortByColumnNode,
  DropDuplicatesNode,
  DropNANode,
  ForEachRowNode,
  AggregateNode,
  PivotNode,
  RenameNode,
  FillNANode,
  SaveCSVDataframeFileNode,
  FilterNoneNode,
  // lib-librosa-spectral
  STFTNode,
  MelSpectrogramNode,
  MFCCNode,
  ChromaSTFTNode,
  SpectralCentroidNode,
  SpectralContrastNode,
  GriffinLimNode,
  DetectOnsetsNode,
  SegmentAudioByOnsetsNode,
  SaveAudioSegmentsNode,
  // lib-synthesis (pitch envelope paths)
  OscillatorLibNode,
  EnvelopeLibNode,
  // lib-seaborn
  ChartRendererLibNode,
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

function makeShortSine(sr = 8000, dur = 0.05, freq = 440): { uri: string; data: string } {
  const n = Math.floor(sr * dur);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / sr);
  }
  return makeAudioRef(samples, sr);
}

// Longer sine for spectral analysis (needs enough samples for FFT)
function makeLongerSine(sr = 8000, dur = 0.5, freq = 440): { uri: string; data: string } {
  const n = Math.floor(sr * dur);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / sr);
  }
  return makeAudioRef(samples, sr);
}

const arr = (data: number[], shape: number[]) => ({ data, shape });

// =====================================================================
// lib-numpy: ConvertToAudio, SaveArray, PlotArray
// =====================================================================

describe("lib-numpy ConvertToAudio", () => {
  it("converts array to WAV audio ref", async () => {
    const data = Array.from({ length: 100 }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / 8000));
    const res = await new NumpyConvertToAudioNode().process({
      values: { data, shape: [100] },
      sample_rate: 8000,
    });
    const out = res.output as { uri: string; data: string };
    expect(out.data).toBeTruthy();
    const buf = Buffer.from(out.data, "base64");
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  });
});

describe("lib-numpy ConvertToImage", () => {
  it("converts 2D grayscale array to PNG", async () => {
    // 4x4 grayscale image
    const data = Array.from({ length: 16 }, (_, i) => i / 15);
    const res = await new NumpyConvertToImageNode().process({
      values: { data, shape: [4, 4] },
    });
    const out = res.output as { type: string; data: string };
    expect(out.type).toBe("image");
    expect(out.data).toBeTruthy();
    const buf = Buffer.from(out.data, "base64");
    expect(buf[0]).toBe(0x89); // PNG signature
  });

  it("converts 3D RGB array to PNG", async () => {
    const data = Array.from({ length: 2 * 2 * 3 }, () => 0.5);
    const res = await new NumpyConvertToImageNode().process({
      values: { data, shape: [2, 2, 3] },
    });
    const out = res.output as { type: string; data: string };
    expect(out.type).toBe("image");
  });

  it("throws for empty array", async () => {
    await expect(
      new NumpyConvertToImageNode().process({
        values: { data: [], shape: [0] },
      })
    ).rejects.toThrow("not connected");
  });

  it("throws for 1D array", async () => {
    await expect(
      new NumpyConvertToImageNode().process({
        values: { data: [1, 2, 3], shape: [3] },
      })
    ).rejects.toThrow("2 or 3 dimensions");
  });

  it("throws for invalid channel count", async () => {
    await expect(
      new NumpyConvertToImageNode().process({
        values: { data: Array.from({ length: 10 }, () => 0.5), shape: [1, 2, 5] },
      })
    ).rejects.toThrow("1, 3, or 4");
  });
});

describe("lib-numpy ConvertToArray (image -> array)", () => {
  it("converts a PNG image to array", async () => {
    // First create an image via ConvertToImage, then convert back
    const data = Array.from({ length: 4 * 4 }, (_, i) => i / 15);
    const imgRes = await new NumpyConvertToImageNode().process({
      values: { data, shape: [4, 4] },
    });
    const img = imgRes.output as { data: string };
    const res = await new ConvertToArrayNumpyNode().process({ image: img });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.shape[0]).toBe(4); // height
    expect(out.shape[1]).toBe(4); // width
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("throws when no image data", async () => {
    await expect(
      new ConvertToArrayNumpyNode().process({ image: { uri: "" } })
    ).rejects.toThrow("not connected");
  });
});

describe("lib-numpy SaveArray", () => {
  it("saves array data without context", async () => {
    const res = await new SaveArrayNode().process({
      values: { data: [1, 2, 3], shape: [3] },
      name: "test.json",
    });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data).toEqual([1, 2, 3]);
    expect(out.shape).toEqual([3]);
  });

  it("uses date name template", async () => {
    const res = await new SaveArrayNode().process({
      values: { data: [1], shape: [1] },
      name: "%Y-%m-%d.json",
    });
    const out = res.output as { data: number[] };
    expect(out.data).toEqual([1]);
  });

  it("replaces .npy extension with .json", async () => {
    const res = await new SaveArrayNode().process({
      values: { data: [1], shape: [1] },
      name: "output.npy",
    });
    expect(res.output).toBeTruthy();
  });
});

describe("lib-numpy PlotArray", () => {
  it("renders 1D array as line plot", async () => {
    const res = await new PlotArrayNode().process({
      values: { data: [1, 3, 2, 5, 4], shape: [5] },
    });
    const out = res.output as { type: string; data: string };
    expect(out.type).toBe("image");
    expect(out.data).toBeTruthy();
    const buf = Buffer.from(out.data, "base64");
    expect(buf[0]).toBe(0x89); // PNG
  });

  it("renders 2D array as grayscale image", async () => {
    const data = Array.from({ length: 4 * 4 }, (_, i) => i);
    const res = await new PlotArrayNode().process({
      values: { data, shape: [4, 4] },
    });
    const out = res.output as { type: string; data: string };
    expect(out.type).toBe("image");
  });

  it("throws for empty array", async () => {
    await expect(
      new PlotArrayNode().process({
        values: { data: [], shape: [0] },
      })
    ).rejects.toThrow("Empty array");
  });
});

// =====================================================================
// lib-pedalboard-extra
// =====================================================================

describe("BitcrushNode", () => {
  it("applies bitcrushing effect", async () => {
    const audio = makeShortSine();
    const res = await new BitcrushNode().process({
      audio,
      bit_depth: 4,
      sample_rate_reduction: 2,
    });
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });

  it("passes through when no audio data", async () => {
    const res = await new BitcrushNode().process({ audio: {}, bit_depth: 8 });
    expect(res.output).toEqual({});
  });
});

describe("CompressNode", () => {
  it("applies compression", async () => {
    const audio = makeShortSine();
    const res = await new CompressNode().process({
      audio,
      threshold: -10,
      ratio: 4,
      attack: 5,
      release: 50,
    });
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });

  it("passes through when no audio data", async () => {
    const res = await new CompressNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });
});

describe("DistortionNode", () => {
  it("applies distortion effect", async () => {
    const audio = makeShortSine();
    const res = await new DistortionNode().process({
      audio,
      drive_db: 20,
    });
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });

  it("passes through when no audio data", async () => {
    const res = await new DistortionNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });
});

describe("LimiterNode", () => {
  it("applies limiter effect", async () => {
    const audio = makeShortSine();
    const res = await new LimiterNode().process({
      audio,
      threshold_db: -6,
      release_ms: 100,
    });
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });

  it("passes through when no audio data", async () => {
    const res = await new LimiterNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });
});

describe("ReverbNode", () => {
  it("applies reverb effect", async () => {
    const audio = makeShortSine();
    const res = await new ReverbNode().process({
      audio,
      room_scale: 0.5,
      damping: 0.5,
      wet_level: 0.3,
      dry_level: 0.7,
    });
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });

  it("passes through when no audio data", async () => {
    const res = await new ReverbNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });
});

describe("PitchShiftNode", () => {
  it("passes through when semitones=0", async () => {
    const audio = makeShortSine();
    const res = await new PitchShiftNode().process({
      audio,
      semitones: 0,
    });
    expect(res.output).toEqual(audio);
  });

  it("passes through when no audio data", async () => {
    const res = await new PitchShiftNode().process({ audio: {}, semitones: 5 });
    expect(res.output).toEqual({});
  });

  it("shifts pitch by semitones", async () => {
    const audio = makeShortSine(8000, 0.1);
    const res = await new PitchShiftNode().process({
      audio,
      semitones: 3,
    });
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });
});

describe("TimeStretchNode", () => {
  it("passes through when rate=1.0", async () => {
    const audio = makeShortSine();
    const res = await new TimeStretchNode().process({
      audio,
      rate: 1.0,
    });
    expect(res.output).toEqual(audio);
  });

  it("passes through when no audio data", async () => {
    const res = await new TimeStretchNode().process({ audio: {}, rate: 2.0 });
    expect(res.output).toEqual({});
  });

  it("stretches audio at different rate", async () => {
    const audio = makeShortSine(8000, 0.1);
    const res = await new TimeStretchNode().process({
      audio,
      rate: 1.5,
    });
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });
});

describe("NoiseGateNode", () => {
  it("throws not-implemented error", async () => {
    await expect(
      new NoiseGateNode().process({ audio: makeShortSine() })
    ).rejects.toThrow("not yet implemented");
  });
});

describe("PhaserNode", () => {
  it("throws not-implemented error", async () => {
    await expect(
      new PhaserNode().process({ audio: makeShortSine() })
    ).rejects.toThrow("not yet implemented");
  });
});

// =====================================================================
// data.ts nodes
// =====================================================================

describe("data nodes", () => {
  const df = { rows: [
    { name: "Alice", age: 30, score: 90 },
    { name: "Bob", age: 25, score: 85 },
    { name: "Charlie", age: 35, score: 95 },
  ]};

  it("SchemaNode returns columns", async () => {
    const res = await new SchemaNode().process({});
    expect(res.output).toEqual({ type: "record_type", columns: [] });
  });

  it("FilterDataframeNode filters by condition", async () => {
    const res = await new FilterDataframeNode().process({
      df,
      condition: "age > 25",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
  });

  it("FilterDataframeNode with empty condition returns all", async () => {
    const res = await new FilterDataframeNode().process({ df, condition: "" });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(3);
  });

  it("FilterDataframeNode with 'and' condition", async () => {
    const res = await new FilterDataframeNode().process({
      df,
      condition: "age > 25 and score > 90",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].name).toBe("Charlie");
  });

  it("SliceDataframeNode slices rows", async () => {
    const res = await new SliceDataframeNode().process({
      dataframe: df,
      start_index: 1,
      end_index: 2,
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].name).toBe("Bob");
  });

  it("SliceDataframeNode with negative end uses length", async () => {
    const res = await new SliceDataframeNode().process({
      dataframe: df,
      start_index: 0,
      end_index: -1,
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(3);
  });

  it("ImportCSVNode parses CSV", async () => {
    const res = await new ImportCSVNode().process({
      csv_data: "name,age\nAlice,30\nBob,25",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
    expect(out.rows[0].name).toBe("Alice");
    expect(out.rows[0].age).toBe(30);
  });

  it("ImportCSVNode handles empty CSV", async () => {
    const res = await new ImportCSVNode().process({ csv_data: "" });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(0);
  });

  it("LoadCSVFileDataNode loads from file", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "data-test-"));
    const csvFile = join(tmpDir, "test.csv");
    writeFileSync(csvFile, "x,y\n1,2\n3,4");
    const res = await new LoadCSVFileDataNode().process({ file_path: csvFile });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
  });

  it("LoadCSVFileDataNode throws for empty path", async () => {
    await expect(
      new LoadCSVFileDataNode().process({ file_path: "" })
    ).rejects.toThrow("file_path cannot be empty");
  });

  it("FromListNode converts list of dicts", async () => {
    const res = await new FromListNode().process({
      values: [{ a: 1, b: "hello" }, { a: 2, b: "world" }],
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
    expect(out.rows[0].a).toBe(1);
  });

  it("FromListNode handles value wrapper objects", async () => {
    const res = await new FromListNode().process({
      values: [{ a: { value: 42 } }],
    });
    const out = res.output as { rows: any[] };
    expect(out.rows[0].a).toBe(42);
  });

  it("FromListNode throws for non-dict items", async () => {
    await expect(
      new FromListNode().process({ values: ["not a dict"] })
    ).rejects.toThrow("List must contain dicts");
  });

  it("JSONToDataframeNode parses JSON array", async () => {
    const res = await new JSONToDataframeNode().process({
      text: '[{"x":1},{"x":2}]',
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
  });

  it("ToListNode returns rows", async () => {
    const res = await new ToListNode().process({ dataframe: df });
    expect(res.output).toEqual(df.rows);
  });

  it("SelectColumnNode selects subset of columns", async () => {
    const res = await new SelectColumnNode().process({
      dataframe: df,
      columns: "name,age",
    });
    const out = res.output as { rows: any[] };
    expect(Object.keys(out.rows[0])).toEqual(["name", "age"]);
  });

  it("SelectColumnNode returns all when empty columns", async () => {
    const res = await new SelectColumnNode().process({
      dataframe: df,
      columns: "",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(3);
  });

  it("ExtractColumnNode extracts single column", async () => {
    const res = await new ExtractColumnNode().process({
      dataframe: df,
      column_name: "name",
    });
    expect(res.output).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("AddColumnNode adds column", async () => {
    const res = await new AddColumnNode().process({
      dataframe: df,
      column_name: "grade",
      values: ["A", "B", "A"],
    });
    const out = res.output as { rows: any[] };
    expect(out.rows[0].grade).toBe("A");
  });

  it("MergeDataframeNode merges two dataframes", async () => {
    const a = { rows: [{ x: 1 }, { x: 2 }] };
    const b = { rows: [{ y: 10 }, { y: 20 }] };
    const res = await new MergeDataframeNode().process({
      dataframe_a: a,
      dataframe_b: b,
    });
    const out = res.output as { rows: any[] };
    expect(out.rows[0]).toEqual({ x: 1, y: 10 });
  });

  it("AppendDataframeNode appends matching columns", async () => {
    const a = { rows: [{ x: 1 }] };
    const b = { rows: [{ x: 2 }] };
    const res = await new AppendDataframeNode().process({
      dataframe_a: a,
      dataframe_b: b,
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
  });

  it("AppendDataframeNode throws for mismatched columns", async () => {
    await expect(
      new AppendDataframeNode().process({
        dataframe_a: { rows: [{ x: 1 }] },
        dataframe_b: { rows: [{ y: 1 }] },
      })
    ).rejects.toThrow("do not match");
  });

  it("AppendDataframeNode handles empty first df", async () => {
    const res = await new AppendDataframeNode().process({
      dataframe_a: { rows: [] },
      dataframe_b: { rows: [{ x: 1 }] },
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
  });

  it("AppendDataframeNode handles empty second df", async () => {
    const res = await new AppendDataframeNode().process({
      dataframe_a: { rows: [{ x: 1 }] },
      dataframe_b: { rows: [] },
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
  });

  it("JoinDataframeNode performs inner join", async () => {
    const a = { rows: [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]};
    const b = { rows: [
      { id: 1, score: 90 },
      { id: 3, score: 70 },
    ]};
    const res = await new JoinDataframeNode().process({
      dataframe_a: a,
      dataframe_b: b,
      join_on: "id",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].name).toBe("Alice");
    expect(out.rows[0].score).toBe(90);
  });

  it("FindRowNode finds first matching row", async () => {
    const res = await new FindRowNode().process({
      df,
      condition: "age > 25",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].name).toBe("Alice");
  });

  it("SortByColumnNode sorts rows", async () => {
    const res = await new SortByColumnNode().process({
      df,
      column: "name",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows[0].name).toBe("Alice");
    expect(out.rows[1].name).toBe("Bob");
    expect(out.rows[2].name).toBe("Charlie");
  });

  it("DropDuplicatesNode removes duplicates", async () => {
    const dupDf = { rows: [
      { x: 1, y: 2 },
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]};
    const res = await new DropDuplicatesNode().process({ df: dupDf });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
  });

  it("DropNANode removes rows with nulls", async () => {
    const naDf = { rows: [
      { x: 1, y: "hello" },
      { x: null, y: "world" },
      { x: 3, y: "" },
    ]};
    const res = await new DropNANode().process({ df: naDf });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
  });

  it("FilterNoneNode filters null values", async () => {
    const res1 = await new FilterNoneNode().process({ value: null });
    expect(res1).toEqual({ output: [] });

    const res2 = await new FilterNoneNode().process({ value: 42 });
    expect(res2).toEqual({ output: 42 });
  });

  it("SaveDataframeNode writes CSV", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "save-df-"));
    const res = await new SaveDataframeNode().process({
      df: { rows: [{ a: 1, b: 2 }] },
      folder: tmpDir,
      name: "test.csv",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
    const content = readFileSync(join(tmpDir, "test.csv"), "utf8");
    expect(content).toContain("a,b");
    expect(content).toContain("1,2");
  });

  it("SaveCSVDataframeFileNode writes CSV", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "save-csv-"));
    const res = await new SaveCSVDataframeFileNode().process({
      dataframe: { rows: [{ x: 10 }] },
      folder: tmpDir,
      filename: "out.csv",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
  });

  it("SaveCSVDataframeFileNode throws for empty folder", async () => {
    await expect(
      new SaveCSVDataframeFileNode().process({
        dataframe: { rows: [] },
        folder: "",
        filename: "out.csv",
      })
    ).rejects.toThrow("folder cannot be empty");
  });

  it("SaveCSVDataframeFileNode throws for empty filename", async () => {
    await expect(
      new SaveCSVDataframeFileNode().process({
        dataframe: { rows: [] },
        folder: "/tmp",
        filename: "",
      })
    ).rejects.toThrow("filename cannot be empty");
  });
});

describe("data AggregateNode", () => {
  const df = { rows: [
    { category: "A", value: 10 },
    { category: "A", value: 20 },
    { category: "B", value: 30 },
  ]};

  it("aggregates with sum", async () => {
    const res = await new AggregateNode().process({
      dataframe: df,
      columns: "category",
      aggregation: "sum",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(30);
  });

  it("aggregates with mean", async () => {
    const res = await new AggregateNode().process({
      dataframe: df,
      columns: "category",
      aggregation: "mean",
    });
    const out = res.output as { rows: any[] };
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(15);
  });

  it("aggregates with count", async () => {
    const res = await new AggregateNode().process({
      dataframe: df,
      columns: "category",
      aggregation: "count",
    });
    const out = res.output as { rows: any[] };
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(2);
  });

  it("aggregates with min", async () => {
    const res = await new AggregateNode().process({
      dataframe: df,
      columns: "category",
      aggregation: "min",
    });
    const out = res.output as { rows: any[] };
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(10);
  });

  it("aggregates with max", async () => {
    const res = await new AggregateNode().process({
      dataframe: df,
      columns: "category",
      aggregation: "max",
    });
    const out = res.output as { rows: any[] };
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(20);
  });

  it("aggregates with median", async () => {
    const res = await new AggregateNode().process({
      dataframe: df,
      columns: "category",
      aggregation: "median",
    });
    const out = res.output as { rows: any[] };
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(15);
  });

  it("aggregates with first", async () => {
    const res = await new AggregateNode().process({
      dataframe: df,
      columns: "category",
      aggregation: "first",
    });
    const out = res.output as { rows: any[] };
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(10);
  });

  it("aggregates with last", async () => {
    const res = await new AggregateNode().process({
      dataframe: df,
      columns: "category",
      aggregation: "last",
    });
    const out = res.output as { rows: any[] };
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(20);
  });

  it("throws for unknown aggregation", async () => {
    await expect(
      new AggregateNode().process({
        dataframe: df,
        columns: "category",
        aggregation: "bogus",
      })
    ).rejects.toThrow("Unknown aggregation");
  });
});

describe("data PivotNode", () => {
  const df = { rows: [
    { region: "East", product: "A", sales: 10 },
    { region: "East", product: "B", sales: 20 },
    { region: "West", product: "A", sales: 30 },
  ]};

  it("pivots with sum", async () => {
    const res = await new PivotNode().process({
      dataframe: df,
      index: "region",
      columns: "product",
      values: "sales",
      aggfunc: "sum",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
    const east = out.rows.find((r: any) => r.region === "East");
    expect(east.A).toBe(10);
    expect(east.B).toBe(20);
  });

  it("pivots with mean", async () => {
    const res = await new PivotNode().process({
      dataframe: df,
      index: "region",
      columns: "product",
      values: "sales",
      aggfunc: "mean",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
  });

  it("throws for unknown aggfunc", async () => {
    await expect(
      new PivotNode().process({
        dataframe: df,
        index: "region",
        columns: "product",
        values: "sales",
        aggfunc: "bogus",
      })
    ).rejects.toThrow("Unknown aggregation");
  });
});

describe("data RenameNode", () => {
  it("renames columns", async () => {
    const res = await new RenameNode().process({
      dataframe: { rows: [{ x: 1, y: 2 }] },
      rename_map: "x:a, y:b",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows[0]).toEqual({ a: 1, b: 2 });
  });

  it("handles empty rename_map", async () => {
    const res = await new RenameNode().process({
      dataframe: { rows: [{ x: 1 }] },
      rename_map: "",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows[0]).toEqual({ x: 1 });
  });
});

describe("data FillNANode", () => {
  const naDf = { rows: [
    { x: 1, y: null },
    { x: null, y: 3 },
    { x: 5, y: 6 },
  ]};

  it("fills with value", async () => {
    const res = await new FillNANode().process({
      dataframe: naDf,
      value: 0,
      method: "value",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows[0].y).toBe(0);
    expect(out.rows[1].x).toBe(0);
  });

  it("fills with forward", async () => {
    const res = await new FillNANode().process({
      dataframe: naDf,
      method: "forward",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows[1].x).toBe(1);
  });

  it("fills with backward", async () => {
    const res = await new FillNANode().process({
      dataframe: naDf,
      method: "backward",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows[0].y).toBe(3);
  });

  it("fills with mean", async () => {
    const res = await new FillNANode().process({
      dataframe: naDf,
      method: "mean",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows[1].x).toBe(3);
  });

  it("fills with median", async () => {
    const res = await new FillNANode().process({
      dataframe: naDf,
      method: "median",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows[1].x).toBe(3);
  });

  it("fills specific columns", async () => {
    const res = await new FillNANode().process({
      dataframe: naDf,
      value: 99,
      method: "value",
      columns: "x",
    });
    const out = res.output as { rows: any[] };
    expect(out.rows[1].x).toBe(99);
    expect(out.rows[0].y).toBe(null); // y not filled
  });

  it("throws for unknown method", async () => {
    await expect(
      new FillNANode().process({
        dataframe: naDf,
        method: "bogus",
      })
    ).rejects.toThrow("Unknown fill method");
  });
});

describe("data streaming nodes", () => {
  it("RowIteratorNode yields rows", async () => {
    const node = new RowIteratorNode();
    const rows: any[] = [];
    for await (const item of node.genProcess({
      dataframe: { rows: [{ a: 1 }, { a: 2 }] },
    })) {
      rows.push(item);
    }
    expect(rows.length).toBe(2);
    expect(rows[0].dict).toEqual({ a: 1 });
    expect(rows[0].index).toBe(0);
  });

  it("ForEachRowNode yields rows", async () => {
    const node = new ForEachRowNode();
    const rows: any[] = [];
    for await (const item of node.genProcess({
      dataframe: { rows: [{ x: 10 }, { x: 20 }] },
    })) {
      rows.push(item);
    }
    expect(rows.length).toBe(2);
    expect(rows[0].row).toEqual({ x: 10 });
    expect(rows[1].index).toBe(1);
  });
});

// =====================================================================
// lib-librosa-spectral
// =====================================================================

describe("lib-librosa-spectral nodes", () => {
  const audio = makeLongerSine(8000, 0.5, 440);

  it("STFTNode computes STFT", async () => {
    const res = await new STFTNode().process({
      audio,
      n_fft: 512,
      hop_length: 256,
    });
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBeGreaterThan(0);
    // Number of bins should be n_fft/2 + 1 = 257
    expect(out.data.length).toBe(257);
  });

  it("STFTNode returns empty for no audio", async () => {
    const res = await new STFTNode().process({ audio: {} });
    expect((res.output as any).data).toEqual([]);
  });

  it("MelSpectrogramNode computes mel spectrogram", async () => {
    const res = await new MelSpectrogramNode().process({
      audio,
      n_fft: 512,
      hop_length: 256,
      n_mels: 32,
      fmin: 0,
      fmax: 4000,
    });
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(32); // n_mels
  });

  it("MelSpectrogramNode returns empty for no audio", async () => {
    const res = await new MelSpectrogramNode().process({ audio: {} });
    expect((res.output as any).data).toEqual([]);
  });

  it("MFCCNode computes MFCCs", async () => {
    const res = await new MFCCNode().process({
      audio,
      n_mfcc: 13,
      n_fft: 512,
      hop_length: 256,
    });
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(13); // n_mfcc
  });

  it("MFCCNode returns empty for no audio", async () => {
    const res = await new MFCCNode().process({ audio: {} });
    expect((res.output as any).data).toEqual([]);
  });

  it("ChromaSTFTNode computes chromagram", async () => {
    const res = await new ChromaSTFTNode().process({
      audio,
      n_fft: 512,
      hop_length: 256,
    });
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(12); // 12 chroma bins
  });

  it("ChromaSTFTNode returns empty for no audio", async () => {
    const res = await new ChromaSTFTNode().process({ audio: {} });
    expect((res.output as any).data).toEqual([]);
  });

  it("SpectralCentroidNode computes centroid", async () => {
    const res = await new SpectralCentroidNode().process({
      audio,
      n_fft: 512,
      hop_length: 256,
    });
    const out = res.output as { data: number[] };
    expect(out.data.length).toBeGreaterThan(0);
    // Centroid should be near 440 Hz for a 440 Hz sine
    for (const c of out.data) {
      expect(c).toBeGreaterThan(0);
    }
  });

  it("SpectralCentroidNode returns empty for no audio", async () => {
    const res = await new SpectralCentroidNode().process({ audio: {} });
    expect((res.output as any).data).toEqual([]);
  });

  it("SpectralContrastNode computes contrast", async () => {
    const res = await new SpectralContrastNode().process({
      audio,
      n_fft: 512,
      hop_length: 256,
    });
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(7); // 7 sub-bands
  });

  it("SpectralContrastNode returns empty for no audio", async () => {
    const res = await new SpectralContrastNode().process({ audio: {} });
    expect((res.output as any).data).toEqual([]);
  });

  it("GriffinLimNode throws not-implemented", async () => {
    await expect(
      new GriffinLimNode().process({
        magnitude_spectrogram: { data: [[1, 2]] },
      })
    ).rejects.toThrow("not implemented");
  });

  it("DetectOnsetsNode detects onsets", async () => {
    // Create audio with sudden amplitude changes
    const sr = 8000;
    const n = sr; // 1 second
    const samples = new Float32Array(n);
    // Silence then burst pattern
    for (let i = 0; i < n; i++) {
      if (i > sr * 0.2 && i < sr * 0.3) {
        samples[i] = 0.8 * Math.sin((2 * Math.PI * 440 * i) / sr);
      } else if (i > sr * 0.6 && i < sr * 0.7) {
        samples[i] = 0.8 * Math.sin((2 * Math.PI * 880 * i) / sr);
      }
    }
    const burstAudio = makeAudioRef(samples, sr);
    const res = await new DetectOnsetsNode().process({
      audio: burstAudio,
      hop_length: 512,
    });
    const out = res.output as { data: number[] };
    expect(Array.isArray(out.data)).toBe(true);
  });

  it("DetectOnsetsNode returns empty for no audio", async () => {
    const res = await new DetectOnsetsNode().process({ audio: {} });
    expect((res.output as any).data).toEqual([]);
  });

  it("SegmentAudioByOnsetsNode segments audio", async () => {
    const res = await new SegmentAudioByOnsetsNode().process({
      audio,
      onsets: { data: [0.1, 0.3] },
      min_segment_length: 0.05,
    });
    const out = res.output as any[];
    expect(out.length).toBeGreaterThan(0);
    for (const seg of out) {
      expect(seg.data).toBeTruthy();
    }
  });

  it("SegmentAudioByOnsetsNode returns empty for no audio", async () => {
    const res = await new SegmentAudioByOnsetsNode().process({ audio: {} });
    expect(res.output).toEqual([]);
  });

  it("SaveAudioSegmentsNode returns folder when no path", async () => {
    const res = await new SaveAudioSegmentsNode().process({
      segments: [],
      output_folder: {},
    });
    expect(res.output).toEqual({});
  });

  it("SaveAudioSegmentsNode saves segments to folder", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "save-seg-"));
    const seg = makeShortSine();
    const res = await new SaveAudioSegmentsNode().process({
      segments: [seg],
      output_folder: { path: tmpDir },
      name_prefix: "test",
    });
    expect(res.output).toBeTruthy();
  });
});

// =====================================================================
// lib-synthesis: pitch envelope paths
// =====================================================================

describe("OscillatorLibNode pitch envelope", () => {
  it("generates with linear pitch envelope", async () => {
    const res = await new OscillatorLibNode().process({
      waveform: "sine",
      frequency: 440,
      amplitude: 0.5,
      duration: 0.1,
      sample_rate: 8000,
      pitch_envelope_amount: 12,
      pitch_envelope_time: 0.05,
      pitch_envelope_curve: "linear",
    });
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });

  it("generates with exponential pitch envelope", async () => {
    const res = await new OscillatorLibNode().process({
      waveform: "sine",
      frequency: 440,
      amplitude: 0.5,
      duration: 0.1,
      sample_rate: 8000,
      pitch_envelope_amount: -12,
      pitch_envelope_time: 0.05,
      pitch_envelope_curve: "exponential",
    });
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });
});

// =====================================================================
// lib-seaborn: ChartRendererLibNode
// =====================================================================

describe("ChartRendererLibNode", () => {
  it("throws when no data rows provided", async () => {
    await expect(
      new ChartRendererLibNode().process({
        chart_config: { title: "Test", data: { series: [] } },
        data: { columns: [], data: [] },
      })
    ).rejects.toThrow("Data is required");
  });

  it("renders a bar chart", async () => {
    const res = await new ChartRendererLibNode().process({
      chart_config: {
        title: "Sales",
        x_label: "Product",
        y_label: "Revenue",
        data: {
          series: [{ x: "product", y: "revenue", plot_type: "barplot" }],
        },
      },
      width: 400,
      height: 300,
      data: {
        columns: [{ name: "product" }, { name: "revenue" }],
        data: [
          ["A", 100],
          ["B", 200],
          ["C", 150],
        ],
      },
    });
    const out = res.output as { type: string; data: string };
    expect(out.type).toBe("image");
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("renders a line chart", async () => {
    const res = await new ChartRendererLibNode().process({
      chart_config: {
        data: {
          series: [{ x: "x", y: "y", plot_type: "line" }],
        },
      },
      data: {
        columns: [{ name: "x" }, { name: "y" }],
        data: [[1, 10], [2, 20], [3, 15]],
      },
    });
    const out = res.output as { type: string; data: string };
    expect(out.type).toBe("image");
  });

  it("renders a scatter chart", async () => {
    const res = await new ChartRendererLibNode().process({
      chart_config: {
        data: {
          series: [{ x: "x", y: "y", plot_type: "scatter" }],
        },
      },
      data: {
        columns: [{ name: "x" }, { name: "y" }],
        data: [[1, 5], [2, 8], [3, 3]],
      },
    });
    const out = res.output as { type: string; data: string };
    expect(out.type).toBe("image");
  });

  it("renders with default series (no explicit series)", async () => {
    const res = await new ChartRendererLibNode().process({
      chart_config: {
        data: { series: [] },
      },
      data: {
        columns: [{ name: "x" }, { name: "y" }],
        data: [[1, 10], [2, 20]],
      },
    });
    const out = res.output as { type: string; data: string };
    expect(out.type).toBe("image");
  });
});

// =====================================================================
// data.ts: asRows edge cases
// =====================================================================

describe("data asRows edge cases", () => {
  it("handles data property on input", async () => {
    const res = await new ToListNode().process({
      dataframe: { data: [{ x: 1 }] },
    });
    expect(res.output).toEqual([{ x: 1 }]);
  });

  it("handles plain array input", async () => {
    const res = await new ToListNode().process({
      dataframe: [{ x: 1 }, { x: 2 }],
    });
    expect(res.output).toEqual([{ x: 1 }, { x: 2 }]);
  });
});
