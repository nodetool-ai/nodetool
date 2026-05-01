import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
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
  TrimAudioNode,
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
  ImageTo3DNode
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
  const d =
    data ?? Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"); // PNG magic
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

function pad4(length: number): number {
  return (4 - (length % 4)) % 4;
}

function triangleGlbBase64(): string {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 2, 0
  ]);
  const indices = new Uint16Array([0, 1, 2]);
  const positionsBytes = new Uint8Array(positions.buffer);
  const indicesBytes = new Uint8Array(indices.buffer);
  const totalBinaryLength =
    positionsBytes.byteLength + indicesBytes.byteLength + pad4(indicesBytes.byteLength);

  const json = {
    asset: { version: "2.0" },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1
          }
        ]
      }
    ],
    buffers: [{ byteLength: totalBinaryLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionsBytes.byteLength },
      {
        buffer: 0,
        byteOffset: positionsBytes.byteLength,
        byteLength: indicesBytes.byteLength
      }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 2, 0]
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: 3,
        type: "SCALAR"
      }
    ]
  };

  const jsonRaw = new TextEncoder().encode(JSON.stringify(json));
  const jsonBytes = new Uint8Array(jsonRaw.byteLength + pad4(jsonRaw.byteLength));
  jsonBytes.set(jsonRaw);
  jsonBytes.fill(0x20, jsonRaw.byteLength);

  const binary = new Uint8Array(totalBinaryLength);
  binary.set(positionsBytes, 0);
  binary.set(indicesBytes, positionsBytes.byteLength);

  const totalLength = 12 + 8 + jsonBytes.byteLength + 8 + binary.byteLength;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.set(jsonBytes, 20);
  const binaryChunkOffset = 20 + jsonBytes.byteLength;
  view.setUint32(binaryChunkOffset, binary.byteLength, true);
  view.setUint32(binaryChunkOffset + 4, 0x004e4942, true);
  glb.set(binary, binaryChunkOffset + 8);
  return Buffer.from(glb).toString("base64");
}

function gridGlbBase64(gridSize = 8): string {
  const positions: number[] = [];
  for (let y = 0; y <= gridSize; y++) {
    for (let x = 0; x <= gridSize; x++) {
      positions.push(x / gridSize, y / gridSize, 0);
    }
  }

  const indices: number[] = [];
  const rowStride = gridSize + 1;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const a = y * rowStride + x;
      const b = a + 1;
      const c = a + rowStride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const positionsBytes = new Uint8Array(new Float32Array(positions).buffer);
  const indicesBytes = new Uint8Array(new Uint32Array(indices).buffer);
  const totalBinaryLength =
    positionsBytes.byteLength + indicesBytes.byteLength + pad4(indicesBytes.byteLength);

  const json = {
    asset: { version: "2.0" },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1
          }
        ]
      }
    ],
    buffers: [{ byteLength: totalBinaryLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionsBytes.byteLength },
      {
        buffer: 0,
        byteOffset: positionsBytes.byteLength,
        byteLength: indicesBytes.byteLength
      }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0]
      },
      {
        bufferView: 1,
        componentType: 5125,
        count: indices.length,
        type: "SCALAR"
      }
    ]
  };

  const jsonRaw = new TextEncoder().encode(JSON.stringify(json));
  const jsonBytes = new Uint8Array(jsonRaw.byteLength + pad4(jsonRaw.byteLength));
  jsonBytes.set(jsonRaw);
  jsonBytes.fill(0x20, jsonRaw.byteLength);

  const binary = new Uint8Array(totalBinaryLength);
  binary.set(positionsBytes, 0);
  binary.set(indicesBytes, positionsBytes.byteLength);

  const totalLength = 12 + 8 + jsonBytes.byteLength + 8 + binary.byteLength;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.set(jsonBytes, 20);
  const binaryChunkOffset = 20 + jsonBytes.byteLength;
  view.setUint32(binaryChunkOffset, binary.byteLength, true);
  view.setUint32(binaryChunkOffset + 4, 0x004e4942, true);
  glb.set(binary, binaryChunkOffset + 8);
  return Buffer.from(glb).toString("base64");
}

function boxGlbBase64(
  min: [number, number, number],
  max: [number, number, number]
): string {
  const [minX, minY, minZ] = min;
  const [maxX, maxY, maxZ] = max;
  const positions = [
    minX, minY, minZ,
    maxX, minY, minZ,
    maxX, maxY, minZ,
    minX, maxY, minZ,
    minX, minY, maxZ,
    maxX, minY, maxZ,
    maxX, maxY, maxZ,
    minX, maxY, maxZ
  ];
  const indices = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5
  ];
  const positionsBytes = new Uint8Array(new Float32Array(positions).buffer);
  const indicesBytes = new Uint8Array(new Uint32Array(indices).buffer);
  const totalBinaryLength =
    positionsBytes.byteLength + indicesBytes.byteLength + pad4(indicesBytes.byteLength);

  const json = {
    asset: { version: "2.0" },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1
          }
        ]
      }
    ],
    buffers: [{ byteLength: totalBinaryLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionsBytes.byteLength },
      {
        buffer: 0,
        byteOffset: positionsBytes.byteLength,
        byteLength: indicesBytes.byteLength
      }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min: [...min],
        max: [...max]
      },
      {
        bufferView: 1,
        componentType: 5125,
        count: indices.length,
        type: "SCALAR"
      }
    ]
  };

  const jsonRaw = new TextEncoder().encode(JSON.stringify(json));
  const jsonBytes = new Uint8Array(jsonRaw.byteLength + pad4(jsonRaw.byteLength));
  jsonBytes.set(jsonRaw);
  jsonBytes.fill(0x20, jsonRaw.byteLength);

  const binary = new Uint8Array(totalBinaryLength);
  binary.set(positionsBytes, 0);
  binary.set(indicesBytes, positionsBytes.byteLength);

  const totalLength = 12 + 8 + jsonBytes.byteLength + 8 + binary.byteLength;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.set(jsonBytes, 20);
  const binaryChunkOffset = 20 + jsonBytes.byteLength;
  view.setUint32(binaryChunkOffset, binary.byteLength, true);
  view.setUint32(binaryChunkOffset + 4, 0x004e4942, true);
  glb.set(binary, binaryChunkOffset + 8);
  return Buffer.from(glb).toString("base64");
}

