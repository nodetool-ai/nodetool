import { describe, expect, it } from "vitest";
import {
  MUSIC_SAMPLE_RATE,
  barStartFrame,
  beatLengthFrames,
  beatStartFrame,
  frameToMs,
  gridLineAtOrAfter,
  gridLineAtOrBefore,
  msToFrame,
  snapFrameToGrid,
  type MusicTempo
} from "../src/music/frames.js";
import { barStartMs } from "../src/midi/grid.js";

const tempo = (bpm: number, beatsPerBar = 4, beatUnit = 4, offsetMs = 0): MusicTempo => ({
  bpm,
  offsetMs,
  timeSignature: { beatsPerBar, beatUnit }
});

/** round(n / d) for a positive rational, ties up, as Math.round does. */
function roundRational(n: bigint, d: bigint): number {
  return Number((2n * n + d) / (2n * d));
}

describe("barStartFrame", () => {
  it("counts 48 kHz frames and BPM in quarter notes", () => {
    expect(MUSIC_SAMPLE_RATE).toBe(48000);
    expect(barStartFrame(1, tempo(120))).toBe(0);
    expect(barStartFrame(2, tempo(120))).toBe(96000);
    // MM3 exit 1: bars 5 to 12 at 120 BPM are 768000 frames.
    expect(barStartFrame(13, tempo(120)) - barStartFrame(5, tempo(120))).toBe(768000);
    // A 6/8 bar is six eighths: 1.5 s at 120 BPM.
    expect(barStartFrame(2, tempo(120, 6, 8))).toBe(72000);
    expect(barStartFrame(2, tempo(120, 3, 4))).toBe(72000);
    expect(barStartFrame(1, tempo(120, 4, 4, 250))).toBe(12000);
    expect(barStartFrame(0, tempo(120, 4, 4, 250))).toBe(12000 - 96000);
  });

  it("equals the exact rational value for bars 1 to 10000 (MT-4)", () => {
    for (const bpm of [87, 120, 173]) {
      for (const [beatsPerBar, beatUnit] of [[3, 4], [4, 4], [6, 8]]) {
        const t = tempo(bpm, beatsPerBar, beatUnit);
        for (let bar = 1; bar <= 10000; bar += 1) {
          // (bar - 1) * beatsPerBar * (4 / beatUnit) * 60 / bpm * 48000
          const numerator = BigInt(bar - 1) * BigInt(beatsPerBar) * 4n * 60n * 48000n;
          const exact = roundRational(numerator, BigInt(beatUnit) * BigInt(bpm));
          if (barStartFrame(bar, t) !== exact) {
            throw new Error(`bar ${bar} at ${bpm} BPM ${beatsPerBar}/${beatUnit}: ${barStartFrame(bar, t)} != ${exact}`);
          }
        }
      }
    }
  });

  it("does not drift the way an accumulated sum does", () => {
    const t = tempo(87);
    const barFrames = (4 * 60 * 48000) / 87;
    let sum = 0;
    for (let bar = 1; bar < 10000; bar += 1) sum += barFrames;
    expect(barStartFrame(10000, t)).toBe(Math.round((9999 * 4 * 60 * 48000) / 87));
    expect(Math.abs(sum - (9999 * 4 * 60 * 48000) / 87)).toBeGreaterThan(0);
  });

  it("agrees with barStartMs at whole frames", () => {
    for (const t of [tempo(120), tempo(150, 6, 8, 500), tempo(90, 3, 4, 125)]) {
      for (let bar = 1; bar < 50; bar += 1) {
        expect(barStartFrame(bar, t)).toBe(msToFrame(barStartMs(bar, { ...t })));
      }
    }
  });

  it("starts a bar on the beat that opens it", () => {
    for (const t of [tempo(87, 3, 4, 33), tempo(173, 6, 8), tempo(120, 2, 4)]) {
      for (let bar = -3; bar < 200; bar += 1) {
        expect(beatStartFrame((bar - 1) * t.timeSignature.beatsPerBar + 1, t)).toBe(barStartFrame(bar, t));
      }
    }
    expect(beatLengthFrames(tempo(120))).toBe(24000);
    expect(beatLengthFrames(tempo(120, 6, 8))).toBe(12000);
    expect(beatLengthFrames(tempo(87))).toBe(Math.round(2880000 / 87));
  });

  it("rejects a tempo it cannot read", () => {
    expect(() => barStartFrame(1, tempo(0))).toThrow("bpm must be a positive number; got 0.");
    expect(() => barStartFrame(1, tempo(120, 0))).toThrow("beatsPerBar must be a positive number; got 0.");
    expect(() => beatStartFrame(1, tempo(120, 4, Number.NaN))).toThrow("beatUnit must be a positive number; got NaN.");
    expect(() => barStartFrame(1, tempo(120, 4, 4, Number.POSITIVE_INFINITY))).toThrow(
      "offsetMs must be a finite number; got Infinity."
    );
  });
});

