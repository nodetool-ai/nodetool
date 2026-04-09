import { describe, it, expect, vi } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("passes through when no audio data", async () => {
    const __n304 = new BitcrushNode();
    __n304.assign({ audio: {}, bit_depth: 8 });
    const res = await __n304.process();
    expect(res.output).toEqual({});
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

  it("passes through when no audio data", async () => {
    const __n306 = new CompressNode();
    __n306.assign({ audio: {} });
    const res = await __n306.process();
    expect(res.output).toEqual({});
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

  it("passes through when no audio data", async () => {
    const __n308 = new DistortionNode();
    __n308.assign({ audio: {} });
    const res = await __n308.process();
    expect(res.output).toEqual({});
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

  it("passes through when no audio data", async () => {
    const __n310 = new LimiterNode();
    __n310.assign({ audio: {} });
    const res = await __n310.process();
    expect(res.output).toEqual({});
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

  it("passes through when no audio data", async () => {
    const __n312 = new ReverbNode();
    __n312.assign({ audio: {} });
    const res = await __n312.process();
    expect(res.output).toEqual({});
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

  it("passes through when no audio data", async () => {
    const __n314 = new PitchShiftNode();
    __n314.assign({ audio: {}, semitones: 5 });
    const res = await __n314.process();
    expect(res.output).toEqual({});
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

  it("passes through when no audio data", async () => {
    const __n317 = new TimeStretchNode();
    __n317.assign({ audio: {}, rate: 2.0 });
    const res = await __n317.process();
    expect(res.output).toEqual({});
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
// =====================================================================

describe("data nodes", () => {
  const df = {
    rows: [
      { name: "Alice", age: 30, score: 90 },
      { name: "Bob", age: 25, score: 85 },
      { name: "Charlie", age: 35, score: 95 }
    ]
  };

  it("SchemaNode returns columns", async () => {
    const res = await new SchemaNode().process();
    expect(res.output).toEqual({ type: "record_type", columns: [] });
  });

  it("FilterDataframeNode filters by condition", async () => {
    const __n321 = new FilterDataframeNode();
    __n321.assign({
      df,
      condition: "age > 25"
    });
    const res = await __n321.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
  });

  it("FilterDataframeNode with empty condition returns all", async () => {
    const __n322 = new FilterDataframeNode();
    __n322.assign({ df, condition: "" });
    const res = await __n322.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(3);
  });

  it("FilterDataframeNode with 'and' condition", async () => {
    const __n323 = new FilterDataframeNode();
    __n323.assign({
      df,
      condition: "age > 25 and score > 90"
    });
    const res = await __n323.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].name).toBe("Charlie");
  });

  it("SliceDataframeNode slices rows", async () => {
    const __n324 = new SliceDataframeNode();
    __n324.assign({
      dataframe: df,
      start_index: 1,
      end_index: 2
    });
    const res = await __n324.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].name).toBe("Bob");
  });

  it("SliceDataframeNode with negative end uses length", async () => {
    const __n325 = new SliceDataframeNode();
    __n325.assign({
      dataframe: df,
      start_index: 0,
      end_index: -1
    });
    const res = await __n325.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(3);
  });

  it("ImportCSVNode parses CSV", async () => {
    const __n326 = new ImportCSVNode();
    __n326.assign({
      csv_data: "name,age\nAlice,30\nBob,25"
    });
    const res = await __n326.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
    expect(out.rows[0].name).toBe("Alice");
    expect(out.rows[0].age).toBe(30);
  });

  it("ImportCSVNode handles empty CSV", async () => {
    const __n327 = new ImportCSVNode();
    __n327.assign({ csv_data: "" });
    const res = await __n327.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(0);
  });

  it("LoadCSVFileDataNode loads from file", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "data-test-"));
    const csvFile = join(tmpDir, "test.csv");
    writeFileSync(csvFile, "x,y\n1,2\n3,4");
    const __n328 = new LoadCSVFileDataNode();
    __n328.assign({ file_path: csvFile });
    const res = await __n328.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
  });

  it("LoadCSVFileDataNode throws for empty path", async () => {
    const __n329 = new LoadCSVFileDataNode();
    __n329.assign({ file_path: "" });
    await expect(__n329.process()).rejects.toThrow("file_path cannot be empty");
  });

  it("FromListNode converts list of dicts", async () => {
    const __n330 = new FromListNode();
    __n330.assign({
      values: [
        { a: 1, b: "hello" },
        { a: 2, b: "world" }
      ]
    });
    const res = await __n330.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
    expect(out.rows[0].a).toBe(1);
  });

  it("FromListNode handles value wrapper objects", async () => {
    const __n331 = new FromListNode();
    __n331.assign({
      values: [{ a: { value: 42 } }]
    });
    const res = await __n331.process();
    const out = res.output as { rows: any[] };
    expect(out.rows[0].a).toBe(42);
  });

  it("FromListNode throws for non-dict items", async () => {
    const __n332 = new FromListNode();
    __n332.assign({ values: ["not a dict"] });
    await expect(__n332.process()).rejects.toThrow("List must contain dicts");
  });

  it("JSONToDataframeNode parses JSON array", async () => {
    const __n333 = new JSONToDataframeNode();
    __n333.assign({
      text: '[{"x":1},{"x":2}]'
    });
    const res = await __n333.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
  });

  it("ToListNode returns rows", async () => {
    const __n334 = new ToListNode();
    __n334.assign({ dataframe: df });
    const res = await __n334.process();
    expect(res.output).toEqual(df.rows);
  });

  it("SelectColumnNode selects subset of columns", async () => {
    const __n335 = new SelectColumnNode();
    __n335.assign({
      dataframe: df,
      columns: "name,age"
    });
    const res = await __n335.process();
    const out = res.output as { rows: any[] };
    expect(Object.keys(out.rows[0])).toEqual(["name", "age"]);
  });

  it("SelectColumnNode returns all when empty columns", async () => {
    const __n336 = new SelectColumnNode();
    __n336.assign({
      dataframe: df,
      columns: ""
    });
    const res = await __n336.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(3);
  });

  it("ExtractColumnNode extracts single column", async () => {
    const __n337 = new ExtractColumnNode();
    __n337.assign({
      dataframe: df,
      column_name: "name"
    });
    const res = await __n337.process();
    expect(res.output).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("AddColumnNode adds column", async () => {
    const __n338 = new AddColumnNode();
    __n338.assign({
      dataframe: df,
      column_name: "grade",
      values: ["A", "B", "A"]
    });
    const res = await __n338.process();
    const out = res.output as { rows: any[] };
    expect(out.rows[0].grade).toBe("A");
  });

  it("MergeDataframeNode merges two dataframes", async () => {
    const a = { rows: [{ x: 1 }, { x: 2 }] };
    const b = { rows: [{ y: 10 }, { y: 20 }] };
    const __n339 = new MergeDataframeNode();
    __n339.assign({
      dataframe_a: a,
      dataframe_b: b
    });
    const res = await __n339.process();
    const out = res.output as { rows: any[] };
    expect(out.rows[0]).toEqual({ x: 1, y: 10 });
  });

  it("AppendDataframeNode appends matching columns", async () => {
    const a = { rows: [{ x: 1 }] };
    const b = { rows: [{ x: 2 }] };
    const __n340 = new AppendDataframeNode();
    __n340.assign({
      dataframe_a: a,
      dataframe_b: b
    });
    const res = await __n340.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
  });

  it("AppendDataframeNode throws for mismatched columns", async () => {
    const __n341 = new AppendDataframeNode();
    __n341.assign({
      dataframe_a: { rows: [{ x: 1 }] },
      dataframe_b: { rows: [{ y: 1 }] }
    });
    await expect(__n341.process()).rejects.toThrow("do not match");
  });

  it("AppendDataframeNode handles empty first df", async () => {
    const __n342 = new AppendDataframeNode();
    __n342.assign({
      dataframe_a: { rows: [] },
      dataframe_b: { rows: [{ x: 1 }] }
    });
    const res = await __n342.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
  });

  it("AppendDataframeNode handles empty second df", async () => {
    const __n343 = new AppendDataframeNode();
    __n343.assign({
      dataframe_a: { rows: [{ x: 1 }] },
      dataframe_b: { rows: [] }
    });
    const res = await __n343.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
  });

  it("JoinDataframeNode performs inner join", async () => {
    const a = {
      rows: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" }
      ]
    };
    const b = {
      rows: [
        { id: 1, score: 90 },
        { id: 3, score: 70 }
      ]
    };
    const __n344 = new JoinDataframeNode();
    __n344.assign({
      dataframe_a: a,
      dataframe_b: b,
      join_on: "id"
    });
    const res = await __n344.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].name).toBe("Alice");
    expect(out.rows[0].score).toBe(90);
  });

  it("FindRowNode finds first matching row", async () => {
    const __n345 = new FindRowNode();
    __n345.assign({
      df,
      condition: "age > 25"
    });
    const res = await __n345.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].name).toBe("Alice");
  });

  it("SortByColumnNode sorts rows", async () => {
    const __n346 = new SortByColumnNode();
    __n346.assign({
      df,
      column: "name"
    });
    const res = await __n346.process();
    const out = res.output as { rows: any[] };
    expect(out.rows[0].name).toBe("Alice");
    expect(out.rows[1].name).toBe("Bob");
    expect(out.rows[2].name).toBe("Charlie");
  });

  it("DropDuplicatesNode removes duplicates", async () => {
    const dupDf = {
      rows: [
        { x: 1, y: 2 },
        { x: 1, y: 2 },
        { x: 3, y: 4 }
      ]
    };
    const __n347 = new DropDuplicatesNode();
    __n347.assign({ df: dupDf });
    const res = await __n347.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
  });

  it("DropNANode removes rows with nulls", async () => {
    const naDf = {
      rows: [
        { x: 1, y: "hello" },
        { x: null, y: "world" },
        { x: 3, y: "" }
      ]
    };
    const __n348 = new DropNANode();
    __n348.assign({ df: naDf });
    const res = await __n348.process();
    const out = res.output as { rows: any[] };
    // DropNA no longer removes empty strings, only null/undefined/NaN
    expect(out.rows.length).toBe(2);
  });

  it("FilterNoneNode filters null values", async () => {
    const __n349 = new FilterNoneNode();
    __n349.assign({ value: null });
    const res1 = await __n349.process();
    // FilterNoneNode returns {} when value is null (filters it out)
    expect(res1).toEqual({});

    const __n350 = new FilterNoneNode();
    __n350.assign({ value: 42 });
    const res2 = await __n350.process();
    expect(res2).toEqual({ output: 42 });
  });

  it("SaveDataframeNode writes CSV", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "save-df-"));
    const __n351 = new SaveDataframeNode();
    __n351.assign({
      df: { rows: [{ a: 1, b: 2 }] },
      folder: tmpDir,
      name: "test.csv"
    });
    const res = await __n351.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
    const content = readFileSync(join(tmpDir, "test.csv"), "utf8");
    expect(content).toContain("a,b");
    expect(content).toContain("1,2");
  });

  it("SaveCSVDataframeFileNode writes CSV", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "save-csv-"));
    const __n352 = new SaveCSVDataframeFileNode();
    __n352.assign({
      dataframe: { rows: [{ x: 10 }] },
      folder: tmpDir,
      filename: "out.csv"
    });
    const res = await __n352.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(1);
  });

  it("SaveCSVDataframeFileNode throws for empty folder", async () => {
    const __n353 = new SaveCSVDataframeFileNode();
    __n353.assign({
      dataframe: { rows: [] },
      folder: "",
      filename: "out.csv"
    });
    await expect(__n353.process()).rejects.toThrow("folder cannot be empty");
  });

  it("SaveCSVDataframeFileNode throws for empty filename", async () => {
    const __n354 = new SaveCSVDataframeFileNode();
    __n354.assign({
      dataframe: { rows: [] },
      folder: "/tmp",
      filename: ""
    });
    await expect(__n354.process()).rejects.toThrow("filename cannot be empty");
  });
});

