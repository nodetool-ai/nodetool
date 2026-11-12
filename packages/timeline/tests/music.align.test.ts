/**
 * Grid offset, tempo deviation, gain and cut of a generated window
 * (MUSIC-MODE.md section 11; MM3 exit 3, MM5 exit 7).
 *
 * Every fixture is a click track built from known beat positions, so the
 * expected offset and tempo follow from the signal and not from the code.
 */
import { describe, expect, it } from "vitest";
import {
  ALIGN_MIN_CONFIDENCE,
  DRIFT_THRESHOLD_MS,
  applyGain,
  beatPeriodFrames,
  cutFrames,
  cutRange,
  measureAlignment,
  peakNormalizeGain,
  samplePeak
} from "../src/music/process.js";

const RATE = 48000;

/** A deterministic noise source in [-0.5, 0.5). */
function noiseSource(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647 - 0.5;
  };
}

interface ClickTrackOptions {
  seconds: number;
  /** Frame of the first click. May be negative: that click is cut off. */
  firstFrame: number;
  /** Frames between clicks. */
  periodFrames: number;
  /** Noise floor level as a fraction of full scale. */
  noise?: number;
  seed?: number;
}

/** Interleaved stereo noise bursts at `firstFrame + k * periodFrames`. */
function clickTrack(options: ClickTrackOptions): Float32Array {
  const frames = Math.round(options.seconds * RATE);
  const samples = new Float32Array(frames * 2);
  const noise = noiseSource(options.seed ?? 7);
  const floor = options.noise ?? 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const value = floor * 2 * noise();
    samples[frame * 2] = value;
    samples[frame * 2 + 1] = value;
  }
  const burst = noiseSource(11);
  for (let k = 0; ; k += 1) {
    const start = Math.round(options.firstFrame + k * options.periodFrames);
    if (start >= frames) break;
    for (let i = 0; i < 1200; i += 1) {
      const frame = start + i;
      if (frame < 0 || frame >= frames) continue;
      const value = 1.6 * burst() * Math.exp(-i / 240);
      samples[frame * 2] += value;
      samples[frame * 2 + 1] += value;
    }
  }
  return samples;
}

describe("measureAlignment offset (MM3 exit 3)", () => {
  const cases: Array<{ bpm: number; phase: number; offsetMs: number }> = [];
  for (const offsetMs of [-200, -150, -97.3, -40, -2, 0, 3.5, 41.7, 120, 166.6, 200]) {
    cases.push({ bpm: 120, phase: 0, offsetMs });
  }
  for (const offsetMs of [-200, -61, 0, 88.8, 200]) {
    cases.push({ bpm: 87, phase: 12345, offsetMs });
  }
  // A beat at 150 BPM is 400 ms, so half a beat either way is +-200 ms.
  for (const offsetMs of [-180, 0, 180]) {
    cases.push({ bpm: 150, phase: 4000, offsetMs });
  }

  it.each(cases)(
    "measures $offsetMs ms at $bpm BPM within 2 ms",
    ({ bpm, phase, offsetMs }) => {
      const period = beatPeriodFrames(bpm);
      const offsetFrames = Math.round((offsetMs / 1000) * RATE);
      const window = clickTrack({
        seconds: 12,
        firstFrame: phase + offsetFrames,
        periodFrames: period,
        noise: 0.01
      });
      const alignment = measureAlignment(window, {
        bpm,
        beatPhaseFrames: phase,
        takeFrames: 4 * period
      });
      expect(Math.abs(alignment.offsetFrames - offsetFrames)).toBeLessThanOrEqual(96);
      expect(alignment.confident).toBe(true);
      expect(alignment.drifting).toBe(false);

      // The cut starts on the measured frame: frame 0 of the cut is window
      // frame `segment start + offset`, and a cut before the window is silent.
      const segment = { start_frame: phase, end_frame: phase + Math.round(2 * period) };
      const cut = cutRange(window, segment, alignment.offsetFrames);
      const start = segment.start_frame + alignment.offsetFrames;
      expect(cut.length).toBe((segment.end_frame - segment.start_frame) * 2);
      for (const probe of [0, 1, 777, segment.end_frame - segment.start_frame - 1]) {
        const source = start + probe;
        const expected = source >= 0 ? window[source * 2] : 0;
        expect(cut[probe * 2]).toBe(expected);
      }
    }
  );

  it("pads the head with silence when a negative offset moves the cut before the window", () => {
    const period = beatPeriodFrames(120);
    const offsetFrames = Math.round(-0.2 * RATE);
    const window = clickTrack({
      seconds: 12,
      firstFrame: offsetFrames,
      periodFrames: period,
      noise: 0.01
    });
    const alignment = measureAlignment(window, { bpm: 120, takeFrames: period * 4 });
    expect(Math.abs(alignment.offsetFrames - offsetFrames)).toBeLessThanOrEqual(96);
    const cut = cutRange(window, { start_frame: 0, end_frame: period * 4 }, alignment.offsetFrames);
    const silent = -alignment.offsetFrames;
    for (let frame = 0; frame < silent; frame += 1) {
      expect(cut[frame * 2]).toBe(0);
      expect(cut[frame * 2 + 1]).toBe(0);
    }
    expect(cut[silent * 2]).toBe(window[0]);
  });

  it("does not trust an offset measured on noise", () => {
    for (const seed of [3, 5, 9, 13]) {
      const noise = clickTrack({
        seconds: 12,
        firstFrame: 10 ** 9,
        periodFrames: beatPeriodFrames(120),
        noise: 0.3,
        seed
      });
      const alignment = measureAlignment(noise, { bpm: 120, takeFrames: 96000 });
      expect(alignment.confidence).toBeLessThan(ALIGN_MIN_CONFIDENCE);
      expect(alignment.confident).toBe(false);
    }
  });

  it("trusts a click track buried in noise", () => {
    const period = beatPeriodFrames(120);
    const window = clickTrack({
      seconds: 12,
      firstFrame: 5000,
      periodFrames: period,
      noise: 0.25
    });
    const alignment = measureAlignment(window, { bpm: 120, takeFrames: period * 4 });
    expect(alignment.confidence).toBeGreaterThan(ALIGN_MIN_CONFIDENCE);
    expect(Math.abs(alignment.offsetFrames - 5000)).toBeLessThanOrEqual(96);
  });
});

