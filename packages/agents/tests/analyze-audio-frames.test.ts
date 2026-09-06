/**
 * `analyzeAudioFrames` — the tool-independent frame-level envelope T10
 * carved out of `analysis.ts`.
 *
 * Most cases build a `DecodedAudio` directly rather than encoding and
 * decoding a real file: the function's contract starts at "here is PCM",
 * and constructing it lets a test pin an exact sample index instead of
 * chasing whatever a codec's frame boundaries land on. One test still goes
 * through a real WAV, reusing the encoder `capabilities-analysis.test.ts`
 * already relies on, so the Uint8Array-input decode path (and the decode
 * cap it applies) is exercised for real.
 */

import { describe, expect, it } from "vitest";
import type { DecodedAudio } from "../src/analysis/media-decode.js";
import { analyzeAudioFrames } from "../src/capabilities/analysis.js";

const SAMPLE_RATE = 1000;

/** A `DecodedAudio` over `samples`, fully decoded unless overridden. */
function decoded(
  samples: Float32Array,
  overrides: Partial<DecodedAudio> = {}
): DecodedAudio {
  const duration = samples.length / SAMPLE_RATE;
  return {
    samples,
    sampleRate: SAMPLE_RATE,
    channels: 1,
    duration,
    trackDuration: duration,
    codec: "pcm_f32le",
    truncated: false,
    ...overrides
  };
}

/** `count` seconds of silence at `SAMPLE_RATE`, with a burst inserted. */
function withBurst(
  totalSamples: number,
  burstStart: number,
  burstLength: number,
  amplitude = 0.9
): Float32Array {
  const samples = new Float32Array(totalSamples);
  for (let i = burstStart; i < burstStart + burstLength && i < totalSamples; i += 1) {
    samples[i] = amplitude;
  }
  return samples;
}

/** A 16-bit PCM WAV of the given samples, for the one real-decode test. */
function wav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      bytes[offset + index] = text.charCodeAt(index);
    }
  };
  ascii(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(44 + index * 2, Math.round(value * 0x7fff), true);
  }
  return bytes;
}

/** The frame with the highest RMS in an envelope's undecimated series. */
function loudestFrame(
  frames: readonly { timeMs: number; rms: number }[]
): { timeMs: number; rms: number } {
  return frames.reduce((best, frame) => (frame.rms > best.rms ? frame : best));
}

describe("analyzeAudioFrames", () => {
  it("places the frame peak at a synthesized burst's time, within one hop", async () => {
    // 3 s of silence at 1 kHz with a 50-sample burst starting at t = 1.0 s.
    const audio = decoded(withBurst(3000, 1000, 50));
    const result = await analyzeAudioFrames(audio, { frameMs: 20 });

    expect(result.frameMs).toBe(20);
    const peak = loudestFrame(result.frames);
    expect(Math.abs(peak.timeMs - 1000)).toBeLessThanOrEqual(20);
    expect(peak.rms).toBeGreaterThan(0.5);
    expect(result.truncated).toBeNull();
  });

  it("restricts frames to [fromMs, toMs] and reports the peak in absolute source time", async () => {
    // Two bursts, at t = 1.0 s and t = 3.0 s, over a 5 s clip.
    const samples = withBurst(5000, 1000, 50);
    for (let i = 3000; i < 3050; i += 1) samples[i] = 0.9;
    const audio = decoded(samples);

    // Ask only about the window around the second burst.
    const result = await analyzeAudioFrames(audio, {
      fromMs: 2000,
      toMs: 4000,
      frameMs: 20
    });

    expect(result.frames.length).toBeGreaterThan(0);
    for (const frame of result.frames) {
      expect(frame.timeMs).toBeGreaterThanOrEqual(2000);
      expect(frame.timeMs).toBeLessThanOrEqual(4000);
    }
    const peak = loudestFrame(result.frames);
    // Absolute source time near 3000 ms — not 1000 ms (the offset into the
    // window) and not the first burst, which the window excludes.
    expect(Math.abs(peak.timeMs - 3000)).toBeLessThanOrEqual(20);
    expect(result.truncated).toBeNull();
  });

  it("reports truncated when the requested window reaches past the decode cap", async () => {
    // The decode only got 2 s in (as if a 10 s track hit max_seconds), but
    // the caller asks for a window out to 8 s.
    const audio = decoded(withBurst(2000, 500, 50), {
      duration: 2,
      trackDuration: 10,
      truncated: true
    });

    const result = await analyzeAudioFrames(audio, { fromMs: 0, toMs: 8000 });

    expect(result.truncated).not.toBeNull();
    expect(result.truncated?.requested).toEqual([0, 8000]);
    expect(result.truncated?.analyzed).toEqual([0, 2000]);
    // The window still analyzes everything that *was* decoded.
    expect(result.frames.length).toBeGreaterThan(0);
    const last = result.frames[result.frames.length - 1];
    expect(last.timeMs).toBeLessThanOrEqual(2000);
  });

  it("reports no truncation when the request fits inside what decoded", async () => {
    const audio = decoded(withBurst(2000, 500, 50), {
      duration: 2,
      trackDuration: 2,
      truncated: false
    });
    const result = await analyzeAudioFrames(audio, { toMs: 1500 });
    expect(result.truncated).toBeNull();
  });

  it("finds onsets and a tempo from a decoded track", async () => {
    // A short tone burst every 500 ms for 4 s — a clean 120 BPM. A real
    // sample rate (not the 1 kHz used above) so the onset detector's fixed
    // 1024-sample FFT window is short enough, in time, to resolve them.
    const rate = 44100;
    const samples = new Float32Array(rate * 4);
    for (let beat = 0; beat < 8; beat += 1) {
      const start = beat * Math.round(0.5 * rate);
      for (let i = start; i < start + 400 && i < samples.length; i += 1) {
        samples[i] = Math.sin((2 * Math.PI * 440 * (i - start)) / rate) * 0.9;
      }
    }
    const audio = decoded(samples, {
      sampleRate: rate,
      duration: samples.length / rate,
      trackDuration: samples.length / rate
    });
    const result = await analyzeAudioFrames(audio, { detectTempo: true });
    expect(result.onsetsMs.length).toBeGreaterThan(0);
    expect(result.bpm).toBeDefined();
  });

  it("omits tempo when detectTempo is false", async () => {
    const audio = decoded(withBurst(1000, 200, 30));
    const result = await analyzeAudioFrames(audio, { detectTempo: false });
    expect(result.bpm).toBeUndefined();
    expect(result.tempoConfidence).toBeUndefined();
  });

  it("decodes real WAV bytes and reports the decode cap's truncation", async () => {
    const total = SAMPLE_RATE * 5;
    const samples = withBurst(total, 0, total); // 5 s tone at full duration
    const bytes = wav(samples, SAMPLE_RATE);

    const capped = await analyzeAudioFrames(bytes, { maxSeconds: 1 });
    expect(capped.truncated).not.toBeNull();
    expect(capped.truncated?.requested[1]).toBeCloseTo(5000, -2);
    expect(capped.truncated?.analyzed[1]).toBeLessThanOrEqual(1100);

    const full = await analyzeAudioFrames(bytes, { maxSeconds: 10 });
    expect(full.truncated).toBeNull();
  });
});
