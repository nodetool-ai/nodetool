import { describe, it, expect } from "vitest";
import { encodePcm16Wav, parseWavBytes } from "../src/lib/audio-wav.js";

describe("encodePcm16Wav", () => {
  it("wraps PCM bytes in a parseable RIFF/WAVE container", () => {
    const samples = new Int16Array([0, 1000, -1000, 32767, -32768, 0]);
    const pcm = new Uint8Array(samples.buffer);
    const wav = encodePcm16Wav(pcm, 24000, 1);

    // RIFF header
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");

    const decoded = parseWavBytes(wav);
    expect(decoded).not.toBeNull();
    if (!decoded) throw new Error("expected wav");
    expect(decoded?.sampleRate).toBe(24000);
    expect(decoded?.numChannels).toBe(1);
    expect(decoded?.samples.length).toBe(samples.length);
    // Sanity-check a couple of round-tripped values (Float32 ≈ Int16/32767).
    expect(decoded!.samples[3]).toBeCloseTo(1, 3);
    expect(decoded!.samples[4]).toBeCloseTo(-1, 3);
  });

  it("uses the supplied sample rate in the header", () => {
    const wav = encodePcm16Wav(new Uint8Array(0), 32000, 1);
    expect(parseWavBytes(wav)?.sampleRate).toBe(32000);
  });
});