describe("frame and millisecond conversion", () => {
  it("returns the same frame from its millisecond value", () => {
    let seed = 7;
    for (let i = 0; i < 100000; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const frame = seed % (48000 * 3600);
      expect(msToFrame(frameToMs(frame))).toBe(frame);
    }
    expect(frameToMs(48)).toBe(1);
    expect(frameToMs(96000)).toBe(2000);
    expect(msToFrame(0.0104)).toBe(0);
    expect(msToFrame(0.0105)).toBe(1);
  });
});

describe("grid lines and snapping", () => {
  it("finds the line at or before and at or after a frame", () => {
    const t = tempo(120);
    expect(gridLineAtOrBefore(0, t, "bar")).toBe(1);
    expect(gridLineAtOrBefore(95999, t, "bar")).toBe(1);
    expect(gridLineAtOrBefore(96000, t, "bar")).toBe(2);
    expect(gridLineAtOrAfter(96000, t, "bar")).toBe(2);
    expect(gridLineAtOrAfter(96001, t, "bar")).toBe(3);
    expect(gridLineAtOrBefore(24000, t, "beat")).toBe(2);
    expect(gridLineAtOrAfter(1, t, "beat")).toBe(2);
    const late = tempo(120, 4, 4, 1000);
    expect(gridLineAtOrBefore(0, late, "bar")).toBe(0);
    expect(gridLineAtOrBefore(48000, late, "bar")).toBe(1);
  });

  it("agrees with the rounded line frames at awkward tempi", () => {
    for (const t of [tempo(87, 3, 4, 17), tempo(173, 6, 8, 3), tempo(299, 2, 4)]) {
      for (let bar = 1; bar < 2000; bar += 7) {
        const frame = barStartFrame(bar, t);
        expect(gridLineAtOrBefore(frame, t, "bar")).toBe(bar);
        expect(gridLineAtOrBefore(frame - 1, t, "bar")).toBe(bar - 1);
        expect(gridLineAtOrAfter(frame + 1, t, "bar")).toBe(bar + 1);
      }
    }
  });

  it("snaps to the nearest bar or beat and breaks a tie toward the earlier line", () => {
    const t = tempo(120);
    expect(snapFrameToGrid(47999, t, "bar")).toBe(0);
    expect(snapFrameToGrid(48000, t, "bar")).toBe(0);
    expect(snapFrameToGrid(48001, t, "bar")).toBe(96000);
    expect(snapFrameToGrid(11999, t, "beat")).toBe(0);
    expect(snapFrameToGrid(12001, t, "beat")).toBe(24000);
    expect(snapFrameToGrid(200000, tempo(120, 6, 8), "bar")).toBe(216000);
    // Bar 0 of a late beat one starts before frame 0 and is skipped.
    expect(snapFrameToGrid(10, tempo(120, 4, 4, 1000), "bar")).toBe(48000);
  });
});