describe("data AggregateNode", () => {
  const df = {
    rows: [
      { category: "A", value: 10 },
      { category: "A", value: 20 },
      { category: "B", value: 30 }
    ]
  };

  it("aggregates with sum", async () => {
    const __n355 = new AggregateNode();
    __n355.assign({
      dataframe: df,
      columns: "category",
      aggregation: "sum"
    });
    const res = await __n355.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(30);
  });

  it("aggregates with mean", async () => {
    const __n356 = new AggregateNode();
    __n356.assign({
      dataframe: df,
      columns: "category",
      aggregation: "mean"
    });
    const res = await __n356.process();
    const out = res.output as { rows: any[] };
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(15);
  });

  it("aggregates with count", async () => {
    const __n357 = new AggregateNode();
    __n357.assign({
      dataframe: df,
      columns: "category",
      aggregation: "count"
    });
    const res = await __n357.process();
    const out = res.output as { rows: any[] };
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(2);
  });

  it("aggregates with min", async () => {
    const __n358 = new AggregateNode();
    __n358.assign({
      dataframe: df,
      columns: "category",
      aggregation: "min"
    });
    const res = await __n358.process();
    const out = res.output as { rows: any[] };
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(10);
  });

  it("aggregates with max", async () => {
    const __n359 = new AggregateNode();
    __n359.assign({
      dataframe: df,
      columns: "category",
      aggregation: "max"
    });
    const res = await __n359.process();
    const out = res.output as { rows: any[] };
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(20);
  });

  it("aggregates with median", async () => {
    const __n360 = new AggregateNode();
    __n360.assign({
      dataframe: df,
      columns: "category",
      aggregation: "median"
    });
    const res = await __n360.process();
    const out = res.output as { rows: any[] };
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(15);
  });

  it("aggregates with first", async () => {
    const __n361 = new AggregateNode();
    __n361.assign({
      dataframe: df,
      columns: "category",
      aggregation: "first"
    });
    const res = await __n361.process();
    const out = res.output as { rows: any[] };
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(10);
  });

  it("aggregates with last", async () => {
    const __n362 = new AggregateNode();
    __n362.assign({
      dataframe: df,
      columns: "category",
      aggregation: "last"
    });
    const res = await __n362.process();
    const out = res.output as { rows: any[] };
    const a = out.rows.find((r: any) => r.category === "A");
    expect(a.value).toBe(20);
  });

  it("throws for unknown aggregation", async () => {
    const __n363 = new AggregateNode();
    __n363.assign({
      dataframe: df,
      columns: "category",
      aggregation: "bogus"
    });
    await expect(__n363.process()).rejects.toThrow("Unknown aggregation");
  });
});

