import { describe, it, expect, vi } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  // lib-audio-dsp
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
  // lib-pdf
  GetPageCountPdfPlumberNode,
  ExtractTextPdfPlumberNode,
  ExtractPageMetadataPdfPlumberNode,
  ExtractTablesPdfPlumberNode,
  ExtractImagesPdfPlumberNode,
  ExtractTextPyMuPdfNode,
  ExtractMarkdownPyMuPdfNode,
  ExtractTextBlocksPyMuPdfNode,
  ExtractTextWithStylePyMuPdfNode,
  ExtractTablesPyMuPdfNode,
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
  // uuid
  GenerateUUID4Node,
  GenerateUUID1Node,
  GenerateUUID3Node,
  GenerateUUID5Node,
  ParseUUIDNode,
  FormatUUIDNode,
  IsValidUUIDNode,
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
  it("DBToAmplitude handles 2D arrays", async () => {
    const res = await new DBToAmplitudeNode().process({
      tensor: { data: [[0, 20], [-6]] },
    });
    const out = res.output as { data: number[][] };
    expect(out.data[0][0]).toBeCloseTo(1, 3);
    expect(out.data[0][1]).toBeCloseTo(10, 3);
  });

  it("DBToPower handles 2D arrays", async () => {
    const res = await new DBToPowerNode().process({
      tensor: { data: [[0, 10]] },
    });
    const out = res.output as { data: number[][] };
    expect(out.data[0][0]).toBeCloseTo(1, 3);
    expect(out.data[0][1]).toBeCloseTo(10, 3);
  });

  it("PowerToDB handles 2D arrays", async () => {
    const res = await new PowerToDBNode().process({
      tensor: { data: [[1, 100]] },
    });
    const out = res.output as { data: number[][] };
    expect(out.data[0][0]).toBeCloseTo(0, 3);
    expect(out.data[0][1]).toBeCloseTo(20, 3);
  });

  it("LowPassFilter passes through with no data", async () => {
    const res = await new LowPassFilterNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });

  it("HighPassFilter passes through with no data", async () => {
    const res = await new HighPassFilterNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });

  it("HighShelfFilter passes through with no data", async () => {
    const res = await new HighShelfFilterNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });

  it("LowShelfFilter passes through with no data", async () => {
    const res = await new LowShelfFilterNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });

  it("PeakFilter passes through with no data", async () => {
    const res = await new PeakFilterNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });

  it("Delay passes through with no data", async () => {
    const res = await new DelayNode_().process({ audio: {} });
    expect(res.output).toEqual({});
  });

  it("defaults() returns expected shape for all nodes", () => {
    expect(new AmplitudeToDBNode().serialize()).toHaveProperty("tensor");
    expect(new DBToAmplitudeNode().serialize()).toHaveProperty("tensor");
    expect(new DBToPowerNode().serialize()).toHaveProperty("tensor");
    expect(new PowerToDBNode().serialize()).toHaveProperty("tensor");
    expect(new PlotSpectrogramNode().serialize()).toHaveProperty("fmax");
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
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("Oscillator with pitch envelope (exponential)", async () => {
    const res = await new OscillatorLibNode().process({
      waveform: "sine",
      frequency: 440,
      amplitude: 0.5,
      duration: 0.1,
      sample_rate: 8000,
      pitch_envelope_amount: 12,
      pitch_envelope_time: 0.05,
      pitch_envelope_curve: "exponential",
    });
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
    const res = await new EnvelopeLibNode().process({
      audio: { data: Buffer.from("not-a-wav").toString("base64") },
    });
    expect(res.output).toHaveProperty("data");
  });

  it("Envelope with short audio (envelope longer than signal)", async () => {
    // Very short audio so ADR envelope > signal
    const samples = new Float32Array(100);
    for (let i = 0; i < 100; i++) samples[i] = 0.5;
    const audio = makeAudioRef(samples, 8000);
    const res = await new EnvelopeLibNode().process({
      audio,
      attack: 1.0,
      decay: 1.0,
      release: 1.0,
      peak_amplitude: 1.0,
    });
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// lib-numpy.ts gaps
// ============================================================================

describe("lib-numpy gaps", () => {
  it("AddArray with arrays", async () => {
    const res = await new AddArrayNode().process({
      a: { data: [1, 2, 3], shape: [3] },
      b: { data: [4, 5, 6], shape: [3] },
    });
    expect(res.output).toEqual({ data: [5, 7, 9], shape: [3] });
  });

  it("SubtractArray", async () => {
    const res = await new SubtractArrayNode().process({
      a: { data: [10, 20], shape: [2] },
      b: { data: [1, 2], shape: [2] },
    });
    expect(res.output).toEqual({ data: [9, 18], shape: [2] });
  });

  it("MultiplyArray", async () => {
    const res = await new MultiplyArrayNode().process({
      a: { data: [2, 3], shape: [2] },
      b: { data: [4, 5], shape: [2] },
    });
    expect(res.output).toEqual({ data: [8, 15], shape: [2] });
  });

  it("DivideArray", async () => {
    const res = await new DivideArrayNode().process({
      a: { data: [10, 20], shape: [2] },
      b: { data: [2, 5], shape: [2] },
    });
    expect(res.output).toEqual({ data: [5, 4], shape: [2] });
  });

  it("ModulusArray", async () => {
    const res = await new ModulusArrayNode().process({
      a: { data: [7, 10], shape: [2] },
      b: { data: [3, 4], shape: [2] },
    });
    expect(res.output).toEqual({ data: [1, 2], shape: [2] });
  });

  it("AbsArray", async () => {
    const res = await new AbsArrayNode().process({
      values: { data: [-1, 2, -3], shape: [3] },
    });
    expect(res.output).toEqual({ data: [1, 2, 3], shape: [3] });
  });

  it("SineArray", async () => {
    const res = await new SineArrayNode().process({ angle_rad: [0, Math.PI / 2] });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data[0]).toBeCloseTo(0, 5);
    expect(out.data[1]).toBeCloseTo(1, 5);
  });

  it("CosineArray", async () => {
    const res = await new CosineArrayNode().process({ angle_rad: [0, Math.PI] });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data[0]).toBeCloseTo(1, 5);
    expect(out.data[1]).toBeCloseTo(-1, 5);
  });

  it("ExpArray", async () => {
    const res = await new ExpArrayNode().process({
      values: { data: [0, 1], shape: [2] },
    });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data[0]).toBeCloseTo(1, 5);
    expect(out.data[1]).toBeCloseTo(Math.E, 5);
  });

  it("LogArray", async () => {
    const res = await new LogArrayNode().process({
      values: { data: [1, Math.E], shape: [2] },
    });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data[0]).toBeCloseTo(0, 5);
    expect(out.data[1]).toBeCloseTo(1, 5);
  });

  it("SqrtArray", async () => {
    const res = await new SqrtArrayNode().process({
      values: { data: [4, 9], shape: [2] },
    });
    expect(res.output).toEqual({ data: [2, 3], shape: [2] });
  });

  it("PowerArray", async () => {
    const res = await new PowerArrayNode().process({
      base: { data: [2, 3], shape: [2] },
      exponent: { data: [3, 2], shape: [2] },
    });
    expect(res.output).toEqual({ data: [8, 9], shape: [2] });
  });

  it("SumArray", async () => {
    const res = await new SumArrayNode().process({
      values: { data: [1, 2, 3, 4], shape: [4] },
    });
    expect(res.output).toBe(10);
  });

  it("MeanArray", async () => {
    const res = await new MeanArrayNode().process({
      values: { data: [2, 4, 6], shape: [3] },
    });
    expect(res.output).toBe(4);
  });

  it("MinArray", async () => {
    const res = await new MinArrayNode().process({
      values: { data: [3, 1, 4, 1, 5], shape: [5] },
    });
    expect(res.output).toBe(1);
  });

  it("MaxArray", async () => {
    const res = await new MaxArrayNode().process({
      values: { data: [3, 1, 4, 1, 5], shape: [5] },
    });
    expect(res.output).toBe(5);
  });

  it("ArgMinArray", async () => {
    const res = await new ArgMinArrayNode().process({
      values: { data: [3, 1, 4], shape: [3] },
    });
    expect(res.output).toBe(1);
  });

  it("ArgMaxArray", async () => {
    const res = await new ArgMaxArrayNode().process({
      values: { data: [3, 1, 4], shape: [3] },
    });
    expect(res.output).toBe(2);
  });

  it("SliceArray", async () => {
    const res = await new SliceArrayNode().process({
      values: { data: [10, 20, 30, 40, 50], shape: [5] },
      start: 1,
      stop: 4,
      step: 1,
    });
    expect(res.output).toEqual({ data: [20, 30, 40], shape: [3] });
  });

  it("IndexArray", async () => {
    const res = await new IndexArrayNode().process({
      values: { data: [10, 20, 30, 40], shape: [4] },
      indices: "0,2",
    });
    expect(res.output).toEqual({ data: [10, 30], shape: [2] });
  });

  it("TransposeArray 2D", async () => {
    const res = await new TransposeArrayNode().process({
      values: { data: [1, 2, 3, 4, 5, 6], shape: [2, 3] },
    });
    expect(res.output).toEqual({ data: [1, 4, 2, 5, 3, 6], shape: [3, 2] });
  });

  it("TransposeArray 1D is no-op", async () => {
    const res = await new TransposeArrayNode().process({
      values: { data: [1, 2, 3], shape: [3] },
    });
    expect(res.output).toEqual({ data: [1, 2, 3], shape: [3] });
  });

  it("TransposeArray 3D", async () => {
    const res = await new TransposeArrayNode().process({
      values: { data: [1, 2, 3, 4, 5, 6, 7, 8], shape: [2, 2, 2] },
    });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.shape).toEqual([2, 2, 2]);
    expect(out.data.length).toBe(8);
  });

  it("MatMul", async () => {
    const res = await new MatMulNode().process({
      a: { data: [1, 2, 3, 4], shape: [2, 2] },
      b: { data: [5, 6, 7, 8], shape: [2, 2] },
    });
    expect(res.output).toEqual({ data: [19, 22, 43, 50], shape: [2, 2] });
  });

  it("MatMul shape mismatch throws", async () => {
    await expect(
      new MatMulNode().process({
        a: { data: [1, 2, 3], shape: [1, 3] },
        b: { data: [1, 2], shape: [1, 2] },
      })
    ).rejects.toThrow("Shape mismatch");
  });

  it("MatMul non-2D throws", async () => {
    await expect(
      new MatMulNode().process({
        a: { data: [1, 2, 3], shape: [3] },
        b: { data: [1, 2, 3], shape: [3] },
      })
    ).rejects.toThrow("2D");
  });

  it("StackNode", async () => {
    const res = await new StackNode().process({
      arrays: [
        { data: [1, 2], shape: [2] },
        { data: [3, 4], shape: [2] },
      ],
      axis: 0,
    });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data).toEqual([1, 2, 3, 4]);
  });

  it("StackNode empty returns empty", async () => {
    const res = await new StackNode().process({ arrays: [] });
    expect(res.output).toEqual({ data: [], shape: [0] });
  });

  it("SplitArrayNode", async () => {
    const res = await new SplitArrayNode().process({
      values: { data: [1, 2, 3, 4, 5, 6], shape: [6] },
      num_splits: 3,
    });
    const out = res.output as { data: number[]; shape: number[] }[];
    expect(out.length).toBe(3);
  });

  it("Reshape1D", async () => {
    const res = await new Reshape1DNode().process({
      values: { data: [1, 2, 3, 4], shape: [2, 2] },
    });
    expect(res.output).toEqual({ data: [1, 2, 3, 4], shape: [4] });
  });

  it("Reshape2D", async () => {
    const res = await new Reshape2DNode().process({
      values: { data: [1, 2, 3, 4], shape: [4] },
      num_rows: 2,
      num_cols: 2,
    });
    expect(res.output).toEqual({ data: [1, 2, 3, 4], shape: [2, 2] });
  });

  it("Reshape3D", async () => {
    const res = await new Reshape3DNode().process({
      values: { data: [1, 2, 3, 4, 5, 6, 7, 8], shape: [8] },
      num_rows: 2,
      num_cols: 2,
      num_depths: 2,
    });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.shape).toEqual([2, 2, 2]);
  });

  it("Reshape4D", async () => {
    const res = await new Reshape4DNode().process({
      values: { data: [1, 2, 3, 4], shape: [4] },
      num_rows: 1,
      num_cols: 1,
      num_depths: 2,
      num_channels: 2,
    });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.shape).toEqual([1, 1, 2, 2]);
  });

  it("ListToArray with nested", async () => {
    const res = await new ListToArrayNode().process({
      values: [[1, 2], [3, 4]],
    });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data).toEqual([1, 2, 3, 4]);
    expect(out.shape).toEqual([2, 2]);
  });

  it("ArrayToList 2D", async () => {
    const res = await new ArrayToListNode().process({
      values: { data: [1, 2, 3, 4], shape: [2, 2] },
    });
    expect(res.output).toEqual([[1, 2], [3, 4]]);
  });

  it("ScalarToArray", async () => {
    const res = await new ScalarToArrayNode().process({ value: 42 });
    expect(res.output).toEqual({ data: [42], shape: [1] });
  });

  it("ArrayToScalar", async () => {
    const res = await new ArrayToScalarNode().process({
      values: { data: [7], shape: [1] },
    });
    expect(res.output).toBe(7);
  });

  it("ConvertToImage 2D grayscale", async () => {
    const res = await new NumpyConvertToImageNode().process({
      values: { data: [0, 0.5, 0.5, 1], shape: [2, 2] },
    });
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("ConvertToImage 3D RGB", async () => {
    const data = new Array(2 * 2 * 3).fill(0.5);
    const res = await new NumpyConvertToImageNode().process({
      values: { data, shape: [2, 2, 3] },
    });
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("ConvertToImage empty throws", async () => {
    await expect(
      new NumpyConvertToImageNode().process({ values: { data: [], shape: [0] } })
    ).rejects.toThrow("not connected");
  });

  it("ConvertToImage bad channels throws", async () => {
    await expect(
      new NumpyConvertToImageNode().process({
        values: { data: new Array(2 * 2 * 2).fill(0.5), shape: [2, 2, 2] },
      })
    ).rejects.toThrow("channels");
  });

  it("ConvertToAudio", async () => {
    const res = await new NumpyConvertToAudioNode().process({
      values: { data: [0, 0.5, -0.5, 0], shape: [4] },
      sample_rate: 8000,
    });
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("BinaryOperationNode", async () => {
    const res = await new BinaryOperationNode().process({ a: 3, b: 4 });
    expect(res.output).toBe(7);
  });

  it("SaveArrayNode without context", async () => {
    const res = await new SaveArrayNode().process({
      values: { data: [1, 2], shape: [2] },
      name: "test.json",
    });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data).toEqual([1, 2]);
  });

  it("PlotArrayNode 2D", async () => {
    const res = await new PlotArrayNode().process({
      values: { data: [0, 1, 2, 3], shape: [2, 2] },
    });
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("PlotArrayNode 1D", async () => {
    const res = await new PlotArrayNode().process({
      values: { data: [1, 3, 2, 4, 0], shape: [5] },
    });
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("PlotArrayNode empty throws", async () => {
    await expect(
      new PlotArrayNode().process({ values: { data: [], shape: [0] } })
    ).rejects.toThrow("Empty");
  });

  it("AddArray scalar broadcast", async () => {
    const res = await new AddArrayNode().process({ a: 5, b: [1, 2, 3] });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data).toEqual([6, 7, 8]);
  });

  it("AddArray with padding (different lengths)", async () => {
    const res = await new AddArrayNode().process({
      a: { data: [1, 2], shape: [2] },
      b: { data: [10, 20, 30], shape: [3] },
    });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data).toEqual([11, 22, 30]);
  });

  it("reduceAlongAxis 2D", async () => {
    const res = await new SumArrayNode().process({
      values: { data: [1, 2, 3, 4, 5, 6], shape: [2, 3] },
      axis: 1,
    });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.data).toEqual([6, 15]);
  });

  it("convertOutput single element returns scalar", async () => {
    const res = await new SumArrayNode().process({
      values: { data: [42], shape: [1] },
    });
    expect(res.output).toBe(42);
  });

  it("asNdArray handles number", async () => {
    const res = await new AddArrayNode().process({ a: 5, b: 3 });
    expect(res.output).toBe(8);
  });

  it("IndexArray with empty indices", async () => {
    const res = await new IndexArrayNode().process({
      values: { data: [1, 2, 3], shape: [3] },
      indices: "",
    });
    expect(res.output).toEqual({ data: [], shape: [0] });
  });

  it("SliceArray with empty data returns empty", async () => {
    const res = await new SliceArrayNode().process({
      values: { data: [], shape: [] },
    });
    expect(res.output).toEqual({ data: [], shape: [] });
  });

  // ConvertToArrayNumpyNode - needs an image
  it("ConvertToArrayNumpyNode with small PNG", async () => {
    // Create a 2x2 red PNG via sharp
    const sharp = (await import("sharp")).default;
    const pngBuf = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).png().toBuffer();

    const res = await new ConvertToArrayNumpyNode().process({
      image: { data: pngBuf.toString("base64") },
    });
    const out = res.output as { data: number[]; shape: number[] };
    expect(out.shape[0]).toBe(2);
    expect(out.shape[1]).toBe(2);
  });

  it("ConvertToArrayNumpyNode no data throws", async () => {
    await expect(
      new ConvertToArrayNumpyNode().process({ image: {} })
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

describe("lib-pdf gaps", () => {
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
    const res = await new GetPageCountPdfPlumberNode().process({ pdf: makePdf() });
    expect(res.output).toBe(1);
  });

  it("ExtractText", async () => {
    const res = await new ExtractTextPdfPlumberNode().process({ pdf: makePdf() });
    expect(typeof res.output).toBe("string");
  });

  it("ExtractPageMetadata", async () => {
    const res = await new ExtractPageMetadataPdfPlumberNode().process({ pdf: makePdf() });
    const out = res.output as any[];
    expect(out.length).toBe(1);
    expect(out[0]).toHaveProperty("width");
  });

  it("ExtractTables", async () => {
    const res = await new ExtractTablesPdfPlumberNode().process({ pdf: makePdf() });
    expect(Array.isArray(res.output)).toBe(true);
  });

  it("ExtractImages returns empty", async () => {
    const res = await new ExtractImagesPdfPlumberNode().process({ pdf: makePdf() });
    expect(res.output).toEqual([]);
  });

  it("ExtractTextPyMuPdf", async () => {
    const res = await new ExtractTextPyMuPdfNode().process({ pdf: makePdf() });
    expect(typeof res.output).toBe("string");
  });

  it("ExtractMarkdownPyMuPdf", async () => {
    const res = await new ExtractMarkdownPyMuPdfNode().process({ pdf: makePdf() });
    expect(typeof res.output).toBe("string");
  });

  it("ExtractTextBlocksPyMuPdf", async () => {
    const res = await new ExtractTextBlocksPyMuPdfNode().process({ pdf: makePdf() });
    expect(Array.isArray(res.output)).toBe(true);
  });

  it("ExtractTextWithStylePyMuPdf", async () => {
    const res = await new ExtractTextWithStylePyMuPdfNode().process({ pdf: makePdf() });
    expect(Array.isArray(res.output)).toBe(true);
  });

  it("ExtractTablesPyMuPdf", async () => {
    const res = await new ExtractTablesPyMuPdfNode().process({ pdf: makePdf() });
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

  it("CreateTable + Insert + Query + Update + Delete flow", async () => {
    const createRes = await new CreateTableLibNode().process(
      {
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
      },
      ctx
    );
    expect(createRes.table_name).toBe("items");

    // Insert
    const ins = await new SqliteInsertLibNode().process(
      { database_name: "test.db", table_name: "items", data: { name: "foo", value: 42.5 } },
      ctx
    );
    expect(ins.row_id).toBeDefined();

    // Query
    const query = await new QueryLibNode().process(
      { database_name: "test.db", table_name: "items", where: "", order_by: "", limit: 0 },
      ctx
    );
    expect((query.output as any[]).length).toBe(1);

    // Query with columns, where, order_by, limit
    const query2 = await new QueryLibNode().process(
      {
        database_name: "test.db",
        table_name: "items",
        columns: { columns: [{ name: "name" }] },
        where: "name = 'foo'",
        order_by: "name",
        limit: 1,
      },
      ctx
    );
    expect((query2.output as any[]).length).toBe(1);

    // Update
    const upd = await new SqliteUpdateLibNode().process(
      { database_name: "test.db", table_name: "items", data: { name: "bar" }, where: "name = 'foo'" },
      ctx
    );
    expect(upd.rows_affected).toBe(1);

    // Update without where
    const upd2 = await new SqliteUpdateLibNode().process(
      { database_name: "test.db", table_name: "items", data: { name: "baz" } },
      ctx
    );
    expect(upd2.rows_affected).toBe(1);

    // Delete
    const del = await new SqliteDeleteLibNode().process(
      { database_name: "test.db", table_name: "items", where: "name = 'baz'" },
      ctx
    );
    expect(del.rows_affected).toBe(1);
  });

  it("Delete without where throws", async () => {
    await expect(
      new SqliteDeleteLibNode().process(
        { database_name: "test.db", table_name: "items", where: "" },
        ctx
      )
    ).rejects.toThrow("WHERE");
  });

  it("ExecuteSQL modifying", async () => {
    // Create table first
    await new ExecuteSQLLibNode().process(
      { database_name: "exec.db", sql: "CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)" },
      ctx
    );
    const ins = await new ExecuteSQLLibNode().process(
      { database_name: "exec.db", sql: "INSERT INTO t (val) VALUES (?)", parameters: ["hello"] },
      ctx
    );
    expect(ins.rows_affected).toBe(1);

    // Query
    const q = await new ExecuteSQLLibNode().process(
      { database_name: "exec.db", sql: "SELECT * FROM t" },
      ctx
    );
    expect((q.rows as any[]).length).toBe(1);
  });

  it("Query non-existent db returns empty", async () => {
    const ctx2 = { workspaceDir: tmpDir() } as any;
    const res = await new QueryLibNode().process(
      { database_name: "nonexistent.db", table_name: "x" },
      ctx2
    );
    expect(res.output).toEqual([]);
  });

  it("GetDatabasePath", async () => {
    const res = await new GetDatabasePathLibNode().process(
      { database_name: "test.db" },
      ctx
    );
    expect(typeof res.output).toBe("string");
    expect((res.output as string).endsWith("test.db")).toBe(true);
  });

  it("CreateTable with existing table returns early", async () => {
    const ctx2 = { workspaceDir: tmpDir() } as any;
    await new CreateTableLibNode().process(
      {
        database_name: "dup.db",
        table_name: "t",
        columns: { columns: [{ name: "a", data_type: "string" }] },
      },
      ctx2
    );
    // Second call - table already exists
    const res = await new CreateTableLibNode().process(
      {
        database_name: "dup.db",
        table_name: "t",
        columns: { columns: [{ name: "a", data_type: "string" }] },
      },
      ctx2
    );
    expect(res.table_name).toBe("t");
  });

  it("Insert with JSON value serialization", async () => {
    const ctx2 = { workspaceDir: tmpDir() } as any;
    await new ExecuteSQLLibNode().process(
      { database_name: "json.db", sql: "CREATE TABLE j (data TEXT)" },
      ctx2
    );
    await new SqliteInsertLibNode().process(
      { database_name: "json.db", table_name: "j", data: { data: { nested: true } } },
      ctx2
    );
    const q = await new QueryLibNode().process(
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
    const wb = await new CreateWorkbookLibNode().process({ sheet_name: "S1" });

    const written = await new DataFrameToExcelLibNode().process({
      workbook: wb.output,
      dataframe: { rows: [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }] },
      sheet_name: "S1",
      include_header: true,
    });

    const read = await new ExcelToDataFrameLibNode().process({
      workbook: written.output,
      sheet_name: "S1",
      has_header: true,
    });
    const rows = (read.output as any).rows;
    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe("Alice");

    // Without header
    const read2 = await new ExcelToDataFrameLibNode().process({
      workbook: written.output,
      sheet_name: "S1",
      has_header: false,
    });
    expect((read2.output as any).rows.length).toBe(3); // header row + 2 data rows

    // Format
    const formatted = await new FormatCellsLibNode().process({
      workbook: written.output,
      sheet_name: "S1",
      cell_range: "A1:B1",
      bold: true,
      background_color: "FFFF00",
      text_color: "000000",
    });
    expect(formatted.output).toBeDefined();

    // AutoFit
    const fitted = await new AutoFitColumnsLibNode().process({
      workbook: written.output,
      sheet_name: "S1",
    });
    expect(fitted.output).toBeDefined();
  });

  it("DataFrameToExcel empty rows", async () => {
    const wb = await new CreateWorkbookLibNode().process({ sheet_name: "S1" });
    const res = await new DataFrameToExcelLibNode().process({
      workbook: wb.output,
      dataframe: { rows: [] },
      sheet_name: "S1",
    });
    expect(res.output).toBeDefined();
  });

  it("DataFrameToExcel creates sheet if not exists", async () => {
    const wb = await new CreateWorkbookLibNode().process({ sheet_name: "S1" });
    const res = await new DataFrameToExcelLibNode().process({
      workbook: wb.output,
      dataframe: { rows: [{ x: 1 }] },
      sheet_name: "NewSheet",
    });
    expect(res.output).toBeDefined();
  });

  it("SaveWorkbook writes file", async () => {
    const dir = tmpDir();
    const wb = await new CreateWorkbookLibNode().process({ sheet_name: "S1" });
    const res = await new SaveWorkbookLibNode().process({
      workbook: wb.output,
      folder: { path: dir },
      filename: "test.xlsx",
    });
    expect(typeof res.output).toBe("string");
  });

  it("SaveWorkbook no path throws", async () => {
    const wb = await new CreateWorkbookLibNode().process({});
    await expect(
      new SaveWorkbookLibNode().process({ workbook: wb.output, folder: { path: "" }, filename: "x.xlsx" })
    ).rejects.toThrow("Path");
  });

  it("ExcelToDataFrame missing sheet throws", async () => {
    const wb = await new CreateWorkbookLibNode().process({ sheet_name: "S1" });
    await expect(
      new ExcelToDataFrameLibNode().process({ workbook: wb.output, sheet_name: "Missing" })
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
    const res = await new CreateDocumentLibNode().process({});
    expect((res.output as any).elements).toEqual([]);
  });

  it("AddHeading", async () => {
    const doc = { elements: [] };
    const res = await new AddHeadingLibNode().process({ document: doc, text: "Title", level: 1 });
    expect((res.output as any).elements.length).toBe(1);
  });

  it("AddParagraph", async () => {
    const doc = { elements: [] };
    const res = await new AddParagraphLibNode().process({
      document: doc,
      text: "Hello",
      alignment: "CENTER",
      bold: true,
      italic: true,
      font_size: 14,
    });
    expect((res.output as any).elements.length).toBe(1);
  });

  it("AddTable with rows", async () => {
    const doc = { elements: [] };
    const res = await new AddTableLibNode().process({
      document: doc,
      data: { rows: [{ a: "1", b: "2" }] },
    });
    expect((res.output as any).elements.length).toBe(1);
  });

  it("AddTable with data array", async () => {
    const doc = { elements: [] };
    const res = await new AddTableLibNode().process({
      document: doc,
      data: { data: [["a", "b"], ["c", "d"]] },
    });
    expect((res.output as any).elements[0].type).toBe("table");
  });

  it("AddPageBreak", async () => {
    const doc = { elements: [] };
    const res = await new AddPageBreakLibNode().process({ document: doc });
    expect((res.output as any).elements[0].type).toBe("page_break");
  });

  it("SetDocumentProperties", async () => {
    const doc = { elements: [] };
    const res = await new SetDocumentPropertiesLibNode().process({
      document: doc,
      title: "My Doc",
      author: "Author",
      subject: "Test",
      keywords: "kw",
    });
    expect((res.output as any).properties.title).toBe("My Doc");
  });

  it("AddImage with buffer data", async () => {
    const doc = { elements: [] };
    const imgData = Buffer.alloc(10, 0xff);
    const res = await new AddImageLibNode().process({
      document: doc,
      image: { data: imgData },
      width: 1,
      height: 1,
    });
    expect((res.output as any).elements[0].type).toBe("image");
  });

  it("AddImage invalid throws", async () => {
    const doc = { elements: [] };
    await expect(
      new AddImageLibNode().process({ document: doc, image: { }, width: 0, height: 0 })
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
    const res = await new SaveDocumentLibNode().process({
      document: doc,
      path: { path: dir },
      filename: "test.docx",
    });
    expect(typeof res.output).toBe("string");
  });

  it("SaveDocument no path throws", async () => {
    await expect(
      new SaveDocumentLibNode().process({ document: { elements: [] }, path: "", filename: "x.docx" })
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
    const res = await new BaseUrlLibNode().process({ url: "https://example.com/foo/bar" });
    expect(res.output).toBe("https://example.com");
  });

  it("BaseUrl empty throws", async () => {
    await expect(new BaseUrlLibNode().process({ url: "" })).rejects.toThrow();
  });

  it("ExtractLinks", async () => {
    const res = await new ExtractLinksLibNode().process({ html, base_url: "https://example.com" });
    const out = res.output as any;
    expect(out.data.length).toBe(2);
  });

  it("ExtractImages", async () => {
    const res = await new ExtractImagesLibNode().process({ html, base_url: "https://example.com" });
    expect((res.output as any[]).length).toBe(1);
  });

  it("ExtractAudio", async () => {
    const res = await new ExtractAudioLibNode().process({ html, base_url: "https://example.com" });
    expect((res.output as any[]).length).toBeGreaterThan(0);
  });

  it("ExtractVideos", async () => {
    const res = await new ExtractVideosLibNode().process({ html, base_url: "https://example.com" });
    expect((res.output as any[]).length).toBe(2);
  });

  it("ExtractMetadata", async () => {
    const res = await new ExtractMetadataLibNode().process({ html });
    expect(res.title).toBe("Test");
    expect(res.description).toBe("desc");
    expect(res.keywords).toBe("kw");
  });

  it("HTMLToText", async () => {
    const res = await new HTMLToTextLibNode().process({ text: "<p>Hello <b>World</b></p>" });
    expect((res.output as string).includes("Hello")).toBe(true);
    expect((res.output as string).includes("World")).toBe(true);
  });

  it("HTMLToText no linebreaks", async () => {
    const res = await new HTMLToTextLibNode().process({
      text: "<p>Hello</p>",
      preserve_linebreaks: false,
    });
    expect(typeof res.output).toBe("string");
  });

  it("WebsiteContentExtractor with readable content", async () => {
    const rich = `<html><head><title>Article</title></head><body>
      <article><p>${"word ".repeat(200)}</p></article>
    </body></html>`;
    const res = await new WebsiteContentExtractorLibNode().process({ html_content: rich });
    expect((res.output as string).length).toBeGreaterThan(0);
  });

  it("WebsiteContentExtractor fallback path", async () => {
    // Minimal HTML without enough content for Readability
    const res = await new WebsiteContentExtractorLibNode().process({ html_content: "<body>Hello</body>" });
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

describe("lib-seaborn gaps", () => {
  it("ChartRenderer renders a basic bar chart", async () => {
    const res = await new ChartRendererLibNode().process({
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
    const out = res.output as { data: string };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("ChartRenderer empty data throws", async () => {
    await expect(
      new ChartRendererLibNode().process({
        chart_config: {},
        data: { columns: [], data: [] },
      })
    ).rejects.toThrow("Data is required");
  });

  it("ChartRenderer scatter type", async () => {
    const res = await new ChartRendererLibNode().process({
      chart_config: {
        data: { series: [{ plot_type: "scatter", x: "x", y: "y" }] },
      },
      data: {
        columns: [{ name: "x" }, { name: "y" }],
        data: [[1, 2], [3, 4]],
      },
    });
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
    const res = await new BitcrushNode().process({
      audio,
      bit_depth: 4,
      sample_rate_reduction: 2,
    });
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("Bitcrush no data passes through", async () => {
    const res = await new BitcrushNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });

  it("Compress", async () => {
    const res = await new CompressNode().process({
      audio,
      threshold: -10,
      ratio: 4,
      attack: 5,
      release: 50,
    });
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("Compress no data", async () => {
    const res = await new CompressNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });

  it("Distortion", async () => {
    const res = await new DistortionNode().process({ audio, drive_db: 20 });
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("Distortion no data", async () => {
    const res = await new DistortionNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });

  it("Limiter", async () => {
    const res = await new LimiterNode().process({ audio, threshold_db: -6, release_ms: 100 });
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("Limiter no data", async () => {
    const res = await new LimiterNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });

  it("Reverb", async () => {
    const res = await new ReverbNode().process({
      audio,
      room_scale: 0.5,
      damping: 0.5,
      wet_level: 0.15,
      dry_level: 0.5,
    });
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("Reverb no data", async () => {
    const res = await new ReverbNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });

  it("PitchShift semitones=0 passes through", async () => {
    const res = await new PitchShiftNode().process({ audio, semitones: 0 });
    expect(res.output).toEqual(audio);
  });

  it("PitchShift no data", async () => {
    const res = await new PitchShiftNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });

  it("PitchShift with shift", async () => {
    const res = await new PitchShiftNode().process({ audio, semitones: 2 });
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("TimeStretch rate=1 passes through", async () => {
    const res = await new TimeStretchNode().process({ audio, rate: 1.0 });
    expect(res.output).toEqual(audio);
  });

  it("TimeStretch no data", async () => {
    const res = await new TimeStretchNode().process({ audio: {} });
    expect(res.output).toEqual({});
  });

  it("TimeStretch with rate", async () => {
    const res = await new TimeStretchNode().process({ audio, rate: 1.5 });
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("NoiseGate throws not implemented", async () => {
    await expect(new NoiseGateNode().process({})).rejects.toThrow("not yet implemented");
  });

  it("Phaser throws not implemented", async () => {
    await expect(new PhaserNode().process({})).rejects.toThrow("not yet implemented");
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
    const res = await new STFTNode().process({ audio, n_fft: 2048, hop_length: 512 });
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("STFT no data", async () => {
    const res = await new STFTNode().process({ audio: {} });
    expect((res.output as any).data).toEqual([]);
  });

  it("MelSpectrogram", async () => {
    const res = await new MelSpectrogramNode().process({
      audio,
      n_fft: 2048,
      hop_length: 512,
      n_mels: 32,
    });
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(32);
  });

  it("MelSpectrogram no data", async () => {
    const res = await new MelSpectrogramNode().process({ audio: {} });
    expect((res.output as any).data).toEqual([]);
  });

  it("MFCC", async () => {
    const res = await new MFCCNode().process({
      audio,
      n_mfcc: 13,
      n_fft: 2048,
      hop_length: 512,
    });
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(13);
  });

  it("MFCC no data", async () => {
    const res = await new MFCCNode().process({ audio: {} });
    expect((res.output as any).data).toEqual([]);
  });

  it("ChromaSTFT", async () => {
    const res = await new ChromaSTFTNode().process({ audio, n_fft: 2048, hop_length: 512 });
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(12);
  });

  it("ChromaSTFT no data", async () => {
    const res = await new ChromaSTFTNode().process({ audio: {} });
    expect((res.output as any).data).toEqual([]);
  });

  it("SpectralCentroid", async () => {
    const res = await new SpectralCentroidNode().process({ audio, n_fft: 2048, hop_length: 512 });
    const out = res.output as { data: number[] };
    expect(out.data.length).toBeGreaterThan(0);
  });

  it("SpectralCentroid no data", async () => {
    const res = await new SpectralCentroidNode().process({ audio: {} });
    expect((res.output as any).data).toEqual([]);
  });

  it("SpectralContrast", async () => {
    const res = await new SpectralContrastNode().process({ audio, n_fft: 2048, hop_length: 512 });
    const out = res.output as { data: number[][] };
    expect(out.data.length).toBe(7);
  });

  it("SpectralContrast no data", async () => {
    const res = await new SpectralContrastNode().process({ audio: {} });
    expect((res.output as any).data).toEqual([]);
  });

  it("GriffinLim throws", async () => {
    await expect(new GriffinLimNode().process({})).rejects.toThrow("not implemented");
  });

  it("DetectOnsets", async () => {
    const res = await new DetectOnsetsNode().process({ audio });
    const out = res.output as { data: number[] };
    expect(Array.isArray(out.data)).toBe(true);
  });

  it("DetectOnsets no data", async () => {
    const res = await new DetectOnsetsNode().process({ audio: {} });
    expect((res.output as any).data).toEqual([]);
  });

  it("SegmentAudioByOnsets", async () => {
    const res = await new SegmentAudioByOnsetsNode().process({
      audio,
      onsets: { data: [0.1, 0.3] },
      min_segment_length: 0.05,
    });
    expect(Array.isArray(res.output)).toBe(true);
  });

  it("SegmentAudioByOnsets no data", async () => {
    const res = await new SegmentAudioByOnsetsNode().process({ audio: {} });
    expect(res.output).toEqual([]);
  });

  it("SaveAudioSegments with no folder returns folder", async () => {
    const res = await new SaveAudioSegmentsNode().process({
      segments: [],
      output_folder: {},
    });
    expect(res.output).toEqual({});
  });

  it("SaveAudioSegments writes files", async () => {
    const dir = tmpDir();
    const osc = await new OscillatorLibNode().process({
      duration: 0.05,
      sample_rate: 8000,
    });
    const res = await new SaveAudioSegmentsNode().process({
      segments: [osc.output],
      output_folder: { path: dir },
      name_prefix: "seg",
    });
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
    const res = await new ImportCSVNode().process({ csv_data: "name,age\nAlice,30\nBob,25" });
    const rows = (res.output as any).rows;
    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe("Alice");
  });

  it("Filter with condition", async () => {
    const res = await new FilterDataframeNode().process({
      df: df([{ x: 1 }, { x: 2 }, { x: 3 }]),
      condition: "x > 1",
    });
    expect((res.output as any).rows.length).toBe(2);
  });

  it("Filter with 'and'/'or' keywords", async () => {
    const res = await new FilterDataframeNode().process({
      df: df([{ x: 1 }, { x: 2 }, { x: 3 }]),
      condition: "x > 1 and x < 3",
    });
    expect((res.output as any).rows.length).toBe(1);
  });

  it("Slice", async () => {
    const res = await new SliceDataframeNode().process({
      dataframe: df([{ x: 1 }, { x: 2 }, { x: 3 }]),
      start_index: 1,
      end_index: 2,
    });
    expect((res.output as any).rows.length).toBe(1);
  });

  it("SaveDataframe", async () => {
    const dir = tmpDir();
    const res = await new SaveDataframeNode().process({
      df: df([{ a: 1, b: 2 }]),
      folder: dir,
      name: "test.csv",
    });
    expect(res.path).toBeDefined();
  });

  it("FromList", async () => {
    const res = await new FromListNode().process({
      values: [{ name: "Alice" }, { name: "Bob" }],
    });
    expect((res.output as any).rows.length).toBe(2);
  });

  it("FromList with value wrapper", async () => {
    const res = await new FromListNode().process({
      values: [{ name: { value: "Alice" } }],
    });
    expect((res.output as any).rows[0].name).toBe("Alice");
  });

  it("FromList with non-primitive values", async () => {
    const res = await new FromListNode().process({
      values: [{ arr: [1, 2, 3] }],
    });
    expect((res.output as any).rows[0].arr).toBe("1,2,3");
  });

  it("FromList non-dict throws", async () => {
    await expect(
      new FromListNode().process({ values: ["not-a-dict"] })
    ).rejects.toThrow("dicts");
  });

  it("JSONToDataframe", async () => {
    const res = await new JSONToDataframeNode().process({
      text: '[{"a":1},{"a":2}]',
    });
    expect((res.output as any).rows.length).toBe(2);
  });

  it("ToList", async () => {
    const res = await new ToListNode().process({
      dataframe: df([{ x: 1 }]),
    });
    expect(res.output).toEqual([{ x: 1 }]);
  });

  it("SelectColumn", async () => {
    const res = await new SelectColumnNode().process({
      dataframe: df([{ a: 1, b: 2 }]),
      columns: "a",
    });
    expect((res.output as any).rows[0]).toEqual({ a: 1 });
  });

  it("ExtractColumn", async () => {
    const res = await new ExtractColumnNode().process({
      dataframe: df([{ x: 10 }, { x: 20 }]),
      column_name: "x",
    });
    expect(res.output).toEqual([10, 20]);
  });

  it("AddColumn", async () => {
    const res = await new AddColumnNode().process({
      dataframe: df([{ a: 1 }]),
      column_name: "b",
      values: [2],
    });
    expect((res.output as any).rows[0].b).toBe(2);
  });

  it("Merge", async () => {
    const res = await new MergeDataframeNode().process({
      dataframe_a: df([{ a: 1 }]),
      dataframe_b: df([{ b: 2 }]),
    });
    expect((res.output as any).rows[0]).toEqual({ a: 1, b: 2 });
  });

  it("Append", async () => {
    const res = await new AppendDataframeNode().process({
      dataframe_a: df([{ x: 1 }]),
      dataframe_b: df([{ x: 2 }]),
    });
    expect((res.output as any).rows.length).toBe(2);
  });

  it("Append column mismatch throws", async () => {
    await expect(
      new AppendDataframeNode().process({
        dataframe_a: df([{ x: 1 }]),
        dataframe_b: df([{ y: 2 }]),
      })
    ).rejects.toThrow("Columns");
  });

  it("Append with empty a", async () => {
    const res = await new AppendDataframeNode().process({
      dataframe_a: df([]),
      dataframe_b: df([{ x: 1 }]),
    });
    expect((res.output as any).rows.length).toBe(1);
  });

  it("Join", async () => {
    const res = await new JoinDataframeNode().process({
      dataframe_a: df([{ id: 1, a: "x" }]),
      dataframe_b: df([{ id: 1, b: "y" }]),
      join_on: "id",
    });
    expect((res.output as any).rows[0].b).toBe("y");
  });

  it("RowIterator genProcess", async () => {
    const node = new RowIteratorNode();
    const items = await collectGen(
      node.genProcess({ dataframe: df([{ x: 1 }, { x: 2 }]) })
    );
    expect(items.length).toBe(2);
    expect(items[0].index).toBe(0);
  });

  it("FindRow", async () => {
    const res = await new FindRowNode().process({
      df: df([{ x: 1 }, { x: 2 }]),
      condition: "x == 2",
    });
    expect((res.output as any).rows.length).toBe(1);
  });

  it("SortByColumn", async () => {
    const res = await new SortByColumnNode().process({
      df: df([{ n: "b" }, { n: "a" }]),
      column: "n",
    });
    expect((res.output as any).rows[0].n).toBe("a");
  });

  it("DropDuplicates", async () => {
    const res = await new DropDuplicatesNode().process({
      df: df([{ x: 1 }, { x: 1 }, { x: 2 }]),
    });
    expect((res.output as any).rows.length).toBe(2);
  });

  it("DropNA", async () => {
    const res = await new DropNANode().process({
      df: df([{ x: 1 }, { x: null }, { x: "" }]),
    });
    expect((res.output as any).rows.length).toBe(1);
  });

  it("ForEachRow genProcess", async () => {
    const node = new ForEachRowNode();
    const items = await collectGen(
      node.genProcess({ dataframe: df([{ a: 1 }]) })
    );
    expect(items[0].row).toEqual({ a: 1 });
  });

  it("Aggregate sum", async () => {
    const res = await new AggregateNode().process({
      dataframe: df([
        { g: "a", v: 10 },
        { g: "a", v: 20 },
        { g: "b", v: 5 },
      ]),
      columns: "g",
      aggregation: "sum",
    });
    const rows = (res.output as any).rows;
    expect(rows.find((r: any) => r.g === "a").v).toBe(30);
  });

  it("Aggregate all types", async () => {
    for (const agg of ["mean", "count", "min", "max", "median", "first", "last"]) {
      const res = await new AggregateNode().process({
        dataframe: df([{ g: "a", v: 10 }, { g: "a", v: 20 }]),
        columns: "g",
        aggregation: agg,
      });
      expect((res.output as any).rows.length).toBe(1);
    }
  });

  it("Aggregate unknown throws", async () => {
    await expect(
      new AggregateNode().process({
        dataframe: df([{ g: "a", v: 1 }]),
        columns: "g",
        aggregation: "bogus",
      })
    ).rejects.toThrow("Unknown");
  });

  it("Pivot", async () => {
    const res = await new PivotNode().process({
      dataframe: df([
        { idx: "A", col: "X", val: 10 },
        { idx: "A", col: "Y", val: 20 },
      ]),
      index: "idx",
      columns: "col",
      values: "val",
      aggfunc: "sum",
    });
    const rows = (res.output as any).rows;
    expect(rows[0].X).toBe(10);
    expect(rows[0].Y).toBe(20);
  });

  it("Pivot all aggfuncs", async () => {
    for (const agg of ["mean", "count", "min", "max", "first", "last"]) {
      const res = await new PivotNode().process({
        dataframe: df([{ i: "a", c: "x", v: 5 }]),
        index: "i",
        columns: "c",
        values: "v",
        aggfunc: agg,
      });
      expect((res.output as any).rows.length).toBe(1);
    }
  });

  it("Pivot unknown aggfunc throws", async () => {
    await expect(
      new PivotNode().process({
        dataframe: df([{ i: "a", c: "x", v: 1 }]),
        index: "i",
        columns: "c",
        values: "v",
        aggfunc: "bogus",
      })
    ).rejects.toThrow("Unknown");
  });

  it("Rename", async () => {
    const res = await new RenameNode().process({
      dataframe: df([{ old_name: 1 }]),
      rename_map: "old_name:new_name",
    });
    expect((res.output as any).rows[0].new_name).toBe(1);
  });

  it("FillNA value method", async () => {
    const res = await new FillNANode().process({
      dataframe: df([{ x: null }, { x: 5 }]),
      value: 0,
      method: "value",
      columns: "x",
    });
    expect((res.output as any).rows[0].x).toBe(0);
  });

  it("FillNA forward method", async () => {
    const res = await new FillNANode().process({
      dataframe: df([{ x: 1 }, { x: null }]),
      method: "forward",
    });
    expect((res.output as any).rows[1].x).toBe(1);
  });

  it("FillNA backward method", async () => {
    const res = await new FillNANode().process({
      dataframe: df([{ x: null }, { x: 2 }]),
      method: "backward",
    });
    expect((res.output as any).rows[0].x).toBe(2);
  });

  it("FillNA mean method", async () => {
    const res = await new FillNANode().process({
      dataframe: df([{ x: 10 }, { x: null }, { x: 20 }]),
      method: "mean",
    });
    expect((res.output as any).rows[1].x).toBe(15);
  });

  it("FillNA median method", async () => {
    const res = await new FillNANode().process({
      dataframe: df([{ x: 10 }, { x: null }, { x: 20 }, { x: 30 }]),
      method: "median",
    });
    expect((res.output as any).rows[1].x).toBe(20);
  });

  it("FillNA unknown method throws", async () => {
    await expect(
      new FillNANode().process({ dataframe: df([{ x: 1 }]), method: "bogus" })
    ).rejects.toThrow("Unknown");
  });

  it("SaveCSVDataframeFile", async () => {
    const dir = tmpDir();
    const res = await new SaveCSVDataframeFileNode().process({
      dataframe: df([{ a: 1 }]),
      folder: dir,
      filename: "out.csv",
    });
    expect(res.path).toBeDefined();
  });

  it("SaveCSVDataframeFile no folder throws", async () => {
    await expect(
      new SaveCSVDataframeFileNode().process({
        dataframe: df([]),
        folder: "",
        filename: "x.csv",
      })
    ).rejects.toThrow("folder");
  });

  it("SaveCSVDataframeFile no filename throws", async () => {
    await expect(
      new SaveCSVDataframeFileNode().process({
        dataframe: df([]),
        folder: "/tmp",
        filename: "",
      })
    ).rejects.toThrow("filename");
  });

  it("FilterNone passes through non-null", async () => {
    const res = await new FilterNoneNode().process({ value: 42 });
    expect(res.output).toBe(42);
  });

  it("FilterNone filters null", async () => {
    const res = await new FilterNoneNode().process({ value: null });
    expect(res.output).toEqual([]);
  });

  it("asRows handles data wrapper", async () => {
    const res = await new ToListNode().process({
      dataframe: { data: [{ x: 1 }] },
    });
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

    const loaded = await new LoadDocumentFileNode().process({ path: filePath });
    expect((loaded.output as any).uri).toContain("file://");

    const outPath = join(dir, "out.txt");
    const saved = await new SaveDocumentFileNode().process({
      document: loaded.output,
      path: outPath,
    });
    expect(saved.output).toBe(outPath);
  });

  it("SaveDocumentFile with text", async () => {
    const dir = tmpDir();
    const outPath = join(dir, "out.txt");
    await new SaveDocumentFileNode().process({
      document: { text: "Hello" },
      path: outPath,
    });
    expect(readFileSync(outPath, "utf8")).toBe("Hello");
  });

  it("SaveDocumentFile with uri", async () => {
    const dir = tmpDir();
    const srcPath = join(dir, "src.txt");
    writeFileSync(srcPath, "Source");
    const outPath = join(dir, "out.txt");
    await new SaveDocumentFileNode().process({
      document: { uri: `file://${srcPath}` },
      path: outPath,
    });
    expect(readFileSync(outPath, "utf8")).toBe("Source");
  });

  it("SaveDocumentFile empty doc writes empty file", async () => {
    const dir = tmpDir();
    const outPath = join(dir, "empty.txt");
    await new SaveDocumentFileNode().process({
      document: {},
      path: outPath,
    });
    expect(readFileSync(outPath, "utf8")).toBe("");
  });

  it("ListDocuments genProcess", async () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "a.txt"), "a");
    writeFileSync(join(dir, "b.md"), "b");
    writeFileSync(join(dir, "c.jpg"), "c"); // should be excluded
    const node = new ListDocumentsNode();
    const items = await collectGen(node.genProcess({ folder: dir }));
    expect(items.length).toBe(2);
  });

  it("ListDocuments recursive", async () => {
    const dir = tmpDir();
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "x.txt"), "x");
    const node = new ListDocumentsNode();
    const items = await collectGen(node.genProcess({ folder: dir, recursive: true }));
    expect(items.length).toBe(1);
  });

  it("SplitDocument genProcess", async () => {
    const node = new SplitDocumentNode();
    const items = await collectGen(
      node.genProcess({ document: { text: "A".repeat(100) }, chunk_size: 50, chunk_overlap: 10 })
    );
    expect(items.length).toBeGreaterThan(1);
  });

  it("SplitHTML genProcess", async () => {
    const node = new SplitHTMLNode();
    const items = await collectGen(
      node.genProcess({ document: { text: "<p>" + "word ".repeat(50) + "</p>" }, chunk_size: 50 })
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it("SplitJSON genProcess", async () => {
    const node = new SplitJSONNode();
    const items = await collectGen(
      node.genProcess({ document: { text: JSON.stringify({ a: "b".repeat(100) }) }, chunk_size: 50 })
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it("SplitJSON with invalid JSON", async () => {
    const node = new SplitJSONNode();
    const items = await collectGen(
      node.genProcess({ document: { text: "not json " + "x".repeat(100) }, chunk_size: 50 })
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it("SplitRecursively genProcess", async () => {
    const node = new SplitRecursivelyNode();
    const items = await collectGen(
      node.genProcess({ document: { text: "A\n\nB\n\nC" }, chunk_size: 5 })
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it("SplitMarkdown genProcess", async () => {
    const node = new SplitMarkdownNode();
    const items = await collectGen(
      node.genProcess({
        document: { text: "# Title\n" + "word ".repeat(300) },
        chunk_size: 50,
      })
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
    const res = await new ExecuteJavaScriptNode().process({
      script: "console.log('hello')",
      timeout_ms: 5000,
    });
    expect(res.output).toContain("hello");
    expect(res.success).toBe(true);
  });

  it("ExecuteBash", async () => {
    const res = await new ExecuteBashNode().process({
      script: "echo hi",
      timeout_ms: 5000,
    });
    expect(res.output).toContain("hi");
  });

  it("ExecuteCommand", async () => {
    const res = await new ExecuteCommandNode().process({
      command: "echo test",
      timeout_ms: 5000,
    });
    expect(res.output).toContain("test");
  });

  it("RunJavaScriptCommand", async () => {
    const res = await new RunJavaScriptCommandNode().process({
      command: "console.log(42)",
      timeout_ms: 5000,
    });
    expect(res.output).toContain("42");
  });

  it("RunBashCommand", async () => {
    const res = await new RunBashCommandNode().process({
      command: "echo bash",
      timeout_ms: 5000,
    });
    expect(res.output).toContain("bash");
  });

  it("RunShellCommand", async () => {
    const res = await new RunShellCommandNode().process({
      command: "echo shell",
      timeout_ms: 5000,
    });
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
// uuid.ts gaps
// ============================================================================

describe("uuid.ts gaps", () => {
  it("GenerateUUID4 returns valid uuid", async () => {
    const res = await new GenerateUUID4Node().process({});
    const uuid = res.output as string;
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("GenerateUUID1 returns valid uuid", async () => {
    const res = await new GenerateUUID1Node().process({});
    const uuid = res.output as string;
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("GenerateUUID3", async () => {
    const res = await new GenerateUUID3Node().process({ namespace: "dns", name: "example.com" });
    const uuid = res.output as string;
    expect(uuid[14]).toBe("3");
  });

  it("GenerateUUID5", async () => {
    const res = await new GenerateUUID5Node().process({ namespace: "url", name: "https://example.com" });
    const uuid = res.output as string;
    expect(uuid[14]).toBe("5");
  });

  it("GenerateUUID3 with oid namespace", async () => {
    const res = await new GenerateUUID3Node().process({ namespace: "oid", name: "test" });
    expect(typeof res.output).toBe("string");
  });

  it("GenerateUUID5 with x500 namespace", async () => {
    const res = await new GenerateUUID5Node().process({ namespace: "x500", name: "test" });
    expect(typeof res.output).toBe("string");
  });

  it("GenerateUUID3 with custom uuid namespace", async () => {
    const res = await new GenerateUUID3Node().process({
      namespace: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      name: "test",
    });
    expect(typeof res.output).toBe("string");
  });

  it("GenerateUUID3 with invalid namespace throws", async () => {
    await expect(
      new GenerateUUID3Node().process({ namespace: "invalid", name: "test" })
    ).rejects.toThrow("Invalid namespace");
  });

  it("ParseUUID valid", async () => {
    const gen = await new GenerateUUID4Node().process({});
    const res = await new ParseUUIDNode().process({ uuid_string: gen.output as string });
    const out = res.output as any;
    expect(out.is_valid).toBe(true);
    expect(out.version).toBe(4);
    expect(out.variant).toBe("specified in RFC 4122");
  });

  it("ParseUUID invalid", async () => {
    const res = await new ParseUUIDNode().process({ uuid_string: "not-a-uuid" });
    expect((res.output as any).is_valid).toBe(false);
  });

  it("FormatUUID standard", async () => {
    const uuid = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const res = await new FormatUUIDNode().process({ uuid_string: uuid, format: "standard" });
    expect(res.output).toBe(uuid);
  });

  it("FormatUUID hex", async () => {
    const uuid = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const res = await new FormatUUIDNode().process({ uuid_string: uuid, format: "hex" });
    expect(res.output).toBe("6ba7b8109dad11d180b400c04fd430c8");
  });

  it("FormatUUID urn", async () => {
    const uuid = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const res = await new FormatUUIDNode().process({ uuid_string: uuid, format: "urn" });
    expect(res.output).toBe(`urn:uuid:${uuid}`);
  });

  it("FormatUUID int", async () => {
    const uuid = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const res = await new FormatUUIDNode().process({ uuid_string: uuid, format: "int" });
    expect(typeof res.output).toBe("string");
  });

  it("FormatUUID bytes_hex", async () => {
    const uuid = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const res = await new FormatUUIDNode().process({ uuid_string: uuid, format: "bytes_hex" });
    expect(typeof res.output).toBe("string");
  });

  it("IsValidUUID true", async () => {
    const res = await new IsValidUUIDNode().process({
      uuid_string: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    });
    expect(res.output).toBe(true);
  });

  it("IsValidUUID false", async () => {
    const res = await new IsValidUUIDNode().process({ uuid_string: "nope" });
    expect(res.output).toBe(false);
  });

  it("normalizeUuid handles urn: prefix", async () => {
    const res = await new ParseUUIDNode().process({
      uuid_string: "urn:uuid:6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    });
    expect((res.output as any).is_valid).toBe(true);
  });

  it("normalizeUuid handles braces", async () => {
    const res = await new ParseUUIDNode().process({
      uuid_string: "{6ba7b810-9dad-11d1-80b4-00c04fd430c8}",
    });
    expect((res.output as any).is_valid).toBe(true);
  });

  it("normalizeUuid handles hex-only (no dashes)", async () => {
    const res = await new ParseUUIDNode().process({
      uuid_string: "6ba7b8109dad11d180b400c04fd430c8",
    });
    expect((res.output as any).is_valid).toBe(true);
  });

  it("defaults for uuid nodes", () => {
    expect(new GenerateUUID3Node().serialize()).toHaveProperty("namespace");
    expect(new GenerateUUID5Node().serialize()).toHaveProperty("namespace");
    expect(new ParseUUIDNode().serialize()).toHaveProperty("uuid_string");
    expect(new FormatUUIDNode().serialize()).toHaveProperty("format");
    expect(new IsValidUUIDNode().serialize()).toHaveProperty("uuid_string");
  });

  it("ParseUUID v1 returns version 1 and variant info", async () => {
    const gen = await new GenerateUUID1Node().process({});
    const res = await new ParseUUIDNode().process({ uuid_string: gen.output as string });
    const out = res.output as any;
    expect(out.is_valid).toBe(true);
    expect(out.version).toBe(1);
    expect(out.variant).toBe("specified in RFC 4122");
  });

  it("FormatUUID with unsupported format throws", async () => {
    await expect(
      new FormatUUIDNode().process({
        uuid_string: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        format: "bogus",
      })
    ).rejects.toThrow("Unsupported format");
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
    const res = await new GainNode_().process({
      audio: { uri: "", data: new Uint8Array(rawBytes) },
      gain_db: 0,
    });
    expect(res.output).toBeDefined();
  });

  it("Gain with invalid audio data throws", async () => {
    await expect(
      new GainNode_().process({ audio: { uri: "", data: 12345 }, gain_db: 0 })
    ).rejects.toThrow("Invalid audio data");
  });

  it("Gain with invalid WAV (not RIFF) throws", async () => {
    const badWav = Buffer.from("NOTRIFFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    await expect(
      new GainNode_().process({
        audio: { uri: "", data: badWav.toString("base64") },
        gain_db: 0,
      })
    ).rejects.toThrow("Invalid WAV");
  });
});

describe("lib-synthesis round 2", () => {
  it("Oscillator with invalid waveform throws", async () => {
    await expect(
      new OscillatorLibNode().process({
        waveform: "invalid_wave",
        frequency: 440,
        amplitude: 0.5,
        duration: 0.01,
        sample_rate: 8000,
      })
    ).rejects.toThrow("Invalid waveform");
  });
});

describe("lib-numpy round 2", () => {
  it("asNdArray with non-array/non-number returns empty", async () => {
    // Pass a string — should fall through to empty { data: [], shape: [0] }
    const res = await new AbsArrayNode().process({ values: "not-an-array" });
    const out = res.output as any;
    expect(out.data).toEqual([]);
    expect(out.shape).toEqual([0]);
  });

  it("Add with different length arrays (padding)", async () => {
    const res = await new AddArrayNode().process({
      a: { data: [1, 2, 3], shape: [3] },
      b: { data: [10], shape: [1] },
    });
    // scalar broadcast — single element array isn't padded, just broadcast
    expect((res.output as any).data.length).toBeGreaterThan(0);
  });

  it("Add with genuinely different length arrays triggers padding", async () => {
    const res = await new AddArrayNode().process({
      a: { data: [1, 2, 3], shape: [3] },
      b: { data: [10, 20], shape: [2] },
    });
    expect((res.output as any).data.length).toBe(3);
    expect((res.output as any).data[2]).toBe(3); // padded 0 + 3
  });

  it("SaveArray without context.storage", async () => {
    const res = await new SaveArrayNode().process({
      values: { data: [1, 2, 3], shape: [3] },
      name: "test_%Y.json",
    });
    expect((res.output as any).data).toEqual([1, 2, 3]);
  });
});

describe("lib-pdf round 2", () => {
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
    const res = await new ExtractMarkdownPyMuPdfNode().process({ pdf: makeRichPdf() });
    expect(typeof res.output).toBe("string");
  });

  it("ExtractTextBlocksPyMuPdf with multi-line content", async () => {
    const res = await new ExtractTextBlocksPyMuPdfNode().process({ pdf: makeRichPdf() });
    expect(Array.isArray(res.output)).toBe(true);
  });

  it("ExtractTextWithStylePyMuPdf with multi-line content", async () => {
    const res = await new ExtractTextWithStylePyMuPdfNode().process({ pdf: makeRichPdf() });
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
    const res = await new ExtractTablesPyMuPdfNode().process({
      pdf: { data: Buffer.from(pdf).toString("base64") },
    });
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
    const res = await new GetPageCountPdfPlumberNode().process({
      pdf: { uri: `file://${filePath}` },
    });
    expect(res.output).toBe(1);
  });

  it("PDF with no data and no URI throws", async () => {
    await expect(
      new GetPageCountPdfPlumberNode().process({ pdf: {} })
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
    const res = await new LimiterNode().process({
      audio,
      threshold_db: -20, // very low threshold to trigger limiting
      release_ms: 10,
    });
    expect(res.output).toBeDefined();
  });

  it("PitchShift with stereo audio", async () => {
    const audio = stereoSine();
    const res = await new PitchShiftNode().process({
      audio,
      semitones: 2,
    });
    expect(res.output).toBeDefined();
  });

  it("TimeStretch with stereo audio", async () => {
    const audio = stereoSine();
    const res = await new TimeStretchNode().process({
      audio,
      rate: 1.5,
    });
    expect(res.output).toBeDefined();
  });

  it("Compress with Uint8Array data", async () => {
    const wav = shortSine();
    const rawBytes = Buffer.from(wav.data as string, "base64");
    const res = await new CompressNode().process({
      audio: { uri: "", data: new Uint8Array(rawBytes) },
      threshold_db: -10,
      ratio: 4,
      attack_ms: 5,
      release_ms: 50,
    });
    expect(res.output).toBeDefined();
  });

  it("Bitcrush with invalid WAV throws", async () => {
    await expect(
      new BitcrushNode().process({
        audio: { uri: "", data: Buffer.from("NOT_A_WAV_FILE").toString("base64") },
        bit_depth: 8,
      })
    ).rejects.toThrow("Invalid WAV");
  });

  it("Distortion with invalid audio data throws", async () => {
    await expect(
      new DistortionNode().process({
        audio: { uri: "", data: 12345 },
        drive: 0.5,
      })
    ).rejects.toThrow("Invalid audio data");
  });
});

describe("lib-librosa-spectral round 2", () => {
  it("STFT with stereo audio (mono downmix)", async () => {
    const audio = stereoSine();
    const res = await new STFTNode().process({
      audio,
      n_fft: 256,
      hop_length: 128,
    });
    expect(res.output).toBeDefined();
  });

  it("SaveAudioSegments with Uint8Array data", async () => {
    const dir = tmpDir();
    const wav = shortSine();
    const rawBytes = Buffer.from(wav.data as string, "base64");
    const res = await new SaveAudioSegmentsNode().process({
      segments: [{ uri: "", data: new Uint8Array(rawBytes) }],
      folder: { path: dir },
      prefix: "seg",
    });
    expect(res.output).toBeDefined();
  });
});

describe("lib-excel round 2", () => {
  it("SaveWorkbook writes to disk", async () => {
    const dir = tmpDir();
    const wb = await new CreateWorkbookLibNode().process({});
    const res = await new SaveWorkbookLibNode().process({
      workbook: wb.output,
      folder: { path: dir },
      filename: "test.xlsx",
    });
    expect(typeof res.output).toBe("string");
    expect(String(res.output)).toContain("test.xlsx");
  });
});

describe("lib-docx round 2", () => {
  it("LoadWordDocument loads .docx file", async () => {
    // Create a minimal docx using the create + save pipeline first
    const dir = tmpDir();
    const doc = await new CreateDocumentLibNode().process({});
    const withHeading = await new AddHeadingLibNode().process({
      document: doc.output,
      text: "Test",
      level: 1,
    });
    const saved = await new SaveDocumentLibNode().process({
      document: withHeading.output,
      path: { path: dir },
      filename: "load_test.docx",
    });
    // Now load it
    const loaded = await new LoadWordDocumentLibNode().process({
      path: String(saved.output),
    });
    expect(typeof loaded.output).toBe("string");
  });

  it("AddImage with Buffer data", async () => {
    const doc = await new CreateDocumentLibNode().process({});
    // Create a tiny 1x1 PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64"
    );
    const res = await new AddImageLibNode().process({
      document: doc.output,
      image: { data: png },
      width: 100,
      height: 100,
    });
    expect((res.output as any).elements.length).toBe(1);
  });
});

describe("lib-beautifulsoup round 2", () => {
  it("WebsiteContentExtractor fallback path", async () => {
    // HTML that Readability can't parse → fallback to cheerio stripping
    const html = "<html><body><script>bad()</script><div id='content'>Real content here</div></body></html>";
    const res = await new WebsiteContentExtractorLibNode().process({
      html,
    });
    expect(typeof res.output).toBe("string");
    expect(String(res.output).length).toBeGreaterThan(0);
  });
});

describe("data.ts round 2", () => {
  it("LoadCSVFile reads from path", async () => {
    const dir = tmpDir();
    const csvPath = join(dir, "test.csv");
    writeFileSync(csvPath, "a,b\n1,2\n3,4\n");
    const res = await new LoadCSVFileDataNode().process({ file_path: csvPath });
    expect((res.output as any).rows.length).toBe(2);
  });

  it("ForEachRow genProcess yields rows", async () => {
    const node = new ForEachRowNode();
    const gen = node.genProcess({
      dataframe: df([{ x: 1 }, { x: 2 }, { x: 3 }]),
    });
    const results = await collectGen(gen);
    expect(results.length).toBe(3);
    expect(results[0].row).toEqual({ x: 1 });
    expect(results[0].index).toBe(0);
  });

  it("RowIterator genProcess yields rows", async () => {
    const node = new RowIteratorNode();
    const gen = node.genProcess({
      dataframe: df([{ a: "x" }, { a: "y" }]),
    });
    const results = await collectGen(gen);
    expect(results.length).toBe(2);
  });

  it("LoadCSVAssets genProcess reads CSV files from folder", async () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "a.csv"), "x\n1\n2\n");
    writeFileSync(join(dir, "b.txt"), "not csv");
    writeFileSync(join(dir, "c.csv"), "y\n3\n");
    const node = new LoadCSVAssetsNode();
    const gen = node.genProcess({ folder: dir });
    const results = await collectGen(gen);
    expect(results.length).toBe(2); // only .csv files
  });

  it("Aggregate groups and aggregates", async () => {
    const res = await new AggregateNode().process({
      dataframe: df([
        { group: "A", val: 10 },
        { group: "A", val: 20 },
        { group: "B", val: 30 },
      ]),
      columns: "group",
      aggregation: "sum",
    });
    expect((res.output as any).rows.length).toBe(2);
  });
});

describe("document.ts round 2", () => {
  it("LoadDocumentFile from string path", async () => {
    const dir = tmpDir();
    const fp = join(dir, "test.txt");
    writeFileSync(fp, "Hello document");
    const res = await new LoadDocumentFileNode().process({ path: fp });
    expect(typeof res.output).toBe("object");
  });

  it("ListDocuments genProcess lists files", async () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "a.txt"), "text");
    writeFileSync(join(dir, "b.md"), "markdown");
    writeFileSync(join(dir, "c.py"), "python"); // not in allowed set
    const node = new ListDocumentsNode();
    const gen = node.genProcess({ folder: dir, recursive: false });
    const results = await collectGen(gen);
    expect(results.length).toBe(2); // .txt and .md
  });

  it("SplitDocument genProcess splits text", async () => {
    const node = new SplitDocumentNode();
    const gen = node.genProcess({
      document: { text: "A".repeat(100) + " " + "B".repeat(100) },
      chunk_size: 80,
      chunk_overlap: 10,
    });
    const results = await collectGen(gen);
    expect(results.length).toBeGreaterThan(0);
  });

  it("SplitHTML genProcess splits HTML", async () => {
    const node = new SplitHTMLNode();
    const gen = node.genProcess({
      document: { text: "<p>" + "Hello world. ".repeat(50) + "</p>" },
      chunk_size: 100,
      chunk_overlap: 10,
    });
    const results = await collectGen(gen);
    expect(results.length).toBeGreaterThan(0);
  });

  it("SplitJSON genProcess splits JSON", async () => {
    const node = new SplitJSONNode();
    const gen = node.genProcess({
      document: { text: JSON.stringify({ data: "x".repeat(200) }) },
      chunk_size: 50,
      chunk_overlap: 5,
    });
    const results = await collectGen(gen);
    expect(results.length).toBeGreaterThan(0);
  });

  it("SplitRecursively genProcess splits by paragraphs", async () => {
    const node = new SplitRecursivelyNode();
    const gen = node.genProcess({
      document: { text: "Para one content.\n\nPara two content.\n\nPara three content." },
      chunk_size: 30,
      chunk_overlap: 5,
    });
    const results = await collectGen(gen);
    expect(results.length).toBeGreaterThan(0);
  });

  it("SplitMarkdown genProcess splits by headings", async () => {
    const node = new SplitMarkdownNode();
    const gen = node.genProcess({
      document: { text: "# Title\n\nSome text content here.\n\n## Subtitle\n\nMore content." },
      chunk_size: 200,
    });
    const results = await collectGen(gen);
    expect(results.length).toBeGreaterThan(0);
  });

  it("readDocumentText with data bytes", async () => {
    const node = new SplitDocumentNode();
    const gen = node.genProcess({
      document: { data: Buffer.from("Hello from bytes").toString("base64") },
      chunk_size: 100,
    });
    const results = await collectGen(gen);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("code.ts round 2", () => {
  it("ExecuteBash with stderr output", async () => {
    const res = await new ExecuteBashNode().process({
      script: "echo error >&2; echo ok",
      timeout_ms: 5000,
    });
    expect(res.output).toContain("ok");
    // stderr should be captured
    expect(typeof res.stderr).toBe("string");
  });

  it("ExecuteCommand with timeout (short command)", async () => {
    const res = await new ExecuteCommandNode().process({
      command: "sleep 0.01 && echo done",
      timeout_ms: 5000,
    });
    expect(res.output).toContain("done");
  });

  it("ExecuteJavaScript with stdin", async () => {
    const res = await new ExecuteJavaScriptNode().process({
      script: "process.stdin.on('data', d => { console.log('got: ' + d); process.stdin.resume(); }); setTimeout(() => process.exit(0), 100);",
      stdin: "hello",
      timeout_ms: 5000,
    });
    // Just check it doesn't crash
    expect(typeof res.output).toBe("string");
  });
});
