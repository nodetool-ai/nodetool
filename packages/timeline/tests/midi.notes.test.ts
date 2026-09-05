import { describe, expect, it } from "vitest";
import {
  MIDI_MAX_NOTES_PER_CLIP,
  createMidiNote,
  sortNotes,
  validateNotes,
  visibleNotes
} from "../src/midi/notes.js";
import { MIDI_PPQ } from "../src/midi/ticks.js";
import type { MidiNote } from "../src/types.js";

const note = (over: Partial<MidiNote>): MidiNote => ({
  id: "n1",
  pitch: 60,
  velocity: 100,
  startTick: 0,
  durationTick: MIDI_PPQ,
  ...over
});

const codes = (notes: MidiNote[]) => validateNotes(notes).map((p) => p.code);

describe("createMidiNote", () => {
  it("assigns an id and the default velocity", () => {
    const created = createMidiNote({
      pitch: 64,
      startTick: 480,
      durationTick: 240
    });
    expect(created.id).toMatch(/^[0-9a-f]{32}$/);
    expect(created.velocity).toBe(100);
    expect(created.pitch).toBe(64);
  });

  it("keeps an id and velocity the caller supplied", () => {
    const created = createMidiNote({
      id: "keep-me",
      pitch: 64,
      velocity: 30,
      startTick: 0,
      durationTick: 1
    });
    expect(created.id).toBe("keep-me");
    expect(created.velocity).toBe(30);
  });
});

describe("sortNotes", () => {
  it("orders by onset then pitch, leaving the input alone", () => {
    const input = [
      note({ id: "c", startTick: 960, pitch: 60 }),
      note({ id: "b", startTick: 0, pitch: 67 }),
      note({ id: "a", startTick: 0, pitch: 60 })
    ];
    expect(sortNotes(input).map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(input[0].id).toBe("c");
  });
});

describe("validateNotes", () => {
  it("passes a clean list", () => {
    expect(
      validateNotes([note({}), note({ id: "n2", startTick: 960 })])
    ).toEqual([]);
  });

  it("catches a pitch outside 0..127 and a non-integer pitch", () => {
    expect(codes([note({ pitch: 128 })])).toContain("pitch_out_of_range");
    expect(codes([note({ pitch: -1 })])).toContain("pitch_out_of_range");
    expect(codes([note({ pitch: 60.5 })])).toContain("pitch_out_of_range");
  });

  it("catches a velocity outside 1..127", () => {
    expect(codes([note({ velocity: 0 })])).toContain("velocity_out_of_range");
    expect(codes([note({ velocity: 128 })])).toContain("velocity_out_of_range");
  });

  it("catches non-integer and negative ticks", () => {
    expect(codes([note({ startTick: 1.5 })])).toContain("non_integer_tick");
    expect(codes([note({ startTick: -1 })])).toContain("non_integer_tick");
    expect(codes([note({ durationTick: 10.5 })])).toContain("non_integer_tick");
  });

  it("catches a non-positive duration", () => {
    expect(codes([note({ durationTick: 0 })])).toContain(
      "non_positive_duration"
    );
  });

  it("catches a duplicate id", () => {
    expect(codes([note({}), note({ startTick: 960 })])).toContain(
      "duplicate_id"
    );
  });

  it("catches a list over the cap", () => {
    const many = Array.from({ length: MIDI_MAX_NOTES_PER_CLIP + 1 }, (_, i) =>
      note({ id: `n${i}`, startTick: i })
    );
    expect(codes(many)).toContain("too_many_notes");
  });

  it("reports every problem rather than stopping at the first", () => {
    const problems = validateNotes([
      note({ id: "bad", pitch: 200, velocity: 0, durationTick: 0 })
    ]);
    expect(problems.map((p) => p.code).sort()).toEqual([
      "non_positive_duration",
      "pitch_out_of_range",
      "velocity_out_of_range"
    ]);
    expect(problems.every((p) => p.noteId === "bad")).toBe(true);
  });
});

describe("visibleNotes", () => {
  // At 120 BPM one quarter note is 500ms, so these sit at 0, 500 and 1000ms.
  const notes = [
    note({ id: "a", startTick: 0 }),
    note({ id: "b", startTick: MIDI_PPQ }),
    note({ id: "c", startTick: MIDI_PPQ * 2 })
  ];

  it("triggers the notes whose onset is inside the window", () => {
    const visible = visibleNotes(
      { notes, inPointMs: 500, durationMs: 500 },
      120
    );
    expect(visible.map((n) => n.id)).toEqual(["b"]);
  });

  it("does not re-trigger a note that started before the window", () => {
    const long = [
      note({ id: "held", startTick: 0, durationTick: MIDI_PPQ * 8 })
    ];
    expect(
      visibleNotes({ notes: long, inPointMs: 1000, durationMs: 500 }, 120)
    ).toEqual([]);
  });

  it("keeps a note that runs past the window end — the renderer gates it", () => {
    const crossing = [
      note({ id: "over", startTick: 0, durationTick: MIDI_PPQ * 8 })
    ];
    expect(
      visibleNotes({ notes: crossing, inPointMs: 0, durationMs: 500 }, 120).map(
        (n) => n.id
      )
    ).toEqual(["over"]);
  });

  it("treats an absent in-point as zero and an absent list as empty", () => {
    expect(
      visibleNotes({ notes, durationMs: 600 }, 120).map((n) => n.id)
    ).toEqual(["a", "b"]);
    expect(visibleNotes({ durationMs: 1000 }, 120)).toEqual([]);
  });
});
