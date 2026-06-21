/**
 * Auto makeup gain for the dynamics processors:
 *  - Compress: when on (the default), the level lost to gain reduction is
 *    compensated, so a compressed signal stays roughly as loud as it went in;
 *    when off, compression audibly lowers the level.
 *  - Limiter: when on (the default), limited peaks are normalized up to
 *    0 dBFS (maximizer behaviour); when off, peaks sit at the ceiling.
 */
import { describe, it, expect } from "vitest";
import {
  CompressNode,
  LimiterNode,
  encodeWav,
  parseWavBytes,
  toBytes
} from "@nodetool-ai/audio-nodes";

const SAMPLE_RATE = 8000;

/** Inline mono AudioRef of a constant-amplitude tone (1 s). */
function wavRef(amplitude: number) {
  const frames = SAMPLE_RATE;
  const samples = new Float32Array(frames).fill(amplitude);
  return { type: "audio", uri: "", data: encodeWav(samples, SAMPLE_RATE, 1) };
}

function outSamples(result: Record<string, unknown>): Float32Array {
  const ref = result.output as { data?: Uint8Array | string };
  const wav = parseWavBytes(toBytes(ref?.data));
  if (!wav) throw new Error("expected WAV output");
  return wav.samples;
}

/** Peak magnitude over the settled tail (skips the attack/release ramp). */
function tailPeak(samples: Float32Array, skip = SAMPLE_RATE / 2): number {
  let peak = 0;
  for (let i = skip; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  return peak;
}

describe("Compress auto gain", () => {
  it("defaults on and boosts the compressed level back up", async () => {
    const input = wavRef(0.5);
    const withGain = tailPeak(
      outSamples(await new CompressNode({ audio: input }).process())
    );
    const withoutGain = tailPeak(
      outSamples(
        await new CompressNode({ audio: input, auto_gain: false }).process()
      )
    );

    // Without makeup, compression pulls a -6 dBFS tone well below its input
    // level; makeup (the default) lifts it back up by ~7.5 dB.
    expect(withoutGain).toBeLessThan(0.25);
    expect(withGain).toBeGreaterThan(withoutGain * 2);
    expect(withGain).toBeGreaterThan(0.3);
    expect(withGain).toBeLessThanOrEqual(1.0001);
  });
});

describe("Limiter auto gain", () => {
  it("defaults on and normalizes limited peaks toward 0 dBFS", async () => {
    const input = wavRef(0.9);
    const withGain = tailPeak(
      outSamples(await new LimiterNode({ audio: input }).process())
    );
    const withoutGain = tailPeak(
      outSamples(
        await new LimiterNode({ audio: input, auto_gain: false }).process()
      )
    );

    // Ceiling is -2 dBFS (≈0.794). Without makeup the peak stays there; with
    // makeup (the default) it is lifted up to full scale without clipping.
    expect(withoutGain).toBeLessThan(0.85);
    expect(withGain).toBeGreaterThan(0.95);
    expect(withGain).toBeLessThanOrEqual(1.0001);
  });
});