describe("data PivotNode", () => {
  const df = {
    rows: [
      { region: "East", product: "A", sales: 10 },
      { region: "East", product: "B", sales: 20 },
      { region: "West", product: "A", sales: 30 }
    ]
  };

  it("pivots with sum", async () => {
    const __n364 = new PivotNode();
    __n364.assign({
      dataframe: df,
      index: "region",
      columns: "product",
      values: "sales",
      aggfunc: "sum"
    });
    const res = await __n364.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
    const east = out.rows.find((r: any) => r.region === "East");
    expect(east.A).toBe(10);
    expect(east.B).toBe(20);
  });

  it("pivots with mean", async () => {
    const __n365 = new PivotNode();
    __n365.assign({
      dataframe: df,
      index: "region",
      columns: "product",
      values: "sales",
      aggfunc: "mean"
    });
    const res = await __n365.process();
    const out = res.output as { rows: any[] };
    expect(out.rows.length).toBe(2);
  });

  it("throws for unknown aggfunc", async () => {
    const __n366 = new PivotNode();
    __n366.assign({
      dataframe: df,
      index: "region",
      columns: "product",
      values: "sales",
      aggfunc: "bogus"
    });
    await expect(__n366.process()).rejects.toThrow("Unknown aggregation");
  });
});

describe("data RenameNode", () => {
  it("renames columns", async () => {
    const __n367 = new RenameNode();
    __n367.assign({
      dataframe: { rows: [{ x: 1, y: 2 }] },
      rename_map: "x:a, y:b"
    });
    const res = await __n367.process();
    const out = res.output as { rows: any[] };
    expect(out.rows[0]).toEqual({ a: 1, b: 2 });
  });

  it("handles empty rename_map", async () => {
    const __n368 = new RenameNode();
    __n368.assign({
      dataframe: { rows: [{ x: 1 }] },
      rename_map: ""
    });
    const res = await __n368.process();
    const out = res.output as { rows: any[] };
    expect(out.rows[0]).toEqual({ x: 1 });
  });
});

