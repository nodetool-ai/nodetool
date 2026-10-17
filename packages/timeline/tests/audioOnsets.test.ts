/**
 * The shared onset detector, and the clip beat plan "Detect beats" writes.
 *
 * A click every 500 ms is 120 BPM by construction, so the expected tempo,
 * phase and bar lines follow from the signal, not from the implementation.
 */
import { describe, expect, it } from "vitest";
import {
  analyzeOnsets,
  beatGridPhaseMs,
  isTempoReliable,
  planClipBeats
} from "../src/index.js";

const SAMPLE_RATE = 22050;

/** Short noise bursts every `intervalMs`, starting at `firstMs`. */
function clickTrack(
  seconds: number,
  intervalMs: number,
  firstMs = 0
): Float32Array {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  let seed = 7;
  const noise = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  for (let t = firstMs; t < seconds * 1000; t += intervalMs) {
    const start = Math.round((t / 1000) * SAMPLE_RATE);
    for (let i = 0; i < 400 && start + i < samples.length; i++) {
      samples[start + i] = noise() * Math.exp(-i / 80);
    }
  }
  return samples;
}

describe("analyzeOnsets", () => {
  it("finds a 120 BPM click track and calls its tempo reliable", () => {
    const analysis = analyzeOnsets(clickTrack(8, 500, 100), SAMPLE_RATE);
    expect(analysis.onsetsMs.length).toBeGreaterThanOrEqual(14);
    expect(analysis.tempo?.bpm).toBeGreaterThan(115);
    expect(analysis.tempo?.bpm).toBeLessThan(125);
    expect(
      isTempoReliable(analysis.tempo!, analysis.onsetsMs.length)
    ).toBe(true);
  });

  it("reports no reliable tempo for silence", () => {
    const analysis = analyzeOnsets(new Float32Array(SAMPLE_RATE * 4), SAMPLE_RATE);
    expect(analysis.onsetsMs).toEqual([]);
    expect(isTempoReliable(analysis.tempo!, analysis.onsetsMs.length)).toBe(
      false
    );
  });

  it("skips tempo when asked", () => {
    const analysis = analyzeOnsets(clickTrack(2, 500), SAMPLE_RATE, {
      detectTempo: false
    });
    expect(analysis.tempo).toBeUndefined();
  });
});

describe("beatGridPhaseMs", () => {
  it("returns the phase most onsets agree with", () => {
    // Beats at 130, 630, 1130 ms plus one stray onset at 900 ms.
    expect(beatGridPhaseMs([130, 630, 900, 1130], 120)).toBe(130);
  });

  it("returns 0 without onsets or tempo", () => {
    expect(beatGridPhaseMs([], 120)).toBe(0);
    expect(beatGridPhaseMs([100], 0)).toBe(0);
  });
});

describe("planClipBeats", () => {
  it("places bar lines on the clip's beats", () => {
    const plan = planClipBeats(
      { startMs: 1000, durationMs: 4000, rate: 1 },
      [100, 600, 1100, 1600, 2100],
      120,
      4
    );
    expect(plan).toEqual({
      bpm: 120,
      offsetMs: 1100,
      barTimesMs: [1100, 3100]
    });
  });

  it("scales tempo and onsets by the clip's speed", () => {
    // Played at 2x, a 60 BPM source reads as 120 BPM, and a source onset at
    // 1250 ms lands 625 ms into the clip, so the beats fall on 125 + 500n.
    const plan = planClipBeats(
      { startMs: 0, durationMs: 3000, rate: 2 },
      [1250, 2250, 3250],
      60,
      4
    );
    expect(plan?.bpm).toBe(120);
    expect(plan?.barTimesMs).toEqual([125, 2125]);
  });

  it("returns null without a tempo", () => {
    expect(
      planClipBeats({ startMs: 0, durationMs: 1000, rate: 1 }, [], 0, 4)
    ).toBeNull();
  });
});
