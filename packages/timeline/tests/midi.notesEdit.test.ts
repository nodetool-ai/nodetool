import { describe, expect, it } from "vitest";
import {
  addNote,
  duplicateNotes,
  moveNotes,
  notesInRect,
  removeNotes,
  resizeNotes,
  setVelocity,
  snapTick
} from "../src/midi/notesEdit.js";
import { validateNotes } from "../src/midi/notes.js";
import type { MidiNote } from "../src/types.js";

const note = (over: Partial<MidiNote> = {}): MidiNote => ({
  id: "n1",
  pitch: 60,
  velocity: 100,
  startTick: 0,
  durationTick: 240,
  ...over
});

describe("addNote", () => {
  it("appends a note with a fresh id and the default velocity", () => {
    const added = addNote([note({ id: "a" })], {
      pitch: 64,
      startTick: 480,
      durationTick: 240
    });
    expect(added).toHaveLength(2);
    expect(added[1]!.id).not.toBe("a");
    expect(added[1]!.velocity).toBe(100);
    expect(added[1]!.pitch).toBe(64);
    expect(added[1]!.startTick).toBe(480);
    expect(validateNotes(added)).toEqual([]);
  });

  it("clamps a note the pointer put outside what the document stores", () => {
    const added = addNote([], {
      pitch: 200,
      startTick: -40,
      durationTick: 0,
      velocity: 900
    });
    expect(added[0]!.pitch).toBe(127);
    expect(added[0]!.startTick).toBe(0);
    expect(added[0]!.durationTick).toBe(1);
    expect(added[0]!.velocity).toBe(127);
    expect(validateNotes(added)).toEqual([]);
  });
});

describe("removeNotes", () => {
  it("drops the named notes and leaves the rest in order", () => {
    const list = [note({ id: "a" }), note({ id: "b" }), note({ id: "c" })];
    expect(removeNotes(list, ["b"]).map((n) => n.id)).toEqual(["a", "c"]);
  });

  it("ignores an id the list does not carry, and an empty selection", () => {
    const list = [note({ id: "a" })];
    expect(removeNotes(list, ["zzz"]).map((n) => n.id)).toEqual(["a"]);
    expect(removeNotes(list, []).map((n) => n.id)).toEqual(["a"]);
  });
});

describe("moveNotes", () => {
  it("moves only the named notes, in ticks and semitones", () => {
    const moved = moveNotes(
      [note({ id: "a", startTick: 240 }), note({ id: "b", startTick: 960 })],
      ["a"],
      { deltaTick: 240, deltaPitch: 2 }
    );
    expect(moved.map((n) => [n.id, n.startTick, n.pitch])).toEqual([
      ["a", 480, 62],
      ["b", 960, 60]
    ]);
  });

  it("clamps the tick delta by the group's earliest onset", () => {
    const moved = moveNotes(
      [
        note({ id: "a", startTick: 240 }),
        note({ id: "b", startTick: 720 })
      ],
      ["a", "b"],
      { deltaTick: -5000, deltaPitch: 0 }
    );
    // The earliest note stops at 0 and the later one keeps its 480-tick gap.
    expect(moved.map((n) => n.startTick)).toEqual([0, 480]);
  });

  it("clamps the pitch delta by the group's extremes, keeping the interval", () => {
    const up = moveNotes(
      [note({ id: "a", pitch: 100 }), note({ id: "b", pitch: 120 })],
      ["a", "b"],
      { deltaTick: 0, deltaPitch: 40 }
    );
    expect(up.map((n) => n.pitch)).toEqual([107, 127]);

    const down = moveNotes(
      [note({ id: "a", pitch: 5 }), note({ id: "b", pitch: 25 })],
      ["a", "b"],
      { deltaTick: 0, deltaPitch: -40 }
    );
    expect(down.map((n) => n.pitch)).toEqual([0, 20]);
  });

  it("returns the list unchanged for an empty selection or a zero delta", () => {
    const list = [note({ id: "a" })];
    expect(moveNotes(list, [], { deltaTick: 12, deltaPitch: 3 })).toEqual(list);
    expect(moveNotes(list, ["a"], { deltaTick: 0, deltaPitch: 0 })).toEqual(
      list
    );
  });
});

