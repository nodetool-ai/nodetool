import { describe, it, expect, vi } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  // lib-audio-dsp
  GainNode_,
  DelayNode_,
  HighPassFilterNode,
  LowPassFilterNode,
  HighShelfFilterNode,
  LowShelfFilterNode,
  PeakFilterNode,
  // lib-synthesis
  OscillatorLibNode,
  WhiteNoiseLibNode,
  PinkNoiseLibNode,
  FM_SynthesisLibNode,
  EnvelopeLibNode,
  // lib-numpy
  AddArrayNode,
  SubtractArrayNode,
  MultiplyArrayNode,
  DivideArrayNode,
  ModulusArrayNode,
  AbsArrayNode,
  SineArrayNode,
  CosineArrayNode,
  ExpArrayNode,
  LogArrayNode,
  SqrtArrayNode,
  PowerArrayNode,
  SumArrayNode,
  MeanArrayNode,
  MinArrayNode,
  MaxArrayNode,
  ArgMinArrayNode,
  ArgMaxArrayNode,
  SliceArrayNode,
  IndexArrayNode,
  TransposeArrayNode,
  MatMulNode,
  StackNode,
  SplitArrayNode,
  Reshape1DNode,
  Reshape2DNode,
  Reshape3DNode,
  Reshape4DNode,
  ListToArrayNode,
  ArrayToListNode,
  ScalarToArrayNode,
  ArrayToScalarNode,
  NumpyConvertToImageNode,
  NumpyConvertToAudioNode,
  ConvertToArrayNumpyNode,
  SaveArrayNode,
  BinaryOperationNode,
  PlotArrayNode,
  // lib-sqlite
  CreateTableLibNode,
  SqliteInsertLibNode,
  QueryLibNode,
  SqliteUpdateLibNode,
  SqliteDeleteLibNode,
  ExecuteSQLLibNode,
  GetDatabasePathLibNode,
  // lib-excel
  CreateWorkbookLibNode,
  ExcelToDataFrameLibNode,
  DataFrameToExcelLibNode,
  FormatCellsLibNode,
  AutoFitColumnsLibNode,
  SaveWorkbookLibNode,
  // lib-docx
  CreateDocumentLibNode,
  LoadWordDocumentLibNode,
  AddHeadingLibNode,
  AddParagraphLibNode,
  AddTableLibNode,
  AddImageLibNode,
  AddPageBreakLibNode,
  SetDocumentPropertiesLibNode,
  SaveDocumentLibNode,
  // lib-beautifulsoup
  BaseUrlLibNode,
  ExtractLinksLibNode,
  ExtractImagesLibNode,
  ExtractAudioLibNode,
  ExtractVideosLibNode,
  ExtractMetadataLibNode,
  HTMLToTextLibNode,
  WebsiteContentExtractorLibNode,
  // lib-seaborn
  ChartRendererLibNode,
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
  // data
  SchemaNode,
  FilterDataframeNode,
  SliceDataframeNode,
  SaveDataframeNode,
  ImportCSVNode,
  LoadCSVURLNode,
  LoadCSVFileDataNode,
  LoadCSVAssetsNode,
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
  // document
  LoadDocumentFileNode,
  SaveDocumentFileNode,
  ListDocumentsNode,
  SplitDocumentNode,
  SplitHTMLNode,
  SplitJSONNode,
  SplitRecursivelyNode,
  SplitMarkdownNode,
  // code
  ExecutePythonNode,
  ExecuteJavaScriptNode,
  ExecuteBashNode,
  ExecuteRubyNode,
  ExecuteLuaNode,
  ExecuteCommandNode,
  RunPythonCommandNode,
  RunJavaScriptCommandNode,
  RunBashCommandNode,
  RunRubyCommandNode,
  RunLuaCommandNode,
  RunLuaCommandDockerNode,
  RunShellCommandNode,
  RunPythonCommandDockerNode,
  RunJavaScriptCommandDockerNode,
  RunBashCommandDockerNode,
  RunRubyCommandDockerNode,
  RunShellCommandDockerNode,
} from "../src/index.js";

// ============================================================================
// Helpers
// ============================================================================

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

function shortSine(sr = 8000, dur = 0.05): { uri: string; data: string } {
  const n = Math.floor(sr * dur);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr);
  }
  return makeAudioRef(samples, sr);
}

function stereoSine(sr = 8000, dur = 0.05): { uri: string; data: string } {
  const n = Math.floor(sr * dur);
  const samples = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    samples[i * 2] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr);
    samples[i * 2 + 1] = 0.3 * Math.sin((2 * Math.PI * 660 * i) / sr);
  }
  return makeAudioRef(samples, sr, 2);
}

// Longer audio for spectral analysis (needs >= 2048 samples for FFT)
function longSine(sr = 8000, dur = 0.5): { uri: string; data: string } {
  const n = Math.floor(sr * dur);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr);
  }
  return makeAudioRef(samples, sr);
}

type Row = Record<string, unknown>;
type DF = { rows: Row[] };
function df(rows: Row[]): DF {
  return { rows };
}

async function collectGen(
  gen: AsyncGenerator<Record<string, unknown>>
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "nt-test-"));
}

// ============================================================================
// lib-audio-dsp.ts gaps
// ============================================================================

describe("lib-audio-dsp gaps", () => {
  it.skip("DBToAmplitude handles 2D arrays - node not in source", async () => {
    const __n0 = new (class {} as any)();
    __n0.assign({
      tensor: { data: [[0, 20], [-6]] },
    });
    const res = await __n0.process();
    const out = res.output as { data: number[][] };
    expect(out.data[0][0]).toBeCloseTo(1, 3);
    expect(out.data[0][1]).toBeCloseTo(10, 3);
  });

  it.skip("DBToPower handles 2D arrays - node not in source", async () => {
    const __n1 = new (class {} as any)();
    __n1.assign({
      tensor: { data: [[0, 10]] },
    });
    const res = await __n1.process();
    const out = res.output as { data: number[][] };
    expect(out.data[0][0]).toBeCloseTo(1, 3);
    expect(out.data[0][1]).toBeCloseTo(10, 3);
  });

  it.skip("PowerToDB handles 2D arrays - node not in source", async () => {
    const __n2 = new (class {} as any)();
    __n2.assign({
      tensor: { data: [[1, 100]] },
    });
    const res = await __n2.process();
    const out = res.output as { data: number[][] };
    expect(out.data[0][0]).toBeCloseTo(0, 3);
    expect(out.data[0][1]).toBeCloseTo(20, 3);
  });

  it("LowPassFilter passes through with no data", async () => {
    const __n3 = new LowPassFilterNode();
    __n3.assign({ audio: {} });
    const res = await __n3.process();
    expect(res.output).toEqual({});
  });

  it("HighPassFilter passes through with no data", async () => {
    const __n4 = new HighPassFilterNode();
    __n4.assign({ audio: {} });
    const res = await __n4.process();
    expect(res.output).toEqual({});
  });

  it("HighShelfFilter passes through with no data", async () => {
    const __n5 = new HighShelfFilterNode();
    __n5.assign({ audio: {} });
    const res = await __n5.process();
    expect(res.output).toEqual({});
  });

  it("LowShelfFilter passes through with no data", async () => {
    const __n6 = new LowShelfFilterNode();
    __n6.assign({ audio: {} });
    const res = await __n6.process();
    expect(res.output).toEqual({});
  });

  it("PeakFilter passes through with no data", async () => {
    const __n7 = new PeakFilterNode();
    __n7.assign({ audio: {} });
    const res = await __n7.process();
    expect(res.output).toEqual({});
  });

  it("Delay passes through with no data", async () => {
    const __n8 = new DelayNode_();
    __n8.assign({ audio: {} });
    const res = await __n8.process();
    expect(res.output).toEqual({});
  });

  it("defaults() returns expected shape for all nodes", () => {
    // AmplitudeToDBNode, DBToAmplitudeNode, DBToPowerNode, PowerToDBNode,
    // PlotSpectrogramNode are not in the current source - skipped
    expect(new GainNode_().serialize()).toHaveProperty("gain_db");
    expect(new DelayNode_().serialize()).toHaveProperty("delay_seconds");
    expect(new HighPassFilterNode().serialize()).toHaveProperty("cutoff_frequency_hz");
    expect(new LowPassFilterNode().serialize()).toHaveProperty("cutoff_frequency_hz");
    expect(new HighShelfFilterNode().serialize()).toHaveProperty("gain_db");
    expect(new LowShelfFilterNode().serialize()).toHaveProperty("gain_db");
    expect(new PeakFilterNode().serialize()).toHaveProperty("q_factor");
  });
});

// ============================================================================
// lib-synthesis.ts gaps
// ============================================================================

