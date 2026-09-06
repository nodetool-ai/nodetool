import { describe, expect, it } from "vitest";
import { MAX_BEAT_GRID_POINTS } from "../src/beats.js";
import {
  barDurationMs,
  barStartMs,
  barsBeatsAt,
  beatDurationMs,
  formatBarsBeats,
  tempoGridMs
} from "../src/midi/grid.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import type { TimelineTempo } from "../src/types.js";

const tempo = (over: Partial<TimelineTempo> = {}): TimelineTempo => ({
  ...DEFAULT_TEMPO,
  ...over
});

describe("barsBeatsAt", () => {
  it("reads 4/4 at 120 BPM", () => {
    const t = tempo();
    expect(barsBeatsAt(0, t)).toEqual({ bar: 1, beat: 1, tick: 0 });
    expect(barsBeatsAt(500, t)).toEqual({ bar: 1, beat: 2, tick: 0 });
    expect(barsBeatsAt(2000, t)).toEqual({ bar: 2, beat: 1, tick: 0 });
    expect(barsBeatsAt(2125, t)).toEqual({ bar: 2, beat: 1, tick: 240 });
  });

  it("shifts everything by the tempo offset", () => {
    const t = tempo({ offsetMs: 250 });
    expect(barsBeatsAt(250, t)).toEqual({ bar: 1, beat: 1, tick: 0 });
    expect(barsBeatsAt(750, t)).toEqual({ bar: 1, beat: 2, tick: 0 });
    expect(barsBeatsAt(2250, t)).toEqual({ bar: 2, beat: 1, tick: 0 });
    expect(barsBeatsAt(2375, t)).toEqual({ bar: 2, beat: 1, tick: 240 });
  });

  it("reads times before beat one without clamping them", () => {
    const t = tempo({ offsetMs: 250 });
    expect(barsBeatsAt(150, t)).toEqual({ bar: 0, beat: 4, tick: 768 });
    expect(barsBeatsAt(-2000, t).bar).toBeLessThan(0);
  });

  it("puts three beats in a 3/4 bar", () => {
    const t = tempo({ timeSignature: { beatsPerBar: 3, beatUnit: 4 } });
    expect(barsBeatsAt(1000, t)).toEqual({ bar: 1, beat: 3, tick: 0 });
    expect(barsBeatsAt(1500, t)).toEqual({ bar: 2, beat: 1, tick: 0 });
    expect(barDurationMs(t)).toBe(1500);
  });

  it("counts a 6/8 beat as an eighth note", () => {
    const t = tempo({ timeSignature: { beatsPerBar: 6, beatUnit: 8 } });
    expect(beatDurationMs(t)).toBe(250);
    expect(barDurationMs(t)).toBe(1500);
    expect(barsBeatsAt(250, t)).toEqual({ bar: 1, beat: 2, tick: 0 });
    expect(barsBeatsAt(1500, t)).toEqual({ bar: 2, beat: 1, tick: 0 });
  });

  it("formats bar.beat.tick", () => {
    expect(formatBarsBeats(4625, tempo())).toBe("3.2.240");
  });
});

describe("barStartMs", () => {
  it("starts bar one at the offset", () => {
    expect(barStartMs(1, tempo())).toBe(0);
    expect(barStartMs(3, tempo())).toBe(4000);
    expect(barStartMs(2, tempo({ offsetMs: 250 }))).toBe(2250);
  });
});

describe("tempoGridMs", () => {
  const t = tempo();

  it("puts a beat every 500ms and includes both ends", () => {
    expect(
      tempoGridMs({ tempo: t, division: "beat", fromMs: 0, toMs: 2000 })
    ).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it("puts a sixteenth every 125ms", () => {
    expect(
      tempoGridMs({ tempo: t, division: "1/16", fromMs: 0, toMs: 500 })
    ).toEqual([0, 125, 250, 375, 500]);
  });

  it("puts a bar every 2000ms and honours the offset", () => {
    expect(
      tempoGridMs({ tempo: t, division: "bar", fromMs: 0, toMs: 4000 })
    ).toEqual([0, 2000, 4000]);
    expect(
      tempoGridMs({
        tempo: tempo({ offsetMs: 250 }),
        division: "bar",
        fromMs: 0,
        toMs: 4000
      })
    ).toEqual([250, 2250]);
  });

  it("starts at the first line inside the window", () => {
    expect(
      tempoGridMs({ tempo: t, division: "beat", fromMs: 600, toMs: 1600 })
    ).toEqual([1000, 1500]);
    expect(
      tempoGridMs({ tempo: t, division: "beat", fromMs: 1200, toMs: 1000 })
    ).toEqual([]);
  });

  it("generates from the offset rather than accumulating", () => {
    const grid = tempoGridMs({
      tempo: tempo({ bpm: 140 }),
      division: "beat",
      fromMs: 0,
      toMs: 60000
    });
    const interval = 60000 / 140;
    expect(grid[grid.length - 1]).toBeCloseTo(
      (grid.length - 1) * interval,
      9
    );
  });

  it("throws past the grid cap rather than filling a ruler", () => {
    expect(() =>
      tempoGridMs({
        tempo: t,
        division: "1/32",
        fromMs: 0,
        toMs: MAX_BEAT_GRID_POINTS * 62.5 + 1000
      })
    ).toThrow(new RegExp(String(MAX_BEAT_GRID_POINTS)));
  });
});