describe("resizeNotes", () => {
  it("lengthens the named notes and holds their onsets", () => {
    const resized = resizeNotes(
      [note({ id: "a", startTick: 480, durationTick: 240 })],
      ["a"],
      240,
      60
    );
    expect(resized[0]!.durationTick).toBe(480);
    expect(resized[0]!.startTick).toBe(480);
  });

  it("stops each note at the minimum length rather than inverting it", () => {
    const resized = resizeNotes(
      [note({ id: "a", durationTick: 240 }), note({ id: "b", durationTick: 960 })],
      ["a", "b"],
      -900,
      120
    );
    expect(resized.map((n) => n.durationTick)).toEqual([120, 120]);
    expect(validateNotes(resized)).toEqual([]);
  });

  it("never floors below one tick, whatever the caller asks for", () => {
    const resized = resizeNotes([note({ id: "a" })], ["a"], -10_000, 0);
    expect(resized[0]!.durationTick).toBe(1);
  });
});

describe("setVelocity", () => {
  it("sets the named notes and clamps to 1..127", () => {
    const list = [note({ id: "a" }), note({ id: "b" })];
    expect(setVelocity(list, ["a"], 42).map((n) => n.velocity)).toEqual([
      42, 100
    ]);
    expect(setVelocity(list, ["a"], 0)[0]!.velocity).toBe(1);
    expect(setVelocity(list, ["a"], 400)[0]!.velocity).toBe(127);
  });
});

describe("duplicateNotes", () => {
  it("appends copies at the offset with fresh ids", () => {
    const list = [note({ id: "a", startTick: 0 }), note({ id: "b", startTick: 240 })];
    const copied = duplicateNotes(list, ["a", "b"], 960);
    expect(copied).toHaveLength(4);
    expect(copied.slice(2).map((n) => n.startTick)).toEqual([960, 1200]);
    expect(new Set(copied.map((n) => n.id)).size).toBe(4);
    expect(validateNotes(copied)).toEqual([]);
  });

  it("never copies a note behind the content start", () => {
    const copied = duplicateNotes([note({ id: "a", startTick: 100 })], ["a"], -500);
    expect(copied[1]!.startTick).toBe(0);
  });
});

describe("notesInRect", () => {
  const list = [
    note({ id: "short", pitch: 60, startTick: 0, durationTick: 240 }),
    note({ id: "held", pitch: 64, startTick: 0, durationTick: 3840 }),
    note({ id: "late", pitch: 60, startTick: 3840, durationTick: 240 })
  ];

  it("takes a note the rect only overlaps, not just one it contains", () => {
    const hit = notesInRect(list, {
      fromTick: 960,
      toTick: 1920,
      minPitch: 60,
      maxPitch: 72
    });
    expect(hit.map((n) => n.id)).toEqual(["held"]);
  });

  it("excludes notes outside the pitch band", () => {
    const hit = notesInRect(list, {
      fromTick: 0,
      toTick: 480,
      minPitch: 60,
      maxPitch: 61
    });
    expect(hit.map((n) => n.id)).toEqual(["short"]);
  });

  it("reads a rect dragged right-to-left and bottom-to-top the same way", () => {
    const hit = notesInRect(list, {
      fromTick: 1920,
      toTick: 960,
      minPitch: 72,
      maxPitch: 60
    });
    expect(hit.map((n) => n.id)).toEqual(["held"]);
  });

  it("excludes a note that ends exactly where the rect starts", () => {
    expect(
      notesInRect(list, {
        fromTick: 240,
        toTick: 480,
        minPitch: 60,
        maxPitch: 60
      })
    ).toEqual([]);
  });
});

describe("snapTick", () => {
  it("rounds to the nearest grid step", () => {
    expect(snapTick(230, 240)).toBe(240);
    expect(snapTick(100, 240)).toBe(0);
    expect(snapTick(700, 240)).toBe(720);
  });

  it("never returns a negative tick", () => {
    expect(snapTick(-100, 240)).toBe(0);
    expect(snapTick(-100, 0)).toBe(0);
  });

  it("passes the tick through when there is no grid", () => {
    expect(snapTick(517.4, 0)).toBe(517);
    expect(snapTick(517.4, Number.NaN)).toBe(517);
  });
});
