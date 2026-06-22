import { describe, it, expect } from "vitest";
import {
  ConcatAudioNode,
  audioRefFromBytes,
  encodeWav,
  parseWavBytes,
  toBytes
} from "@nodetool-ai/audio-nodes";

/** Build an audio ref wrapping a mono 24kHz WAV with `n` silent samples. */
function wavRef(n: number) {
  return audioRefFromBytes(encodeWav(new Float32Array(n), 24000, 1));
}

/** Decode a concat result ref back to its WAV sample count. */
function sampleCount(result: Record<string, unknown>): number {
  const out = result.output as { data?: string };
  const wav = parseWavBytes(toBytes(out.data ?? ""));
  if (!wav) throw new Error("expected a WAV output");
  return wav.samples.length;
}

describe("ConcatAudioNode — flattens list inputs", () => {
  it("concatenates separate dynamic inputs (back-compat)", async () => {
    const node = new ConcatAudioNode();
    node.setDynamic("a", wavRef(4));
    node.setDynamic("b", wavRef(6));
    expect(sampleCount(await node.process())).toBe(10);
  });

  it("flattens a list wired into a single input", async () => {
    const node = new ConcatAudioNode();
    node.setDynamic("clips", [wavRef(4), wavRef(6)]);
    expect(sampleCount(await node.process())).toBe(10);
  });

  it("mixes a single-audio input with a list input in order", async () => {
    const node = new ConcatAudioNode();
    node.setDynamic("intro", wavRef(2));
    node.setDynamic("clips", [wavRef(4), wavRef(6)]);
    expect(sampleCount(await node.process())).toBe(12);
  });
});
