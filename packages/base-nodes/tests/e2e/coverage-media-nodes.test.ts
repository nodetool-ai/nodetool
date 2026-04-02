import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  // Audio nodes
  LoadAudioAssetsNode,
  LoadAudioFileNode,
  LoadAudioFolderNode,
  SaveAudioNode,
  SaveAudioFileNode,
  NormalizeAudioNode,
  OverlayAudioNode,
  RemoveSilenceNode,
  SliceAudioNode,
  MonoToStereoNode,
  StereoToMonoNode,
  ReverseAudioNode,
  FadeInAudioNode,
  FadeOutAudioNode,
  RepeatAudioNode,
  AudioMixerNode,
  AudioToNumpyNode,
  NumpyToAudioNode,
  TrimAudioNode,
  ConvertToArrayNode,
  CreateSilenceNode,
  ConcatAudioNode,
  ConcatAudioListNode,
  TextToSpeechNode,
  ChunkToAudioNode,
  // Image nodes
  LoadImageFileNode,
  LoadImageFolderNode,
  SaveImageFileImageNode,
  LoadImageAssetsNode,
  SaveImageNode,
  GetMetadataNode,
  BatchToListNode,
  ImagesToListNode,
  PasteNode,
  ScaleNode,
  ResizeNode,
  CropNode,
  FitNode,
  TextToImageNode,
  ImageToImageNode,
  // Video nodes
  TextToVideoNode,
  ImageToVideoNode,
  LoadVideoFileNode,
  SaveVideoFileVideoNode,
  LoadVideoAssetsNode,
  SaveVideoNode,
  FrameIteratorNode,
  FpsNode,
  FrameToVideoNode,
  ConcatVideoNode,
  TrimVideoNode,
  ResizeVideoNode,
  RotateVideoNode,
  SetSpeedVideoNode,
  OverlayVideoNode,
  ColorBalanceVideoNode,
  DenoiseVideoNode,
  StabilizeVideoNode,
  SharpnessVideoNode,
  BlurVideoNode,
  SaturationVideoNode,
  AddSubtitlesVideoNode,
  ReverseVideoNode,
  TransitionVideoNode,
  AddAudioVideoNode,
  ChromaKeyVideoNode,
  ExtractAudioVideoNode,
  ExtractFrameVideoNode,
  GetVideoInfoNode,
  // Model3D nodes
  LoadModel3DFileNode,
  SaveModel3DFileNode,
  SaveModel3DNode,
  FormatConverterNode,
  GetModel3DMetadataNode,
  Transform3DNode,
  DecimateNode,
  Boolean3DNode,
  RecalculateNormalsNode,
  CenterMeshNode,
  FlipNormalsNode,
  MergeMeshesNode,
  TextTo3DNode,
  ImageTo3DNode,
} from "../../src/index.js";

// --------------- helpers ---------------

function makeWav(samples = 100, sampleRate = 22050): string {
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    buf.writeInt16LE(Math.round(Math.sin(i * 0.1) * 16000), 44 + i * 2);
  return buf.toString("base64");
}

function audioRef(data?: string): Record<string, unknown> {
  return { type: "audio", uri: "", data: data ?? makeWav() };
}

function imageRef(data?: string): Record<string, unknown> {
  const d = data ?? Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"); // PNG magic
  return { type: "image", uri: "", data: d };
}

function videoRef(data?: string): Record<string, unknown> {
  const d = data ?? Buffer.from("fake-video-content").toString("base64");
  return { type: "video", uri: "", data: d };
}

function modelRef(data?: string): Record<string, unknown> {
  const d = data ?? Buffer.from("fake-model-bytes").toString("base64");
  return { type: "model3d", uri: "", data: d, format: "glb" };
}

const tmpDir = `/tmp/nodetool-media-test-${Date.now()}`;

// --------------- AUDIO NODES ---------------