describe("measureAlignment tempo deviation (MM5 exit 7)", () => {
  const takeFrames = 16 * RATE;

  function fixture(fastBy: number): Float32Array {
    return clickTrack({
      seconds: 17,
      firstFrame: 2400,
      periodFrames: beatPeriodFrames(120) / (1 + fastBy),
      noise: 0.01
    });
  }

  it("badges a take 1% fast over 16 s as drifting", () => {
    const alignment = measureAlignment(fixture(0.01), {
      bpm: 120,
      beatPhaseFrames: 2400,
      takeFrames
    });
    expect(alignment.tempoRatio).toBeCloseTo(1.01, 3);
    // 1% of 16 s is 160 ms.
    expect(alignment.lastBeatErrorMs).toBeGreaterThan(150);
    expect(alignment.lastBeatErrorMs).toBeLessThan(170);
    expect(alignment.drifting).toBe(true);
  });

  it("does not badge a take 0.1% fast over 16 s", () => {
    const alignment = measureAlignment(fixture(0.001), {
      bpm: 120,
      beatPhaseFrames: 2400,
      takeFrames
    });
    expect(alignment.tempoRatio).toBeCloseTo(1.001, 4);
    // 0.1% of 16 s is 16 ms, under the 20 ms threshold.
    expect(alignment.lastBeatErrorMs).toBeGreaterThan(12);
    expect(alignment.lastBeatErrorMs).toBeLessThan(DRIFT_THRESHOLD_MS);
    expect(alignment.drifting).toBe(false);
  });

  it("measures a slow take as a ratio below 1", () => {
    const alignment = measureAlignment(fixture(-0.02), {
      bpm: 120,
      beatPhaseFrames: 2400,
      takeFrames
    });
    expect(alignment.tempoRatio).toBeCloseTo(0.98, 3);
    expect(alignment.drifting).toBe(true);
  });

  it("reports silence as uncorrected and on tempo", () => {
    const alignment = measureAlignment(new Float32Array(12 * RATE * 2), {
      bpm: 120,
      takeFrames
    });
    expect(alignment).toMatchObject({
      offsetFrames: 0,
      confident: false,
      confidence: 0,
      tempoRatio: 1,
      lastBeatErrorMs: 0,
      drifting: false
    });
  });
});

describe("peakNormalizeGain", () => {
  it("puts the sample peak at -3 dBFS and reports the gain in dB", () => {
    const samples = clickTrack({
      seconds: 1,
      firstFrame: 100,
      periodFrames: 24000,
      noise: 0.05
    });
    const before = samplePeak(samples);
    const { gain, gainDb } = peakNormalizeGain(samples);
    const scaled = applyGain(samples, gain);
    expect(20 * Math.log10(samplePeak(scaled))).toBeCloseTo(-3, 5);
    expect(gainDb).toBeCloseTo(-3 - 20 * Math.log10(before), 9);
    // One gain for the whole window keeps the relative level of every sample.
    expect(scaled[5000]! / samples[5000]!).toBeCloseTo(gain, 5);
  });

  it("leaves silence at unity", () => {
    expect(peakNormalizeGain(new Float32Array(16))).toEqual({ gain: 1, gainDb: 0 });
  });
});

describe("cutFrames", () => {
  const samples = Float32Array.from({ length: 20 }, (_, i) => i + 1);

  it("copies whole frames and fills frames outside the buffer with silence", () => {
    expect(Array.from(cutFrames(samples, 2, 4))).toEqual([5, 6, 7, 8]);
    expect(Array.from(cutFrames(samples, -1, 1))).toEqual([0, 0, 1, 2]);
    expect(Array.from(cutFrames(samples, 9, 11))).toEqual([19, 20, 0, 0]);
  });

  it("refuses fractional frames and reversed ranges", () => {
    expect(() => cutFrames(samples, 0.5, 2)).toThrow(/whole frames/);
    expect(() => cutFrames(samples, 3, 2)).toThrow(/ends before/);
  });
});