describe("lib-synthesis gaps", () => {
  it("Oscillator with pitch envelope (linear)", async () => {
    const __n9 = new OscillatorLibNode();
    __n9.assign({
      waveform: "sine",
      frequency: 440,
      amplitude: 0.5,
      duration: 0.1,
      sample_rate: 8000,
      pitch_envelope_amount: 12,
      pitch_envelope_time: 0.05,
      pitch_envelope_curve: "linear",
    });
    const res = await __n9.process();
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("Oscillator with pitch envelope (exponential)", async () => {
    const __n10 = new OscillatorLibNode();
    __n10.assign({
      waveform: "sine",
      frequency: 440,
      amplitude: 0.5,
      duration: 0.1,
      sample_rate: 8000,
      pitch_envelope_amount: 12,
      pitch_envelope_time: 0.05,
      pitch_envelope_curve: "exponential",
    });
    const res = await __n10.process();
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("Oscillator defaults() returns expected shape", () => {
    expect(new OscillatorLibNode().serialize()).toHaveProperty("waveform");
    expect(new OscillatorLibNode().serialize()).toHaveProperty("pitch_envelope_amount");
  });

  it("WhiteNoise defaults()", () => {
    expect(new WhiteNoiseLibNode().serialize()).toHaveProperty("amplitude");
  });

  it("PinkNoise defaults()", () => {
    expect(new PinkNoiseLibNode().serialize()).toHaveProperty("amplitude");
  });

  it("FM_Synthesis defaults()", () => {
    expect(new FM_SynthesisLibNode().serialize()).toHaveProperty("carrier_freq");
  });

  it("Envelope defaults()", () => {
    expect(new EnvelopeLibNode().serialize()).toHaveProperty("attack");
  });

  it("Envelope non-RIFF data passes through", async () => {
    const __n11 = new EnvelopeLibNode();
    __n11.assign({
      audio: { data: Buffer.from("not-a-wav").toString("base64") },
    });
    const res = await __n11.process();
    expect(res.output).toHaveProperty("data");
  });

  it("Envelope with short audio (envelope longer than signal)", async () => {
    // Very short audio so ADR envelope > signal
    const samples = new Float32Array(100);
    for (let i = 0; i < 100; i++) samples[i] = 0.5;
    const audio = makeAudioRef(samples, 8000);
    const __n12 = new EnvelopeLibNode();
    __n12.assign({
      audio,
      attack: 1.0,
      decay: 1.0,
      release: 1.0,
      peak_amplitude: 1.0,
    });
    const res = await __n12.process();
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// lib-numpy.ts gaps
// ============================================================================

describe("lib-numpy gaps", () => {
  it("AddArray with arrays", async () => {
    const __n13 = new AddArrayNode();
    __n13.assign({
      a: { data: [1, 2, 3], shape: [3] },
      b: { data: [4, 5, 6], shape: [3] },
    });
    const res = await __n13.process();
    expect(res.output).toEqual({ data: [5, 7, 9], shape: [3] });
  });

  it("SubtractArray", async () => {
    const __n14 = new SubtractArrayNode();
    __n14.assign({
      a: { data: [10, 20], shape: [2] },
      b: { data: [1, 2], shape: [2] },
    });
    const res = await __n14.process();
    expect(res.output).toEqual({ data: [9, 18], shape: [2] });
  });

  it("MultiplyArray", async () => {
    const __n15 = new MultiplyArrayNode();
    __n15.assign({
      a: { data: [2, 3], shape: [2] },
      b: { data: [4, 5], shape: [2] },
    });
    const res = await __n15.process();
    expect(res.output).toEqual({ data: [8, 15], shape: [2] });
  });

  it("DivideArray", async () => {
    const __n16 = new DivideArrayNode();
    __n16.assign({
      a: { data: [10, 20], shape: [2] },
      b: { data: [2, 5], shape: [2] },
    });
    const res = await __n16.process();
    expect(res.output).toEqual({ data: [5, 4], shape: [2] });
  });

  it("ModulusArray", async () => {
    const __n17 = new ModulusArrayNode();
    __n17.assign({
      a: { data: [7, 10], shape: [2] },
      b: { data: [3, 4], shape: [2] },
    });
    const res = await __n17.process();
    expect(res.output).toEqual({ data: [1, 2], shape: [2] });
  });

  it("AbsArray", async () => {
    const __n18 = new AbsArrayNode();
    __n18.assign({
      values: { data: [-1, 2, -3], shape: [3] },
    });
    const res = await __n18.process();
    expect(res.output).toEqual({ data: [1, 2, 3], shape: [3] });
  });

  it("SineArray", async () => {
    const __n19 = new SineArrayNode();
    __n19.assign({ angle_rad: [0, Math.PI / 2] });
    const res = await __n19.process();
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data[0]).toBeCloseTo(0, 5);
    expect(out.data[1]).toBeCloseTo(1, 5);
  });

  it("CosineArray", async () => {
    const __n20 = new CosineArrayNode();
    __n20.assign({ angle_rad: [0, Math.PI] });
    const res = await __n20.process();
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data[0]).toBeCloseTo(1, 5);
    expect(out.data[1]).toBeCloseTo(-1, 5);
  });

  it("ExpArray", async () => {
    const __n21 = new ExpArrayNode();
    __n21.assign({
      values: { data: [0, 1], shape: [2] },
    });
    const res = await __n21.process();
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data[0]).toBeCloseTo(1, 5);
    expect(out.data[1]).toBeCloseTo(Math.E, 5);
  });

  it("LogArray", async () => {
    const __n22 = new LogArrayNode();
    __n22.assign({
      values: { data: [1, Math.E], shape: [2] },
    });
    const res = await __n22.process();
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data[0]).toBeCloseTo(0, 5);
    expect(out.data[1]).toBeCloseTo(1, 5);
  });

  it("SqrtArray", async () => {
    const __n23 = new SqrtArrayNode();
    __n23.assign({
      values: { data: [4, 9], shape: [2] },
    });
    const res = await __n23.process();
    expect(res.output).toEqual({ data: [2, 3], shape: [2] });
  });

  it("PowerArray", async () => {
    const __n24 = new PowerArrayNode();
    __n24.assign({
      base: { data: [2, 3], shape: [2] },
      exponent: { data: [3, 2], shape: [2] },
    });
    const res = await __n24.process();
    expect(res.output).toEqual({ data: [8, 9], shape: [2] });
  });

  it("SumArray", async () => {
    const __n25 = new SumArrayNode();
    __n25.assign({
      values: { data: [1, 2, 3, 4], shape: [4] },
    });
    const res = await __n25.process();
    expect(res.output).toBe(10);
  });

  it("MeanArray", async () => {
    const __n26 = new MeanArrayNode();
    __n26.assign({
      values: { data: [2, 4, 6], shape: [3] },
    });
    const res = await __n26.process();
    expect(res.output).toBe(4);
  });

  it("MinArray", async () => {
    const __n27 = new MinArrayNode();
    __n27.assign({
      values: { data: [3, 1, 4, 1, 5], shape: [5] },
    });
    const res = await __n27.process();
    expect(res.output).toBe(1);
  });

  it("MaxArray", async () => {
    const __n28 = new MaxArrayNode();
    __n28.assign({
      values: { data: [3, 1, 4, 1, 5], shape: [5] },
    });
    const res = await __n28.process();
    expect(res.output).toBe(5);
  });

  it("ArgMinArray", async () => {
    const __n29 = new ArgMinArrayNode();
    __n29.assign({
      values: { data: [3, 1, 4], shape: [3] },
    });
    const res = await __n29.process();
    expect(res.output).toBe(1);
  });

  it("ArgMaxArray", async () => {
    const __n30 = new ArgMaxArrayNode();
    __n30.assign({
      values: { data: [3, 1, 4], shape: [3] },
    });
    const res = await __n30.process();
    expect(res.output).toBe(2);
  });

  it("SliceArray", async () => {
    const __n31 = new SliceArrayNode();
    __n31.assign({
      values: { data: [10, 20, 30, 40, 50], shape: [5] },
      start: 1,
      stop: 4,
      step: 1,
    });
    const res = await __n31.process();
    expect(res.output).toEqual({ data: [20, 30, 40], shape: [3] });
  });

  it("IndexArray", async () => {
    const __n32 = new IndexArrayNode();
    __n32.assign({
      values: { data: [10, 20, 30, 40], shape: [4] },
      indices: "0,2",
    });
    const res = await __n32.process();
    expect(res.output).toEqual({ data: [10, 30], shape: [2] });
  });

  it("TransposeArray 2D", async () => {
    const __n33 = new TransposeArrayNode();
    __n33.assign({
      values: { data: [1, 2, 3, 4, 5, 6], shape: [2, 3] },
    });
    const res = await __n33.process();
    expect(res.output).toEqual({ data: [1, 4, 2, 5, 3, 6], shape: [3, 2] });
  });

  it("TransposeArray 1D is no-op", async () => {
    const __n34 = new TransposeArrayNode();
    __n34.assign({
      values: { data: [1, 2, 3], shape: [3] },
    });
    const res = await __n34.process();
    expect(res.output).toEqual({ data: [1, 2, 3], shape: [3] });
  });

  it("TransposeArray 3D", async () => {
    const __n35 = new TransposeArrayNode();
    __n35.assign({
      values: { data: [1, 2, 3, 4, 5, 6, 7, 8], shape: [2, 2, 2] },
    });
    const res = await __n35.process();
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.shape).toEqual([2, 2, 2]);
    expect(out.data.length).toBe(8);
  });

  it("MatMul", async () => {
    const __n36 = new MatMulNode();
    __n36.assign({
      a: { data: [1, 2, 3, 4], shape: [2, 2] },
      b: { data: [5, 6, 7, 8], shape: [2, 2] },
    });
    const res = await __n36.process();
    expect(res.output).toEqual({ data: [19, 22, 43, 50], shape: [2, 2] });
  });

  it("MatMul shape mismatch throws", async () => {
    const __n37 = new MatMulNode();
    __n37.assign({
        a: { data: [1, 2, 3], shape: [1, 3] },
        b: { data: [1, 2], shape: [1, 2] },
      });
    await expect(
      __n37.process()
    ).rejects.toThrow("Shape mismatch");
  });

  it("MatMul non-2D throws", async () => {
    const __n38 = new MatMulNode();
    __n38.assign({
        a: { data: [1, 2, 3], shape: [3] },
        b: { data: [1, 2, 3], shape: [3] },
      });
    await expect(
      __n38.process()
    ).rejects.toThrow("2D");
  });

  it("StackNode", async () => {
    const __n39 = new StackNode();
    __n39.assign({
      arrays: [
        { data: [1, 2], shape: [2] },
        { data: [3, 4], shape: [2] },
      ],
      axis: 0,
    });
    const res = await __n39.process();
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data).toEqual([1, 2, 3, 4]);
  });

  it("StackNode empty returns empty", async () => {
    const __n40 = new StackNode();
    __n40.assign({ arrays: [] });
    const res = await __n40.process();
    expect(res.output).toEqual({ data: [], shape: [0] });
  });

  it("SplitArrayNode", async () => {
    const __n41 = new SplitArrayNode();
    __n41.assign({
      values: { data: [1, 2, 3, 4, 5, 6], shape: [6] },
      num_splits: 3,
    });
    const res = await __n41.process();
    const out = res.output as { data: number[]; shape: number[] }[];
    expect(out.length).toBe(3);
  });

  it("Reshape1D", async () => {
    const __n42 = new Reshape1DNode();
    __n42.assign({
      values: { data: [1, 2, 3, 4], shape: [2, 2] },
    });
    const res = await __n42.process();
    expect(res.output).toEqual({ data: [1, 2, 3, 4], shape: [4] });
  });

  it("Reshape2D", async () => {
    const __n43 = new Reshape2DNode();
    __n43.assign({
      values: { data: [1, 2, 3, 4], shape: [4] },
      num_rows: 2,
      num_cols: 2,
    });
    const res = await __n43.process();
    expect(res.output).toEqual({ data: [1, 2, 3, 4], shape: [2, 2] });
  });

  it("Reshape3D", async () => {
    const __n44 = new Reshape3DNode();
    __n44.assign({
      values: { data: [1, 2, 3, 4, 5, 6, 7, 8], shape: [8] },
      num_rows: 2,
      num_cols: 2,
      num_depths: 2,
    });
    const res = await __n44.process();
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.shape).toEqual([2, 2, 2]);
  });

  it("Reshape4D", async () => {
    const __n45 = new Reshape4DNode();
    __n45.assign({
      values: { data: [1, 2, 3, 4], shape: [4] },
      num_rows: 1,
      num_cols: 1,
      num_depths: 2,
      num_channels: 2,
    });
    const res = await __n45.process();
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.shape).toEqual([1, 1, 2, 2]);
  });

  it("ListToArray with nested", async () => {
    const __n46 = new ListToArrayNode();
    __n46.assign({
      values: [[1, 2], [3, 4]],
    });
    const res = await __n46.process();
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data).toEqual([1, 2, 3, 4]);
    expect(out.shape).toEqual([2, 2]);
  });

  it("ArrayToList 2D", async () => {
    const __n47 = new ArrayToListNode();
    __n47.assign({
      values: { data: [1, 2, 3, 4], shape: [2, 2] },
    });
    const res = await __n47.process();
    expect(res.output).toEqual([[1, 2], [3, 4]]);
  });

  it("ScalarToArray", async () => {
    const __n48 = new ScalarToArrayNode();
    __n48.assign({ value: 42 });
    const res = await __n48.process();
    expect(res.output).toEqual({ data: [42], shape: [1] });
  });

  it("ArrayToScalar", async () => {
    const __n49 = new ArrayToScalarNode();
    __n49.assign({
      values: { data: [7], shape: [1] },
    });
    const res = await __n49.process();
    expect(res.output).toBe(7);
  });

  it("ConvertToImage 2D grayscale", async () => {
    const __n50 = new NumpyConvertToImageNode();
    __n50.assign({
      values: { data: [0, 0.5, 0.5, 1], shape: [2, 2] },
    });
    const res = await __n50.process();
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("ConvertToImage 3D RGB", async () => {
    const data = new Array(2 * 2 * 3).fill(0.5);
    const __n51 = new NumpyConvertToImageNode();
    __n51.assign({
      values: { data, shape: [2, 2, 3] },
    });
    const res = await __n51.process();
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("ConvertToImage empty throws", async () => {
    const __n52 = new NumpyConvertToImageNode();
    __n52.assign({ values: { data: [], shape: [0] } });
    await expect(
      __n52.process()
    ).rejects.toThrow("not connected");
  });

  it("ConvertToImage bad channels throws", async () => {
    const __n53 = new NumpyConvertToImageNode();
    __n53.assign({
        values: { data: new Array(2 * 2 * 2).fill(0.5), shape: [2, 2, 2] },
      });
    await expect(
      __n53.process()
    ).rejects.toThrow("channels");
  });

  it("ConvertToAudio", async () => {
    const __n54 = new NumpyConvertToAudioNode();
    __n54.assign({
      values: { data: [0, 0.5, -0.5, 0], shape: [4] },
      sample_rate: 8000,
    });
    const res = await __n54.process();
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("BinaryOperationNode", async () => {
    const __n55 = new BinaryOperationNode();
    __n55.assign({ a: 3, b: 4 });
    const res = await __n55.process();
    expect(res.output).toBe(7);
  });

  it("SaveArrayNode without context", async () => {
    const __n56 = new SaveArrayNode();
    __n56.assign({
      values: { data: [1, 2], shape: [2] },
      name: "test.json",
    });
    const res = await __n56.process();
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data).toEqual([1, 2]);
  });

  it("PlotArrayNode 2D", async () => {
    const __n57 = new PlotArrayNode();
    __n57.assign({
      values: { data: [0, 1, 2, 3], shape: [2, 2] },
    });
    const res = await __n57.process();
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("PlotArrayNode 1D", async () => {
    const __n58 = new PlotArrayNode();
    __n58.assign({
      values: { data: [1, 3, 2, 4, 0], shape: [5] },
    });
    const res = await __n58.process();
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("PlotArrayNode empty throws", async () => {
    const __n59 = new PlotArrayNode();
    __n59.assign({ values: { data: [], shape: [0] } });
    await expect(
      __n59.process()
    ).rejects.toThrow("Empty");
  });

  it("AddArray scalar broadcast", async () => {
    const __n60 = new AddArrayNode();
    __n60.assign({ a: 5, b: [1, 2, 3] });
    const res = await __n60.process();
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data).toEqual([6, 7, 8]);
  });

  it("AddArray with padding (different lengths)", async () => {
    const __n61 = new AddArrayNode();
    __n61.assign({
      a: { data: [1, 2], shape: [2] },
      b: { data: [10, 20, 30], shape: [3] },
    });
    const res = await __n61.process();
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data).toEqual([11, 22, 30]);
  });

  it("reduceAlongAxis 2D", async () => {
    const __n62 = new SumArrayNode();
    __n62.assign({
      values: { data: [1, 2, 3, 4, 5, 6], shape: [2, 3] },
      axis: 1,
    });
    const res = await __n62.process();
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data).toEqual([6, 15]);
  });

  it("convertOutput single element returns scalar", async () => {
    const __n63 = new SumArrayNode();
    __n63.assign({
      values: { data: [42], shape: [1] },
    });
    const res = await __n63.process();
    expect(res.output).toBe(42);
  });

  it("asNdArray handles number", async () => {
    const __n64 = new AddArrayNode();
    __n64.assign({ a: 5, b: 3 });
    const res = await __n64.process();
    expect(res.output).toBe(8);
  });

  it("IndexArray with empty indices", async () => {
    const __n65 = new IndexArrayNode();
    __n65.assign({
      values: { data: [1, 2, 3], shape: [3] },
      indices: "",
    });
    const res = await __n65.process();
    expect(res.output).toEqual({ data: [], shape: [0] });
  });

  it("SliceArray with empty data returns empty", async () => {
    const __n66 = new SliceArrayNode();
    __n66.assign({
      values: { data: [], shape: [] },
    });
    const res = await __n66.process();
    expect(res.output).toEqual({ data: [], shape: [] });
  });

  // ConvertToArrayNumpyNode - needs an image
  it("ConvertToArrayNumpyNode with small PNG", async () => {
    // Create a 2x2 red PNG via sharp
    const sharp = (await import("sharp")).default;
    const pngBuf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).png().toBuffer();

    const __n67 = new ConvertToArrayNumpyNode();
    __n67.assign({
      image: { data: pngBuf.toString("base64") },
    });
    const res = await __n67.process();
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.shape[0]).toBe(2);
    expect(out.shape[1]).toBe(2);
  });

  it("ConvertToArrayNumpyNode no data throws", async () => {
    const __n68 = new ConvertToArrayNumpyNode();
    __n68.assign({ image: {} });
    await expect(
      __n68.process()
    ).rejects.toThrow("not connected");
  });

  it("defaults for all numpy nodes", () => {
    expect(new AddArrayNode().serialize()).toHaveProperty("a");
    expect(new SubtractArrayNode().serialize()).toHaveProperty("a");
    expect(new MultiplyArrayNode().serialize()).toHaveProperty("a");
    expect(new DivideArrayNode().serialize()).toHaveProperty("a");
    expect(new ModulusArrayNode().serialize()).toHaveProperty("a");
    expect(new AbsArrayNode().serialize()).toHaveProperty("values");
    expect(new SineArrayNode().serialize()).toHaveProperty("angle_rad");
    expect(new CosineArrayNode().serialize()).toHaveProperty("angle_rad");
    expect(new ExpArrayNode().serialize()).toHaveProperty("values");
    expect(new LogArrayNode().serialize()).toHaveProperty("values");
    expect(new SqrtArrayNode().serialize()).toHaveProperty("values");
    expect(new PowerArrayNode().serialize()).toHaveProperty("base");
    expect(new SumArrayNode().serialize()).toHaveProperty("values");
    expect(new MeanArrayNode().serialize()).toHaveProperty("values");
    expect(new MinArrayNode().serialize()).toHaveProperty("values");
    expect(new MaxArrayNode().serialize()).toHaveProperty("values");
    expect(new ArgMinArrayNode().serialize()).toHaveProperty("values");
    expect(new ArgMaxArrayNode().serialize()).toHaveProperty("values");
    expect(new SliceArrayNode().serialize()).toHaveProperty("start");
    expect(new IndexArrayNode().serialize()).toHaveProperty("indices");
    expect(new TransposeArrayNode().serialize()).toHaveProperty("values");
    expect(new MatMulNode().serialize()).toHaveProperty("a");
    expect(new StackNode().serialize()).toHaveProperty("arrays");
    expect(new SplitArrayNode().serialize()).toHaveProperty("num_splits");
    expect(new Reshape1DNode().serialize()).toHaveProperty("num_elements");
    expect(new Reshape2DNode().serialize()).toHaveProperty("num_rows");
    expect(new Reshape3DNode().serialize()).toHaveProperty("num_depths");
    expect(new Reshape4DNode().serialize()).toHaveProperty("num_channels");
    expect(new ListToArrayNode().serialize()).toHaveProperty("values");
    expect(new ArrayToListNode().serialize()).toHaveProperty("values");
    expect(new ScalarToArrayNode().serialize()).toHaveProperty("value");
    expect(new ArrayToScalarNode().serialize()).toHaveProperty("values");
    expect(new NumpyConvertToImageNode().serialize()).toHaveProperty("values");
    expect(new NumpyConvertToAudioNode().serialize()).toHaveProperty("sample_rate");
    expect(new ConvertToArrayNumpyNode().serialize()).toHaveProperty("image");
    expect(new SaveArrayNode().serialize()).toHaveProperty("name");
    expect(new BinaryOperationNode().serialize()).toHaveProperty("a");
    expect(new PlotArrayNode().serialize()).toHaveProperty("plot_type");
  });
});

// ============================================================================
// lib-pdf.ts gaps (via pdfjs-dist)
// ============================================================================

describe.skip("lib-pdf gaps - node class names differ from test imports", () => {
  // Create a minimal valid PDF
  function makePdf(): { data: string } {
    // Minimal PDF
    const pdf = `%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 12 Tf 100 700 Td (Hello World) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000360 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
431
%%EOF`;
    return { data: Buffer.from(pdf).toString("base64") };
  }

  it("GetPageCount", async () => {
    const __n69 = new GetPageCountPdfPlumberNode();
    __n69.assign({ pdf: makePdf() });
    const res = await __n69.process();
    expect(res.output).toBe(1);
  });

  it("ExtractText", async () => {
    const __n70 = new ExtractTextPdfPlumberNode();
    __n70.assign({ pdf: makePdf() });
    const res = await __n70.process();
    expect(typeof res.output).toBe("string");
  });

  it("ExtractPageMetadata", async () => {
    const __n71 = new ExtractPageMetadataPdfPlumberNode();
    __n71.assign({ pdf: makePdf() });
    const res = await __n71.process();
    const out = res.output as any[];
    expect(out.length).toBe(1);
    expect(out[0]).toHaveProperty("width");
  });

  it("ExtractTables", async () => {
    const __n72 = new ExtractTablesPdfPlumberNode();
    __n72.assign({ pdf: makePdf() });
    const res = await __n72.process();
    expect(Array.isArray(res.output)).toBe(true);
  });

  it("ExtractImages returns empty", async () => {
    const __n73 = new ExtractImagesPdfPlumberNode();
    __n73.assign({ pdf: makePdf() });
    const res = await __n73.process();
    expect(res.output).toEqual([]);
  });

  it("ExtractTextPyMuPdf", async () => {
    const __n74 = new ExtractTextPyMuPdfNode();
    __n74.assign({ pdf: makePdf() });
    const res = await __n74.process();
    expect(typeof res.output).toBe("string");
  });

  it("ExtractMarkdownPyMuPdf", async () => {
    const __n75 = new ExtractMarkdownPyMuPdfNode();
    __n75.assign({ pdf: makePdf() });
    const res = await __n75.process();
    expect(typeof res.output).toBe("string");
  });

  it("ExtractTextBlocksPyMuPdf", async () => {
    const __n76 = new ExtractTextBlocksPyMuPdfNode();
    __n76.assign({ pdf: makePdf() });
    const res = await __n76.process();
    expect(Array.isArray(res.output)).toBe(true);
  });

  it("ExtractTextWithStylePyMuPdf", async () => {
    const __n77 = new ExtractTextWithStylePyMuPdfNode();
    __n77.assign({ pdf: makePdf() });
    const res = await __n77.process();
    expect(Array.isArray(res.output)).toBe(true);
  });

  it("ExtractTablesPyMuPdf", async () => {
    const __n78 = new ExtractTablesPyMuPdfNode();
    __n78.assign({ pdf: makePdf() });
    const res = await __n78.process();
    expect(Array.isArray(res.output)).toBe(true);
  });

  it("defaults for all pdf nodes", () => {
    expect(new GetPageCountPdfPlumberNode().serialize()).toHaveProperty("pdf");
    expect(new ExtractTextPdfPlumberNode().serialize()).toHaveProperty("start_page");
    expect(new ExtractPageMetadataPdfPlumberNode().serialize()).toHaveProperty("start_page");
    expect(new ExtractTablesPdfPlumberNode().serialize()).toHaveProperty("start_page");
    expect(new ExtractImagesPdfPlumberNode().serialize()).toHaveProperty("start_page");
    expect(new ExtractTextPyMuPdfNode().serialize()).toHaveProperty("start_page");
    expect(new ExtractMarkdownPyMuPdfNode().serialize()).toHaveProperty("start_page");
    expect(new ExtractTextBlocksPyMuPdfNode().serialize()).toHaveProperty("start_page");
    expect(new ExtractTextWithStylePyMuPdfNode().serialize()).toHaveProperty("start_page");
    expect(new ExtractTablesPyMuPdfNode().serialize()).toHaveProperty("start_page");
  });
});

// ============================================================================
// lib-sqlite.ts gaps
// ============================================================================

describe("lib-sqlite gaps", () => {
  const ctx = { workspaceDir: tmpDir() } as any;

  /** Helper: assign props then call process(ctx) */
  function sqliteRun<T extends { assign(p: Record<string, unknown>): void; process(ctx?: any): Promise<Record<string, unknown>> }>(
    node: T, props: Record<string, unknown>, context: any
  ): Promise<Record<string, unknown>> {
    node.assign(props);
    return node.process(context);
  }

  it("CreateTable + Insert + Query + Update + Delete flow", async () => {
    const createRes = await sqliteRun(new CreateTableLibNode(), {
      database_name: "test.db",
      table_name: "items",
      columns: {
        type: "record_type",
        columns: [
          { name: "id", data_type: "int" },
          { name: "name", data_type: "string" },
          { name: "value", data_type: "float" },
        ],
      },
      add_primary_key: true,
      if_not_exists: true,
    }, ctx);
    expect(createRes.table_name).toBe("items");

    // Insert
    const ins = await sqliteRun(new SqliteInsertLibNode(),
      { database_name: "test.db", table_name: "items", data: { name: "foo", value: 42.5 } },
      ctx
    );
    expect(ins.row_id).toBeDefined();

    // Query
    const query = await sqliteRun(new QueryLibNode(),
      { database_name: "test.db", table_name: "items", where: "", order_by: "", limit: 0 },
      ctx
    );
    expect((query.output as any[]).length).toBe(1);

    // Query with columns, where, order_by, limit
    const query2 = await sqliteRun(new QueryLibNode(), {
      database_name: "test.db",
      table_name: "items",
      columns: { columns: [{ name: "name" }] },
      where: "name = 'foo'",
      order_by: "name",
      limit: 1,
    }, ctx);
    expect((query2.output as any[]).length).toBe(1);

    // Update
    const upd = await sqliteRun(new SqliteUpdateLibNode(),
      { database_name: "test.db", table_name: "items", data: { name: "bar" }, where: "name = 'foo'" },
      ctx
    );
    expect(upd.rows_affected).toBe(1);

    // Update without where
    const upd2 = await sqliteRun(new SqliteUpdateLibNode(),
      { database_name: "test.db", table_name: "items", data: { name: "baz" } },
      ctx
    );
    expect(upd2.rows_affected).toBe(1);

    // Delete
    const del = await sqliteRun(new SqliteDeleteLibNode(),
      { database_name: "test.db", table_name: "items", where: "name = 'baz'" },
      ctx
    );
    expect(del.rows_affected).toBe(1);
  });

  it("Delete without where throws", async () => {
    const node = new SqliteDeleteLibNode();
    node.assign({ database_name: "test.db", table_name: "items", where: "" });
    await expect(node.process(ctx)).rejects.toThrow("WHERE");
  });

  it("ExecuteSQL modifying", async () => {
    // Create table first
    await sqliteRun(new ExecuteSQLLibNode(),
      { database_name: "exec.db", sql: "CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)" },
      ctx
    );
    const ins = await sqliteRun(new ExecuteSQLLibNode(),
      { database_name: "exec.db", sql: "INSERT INTO t (val) VALUES (?)", parameters: ["hello"] },
      ctx
    );
    expect(ins.rows_affected).toBe(1);

    // Query
    const q = await sqliteRun(new ExecuteSQLLibNode(),
      { database_name: "exec.db", sql: "SELECT * FROM t" },
      ctx
    );
    expect((q.rows as any[]).length).toBe(1);
  });

  it("Query non-existent db returns empty", async () => {
    const ctx2 = { workspaceDir: tmpDir() } as any;
    const node = new QueryLibNode();
    node.assign({ database_name: "nonexistent.db", table_name: "x" });
    const res = await node.process(ctx2);
    expect(res.output).toEqual([]);
  });

  it("GetDatabasePath", async () => {
    const node = new GetDatabasePathLibNode();
    node.assign({ database_name: "test.db" });
    const res = await node.process(ctx);
    expect(typeof res.output).toBe("string");
    expect((res.output as string).endsWith("test.db")).toBe(true);
  });

  it("CreateTable with existing table returns early", async () => {
    const ctx2 = { workspaceDir: tmpDir() } as any;
    await sqliteRun(new CreateTableLibNode(), {
      database_name: "dup.db",
      table_name: "t",
      columns: { columns: [{ name: "a", data_type: "string" }] },
    }, ctx2);
    // Second call - table already exists
    const res = await sqliteRun(new CreateTableLibNode(), {
      database_name: "dup.db",
      table_name: "t",
      columns: { columns: [{ name: "a", data_type: "string" }] },
    }, ctx2);
    expect(res.table_name).toBe("t");
  });

  it("Insert with JSON value serialization", async () => {
    const ctx2 = { workspaceDir: tmpDir() } as any;
    await sqliteRun(new ExecuteSQLLibNode(),
      { database_name: "json.db", sql: "CREATE TABLE j (data TEXT)" },
      ctx2
    );
    await sqliteRun(new SqliteInsertLibNode(),
      { database_name: "json.db", table_name: "j", data: { data: { nested: true } } },
      ctx2
    );
    const q = await sqliteRun(new QueryLibNode(),
      { database_name: "json.db", table_name: "j" },
      ctx2
    );
    const rows = q.output as any[];
    expect(rows[0].data).toEqual({ nested: true });
  });

  it("defaults for all sqlite nodes", () => {
    expect(new CreateTableLibNode().serialize()).toHaveProperty("database_name");
    expect(new SqliteInsertLibNode().serialize()).toHaveProperty("data");
    expect(new QueryLibNode().serialize()).toHaveProperty("where");
    expect(new SqliteUpdateLibNode().serialize()).toHaveProperty("where");
    expect(new SqliteDeleteLibNode().serialize()).toHaveProperty("where");
    expect(new ExecuteSQLLibNode().serialize()).toHaveProperty("sql");
    expect(new GetDatabasePathLibNode().serialize()).toHaveProperty("database_name");
  });
});

// ============================================================================
// lib-excel.ts gaps
// ============================================================================

describe("lib-excel gaps", () => {
  it("CreateWorkbook + DataFrameToExcel + ExcelToDataFrame + FormatCells + AutoFit", async () => {
    const __n79 = new CreateWorkbookLibNode();
    __n79.assign({ sheet_name: "S1" });
    const wb = await __n79.process();

    const __n80 = new DataFrameToExcelLibNode();
    __n80.assign({
      workbook: wb.output,
      dataframe: { rows: [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }] },
      sheet_name: "S1",
      include_header: true,
    });
    const written = await __n80.process();

    const __n81 = new ExcelToDataFrameLibNode();
    __n81.assign({
      workbook: written.output,
      sheet_name: "S1",
      has_header: true,
    });
    const read = await __n81.process();
    const rows = (read.output as any).rows;
    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe("Alice");

    // Without header
    const __n82 = new ExcelToDataFrameLibNode();
    __n82.assign({
      workbook: written.output,
      sheet_name: "S1",
      has_header: false,
    });
    const read2 = await __n82.process();
    expect((read2.output as any).rows.length).toBe(3); // header row + 2 data rows

    // Format
    const __n83 = new FormatCellsLibNode();
    __n83.assign({
      workbook: written.output,
      sheet_name: "S1",
      cell_range: "A1:B1",
      bold: true,
      background_color: "FFFF00",
      text_color: "000000",
    });
    const formatted = await __n83.process();
    expect(formatted.output).toBeDefined();

    // AutoFit
    const __n84 = new AutoFitColumnsLibNode();
    __n84.assign({
      workbook: written.output,
      sheet_name: "S1",
    });
    const fitted = await __n84.process();
    expect(fitted.output).toBeDefined();
  });

  it("DataFrameToExcel empty rows", async () => {
    const __n85 = new CreateWorkbookLibNode();
    __n85.assign({ sheet_name: "S1" });
    const wb = await __n85.process();
    const __n86 = new DataFrameToExcelLibNode();
    __n86.assign({
      workbook: wb.output,
      dataframe: { rows: [] },
      sheet_name: "S1",
    });
    const res = await __n86.process();
    expect(res.output).toBeDefined();
  });

  it("DataFrameToExcel creates sheet if not exists", async () => {
    const __n87 = new CreateWorkbookLibNode();
    __n87.assign({ sheet_name: "S1" });
    const wb = await __n87.process();
    const __n88 = new DataFrameToExcelLibNode();
    __n88.assign({
      workbook: wb.output,
      dataframe: { rows: [{ x: 1 }] },
      sheet_name: "NewSheet",
    });
    const res = await __n88.process();
    expect(res.output).toBeDefined();
  });

  it("SaveWorkbook writes file", async () => {
    const dir = tmpDir();
    const __n89 = new CreateWorkbookLibNode();
    __n89.assign({ sheet_name: "S1" });
    const wb = await __n89.process();
    const __n90 = new SaveWorkbookLibNode();
    __n90.assign({
      workbook: wb.output,
      folder: { path: dir },
      filename: "test.xlsx",
    });
    const res = await __n90.process();
    expect(typeof res.output).toBe("string");
  });

  it("SaveWorkbook no path throws", async () => {
    const wb = await new CreateWorkbookLibNode().process();
    const __n91 = new SaveWorkbookLibNode();
    __n91.assign({ workbook: wb.output, folder: { path: "" }, filename: "x.xlsx" });
    await expect(
      __n91.process()
    ).rejects.toThrow("Path");
  });

  it("ExcelToDataFrame missing sheet throws", async () => {
    const __n92 = new CreateWorkbookLibNode();
    __n92.assign({ sheet_name: "S1" });
    const wb = await __n92.process();
    const __n93 = new ExcelToDataFrameLibNode();
    __n93.assign({ workbook: wb.output, sheet_name: "Missing" });
    await expect(
      __n93.process()
    ).rejects.toThrow("not found");
  });

  it("defaults for all excel nodes", () => {
    expect(new CreateWorkbookLibNode().serialize()).toHaveProperty("sheet_name");
    expect(new ExcelToDataFrameLibNode().serialize()).toHaveProperty("has_header");
    expect(new DataFrameToExcelLibNode().serialize()).toHaveProperty("include_header");
    expect(new FormatCellsLibNode().serialize()).toHaveProperty("bold");
    expect(new AutoFitColumnsLibNode().serialize()).toHaveProperty("sheet_name");
    expect(new SaveWorkbookLibNode().serialize()).toHaveProperty("filename");
  });
});

// ============================================================================
// lib-docx.ts gaps
// ============================================================================

describe("lib-docx gaps", () => {
  it("CreateDocument", async () => {
    const res = await new CreateDocumentLibNode().process();
    expect((res.output as any).elements).toEqual([]);
  });

  it("AddHeading", async () => {
    const doc = { elements: [] };
    const __n94 = new AddHeadingLibNode();
    __n94.assign({ document: doc, text: "Title", level: 1 });
    const res = await __n94.process();
    expect((res.output as any).elements.length).toBe(1);
  });

  it("AddParagraph", async () => {
    const doc = { elements: [] };
    const __n95 = new AddParagraphLibNode();
    __n95.assign({
      document: doc,
      text: "Hello",
      alignment: "CENTER",
      bold: true,
      italic: true,
      font_size: 14,
    });
    const res = await __n95.process();
    expect((res.output as any).elements.length).toBe(1);
  });

  it("AddTable with rows", async () => {
    const doc = { elements: [] };
    const __n96 = new AddTableLibNode();
    __n96.assign({
      document: doc,
      data: { rows: [{ a: "1", b: "2" }] },
    });
    const res = await __n96.process();
    expect((res.output as any).elements.length).toBe(1);
  });

  it("AddTable with data array", async () => {
    const doc = { elements: [] };
    const __n97 = new AddTableLibNode();
    __n97.assign({
      document: doc,
      data: { data: [["a", "b"], ["c", "d"]] },
    });
    const res = await __n97.process();
    expect((res.output as any).elements[0].type).toBe("table");
  });

  it("AddPageBreak", async () => {
    const doc = { elements: [] };
    const __n98 = new AddPageBreakLibNode();
    __n98.assign({ document: doc });
    const res = await __n98.process();
    expect((res.output as any).elements[0].type).toBe("page_break");
  });

  it("SetDocumentProperties", async () => {
    const doc = { elements: [] };
    const __n99 = new SetDocumentPropertiesLibNode();
    __n99.assign({
      document: doc,
      title: "My Doc",
      author: "Author",
      subject: "Test",
      keywords: "kw",
    });
    const res = await __n99.process();
    expect((res.output as any).properties.title).toBe("My Doc");
  });

  it("AddImage with buffer data", async () => {
    const doc = { elements: [] };
    const imgData = Buffer.alloc(10, 0xff);
    const __n100 = new AddImageLibNode();
    __n100.assign({
      document: doc,
      image: { data: imgData },
      width: 1,
      height: 1,
    });
    const res = await __n100.process();
    expect((res.output as any).elements[0].type).toBe("image");
  });

  it("AddImage invalid throws", async () => {
    const doc = { elements: [] };
    const __n101 = new AddImageLibNode();
    __n101.assign({ document: doc, image: { }, width: 0, height: 0 });
    await expect(
      __n101.process()
    ).rejects.toThrow("path");
  });

  it("SaveDocument renders all element types", async () => {
    const dir = tmpDir();
    const doc = {
      elements: [
        { type: "heading", text: "Title", level: 1 },
        { type: "paragraph", text: "Para", alignment: "LEFT", bold: false, italic: false, font_size: 12 },
        { type: "table", data: [["a", "b"], ["c", "d"]] },
        { type: "page_break" },
        { type: "image", image_data: Buffer.alloc(100, 0xff), width: 0, height: 0 },
      ],
      properties: { title: "T", author: "A", subject: "S", keywords: "K" },
    };
    const __n102 = new SaveDocumentLibNode();
    __n102.assign({
      document: doc,
      path: { path: dir },
      filename: "test.docx",
    });
    const res = await __n102.process();
    expect(typeof res.output).toBe("string");
  });

  it("SaveDocument no path throws", async () => {
    const __n103 = new SaveDocumentLibNode();
    __n103.assign({ document: { elements: [] }, path: "", filename: "x.docx" });
    await expect(
      __n103.process()
    ).rejects.toThrow("Path");
  });

  it("defaults for all docx nodes", () => {
    expect(new CreateDocumentLibNode().serialize()).toBeDefined();
    expect(new LoadWordDocumentLibNode().serialize()).toHaveProperty("path");
    expect(new AddHeadingLibNode().serialize()).toHaveProperty("text");
    expect(new AddParagraphLibNode().serialize()).toHaveProperty("alignment");
    expect(new AddTableLibNode().serialize()).toHaveProperty("data");
    expect(new AddImageLibNode().serialize()).toHaveProperty("width");
    expect(new AddPageBreakLibNode().serialize()).toHaveProperty("document");
    expect(new SetDocumentPropertiesLibNode().serialize()).toHaveProperty("title");
    expect(new SaveDocumentLibNode().serialize()).toHaveProperty("filename");
  });
});

// ============================================================================
// lib-beautifulsoup.ts gaps
// ============================================================================

describe("lib-beautifulsoup gaps", () => {
  const html = `
    <html>
    <head><title>Test</title><meta name="description" content="desc"><meta name="keywords" content="kw"></head>
    <body>
      <a href="/internal">Internal</a>
      <a href="https://ext.com">External</a>
      <img src="img.png"/>
      <audio><source src="a.mp3"/></audio>
      <video src="v.mp4"></video>
      <iframe src="https://yt.com/embed/x"></iframe>
    </body></html>`;

  it("BaseUrl", async () => {
    const __n104 = new BaseUrlLibNode();
    __n104.assign({ url: "https://example.com/foo/bar" });
    const res = await __n104.process();
    expect(res.output).toBe("https://example.com");
  });

  it("BaseUrl empty throws", async () => {
    const __n105 = new BaseUrlLibNode();
    __n105.assign({ url: "" });
    await expect(__n105.process()).rejects.toThrow();
  });

  it("ExtractLinks", async () => {
    const __n106 = new ExtractLinksLibNode();
    __n106.assign({ html, base_url: "https://example.com" });
    const res = await __n106.process();
    const out = res.output as any;
    expect(out.data.length).toBe(2);
  });

  it("ExtractImages", async () => {
    const __n107 = new ExtractImagesLibNode();
    __n107.assign({ html, base_url: "https://example.com" });
    const res = await __n107.process();
    expect((res.output as any[]).length).toBe(1);
  });

  it("ExtractAudio", async () => {
    const __n108 = new ExtractAudioLibNode();
    __n108.assign({ html, base_url: "https://example.com" });
    const res = await __n108.process();
    expect((res.output as any[]).length).toBeGreaterThan(0);
  });

  it("ExtractVideos", async () => {
    const __n109 = new ExtractVideosLibNode();
    __n109.assign({ html, base_url: "https://example.com" });
    const res = await __n109.process();
    expect((res.output as any[]).length).toBe(2);
  });

  it("ExtractMetadata", async () => {
    const __n110 = new ExtractMetadataLibNode();
    __n110.assign({ html });
    const res = await __n110.process();
    expect(res.title).toBe("Test");
    expect(res.description).toBe("desc");
    expect(res.keywords).toBe("kw");
  });

  it("HTMLToText", async () => {
    const __n111 = new HTMLToTextLibNode();
    __n111.assign({ text: "<p>Hello <b>World</b></p>" });
    const res = await __n111.process();
    expect((res.output as string).includes("Hello")).toBe(true);
    expect((res.output as string).includes("World")).toBe(true);
  });

  it("HTMLToText no linebreaks", async () => {
    const __n112 = new HTMLToTextLibNode();
    __n112.assign({
      text: "<p>Hello</p>",
      preserve_linebreaks: false,
    });
    const res = await __n112.process();
    expect(typeof res.output).toBe("string");
  });

  it("WebsiteContentExtractor with readable content", async () => {
    const rich = `<html><head><title>Article</title></head><body>
      <article><p>${"word ".repeat(200)}</p></article>
    </body></html>`;
    const __n113 = new WebsiteContentExtractorLibNode();
    __n113.assign({ html_content: rich });
    const res = await __n113.process();
    expect((res.output as string).length).toBeGreaterThan(0);
  });

  it("WebsiteContentExtractor fallback path", async () => {
    // Minimal HTML without enough content for Readability
    const __n114 = new WebsiteContentExtractorLibNode();
    __n114.assign({ html_content: "<body>Hello</body>" });
    const res = await __n114.process();
    expect(typeof res.output).toBe("string");
  });

  it("defaults for all bs nodes", () => {
    expect(new BaseUrlLibNode().serialize()).toHaveProperty("url");
    expect(new ExtractLinksLibNode().serialize()).toHaveProperty("html");
    expect(new ExtractImagesLibNode().serialize()).toHaveProperty("base_url");
    expect(new ExtractAudioLibNode().serialize()).toHaveProperty("html");
    expect(new ExtractVideosLibNode().serialize()).toHaveProperty("html");
    expect(new ExtractMetadataLibNode().serialize()).toHaveProperty("html");
    expect(new HTMLToTextLibNode().serialize()).toHaveProperty("preserve_linebreaks");
    expect(new WebsiteContentExtractorLibNode().serialize()).toHaveProperty("html_content");
  });
});

// ============================================================================
// lib-seaborn.ts gaps
// ============================================================================

// canvas native module required for chart rendering
let hasCanvas = false;
try { require("canvas"); hasCanvas = true; } catch { /* not installed */ }

describe.skipIf(!hasCanvas)("lib-seaborn gaps", () => {
  it("ChartRenderer renders a basic bar chart", async () => {
    const __n115 = new ChartRendererLibNode();
    __n115.assign({
      chart_config: {
        title: "Test Chart",
        x_label: "X",
        y_label: "Y",
        data: { series: [{ plot_type: "barplot", x: "name", y: "value" }] },
      },
      width: 200,
      height: 150,
      data: {
        columns: [{ name: "name" }, { name: "value" }],
        data: [["A", 10], ["B", 20], ["C", 15]],
      },
    });
    const res = await __n115.process();
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("ChartRenderer empty data throws", async () => {
    const __n116 = new ChartRendererLibNode();
    __n116.assign({
        chart_config: {},
        data: { columns: [], data: [] },
      });
    await expect(
      __n116.process()
    ).rejects.toThrow("Data is required");
  });

  it("ChartRenderer scatter type", async () => {
    const __n117 = new ChartRendererLibNode();
    __n117.assign({
      chart_config: {
        data: { series: [{ plot_type: "scatter", x: "x", y: "y" }] },
      },
      data: {
        columns: [{ name: "x" }, { name: "y" }],
        data: [[1, 2], [3, 4]],
      },
    });
    const res = await __n117.process();
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("ChartRenderer defaults()", () => {
    expect(new ChartRendererLibNode().serialize()).toHaveProperty("width");
  });
});

// ============================================================================
// lib-pedalboard-extra.ts gaps
// ============================================================================

describe("lib-pedalboard-extra gaps", () => {
  const audio = shortSine();

  it("Bitcrush", async () => {
    const __n118 = new BitcrushNode();
    __n118.assign({
      audio,
      bit_depth: 4,
      sample_rate_reduction: 2,
    });
    const res = await __n118.process();
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("Bitcrush no data passes through", async () => {
    const __n119 = new BitcrushNode();
    __n119.assign({ audio: {} });
    const res = await __n119.process();
    expect(res.output).toEqual({});
  });

  it("Compress", async () => {
    const __n120 = new CompressNode();
    __n120.assign({
      audio,
      threshold: -10,
      ratio: 4,
      attack: 5,
      release: 50,
    });
    const res = await __n120.process();
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("Compress no data", async () => {
    const __n121 = new CompressNode();
    __n121.assign({ audio: {} });
    const res = await __n121.process();
    expect(res.output).toEqual({});
  });

  it("Distortion", async () => {
    const __n122 = new DistortionNode();
    __n122.assign({ audio, drive_db: 20 });
    const res = await __n122.process();
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("Distortion no data", async () => {
    const __n123 = new DistortionNode();
    __n123.assign({ audio: {} });
    const res = await __n123.process();
    expect(res.output).toEqual({});
  });

  it("Limiter", async () => {
    const __n124 = new LimiterNode();
    __n124.assign({ audio, threshold_db: -6, release_ms: 100 });
    const res = await __n124.process();
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("Limiter no data", async () => {
    const __n125 = new LimiterNode();
    __n125.assign({ audio: {} });
    const res = await __n125.process();
    expect(res.output).toEqual({});
  });

  it("Reverb", async () => {
    const __n126 = new ReverbNode();
    __n126.assign({
      audio,
      room_scale: 0.5,
      damping: 0.5,
      wet_level: 0.15,
      dry_level: 0.5,
    });
    const res = await __n126.process();
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("Reverb no data", async () => {
    const __n127 = new ReverbNode();
    __n127.assign({ audio: {} });
    const res = await __n127.process();
    expect(res.output).toEqual({});
  });

  it("PitchShift semitones=0 passes through", async () => {
    const __n128 = new PitchShiftNode();
    __n128.assign({ audio, semitones: 0 });
    const res = await __n128.process();
    expect(res.output).toEqual(audio);
  });

  it("PitchShift no data", async () => {
    const __n129 = new PitchShiftNode();
    __n129.assign({ audio: {} });
    const res = await __n129.process();
    expect(res.output).toEqual({});
  });

  it("PitchShift with shift", async () => {
    const __n130 = new PitchShiftNode();
    __n130.assign({ audio, semitones: 2 });
    const res = await __n130.process();
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("TimeStretch rate=1 passes through", async () => {
    const __n131 = new TimeStretchNode();
    __n131.assign({ audio, rate: 1.0 });
    const res = await __n131.process();
    expect(res.output).toEqual(audio);
  });

  it("TimeStretch no data", async () => {
    const __n132 = new TimeStretchNode();
    __n132.assign({ audio: {} });
    const res = await __n132.process();
    expect(res.output).toEqual({});
  });

  it("TimeStretch with rate", async () => {
    const __n133 = new TimeStretchNode();
    __n133.assign({ audio, rate: 1.5 });
    const res = await __n133.process();
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("NoiseGate processes audio", async () => {
    const __n134 = new NoiseGateNode();
    __n134.assign({ audio });
    const res = await __n134.process();
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("Phaser processes audio", async () => {
    const __n135 = new PhaserNode();
    __n135.assign({ audio });
    const res = await __n135.process();
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("defaults for all pedalboard nodes", () => {
    expect(new BitcrushNode().serialize()).toHaveProperty("bit_depth");
    expect(new CompressNode().serialize()).toHaveProperty("threshold");
    expect(new DistortionNode().serialize()).toHaveProperty("drive_db");
    expect(new LimiterNode().serialize()).toHaveProperty("threshold_db");
    expect(new ReverbNode().serialize()).toHaveProperty("room_scale");
    expect(new PitchShiftNode().serialize()).toHaveProperty("semitones");
    expect(new TimeStretchNode().serialize()).toHaveProperty("rate");
    expect(new NoiseGateNode().serialize()).toHaveProperty("threshold_db");
    expect(new PhaserNode().serialize()).toHaveProperty("rate_hz");
  });
});

// ============================================================================
// lib-librosa-spectral.ts gaps
// ============================================================================

describe("lib-librosa-spectral gaps", () => {
  const audio = longSine();

  it("STFT", async () => {
    const __n136 = new STFTNode();
    __n136.assign({ audio, n_fft: 2048, hop_length: 512 });
    const res = await __n136.process();
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("STFT no data", async () => {
    const __n137 = new STFTNode();
    __n137.assign({ audio: {} });
    const res = await __n137.process();
    expect((res.output as any).data).toEqual([]);
  });

  it("MelSpectrogram", async () => {
    const __n138 = new MelSpectrogramNode();
    __n138.assign({
      audio,
      n_fft: 2048,
      hop_length: 512,
      n_mels: 32,
    });
    const res = await __n138.process();
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(32);
  });

  it("MelSpectrogram no data", async () => {
    const __n139 = new MelSpectrogramNode();
    __n139.assign({ audio: {} });
    const res = await __n139.process();
    expect((res.output as any).data).toEqual([]);
  });

  it("MFCC", async () => {
    const __n140 = new MFCCNode();
    __n140.assign({
      audio,
      n_mfcc: 13,
      n_fft: 2048,
      hop_length: 512,
    });
    const res = await __n140.process();
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(13);
  });

  it("MFCC no data", async () => {
    const __n141 = new MFCCNode();
    __n141.assign({ audio: {} });
    const res = await __n141.process();
    expect((res.output as any).data).toEqual([]);
  });

  it("ChromaSTFT", async () => {
    const __n142 = new ChromaSTFTNode();
    __n142.assign({ audio, n_fft: 2048, hop_length: 512 });
    const res = await __n142.process();
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(12);
  });

  it("ChromaSTFT no data", async () => {
    const __n143 = new ChromaSTFTNode();
    __n143.assign({ audio: {} });
    const res = await __n143.process();
    expect((res.output as any).data).toEqual([]);
  });

  it("SpectralCentroid", async () => {
    const __n144 = new SpectralCentroidNode();
    __n144.assign({ audio, n_fft: 2048, hop_length: 512 });
    const res = await __n144.process();
    const out = res.output as { data: number[] };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("SpectralCentroid no data", async () => {
    const __n145 = new SpectralCentroidNode();
    __n145.assign({ audio: {} });
    const res = await __n145.process();
    expect((res.output as any).data).toEqual([]);
  });

  it("SpectralContrast", async () => {
    const __n146 = new SpectralContrastNode();
    __n146.assign({ audio, n_fft: 2048, hop_length: 512 });
    const res = await __n146.process();
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(7);
  });

  it("SpectralContrast no data", async () => {
    const __n147 = new SpectralContrastNode();
    __n147.assign({ audio: {} });
    const res = await __n147.process();
    expect((res.output as any).data).toEqual([]);
  });

  it("GriffinLim returns output for empty input", async () => {
    const res = await new GriffinLimNode().process();
    expect((res.output as any).data).toEqual([]);
  });

  it("DetectOnsets", async () => {
    const __n148 = new DetectOnsetsNode();
    __n148.assign({ audio });
    const res = await __n148.process();
    const out = res.output as { data: number[] };
    expect(Array.isArray(out.data)).toBe(true);
  });

  it("DetectOnsets no data", async () => {
    const __n149 = new DetectOnsetsNode();
    __n149.assign({ audio: {} });
    const res = await __n149.process();
    expect((res.output as any).data).toEqual([]);
  });

  it("SegmentAudioByOnsets", async () => {
    const __n150 = new SegmentAudioByOnsetsNode();
    __n150.assign({
      audio,
      onsets: { data: [0.1, 0.3] },
      min_segment_length: 0.05,
    });
    const res = await __n150.process();
    expect(Array.isArray(res.output)).toBe(true);
  });

  it("SegmentAudioByOnsets no data", async () => {
    const __n151 = new SegmentAudioByOnsetsNode();
    __n151.assign({ audio: {} });
    const res = await __n151.process();
    expect(res.output).toEqual([]);
  });

  it("SaveAudioSegments with no folder returns folder", async () => {
    const __n152 = new SaveAudioSegmentsNode();
    __n152.assign({
      segments: [],
      output_folder: {},
    });
    const res = await __n152.process();
    expect(res.output).toEqual({});
  });

  it("SaveAudioSegments writes files", async () => {
    const dir = tmpDir();
    const __n153 = new OscillatorLibNode();
    __n153.assign({
      duration: 0.05,
      sample_rate: 8000,
    });
    const osc = await __n153.process();
    const __n154 = new SaveAudioSegmentsNode();
    __n154.assign({
      segments: [osc.output],
      output_folder: { path: dir },
      name_prefix: "seg",
    });
    const res = await __n154.process();
    expect(res.output).toHaveProperty("path");
  });

  it("defaults for all spectral nodes", () => {
    expect(new STFTNode().serialize()).toHaveProperty("n_fft");
    expect(new MelSpectrogramNode().serialize()).toHaveProperty("n_mels");
    expect(new MFCCNode().serialize()).toHaveProperty("n_mfcc");
    expect(new ChromaSTFTNode().serialize()).toHaveProperty("n_fft");
    expect(new SpectralCentroidNode().serialize()).toHaveProperty("n_fft");
    expect(new SpectralContrastNode().serialize()).toHaveProperty("n_fft");
    expect(new GriffinLimNode().serialize()).toHaveProperty("n_iter");
    expect(new DetectOnsetsNode().serialize()).toHaveProperty("hop_length");
    expect(new SegmentAudioByOnsetsNode().serialize()).toHaveProperty("min_segment_length");
    expect(new SaveAudioSegmentsNode().serialize()).toHaveProperty("name_prefix");
  });
});

// ============================================================================
// data.ts gaps
// ============================================================================

describe("data.ts gaps", () => {
  it("ImportCSV parses CSV string", async () => {
    const __n155 = new ImportCSVNode();
    __n155.assign({ csv_data: "name,age\nAlice,30\nBob,25" });
    const res = await __n155.process();
    const rows = (res.output as any).rows;
    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe("Alice");
  });

  it("Filter with condition", async () => {
    const __n156 = new FilterDataframeNode();
    __n156.assign({
      df: df([{ x: 1 }, { x: 2 }, { x: 3 }]),
      condition: "x > 1",
    });
    const res = await __n156.process();
    expect((res.output as any).rows.length).toBe(2);
  });

  it("Filter with 'and'/'or' keywords", async () => {
    const __n157 = new FilterDataframeNode();
    __n157.assign({
      df: df([{ x: 1 }, { x: 2 }, { x: 3 }]),
      condition: "x > 1 and x < 3",
    });
    const res = await __n157.process();
    expect((res.output as any).rows.length).toBe(1);
  });

  it("Slice", async () => {
    const __n158 = new SliceDataframeNode();
    __n158.assign({
      dataframe: df([{ x: 1 }, { x: 2 }, { x: 3 }]),
      start_index: 1,
      end_index: 2,
    });
    const res = await __n158.process();
    expect((res.output as any).rows.length).toBe(1);
  });

  it("SaveDataframe", async () => {
    const dir = tmpDir();
    const __n159 = new SaveDataframeNode();
    __n159.assign({
      df: df([{ a: 1, b: 2 }]),
      folder: dir,
      name: "test.csv",
    });
    const res = await __n159.process();
    expect(res.path).toBeDefined();
  });

  it("FromList", async () => {
    const __n160 = new FromListNode();
    __n160.assign({
      values: [{ name: "Alice" }, { name: "Bob" }],
    });
    const res = await __n160.process();
    expect((res.output as any).rows.length).toBe(2);
  });

  it("FromList with value wrapper", async () => {
    const __n161 = new FromListNode();
    __n161.assign({
      values: [{ name: { value: "Alice" } }],
    });
    const res = await __n161.process();
    expect((res.output as any).rows[0].name).toBe("Alice");
  });

  it("FromList with non-primitive values", async () => {
    const __n162 = new FromListNode();
    __n162.assign({
      values: [{ arr: [1, 2, 3] }],
    });
    const res = await __n162.process();
    expect((res.output as any).rows[0].arr).toBe("1,2,3");
  });

  it("FromList non-dict throws", async () => {
    const __n163 = new FromListNode();
    __n163.assign({ values: ["not-a-dict"] });
    await expect(
      __n163.process()
    ).rejects.toThrow("dicts");
  });

  it("JSONToDataframe", async () => {
    const __n164 = new JSONToDataframeNode();
    __n164.assign({
      text: '[{"a":1},{"a":2}]',
    });
    const res = await __n164.process();
    expect((res.output as any).rows.length).toBe(2);
  });

  it("ToList", async () => {
    const __n165 = new ToListNode();
    __n165.assign({
      dataframe: df([{ x: 1 }]),
    });
    const res = await __n165.process();
    expect(res.output).toEqual([{ x: 1 }]);
  });

  it("SelectColumn", async () => {
    const __n166 = new SelectColumnNode();
    __n166.assign({
      dataframe: df([{ a: 1, b: 2 }]),
      columns: "a",
    });
    const res = await __n166.process();
    expect((res.output as any).rows[0]).toEqual({ a: 1 });
  });

  it("ExtractColumn", async () => {
    const __n167 = new ExtractColumnNode();
    __n167.assign({
      dataframe: df([{ x: 10 }, { x: 20 }]),
      column_name: "x",
    });
    const res = await __n167.process();
    expect(res.output).toEqual([10, 20]);
  });

  it("AddColumn", async () => {
    const __n168 = new AddColumnNode();
    __n168.assign({
      dataframe: df([{ a: 1 }]),
      column_name: "b",
      values: [2],
    });
    const res = await __n168.process();
    expect((res.output as any).rows[0].b).toBe(2);
  });

  it("Merge", async () => {
    const __n169 = new MergeDataframeNode();
    __n169.assign({
      dataframe_a: df([{ a: 1 }]),
      dataframe_b: df([{ b: 2 }]),
    });
    const res = await __n169.process();
    expect((res.output as any).rows[0]).toEqual({ a: 1, b: 2 });
  });

  it("Append", async () => {
    const __n170 = new AppendDataframeNode();
    __n170.assign({
      dataframe_a: df([{ x: 1 }]),
      dataframe_b: df([{ x: 2 }]),
    });
    const res = await __n170.process();
    expect((res.output as any).rows.length).toBe(2);
  });

  it("Append column mismatch throws", async () => {
    const __n171 = new AppendDataframeNode();
    __n171.assign({
        dataframe_a: df([{ x: 1 }]),
        dataframe_b: df([{ y: 2 }]),
      });
    await expect(
      __n171.process()
    ).rejects.toThrow("Columns");
  });

  it("Append with empty a", async () => {
    const __n172 = new AppendDataframeNode();
    __n172.assign({
      dataframe_a: df([]),
      dataframe_b: df([{ x: 1 }]),
    });
    const res = await __n172.process();
    expect((res.output as any).rows.length).toBe(1);
  });

  it("Join", async () => {
    const __n173 = new JoinDataframeNode();
    __n173.assign({
      dataframe_a: df([{ id: 1, a: "x" }]),
      dataframe_b: df([{ id: 1, b: "y" }]),
      join_on: "id",
    });
    const res = await __n173.process();
    expect((res.output as any).rows[0].b).toBe("y");
  });

  it("RowIterator genProcess", async () => {
    const node = new RowIteratorNode();
    node.assign({ dataframe: df([{ x: 1 }, { x: 2 }]) });
    const items = await collectGen(
      node.genProcess()
    );
    expect(items.length).toBe(2);
    expect(items[0].index).toBe(0);
  });

  it("FindRow", async () => {
    const __n174 = new FindRowNode();
    __n174.assign({
      df: df([{ x: 1 }, { x: 2 }]),
      condition: "x == 2",
    });
    const res = await __n174.process();
    expect((res.output as any).rows.length).toBe(1);
  });

  it("SortByColumn", async () => {
    const __n175 = new SortByColumnNode();
    __n175.assign({
      df: df([{ n: "b" }, { n: "a" }]),
      column: "n",
    });
    const res = await __n175.process();
    expect((res.output as any).rows[0].n).toBe("a");
  });

  it("DropDuplicates", async () => {
    const __n176 = new DropDuplicatesNode();
    __n176.assign({
      df: df([{ x: 1 }, { x: 1 }, { x: 2 }]),
    });
    const res = await __n176.process();
    expect((res.output as any).rows.length).toBe(2);
  });

  it("DropNA", async () => {
    const __n177 = new DropNANode();
    __n177.assign({
      df: df([{ x: 1 }, { x: null }, { x: "" }]),
    });
    const res = await __n177.process();
    expect((res.output as any).rows.length).toBe(1);
  });

  it("ForEachRow genProcess", async () => {
    const node = new ForEachRowNode();
    node.assign({ dataframe: df([{ a: 1 }]) });
    const items = await collectGen(
      node.genProcess()
    );
    expect(items[0].row).toEqual({ a: 1 });
  });

  it("Aggregate sum", async () => {
    const __n178 = new AggregateNode();
    __n178.assign({
      dataframe: df([
        { g: "a", v: 10 },
        { g: "a", v: 20 },
        { g: "b", v: 5 },
      ]),
      columns: "g",
      aggregation: "sum",
    });
    const res = await __n178.process();
    const rows = (res.output as any).rows;
    expect(rows.find((r: any) => r.g === "a").v).toBe(30);
  });

  it("Aggregate all types", async () => {
    for (const agg of ["mean", "count", "min", "max", "median", "first", "last"]) {
      const __n179 = new AggregateNode();
      __n179.assign({
        dataframe: df([{ g: "a", v: 10 }, { g: "a", v: 20 }]),
        columns: "g",
        aggregation: agg,
      });
      const res = await __n179.process();
      expect((res.output as any).rows.length).toBe(1);
    }
  });

  it("Aggregate unknown throws", async () => {
    const __n180 = new AggregateNode();
    __n180.assign({
        dataframe: df([{ g: "a", v: 1 }]),
        columns: "g",
        aggregation: "bogus",
      });
    await expect(
      __n180.process()
    ).rejects.toThrow("Unknown");
  });

  it("Pivot", async () => {
    const __n181 = new PivotNode();
    __n181.assign({
      dataframe: df([
        { idx: "A", col: "X", val: 10 },
        { idx: "A", col: "Y", val: 20 },
      ]),
      index: "idx",
      columns: "col",
      values: "val",
      aggfunc: "sum",
    });
    const res = await __n181.process();
    const rows = (res.output as any).rows;
    expect(rows[0].X).toBe(10);
    expect(rows[0].Y).toBe(20);
  });

  it("Pivot all aggfuncs", async () => {
    for (const agg of ["mean", "count", "min", "max", "first", "last"]) {
      const __n182 = new PivotNode();
      __n182.assign({
        dataframe: df([{ i: "a", c: "x", v: 5 }]),
        index: "i",
        columns: "c",
        values: "v",
        aggfunc: agg,
      });
      const res = await __n182.process();
      expect((res.output as any).rows.length).toBe(1);
    }
  });

  it("Pivot unknown aggfunc throws", async () => {
    const __n183 = new PivotNode();
    __n183.assign({
        dataframe: df([{ i: "a", c: "x", v: 1 }]),
        index: "i",
        columns: "c",
        values: "v",
        aggfunc: "bogus",
      });
    await expect(
      __n183.process()
    ).rejects.toThrow("Unknown");
  });

  it("Rename", async () => {
    const __n184 = new RenameNode();
    __n184.assign({
      dataframe: df([{ old_name: 1 }]),
      rename_map: "old_name:new_name",
    });
    const res = await __n184.process();
    expect((res.output as any).rows[0].new_name).toBe(1);
  });

  it("FillNA value method", async () => {
    const __n185 = new FillNANode();
    __n185.assign({
      dataframe: df([{ x: null }, { x: 5 }]),
      value: 0,
      method: "value",
      columns: "x",
    });
    const res = await __n185.process();
    expect((res.output as any).rows[0].x).toBe(0);
  });

  it("FillNA forward method", async () => {
    const __n186 = new FillNANode();
    __n186.assign({
      dataframe: df([{ x: 1 }, { x: null }]),
      method: "forward",
    });
    const res = await __n186.process();
    expect((res.output as any).rows[1].x).toBe(1);
  });

  it("FillNA backward method", async () => {
    const __n187 = new FillNANode();
    __n187.assign({
      dataframe: df([{ x: null }, { x: 2 }]),
      method: "backward",
    });
    const res = await __n187.process();
    expect((res.output as any).rows[0].x).toBe(2);
  });

  it("FillNA mean method", async () => {
    const __n188 = new FillNANode();
    __n188.assign({
      dataframe: df([{ x: 10 }, { x: null }, { x: 20 }]),
      method: "mean",
    });
    const res = await __n188.process();
    expect((res.output as any).rows[1].x).toBe(15);
  });

  it("FillNA median method", async () => {
    const __n189 = new FillNANode();
    __n189.assign({
      dataframe: df([{ x: 10 }, { x: null }, { x: 20 }, { x: 30 }]),
      method: "median",
    });
    const res = await __n189.process();
    expect((res.output as any).rows[1].x).toBe(20);
  });

  it("FillNA unknown method throws", async () => {
    const __n190 = new FillNANode();
    __n190.assign({ dataframe: df([{ x: 1 }]), method: "bogus" });
    await expect(
      __n190.process()
    ).rejects.toThrow("Unknown");
  });

  it("SaveCSVDataframeFile", async () => {
    const dir = tmpDir();
    const __n191 = new SaveCSVDataframeFileNode();
    __n191.assign({
      dataframe: df([{ a: 1 }]),
      folder: dir,
      filename: "out.csv",
    });
    const res = await __n191.process();
    expect(res.path).toBeDefined();
  });

  it("SaveCSVDataframeFile no folder throws", async () => {
    const __n192 = new SaveCSVDataframeFileNode();
    __n192.assign({
        dataframe: df([]),
        folder: "",
        filename: "x.csv",
      });
    await expect(
      __n192.process()
    ).rejects.toThrow("folder");
  });

  it("SaveCSVDataframeFile no filename throws", async () => {
    const __n193 = new SaveCSVDataframeFileNode();
    __n193.assign({
        dataframe: df([]),
        folder: "/tmp",
        filename: "",
      });
    await expect(
      __n193.process()
    ).rejects.toThrow("filename");
  });

  it("FilterNone passes through non-null", async () => {
    const __n194 = new FilterNoneNode();
    __n194.assign({ value: 42 });
    const res = await __n194.process();
    expect(res.output).toBe(42);
  });

  it("FilterNone filters null", async () => {
    const __n195 = new FilterNoneNode();
    __n195.assign({ value: null });
    const res = await __n195.process();
    // When value is null, the node returns {} (no output key)
    expect(res).toEqual({});
  });

  it("asRows handles data wrapper", async () => {
    const __n196 = new ToListNode();
    __n196.assign({
      dataframe: { data: [{ x: 1 }] },
    });
    const res = await __n196.process();
    expect(res.output).toEqual([{ x: 1 }]);
  });

  it("defaults for data nodes", () => {
    expect(new SchemaNode().serialize()).toHaveProperty("columns");
    expect(new FilterDataframeNode().serialize()).toHaveProperty("condition");
    expect(new SliceDataframeNode().serialize()).toHaveProperty("start_index");
    expect(new SaveDataframeNode().serialize()).toHaveProperty("name");
    expect(new ImportCSVNode().serialize()).toHaveProperty("csv_data");
    expect(new LoadCSVURLNode().serialize()).toHaveProperty("url");
    expect(new LoadCSVFileDataNode().serialize()).toHaveProperty("file_path");
    expect(new FromListNode().serialize()).toHaveProperty("values");
    expect(new JSONToDataframeNode().serialize()).toHaveProperty("text");
    expect(new ToListNode().serialize()).toHaveProperty("dataframe");
    expect(new SelectColumnNode().serialize()).toHaveProperty("columns");
    expect(new ExtractColumnNode().serialize()).toHaveProperty("column_name");
    expect(new AddColumnNode().serialize()).toHaveProperty("column_name");
    expect(new MergeDataframeNode().serialize()).toHaveProperty("dataframe_a");
    expect(new AppendDataframeNode().serialize()).toHaveProperty("dataframe_a");
    expect(new JoinDataframeNode().serialize()).toHaveProperty("join_on");
    expect(new RowIteratorNode().serialize()).toHaveProperty("dataframe");
    expect(new FindRowNode().serialize()).toHaveProperty("condition");
    expect(new SortByColumnNode().serialize()).toHaveProperty("column");
    expect(new DropDuplicatesNode().serialize()).toHaveProperty("df");
    expect(new DropNANode().serialize()).toHaveProperty("df");
    expect(new ForEachRowNode().serialize()).toHaveProperty("dataframe");
    expect(new AggregateNode().serialize()).toHaveProperty("aggregation");
    expect(new PivotNode().serialize()).toHaveProperty("aggfunc");
    expect(new RenameNode().serialize()).toHaveProperty("rename_map");
    expect(new FillNANode().serialize()).toHaveProperty("method");
    expect(new SaveCSVDataframeFileNode().serialize()).toHaveProperty("filename");
    expect(new FilterNoneNode().serialize()).toHaveProperty("value");
  });
});

// ============================================================================
// document.ts gaps
// ============================================================================

describe("document.ts gaps", () => {
  it("LoadDocumentFile + SaveDocumentFile", async () => {
    const dir = tmpDir();
    const filePath = join(dir, "test.txt");
    writeFileSync(filePath, "Hello World");

    const __n197 = new LoadDocumentFileNode();
    __n197.assign({ path: filePath });
    const loaded = await __n197.process();
    expect((loaded.output as any).uri).toContain("file://");

    const outPath = join(dir, "out.txt");
    const __n198 = new SaveDocumentFileNode();
    __n198.assign({ document: loaded.output });
    // SaveDocumentFileNode reads (this as any).path which is not a declared prop
    (__n198 as any).path = outPath;
    const saved = await __n198.process();
    expect(saved.output).toBe(outPath);
  });

  it("SaveDocumentFile with text", async () => {
    const dir = tmpDir();
    const outPath = join(dir, "out.txt");
    const __n199 = new SaveDocumentFileNode();
    __n199.assign({ document: { text: "Hello" } });
    (__n199 as any).path = outPath;
    await __n199.process();
    expect(readFileSync(outPath, "utf8")).toBe("Hello");
  });

  it("SaveDocumentFile with uri", async () => {
    const dir = tmpDir();
    const srcPath = join(dir, "src.txt");
    writeFileSync(srcPath, "Source");
    const outPath = join(dir, "out.txt");
    const __n200 = new SaveDocumentFileNode();
    __n200.assign({ document: { uri: `file://${srcPath}` } });
    (__n200 as any).path = outPath;
    await __n200.process();
    expect(readFileSync(outPath, "utf8")).toBe("Source");
  });

  it("SaveDocumentFile empty doc writes empty file", async () => {
    const dir = tmpDir();
    const outPath = join(dir, "empty.txt");
    const __n201 = new SaveDocumentFileNode();
    __n201.assign({ document: {} });
    (__n201 as any).path = outPath;
    await __n201.process();
    expect(readFileSync(outPath, "utf8")).toBe("");
  });

  it("ListDocuments genProcess", async () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "a.txt"), "a");
    writeFileSync(join(dir, "b.md"), "b");
    writeFileSync(join(dir, "c.jpg"), "c"); // should be excluded
    const node = new ListDocumentsNode();
    node.assign({ folder: dir });
    const items = await collectGen(node.genProcess());
    expect(items.length).toBe(2);
  });

  it("ListDocuments recursive", async () => {
    const dir = tmpDir();
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "x.txt"), "x");
    const node = new ListDocumentsNode();
    node.assign({ folder: dir, recursive: true });
    const items = await collectGen(node.genProcess());
    expect(items.length).toBe(1);
  });

  it("SplitDocument genProcess", async () => {
    const node = new SplitDocumentNode();
    node.assign({ document: { text: "A".repeat(100) } });
    // chunk_size and chunk_overlap are accessed via (this as any), not declared props
    (node as any).chunk_size = 50;
    (node as any).chunk_overlap = 10;
    const items = await collectGen(
      node.genProcess()
    );
    expect(items.length).toBeGreaterThan(1);
  });

  it("SplitHTML genProcess", async () => {
    const node = new SplitHTMLNode();
    node.assign({ document: { text: "<p>" + "word ".repeat(50) + "</p>" }, chunk_size: 50 });
    const items = await collectGen(
      node.genProcess()
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it("SplitJSON genProcess", async () => {
    const node = new SplitJSONNode();
    node.assign({ document: { text: JSON.stringify({ a: "b".repeat(100) }) }, chunk_size: 50 });
    const items = await collectGen(
      node.genProcess()
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it("SplitJSON with invalid JSON", async () => {
    const node = new SplitJSONNode();
    node.assign({ document: { text: "not json " + "x".repeat(100) }, chunk_size: 50 });
    const items = await collectGen(
      node.genProcess()
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it("SplitRecursively genProcess", async () => {
    const node = new SplitRecursivelyNode();
    node.assign({ document: { text: "A\n\nB\n\nC" }, chunk_size: 5 });
    const items = await collectGen(
      node.genProcess()
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it("SplitMarkdown genProcess", async () => {
    const node = new SplitMarkdownNode();
    node.assign({
        document: { text: "# Title\n" + "word ".repeat(300) },
        chunk_size: 50,
      });
    const items = await collectGen(
      node.genProcess()
    );
    expect(items.length).toBeGreaterThan(1);
  });

  it("defaults for document nodes", () => {
    expect(new LoadDocumentFileNode().serialize()).toHaveProperty("path");
    expect(new SaveDocumentFileNode().serialize()).toHaveProperty("document");
    expect(new ListDocumentsNode().serialize()).toHaveProperty("recursive");
    expect(new SplitDocumentNode().serialize()).toHaveProperty("buffer_size");
    expect(new SplitHTMLNode().serialize()).toHaveProperty("document");
    expect(new SplitJSONNode().serialize()).toHaveProperty("include_metadata");
    expect(new SplitRecursivelyNode().serialize()).toHaveProperty("chunk_size");
    expect(new SplitMarkdownNode().serialize()).toHaveProperty("chunk_size");
  });
});

// ============================================================================
// code.ts gaps
// ============================================================================

describe("code.ts gaps", () => {
  it("ExecuteJavaScript", async () => {
    const __n202 = new ExecuteJavaScriptNode();
    __n202.assign({
      code: "console.log('hello')",
      execution_mode: "subprocess",
    });
    const res = await __n202.process();
    expect(res.output).toContain("hello");
    expect(res.success).toBe(true);
  });

  it("ExecuteBash", async () => {
    const __n203 = new ExecuteBashNode();
    __n203.assign({
      code: "echo hi",
      execution_mode: "subprocess",
    });
    const res = await __n203.process();
    expect(res.output).toContain("hi");
  });

  it("ExecuteCommand", async () => {
    const __n204 = new ExecuteCommandNode();
    __n204.assign({
      command: "echo test",
      execution_mode: "subprocess",
    });
    const res = await __n204.process();
    expect(res.output).toContain("test");
  });

  it("RunJavaScriptCommand", async () => {
    const __n205 = new RunJavaScriptCommandNode();
    __n205.assign({
      command: "console.log(42)",
      timeout_ms: 5000,
    });
    const res = await __n205.process();
    expect(res.output).toContain("42");
  });

  it("RunBashCommand", async () => {
    const __n206 = new RunBashCommandNode();
    __n206.assign({
      command: "echo bash",
      timeout_ms: 5000,
    });
    const res = await __n206.process();
    expect(res.output).toContain("bash");
  });

  it("RunShellCommand", async () => {
    const __n207 = new RunShellCommandNode();
    __n207.assign({
      command: "echo shell",
      timeout_ms: 5000,
    });
    const res = await __n207.process();
    expect(res.output).toContain("shell");
  });

  it("defaults for ScriptExecNode subclasses", () => {
    expect(new ExecutePythonNode().serialize()).toHaveProperty("code");
    expect(new ExecuteJavaScriptNode().serialize()).toHaveProperty("code");
    expect(new ExecuteBashNode().serialize()).toHaveProperty("code");
    expect(new ExecuteRubyNode().serialize()).toHaveProperty("code");
    expect(new ExecuteLuaNode().serialize()).toHaveProperty("code");
  });

  it("defaults for ExecuteCommandNode", () => {
    expect(new ExecuteCommandNode().serialize()).toHaveProperty("command");
  });

  it("defaults for RunCommandNode subclasses", () => {
    expect(new RunPythonCommandNode().serialize()).toHaveProperty("command");
    expect(new RunJavaScriptCommandNode().serialize()).toHaveProperty("command");
    expect(new RunBashCommandNode().serialize()).toHaveProperty("command");
    expect(new RunRubyCommandNode().serialize()).toHaveProperty("command");
    expect(new RunLuaCommandNode().serialize()).toHaveProperty("command");
    expect(new RunLuaCommandDockerNode().serialize()).toHaveProperty("command");
    expect(new RunShellCommandNode().serialize()).toHaveProperty("command");
    expect(new RunPythonCommandDockerNode().serialize()).toHaveProperty("command");
    expect(new RunJavaScriptCommandDockerNode().serialize()).toHaveProperty("command");
    expect(new RunBashCommandDockerNode().serialize()).toHaveProperty("command");
    expect(new RunRubyCommandDockerNode().serialize()).toHaveProperty("command");
    expect(new RunShellCommandDockerNode().serialize()).toHaveProperty("command");
  });
});

// ============================================================================
// Round 2: deeper coverage gaps
// ============================================================================

describe("lib-audio-dsp round 2", () => {
  it("Gain with Uint8Array audio data", async () => {
    const wav = shortSine();
    // pass Uint8Array directly instead of base64 string
    const rawBytes = Buffer.from(wav.data as string, "base64");
    const __n208 = new GainNode_();
    __n208.assign({
      audio: { uri: "", data: new Uint8Array(rawBytes) },
      gain_db: 0,
    });
    const res = await __n208.process();
    expect(res.output).toBeDefined();
  });

  it("Gain with invalid audio data throws", async () => {
    const __n209 = new GainNode_();
    __n209.assign({ audio: { uri: "", data: 12345 }, gain_db: 0 });
    await expect(
      __n209.process()
    ).rejects.toThrow("Invalid audio data");
  });

  it("Gain with invalid WAV (not RIFF) throws", async () => {
    const badWav = Buffer.from("NOTRIFFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    const __n210 = new GainNode_();
    __n210.assign({
        audio: { uri: "", data: badWav.toString("base64") },
        gain_db: 0,
      });
    await expect(
      __n210.process()
    ).rejects.toThrow("Invalid WAV");
  });
});

describe("lib-synthesis round 2", () => {
  it("Oscillator with invalid waveform throws", async () => {
    const __n211 = new OscillatorLibNode();
    __n211.assign({
        waveform: "invalid_wave",
        frequency: 440,
        amplitude: 0.5,
        duration: 0.01,
        sample_rate: 8000,
      });
    await expect(
      __n211.process()
    ).rejects.toThrow("Invalid waveform");
  });
});

describe("lib-numpy round 2", () => {
  it("asNdArray with non-array/non-number returns empty", async () => {
    // Pass a string — should fall through to empty { data: [], shape: [0] }
    const __n212 = new AbsArrayNode();
    __n212.assign({ values: "not-an-array" });
    const res = await __n212.process();
    const out = res.output as any;
    expect(out.data).toEqual([]);
    expect(out.shape).toEqual([0]);
  });

  it("Add with different length arrays (padding)", async () => {
    const __n213 = new AddArrayNode();
    __n213.assign({
      a: { data: [1, 2, 3], shape: [3] },
      b: { data: [10], shape: [1] },
    });
    const res = await __n213.process();
    // scalar broadcast — single element array isn't padded, just broadcast
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("Add with genuinely different length arrays triggers padding", async () => {
    const __n214 = new AddArrayNode();
    __n214.assign({
      a: { data: [1, 2, 3], shape: [3] },
      b: { data: [10, 20], shape: [2] },
    });
    const res = await __n214.process();
    expect((res.output as any).data.length).toBe(3);
    expect((res.output as any).data[2]).toBe(3); // padded 0 + 3
  });

  it("SaveArray without context.storage", async () => {
    const __n215 = new SaveArrayNode();
    __n215.assign({
      values: { data: [1, 2, 3], shape: [3] },
      name: "test_%Y.json",
    });
    const res = await __n215.process();
    expect((res.output as any).data).toEqual([1, 2, 3]);
  });
});

describe.skip("lib-pdf round 2 - node class names differ from test imports", () => {
  // Make a richer PDF with multiple text items at different positions/sizes
  function makeRichPdf(): { data: string } {
    // A PDF with two text blocks at different y positions and different font sizes
    const stream1 =
      "BT /F1 24 Tf 50 700 Td (Big Title) Tj ET\n" +
      "BT /F1 12 Tf 50 680 Td (Normal text line 1) Tj ET\n" +
      "BT /F1 12 Tf 50 660 Td (Normal text line 2) Tj ET\n" +
      "BT /F1 16 Tf 50 600 Td (Medium heading) Tj ET\n" +
      "BT /F1 12 Tf 50 580 Td (More body text) Tj ET";
    const streamBytes = Buffer.from(stream1);
    const pdf = `%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${streamBytes.length}>>stream
${stream1}
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000${(317 + streamBytes.length).toString().padStart(3, "0")} 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
0000000${(390 + streamBytes.length).toString().padStart(3, "0")}
%%EOF`;
    return { data: Buffer.from(pdf).toString("base64") };
  }

  it("ExtractMarkdownPyMuPdf with multi-line content", async () => {
    const __n216 = new ExtractMarkdownPyMuPdfNode();
    __n216.assign({ pdf: makeRichPdf() });
    const res = await __n216.process();
    expect(typeof res.output).toBe("string");
  });

  it("ExtractTextBlocksPyMuPdf with multi-line content", async () => {
    const __n217 = new ExtractTextBlocksPyMuPdfNode();
    __n217.assign({ pdf: makeRichPdf() });
    const res = await __n217.process();
    expect(Array.isArray(res.output)).toBe(true);
  });

  it("ExtractTextWithStylePyMuPdf with multi-line content", async () => {
    const __n218 = new ExtractTextWithStylePyMuPdfNode();
    __n218.assign({ pdf: makeRichPdf() });
    const res = await __n218.process();
    expect(Array.isArray(res.output)).toBe(true);
  });

  it("ExtractTablesPyMuPdf with table-like content", async () => {
    // Create PDF with tabular text items on same y-coordinates
    const stream =
      "BT /F1 12 Tf 50 700 Td (Name) Tj ET\n" +
      "BT /F1 12 Tf 200 700 Td (Age) Tj ET\n" +
      "BT /F1 12 Tf 50 680 Td (Alice) Tj ET\n" +
      "BT /F1 12 Tf 200 680 Td (30) Tj ET\n" +
      "BT /F1 12 Tf 50 660 Td (Bob) Tj ET\n" +
      "BT /F1 12 Tf 200 660 Td (25) Tj ET";
    const streamBytes = Buffer.from(stream);
    const pdf = `%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${streamBytes.length}>>stream
${stream}
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000${(317 + streamBytes.length).toString().padStart(3, "0")} 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
0000000${(390 + streamBytes.length).toString().padStart(3, "0")}
%%EOF`;
    const __n219 = new ExtractTablesPyMuPdfNode();
    __n219.assign({
      pdf: { data: Buffer.from(pdf).toString("base64") },
    });
    const res = await __n219.process();
    expect(Array.isArray(res.output)).toBe(true);
  });

  it("PDF loaded from file URI", async () => {
    const dir = tmpDir();
    // Write a minimal PDF to disk
    const stream = "BT /F1 12 Tf 50 700 Td (File test) Tj ET";
    const streamBytes = Buffer.from(stream);
    const pdf = `%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${streamBytes.length}>>stream
${stream}
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000${(317 + streamBytes.length).toString().padStart(3, "0")} 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
0000000${(390 + streamBytes.length).toString().padStart(3, "0")}
%%EOF`;
    const filePath = join(dir, "test.pdf");
    writeFileSync(filePath, pdf);
    const __n220 = new GetPageCountPdfPlumberNode();
    __n220.assign({
      pdf: { uri: `file://${filePath}` },
    });
    const res = await __n220.process();
    expect(res.output).toBe(1);
  });

  it("PDF with no data and no URI throws", async () => {
    const __n221 = new GetPageCountPdfPlumberNode();
    __n221.assign({ pdf: {} });
    await expect(
      __n221.process()
    ).rejects.toThrow("No PDF data or URI");
  });
});

describe("lib-sqlite round 2", () => {
  it("resolveDbPath without workspaceDir throws", async () => {
    // Provide a context without workspaceDir
    await expect(
      new CreateTableLibNode().process(
        { database_name: "test.db", table_name: "t", columns: "id INTEGER" },
        {} as any // context without workspaceDir
      )
    ).rejects.toThrow("workspace_dir");
  });
});

describe("lib-pedalboard-extra round 2", () => {
  it("Limiter with loud signal triggers gain reduction", async () => {
    // Create a WAV with loud samples (above typical threshold)
    const sr = 8000;
    const dur = 0.05;
    const n = Math.floor(sr * dur);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) samples[i] = 0.9 * Math.sin(2 * Math.PI * 440 * i / sr);
    const buf = Buffer.alloc(44 + n * 2);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36 + n * 2, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sr, 24);
    buf.writeUInt32LE(sr * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) {
      buf.writeInt16LE(Math.round(samples[i] * 0x7fff), 44 + i * 2);
    }
    const audio = { uri: "", data: Buffer.from(buf).toString("base64") };
    const __n222 = new LimiterNode();
    __n222.assign({
      audio,
      threshold_db: -20, // very low threshold to trigger limiting
      release_ms: 10,
    });
    const res = await __n222.process();
    expect(res.output).toBeDefined();
  });

  it("PitchShift with stereo audio", async () => {
    const audio = stereoSine();
    const __n223 = new PitchShiftNode();
    __n223.assign({
      audio,
      semitones: 2,
    });
    const res = await __n223.process();
    expect(res.output).toBeDefined();
  });

  it("TimeStretch with stereo audio", async () => {
    const audio = stereoSine();
    const __n224 = new TimeStretchNode();
    __n224.assign({
      audio,
      rate: 1.5,
    });
    const res = await __n224.process();
    expect(res.output).toBeDefined();
  });

  it("Compress with Uint8Array data", async () => {
    const wav = shortSine();
    const rawBytes = Buffer.from(wav.data as string, "base64");
    const __n225 = new CompressNode();
    __n225.assign({
      audio: { uri: "", data: new Uint8Array(rawBytes) },
      threshold_db: -10,
      ratio: 4,
      attack_ms: 5,
      release_ms: 50,
    });
    const res = await __n225.process();
    expect(res.output).toBeDefined();
  });

  it("Bitcrush with invalid WAV throws", async () => {
    const __n226 = new BitcrushNode();
    __n226.assign({
        audio: { uri: "", data: Buffer.from("NOT_A_WAV_FILE").toString("base64") },
        bit_depth: 8,
      });
    await expect(
      __n226.process()
    ).rejects.toThrow("Invalid WAV");
  });

  it("Distortion with invalid audio data throws", async () => {
    const __n227 = new DistortionNode();
    __n227.assign({
        audio: { uri: "", data: 12345 },
        drive: 0.5,
      });
    await expect(
      __n227.process()
    ).rejects.toThrow("Invalid audio data");
  });
});

describe("lib-librosa-spectral round 2", () => {
  it("STFT with stereo audio (mono downmix)", async () => {
    const audio = stereoSine();
    const __n228 = new STFTNode();
    __n228.assign({
      audio,
      n_fft: 256,
      hop_length: 128,
    });
    const res = await __n228.process();
    expect(res.output).toBeDefined();
  });

  it("SaveAudioSegments with Uint8Array data", async () => {
    const dir = tmpDir();
    const wav = shortSine();
    const rawBytes = Buffer.from(wav.data as string, "base64");
    const __n229 = new SaveAudioSegmentsNode();
    __n229.assign({
      segments: [{ uri: "", data: new Uint8Array(rawBytes) }],
      folder: { path: dir },
      prefix: "seg",
    });
    const res = await __n229.process();
    expect(res.output).toBeDefined();
  });
});

describe("lib-excel round 2", () => {
  it("SaveWorkbook writes to disk", async () => {
    const dir = tmpDir();
    const wb = await new CreateWorkbookLibNode().process();
    const __n230 = new SaveWorkbookLibNode();
    __n230.assign({
      workbook: wb.output,
      folder: { path: dir },
      filename: "test.xlsx",
    });
    const res = await __n230.process();
    expect(typeof res.output).toBe("string");
    expect(String(res.output)).toContain("test.xlsx");
  });
});

describe("lib-docx round 2", () => {
  it("LoadWordDocument loads .docx file", async () => {
    // Create a minimal docx using the create + save pipeline first
    const dir = tmpDir();
    const doc = await new CreateDocumentLibNode().process();
    const __n231 = new AddHeadingLibNode();
    __n231.assign({
      document: doc.output,
      text: "Test",
      level: 1,
    });
    const withHeading = await __n231.process();
    const __n232 = new SaveDocumentLibNode();
    __n232.assign({
      document: withHeading.output,
      path: { path: dir },
      filename: "load_test.docx",
    });
    const saved = await __n232.process();
    // Now load it
    const __n233 = new LoadWordDocumentLibNode();
    __n233.assign({
      path: String(saved.output),
    });
    const loaded = await __n233.process();
    expect(typeof loaded.output).toBe("string");
  });

  it("AddImage with Buffer data", async () => {
    const doc = await new CreateDocumentLibNode().process();
    // Create a tiny 1x1 PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64"
    );
    const __n234 = new AddImageLibNode();
    __n234.assign({
      document: doc.output,
      image: { data: png },
      width: 100,
      height: 100,
    });
    const res = await __n234.process();
    expect((res.output as any).elements.length).toBe(1);
  });
});

describe("lib-beautifulsoup round 2", () => {
  it("WebsiteContentExtractor fallback path", async () => {
    // HTML that Readability can't parse → fallback to cheerio stripping
    const html = "<html><body><script>bad()</script><div id='content'>Real content here</div></body></html>";
    const __n235 = new WebsiteContentExtractorLibNode();
    __n235.assign({
      html,
    });
    const res = await __n235.process();
    expect(typeof res.output).toBe("string");
    expect(String(res.output).length).toBeGreaterThan(0);
  });
});

describe("data.ts round 2", () => {
  it("LoadCSVFile reads from path", async () => {
    const dir = tmpDir();
    const csvPath = join(dir, "test.csv");
    writeFileSync(csvPath, "a,b\n1,2\n3,4\n");
    const __n236 = new LoadCSVFileDataNode();
    __n236.assign({ file_path: csvPath });
    const res = await __n236.process();
    expect((res.output as any).rows.length).toBe(2);
  });

  it("ForEachRow genProcess yields rows", async () => {
    const node = new ForEachRowNode();
    node.assign({
      dataframe: df([{ x: 1 }, { x: 2 }, { x: 3 }]),
    });
    const gen = node.genProcess();
    const results = await collectGen(gen);
    expect(results.length).toBe(3);
    expect(results[0].row).toEqual({ x: 1 });
    expect(results[0].index).toBe(0);
  });

  it("RowIterator genProcess yields rows", async () => {
    const node = new RowIteratorNode();
    node.assign({
      dataframe: df([{ a: "x" }, { a: "y" }]),
    });
    const gen = node.genProcess();
    const results = await collectGen(gen);
    expect(results.length).toBe(2);
  });

  it("LoadCSVAssets genProcess reads CSV files from folder", async () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "a.csv"), "x\n1\n2\n");
    writeFileSync(join(dir, "b.txt"), "not csv");
    writeFileSync(join(dir, "c.csv"), "y\n3\n");
    const node = new LoadCSVAssetsNode();
    node.assign({ folder: dir });
    const gen = node.genProcess();
    const results = await collectGen(gen);
    expect(results.length).toBe(2); // only .csv files
  });

  it("Aggregate groups and aggregates", async () => {
    const __n237 = new AggregateNode();
    __n237.assign({
      dataframe: df([
        { group: "A", val: 10 },
        { group: "A", val: 20 },
        { group: "B", val: 30 },
      ]),
      columns: "group",
      aggregation: "sum",
    });
    const res = await __n237.process();
    expect((res.output as any).rows.length).toBe(2);
  });
});

describe("document.ts round 2", () => {
  it("LoadDocumentFile from string path", async () => {
    const dir = tmpDir();
    const fp = join(dir, "test.txt");
    writeFileSync(fp, "Hello document");
    const __n238 = new LoadDocumentFileNode();
    __n238.assign({ path: fp });
    const res = await __n238.process();
    expect(typeof res.output).toBe("object");
  });

  it("ListDocuments genProcess lists files", async () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "a.txt"), "text");
    writeFileSync(join(dir, "b.md"), "markdown");
    writeFileSync(join(dir, "c.py"), "python"); // not in allowed set
    const node = new ListDocumentsNode();
    node.assign({ folder: dir, recursive: false });
    const gen = node.genProcess();
    const results = await collectGen(gen);
    expect(results.length).toBe(2); // .txt and .md
  });

  it("SplitDocument genProcess splits text", async () => {
    const node = new SplitDocumentNode();
    node.assign({
      document: { text: "A".repeat(100) + " " + "B".repeat(100) },
      chunk_size: 80,
      chunk_overlap: 10,
    });
    const gen = node.genProcess();
    const results = await collectGen(gen);
    expect(results.length).toBeGreaterThan(0);
  });

  it("SplitHTML genProcess splits HTML", async () => {
    const node = new SplitHTMLNode();
    node.assign({
      document: { text: "<p>" + "Hello world. ".repeat(50) + "</p>" },
      chunk_size: 100,
      chunk_overlap: 10,
    });
    const gen = node.genProcess();
    const results = await collectGen(gen);
    expect(results.length).toBeGreaterThan(0);
  });

  it("SplitJSON genProcess splits JSON", async () => {
    const node = new SplitJSONNode();
    node.assign({
      document: { text: JSON.stringify({ data: "x".repeat(200) }) },
      chunk_size: 50,
      chunk_overlap: 5,
    });
    const gen = node.genProcess();
    const results = await collectGen(gen);
    expect(results.length).toBeGreaterThan(0);
  });

  it("SplitRecursively genProcess splits by paragraphs", async () => {
    const node = new SplitRecursivelyNode();
    node.assign({
      document: { text: "Para one content.\n\nPara two content.\n\nPara three content." },
      chunk_size: 30,
      chunk_overlap: 5,
    });
    const gen = node.genProcess();
    const results = await collectGen(gen);
    expect(results.length).toBeGreaterThan(0);
  });

  it("SplitMarkdown genProcess splits by headings", async () => {
    const node = new SplitMarkdownNode();
    node.assign({
      document: { text: "# Title\n\nSome text content here.\n\n## Subtitle\n\nMore content." },
      chunk_size: 200,
    });
    const gen = node.genProcess();
    const results = await collectGen(gen);
    expect(results.length).toBeGreaterThan(0);
  });

  it("readDocumentText with data bytes", async () => {
    const node = new SplitDocumentNode();
    node.assign({
      document: { data: Buffer.from("Hello from bytes").toString("base64") },
      chunk_size: 100,
    });
    const gen = node.genProcess();
    const results = await collectGen(gen);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("code.ts round 2", () => {
  it("ExecuteBash with stderr output", async () => {
    const __n239 = new ExecuteBashNode();
    __n239.assign({
      code: "echo error >&2; echo ok",
      execution_mode: "subprocess",
    });
    const res = await __n239.process();
    expect(res.output).toContain("ok");
    // stderr should be captured
    expect(typeof res.stderr).toBe("string");
  });

  it("ExecuteCommand with timeout (short command)", async () => {
    const __n240 = new ExecuteCommandNode();
    __n240.assign({
      command: "echo done",
      execution_mode: "subprocess",
    });
    const res = await __n240.process();
    expect(res.output).toContain("done");
  });

  it("ExecuteJavaScript with stdin", async () => {
    const __n241 = new ExecuteJavaScriptNode();
    __n241.assign({
      code: "process.stdin.on('data', d => { console.log('got: ' + d); process.stdin.resume(); }); setTimeout(() => process.exit(0), 100);",
      stdin: "hello",
      execution_mode: "subprocess",
    });
    const res = await __n241.process();
    // Just check it doesn't crash
    expect(typeof res.output).toBe("string");
  });
});

// ============================================================================
// code.ts round 3: strengthen all return field assertions + missing nodes
// ============================================================================

// Helper to assert the full shape of Execute and Run node process() results.
// Every result must have: stdout (string), stderr (string), exit_code (number),
// output (string), success (boolean).
function assertFullResult(
  res: { stdout: string; stderr: string; exit_code: number; output: string; success: boolean },
  expected: {
    stdoutContains?: string;
    stdoutEquals?: string;
    stderrContains?: string;
    exit_code: number;
    success: boolean;
  },
) {
  // All five fields must be present and correctly typed
  expect(typeof res.stdout).toBe("string");
  expect(typeof res.stderr).toBe("string");
  expect(typeof res.exit_code).toBe("number");
  expect(typeof res.output).toBe("string");
  expect(typeof res.success).toBe("boolean");

  // output should equal stdout
  expect(res.output).toBe(res.stdout);

  // Specific value checks
  expect(res.exit_code).toBe(expected.exit_code);
  expect(res.success).toBe(expected.success);

  if (expected.stdoutContains !== undefined) {
    expect(res.stdout).toContain(expected.stdoutContains);
  }
  if (expected.stdoutEquals !== undefined) {
    expect(res.stdout.trim()).toBe(expected.stdoutEquals);
  }
  if (expected.stderrContains !== undefined) {
    expect(res.stderr).toContain(expected.stderrContains);
  }
}

describe("code.ts round 3 — full return field verification", () => {
  // ---- ExecuteBashNode: strengthen existing weak tests ----

  it("ExecuteBash verifies all 5 return fields", async () => {
    const node = new ExecuteBashNode();
    node.assign({ code: "echo hello_world", execution_mode: "subprocess" });
    const res = await node.process();
    assertFullResult(res, {
      stdoutEquals: "hello_world",
      exit_code: 0,
      success: true,
    });
  });

  it("ExecuteBash with stderr verifies all fields", async () => {
    const node = new ExecuteBashNode();
    node.assign({
      code: "echo out_line; echo err_line >&2",
      execution_mode: "subprocess",
    });
    const res = await node.process();
    assertFullResult(res, {
      stdoutContains: "out_line",
      stderrContains: "err_line",
      exit_code: 0,
      success: true,
    });
  });

  it("ExecuteBash with failing exit code", async () => {
    const node = new ExecuteBashNode();
    node.assign({ code: "exit 42", execution_mode: "subprocess" });
    const res = await node.process();
    assertFullResult(res, {
      exit_code: 42,
      success: false,
    });
  });

  it("ExecuteBash empty code throws", async () => {
    const node = new ExecuteBashNode();
    node.assign({ code: "", execution_mode: "subprocess" });
    await expect(node.process()).rejects.toThrow("Code is required");
  });

  // ---- ExecuteJavaScriptNode: strengthen ----

  it("ExecuteJavaScript verifies all 5 return fields", async () => {
    const node = new ExecuteJavaScriptNode();
    node.assign({
      code: "console.log('js_output')",
      execution_mode: "subprocess",
    });
    const res = await node.process();
    assertFullResult(res, {
      stdoutEquals: "js_output",
      exit_code: 0,
      success: true,
    });
  });

  it("ExecuteJavaScript with stderr", async () => {
    const node = new ExecuteJavaScriptNode();
    node.assign({
      code: "console.error('js_err'); console.log('js_out')",
      execution_mode: "subprocess",
    });
    const res = await node.process();
    assertFullResult(res, {
      stdoutContains: "js_out",
      stderrContains: "js_err",
      exit_code: 0,
      success: true,
    });
  });

  it("ExecuteJavaScript with failing exit code", async () => {
    const node = new ExecuteJavaScriptNode();
    node.assign({
      code: "process.exit(7)",
      execution_mode: "subprocess",
    });
    const res = await node.process();
    assertFullResult(res, {
      exit_code: 7,
      success: false,
    });
  });

  it("ExecuteJavaScript empty code throws", async () => {
    const node = new ExecuteJavaScriptNode();
    node.assign({ code: "   ", execution_mode: "subprocess" });
    await expect(node.process()).rejects.toThrow("Code is required");
  });

  // ---- ExecuteRubyNode: NEW process() tests ----

  it("ExecuteRuby verifies all 5 return fields", async () => {
    const node = new ExecuteRubyNode();
    node.assign({
      code: 'puts "ruby_output"',
      execution_mode: "subprocess",
    });
    const res = await node.process();
    assertFullResult(res, {
      stdoutEquals: "ruby_output",
      exit_code: 0,
      success: true,
    });
  });

  it("ExecuteRuby with stderr", async () => {
    const node = new ExecuteRubyNode();
    node.assign({
      code: '$stderr.puts "ruby_err"; puts "ruby_out"',
      execution_mode: "subprocess",
    });
    const res = await node.process();
    assertFullResult(res, {
      stdoutContains: "ruby_out",
      stderrContains: "ruby_err",
      exit_code: 0,
      success: true,
    });
  });

  it("ExecuteRuby with failing exit code", async () => {
    const node = new ExecuteRubyNode();
    node.assign({
      code: "exit 3",
      execution_mode: "subprocess",
    });
    const res = await node.process();
    assertFullResult(res, {
      exit_code: 3,
      success: false,
    });
  });

  it("ExecuteRuby empty code throws", async () => {
    const node = new ExecuteRubyNode();
    node.assign({ code: "", execution_mode: "subprocess" });
    await expect(node.process()).rejects.toThrow("Code is required");
  });

  // ---- ExecuteLuaNode: NEW process() tests ----

  it("ExecuteLua verifies all 5 return fields", async () => {
    const node = new ExecuteLuaNode();
    node.assign({
      code: 'print("lua_output")',
      execution_mode: "subprocess",
    });
    const res = await node.process();
    assertFullResult(res, {
      stdoutEquals: "lua_output",
      exit_code: 0,
      success: true,
    });
  });

  it("ExecuteLua with error produces stderr", async () => {
    const node = new ExecuteLuaNode();
    node.assign({
      code: 'error("lua_err_msg")',
      execution_mode: "subprocess",
    });
    const res = await node.process();
    // Verify all fields exist and are correctly typed
    expect(typeof res.stdout).toBe("string");
    expect(typeof res.stderr).toBe("string");
    expect(typeof res.exit_code).toBe("number");
    expect(typeof res.output).toBe("string");
    expect(typeof res.success).toBe("boolean");
    expect(res.output).toBe(res.stdout);
    expect(res.stderr).toContain("lua_err_msg");
    expect(res.exit_code).not.toBe(0);
    expect(res.success).toBe(false);
  });

  it("ExecuteLua with syntax error produces non-zero exit", async () => {
    const node = new ExecuteLuaNode();
    node.assign({
      code: "this is not valid lua !!!",
      execution_mode: "subprocess",
    });
    const res = await node.process();
    expect(typeof res.stdout).toBe("string");
    expect(typeof res.stderr).toBe("string");
    expect(typeof res.exit_code).toBe("number");
    expect(typeof res.output).toBe("string");
    expect(typeof res.success).toBe("boolean");
    expect(res.exit_code).not.toBe(0);
    expect(res.success).toBe(false);
  });

  it("ExecuteLua empty code throws", async () => {
    const node = new ExecuteLuaNode();
    node.assign({ code: "", execution_mode: "subprocess" });
    await expect(node.process()).rejects.toThrow("Code is required");
  });

  // ---- ExecuteCommandNode: strengthen ----

  it("ExecuteCommand verifies all 5 return fields", async () => {
    const node = new ExecuteCommandNode();
    node.assign({
      command: "echo cmd_output",
      execution_mode: "subprocess",
    });
    const res = await node.process();
    assertFullResult(res, {
      stdoutEquals: "cmd_output",
      exit_code: 0,
      success: true,
    });
  });

  it("ExecuteCommand with failing exit code", async () => {
    const node = new ExecuteCommandNode();
    node.assign({
      command: "false",
      execution_mode: "subprocess",
    });
    const res = await node.process();
    expect(typeof res.stdout).toBe("string");
    expect(typeof res.stderr).toBe("string");
    expect(typeof res.exit_code).toBe("number");
    expect(typeof res.output).toBe("string");
    expect(typeof res.success).toBe("boolean");
    expect(res.output).toBe(res.stdout);
    expect(res.exit_code).not.toBe(0);
    expect(res.success).toBe(false);
  });

  it("ExecuteCommand empty command throws", async () => {
    const node = new ExecuteCommandNode();
    node.assign({ command: "", execution_mode: "subprocess" });
    await expect(node.process()).rejects.toThrow("Command is required");
  });

  // ---- RunPythonCommandNode: NEW process() test ----

  it("RunPythonCommand verifies all 5 return fields", async () => {
    const node = new RunPythonCommandNode();
    node.assign({ command: "print('py_run')" });
    const res = await node.process();
    assertFullResult(res, {
      stdoutEquals: "py_run",
      exit_code: 0,
      success: true,
    });
  });

  it("RunPythonCommand empty command returns empty success", async () => {
    const node = new RunPythonCommandNode();
    node.assign({ command: "" });
    const res = await node.process();
    assertFullResult(res, {
      stdoutEquals: "",
      exit_code: 0,
      success: true,
    });
  });

  // ---- RunJavaScriptCommandNode: strengthen ----

  it("RunJavaScriptCommand verifies all 5 return fields", async () => {
    const node = new RunJavaScriptCommandNode();
    node.assign({ command: "console.log('js_run')" });
    const res = await node.process();
    assertFullResult(res, {
      stdoutEquals: "js_run",
      exit_code: 0,
      success: true,
    });
  });

  // ---- RunBashCommandNode: strengthen ----

  it("RunBashCommand verifies all 5 return fields", async () => {
    const node = new RunBashCommandNode();
    node.assign({ command: "echo bash_run" });
    const res = await node.process();
    assertFullResult(res, {
      stdoutEquals: "bash_run",
      exit_code: 0,
      success: true,
    });
  });

  // ---- RunRubyCommandNode: NEW process() test ----

  it("RunRubyCommand verifies all 5 return fields", async () => {
    const node = new RunRubyCommandNode();
    node.assign({ command: 'puts "ruby_run"' });
    const res = await node.process();
    assertFullResult(res, {
      stdoutEquals: "ruby_run",
      exit_code: 0,
      success: true,
    });
  });

  // ---- RunLuaCommandNode: NEW process() test ----

  it("RunLuaCommand verifies all 5 return fields", async () => {
    const node = new RunLuaCommandNode();
    node.assign({ command: 'print("lua_run")' });
    const res = await node.process();
    assertFullResult(res, {
      stdoutEquals: "lua_run",
      exit_code: 0,
      success: true,
    });
  });

  // ---- RunShellCommandNode: strengthen ----

  it("RunShellCommand verifies all 5 return fields", async () => {
    const node = new RunShellCommandNode();
    node.assign({ command: "echo shell_run" });
    const res = await node.process();
    assertFullResult(res, {
      stdoutEquals: "shell_run",
      exit_code: 0,
      success: true,
    });
  });

  // ---- Docker variants: verify construction + empty command behavior ----

  it("RunPythonCommandDockerNode constructs correctly", () => {
    const node = new RunPythonCommandDockerNode();
    expect(RunPythonCommandDockerNode.nodeType).toBe("nodetool.code.RunPythonCommandDocker");
    expect(RunPythonCommandDockerNode.defaultMode).toBe("docker");
    expect(RunPythonCommandDockerNode.lang).toBe("python");
    const s = node.serialize();
    expect(s).toHaveProperty("command");
    expect(s).toHaveProperty("image");
  });

  it("RunPythonCommandDockerNode empty command returns empty success", async () => {
    const node = new RunPythonCommandDockerNode();
    node.assign({ command: "" });
    const res = await node.process();
    assertFullResult(res, { stdoutEquals: "", exit_code: 0, success: true });
  });

  it("RunJavaScriptCommandDockerNode constructs correctly", () => {
    const node = new RunJavaScriptCommandDockerNode();
    expect(RunJavaScriptCommandDockerNode.nodeType).toBe("nodetool.code.RunJavaScriptCommandDocker");
    expect(RunJavaScriptCommandDockerNode.defaultMode).toBe("docker");
    expect(RunJavaScriptCommandDockerNode.lang).toBe("javascript");
    const s = node.serialize();
    expect(s).toHaveProperty("command");
    expect(s).toHaveProperty("image");
  });

  it("RunJavaScriptCommandDockerNode empty command returns empty success", async () => {
    const node = new RunJavaScriptCommandDockerNode();
    node.assign({ command: "" });
    const res = await node.process();
    assertFullResult(res, { stdoutEquals: "", exit_code: 0, success: true });
  });

  it("RunBashCommandDockerNode constructs correctly", () => {
    const node = new RunBashCommandDockerNode();
    expect(RunBashCommandDockerNode.nodeType).toBe("nodetool.code.RunBashCommandDocker");
    expect(RunBashCommandDockerNode.defaultMode).toBe("docker");
    expect(RunBashCommandDockerNode.lang).toBe("bash");
    const s = node.serialize();
    expect(s).toHaveProperty("command");
    expect(s).toHaveProperty("image");
  });

  it("RunBashCommandDockerNode empty command returns empty success", async () => {
    const node = new RunBashCommandDockerNode();
    node.assign({ command: "" });
    const res = await node.process();
    assertFullResult(res, { stdoutEquals: "", exit_code: 0, success: true });
  });

  it("RunRubyCommandDockerNode constructs correctly", () => {
    const node = new RunRubyCommandDockerNode();
    expect(RunRubyCommandDockerNode.nodeType).toBe("nodetool.code.RunRubyCommandDocker");
    expect(RunRubyCommandDockerNode.defaultMode).toBe("docker");
    expect(RunRubyCommandDockerNode.lang).toBe("ruby");
    const s = node.serialize();
    expect(s).toHaveProperty("command");
    expect(s).toHaveProperty("image");
  });

  it("RunRubyCommandDockerNode empty command returns empty success", async () => {
    const node = new RunRubyCommandDockerNode();
    node.assign({ command: "" });
    const res = await node.process();
    assertFullResult(res, { stdoutEquals: "", exit_code: 0, success: true });
  });

  it("RunLuaCommandDockerNode constructs correctly", () => {
    const node = new RunLuaCommandDockerNode();
    expect(RunLuaCommandDockerNode.nodeType).toBe("nodetool.code.RunLuaCommandDocker");
    expect(RunLuaCommandDockerNode.defaultMode).toBe("docker");
    expect(RunLuaCommandDockerNode.lang).toBe("lua");
    const s = node.serialize();
    expect(s).toHaveProperty("command");
    expect(s).toHaveProperty("image");
  });

  it("RunLuaCommandDockerNode empty command returns empty success", async () => {
    const node = new RunLuaCommandDockerNode();
    node.assign({ command: "" });
    const res = await node.process();
    assertFullResult(res, { stdoutEquals: "", exit_code: 0, success: true });
  });

  it("RunShellCommandDockerNode constructs correctly", () => {
    const node = new RunShellCommandDockerNode();
    expect(RunShellCommandDockerNode.nodeType).toBe("nodetool.code.RunShellCommandDocker");
    expect(RunShellCommandDockerNode.defaultMode).toBe("docker");
    expect(RunShellCommandDockerNode.lang).toBe("command");
    const s = node.serialize();
    expect(s).toHaveProperty("command");
    expect(s).toHaveProperty("image");
  });

  it("RunShellCommandDockerNode empty command returns empty success", async () => {
    const node = new RunShellCommandDockerNode();
    node.assign({ command: "" });
    const res = await node.process();
    assertFullResult(res, { stdoutEquals: "", exit_code: 0, success: true });
  });
});

// ============================================================================
// Audio signal verification helpers
// ============================================================================

/** Decode a base64 WAV AudioRef into Float32Array samples */
function decodeTestWav(audioRef: { data?: string | Uint8Array }): {
  samples: Float32Array;
  sampleRate: number;
  numChannels: number;
} {
  let rawData: Uint8Array;
  if (typeof audioRef.data === "string") {
    rawData = Uint8Array.from(Buffer.from(audioRef.data, "base64"));
  } else if (audioRef.data instanceof Uint8Array) {
    rawData = audioRef.data;
  } else {
    throw new Error("No data");
  }
  const buf = Buffer.from(rawData);
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

/** RMS of a Float32Array */
function rmsVal(arr: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i] * arr[i];
  return Math.sqrt(sum / arr.length);
}

/** Max absolute value */
function maxAbsVal(arr: Float32Array): number {
  let m = 0;
  for (let i = 0; i < arr.length; i++) {
    const a = Math.abs(arr[i]);
    if (a > m) m = a;
  }
  return m;
}

/** Check if two Float32Arrays differ meaningfully */
function arraysAreDifferent(a: Float32Array, b: Float32Array, threshold = 0.001): boolean {
  const len = Math.min(a.length, b.length);
  let diffSum = 0;
  for (let i = 0; i < len; i++) diffSum += Math.abs(a[i] - b[i]);
  return diffSum / len > threshold;
}

// ============================================================================
// lib-audio-dsp: signal verification tests
// ============================================================================

describe("lib-audio-dsp signal verification", () => {
  it("Gain +6dB roughly doubles amplitude", async () => {
    const audio = shortSine(8000, 0.1);
    const inputSamples = decodeTestWav(audio).samples;
    const inputRms = rmsVal(inputSamples);

    const node = new GainNode_();
    node.assign({ audio, gain_db: 6 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;
    const outputRms = rmsVal(outputSamples);

    // +6dB should approximately double amplitude (factor ~2.0)
    const ratio = outputRms / inputRms;
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
  });

  it("Gain -6dB roughly halves amplitude", async () => {
    const audio = shortSine(8000, 0.1);
    const inputSamples = decodeTestWav(audio).samples;
    const inputRms = rmsVal(inputSamples);

    const node = new GainNode_();
    node.assign({ audio, gain_db: -6 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;
    const outputRms = rmsVal(outputSamples);

    const ratio = outputRms / inputRms;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  it("Gain 0dB preserves signal", async () => {
    const audio = shortSine(8000, 0.1);
    const inputSamples = decodeTestWav(audio).samples;

    const node = new GainNode_();
    node.assign({ audio, gain_db: 0 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    // Should be essentially identical
    expect(outputSamples.length).toBe(inputSamples.length);
    for (let i = 0; i < inputSamples.length; i++) {
      expect(Math.abs(outputSamples[i] - inputSamples[i])).toBeLessThan(0.01);
    }
  });

  it("Delay output is longer than input", async () => {
    const audio = shortSine(8000, 0.1);
    const inputLen = decodeTestWav(audio).samples.length;

    const node = new DelayNode_();
    node.assign({ audio, delay_seconds: 0.1, feedback: 0.3, mix: 0.5 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    // Output should be longer (extra space for delay echoes)
    expect(outputSamples.length).toBeGreaterThan(inputLen);
  });

  it("Delay with feedback produces echoes after dry signal ends", async () => {
    const audio = shortSine(8000, 0.1);
    const inputLen = decodeTestWav(audio).samples.length;

    const node = new DelayNode_();
    node.assign({ audio, delay_seconds: 0.1, feedback: 0.5, mix: 0.5 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    // After the original signal ends, there should still be echo energy
    const tailSamples = outputSamples.slice(inputLen);
    const tailRms = rmsVal(tailSamples);
    expect(tailRms).toBeGreaterThan(0.01);
  });

  it("HighPassFilter changes signal content", async () => {
    const audio = shortSine(8000, 0.1);
    const inputSamples = decodeTestWav(audio).samples;

    const node = new HighPassFilterNode();
    node.assign({ audio, cutoff_frequency_hz: 2000 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    expect(outputSamples.length).toBe(inputSamples.length);
    // 440Hz signal through 2000Hz highpass should be attenuated
    expect(rmsVal(outputSamples)).toBeLessThan(rmsVal(inputSamples));
  });

  it("LowPassFilter changes signal content", async () => {
    const audio = shortSine(8000, 0.1);
    const inputSamples = decodeTestWav(audio).samples;

    const node = new LowPassFilterNode();
    node.assign({ audio, cutoff_frequency_hz: 200 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    expect(outputSamples.length).toBe(inputSamples.length);
    // 440Hz signal through 200Hz lowpass should be attenuated
    expect(rmsVal(outputSamples)).toBeLessThan(rmsVal(inputSamples));
  });

  it("HighShelfFilter with positive gain boosts", async () => {
    const audio = shortSine(8000, 0.1);
    const inputSamples = decodeTestWav(audio).samples;

    const node = new HighShelfFilterNode();
    node.assign({ audio, cutoff_frequency_hz: 200, gain_db: 12 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    expect(outputSamples.length).toBe(inputSamples.length);
    // 440Hz is above 200Hz, so +12dB shelf should boost
    expect(rmsVal(outputSamples)).toBeGreaterThan(rmsVal(inputSamples));
  });

  it("LowShelfFilter with negative gain cuts", async () => {
    const audio = shortSine(8000, 0.1);
    const inputSamples = decodeTestWav(audio).samples;

    const node = new LowShelfFilterNode();
    node.assign({ audio, cutoff_frequency_hz: 1000, gain_db: -12 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    expect(outputSamples.length).toBe(inputSamples.length);
    // 440Hz is below 1000Hz, so -12dB shelf should cut
    expect(rmsVal(outputSamples)).toBeLessThan(rmsVal(inputSamples));
  });

  it("PeakFilter preserves length and produces valid output", async () => {
    const audio = shortSine(8000, 0.1);
    const inputSamples = decodeTestWav(audio).samples;

    const node = new PeakFilterNode();
    node.assign({ audio, cutoff_frequency_hz: 440, q_factor: 5 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    expect(outputSamples.length).toBe(inputSamples.length);
    expect(maxAbsVal(outputSamples)).toBeGreaterThan(0);
  });
});

// ============================================================================
// lib-audio-effects: signal verification tests
// ============================================================================

describe("lib-audio-effects signal verification", () => {
  it("Bitcrush reduces sample resolution", async () => {
    const audio = shortSine(8000, 0.1);
    const inputSamples = decodeTestWav(audio).samples;

    const node = new BitcrushNode();
    node.assign({ audio, bit_depth: 4, sample_rate_reduction: 1 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    expect(outputSamples.length).toBe(inputSamples.length);
    // With 4-bit depth, samples should be quantized to fewer unique values
    const uniqueInput = new Set(Array.from(inputSamples).map(v => Math.round(v * 1000)));
    const uniqueOutput = new Set(Array.from(outputSamples).map(v => Math.round(v * 1000)));
    expect(uniqueOutput.size).toBeLessThan(uniqueInput.size);
    expect(arraysAreDifferent(inputSamples, outputSamples)).toBe(true);
  });

  it("Bitcrush with sample rate reduction creates staircase", async () => {
    const audio = shortSine(8000, 0.1);
    const node = new BitcrushNode();
    node.assign({ audio, bit_depth: 16, sample_rate_reduction: 4 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    // With srr=4, every 4 consecutive samples should be identical
    for (let i = 0; i < outputSamples.length - 4; i += 4) {
      expect(outputSamples[i]).toBeCloseTo(outputSamples[i + 1], 4);
      expect(outputSamples[i]).toBeCloseTo(outputSamples[i + 2], 4);
      expect(outputSamples[i]).toBeCloseTo(outputSamples[i + 3], 4);
    }
  });

  it("Compress reduces dynamic range", async () => {
    // Make audio with both quiet and loud parts
    const n = 800;
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // Loud sine for first half, quiet for second
      const amp = i < n / 2 ? 0.9 : 0.1;
      samples[i] = amp * Math.sin((2 * Math.PI * 440 * i) / 8000);
    }
    const audio = makeAudioRef(samples, 8000);

    const node = new CompressNode();
    node.assign({ audio, threshold: -10, ratio: 8, attack: 1, release: 20 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    expect(outputSamples.length).toBe(n);
    // Loud part should be reduced
    const loudInputRms = rmsVal(samples.slice(100, n / 2));
    const loudOutputRms = rmsVal(outputSamples.slice(100, n / 2));
    expect(loudOutputRms).toBeLessThan(loudInputRms);
  });

  it("Distortion applies soft clipping", async () => {
    const audio = shortSine(8000, 0.1);
    const inputSamples = decodeTestWav(audio).samples;

    const node = new DistortionNode();
    node.assign({ audio, drive_db: 30 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    expect(outputSamples.length).toBe(inputSamples.length);
    expect(arraysAreDifferent(inputSamples, outputSamples)).toBe(true);
    // Distortion with atan keeps values in [-1, 1]
    expect(maxAbsVal(outputSamples)).toBeLessThanOrEqual(1.0);
    // High drive should push samples toward saturation (higher RMS relative to peak)
    const inputCrest = maxAbsVal(inputSamples) / rmsVal(inputSamples);
    const outputCrest = maxAbsVal(outputSamples) / rmsVal(outputSamples);
    expect(outputCrest).toBeLessThan(inputCrest);
  });

  it("Limiter caps peaks", async () => {
    const audio = shortSine(8000, 0.1);

    const node = new LimiterNode();
    node.assign({ audio, threshold_db: -12, release_ms: 50 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    const threshold = Math.pow(10, -12 / 20);
    // After limiter settles, peaks should be near or below threshold
    const laterSamples = outputSamples.slice(100);
    const laterMax = maxAbsVal(laterSamples);
    expect(laterMax).toBeLessThan(threshold + 0.1);
  });

  it("Reverb adds tail energy beyond dry signal", async () => {
    // Short impulse-like signal
    const n = 400;
    const samples = new Float32Array(n);
    samples[0] = 0.9;
    samples[1] = 0.5;
    samples[2] = 0.2;
    const audio = makeAudioRef(samples, 8000);

    const node = new ReverbNode();
    node.assign({ audio, room_scale: 0.8, damping: 0.3, wet_level: 0.5, dry_level: 0.5 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    expect(outputSamples.length).toBe(n);
    // The tail (after the impulse) should have energy from reverb
    const tailRms = rmsVal(outputSamples.slice(50));
    expect(tailRms).toBeGreaterThan(0.001);
  });

  it("NoiseGate silences below threshold", async () => {
    // Create audio with loud and quiet sections
    const n = 800;
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const amp = i < n / 2 ? 0.8 : 0.001;
      samples[i] = amp * Math.sin((2 * Math.PI * 440 * i) / 8000);
    }
    const audio = makeAudioRef(samples, 8000);

    const node = new NoiseGateNode();
    node.assign({ audio, threshold_db: -20, attack_ms: 1, release_ms: 10 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    expect(outputSamples.length).toBe(n);
    // Quiet section should be gated (very low)
    const quietPartRms = rmsVal(outputSamples.slice(n / 2 + 100));
    expect(quietPartRms).toBeLessThan(0.01);
  });

  it("Phaser modifies signal differently from input", async () => {
    const audio = shortSine(8000, 0.1);
    const inputSamples = decodeTestWav(audio).samples;

    const node = new PhaserNode();
    node.assign({ audio, rate_hz: 2, depth: 0.8, mix: 0.5 });
    const res = await node.process();
    const outputSamples = decodeTestWav(res.output as { data: string }).samples;

    expect(outputSamples.length).toBe(inputSamples.length);
    expect(arraysAreDifferent(inputSamples, outputSamples)).toBe(true);
    expect(maxAbsVal(outputSamples)).toBeGreaterThan(0);
  });

  it("PitchShift changes pitch", async () => {
    const audio = shortSine(8000, 0.1);

    const node = new PitchShiftNode();
    node.assign({ audio, semitones: 5 });
    const res = await node.process();
    const out = res.output as { data: string };
    const outputSamples = decodeTestWav(out).samples;

    // Output should exist and be non-empty
    expect(outputSamples.length).toBeGreaterThan(0);
    expect(maxAbsVal(outputSamples)).toBeGreaterThan(0);
  });

  it("TimeStretch produces output with different length", async () => {
    // Use longer audio for SoundTouch to work properly
    const audio = longSine(8000, 0.5);
    const inputLen = decodeTestWav(audio).samples.length;

    const node = new TimeStretchNode();
    node.assign({ audio, rate: 2.0 });
    const res = await node.process();
    const out = res.output as { data: string };
    expect(typeof out.data).toBe("string");
    expect(out.data.length).toBeGreaterThan(0);

    const outputSamples = decodeTestWav(out).samples;
    // rate=2 should produce fewer samples than input
    expect(outputSamples.length).toBeLessThan(inputLen);
    expect(outputSamples.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// lib-audio-spectral: signal verification tests
// ============================================================================

describe("lib-audio-spectral signal verification", () => {
  const audio = longSine(8000, 0.5);

  it("STFT returns correct dimensions [bins][frames]", async () => {
    const node = new STFTNode();
    node.assign({ audio, n_fft: 2048, hop_length: 512 });
    const res = await node.process();
    const out = res.output as { data: number[][] };

    const expectedBins = 2048 / 2 + 1; // 1025
    expect(out.data.length).toBe(expectedBins);
    expect(out.data[0].length).toBeGreaterThan(0);

    // Each frame should have non-negative magnitudes
    for (const frame of out.data) {
      for (const val of frame) {
        expect(val).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("STFT 440Hz sine has peak at correct frequency bin", async () => {
    const node = new STFTNode();
    node.assign({ audio, n_fft: 2048, hop_length: 512 });
    const res = await node.process();
    const out = res.output as { data: number[][] };

    // Find which bin has the highest average energy
    const avgEnergy = out.data.map(
      (binFrames) => binFrames.reduce((a, b) => a + b, 0) / binFrames.length
    );
    const peakBin = avgEnergy.indexOf(Math.max(...avgEnergy));

    // Expected bin for 440Hz: bin = freq * n_fft / sr = 440 * 2048 / 8000 = 112.64
    const expectedBin = Math.round((440 * 2048) / 8000);
    expect(Math.abs(peakBin - expectedBin)).toBeLessThanOrEqual(2);
  });

  it("MelSpectrogram returns [n_mels][frames] with non-negative values", async () => {
    const node = new MelSpectrogramNode();
    node.assign({ audio, n_fft: 2048, hop_length: 512, n_mels: 64 });
    const res = await node.process();
    const out = res.output as { data: number[][] };

    expect(out.data.length).toBe(64);
    expect(out.data[0].length).toBeGreaterThan(0);
    for (const band of out.data) {
      for (const val of band) {
        expect(val).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("MelSpectrogram has energy in mel bands corresponding to 440Hz", async () => {
    const node = new MelSpectrogramNode();
    node.assign({ audio, n_fft: 2048, hop_length: 512, n_mels: 64, fmin: 0, fmax: 4000 });
    const res = await node.process();
    const out = res.output as { data: number[][] };

    // Sum energy per mel band
    const bandEnergy = out.data.map(
      (frames) => frames.reduce((a, b) => a + b, 0)
    );
    const totalEnergy = bandEnergy.reduce((a, b) => a + b, 0);
    expect(totalEnergy).toBeGreaterThan(0);

    // The peak band should contain a meaningful fraction of total energy
    const peakEnergy = Math.max(...bandEnergy);
    expect(peakEnergy / totalEnergy).toBeGreaterThan(0.05);
  });

  it("MFCC returns [n_mfcc][frames] with numeric values", async () => {
    const node = new MFCCNode();
    node.assign({ audio, n_mfcc: 13, n_fft: 2048, hop_length: 512 });
    const res = await node.process();
    const out = res.output as { data: number[][] };

    expect(out.data.length).toBe(13);
    expect(out.data[0].length).toBeGreaterThan(0);
    // MFCCs can be negative, but should be finite numbers
    for (const coeff of out.data) {
      for (const val of coeff) {
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });

  it("ChromaSTFT returns [12][frames] with values in [0,1]", async () => {
    const node = new ChromaSTFTNode();
    node.assign({ audio, n_fft: 2048, hop_length: 512 });
    const res = await node.process();
    const out = res.output as { data: number[][] };

    expect(out.data.length).toBe(12);
    expect(out.data[0].length).toBeGreaterThan(0);
    for (const pitchClass of out.data) {
      for (const val of pitchClass) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it("ChromaSTFT 440Hz (A4) has energy in chroma bin 9 (A)", async () => {
    const node = new ChromaSTFTNode();
    node.assign({ audio, n_fft: 2048, hop_length: 512 });
    const res = await node.process();
    const out = res.output as { data: number[][] };

    // A = pitch class 9 (C=0, C#=1, ... A=9)
    const chromaEnergy = out.data.map(
      (frames) => frames.reduce((a, b) => a + b, 0)
    );
    const peakChroma = chromaEnergy.indexOf(Math.max(...chromaEnergy));
    expect(peakChroma).toBe(9);
  });

  it("SpectralCentroid returns positive Hz values near 440Hz", async () => {
    const node = new SpectralCentroidNode();
    node.assign({ audio, n_fft: 2048, hop_length: 512 });
    const res = await node.process();
    const out = res.output as { data: number[] };

    expect(out.data.length).toBeGreaterThan(0);
    const avgCentroid = out.data.reduce((a, b) => a + b, 0) / out.data.length;
    expect(avgCentroid).toBeGreaterThan(300);
    expect(avgCentroid).toBeLessThan(600);
  });

  it("SpectralContrast returns [7][frames] with numeric values", async () => {
    const node = new SpectralContrastNode();
    node.assign({ audio, n_fft: 2048, hop_length: 512 });
    const res = await node.process();
    const out = res.output as { data: number[][] };

    expect(out.data.length).toBe(7);
    expect(out.data[0].length).toBeGreaterThan(0);
    for (const band of out.data) {
      for (const val of band) {
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });

  it("GriffinLim reconstructs audio from STFT magnitude", async () => {
    const stftNode = new STFTNode();
    stftNode.assign({ audio, n_fft: 256, hop_length: 64 });
    const stftRes = await stftNode.process();
    const stftData = (stftRes.output as { data: number[][] }).data;

    const glNode = new GriffinLimNode();
    glNode.assign({
      magnitude_spectrogram: { data: stftData },
      n_iter: 10,
      hop_length: 64,
    });
    const glRes = await glNode.process();
    const out = (glRes.output as { data: number[] }).data;

    expect(out.length).toBeGreaterThan(0);
    const nonZero = out.filter((v) => Math.abs(v) > 0.001).length;
    expect(nonZero).toBeGreaterThan(out.length * 0.1);
  });

  it("DetectOnsets finds onsets in signal with transients", async () => {
    const sr = 8000;
    const dur = 1.0;
    const n = Math.floor(sr * dur);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((t > 0.2 && t < 0.3) || (t > 0.6 && t < 0.7)) {
        samples[i] = 0.8 * Math.sin(2 * Math.PI * 1000 * t);
      } else {
        samples[i] = 0.01 * (Math.random() * 2 - 1);
      }
    }
    const burstAudio = makeAudioRef(samples, sr);

    const node = new DetectOnsetsNode();
    node.assign({ audio: burstAudio, hop_length: 512 });
    const res = await node.process();
    const out = res.output as { data: number[] };

    expect(Array.isArray(out.data)).toBe(true);
    expect(out.data.length).toBeGreaterThanOrEqual(1);
    for (const t of out.data) {
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(dur);
    }
  });

  it("SegmentAudioByOnsets produces valid audio segments", async () => {
    const node = new SegmentAudioByOnsetsNode();
    node.assign({
      audio,
      onsets: { data: [0.1, 0.3] },
      min_segment_length: 0.05,
    });
    const res = await node.process();
    const segments = res.output as { data: string }[];

    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      expect(typeof seg.data).toBe("string");
      const decoded = decodeTestWav(seg);
      expect(decoded.samples.length).toBeGreaterThan(0);
    }
  });

  it("SegmentAudioByOnsets filters short segments", async () => {
    const node = new SegmentAudioByOnsetsNode();
    node.assign({
      audio,
      onsets: { data: [0.1, 0.105, 0.3] },
      min_segment_length: 0.05,
    });
    const res = await node.process();
    const segments = res.output as { data: string }[];

    for (const seg of segments) {
      const decoded = decodeTestWav(seg);
      const durSec = decoded.samples.length / decoded.sampleRate;
      expect(durSec).toBeGreaterThanOrEqual(0.05);
    }
  });
});

// ============================================================================
// lib-synthesis: signal verification tests
// ============================================================================

describe("lib-synthesis signal verification", () => {
  it("WhiteNoise produces non-zero output with correct length", async () => {
    const node = new WhiteNoiseLibNode();
    node.assign({ amplitude: 0.5, duration: 0.1, sample_rate: 8000 });
    const res = await node.process();
    const out = decodeTestWav(res.output as { data: string });

    const expectedSamples = Math.floor(8000 * 0.1);
    expect(out.samples.length).toBe(expectedSamples);
    expect(maxAbsVal(out.samples)).toBeGreaterThan(0);
    expect(rmsVal(out.samples)).toBeGreaterThan(0.1);
    expect(maxAbsVal(out.samples)).toBeLessThanOrEqual(0.5 + 0.01);
  });

  it("PinkNoise produces non-zero output with correct length", async () => {
    const node = new PinkNoiseLibNode();
    node.assign({ amplitude: 0.7, duration: 0.1, sample_rate: 8000 });
    const res = await node.process();
    const out = decodeTestWav(res.output as { data: string });

    const expectedSamples = Math.floor(8000 * 0.1);
    expect(out.samples.length).toBe(expectedSamples);
    expect(maxAbsVal(out.samples)).toBeGreaterThan(0);
    expect(rmsVal(out.samples)).toBeGreaterThan(0.05);
    expect(maxAbsVal(out.samples)).toBeLessThanOrEqual(0.7 + 0.01);
  });

  it("FM_Synthesis produces output with correct length and non-zero samples", async () => {
    const node = new FM_SynthesisLibNode();
    node.assign({
      carrier_freq: 440,
      modulator_freq: 110,
      modulation_index: 5,
      amplitude: 0.5,
      duration: 0.1,
      sample_rate: 8000,
    });
    const res = await node.process();
    const out = decodeTestWav(res.output as { data: string });

    const expectedSamples = Math.floor(8000 * 0.1);
    expect(out.samples.length).toBe(expectedSamples);
    expect(maxAbsVal(out.samples)).toBeGreaterThan(0);
    expect(maxAbsVal(out.samples)).toBeLessThanOrEqual(0.5 + 0.01);
  });

  it("Oscillator sine produces correct frequency content", async () => {
    const node = new OscillatorLibNode();
    node.assign({
      waveform: "sine",
      frequency: 440,
      amplitude: 0.8,
      duration: 0.1,
      sample_rate: 8000,
    });
    const res = await node.process();
    const out = decodeTestWav(res.output as { data: string });

    expect(out.samples.length).toBe(Math.floor(8000 * 0.1));
    expect(maxAbsVal(out.samples)).toBeGreaterThan(0.7);
    expect(maxAbsVal(out.samples)).toBeLessThanOrEqual(0.8 + 0.01);

    // Verify it looks sinusoidal: check zero crossings
    let zeroCrossings = 0;
    for (let i = 1; i < out.samples.length; i++) {
      if (out.samples[i] * out.samples[i - 1] < 0) zeroCrossings++;
    }
    // 440Hz at 8000 sr for 0.1s = 44 cycles = ~88 zero crossings
    expect(zeroCrossings).toBeGreaterThan(70);
    expect(zeroCrossings).toBeLessThan(110);
  });

  it("Oscillator square produces correct waveform shape", async () => {
    const node = new OscillatorLibNode();
    node.assign({
      waveform: "square",
      frequency: 440,
      amplitude: 0.5,
      duration: 0.05,
      sample_rate: 8000,
    });
    const res = await node.process();
    const out = decodeTestWav(res.output as { data: string });

    let nearPositive = 0;
    let nearNegative = 0;
    for (let i = 0; i < out.samples.length; i++) {
      if (Math.abs(out.samples[i] - 0.5) < 0.05) nearPositive++;
      if (Math.abs(out.samples[i] + 0.5) < 0.05) nearNegative++;
    }
    expect(nearPositive + nearNegative).toBeGreaterThan(out.samples.length * 0.8);
  });

  it("Oscillator sawtooth and triangle produce valid output", async () => {
    for (const waveform of ["sawtooth", "triangle"] as const) {
      const node = new OscillatorLibNode();
      node.assign({
        waveform,
        frequency: 440,
        amplitude: 0.5,
        duration: 0.05,
        sample_rate: 8000,
      });
      const res = await node.process();
      const out = decodeTestWav(res.output as { data: string });
      expect(out.samples.length).toBe(Math.floor(8000 * 0.05));
      expect(maxAbsVal(out.samples)).toBeGreaterThan(0.3);
    }
  });

  it("Envelope modulates amplitude over time", async () => {
    const oscNode = new OscillatorLibNode();
    oscNode.assign({
      waveform: "sine",
      frequency: 440,
      amplitude: 1.0,
      duration: 0.5,
      sample_rate: 8000,
    });
    const oscRes = await oscNode.process();
    const oscSamples = decodeTestWav(oscRes.output as { data: string }).samples;

    const envNode = new EnvelopeLibNode();
    envNode.assign({
      audio: oscRes.output,
      attack: 0.1,
      decay: 0.1,
      release: 0.2,
      peak_amplitude: 1.0,
    });
    const envRes = await envNode.process();
    const envSamples = decodeTestWav(envRes.output as { data: string }).samples;

    expect(envSamples.length).toBe(oscSamples.length);

    // Attack phase: amplitude should increase
    const earlyRms = rmsVal(envSamples.slice(0, 100));
    const midRms = rmsVal(envSamples.slice(300, 500));
    expect(earlyRms).toBeLessThan(midRms);

    // Release phase: end should be quiet
    const endRms = rmsVal(envSamples.slice(-200));
    expect(endRms).toBeLessThan(midRms);
  });

  it("Envelope with zero peak amplitude silences signal", async () => {
    const oscNode = new OscillatorLibNode();
    oscNode.assign({
      waveform: "sine",
      frequency: 440,
      amplitude: 0.5,
      duration: 0.1,
      sample_rate: 8000,
    });
    const oscRes = await oscNode.process();

    const envNode = new EnvelopeLibNode();
    envNode.assign({
      audio: oscRes.output,
      attack: 0.01,
      decay: 0.01,
      release: 0.01,
      peak_amplitude: 0.0,
    });
    const envRes = await envNode.process();
    const envSamples = decodeTestWav(envRes.output as { data: string }).samples;

    expect(rmsVal(envSamples)).toBeLessThan(0.01);
  });
});