describe("audio nodes — full coverage", () => {
  it("NormalizeAudioNode passes through audio", async () => {
    const ref = audioRef();
    const _n = new NormalizeAudioNode();
    _n.assign({ audio: ref });
    const result = await _n.process();
    expect((result.output as { data: string }).data.length).toBeGreaterThan(0);
  });

  it("OverlayAudioNode mixes two audios by max", async () => {
    const a = audioRef();
    const b = audioRef();
    const _n = new OverlayAudioNode();
    _n.assign({ a: a, b: b });
    const result = await _n.process();
    expect((result.output as { data: string }).data.length).toBeGreaterThan(0);
  });

  it("RemoveSilenceNode filters zero bytes", async () => {
    // Create audio with some zero bytes
    const data = Buffer.from([0, 1, 0, 2, 0, 3]).toString("base64");
    const _n = new RemoveSilenceNode();
    _n.assign({ audio: { data } });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(3); // only 1, 2, 3 remain
  });

  it("SliceAudioNode slices by byte range", async () => {
    const data = Buffer.from([10, 20, 30, 40, 50]).toString("base64");
    const _n = new SliceAudioNode();
    _n.assign({ audio: { data }, start: 1, end: 3 });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([20, 30]);
  });

  it("SliceAudioNode with negative end uses full length", async () => {
    const data = Buffer.from([10, 20, 30]).toString("base64");
    const _n = new SliceAudioNode();
    _n.assign({ audio: { data }, start: 0, end: -1 });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(3);
  });

  it("MonoToStereoNode duplicates bytes", async () => {
    const data = Buffer.from([1, 2, 3]).toString("base64");
    const _n = new MonoToStereoNode();
    _n.assign({ audio: { data } });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it("StereoToMonoNode takes left channel", async () => {
    const data = Buffer.from([1, 10, 2, 20, 3, 30]).toString("base64");
    const _n = new StereoToMonoNode();
    _n.assign({ audio: { data } });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([1, 2, 3]);
  });

  it("ReverseAudioNode reverses audio bytes", async () => {
    const data = Buffer.from([1, 2, 3]).toString("base64");
    const _n = new ReverseAudioNode();
    _n.assign({ audio: { data } });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([3, 2, 1]);
  });

  it("FadeInAudioNode applies linear fade-in", async () => {
    const data = Buffer.from([100, 100, 100, 100]).toString("base64");
    const _n = new FadeInAudioNode();
    _n.assign({ audio: { data }, duration: 4 });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    // first byte should be attenuated (0/4 * 100 = 0)
    expect(outData[0]).toBe(0);
    expect(outData[3]).toBe(75); // floor(100 * 3/4) = 75
  });

  it("FadeOutAudioNode applies linear fade-out", async () => {
    const data = Buffer.from([100, 100, 100, 100]).toString("base64");
    const _n = new FadeOutAudioNode();
    _n.assign({ audio: { data }, duration: 4 });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    // last byte should be heavily attenuated
    expect(outData[3]).toBeLessThan(outData[0]);
  });

  it("RepeatAudioNode repeats bytes", async () => {
    const data = Buffer.from([1, 2]).toString("base64");
    const _n = new RepeatAudioNode();
    _n.assign({ audio: { data }, loops: 3 });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it("AudioMixerNode averages multiple audio refs", async () => {
    const a = { data: Buffer.from([10, 20]).toString("base64") };
    const b = { data: Buffer.from([30, 40]).toString("base64") };
    const _n = new AudioMixerNode();
    // Set unused tracks to non-object values to exclude them from mixing
    _n.assign({ track1: a, track2: b, track3: null, track4: null, track5: null });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData[0]).toBe(20); // (10+30)/2
    expect(outData[1]).toBe(30); // (20+40)/2
  });

  it("AudioMixerNode returns empty for no inputs", async () => {
    const _n = new AudioMixerNode();
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(0);
  });

  it("TrimAudioNode trims from start and end", async () => {
    const data = Buffer.from([1, 2, 3, 4, 5]).toString("base64");
    const _n = new TrimAudioNode();
    _n.assign({ audio: { data }, start: 1, end: 1 });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([2, 3, 4]);
  });

  it("ConvertToArrayNode wraps audio in list", async () => {
    const ref = audioRef();
    const _n = new ConvertToArrayNode();
    _n.assign({ audio: ref });
    const result = await _n.process();
    expect(Array.isArray(result.output)).toBe(true);
    expect((result.output as unknown[]).length).toBe(1);
  });

  it("ConcatAudioListNode concatenates list of audios", async () => {
    const a = { data: Buffer.from([1, 2]).toString("base64") };
    const b = { data: Buffer.from([3, 4]).toString("base64") };
    const _n = new ConcatAudioListNode();
    _n.assign({ audio_files: [a, b] });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([1, 2, 3, 4]);
  });

  it("TextToSpeechNode converts text to bytes", async () => {
    const _n = new TextToSpeechNode();
    _n.assign({ text: "hello" });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.toString("utf8")).toBe("hello");
  });

  it("ChunkToAudioNode converts chunk with data", async () => {
    const data = Buffer.from([10, 20, 30]).toString("base64");
    const _n = new ChunkToAudioNode();
    _n.assign({ chunk: { data } });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([10, 20, 30]);
  });

  it("ChunkToAudioNode handles chunk with uri", async () => {
    const _n = new ChunkToAudioNode();
    _n.assign({ chunk: { uri: "file://test.wav" } });
    const result = await _n.process();
    expect((result.output as { data: string }).data).toBeDefined();
  });

  it("ChunkToAudioNode handles null chunk", async () => {
    const _n = new ChunkToAudioNode();
    _n.assign({ chunk: null });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(0);
  });

  it("SaveAudioNode writes audio to folder with date name", async () => {
    const dir = `${tmpDir}/save-audio`;
    const ref = audioRef();
    const _n = new SaveAudioNode();
    _n.assign({
      audio: ref,
      folder: dir,
      name: "test_audio.wav",
    });
    const result = await _n.process();
    const output = result.output as { data: string; uri: string };
    expect(output.uri).toContain("test_audio.wav");
    const stat = await fs.stat(path.join(dir, "test_audio.wav"));
    expect(stat.size).toBeGreaterThan(0);
  });

  it("SaveAudioFileNode writes audio to specific path", async () => {
    const filePath = `${tmpDir}/save-audio-file/out.wav`;
    const ref = audioRef();
    const _n = new SaveAudioFileNode();
    _n.assign({ audio: ref, folder: path.dirname(filePath), filename: path.basename(filePath) });
    const result = await _n.process();
    expect(result.output).toBe(filePath);
    const stat = await fs.stat(filePath);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("LoadAudioFileNode reads audio from file", async () => {
    const filePath = `${tmpDir}/load-audio-file/test.wav`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const wavData = Buffer.from(makeWav(), "base64");
    await fs.writeFile(filePath, wavData);
    const _n = new LoadAudioFileNode();
    _n.assign({ path: filePath });
    const result = await _n.process();
    const output = result.output as { data: string; uri: string };
    expect(output.uri).toContain(filePath);
    expect(output.data.length).toBeGreaterThan(0);
  });

  it("LoadAudioFileNode handles file:// URI", async () => {
    const filePath = `${tmpDir}/load-audio-uri/test.wav`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(makeWav(), "base64"));
    const _n = new LoadAudioFileNode();
    _n.assign({ path: `file://${filePath}` });
    const result = await _n.process();
    expect((result.output as { uri: string }).uri).toContain(filePath);
  });

  it("LoadAudioAssetsNode streams audio files from folder", async () => {
    const dir = `${tmpDir}/load-audio-assets`;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "a.wav"), Buffer.from(makeWav(), "base64"));
    await fs.writeFile(path.join(dir, "b.mp3"), Buffer.from([0, 1, 2]));
    await fs.writeFile(path.join(dir, "c.txt"), "not audio");

    const node = new LoadAudioAssetsNode();
    const items: Array<Record<string, unknown>> = [];
    node.assign({ folder: dir });
    for await (const item of node.genProcess()) {
      items.push(item);
    }
    expect(items.length).toBe(2); // .wav and .mp3
    expect(items[0].name).toBe("a.wav");
  });

  it("LoadAudioFolderNode delegates to LoadAudioAssetsNode", async () => {
    const dir = `${tmpDir}/load-audio-folder`;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "x.flac"), Buffer.from([1, 2]));

    const node = new LoadAudioFolderNode();
    const items: Array<Record<string, unknown>> = [];
    node.assign({ folder: dir });
    for await (const item of node.genProcess()) {
      items.push(item);
    }
    expect(items.length).toBe(1);
  });

  it("LoadAudioAssetsNode process returns empty", async () => {
    const result = await new LoadAudioAssetsNode().process();
    expect(result).toEqual({});
  });

  it("LoadAudioFolderNode process returns empty", async () => {
    const result = await new LoadAudioFolderNode().process();
    expect(result).toEqual({});
  });

  it("audioBytes handles non-object input", async () => {
    // OverlayAudioNode internally calls audioBytes
    const _n = new OverlayAudioNode();
    _n.assign({ audio_a: "not-an-object", audio_b: null });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(0);
  });

  it("SaveAudioNode uses dateName format strings", async () => {
    const dir = `${tmpDir}/save-audio-date`;
    const ref = audioRef();
    const _n = new SaveAudioNode();
    _n.assign({
      audio: ref,
      folder: dir,
      name: "audio_%Y%m%d.wav",
    });
    const result = await _n.process();
    const output = result.output as { uri: string };
    expect(output.uri).toMatch(/audio_\d{8}\.wav/);
  });

  it("defaults() methods return expected structures", () => {
    expect(new LoadAudioFileNode().serialize()).toEqual({ path: "" });
    expect(new LoadAudioFolderNode().serialize()).toEqual({
      folder: "",
      include_subdirectories: false,
      extensions: [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"],
    });
    expect(new LoadAudioAssetsNode().serialize()).toMatchObject({ folder: { type: "folder", uri: "" } });
    expect(new SaveAudioNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" },
      folder: { type: "folder", uri: "" },
      name: "%Y-%m-%d-%H-%M-%S.opus",
    });
    expect(new SaveAudioFileNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" },
      folder: "",
      filename: "",
    });
    expect(new NormalizeAudioNode().serialize()).toMatchObject({ audio: { type: "audio", uri: "" } });
    expect(new OverlayAudioNode().serialize()).toMatchObject({
      a: { type: "audio", uri: "" },
      b: { type: "audio", uri: "" },
    });
    expect(new RemoveSilenceNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" },
      min_length: 200,
      threshold: -40,
      reduction_factor: 1,
      crossfade: 10,
      min_silence_between_parts: 100,
    });
    expect(new SliceAudioNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" },
      start: 0,
      end: 1,
    });
    expect(new MonoToStereoNode().serialize()).toMatchObject({ audio: { type: "audio", uri: "" } });
    expect(new StereoToMonoNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" },
      method: "average",
    });
    expect(new ReverseAudioNode().serialize()).toMatchObject({ audio: { type: "audio", uri: "" } });
    expect(new FadeInAudioNode().serialize()).toMatchObject({ audio: { type: "audio", uri: "" }, duration: 1 });
    expect(new FadeOutAudioNode().serialize()).toMatchObject({ audio: { type: "audio", uri: "" }, duration: 1 });
    expect(new RepeatAudioNode().serialize()).toMatchObject({ audio: { type: "audio", uri: "" }, loops: 2 });
    expect(new AudioMixerNode().serialize()).toMatchObject({
      track1: { type: "audio", uri: "" },
      track2: { type: "audio", uri: "" },
      track3: { type: "audio", uri: "" },
      track4: { type: "audio", uri: "" },
      track5: { type: "audio", uri: "" },
      volume1: 1,
      volume2: 1,
      volume3: 1,
      volume4: 1,
      volume5: 1,
    });
    expect(new AudioToNumpyNode().serialize()).toMatchObject({ audio: { type: "audio", uri: "" } });
    expect(new NumpyToAudioNode().serialize()).toMatchObject({
      array: { type: "np_array", shape: [1] },
      sample_rate: 44100,
      channels: 1,
    });
    expect(new TrimAudioNode().serialize()).toMatchObject({ audio: { type: "audio", uri: "" }, start: 0, end: 0 });
    expect(new ConvertToArrayNode().serialize()).toMatchObject({ audio: { type: "audio", uri: "" } });
    expect(new CreateSilenceNode().serialize()).toEqual({ duration: 1 });
    expect(new ConcatAudioNode().serialize()).toMatchObject({
      a: { type: "audio", uri: "" },
      b: { type: "audio", uri: "" },
    });
    expect(new ConcatAudioListNode().serialize()).toEqual({ audio_files: [] });
    expect(new TextToSpeechNode().serialize()).toMatchObject({
      text: "Hello! This is a text-to-speech demonstration.",
      speed: 1,
    });
    expect(new ChunkToAudioNode().serialize()).toMatchObject({
      chunk: { type: "chunk", content: "", content_type: "text" },
      batch_size: 50,
    });
  });

  it("audioBytes returns empty for ref without data", async () => {
    // audio ref with uri but no data
    const _n = new NormalizeAudioNode();
    _n.assign({ audio: { uri: "file://test.wav" } });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(0);
  });

  it("AudioMixerNode handles non-array audios input", async () => {
    const _n = new AudioMixerNode();
    _n.assign({ track1: "not-array" });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(0);
  });

  it("NumpyToAudioNode handles non-array values input", async () => {
    const _n = new NumpyToAudioNode();
    _n.assign({ array: "not-array" });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(0);
  });

  it("NumpyToAudioNode converts array of numbers to audio", async () => {
    const _n = new NumpyToAudioNode();
    _n.assign({ array: [65, 66, 300] });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData[0]).toBe(65);
    expect(outData[1]).toBe(66);
    expect(outData[2]).toBe(44); // 300 & 0xff = 44
  });

  it("ConcatAudioListNode handles non-array input", async () => {
    const _n = new ConcatAudioListNode();
    _n.assign({ audio_files: "not-array" });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(0);
  });

  it("AudioToNumpyNode converts audio ref without data", async () => {
    const _n = new AudioToNumpyNode();
    _n.assign({ audio: { uri: "test" } });
    const result = await _n.process();
    expect(result.output).toEqual([]);
  });

  it("CreateSilenceNode creates zero-filled buffer", async () => {
    const _n = new CreateSilenceNode();
    _n.assign({ duration: 5 });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([0, 0, 0, 0, 0]);
  });

  it("ConcatAudioNode concatenates two refs", async () => {
    const a = { data: Buffer.from([1]).toString("base64") };
    const b = { data: Buffer.from([2]).toString("base64") };
    const _n = new ConcatAudioNode();
    _n.assign({ a: a, b: b });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([1, 2]);
  });
});

