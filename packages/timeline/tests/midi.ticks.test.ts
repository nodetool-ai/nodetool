import { describe, expect, it } from "vitest";
import {
  MIDI_PPQ,
  msToTicks,
  noteWindowMs,
  ticksToMs
} from "../src/midi/ticks.js";

describe("ticks", () => {
  it("puts a quarter note at 500ms at 120 BPM", () => {
    expect(ticksToMs(MIDI_PPQ, 120)).toBe(500);
    expect(ticksToMs(MIDI_PPQ * 4, 120)).toBe(2000);
    expect(ticksToMs(MIDI_PPQ, 60)).toBe(1000);
  });

  it("round-trips ticks through milliseconds", () => {
    for (const bpm of [60, 90, 120, 137.5, 200]) {
      for (const ticks of [0, 1, 240, MIDI_PPQ, MIDI_PPQ * 7 + 13]) {
        expect(msToTicks(ticksToMs(ticks, bpm), bpm)).toBeCloseTo(ticks, 9);
      }
    }
  });

  it("reports a note's window relative to the content start", () => {
    const window = noteWindowMs(
      { startTick: MIDI_PPQ * 2, durationTick: MIDI_PPQ },
      120
    );
    expect(window).toEqual({ startMs: 1000, endMs: 1500 });
  });
});