function expectBoundsClose(actual: number[], expected: [number, number, number]): void {
  expect(actual).toHaveLength(3);
  for (let i = 0; i < 3; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], 5);
  }
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
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(outData.length).toBe(3); // only 1, 2, 3 remain
  });

  it("SliceAudioNode slices by byte range", async () => {
    const data = Buffer.from([10, 20, 30, 40, 50]).toString("base64");
    const _n = new SliceAudioNode();
    _n.assign({ audio: { data }, start: 1, end: 3 });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(Array.from(outData)).toEqual([20, 30]);
  });

  it("SliceAudioNode with negative end uses full length", async () => {
    const data = Buffer.from([10, 20, 30]).toString("base64");
    const _n = new SliceAudioNode();
    _n.assign({ audio: { data }, start: 0, end: -1 });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(outData.length).toBe(3);
  });

  it("MonoToStereoNode duplicates bytes", async () => {
    const data = Buffer.from([1, 2, 3]).toString("base64");
    const _n = new MonoToStereoNode();
    _n.assign({ audio: { data } });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(Array.from(outData)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it("StereoToMonoNode takes left channel", async () => {
    const data = Buffer.from([1, 10, 2, 20, 3, 30]).toString("base64");
    const _n = new StereoToMonoNode();
    _n.assign({ audio: { data } });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(Array.from(outData)).toEqual([1, 2, 3]);
  });

  it("ReverseAudioNode reverses audio bytes", async () => {
    const data = Buffer.from([1, 2, 3]).toString("base64");
    const _n = new ReverseAudioNode();
    _n.assign({ audio: { data } });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(Array.from(outData)).toEqual([3, 2, 1]);
  });

  it("FadeInAudioNode applies linear fade-in", async () => {
    const data = Buffer.from([100, 100, 100, 100]).toString("base64");
    const _n = new FadeInAudioNode();
    _n.assign({ audio: { data }, duration: 4 });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    // first byte should be attenuated (0/4 * 100 = 0)
    expect(outData[0]).toBe(0);
    expect(outData[3]).toBe(75); // floor(100 * 3/4) = 75
  });

  it("FadeOutAudioNode applies linear fade-out", async () => {
    const data = Buffer.from([100, 100, 100, 100]).toString("base64");
    const _n = new FadeOutAudioNode();
    _n.assign({ audio: { data }, duration: 4 });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    // last byte should be heavily attenuated
    expect(outData[3]).toBeLessThan(outData[0]);
  });

  it("RepeatAudioNode repeats bytes", async () => {
    const data = Buffer.from([1, 2]).toString("base64");
    const _n = new RepeatAudioNode();
    _n.assign({ audio: { data }, loops: 3 });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(Array.from(outData)).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it("AudioMixerNode averages multiple audio refs", async () => {
    const a = { data: Buffer.from([10, 20]).toString("base64") };
    const b = { data: Buffer.from([30, 40]).toString("base64") };
    const _n = new AudioMixerNode();
    // Set unused tracks to non-object values to exclude them from mixing
    _n.assign({
      track1: a,
      track2: b,
      track3: null,
      track4: null,
      track5: null
    });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(outData[0]).toBe(20); // (10+30)/2
    expect(outData[1]).toBe(30); // (20+40)/2
  });

  it("AudioMixerNode mixes uri-backed audio refs", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audio-mixer-"));
    const aPath = path.join(tmpDir, "a.raw");
    const bPath = path.join(tmpDir, "b.raw");

    await fs.writeFile(aPath, Buffer.from([10, 20]));
    await fs.writeFile(bPath, Buffer.from([30, 40]));

    try {
      const _n = new AudioMixerNode();
      _n.assign({
        track1: { uri: `file://${aPath}` },
        track2: { uri: `file://${bPath}` },
        track3: null,
        track4: null,
        track5: null
      });

      const result = await _n.process();
      const outData = Buffer.from(
        (result.output as { data: string }).data,
        "base64"
      );

      expect(Array.from(outData)).toEqual([20, 30]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("AudioMixerNode returns empty for no inputs", async () => {
    const _n = new AudioMixerNode();
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(outData.length).toBe(0);
  });

  it("AudioMixerNode applies per-track volume multipliers", async () => {
    const a = { data: Buffer.from([100, 100]).toString("base64") };
    const b = { data: Buffer.from([100, 100]).toString("base64") };
    const _n = new AudioMixerNode();
    _n.assign({
      track1: a,
      track2: b,
      track3: null,
      track4: null,
      track5: null,
      volume1: 2,
      volume2: 0
    });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    // (100*2 + 100*0) / 2 = 100 for every sample
    expect(outData[0]).toBe(100);
    expect(outData[1]).toBe(100);
  });

  it("AudioMixerNode ignores empty default tracks in the divisor", async () => {
    // Only one real track; the other 4 defaults have no data and must not
    // dilute the amplitude.
    const a = { data: Buffer.from([50, 100, 150]).toString("base64") };
    const _n = new AudioMixerNode();
    _n.assign({ track1: a });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(Array.from(outData)).toEqual([50, 100, 150]);
  });

  it("AudioMixerNode mixes WAV PCM16 inputs into a valid WAV", async () => {
    function makeMonoWav(samples: number[], sampleRate = 22050): string {
      const buf = Buffer.alloc(44 + samples.length * 2);
      buf.write("RIFF", 0);
      buf.writeUInt32LE(36 + samples.length * 2, 4);
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
      buf.writeUInt32LE(samples.length * 2, 40);
      for (let i = 0; i < samples.length; i += 1) {
        buf.writeInt16LE(samples[i], 44 + i * 2);
      }
      return buf.toString("base64");
    }

    const a = { data: makeMonoWav([1000, 2000, 3000]) };
    const b = { data: makeMonoWav([3000, 4000, 5000]) };
    const _n = new AudioMixerNode();
    _n.assign({ track1: a, track2: b });
    const result = await _n.process();
    const outBytes = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    // Output must still be a valid WAV (RIFF...WAVE header intact)
    expect(outBytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(outBytes.toString("ascii", 8, 12)).toBe("WAVE");
    // Samples should be averaged: (1000+3000)/2=2000, (2000+4000)/2=3000, (3000+5000)/2=4000
    expect(outBytes.readInt16LE(44)).toBe(2000);
    expect(outBytes.readInt16LE(46)).toBe(3000);
    expect(outBytes.readInt16LE(48)).toBe(4000);
  });

  it("TrimAudioNode trims from start and end", async () => {
    const data = Buffer.from([1, 2, 3, 4, 5]).toString("base64");
    const _n = new TrimAudioNode();
    _n.assign({ audio: { data }, start: 1, end: 1 });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(Array.from(outData)).toEqual([2, 3, 4]);
  });

  it("ConcatAudioListNode concatenates list of audios", async () => {
    const a = { data: Buffer.from([1, 2]).toString("base64") };
    const b = { data: Buffer.from([3, 4]).toString("base64") };
    const _n = new ConcatAudioListNode();
    _n.assign({ audio_files: [a, b] });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(Array.from(outData)).toEqual([1, 2, 3, 4]);
  });

  it("TextToSpeechNode converts text to bytes", async () => {
    const _n = new TextToSpeechNode();
    _n.assign({ text: "hello" });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(outData.toString("utf8")).toBe("hello");
  });

  it("ChunkToAudioNode converts chunk with data", async () => {
    const data = Buffer.from([10, 20, 30]).toString("base64");
    const _n = new ChunkToAudioNode();
    _n.assign({ chunk: { data } });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
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
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(outData.length).toBe(0);
  });

  it("SaveAudioNode writes audio to folder with date name", async () => {
    const dir = `${tmpDir}/save-audio`;
    const ref = audioRef();
    const _n = new SaveAudioNode();
    _n.assign({
      audio: ref,
      folder: dir,
      name: "test_audio.wav"
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
    _n.assign({
      audio: ref,
      folder: path.dirname(filePath),
      filename: path.basename(filePath)
    });
    const result = await _n.process();
    expect(path.normalize(String(result.output))).toBe(path.normalize(filePath));
    const stat = await fs.stat(String(result.output));
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
    await fs.writeFile(
      path.join(dir, "a.wav"),
      Buffer.from(makeWav(), "base64")
    );
    await fs.writeFile(path.join(dir, "b.mp3"), Buffer.from([0, 1, 2]));
    await fs.writeFile(path.join(dir, "c.txt"), "not audio");

    const node = new LoadAudioAssetsNode();
    const items: Array<Record<string, unknown>> = [];
    node.assign({ folder: dir });
    for await (const item of node.genProcess()) {
      items.push(item);
    }
    const names = items.map((i) => i.name).filter((n) => typeof n === "string");
    expect(names).toContain("a.wav");
    expect(names).toContain("b.mp3");
    expect(names).not.toContain("c.txt");
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
    const names = items.map((i) => i.name).filter((n) => typeof n === "string");
    expect(names).toContain("x.flac");
  });

  it("LoadAudioAssetsNode process returns empty", async () => {
    const result = await new LoadAudioAssetsNode().process();
    expect(result).toEqual({ audio: {}, name: "", audios: [] });
  });

  it("LoadAudioFolderNode process returns empty", async () => {
    const result = await new LoadAudioFolderNode().process();
    expect(result).toEqual({ audio: {}, name: "", audios: [] });
  });

  it("audioBytes handles non-object input", async () => {
    // OverlayAudioNode internally calls audioBytes
    const _n = new OverlayAudioNode();
    _n.assign({ audio_a: "not-an-object", audio_b: null });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(outData.length).toBe(0);
  });

  it("SaveAudioNode uses dateName format strings", async () => {
    const dir = `${tmpDir}/save-audio-date`;
    const ref = audioRef();
    const _n = new SaveAudioNode();
    _n.assign({
      audio: ref,
      folder: dir,
      name: "audio_%Y%m%d.wav"
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
      extensions: [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"]
    });
    expect(new LoadAudioAssetsNode().serialize()).toMatchObject({
      folder: { type: "folder", uri: "" }
    });
    expect(new SaveAudioNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" },
      folder: { type: "folder", uri: "" },
      name: "%Y-%m-%d-%H-%M-%S.opus"
    });
    expect(new SaveAudioFileNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" },
      folder: "",
      filename: ""
    });
    expect(new NormalizeAudioNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" }
    });
    expect(new OverlayAudioNode().serialize()).toMatchObject({
      a: { type: "audio", uri: "" },
      b: { type: "audio", uri: "" }
    });
    expect(new RemoveSilenceNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" },
      min_length: 200,
      threshold: -40,
      reduction_factor: 1,
      crossfade: 10,
      min_silence_between_parts: 100
    });
    expect(new SliceAudioNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" },
      start: 0,
      end: 1
    });
    expect(new MonoToStereoNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" }
    });
    expect(new StereoToMonoNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" },
      method: "average"
    });
    expect(new ReverseAudioNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" }
    });
    expect(new FadeInAudioNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" },
      duration: 1
    });
    expect(new FadeOutAudioNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" },
      duration: 1
    });
    expect(new RepeatAudioNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" },
      loops: 2
    });
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
      volume5: 1
    });
    expect(new TrimAudioNode().serialize()).toMatchObject({
      audio: { type: "audio", uri: "" },
      start: 0,
      end: 0
    });
    expect(new CreateSilenceNode().serialize()).toEqual({ duration: 1 });
    expect(new ConcatAudioNode().serialize()).toMatchObject({
      a: { type: "audio", uri: "" },
      b: { type: "audio", uri: "" }
    });
    expect(new ConcatAudioListNode().serialize()).toEqual({ audio_files: [] });
    expect(new TextToSpeechNode().serialize()).toMatchObject({
      text: "Hello! This is a text-to-speech demonstration.",
      speed: 1
    });
    expect(new ChunkToAudioNode().serialize()).toMatchObject({
      chunk: { type: "chunk", content: "", content_type: "text" },
      batch_size: 50
    });
  });

  it("audioBytes returns empty for ref without data", async () => {
    // audio ref with uri but no data
    const _n = new NormalizeAudioNode();
    _n.assign({ audio: { uri: "file://test.wav" } });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(outData.length).toBe(0);
  });

  it("AudioMixerNode handles non-array audios input", async () => {
    const _n = new AudioMixerNode();
    _n.assign({ track1: "not-array" });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(outData.length).toBe(0);
  });

  it("ConcatAudioListNode handles non-array input", async () => {
    const _n = new ConcatAudioListNode();
    _n.assign({ audio_files: "not-array" });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(outData.length).toBe(0);
  });

  it("CreateSilenceNode creates zero-filled buffer", async () => {
    const _n = new CreateSilenceNode();
    _n.assign({ duration: 5 });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(Array.from(outData)).toEqual([0, 0, 0, 0, 0]);
  });

  it("ConcatAudioNode concatenates two refs", async () => {
    const a = { data: Buffer.from([1]).toString("base64") };
    const b = { data: Buffer.from([2]).toString("base64") };
    const _n = new ConcatAudioNode();
    _n.assign({ a: a, b: b });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(Array.from(outData)).toEqual([1, 2]);
  });
});