// --------------- IMAGE NODES ---------------

describe("image nodes — full coverage", () => {
  it("LoadImageFileNode loads from file", async () => {
    const filePath = `${tmpDir}/load-image/test.png`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const _n = new LoadImageFileNode();
    _n.assign({ path: filePath });
    const result = await _n.process();
    const output = result.output as { type: string; data: string; uri: string; mimeType: string; width: number | undefined; height: number | undefined };
    expect(output.type).toBe("image");
    expect(output.uri).toContain(filePath);
    expect(output.mimeType).toBe("image/png");
    expect(output.data.length).toBeGreaterThan(0);
  });

  it("LoadImageFileNode handles file:// URI", async () => {
    const filePath = `${tmpDir}/load-image-uri/test.png`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from([1, 2, 3]));
    const _n = new LoadImageFileNode();
    _n.assign({ path: `file://${filePath}` });
    const result = await _n.process();
    expect((result.output as { uri: string }).uri).toContain(filePath);
  });

  it("LoadImageFolderNode streams images from folder", async () => {
    const dir = `${tmpDir}/load-image-folder`;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "a.png"), Buffer.from([1]));
    await fs.writeFile(path.join(dir, "b.jpg"), Buffer.from([2]));
    await fs.writeFile(path.join(dir, "c.jpeg"), Buffer.from([3]));
    await fs.writeFile(path.join(dir, "d.webp"), Buffer.from([4]));
    await fs.writeFile(path.join(dir, "e.gif"), Buffer.from([5]));
    await fs.writeFile(path.join(dir, "f.bmp"), Buffer.from([6]));
    await fs.writeFile(path.join(dir, "g.txt"), "not image");

    const node = new LoadImageFolderNode();
    const items: Array<Record<string, unknown>> = [];
    node.assign({ folder: dir });
    for await (const item of node.genProcess()) {
      items.push(item);
    }
    expect(items.length).toBe(6);
  });

  it("LoadImageFolderNode process returns empty", async () => {
    const result = await new LoadImageFolderNode().process();
    expect(result).toEqual({});
  });

  it("LoadImageAssetsNode delegates to folder loader", async () => {
    const dir = `${tmpDir}/load-image-assets`;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "test.png"), Buffer.from([1]));

    const node = new LoadImageAssetsNode();
    const items: Array<Record<string, unknown>> = [];
    node.assign({ folder: dir });
    for await (const item of node.genProcess()) {
      items.push(item);
    }
    expect(items.length).toBe(1);
  });

  it("LoadImageAssetsNode process returns empty", async () => {
    const result = await new LoadImageAssetsNode().process();
    expect(result).toEqual({});
  });

  it("SaveImageFileImageNode writes to file", async () => {
    const filePath = `${tmpDir}/save-image-file/out.png`;
    const ref = imageRef();
    const _n = new SaveImageFileImageNode();
    _n.assign({ image: ref, folder: path.dirname(filePath), filename: path.basename(filePath) });
    const result = await _n.process();
    expect(result.output).toBe(filePath);
    const stat = await fs.stat(filePath);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("SaveImageNode writes with date name", async () => {
    const dir = `${tmpDir}/save-image-dir`;
    const ref = imageRef();
    const _n = new SaveImageNode();
    _n.assign({
      image: ref,
      folder: dir,
      name: "img_%Y%m%d.png",
    });
    const result = await _n.process();
    const output = result.output as { uri: string; data: string };
    expect(output.uri).toMatch(/img_\d{8}\.png/);
    expect(output.data.length).toBeGreaterThan(0);
  });

  it("GetMetadataNode returns metadata with all fields", async () => {
    const _n = new GetMetadataNode();
    _n.assign({
      image: { data: "AQID", uri: "file://test.png", mimeType: "image/png", width: 100, height: 200 },
    });
    const result = await _n.process();
    const meta = result.output as Record<string, unknown>;
    expect(meta.uri).toBe("file://test.png");
    expect(meta.mime_type).toBe("image/png");
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(200);
    expect(meta.size_bytes).toBe(3);
    // Verify all expected fields are present
    expect(Object.keys(meta)).toEqual(
      expect.arrayContaining(["uri", "mime_type", "size_bytes", "width", "height"])
    );
  });

  it("GetMetadataNode handles missing optional fields", async () => {
    const _n = new GetMetadataNode();
    _n.assign({ image: { data: "AQ==" } });
    const result = await _n.process();
    const meta = result.output as Record<string, unknown>;
    expect(meta.uri).toBe("");
    expect(meta.mime_type).toBe("image/unknown");
    expect(meta.width).toBeUndefined();
    expect(meta.height).toBeUndefined();
  });

  it("BatchToListNode converts array", async () => {
    const _n = new BatchToListNode();
    _n.assign({ batch: [1, 2, 3] });
    const result = await _n.process();
    expect(result.output).toEqual([1, 2, 3]);
  });

  it("BatchToListNode wraps non-array in list", async () => {
    const _n = new BatchToListNode();
    _n.assign({ batch: "single" });
    const result = await _n.process();
    expect(result.output).toEqual(["single"]);
  });

  it("ImagesToListNode collects from images, image_a, image_b", async () => {
    const a = imageRef();
    const b = imageRef();
    const c = imageRef();
    const _n = new ImagesToListNode();
    _n.assign({
      images: [c],
      image_a: a,
      image_b: b,
    });
    const result = await _n.process();
    expect((result.output as unknown[]).length).toBe(3);
  });

  it("ImagesToListNode handles null image_a and image_b", async () => {
    const _n = new ImagesToListNode();
    _n.assign({
      images: [imageRef()],
      image_a: null,
      image_b: null,
    });
    const result = await _n.process();
    expect((result.output as unknown[]).length).toBe(1);
  });

  it("PasteNode returns transform metadata", async () => {
    const ref = { ...imageRef(), width: 320, height: 240 };
    const _n = new PasteNode();
    _n.assign({ image: ref });
    const result = await _n.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(320);
    expect(output.height).toBe(240);
  });

  it("ScaleNode returns transform metadata", async () => {
    const _n = new ScaleNode();
    _n.assign({
      image: { data: "AQ==", width: 100, height: 50 },
      scale: 2,
    });
    const result = await _n.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(200);
  });

  it("ResizeNode returns transform metadata", async () => {
    const _n = new ResizeNode();
    _n.assign({ image: imageRef(), width: 640, height: 480 });
    const result = await _n.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(640);
    expect(output.height).toBe(480);
  });

  it("CropNode returns transform metadata", async () => {
    const _n = new CropNode();
    _n.assign({ image: imageRef(), right: 50, bottom: 50 });
    const result = await _n.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(50);
  });

  it("FitNode returns transform metadata", async () => {
    const _n = new FitNode();
    _n.assign({ image: imageRef(), width: 300, height: 300 });
    const result = await _n.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(300);
  });

  it("TransformImageNode uses image dimensions when width/height not specified", async () => {
    const _n = new PasteNode();
    _n.assign({
      image: { data: "AQ==", width: 800, height: 600 },
    });
    const result = await _n.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(800);
    expect(output.height).toBe(600);
  });

  it("TransformImageNode handles zero/null dimensions", async () => {
    const _n = new PasteNode();
    _n.assign({
      image: { data: "AQ==" },
      width: 0,
      height: null,
    });
    const result = await _n.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBeNull();
    expect(output.height).toBeNull();
  });

  it("defaults() methods return expected structures", () => {
    expect(new LoadImageFileNode().serialize()).toEqual({ path: "" });
    expect(new LoadImageFolderNode().serialize()).toEqual({
      folder: "",
      include_subdirectories: false,
      extensions: [".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".tiff"],
      pattern: "",
    });
    expect(new SaveImageFileImageNode().serialize()).toMatchObject({
      image: { type: "image", uri: "" },
      folder: "",
      filename: "",
      overwrite: false,
    });
    expect(new LoadImageAssetsNode().serialize()).toMatchObject({ folder: { type: "folder", uri: "" } });
    expect(new SaveImageNode().serialize()).toMatchObject({
      image: { type: "image", uri: "" },
      folder: { type: "folder", uri: "" },
      name: "%Y-%m-%d_%H-%M-%S.png",
    });
    expect(new GetMetadataNode().serialize()).toMatchObject({ image: { type: "image", uri: "" } });
    expect(new BatchToListNode().serialize()).toMatchObject({ batch: { type: "image", uri: "" } });
    expect(new ImagesToListNode().serialize()).toEqual({});
    expect(new PasteNode().serialize()).toMatchObject({
      image: { type: "image", uri: "" },
      paste: { type: "image", uri: "" },
      left: 0,
      top: 0,
    });
    expect(new TextToImageNode().serialize()).toMatchObject({
      prompt: "A cat holding a sign that says hello world",
      width: 512,
      height: 512,
    });
    expect(new ImageToImageNode().serialize()).toMatchObject({
      image: { type: "image", uri: "" },
      prompt: "A photorealistic version of the input image",
    });
  });

  it("TextToImageNode generates image bytes from prompt", async () => {
    const _n = new TextToImageNode();
    _n.assign({ prompt: "test-img", width: 256, height: 128 });
    const result = await _n.process();
    const output = result.output as { type: string; data: string; width: number; height: number };
    expect(output.type).toBe("image");
    expect(output.width).toBe(256);
    expect(output.height).toBe(128);
    const bytes = Buffer.from(output.data, "base64");
    expect(bytes.toString("utf8")).toBe("test-img");
  });

  it("ImageToImageNode transforms image with prompt", async () => {
    const img = { data: Buffer.from([1, 2]).toString("base64"), uri: "file://in.png" };
    const _n = new ImageToImageNode();
    _n.assign({ image: img, prompt: "stylize" });
    const result = await _n.process();
    const output = result.output as { type: string; uri: string; data: string };
    expect(output.type).toBe("image");
    expect(output.uri).toBe("file://in.png");
    const bytes = Buffer.from(output.data, "base64");
    expect(Array.from(bytes)).toEqual([1, 2]);
  });

  it("ImagesToListNode handles non-array images input", async () => {
    const _n = new ImagesToListNode();
    _n.assign({ images: "not-array", image_a: null, image_b: null });
    const result = await _n.process();
    expect(result.output).toEqual([]);
  });
});

// --------------- VIDEO NODES ---------------

describe("video nodes — full coverage", () => {
  it("ImageToVideoNode generates video from image", async () => {
    const img = imageRef();
    const _n = new ImageToVideoNode();
    _n.assign({ image: img, prompt: "animate" });
    const result = await _n.process();
    const output = result.output as { type: string; data: string };
    expect(output.type).toBe("video");
    const outData = Buffer.from(output.data, "base64");
    expect(outData.length).toBeGreaterThan(0);
  });

  it("LoadVideoFileNode reads from file", async () => {
    const filePath = `${tmpDir}/load-video/test.mp4`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from("fake-mp4"));
    const _n = new LoadVideoFileNode();
    _n.assign({ path: filePath });
    const result = await _n.process();
    const output = result.output as { uri: string; data: string };
    expect(output.uri).toContain(filePath);
  });

  it("LoadVideoFileNode handles file:// URI", async () => {
    const filePath = `${tmpDir}/load-video-uri/test.mp4`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from("video"));
    const _n = new LoadVideoFileNode();
    _n.assign({ path: `file://${filePath}` });
    const result = await _n.process();
    expect((result.output as { uri: string }).uri).toContain(filePath);
  });

  it("SaveVideoFileVideoNode writes to file", async () => {
    const filePath = `${tmpDir}/save-video-file/out.mp4`;
    const ref = videoRef();
    const _n = new SaveVideoFileVideoNode();
    _n.assign({ video: ref, folder: path.dirname(filePath), filename: path.basename(filePath) });
    const result = await _n.process();
    expect(result.output).toBe(filePath);
    const stat = await fs.stat(filePath);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("LoadVideoAssetsNode streams from folder", async () => {
    const dir = `${tmpDir}/load-video-assets`;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "a.mp4"), Buffer.from([1]));
    await fs.writeFile(path.join(dir, "b.mov"), Buffer.from([2]));
    await fs.writeFile(path.join(dir, "c.webm"), Buffer.from([3]));
    await fs.writeFile(path.join(dir, "d.mkv"), Buffer.from([4]));
    await fs.writeFile(path.join(dir, "e.avi"), Buffer.from([5]));
    await fs.writeFile(path.join(dir, "f.txt"), "not video");

    const node = new LoadVideoAssetsNode();
    const items: Array<Record<string, unknown>> = [];
    node.assign({ folder: dir });
    for await (const item of node.genProcess()) {
      items.push(item);
    }
    expect(items.length).toBe(5);
  });

  it("LoadVideoAssetsNode process returns empty", async () => {
    const result = await new LoadVideoAssetsNode().process();
    expect(result).toEqual({});
  });

  it("SaveVideoNode writes with date name", async () => {
    const dir = `${tmpDir}/save-video-dir`;
    const ref = videoRef();
    const _n = new SaveVideoNode();
    _n.assign({
      video: ref,
      folder: dir,
      name: "vid_%Y%m%d.mp4",
    });
    const result = await _n.process();
    const output = result.output as { uri: string };
    expect(output.uri).toMatch(/vid_\d{8}\.mp4/);
  });

  it("FrameIteratorNode streams pseudo-frames", async () => {
    const data = Buffer.from(new Array(4096).fill(42)).toString("base64");
    const node = new FrameIteratorNode();
    const frames: Array<Record<string, unknown>> = [];
    node.assign({ video: { data } });
    for await (const frame of node.genProcess()) {
      frames.push(frame);
    }
    expect(frames.length).toBe(4); // ceil(4096/1024) = 4
    expect(frames[0].index).toBe(0);
    expect(frames[3].index).toBe(3);
  });

  it("FrameIteratorNode process returns empty", async () => {
    const result = await new FrameIteratorNode().process();
    expect(result).toEqual({});
  });

  it("FpsNode attaches fps metadata", async () => {
    const ref = videoRef();
    const _n = new FpsNode();
    _n.assign({ video: ref });
    const result = await _n.process();
    expect(result.output).toBe(24);
  });

  it("FrameToVideoNode combines frames", async () => {
    const frameA = { data: Buffer.from([1, 2]).toString("base64") };
    const frameB = { data: Buffer.from([3, 4]).toString("base64") };
    const _n = new FrameToVideoNode();
    _n.assign({ frame: [frameA, frameB] });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([1, 2, 3, 4]);
  });

  it("FrameToVideoNode handles non-object frames", async () => {
    const _n = new FrameToVideoNode();
    _n.assign({ frame: [null, "bad"] });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(0);
  });

  it("ConcatVideoNode concatenates two videos", async () => {
    const a = { data: Buffer.from([1, 2]).toString("base64") };
    const b = { data: Buffer.from([3, 4]).toString("base64") };
    const _n = new ConcatVideoNode();
    _n.assign({ video_a: a, video_b: b });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([1, 2, 3, 4]);
  });

  it("TrimVideoNode trims from start and end", async () => {
    const data = Buffer.from([1, 2, 3, 4, 5]).toString("base64");
    const _n = new TrimVideoNode();
    _n.assign({ video: { data }, start_time: 1, end_time: 1 });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([2, 3, 4]);
  });

  it("VideoTransformNode subclasses pass through video", async () => {
    const ref = videoRef();
    for (const NodeClass of [
      ResizeVideoNode,
      RotateVideoNode,
      SetSpeedVideoNode,
      ColorBalanceVideoNode,
      DenoiseVideoNode,
      StabilizeVideoNode,
      SharpnessVideoNode,
      BlurVideoNode,
      SaturationVideoNode,
      AddSubtitlesVideoNode,
      ChromaKeyVideoNode,
    ]) {
      const _n = new NodeClass();
      _n.assign({ video: ref });
      const result = await _n.process();
      expect((result.output as { data: string }).data.length).toBeGreaterThan(0);
    }
  });

  it("OverlayVideoNode and TransitionVideoNode use canonical input names", async () => {
    const ref = videoRef();
    const _n = new OverlayVideoNode();
    _n.assign({
      main_video: ref,
      overlay_video: ref,
    });
    const overlay = await _n.process();
    const _n2 = new TransitionVideoNode();
    _n2.assign({
      video_a: ref,
      video_b: ref,
    });
    const transition = await _n2.process();
    expect((overlay.output as { data: string }).data).toBeDefined();
    expect((transition.output as { data: string }).data).toBeDefined();
  });

  it("ReverseVideoNode reverses video bytes", async () => {
    const data = Buffer.from([1, 2, 3]).toString("base64");
    const _n = new ReverseVideoNode();
    _n.assign({ video: { data } });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([3, 2, 1]);
  });

  it("AddAudioVideoNode muxes video and audio", async () => {
    const v = { data: Buffer.from([1, 2]).toString("base64") };
    const a = { data: Buffer.from([3, 4]).toString("base64") };
    const _n = new AddAudioVideoNode();
    _n.assign({ video: v, audio: a });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([1, 2, 3, 4]);
  });

  it("ExtractAudioVideoNode extracts first half as audio", async () => {
    const data = Buffer.from([1, 2, 3, 4]).toString("base64");
    const _n = new ExtractAudioVideoNode();
    _n.assign({ video: { data } });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([1, 2]);
  });

  it("ExtractFrameVideoNode extracts frame by index", async () => {
    const data = Buffer.from(new Array(2048).fill(7)).toString("base64");
    const _n = new ExtractFrameVideoNode();
    _n.assign({ video: { data }, frame_index: 1 });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(1024);
  });

  it("GetVideoInfoNode returns metadata", async () => {
    const ref = videoRef();
    const videoData = Buffer.from((ref as { data: string }).data, "base64");
    const _n = new GetVideoInfoNode();
    _n.assign({ video: ref });
    const result = await _n.process();
    const info = result.output as Record<string, unknown>;
    expect(info.fps).toBe(24);
    expect(info.size_bytes).toBe(videoData.length);
    expect(info.duration_seconds).toBe(videoData.length / 24000);
    expect(info.uri).toBe("");
    // Verify all expected metadata fields are present
    expect(Object.keys(info)).toEqual(
      expect.arrayContaining(["uri", "size_bytes", "fps", "duration_seconds"])
    );
  });

  it("video helper functions handle edge cases", async () => {
    // FpsNode returns a float (fps value), not a video ref
    const _n = new FpsNode();
    _n.assign({ video: "not-object", fps: 10 });
    const result = await _n.process();
    expect(typeof result.output).toBe("number");

    // imageBytes in video module
    const _n2 = new ImageToVideoNode();
    _n2.assign({ image: null, prompt: "" });
    const imgResult = await _n2.process();
    expect((imgResult.output as { data: string }).data).toBeDefined();

    // audioBytes in video module
    const _n3 = new AddAudioVideoNode();
    _n3.assign({ video: {}, audio: null });
    const audioResult = await _n3.process();
    expect((audioResult.output as { data: string }).data).toBeDefined();
  });

  it("toBytes handles Uint8Array input in video", async () => {
    const uint8Data = new Uint8Array([1, 2, 3]);
    const _n = new FrameToVideoNode();
    _n.assign({
      frame: [{ data: uint8Data }],
    });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([1, 2, 3]);
  });

  it("defaults() methods return expected structures", () => {
    expect(new TextToVideoNode().serialize()).toMatchObject({
      prompt: "A cat playing with a ball of yarn",
      aspect_ratio: "16:9",
      resolution: "720p",
      num_frames: 60,
    });
    expect(new ImageToVideoNode().serialize()).toMatchObject({
      image: { type: "image", uri: "" },
      prompt: "",
      aspect_ratio: "16:9",
      resolution: "720p",
    });
    expect(new LoadVideoFileNode().serialize()).toEqual({ path: "" });
    expect(new SaveVideoFileVideoNode().serialize()).toMatchObject({
      video: { type: "video", uri: "" },
      folder: "",
      filename: "",
    });
    expect(new LoadVideoAssetsNode().serialize()).toMatchObject({ folder: { type: "folder", uri: "" } });
    expect(new SaveVideoNode().serialize()).toMatchObject({
      video: { type: "video", uri: "" },
      folder: { type: "folder", uri: "" },
      name: "%Y-%m-%d-%H-%M-%S.mp4",
    });
    expect(new FrameIteratorNode().serialize()).toMatchObject({ video: { type: "video", uri: "" }, start: 0, end: -1 });
    expect(new FpsNode().serialize()).toMatchObject({ video: { type: "video", uri: "" } });
    expect(new FrameToVideoNode().serialize()).toMatchObject({ frame: { type: "image", uri: "" }, fps: 30 });
    expect(new ConcatVideoNode().serialize()).toMatchObject({
      video_a: { type: "video", uri: "" },
      video_b: { type: "video", uri: "" },
    });
    expect(new TrimVideoNode().serialize()).toMatchObject({ video: { type: "video", uri: "" }, start_time: 0, end_time: -1 });
    expect(new ResizeVideoNode().serialize()).toMatchObject({ video: { type: "video", uri: "" }, width: -1, height: -1 });
    expect(new ReverseVideoNode().serialize()).toMatchObject({ video: { type: "video", uri: "" } });
    expect(new AddAudioVideoNode().serialize()).toMatchObject({
      video: { type: "video", uri: "" },
      audio: { type: "audio", uri: "" },
      volume: 1,
      mix: false,
    });
    expect(new ExtractAudioVideoNode().serialize()).toMatchObject({ video: { type: "video", uri: "" } });
    expect(new ExtractFrameVideoNode().serialize()).toMatchObject({ video: { type: "video", uri: "" }, time: 0 });
    expect(new GetVideoInfoNode().serialize()).toMatchObject({ video: { type: "video", uri: "" } });
  });

  it("TextToVideoNode generates video from text", async () => {
    const _n = new TextToVideoNode();
    _n.assign({ prompt: "hello-vid" });
    const result = await _n.process();
    const output = result.output as { type: string; data: string };
    expect(output.type).toBe("video");
    const outData = Buffer.from(output.data, "base64");
    expect(outData.toString("utf8")).toBe("hello-vid");
  });

  it("FrameToVideoNode handles non-array frames", async () => {
    const _n = new FrameToVideoNode();
    _n.assign({ frame: "not-array" });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(0);
  });

  it("GetVideoInfoNode handles video with uri", async () => {
    const _n = new GetVideoInfoNode();
    _n.assign({
      video: { data: Buffer.from([1, 2, 3]).toString("base64"), uri: "file://test.mp4" },
    });
    const result = await _n.process();
    const info = result.output as Record<string, unknown>;
    expect(info.uri).toBe("file://test.mp4");
    expect(info.size_bytes).toBe(3);
    expect(info.fps).toBe(24);
    expect(info.duration_seconds).toBe(3 / 24000);
  });
});

