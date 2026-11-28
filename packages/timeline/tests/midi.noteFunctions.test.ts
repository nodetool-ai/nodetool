import { describe, expect, it } from "vitest";
import type { MidiNote } from "../src/types.js";
import {
  applyNoOverlap,
  collapsedRows,
  deleteDuplicates,
  forceLegato,
  glueNotes,
  removeOverlaps,
  scaleQuantizeNotes,
  smartSnapTicks,
  snapPitchToScale,
  velocityColor
} from "../src/midi/noteFunctions.js";

function n(
  id: string,
  pitch: number,
  startTick: number,
  durationTick: number,
  extra: Partial<MidiNote> = {}
): MidiNote {
  return { id, pitch, startTick, durationTick, velocity: 100, ...extra };
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];

describe("velocityColor", () => {
  it("matches the contract vectors", () => {
    expect(velocityColor(0)).toEqual([110, 91, 216]);
    expect(velocityColor(1)).toEqual([110, 91, 216]);
    expect(velocityColor(80)).toEqual([108, 191, 78]);
    expect(velocityColor(90)).toEqual([155, 193, 71]);
    expect(velocityColor(127)).toEqual([224, 69, 58]);
  });
  it("clamps above 127", () => {
    expect(velocityColor(300)).toEqual([224, 69, 58]);
  });
});

describe("snapPitchToScale", () => {
  it("C major", () => {
    for (const [from, to] of [
      [61, 60],
      [66, 65],
      [63, 62],
      [70, 69],
      [127, 127]
    ]) {
      expect(snapPitchToScale(from, 0, MAJOR)).toBe(to);
    }
  });
  it("G major and A minor pentatonic", () => {
    expect(snapPitchToScale(65, 7, MAJOR)).toBe(64);
    expect(snapPitchToScale(66, 9, [0, 3, 5, 7, 10])).toBe(67);
    expect(snapPitchToScale(65, 9, [0, 3, 5, 7, 10])).toBe(64);
  });
  it("leaves empty and chromatic scales unchanged", () => {
    expect(snapPitchToScale(61, 0, [])).toBe(61);
    expect(
      snapPitchToScale(61, 0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    ).toBe(61);
  });
});

describe("scaleQuantizeNotes", () => {
  it("snaps listed notes only", () => {
    const out = scaleQuantizeNotes(
      [n("a", 61, 0, 10), n("b", 61, 0, 10)],
      0,
      MAJOR,
      ["a"]
    );
    expect(out.map((x) => x.pitch)).toEqual([60, 61]);
  });
  it("snaps all notes without ids", () => {
    const out = scaleQuantizeNotes([n("a", 61, 0, 10), n("b", 66, 0, 10)], 0, MAJOR);
    expect(out.map((x) => x.pitch)).toEqual([60, 65]);
  });
});

describe("smartSnapTicks", () => {
  it("matches the contract vectors", () => {
    expect(smartSnapTicks(0.05, 960, 4)).toBe(480);
    expect(smartSnapTicks(0.2, 960, 4)).toBe(120);
    expect(smartSnapTicks(0.02, 960, 4)).toBe(960);
    expect(smartSnapTicks(0.01, 960, 4)).toBe(3840);
    expect(smartSnapTicks(0.001, 960, 4)).toBe(3840);
  });
});

describe("collapsedRows", () => {
  it("returns distinct pitches descending", () => {
    expect(collapsedRows([n("a", 60, 0, 1), n("b", 64, 0, 1), n("c", 60, 0, 1), n("d", 72, 0, 1)])).toEqual([72, 64, 60]);
  });
});

describe("glueNotes", () => {
  it("merges the selected note with the clicked one", () => {
    const a = n("a", 60, 0, 240, { velocity: 100 });
    const b = n("b", 60, 480, 240, { velocity: 50 });
    const c = n("c", 62, 0, 240);
    const d = n("d", 60, 960, 240);
    const out = glueNotes([a, b, c, d], ["a"], "b");
    expect(out).toEqual([{ ...a, durationTick: 720 }, c, d]);
  });
  it("does nothing for a lone note", () => {
    const a = n("a", 60, 0, 240);
    expect(glueNotes([a], [], "a")).toEqual([a]);
  });
});

describe("forceLegato", () => {
  it("extends to the next start of any pitch", () => {
    const notes = [n("a", 60, 0, 100), n("b", 64, 480, 100), n("c", 67, 480, 200), n("d", 60, 1200, 100)];
    const out = forceLegato(notes, ["a", "b", "c", "d"]);
    expect(out.map((x) => x.durationTick)).toEqual([480, 720, 720, 100]);
  });
});

describe("removeOverlaps", () => {
  it("trims to the next same-pitch start", () => {
    const notes = [n("a", 60, 0, 600), n("b", 60, 480, 240), n("c", 62, 100, 1000)];
    const out = removeOverlaps(notes, ["a", "c"]);
    expect(out.map((x) => x.durationTick)).toEqual([480, 240, 1000]);
  });
});

describe("deleteDuplicates", () => {
  it("removes listed later duplicates", () => {
    const notes = [n("a", 60, 0, 10), n("b", 60, 0, 10), n("c", 60, 0, 10, { channel: 1 }), n("d", 62, 0, 10)];
    expect(deleteDuplicates(notes, ["b", "c", "d"]).map((x) => x.id)).toEqual(["a", "c", "d"]);
  });
});

describe("applyNoOverlap", () => {
  it("shortens an earlier note", () => {
    const out = applyNoOverlap([n("N", 60, 0, 960), n("M", 60, 480, 960)], ["M"]);
    expect(out.find((x) => x.id === "N")!.durationTick).toBe(480);
    expect(out.find((x) => x.id === "M")!.durationTick).toBe(960);
  });
  it("shortens the moved note against a later one", () => {
    const out = applyNoOverlap([n("M", 60, 0, 960), n("N", 60, 480, 240)], ["M"]);
    expect(out.find((x) => x.id === "M")!.durationTick).toBe(480);
    expect(out.find((x) => x.id === "N")!.durationTick).toBe(240);
  });
  it("removes a same-start note", () => {
    const out = applyNoOverlap([n("M", 60, 0, 240), n("N", 60, 0, 480)], ["M"]);
    expect(out.map((x) => x.id)).toEqual(["M"]);
  });
});
