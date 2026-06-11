import { describe, it, expect } from "vitest";
import {
  f32leToFloat32,
  float32ToF32le,
  makeSignalChunk,
  readSignalChunk,
  SampleFifo,
  float32ToPcm16
} from "@nodetool-ai/audio-nodes";

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

describe("f32le codec", () => {
  it("round-trips bit-exact, including values beyond [-1, 1] and negatives", () => {
    const samples = new Float32Array([0, 1, -1, 3.75, -2.5, 1e-7, 12345.678]);
    const back = f32leToFloat32(float32ToF32le(samples));
    expect(back).toEqual(samples);
  });
});

describe("readSignalChunk", () => {
  it("decodes f32le chunks built by makeSignalChunk", () => {
    const samples = new Float32Array([0.5, -0.25, 2.0]);
    const chunk = makeSignalChunk(samples, 24000, 1, false, "f32le");
    const parsed = readSignalChunk(chunk);
    expect(parsed).not.toBeNull();
    expect(parsed!.samples).toEqual(samples);
    expect(parsed!.sampleRate).toBe(24000);
    expect(parsed!.channels).toBe(1);
    expect(parsed!.done).toBe(false);
  });

  it("decodes legacy pcm16le chunks with absent encoding metadata", () => {
    const samples = new Float32Array([0.5, -0.5, 1, -1]);
    const legacy = {
      type: "chunk",
      content: bytesToB64(float32ToPcm16(samples)),
      done: false,
      content_type: "audio",
      content_metadata: { sample_rate: 16000, channels: 1 }
    };
    const parsed = readSignalChunk(legacy);
    expect(parsed).not.toBeNull();
    expect(parsed!.sampleRate).toBe(16000);
    for (let i = 0; i < samples.length; i++) {
      expect(parsed!.samples[i]).toBeCloseTo(samples[i], 4);
    }
  });

  it("rejects non-audio chunks and non-objects", () => {
    expect(
      readSignalChunk({ type: "chunk", content: "x", content_type: "text" })
    ).toBeNull();
    expect(readSignalChunk("hello")).toBeNull();
    expect(readSignalChunk(null)).toBeNull();
  });

  it("pcm16 clamps values beyond [-1, 1] while f32le preserves them", () => {
    const samples = new Float32Array([2.5, -3]);
    const viaPcm = readSignalChunk(
      makeSignalChunk(samples, 24000, 1, false, "pcm16le")
    )!;
    expect(viaPcm.samples[0]).toBeCloseTo(1, 3);
    expect(viaPcm.samples[1]).toBeCloseTo(-1, 3);
    const viaF32 = readSignalChunk(
      makeSignalChunk(samples, 24000, 1, false, "f32le")
    )!;
    expect(viaF32.samples[0]).toBe(2.5);
    expect(viaF32.samples[1]).toBe(-3);
  });

  it("reads base64 content via the standard decoder", () => {
    const samples = new Float32Array([1, 2, 3]);
    const chunk = makeSignalChunk(samples, 24000, 1, false, "f32le") as {
      content: string;
    };
    expect(f32leToFloat32(b64ToBytes(chunk.content))).toEqual(samples);
  });
});

describe("SampleFifo", () => {
  it("pulls across segment boundaries", () => {
    const fifo = new SampleFifo();
    fifo.push(new Float32Array([1, 2]));
    fifo.push(new Float32Array([3, 4, 5]));
    expect(fifo.available).toBe(5);
    expect([...fifo.pull(3, "hold")]).toEqual([1, 2, 3]);
    expect(fifo.available).toBe(2);
    expect([...fifo.pull(2, "hold")]).toEqual([4, 5]);
  });

  it("holds the last value on underrun, starting from 0", () => {
    const fifo = new SampleFifo();
    expect([...fifo.pull(2, "hold")]).toEqual([0, 0]);
    fifo.push(new Float32Array([7]));
    expect([...fifo.pull(3, "hold")]).toEqual([7, 7, 7]);
    expect(fifo.last).toBe(7);
  });

  it("zero-fills on underrun in zero mode", () => {
    const fifo = new SampleFifo();
    fifo.push(new Float32Array([5]));
    expect([...fifo.pull(3, "zero")]).toEqual([5, 0, 0]);
  });
});
