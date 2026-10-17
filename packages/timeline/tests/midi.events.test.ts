import { describe, expect, it } from "vitest";

import { midiClipNoteEvents } from "../src/midi/events.js";
import { MIDI_PPQ } from "../src/midi/ticks.js";

const note = (id: string, pitch: number, beat: number, beats: number) => ({
  id,
  pitch,
  velocity: 90,
  startTick: beat * MIDI_PPQ,
  durationTick: beats * MIDI_PPQ
});

describe("midiClipNoteEvents", () => {
  // 120 BPM: one beat is 500 ms.
  const clip = {
    startMs: 1000,
    durationMs: 2000,
    inPointMs: 500,
    notes: [note("a", 60, 0, 1), note("b", 62, 1, 1), note("c", 64, 4, 2)]
  };

  it("places notes on the timeline from the clip's in-point and clamps offs to its end", () => {
    expect(midiClipNoteEvents(clip, 120)).toEqual([
      { timeMs: 1000, pitch: 62, velocity: 90, on: true },
      { timeMs: 1500, pitch: 62, velocity: 0, on: false },
      { timeMs: 2500, pitch: 64, velocity: 90, on: true },
      { timeMs: 3000, pitch: 64, velocity: 0, on: false }
    ]);
  });

  it("skips notes struck before the play position", () => {
    expect(midiClipNoteEvents(clip, 120, 1200).map((e) => e.pitch)).toEqual([64, 64]);
  });

  it("releases a repeated note before striking it again", () => {
    const repeated = {
      startMs: 0,
      durationMs: 2000,
      notes: [note("a", 60, 0, 1), note("b", 60, 1, 1)]
    };
    const at500 = midiClipNoteEvents(repeated, 120).filter((e) => e.timeMs === 500);
    expect(at500.map((e) => e.on)).toEqual([false, true]);
  });
});