describe("data FillNANode", () => {
  const naDf = {
    rows: [
      { x: 1, y: null },
      { x: null, y: 3 },
      { x: 5, y: 6 }
    ]
  };

  it("fills with value", async () => {
    const __n369 = new FillNANode();
    __n369.assign({
      dataframe: naDf,
      value: 0,
      method: "value"
    });
    const res = await __n369.process();
    const out = res.output as { rows: any[] };
    expect(out.rows[0].y).toBe(0);
    expect(out.rows[1].x).toBe(0);
  });

  it("fills with forward", async () => {
    const __n370 = new FillNANode();
    __n370.assign({
      dataframe: naDf,
      method: "forward"
    });
    const res = await __n370.process();
    const out = res.output as { rows: any[] };
    expect(out.rows[1].x).toBe(1);
  });

  it("fills with backward", async () => {
    const __n371 = new FillNANode();
    __n371.assign({
      dataframe: naDf,
      method: "backward"
    });
    const res = await __n371.process();
    const out = res.output as { rows: any[] };
    expect(out.rows[0].y).toBe(3);
  });

  it("fills with mean", async () => {
    const __n372 = new FillNANode();
    __n372.assign({
      dataframe: naDf,
      method: "mean"
    });
    const res = await __n372.process();
    const out = res.output as { rows: any[] };
    expect(out.rows[1].x).toBe(3);
  });

  it("fills with median", async () => {
    const __n373 = new FillNANode();
    __n373.assign({
      dataframe: naDf,
      method: "median"
    });
    const res = await __n373.process();
    const out = res.output as { rows: any[] };
    expect(out.rows[1].x).toBe(3);
  });

  it("fills specific columns", async () => {
    const __n374 = new FillNANode();
    __n374.assign({
      dataframe: naDf,
      value: 99,
      method: "value",
      columns: "x"
    });
    const res = await __n374.process();
    const out = res.output as { rows: any[] };
    expect(out.rows[1].x).toBe(99);
    expect(out.rows[0].y).toBe(null); // y not filled
  });

  it("throws for unknown method", async () => {
    const __n375 = new FillNANode();
    __n375.assign({
      dataframe: naDf,
      method: "bogus"
    });
    await expect(__n375.process()).rejects.toThrow("Unknown fill method");
  });
});