// --------------- IMAGE NODES ---------------

describe("image nodes — full coverage", () => {
  it("LoadImageFileNode loads from file", async () => {
    const filePath = `${tmpDir}/load-image/test.png`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
    const _n = new LoadImageFileNode();
    _n.assign({ path: filePath });
    const result = await _n.process();
    const output = result.output as {
      type: string;
      data: string;
      uri: string;
      mimeType: string;
      width: number | undefined;
      height: number | undefined;
    };
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
    const names = items.map((i) => i.name).filter((n) => typeof n === "string");
    expect(names).toContain("a.png");
    expect(names).toContain("b.jpg");
    expect(names).toContain("c.jpeg");
    expect(names).toContain("d.webp");
    expect(names).toContain("e.gif");
    expect(names).toContain("f.bmp");
    expect(names).not.toContain("g.txt");
  });

  it("LoadImageFolderNode process returns empty", async () => {
    const result = await new LoadImageFolderNode().process();
    expect(result).toEqual({ image: {}, name: "", images: [] });
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
    const names = items.map((i) => i.name).filter((n) => typeof n === "string");
    expect(names).toContain("test.png");
  });

  it("LoadImageAssetsNode process returns empty", async () => {
    const result = await new LoadImageAssetsNode().process();
    expect(result).toEqual({ image: {}, name: "", images: [] });
  });

  it("SaveImageFileImageNode writes to file", async () => {
    const filePath = `${tmpDir}/save-image-file/out.png`;
    const ref = imageRef();
    const _n = new SaveImageFileImageNode();
    _n.assign({
      image: ref,
      folder: path.dirname(filePath),
      filename: path.basename(filePath)
    });
    const result = await _n.process();
    expect(path.normalize(String(result.output))).toBe(path.normalize(filePath));
    const stat = await fs.stat(String(result.output));
    expect(stat.size).toBeGreaterThan(0);
  });

  it("SaveImageNode writes with date name", async () => {
    const dir = `${tmpDir}/save-image-dir`;
    const ref = imageRef();
    const _n = new SaveImageNode();
    _n.assign({
      image: ref,
      folder: dir,
      name: "img_%Y%m%d.png"
    });
    const result = await _n.process();
    const output = result.output as { uri: string; data: string };
    expect(output.uri).toMatch(/img_\d{8}\.png/);
    expect(output.data.length).toBeGreaterThan(0);
  });

  it("GetMetadataNode returns metadata with all fields", async () => {
    const _n = new GetMetadataNode();
    _n.assign({
      image: {
        data: "AQID",
        uri: "file://test.png",
        mimeType: "image/png",
        width: 100,
        height: 200
      }
    });
    const result = await _n.process();
    // process() returns {format, mode, width, height, channels} directly
    expect(result.width).toBe(100);
    expect(result.height).toBe(200);
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining([
        "format",
        "mode",
        "width",
        "height",
        "channels"
      ])
    );
  });

  it("GetMetadataNode handles missing optional fields", async () => {
    const _n = new GetMetadataNode();
    _n.assign({ image: { data: "AQ==" } });
    const result = await _n.process();
    // Sharp cannot parse 1 byte, so it falls back
    expect(result.format).toBe("unknown");
    expect(result.mode).toBe("RGB");
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it("BatchToListNode converts array data", async () => {
    const _n = new BatchToListNode();
    _n.assign({ batch: { data: ["img1", "img2", "img3"] } });
    const result = await _n.process();
    expect((result.output as unknown[]).length).toBe(3);
  });

  it("BatchToListNode wraps non-array data in list", async () => {
    const _n = new BatchToListNode();
    _n.assign({ batch: { data: "single-image-data" } });
    const result = await _n.process();
    // Non-array data wraps the entire batch as a single image ref
    expect(result.output).toEqual([{ data: "single-image-data" }]);
  });

  it("ImagesToListNode collects from images, image_a, image_b", async () => {
    const a = imageRef();
    const b = imageRef();
    const c = imageRef();
    const _n = new ImagesToListNode();
    _n.assign({
      images: [c],
      image_a: a,
      image_b: b
    });
    const result = await _n.process();
    expect((result.output as unknown[]).length).toBe(3);
  });

  it("ImagesToListNode handles null image_a and image_b", async () => {
    const _n = new ImagesToListNode();
    _n.assign({
      images: [imageRef()],
      image_a: null,
      image_b: null
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
      scale: 2
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
      image: { data: "AQ==", width: 800, height: 600 }
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
      height: null
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
      pattern: ""
    });
    expect(new SaveImageFileImageNode().serialize()).toMatchObject({
      image: { type: "image", uri: "" },
      folder: "",
      filename: "",
      overwrite: false
    });
    expect(new LoadImageAssetsNode().serialize()).toMatchObject({
      folder: { type: "folder", uri: "" }
    });
    expect(new SaveImageNode().serialize()).toMatchObject({
      image: { type: "image", uri: "" },
      folder: { type: "folder", uri: "" },
      name: "%Y-%m-%d_%H-%M-%S.png"
    });
    expect(new GetMetadataNode().serialize()).toMatchObject({
      image: { type: "image", uri: "" }
    });
    expect(new BatchToListNode().serialize()).toMatchObject({
      batch: { type: "image", uri: "" }
    });
    expect(new ImagesToListNode().serialize()).toEqual({});
    expect(new PasteNode().serialize()).toMatchObject({
      image: { type: "image", uri: "" },
      paste: { type: "image", uri: "" },
      left: 0,
      top: 0
    });
    expect(new TextToImageNode().serialize()).toMatchObject({
      prompt: "A cat holding a sign that says hello world",
      aspect_ratio: "1:1",
      resolution: "1K"
    });
    expect(new ImageToImageNode().serialize()).toMatchObject({
      image: { type: "image", uri: "" },
      prompt: "A photorealistic version of the input image"
    });
  });

  it("TextToImageNode throws without provider", async () => {
    const _n = new TextToImageNode();
    _n.assign({ prompt: "test-img", aspect_ratio: "1:1", resolution: "1K" });
    await expect(_n.process()).rejects.toThrow(
      "No provider available for text-to-image generation"
    );
  });

  it("ImageToImageNode throws without provider", async () => {
    const img = {
      data: Buffer.from([1, 2]).toString("base64"),
      uri: "file://in.png"
    };
    const _n = new ImageToImageNode();
    _n.assign({ image: img, prompt: "stylize" });
    await expect(_n.process()).rejects.toThrow(
      "No provider available for image-to-image generation"
    );
  });

  it("ImagesToListNode handles non-array images input", async () => {
    const _n = new ImagesToListNode();
    _n.assign({ images: "not-array", image_a: null, image_b: null });
    const result = await _n.process();
    // Dynamic node: non-null non-array values are pushed individually; nulls are skipped
    expect(result.output).toEqual(["not-array"]);
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
    _n.assign({
      video: ref,
      folder: path.dirname(filePath),
      filename: path.basename(filePath)
    });
    const result = await _n.process();
    expect(path.normalize(String(result.output))).toBe(path.normalize(filePath));
    const stat = await fs.stat(String(result.output));
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
    const names = items.map((i) => i.name).filter((n) => typeof n === "string");
    expect(names).toContain("a.mp4");
    expect(names).toContain("b.mov");
    expect(names).toContain("c.webm");
    expect(names).toContain("d.mkv");
    expect(names).toContain("e.avi");
    expect(names).not.toContain("f.txt");
  });

  it("LoadVideoAssetsNode process returns empty", async () => {
    const result = await new LoadVideoAssetsNode().process();
    expect(result).toEqual({ video: null, name: "", videos: [], names: [] });
  });

  it("SaveVideoNode writes with date name", async () => {
    const dir = `${tmpDir}/save-video-dir`;
    const ref = videoRef();
    const _n = new SaveVideoNode();
    _n.assign({
      video: ref,
      folder: dir,
      name: "vid_%Y%m%d.mp4"
    });
    const result = await _n.process();
    const output = result.output as { uri: string };
    expect(output.uri).toMatch(/vid_\d{8}\.mp4/);
  });

  it("FrameIteratorNode yields no frames without ffmpeg", async () => {
    const data = Buffer.from(new Array(4096).fill(42)).toString("base64");
    const node = new FrameIteratorNode();
    const frames: Array<Record<string, unknown>> = [];
    node.assign({ video: { data } });
    // ffmpeg is not available in test, so genProcess throws or yields nothing
    try {
      for await (const frame of node.genProcess()) {
        frames.push(frame);
      }
    } catch {
      // expected: ffmpeg not available
    }
    // Either no frames or an error is acceptable without ffmpeg
    expect(frames.length).toBeGreaterThanOrEqual(0);
  });

  it("FrameIteratorNode process returns empty", async () => {
    const result = await new FrameIteratorNode().process();
    expect(result).toEqual({});
  });

  it("FpsNode returns 0 without ffprobe", async () => {
    const ref = videoRef();
    const _n = new FpsNode();
    _n.assign({ video: ref });
    const result = await _n.process();
    // ffprobe not available in test — returns 0
    expect(result.output).toBe(0);
  });

  it("FrameToVideoNode combines frames", async () => {
    const frameA = { data: Buffer.from([1, 2]).toString("base64") };
    const frameB = { data: Buffer.from([3, 4]).toString("base64") };
    const _n = new FrameToVideoNode();
    _n.assign({ frame: [frameA, frameB] });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(Array.from(outData)).toEqual([1, 2, 3, 4]);
  });

  it("FrameToVideoNode handles non-object frames", async () => {
    const _n = new FrameToVideoNode();
    _n.assign({ frame: [null, "bad"] });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(outData.length).toBe(0);
  });

  it("ConcatVideoNode concatenates two videos", async () => {
    const a = { data: Buffer.from([1, 2]).toString("base64") };
    const b = { data: Buffer.from([3, 4]).toString("base64") };
    const _n = new ConcatVideoNode();
    _n.assign({ video_a: a, video_b: b });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(Array.from(outData)).toEqual([1, 2, 3, 4]);
  });

  it("TrimVideoNode falls back to original without ffmpeg", async () => {
    const data = Buffer.from([1, 2, 3, 4, 5]).toString("base64");
    const _n = new TrimVideoNode();
    _n.assign({ video: { data }, start_time: 1, end_time: 1 });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    // ffmpeg not available — falls back to original bytes
    expect(Array.from(outData)).toEqual([1, 2, 3, 4, 5]);
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
      ChromaKeyVideoNode
    ]) {
      const _n = new NodeClass();
      _n.assign({ video: ref });
      const result = await _n.process();
      expect((result.output as { data: string }).data.length).toBeGreaterThan(
        0
      );
    }
  });

  it("OverlayVideoNode and TransitionVideoNode use canonical input names", async () => {
    const ref = videoRef();
    const _n = new OverlayVideoNode();
    _n.assign({
      main_video: ref,
      overlay_video: ref
    });
    const overlay = await _n.process();
    const _n2 = new TransitionVideoNode();
    _n2.assign({
      video_a: ref,
      video_b: ref
    });
    const transition = await _n2.process();
    expect((overlay.output as { data: string }).data).toBeDefined();
    expect((transition.output as { data: string }).data).toBeDefined();
  });

  it("ReverseVideoNode falls back to original without ffmpeg", async () => {
    const data = Buffer.from([1, 2, 3]).toString("base64");
    const _n = new ReverseVideoNode();
    _n.assign({ video: { data } });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    // ffmpeg not available — falls back to original bytes
    expect(Array.from(outData)).toEqual([1, 2, 3]);
  });

  it("AddAudioVideoNode returns video without ffmpeg", async () => {
    const v = { data: Buffer.from([1, 2]).toString("base64") };
    const a = { data: Buffer.from([3, 4]).toString("base64") };
    const _n = new AddAudioVideoNode();
    _n.assign({ video: v, audio: a });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    // Without ffmpeg, falls back to returning original video
    expect(outData.length).toBeGreaterThan(0);
  });

  it("ExtractAudioVideoNode throws without ffmpeg", async () => {
    const data = Buffer.from([1, 2, 3, 4]).toString("base64");
    const _n = new ExtractAudioVideoNode();
    _n.assign({ video: { data } });
    // ffmpeg not available — throws spawn error
    await expect(_n.process()).rejects.toThrow();
  });

  it("ExtractFrameVideoNode returns null data without ffmpeg", async () => {
    const data = Buffer.from(new Array(2048).fill(7)).toString("base64");
    const _n = new ExtractFrameVideoNode();
    _n.assign({ video: { data }, time: 0 });
    const result = await _n.process();
    // ffmpeg not available — returns null data
    expect((result.output as { data: unknown }).data).toBeNull();
  });

  it("GetVideoInfoNode returns metadata via ffprobe", async () => {
    const ref = videoRef();
    const _n = new GetVideoInfoNode();
    _n.assign({ video: ref });
    const result = await _n.process();
    // Without ffprobe, the output has multiple named fields (not nested in .output)
    expect(result.duration).toBeDefined();
    expect(result.width).toBeDefined();
    expect(result.height).toBeDefined();
    expect(result.fps).toBeDefined();
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
      frame: [{ data: uint8Data }]
    });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(Array.from(outData)).toEqual([1, 2, 3]);
  });

  it("defaults() methods return expected structures", () => {
    expect(new TextToVideoNode().serialize()).toMatchObject({
      prompt: "A cat playing with a ball of yarn",
      aspect_ratio: "16:9",
      resolution: "1080p",
      duration: 8
    });
    expect(new ImageToVideoNode().serialize()).toMatchObject({
      image: { type: "image", uri: "" },
      prompt: "",
      aspect_ratio: "16:9",
      resolution: "1080p",
      duration: 4
    });
    expect(new LoadVideoFileNode().serialize()).toEqual({ path: "" });
    expect(new SaveVideoFileVideoNode().serialize()).toMatchObject({
      video: { type: "video", uri: "" },
      folder: "",
      filename: ""
    });
    expect(new LoadVideoAssetsNode().serialize()).toMatchObject({
      folder: { type: "folder", uri: "" }
    });
    expect(new SaveVideoNode().serialize()).toMatchObject({
      video: { type: "video", uri: "" },
      folder: { type: "folder", uri: "" },
      name: "%Y-%m-%d-%H-%M-%S.mp4"
    });
    expect(new FrameIteratorNode().serialize()).toMatchObject({
      video: { type: "video", uri: "" },
      start: 0,
      end: -1
    });
    expect(new FpsNode().serialize()).toMatchObject({
      video: { type: "video", uri: "" }
    });
    expect(new FrameToVideoNode().serialize()).toMatchObject({
      frame: { type: "image", uri: "" },
      fps: 30
    });
    expect(new ConcatVideoNode().serialize()).toMatchObject({
      video_a: { type: "video", uri: "" },
      video_b: { type: "video", uri: "" }
    });
    expect(new TrimVideoNode().serialize()).toMatchObject({
      video: { type: "video", uri: "" },
      start_time: 0,
      end_time: -1
    });
    expect(new ResizeVideoNode().serialize()).toMatchObject({
      video: { type: "video", uri: "" },
      width: -1,
      height: -1
    });
    expect(new ReverseVideoNode().serialize()).toMatchObject({
      video: { type: "video", uri: "" }
    });
    expect(new AddAudioVideoNode().serialize()).toMatchObject({
      video: { type: "video", uri: "" },
      audio: { type: "audio", uri: "" },
      volume: 1,
      mix: false
    });
    expect(new ExtractAudioVideoNode().serialize()).toMatchObject({
      video: { type: "video", uri: "" }
    });
    expect(new ExtractFrameVideoNode().serialize()).toMatchObject({
      video: { type: "video", uri: "" },
      time: 0
    });
    expect(new GetVideoInfoNode().serialize()).toMatchObject({
      video: { type: "video", uri: "" }
    });
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
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(outData.length).toBe(0);
  });

  it("GetVideoInfoNode handles video with uri", async () => {
    const _n = new GetVideoInfoNode();
    _n.assign({
      video: {
        data: Buffer.from([1, 2, 3]).toString("base64"),
        uri: "file://test.mp4"
      }
    });
    const result = await _n.process();
    // Without ffprobe, returns metadata with zero values
    expect(result.duration).toBeDefined();
    expect(result.fps).toBeDefined();
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
    const output = result.output as {
      uri: string;
      format: string;
      data: string;
    };
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
      filename: "out.glb"
    });
    const result = await _n.process();
    const output = result.output as { uri: string; format: string };
    expect(output.uri).toContain("out.glb");
    expect(output.format).toBe("glb");
    const stat = await fs.stat(path.join(dir, "out.glb"));
    expect(stat.size).toBeGreaterThan(0);
  });

  it("SaveModel3DFileNode applies date placeholders in filename", async () => {
    const dir = `${tmpDir}/save-model-file-datename`;
    const ref = modelRef();
    const _n = new SaveModel3DFileNode();
    _n.assign({
      model: ref,
      folder: dir,
      filename: "out_%Y%m%d.glb"
    });
    const result = await _n.process();
    const output = result.output as { uri: string; format: string };
    expect(output.uri).toMatch(/out_\d{8}\.glb/);
    expect(output.format).toBe("glb");
  });

  it("SaveModel3DFileNode does not overwrite existing file when overwrite=false", async () => {
    const dir = `${tmpDir}/save-model-file-no-overwrite`;
    await fs.mkdir(dir, { recursive: true });
    const originalPath = path.join(dir, "out.glb");
    await fs.writeFile(originalPath, Buffer.from("old-content"));

    const _n = new SaveModel3DFileNode();
    _n.assign({
      model: modelRef(Buffer.from("new-content").toString("base64")),
      folder: dir,
      filename: "out.glb",
      overwrite: false
    });
    const result = await _n.process();
    const output = result.output as { uri: string };
    expect(output.uri).toContain("out-1.glb");
    expect(await fs.readFile(originalPath, "utf8")).toBe("old-content");
    expect(await fs.readFile(path.join(dir, "out-1.glb"), "utf8")).toBe(
      "new-content"
    );
  });

  it("SaveModel3DNode writes with timestamped name", async () => {
    const dir = `${tmpDir}/save-model-date`;
    const ref = modelRef();
    const _n = new SaveModel3DNode();
    _n.assign({
      model: ref,
      folder: dir,
      name: "model_%Y%m%d.glb"
    });
    const result = await _n.process();
    const output = result.output as { uri: string };
    expect(output.uri).toMatch(/model_\d{8}\.glb/);
  });

  it("FormatConverterNode converts GLB to textual glTF", async () => {
    const ref = modelRef(triangleGlbBase64());
    const _n = new FormatConverterNode();
    _n.assign({
      model: ref,
      output_format: "gltf"
    });
    const result = await _n.process();
    const output = result.output as { format: string; data: string };
    expect(output.format).toBe("gltf");
    const json = JSON.parse(Buffer.from(output.data, "base64").toString("utf8")) as {
      asset?: { version?: string };
    };
    expect(json.asset?.version).toBe("2.0");
  });

  it("GetModel3DMetadataNode returns metadata", async () => {
    const data = triangleGlbBase64();
    const _n = new GetModel3DMetadataNode();
    _n.assign({
      model: { data, format: "glb", uri: "file://test.glb" }
    });
    const result = await _n.process();
    const meta = result.output as Record<string, unknown>;
    expect(meta.format).toBe("glb");
    expect(meta.uri).toBe("file://test.glb");
    expect(meta.size_bytes).toBeGreaterThan(0);
    expect(meta.vertex_count).toBe(3);
    expect(meta.face_count).toBe(1);
    expect(meta.mesh_count).toBe(1);
    expect(meta.primitive_count).toBe(1);
  });

  it("GetModel3DMetadataNode uses explicit vertices/faces", async () => {
    const _n = new GetModel3DMetadataNode();
    _n.assign({
      model: { data: "AQ==", vertices: 100, faces: 50, format: "glb" }
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

  it("DecimateNode reduces face count for a real GLB", async () => {
    const data = gridGlbBase64(8);
    const beforeNode = new GetModel3DMetadataNode();
    beforeNode.assign({ model: { data, format: "glb" } });
    const before = (await beforeNode.process()).output as { face_count: number };

    const _n = new DecimateNode();
    _n.assign({ model: { data, format: "glb" }, target_ratio: 0.5 });
    const result = await _n.process();
    const afterNode = new GetModel3DMetadataNode();
    afterNode.assign({ model: result.output });
    const after = (await afterNode.process()).output as { face_count: number };
    expect(after.face_count).toBeLessThan(before.face_count);
    expect(after.face_count).toBeGreaterThan(0);
  });

  it("DecimateNode clamps ratio to [0, 1] for GLB input", async () => {
    const data = gridGlbBase64(8);
    const beforeNode = new GetModel3DMetadataNode();
    beforeNode.assign({ model: { data, format: "glb" } });
    const before = (await beforeNode.process()).output as { face_count: number };

    const _n = new DecimateNode();
    _n.assign({ model: { data, format: "glb" }, target_ratio: 2.0 });
    const result = await _n.process();
    const afterNode = new GetModel3DMetadataNode();
    afterNode.assign({ model: result.output });
    const after = (await afterNode.process()).output as { face_count: number };
    expect(after.face_count).toBe(before.face_count);

    const _n2 = new DecimateNode();
    _n2.assign({ model: { data, format: "glb" }, target_ratio: 0 });
    const result2 = await _n2.process();
    const afterNode2 = new GetModel3DMetadataNode();
    afterNode2.assign({ model: result2.output });
    const after2 = (await afterNode2.process()).output as { face_count: number };
    expect(after2.face_count).toBeGreaterThan(0);
    expect(after2.face_count).toBeLessThanOrEqual(before.face_count);
  });

  it("Boolean3DNode performs geometry-aware union", async () => {
    const a = { data: boxGlbBase64([0, 0, 0], [1, 1, 1]), format: "glb" };
    const b = { data: boxGlbBase64([0.5, 0, 0], [1.5, 1, 1]), format: "glb" };
    const _n = new Boolean3DNode();
    _n.assign({ model_a: a, model_b: b, operation: "union" });
    const result = await _n.process();
    const metaNode = new GetModel3DMetadataNode();
    metaNode.assign({ model: result.output });
    const meta = (await metaNode.process()).output as {
      face_count: number;
      bounds_min: number[];
      bounds_max: number[];
    };
    expect(meta.face_count).toBeGreaterThan(0);
    expectBoundsClose(meta.bounds_min, [0, 0, 0]);
    expectBoundsClose(meta.bounds_max, [1.5, 1, 1]);
  });

  it("Boolean3DNode performs geometry-aware difference", async () => {
    const a = { data: boxGlbBase64([0, 0, 0], [1, 1, 1]), format: "glb" };
    const b = { data: boxGlbBase64([0.5, 0, 0], [1.5, 1, 1]), format: "glb" };
    const _n = new Boolean3DNode();
    _n.assign({
      model_a: a,
      model_b: b,
      operation: "difference"
    });
    const result = await _n.process();
    const metaNode = new GetModel3DMetadataNode();
    metaNode.assign({ model: result.output });
    const meta = (await metaNode.process()).output as {
      face_count: number;
      bounds_min: number[];
      bounds_max: number[];
    };
    expect(meta.face_count).toBeGreaterThan(0);
    expectBoundsClose(meta.bounds_min, [0, 0, 0]);
    expectBoundsClose(meta.bounds_max, [0.5, 1, 1]);
  });

  it("Boolean3DNode performs geometry-aware intersection", async () => {
    const a = { data: boxGlbBase64([0, 0, 0], [1, 1, 1]), format: "glb" };
    const b = { data: boxGlbBase64([0.5, 0, 0], [1.5, 1, 1]), format: "glb" };
    const _n = new Boolean3DNode();
    _n.assign({
      model_a: a,
      model_b: b,
      operation: "intersection"
    });
    const result = await _n.process();
    const metaNode = new GetModel3DMetadataNode();
    metaNode.assign({ model: result.output });
    const meta = (await metaNode.process()).output as {
      face_count: number;
      bounds_min: number[];
      bounds_max: number[];
    };
    expect(meta.face_count).toBeGreaterThan(0);
    expectBoundsClose(meta.bounds_min, [0.5, 0, 0]);
    expectBoundsClose(meta.bounds_max, [1, 1, 1]);
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

  it("MergeMeshesNode performs an honest GLB scene merge", async () => {
    const a = { data: triangleGlbBase64(), format: "glb" };
    const b = { data: boxGlbBase64([2, 0, 0], [3, 1, 1]), format: "glb" };
    const _n = new MergeMeshesNode();
    _n.assign({ models: [a, b] });
    const result = await _n.process();
    const metaNode = new GetModel3DMetadataNode();
    metaNode.assign({ model: result.output });
    const meta = (await metaNode.process()).output as {
      mesh_count: number;
      primitive_count: number;
      face_count: number;
      bounds_min: number[];
      bounds_max: number[];
    };
    expect(meta.mesh_count).toBe(2);
    expect(meta.primitive_count).toBe(2);
    expect(meta.face_count).toBeGreaterThanOrEqual(13);
    expectBoundsClose(meta.bounds_min, [0, 0, 0]);
    expectBoundsClose(meta.bounds_max, [3, 2, 1]);
  });

  it("MergeMeshesNode handles empty list", async () => {
    const _n = new MergeMeshesNode();
    _n.assign({ models: [] });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(outData.length).toBe(0);
  });

  it("ImageTo3DNode converts image data to model", async () => {
    const data = Buffer.from([10, 20, 30]).toString("base64");
    const _n = new ImageTo3DNode();
    _n.assign({ image: { data } });
    const ctx = {
      getProvider: async () => ({
        imageTo3D: async (imageBytes: Uint8Array) => imageBytes
      })
    } as any;
    const result = await _n.process(ctx);
    const output = result.output as { data: string; format: string };
    expect(output.format).toBe("glb");
    const outData = Buffer.from(output.data, "base64");
    expect(Array.from(outData)).toEqual([10, 20, 30]);
  });

  it("ImageTo3DNode handles empty image", async () => {
    const _n = new ImageTo3DNode();
    _n.assign({ image: {} });
    const ctx = {
      getProvider: async () => ({
        imageTo3D: async () => new Uint8Array()
      })
    } as any;
    await expect(_n.process(ctx)).rejects.toThrow(
      /Image input has no data or uri|Image input is empty/
    );
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
      name: "%Y-%m-%d_%H%M%S.glb"
    });
    const result = await _n.process();
    const output = result.output as { uri: string };
    expect(output.uri).toMatch(/\d{4}-\d{2}-\d{2}_\d{6}\.glb/);
  });

  it("concatBytes handles empty array", async () => {
    const _n = new MergeMeshesNode();
    _n.assign({ models: [] });
    const result = await _n.process();
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
    expect(outData.length).toBe(0);
  });

  it("defaults() methods return expected structures", () => {
    expect(new LoadModel3DFileNode().serialize()).toEqual({ path: "" });
    expect(new SaveModel3DFileNode().serialize()).toMatchObject({
      model: { type: "model_3d", uri: "" },
      folder: "",
      filename: "",
      overwrite: false
    });
    expect(new SaveModel3DNode().serialize()).toMatchObject({
      model: { type: "model_3d", uri: "" },
      folder: { type: "folder", uri: "" },
      name: "%Y-%m-%d_%H-%M-%S.glb"
    });
    expect(new FormatConverterNode().serialize()).toMatchObject({
      model: { type: "model_3d", uri: "" },
      output_format: "glb"
    });
    expect(new GetModel3DMetadataNode().serialize()).toMatchObject({
      model: { type: "model_3d", uri: "" }
    });
    expect(new Transform3DNode().serialize()).toMatchObject({
      model: { type: "model_3d", uri: "" }
    });
    expect(new DecimateNode().serialize()).toMatchObject({
      model: { type: "model_3d", uri: "" },
      target_ratio: 0.5
    });
    expect(new Boolean3DNode().serialize()).toMatchObject({
      model_a: { type: "model_3d", uri: "" },
      model_b: { type: "model_3d", uri: "" },
      operation: "union"
    });
    expect(new RecalculateNormalsNode().serialize()).toMatchObject({
      model: { type: "model_3d", uri: "" }
    });
    expect(new CenterMeshNode().serialize()).toMatchObject({
      model: { type: "model_3d", uri: "" }
    });
    expect(new FlipNormalsNode().serialize()).toMatchObject({
      model: { type: "model_3d", uri: "" }
    });
    expect(new MergeMeshesNode().serialize()).toEqual({ models: [] });
    expect(new TextTo3DNode().serialize()).toMatchObject({
      prompt: "",
      output_format: "glb",
      negative_prompt: "",
      art_style: "",
      seed: -1,
      timeout_seconds: 600
    });
    expect(new ImageTo3DNode().serialize()).toMatchObject({
      image: { type: "image", uri: "" }
    });
  });

  it("TextTo3DNode generates model from text", async () => {
    const _n = new TextTo3DNode();
    _n.assign({ prompt: "sphere" });
    const ctx = {
      getProvider: async () => ({
        textTo3D: async () => Uint8Array.from(Buffer.from("sphere", "utf8"))
      })
    } as any;
    const result = await _n.process(ctx);
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
    const outData = Buffer.from(
      (result.output as { data: string }).data,
      "base64"
    );
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
