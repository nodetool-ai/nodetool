import { expect, it } from "vitest";
import { encodeWav } from "@nodetool-ai/transformers-js-nodes";
import {
  decodeToPcm16,
  pcm16Base64ToSamples,
  samplesToPcm16
} from "../src/audio.js";

it("decodes 44.1 kHz stereo WAV to exact mono 16 kHz PCM16", async () => {
  const wav = encodeWav(new Float32Array(44100 * 2).fill(0.5), 44100, 2);
  const pcm = await decodeToPcm16(wav);
  expect(pcm.byteLength).toBe(16000 * 2);
  expect(new Int16Array(pcm)[0]).toBeCloseTo(16383, -1);
});
it("clamps samples and returns an independent little-endian buffer", () => {
  const samples = new Float32Array([-2, -1, 0, 1, 2]);
  expect([...new Int16Array(samplesToPcm16(samples))]).toEqual([
    -32767, -32767, 0, 32767, 32767
  ]);
});
it("resamples streaming 24 kHz PCM16 and rejects malformed samples", () => {
  const bytes = Buffer.alloc(24000 * 2);
  bytes.writeInt16LE(-32768);
  const samples = pcm16Base64ToSamples(bytes.toString("base64"), 24000);
  expect(samples.length).toBe(16000);
  expect(samples[0]).toBe(-1);
  expect(() => pcm16Base64ToSamples("AA==", 16000)).toThrow("complete samples");
  expect(() => pcm16Base64ToSamples("AAA=", 0)).toThrow("sample rate");
});
it("rejects empty audio", async () => {
  await expect(decodeToPcm16(new Uint8Array())).rejects.toThrow(
    "Audio input is empty"
  );
  expect(() => pcm16Base64ToSamples("", 16000)).toThrow("Audio input is empty");
});