describe("data streaming nodes", () => {
  it("RowIteratorNode yields rows", async () => {
    const node = new RowIteratorNode();
    const rows: any[] = [];
    node.assign({
      dataframe: { rows: [{ a: 1 }, { a: 2 }] }
    });
    for await (const item of node.genProcess()) {
      rows.push(item);
    }
    expect(rows.length).toBe(2);
    expect(rows[0].dict).toEqual({ a: 1 });
    expect(rows[0].index).toBe(0);
  });

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
// lib-librosa-spectral
// =====================================================================

describe("lib-librosa-spectral nodes", () => {
  const audio = makeLongerSine(8000, 0.5, 440);

  it("STFTNode computes STFT", async () => {
    const __n376 = new STFTNode();
    __n376.assign({
      audio,
      n_fft: 512,
      hop_length: 256
    });
    const res = await __n376.process();
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBeGreaterThan(0);
    // Number of bins should be n_fft/2 + 1 = 257
    expect(out.data.length).toBe(257);
  });

  it("STFTNode returns empty for no audio", async () => {
    const __n377 = new STFTNode();
    __n377.assign({ audio: {} });
    const res = await __n377.process();
    expect((res.output as any).data).toEqual([]);
  });

  it("MelSpectrogramNode computes mel spectrogram", async () => {
    const __n378 = new MelSpectrogramNode();
    __n378.assign({
      audio,
      n_fft: 512,
      hop_length: 256,
      n_mels: 32,
      fmin: 0,
      fmax: 4000
    });
    const res = await __n378.process();
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(32); // n_mels
  });

  it("MelSpectrogramNode returns empty for no audio", async () => {
    const __n379 = new MelSpectrogramNode();
    __n379.assign({ audio: {} });
    const res = await __n379.process();
    expect((res.output as any).data).toEqual([]);
  });

  it("MFCCNode computes MFCCs", async () => {
    const __n380 = new MFCCNode();
    __n380.assign({
      audio,
      n_mfcc: 13,
      n_fft: 512,
      hop_length: 256
    });
    const res = await __n380.process();
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(13); // n_mfcc
  });

  it("MFCCNode returns empty for no audio", async () => {
    const __n381 = new MFCCNode();
    __n381.assign({ audio: {} });
    const res = await __n381.process();
    expect((res.output as any).data).toEqual([]);
  });

  it("ChromaSTFTNode computes chromagram", async () => {
    const __n382 = new ChromaSTFTNode();
    __n382.assign({
      audio,
      n_fft: 512,
      hop_length: 256
    });
    const res = await __n382.process();
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(12); // 12 chroma bins
  });

  it("ChromaSTFTNode returns empty for no audio", async () => {
    const __n383 = new ChromaSTFTNode();
    __n383.assign({ audio: {} });
    const res = await __n383.process();
    expect((res.output as any).data).toEqual([]);
  });

  it("SpectralCentroidNode computes centroid", async () => {
    const __n384 = new SpectralCentroidNode();
    __n384.assign({
      audio,
      n_fft: 512,
      hop_length: 256
    });
    const res = await __n384.process();
    const out = res.output as { data: number[] };
    expect(out.data.length).toBeGreaterThan(0);
    // Centroid should be near 440 Hz for a 440 Hz sine
    for (const c of out.data) {
      expect(c).toBeGreaterThan(0);
    }
  });

  it("SpectralCentroidNode returns empty for no audio", async () => {
    const __n385 = new SpectralCentroidNode();
    __n385.assign({ audio: {} });
    const res = await __n385.process();
    expect((res.output as any).data).toEqual([]);
  });

  it("SpectralContrastNode computes contrast", async () => {
    const __n386 = new SpectralContrastNode();
    __n386.assign({
      audio,
      n_fft: 512,
      hop_length: 256
    });
    const res = await __n386.process();
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(7); // 7 sub-bands
  });

  it("SpectralContrastNode returns empty for no audio", async () => {
    const __n387 = new SpectralContrastNode();
    __n387.assign({ audio: {} });
    const res = await __n387.process();
    expect((res.output as any).data).toEqual([]);
  });

  it("GriffinLimNode returns output from magnitude spectrogram", async () => {
    const __n388 = new GriffinLimNode();
    __n388.assign({
      magnitude_spectrogram: {
        data: [
          [1, 2, 1],
          [0.5, 1, 0.5],
          [0.2, 0.4, 0.2]
        ]
      }
    });
    const res = await __n388.process();
    const out = res.output as { data: number[] };
    expect(Array.isArray(out.data)).toBe(true);
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
    const __n389 = new DetectOnsetsNode();
    __n389.assign({
      audio: burstAudio,
      hop_length: 512
    });
    const res = await __n389.process();
    const out = res.output as { data: number[] };
    expect(Array.isArray(out.data)).toBe(true);
  });

  it("DetectOnsetsNode returns empty for no audio", async () => {
    const __n390 = new DetectOnsetsNode();
    __n390.assign({ audio: {} });
    const res = await __n390.process();
    expect((res.output as any).data).toEqual([]);
  });

  it("SegmentAudioByOnsetsNode segments audio", async () => {
    const __n391 = new SegmentAudioByOnsetsNode();
    __n391.assign({
      audio,
      onsets: { data: [0.1, 0.3] },
      min_segment_length: 0.05
    });
    const res = await __n391.process();
    const out = res.output as any[];
    expect(out.length).toBeGreaterThan(0);
    for (const seg of out) {
      expect(seg.data).toBeTruthy();
    }
  });

  it("SegmentAudioByOnsetsNode returns empty for no audio", async () => {
    const __n392 = new SegmentAudioByOnsetsNode();
    __n392.assign({ audio: {} });
    const res = await __n392.process();
    expect(res.output).toEqual([]);
  });

  it("SaveAudioSegmentsNode returns folder when no path", async () => {
    const __n393 = new SaveAudioSegmentsNode();
    __n393.assign({
      segments: [],
      output_folder: {}
    });
    const res = await __n393.process();
    expect(res.output).toEqual({});
  });

  it("SaveAudioSegmentsNode saves segments to folder", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "save-seg-"));
    const seg = makeShortSine();
    const __n394 = new SaveAudioSegmentsNode();
    __n394.assign({
      segments: [seg],
      output_folder: { path: tmpDir },
      name_prefix: "test"
    });
    const res = await __n394.process();
    expect(res.output).toBeTruthy();
  });
});