// --------------- MODEL3D NODES ---------------

describe("model3d nodes — full coverage", () => {
  it("LoadModel3DFileNode reads from file", async () => {
    const filePath = `${tmpDir}/load-model/test.glb`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from("glb-data"));
    const _n = new LoadModel3DFileNode();
    _n.assign({ path: filePath });
    const result = await _n.process();
    const output = result.output as { uri: string; format: string; data: string };
    expect(output.uri).toContain(filePath);
    expect(output.format).toBe("glb");
    expect(output.data.length).toBeGreaterThan(0);
  });

  it("LoadModel3DFileNode handles file:// URI", async () => {
    const filePath = `${tmpDir}/load-model-uri/test.obj`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from("obj-data"));
    const _n = new LoadModel3DFileNode();
    _n.assign({ path: `file://${filePath}` });
    const result = await _n.process();
    const output = result.output as { format: string };
    expect(output.format).toBe("obj");
  });

  it("SaveModel3DFileNode writes model to file", async () => {
    const dir = `${tmpDir}/save-model-file`;
    const ref = modelRef();
    const _n = new SaveModel3DFileNode();
    _n.assign({
      model: ref,
      folder: dir,
      filename: "out.glb",
    });
    const result = await _n.process();
    const output = result.output as { uri: string; format: string };
    expect(output.uri).toContain("out.glb");
    expect(output.format).toBe("glb");
    const stat = await fs.stat(path.join(dir, "out.glb"));
    expect(stat.size).toBeGreaterThan(0);
  });

  it("SaveModel3DNode writes with timestamped name", async () => {
    const dir = `${tmpDir}/save-model-date`;
    const ref = modelRef();
    const _n = new SaveModel3DNode();
    _n.assign({
      model: ref,
      folder: dir,
      name: "model_%Y%m%d.glb",
    });
    const result = await _n.process();
    const output = result.output as { uri: string };
    expect(output.uri).toMatch(/model_\d{8}\.glb/);
  });

  it("FormatConverterNode changes output format", async () => {
    const ref = modelRef();
    const _n = new FormatConverterNode();
    _n.assign({
      model: ref,
      output_format: "obj",
    });
    const result = await _n.process();
    const output = result.output as { format: string };
    expect(output.format).toBe("obj");
  });

  it("GetModel3DMetadataNode returns metadata", async () => {
    const data = Buffer.from(new Array(320).fill(0)).toString("base64");
    const _n = new GetModel3DMetadataNode();
    _n.assign({
      model: { data, format: "stl", uri: "file://test.stl" },
    });
    const result = await _n.process();
    const meta = result.output as Record<string, unknown>;
    expect(meta.format).toBe("stl");
    expect(meta.uri).toBe("file://test.stl");
    expect(meta.size_bytes).toBe(320);
    expect(meta.vertices).toBe(10); // 320/32
    expect(meta.faces).toBe(3); // floor(10/3)
  });

  it("GetModel3DMetadataNode uses explicit vertices/faces", async () => {
    const _n = new GetModel3DMetadataNode();
    _n.assign({
      model: { data: "AQ==", vertices: 100, faces: 50, format: "glb" },
    });
    const result = await _n.process();
    const meta = result.output as Record<string, unknown>;
    expect(meta.vertices).toBe(100);
    expect(meta.faces).toBe(50);
  });

  it("Transform3DNode passes through model", async () => {
    const ref = modelRef();
    const _n = new Transform3DNode();
    _n.assign({ model: ref });
    const result = await _n.process();
    const output = result.output as { format: string; data: string };
    expect(output.format).toBe("glb");
    expect(output.data.length).toBeGreaterThan(0);
  });

  it("DecimateNode reduces model size", async () => {
    const data = Buffer.from(new Array(100).fill(42)).toString("base64");
    const _n = new DecimateNode();
    _n.assign({ model: { data }, target_ratio: 0.5 });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(50);
  });

  it("DecimateNode clamps ratio to [0, 1]", async () => {
    const data = Buffer.from(new Array(100).fill(42)).toString("base64");
    const _n = new DecimateNode();
    _n.assign({ model: { data }, target_ratio: 2.0 });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(100);

    const _n2 = new DecimateNode();
    _n2.assign({ model: { data }, target_ratio: 0 });
    const result2 = await _n2.process();
    const outData2 = Buffer.from((result2.output as { data: string }).data, "base64");
    expect(outData2.length).toBe(1); // max(1, ...)
  });

  it("Boolean3DNode union concatenates", async () => {
    const a = { data: Buffer.from([1, 2]).toString("base64") };
    const b = { data: Buffer.from([3, 4]).toString("base64") };
    const _n = new Boolean3DNode();
    _n.assign({ model_a: a, model_b: b, operation: "union" });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([1, 2, 3, 4]);
  });

  it("Boolean3DNode difference subtracts", async () => {
    const a = { data: Buffer.from([10, 20]).toString("base64") };
    const b = { data: Buffer.from([3, 30]).toString("base64") };
    const _n = new Boolean3DNode();
    _n.assign({
      model_a: a,
      model_b: b,
      operation: "difference",
    });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData[0]).toBe(7); // 10 - 3
    expect(outData[1]).toBe(0); // max(0, 20-30)
  });

  it("Boolean3DNode intersection takes min", async () => {
    const a = { data: Buffer.from([10, 20, 30]).toString("base64") };
    const b = { data: Buffer.from([15, 5]).toString("base64") };
    const _n = new Boolean3DNode();
    _n.assign({
      model_a: a,
      model_b: b,
      operation: "intersection",
    });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(2); // min length
    expect(outData[0]).toBe(10);
    expect(outData[1]).toBe(5);
  });

  it("RecalculateNormalsNode passes through", async () => {
    const ref = modelRef();
    const _n = new RecalculateNormalsNode();
    _n.assign({ model: ref });
    const result = await _n.process();
    expect((result.output as { data: string }).data.length).toBeGreaterThan(0);
  });

  it("CenterMeshNode passes through", async () => {
    const ref = modelRef();
    const _n = new CenterMeshNode();
    _n.assign({ model: ref });
    const result = await _n.process();
    expect((result.output as { data: string }).data.length).toBeGreaterThan(0);
  });

  it("FlipNormalsNode passes through", async () => {
    const ref = modelRef();
    const _n = new FlipNormalsNode();
    _n.assign({ model: ref });
    const result = await _n.process();
    expect((result.output as { data: string }).data.length).toBeGreaterThan(0);
  });

  it("MergeMeshesNode merges list of models", async () => {
    const a = { data: Buffer.from([1, 2]).toString("base64") };
    const b = { data: Buffer.from([3]).toString("base64") };
    const _n = new MergeMeshesNode();
    _n.assign({ models: [a, b] });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(Array.from(outData)).toEqual([1, 2, 3]);
  });

  it("MergeMeshesNode handles empty list", async () => {
    const _n = new MergeMeshesNode();
    _n.assign({ models: [] });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(0);
  });

  it("ImageTo3DNode converts image data to model", async () => {
    const data = Buffer.from([10, 20, 30]).toString("base64");
    const _n = new ImageTo3DNode();
    _n.assign({ image: { data } });
    const result = await _n.process();
    const output = result.output as { data: string; format: string };
    expect(output.format).toBe("glb");
    const outData = Buffer.from(output.data, "base64");
    expect(Array.from(outData)).toEqual([10, 20, 30]);
  });

  it("ImageTo3DNode handles empty image", async () => {
    const _n = new ImageTo3DNode();
    _n.assign({ image: {} });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(0);
  });

  it("ModelTransformNode handles non-object model", async () => {
    const _n = new Transform3DNode();
    _n.assign({ model: "not-an-object" });
    const result = await _n.process();
    const output = result.output as { format: string };
    expect(output.format).toBe("glb");
  });

  it("ModelTransformNode handles null model", async () => {
    const _n = new Transform3DNode();
    _n.assign({ model: null });
    const result = await _n.process();
    const output = result.output as { format: string };
    expect(output.format).toBe("glb");
  });

  it("extFormat returns glb for no extension", async () => {
    const filePath = `${tmpDir}/load-model-noext/testfile`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from("data"));
    const _n = new LoadModel3DFileNode();
    _n.assign({ path: filePath });
    const result = await _n.process();
    const output = result.output as { format: string };
    expect(output.format).toBe("glb");
  });

  it("dateName in model3d formats timestamps", async () => {
    const dir = `${tmpDir}/save-model-date2`;
    const _n = new SaveModel3DNode();
    _n.assign({
      model: modelRef(),
      folder: dir,
      name: "%Y-%m-%d_%H%M%S.glb",
    });
    const result = await _n.process();
    const output = result.output as { uri: string };
    expect(output.uri).toMatch(/\d{4}-\d{2}-\d{2}_\d{6}\.glb/);
  });

  it("concatBytes handles empty array", async () => {
    const _n = new MergeMeshesNode();
    _n.assign({ models: [] });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(0);
  });

  it("defaults() methods return expected structures", () => {
    expect(new LoadModel3DFileNode().serialize()).toEqual({ path: "" });
    expect(new SaveModel3DFileNode().serialize()).toMatchObject({
      model: { type: "model_3d", uri: "" },
      folder: "",
      filename: "",
      overwrite: false,
    });
    expect(new SaveModel3DNode().serialize()).toMatchObject({
      model: { type: "model_3d", uri: "" },
      folder: { type: "folder", uri: "" },
      name: "%Y-%m-%d_%H-%M-%S.glb",
    });
    expect(new FormatConverterNode().serialize()).toMatchObject({ model: { type: "model_3d", uri: "" }, output_format: "glb" });
    expect(new GetModel3DMetadataNode().serialize()).toMatchObject({ model: { type: "model_3d", uri: "" } });
    expect(new Transform3DNode().serialize()).toMatchObject({ model: { type: "model_3d", uri: "" } });
    expect(new DecimateNode().serialize()).toMatchObject({
      model: { type: "model_3d", uri: "" },
      target_ratio: 0.5,
    });
    expect(new Boolean3DNode().serialize()).toMatchObject({
      model_a: { type: "model_3d", uri: "" },
      model_b: { type: "model_3d", uri: "" },
      operation: "union",
    });
    expect(new RecalculateNormalsNode().serialize()).toMatchObject({ model: { type: "model_3d", uri: "" } });
    expect(new CenterMeshNode().serialize()).toMatchObject({ model: { type: "model_3d", uri: "" } });
    expect(new FlipNormalsNode().serialize()).toMatchObject({ model: { type: "model_3d", uri: "" } });
    expect(new MergeMeshesNode().serialize()).toEqual({ models: [] });
    expect(new TextTo3DNode().serialize()).toMatchObject({
      prompt: "",
      output_format: "glb",
      negative_prompt: "",
      art_style: "",
      seed: -1,
      timeout_seconds: 600,
    });
    expect(new ImageTo3DNode().serialize()).toMatchObject({ image: { type: "image", uri: "" } });
  });

  it("TextTo3DNode generates model from text", async () => {
    const _n = new TextTo3DNode();
    _n.assign({ prompt: "sphere" });
    const result = await _n.process();
    const output = result.output as { data: string; format: string };
    expect(output.format).toBe("glb");
    expect(output.data).toBeDefined();
    expect(typeof output.data).toBe("string");
    expect(Buffer.from(output.data, "base64").toString("utf8")).toBe("sphere");
  });

  it("MergeMeshesNode handles non-array input", async () => {
    const _n = new MergeMeshesNode();
    _n.assign({ models: "not-array" });
    const result = await _n.process();
    const outData = Buffer.from((result.output as { data: string }).data, "base64");
    expect(outData.length).toBe(0);
  });

  it("GetModel3DMetadataNode handles empty model", async () => {
    const _n = new GetModel3DMetadataNode();
    _n.assign({ model: {} });
    const result = await _n.process();
    const meta = result.output as Record<string, unknown>;
    expect(meta.format).toBe("glb");
    expect(meta.uri).toBe("");
    expect(meta.size_bytes).toBe(0);
  });
});
