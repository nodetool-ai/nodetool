/**
 * The piano roll's pixel mapping. Every assertion here is arithmetic the
 * pointer handlers depend on, so it is checked without a canvas.
 */

import type { MidiNote } from "@nodetool-ai/timeline";

import {
  DEFAULT_HIGH_PITCH,
  DEFAULT_LOW_PITCH,
  NOTE_END_GRIP_PX,
  hitTestNote,
  initialTopPitch,
  isBlackKey,
  noteRect,
  pitchName,
  pitchToY,
  tickToX,
  xToTick,
  yToPitch,
  type PianoRollGeometry
} from "../pianoRollGeometry";

const geometry: PianoRollGeometry = {
  pxPerTick: 0.1,
  scrollTick: 0,
  rowHeightPx: 12,
  topPitch: 72
};

const note = (over: Partial<MidiNote> = {}): MidiNote => ({
  id: "n1",
  pitch: 60,
  velocity: 100,
  startTick: 0,
  durationTick: 240,
  ...over
});

describe("tickToX / xToTick", () => {
  it("round-trips through the zoom and the scroll offset", () => {
    const scrolled: PianoRollGeometry = { ...geometry, scrollTick: 960 };
    expect(tickToX(960, scrolled)).toBe(0);
    expect(tickToX(1920, scrolled)).toBeCloseTo(96);
    expect(xToTick(96, scrolled)).toBeCloseTo(1920);
  });

  it("reads x = 0 as the scroll tick when the zoom collapses", () => {
    expect(xToTick(500, { ...geometry, pxPerTick: 0 })).toBe(0);
  });
});

describe("pitchToY / yToPitch", () => {
  it("puts the top pitch on the first row and counts down", () => {
    expect(pitchToY(72, geometry)).toBe(0);
    expect(pitchToY(71, geometry)).toBe(12);
    expect(pitchToY(60, geometry)).toBe(144);
  });

  it("reads any y inside a row as that row's pitch", () => {
    expect(yToPitch(0, geometry)).toBe(72);
    expect(yToPitch(11, geometry)).toBe(72);
    expect(yToPitch(12, geometry)).toBe(71);
    expect(yToPitch(144, geometry)).toBe(60);
  });
});

describe("noteRect", () => {
  it("places a note by its onset, pitch and length", () => {
    const rect = noteRect(note({ pitch: 71, startTick: 480 }), geometry);
    expect(rect).toEqual({ x: 48, y: 12, width: 24, height: 12 });
  });

  it("keeps a very short note at least a pixel wide", () => {
    expect(noteRect(note({ durationTick: 1 }), geometry).width).toBe(1);
  });
});

describe("hitTestNote", () => {
  const notes = [note({ id: "a", pitch: 60, startTick: 0, durationTick: 960 })];

  it("returns the body for a point in the middle of a note", () => {
    const hit = hitTestNote(notes, 40, 148, geometry);
    expect(hit?.note.id).toBe("a");
    expect(hit?.edge).toBe("body");
  });

  it("returns the end for a point inside the last 8px", () => {
    // 960 ticks at 0.1 px/tick is 96px wide: the grip is x 88..96.
    expect(hitTestNote(notes, 87, 148, geometry)?.edge).toBe("body");
    expect(hitTestNote(notes, 88, 148, geometry)?.edge).toBe("end");
    expect(hitTestNote(notes, 95, 148, geometry)?.edge).toBe("end");
  });

  it("never lets the grip swallow a note narrower than twice its width", () => {
    // 80 ticks is 8px wide — the grip is capped at half, so 0..4 still moves.
    const narrow = [note({ id: "n", durationTick: 80 })];
    expect(hitTestNote(narrow, 1, 148, geometry)?.edge).toBe("body");
    expect(hitTestNote(narrow, 6, 148, geometry)?.edge).toBe("end");
    expect(NOTE_END_GRIP_PX).toBe(8);
  });

  it("misses above, below, before and after the note", () => {
    expect(hitTestNote(notes, 40, 143, geometry)).toBeNull();
    expect(hitTestNote(notes, 40, 156, geometry)).toBeNull();
    expect(hitTestNote(notes, -1, 148, geometry)).toBeNull();
    expect(hitTestNote(notes, 96, 148, geometry)).toBeNull();
  });

  it("takes the note drawn last where two overlap", () => {
    const stacked = [
      note({ id: "under", pitch: 60, startTick: 0, durationTick: 960 }),
      note({ id: "over", pitch: 60, startTick: 0, durationTick: 960 })
    ];
    expect(hitTestNote(stacked, 10, 148, geometry)?.note.id).toBe("over");
  });
});

describe("isBlackKey / pitchName", () => {
  it("names the black keys of an octave", () => {
    expect([61, 63, 66, 68, 70].every(isBlackKey)).toBe(true);
    expect([60, 62, 64, 65, 67, 69, 71].some(isBlackKey)).toBe(false);
  });

  it("reads middle C as C4", () => {
    expect(pitchName(60)).toBe("C4");
    expect(pitchName(61)).toBe("C#4");
    expect(pitchName(72)).toBe("C5");
    expect(pitchName(0)).toBe("C-1");
    expect(pitchName(127)).toBe("G9");
  });
});

describe("initialTopPitch", () => {
  it("centres the view on the notes present", () => {
    const notes = [note({ pitch: 48 }), note({ pitch: 52 })];
    // Centre 50, 20 rows: the top row is 60 and the bottom 41.
    expect(initialTopPitch(notes, 20)).toBe(60);
  });

  it("opens on C3..C5 for an empty clip", () => {
    const top = initialTopPitch([], 24);
    expect(top).toBe(72);
    expect(top - 24 + 1).toBe(49);
    expect(DEFAULT_LOW_PITCH).toBe(48);
    expect(DEFAULT_HIGH_PITCH).toBe(72);
  });

  it("never scrolls past either end of the MIDI range", () => {
    expect(initialTopPitch([note({ pitch: 127 })], 10)).toBe(127);
    expect(initialTopPitch([note({ pitch: 0 })], 10)).toBe(9);
  });
});