// =====================================================================
// lib-synthesis: pitch envelope paths
// =====================================================================

describe("OscillatorLibNode pitch envelope", () => {
  it("generates with linear pitch envelope", async () => {
    const __n395 = new OscillatorLibNode();
    __n395.assign({
      waveform: "sine",
      frequency: 440,
      amplitude: 0.5,
      duration: 0.1,
      sample_rate: 8000,
      pitch_envelope_amount: 12,
      pitch_envelope_time: 0.05,
      pitch_envelope_curve: "linear"
    });
    const res = await __n395.process();
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
  });

  it("generates with exponential pitch envelope", async () => {
    const __n396 = new OscillatorLibNode();
    __n396.assign({
      waveform: "sine",
      frequency: 440,
      amplitude: 0.5,
      duration: 0.1,
      sample_rate: 8000,
      pitch_envelope_amount: -12,
      pitch_envelope_time: 0.05,
      pitch_envelope_curve: "exponential"
    });
    const res = await __n396.process();
    const out = res.output as { data: string };
    expect(out.data).toBeTruthy();
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

// =====================================================================
// data.ts: asRows edge cases
// =====================================================================

describe("data asRows edge cases", () => {
  it("handles data property on input", async () => {
    const __n402 = new ToListNode();
    __n402.assign({
      dataframe: { data: [{ x: 1 }] }
    });
    const res = await __n402.process();
    expect(res.output).toEqual([{ x: 1 }]);
  });

  it("handles plain array input", async () => {
    const __n403 = new ToListNode();
    __n403.assign({
      dataframe: [{ x: 1 }, { x: 2 }]
    });
    const res = await __n403.process();
    expect(res.output).toEqual([{ x: 1 }, { x: 2 }]);
  });
});
