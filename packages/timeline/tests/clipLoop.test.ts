import { describe, expect, it } from "vitest";

import {
  activeLoopMs,
  expandMidiLoop,
  loopRepeatCount,
  midiClipNoteEvents,
  timeRemapAudioSegments,
  unrollLoopedClip
} from "../src/index.js";
import { MIDI_PPQ } from "../src/midi/ticks.js";
import type { TimelineClip } from "../src/types.js";

const note = (id: string, pitch: number, beat: number, beats: number) => ({
  id,
  pitch,
  velocity: 90,
  startTick: beat * MIDI_PPQ,
  durationTick: beats * MIDI_PPQ
});

// 120 BPM: a beat is 500 ms, a 4/4 bar is 2000 ms.
const BAR = 2000;

describe("region loop: midi", () => {
  const pattern = [note("a", 60, 0, 1), note("b", 64, 2, 1)];

  it("a 1-bar pattern looped 4 times plays 4x the notes at the right times", () => {
    const clip = {
      startMs: 1000,
      durationMs: 4 * BAR,
      inPointMs: 0,
      loopLengthMs: BAR,
      notes: pattern
    };
    const ons = midiClipNoteEvents(clip, 120).filter((e) => e.on);
    expect(ons).toHaveLength(8);
    expect(ons.map((e) => e.timeMs)).toEqual([
      1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000
    ]);
    expect(ons.map((e) => e.pitch)).toEqual([60, 64, 60, 64, 60, 64, 60, 64]);
  });

  it("cuts a note that crosses a repeat boundary", () => {
    const clip = {
      startMs: 0,
      durationMs: 2 * BAR,
      inPointMs: 0,
      loopLengthMs: BAR,
      notes: [note("long", 60, 3, 3)]
    };
    const expanded = expandMidiLoop(clip, 120);
    expect(expanded.notes!.map((n) => [n.id, n.startTick, n.durationTick])).toEqual([
      ["long", 3 * MIDI_PPQ, MIDI_PPQ],
      ["long~1", 7 * MIDI_PPQ, MIDI_PPQ]
    ]);
    const offs = midiClipNoteEvents(clip, 120).filter((e) => !e.on);
    expect(offs.map((e) => e.timeMs)).toEqual([BAR, 2 * BAR]);
  });

  it("ends mid-window at durationMs and ignores notes outside the window", () => {
    const clip = {
      startMs: 0,
      durationMs: 1.5 * BAR,
      inPointMs: 0,
      loopLengthMs: BAR,
      notes: [...pattern, note("outside", 72, 6, 1)]
    };
    const ons = midiClipNoteEvents(clip, 120).filter((e) => e.on);
    expect(ons.map((e) => e.timeMs)).toEqual([0, 1000, 2000]);
  });

  it("does nothing when the loop is not shorter than the clip", () => {
    const clip = { durationMs: BAR, loopLengthMs: BAR, notes: pattern };
    expect(activeLoopMs(clip)).toBeUndefined();
    expect(expandMidiLoop(clip, 120)).toBe(clip);
    expect(loopRepeatCount(clip)).toBe(1);
  });
});

describe("region loop: audio", () => {
  it("yields one source segment per repeat, cut at the boundary", () => {
    const segs = timeRemapAudioSegments({
      startMs: 1000,
      durationMs: 2500,
      inPointMs: 300,
      loopLengthMs: 1000
    });
    expect(segs.map((s) => [s.timelineStartMs, s.timelineEndMs, s.sourceStartMs, s.sourceEndMs])).toEqual([
      [1000, 2000, 300, 1300],
      [2000, 3000, 300, 1300],
      [3000, 3500, 300, 800]
    ]);
  });

  it("reads loopLengthMs on the timeline, so at 2x each repeat covers twice the source", () => {
    const segs = timeRemapAudioSegments({
      startMs: 0,
      durationMs: 1000,
      inPointMs: 0,
      speedMultiplier: 2,
      loopLengthMs: 500
    });
    expect(segs.map((s) => [s.timelineStartMs, s.timelineEndMs, s.sourceEndMs])).toEqual([[0, 500, 1000], [500, 1000, 1000]]);
  });
});

describe("unrollLoopedClip", () => {
  it("writes plain copies back to back", () => {
    let n = 0;
    const clip = {
      id: "c",
      trackId: "t",
      name: "loop",
      startMs: 1000,
      durationMs: 2.5 * BAR,
      inPointMs: 0,
      loopLengthMs: BAR,
      mediaType: "midi",
      sourceType: "generated",
      notes: [note("a", 60, 0, 1), note("far", 60, 12, 1)]
    } as TimelineClip;
    const copies = unrollLoopedClip(clip, 120, BAR, { newId: () => `n${++n}` });
    expect(copies.map((c) => [c.id, c.startMs, c.durationMs, c.loopLengthMs])).toEqual([
      ["c", 1000, BAR, undefined],
      ["n1", 3000, BAR, undefined],
      ["n2", 5000, 0.5 * BAR, undefined]
    ]);
    expect(copies[0]!.notes!.map((x) => x.id)).toEqual(["a"]);
  });
});
