/**
 * Pins the decode contract for the sample/byte transforms (commit e9fafbb7's
 * intent): Normalize/Trim/Slice/Fade/Concat/Mixer must route their input
 * through `decodeAudioToWav` — they process decoded PCM, and undecodable
 * input throws rather than silently passing the bytes through unprocessed.
 */
import { describe, it, expect } from "vitest";
import {
  AudioMixerNode,
  ConcatAudioNode,
  ConcatAudioListNode,
  FadeInAudioNode,
  FadeOutAudioNode,
  NormalizeAudioNode,
  SliceAudioNode,
  TrimAudioNode,
  encodeWav,
  parseWavBytes,
  toBytes
} from "@nodetool-ai/audio-nodes";

const SAMPLE_RATE = 8000;
const AMPLITUDE = 0.5;

/** Build an inline AudioRef carrying a 1 s mono constant-amplitude WAV. */
function wavRef(amplitude = AMPLITUDE) {
  const frames = SAMPLE_RATE;
  const samples = new Float32Array(frames).fill(amplitude);
  return { type: "audio", uri: "", data: encodeWav(samples, SAMPLE_RATE, 1) };
}

/**
 * Corrupt, non-WAV bytes that WebAudio's `decodeAudioData` rejects — stands in
 * for a stored `.mp3`/`.flac` that cannot be decoded. The old transforms
 * silently passed these through unprocessed; the fixed ones must throw.
 */
function undecodableRef() {
  const bytes = new Uint8Array(256);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 131 + 7) & 0xff;
  return { type: "audio", uri: "", data: bytes };
}

function outputWav(result: Record<string, unknown>) {
  const ref = result.output as { data?: Uint8Array | string };
  return parseWavBytes(toBytes(ref?.data));
}

describe("AUDIO_NODES transforms decode their input", () => {
  it("Normalize processes decoded WAV and boosts the peak to full scale", async () => {
    const out = outputWav(await new NormalizeAudioNode({ audio: wavRef(0.25) }).process());
    expect(out).not.toBeNull();
    let peak = 0;
    for (const s of out!.samples) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeGreaterThan(0.9);
  });

  it("Trim returns the requested decoded slice", async () => {
    const out = outputWav(
      await new TrimAudioNode({ audio: wavRef(), start: 0, end: 0.5 }).process()
    );
    expect(out).not.toBeNull();
    expect(out!.sampleRate).toBe(SAMPLE_RATE);
    expect(out!.samples.length).toBe(SAMPLE_RATE / 2);
  });

  it("Slice returns the requested decoded section", async () => {
    const out = outputWav(
      await new SliceAudioNode({ audio: wavRef(), start: 0.25, end: 0.75 }).process()
    );
    expect(out).not.toBeNull();
    expect(out!.samples.length).toBe(SAMPLE_RATE / 2);
  });

  it("FadeIn attenuates the start of decoded WAV", async () => {
    const out = outputWav(
      await new FadeInAudioNode({ audio: wavRef(), duration: 0.1 }).process()
    );
    expect(out).not.toBeNull();
    // First sample is silenced by the fade; the steady region keeps full level.
    expect(Math.abs(out!.samples[0])).toBeLessThan(0.01);
    expect(Math.abs(out!.samples[out!.samples.length - 1])).toBeCloseTo(AMPLITUDE, 1);
  });

  it("FadeOut attenuates the end of decoded WAV", async () => {
    const out = outputWav(
      await new FadeOutAudioNode({ audio: wavRef(), duration: 0.1 }).process()
    );
    expect(out).not.toBeNull();
    expect(Math.abs(out!.samples[0])).toBeCloseTo(AMPLITUDE, 1);
    // Last sample is heavily attenuated relative to the un-faded start.
    expect(Math.abs(out!.samples[out!.samples.length - 1])).toBeLessThan(0.01);
  });

  it("Concat joins decoded WAV parts in sample space", async () => {
    const out = outputWav(
      await new ConcatAudioNode({ a: wavRef(), b: wavRef() }).process()
    );
    expect(out).not.toBeNull();
    expect(out!.samples.length).toBe(SAMPLE_RATE * 2);
  });

  it("ConcatList joins decoded WAV parts", async () => {
    const out = outputWav(
      await new ConcatAudioListNode({ audio_files: [wavRef(), wavRef()] }).process()
    );
    expect(out).not.toBeNull();
    expect(out!.samples.length).toBe(SAMPLE_RATE * 2);
  });

  it("Mixer mixes decoded WAV tracks", async () => {
    const out = outputWav(
      await new AudioMixerNode({ a: wavRef(), b: wavRef() }).process()
    );
    expect(out).not.toBeNull();
    expect(out!.samples.length).toBe(SAMPLE_RATE);
  });
});

describe("undecodable mp3 input throws instead of passing through", () => {
  it("Normalize throws", async () => {
    await expect(
      new NormalizeAudioNode({ audio: undecodableRef() }).process()
    ).rejects.toThrow();
  });

  it("Trim throws", async () => {
    await expect(
      new TrimAudioNode({ audio: undecodableRef() }).process()
    ).rejects.toThrow();
  });

  it("Slice throws", async () => {
    await expect(
      new SliceAudioNode({ audio: undecodableRef() }).process()
    ).rejects.toThrow();
  });

  it("FadeIn throws", async () => {
    await expect(
      new FadeInAudioNode({ audio: undecodableRef() }).process()
    ).rejects.toThrow();
  });

  it("Concat throws", async () => {
    await expect(
      new ConcatAudioNode({ a: undecodableRef() }).process()
    ).rejects.toThrow();
  });

  it("Mixer throws", async () => {
    await expect(
      new AudioMixerNode({ a: undecodableRef() }).process()
    ).rejects.toThrow();
  });
});
