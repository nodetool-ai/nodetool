import { describe, expect, it } from "vitest";
import {
  CHORD_QUALITIES,
  CHORD_QUALITY_IDS,
  chordSymbol,
  parseChordSymbol,
  type ChordShape
} from "../src/index.js";

const ok = (text: string) => {
  const r = parseChordSymbol(text);
  if (!r.ok) throw new Error(r.error);
  return { root: r.root, quality: r.quality, inversion: r.inversion };
};

describe("chordSymbol", () => {
  it("writes ASCII roots and qualities", () => {
    expect(chordSymbol({ root: 9, quality: "min", inversion: 0 })).toBe("Am");
    expect(chordSymbol({ root: 10, quality: "dom7", inversion: 0 })).toBe("Bb7");
    expect(chordSymbol({ root: 6, quality: "m7b5", inversion: 0 })).toBe("F#m7b5");
    expect(chordSymbol({ root: 8, quality: "maj", inversion: 0 })).toBe("Ab");
    expect(chordSymbol({ root: 3, quality: "mMaj7", inversion: 0 })).toBe("Ebm(maj7)");
    expect(chordSymbol({ root: 0, quality: "sus7", inversion: 0 })).toBe("C7sus4");
    expect(chordSymbol({ root: 0, quality: "dom7s9", inversion: 0 })).toBe("C7#9");
  });
  it("adds the bass of an inversion", () => {
    expect(chordSymbol({ root: 0, quality: "maj", inversion: 1 })).toBe("C/E");
    expect(chordSymbol({ root: 0, quality: "add9", inversion: 3 })).toBe("Cadd9/D");
  });
});

describe("parseChordSymbol", () => {
  it("parses the vectors", () => {
    expect(ok("Am")).toEqual({ root: 9, quality: "min", inversion: 0 });
    expect(ok("C/E")).toEqual({ root: 0, quality: "maj", inversion: 1 });
    expect(ok("Bb7")).toEqual({ root: 10, quality: "dom7", inversion: 0 });
    expect(ok("F#m7b5")).toEqual({ root: 6, quality: "m7b5", inversion: 0 });
    expect(ok("Cadd9/D")).toEqual({ root: 0, quality: "add9", inversion: 3 });
  });
  it("refuses a bass outside the chord and names the chord tones", () => {
    const r = parseChordSymbol("C/D");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/C E G/);
  });
  it("refuses an unknown root and lists the accepted forms", () => {
    const r = parseChordSymbol("H7");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/C C# D Eb E F F# G Ab A Bb B/);
      expect(r.error).toMatch(/m7b5/);
    }
  });
  it("refuses an unknown quality and lists the accepted forms", () => {
    const r = parseChordSymbol("Cfoo");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/maj7/);
  });
  it("accepts the aliases", () => {
    const cases: Array<[string, ChordShape]> = [
      ["C♯m", { root: 1, quality: "min", inversion: 0 }],
      ["B♭", { root: 10, quality: "maj", inversion: 0 }],
      ["CM", { root: 0, quality: "maj", inversion: 0 }],
      ["Cmaj", { root: 0, quality: "maj", inversion: 0 }],
      ["Cmin", { root: 0, quality: "min", inversion: 0 }],
      ["C-", { root: 0, quality: "min", inversion: 0 }],
      ["C°", { root: 0, quality: "dim", inversion: 0 }],
      ["Co", { root: 0, quality: "dim", inversion: 0 }],
      ["C+", { root: 0, quality: "aug", inversion: 0 }],
      ["CM7", { root: 0, quality: "maj7", inversion: 0 }],
      ["CΔ", { root: 0, quality: "maj7", inversion: 0 }],
      ["CΔ7", { root: 0, quality: "maj7", inversion: 0 }],
      ["Cmin7", { root: 0, quality: "m7", inversion: 0 }],
      ["C-7", { root: 0, quality: "m7", inversion: 0 }],
      ["Cø", { root: 0, quality: "m7b5", inversion: 0 }],
      ["Cø7", { root: 0, quality: "m7b5", inversion: 0 }],
      ["C°7", { root: 0, quality: "dim7", inversion: 0 }],
      ["Co7", { root: 0, quality: "dim7", inversion: 0 }],
      ["C+7", { root: 0, quality: "aug7", inversion: 0 }],
      ["C7#5", { root: 0, quality: "aug7", inversion: 0 }],
      ["C7sus", { root: 0, quality: "sus7", inversion: 0 }],
      ["Csus", { root: 0, quality: "sus4", inversion: 0 }],
      ["CmMaj7", { root: 0, quality: "mMaj7", inversion: 0 }],
      ["CmM7", { root: 0, quality: "mMaj7", inversion: 0 }],
      ["Cmadd9", { root: 0, quality: "madd9", inversion: 0 }],
      ["C7♭9", { root: 0, quality: "dom7b9", inversion: 0 }]
    ];
    for (const [text, want] of cases) expect(ok(text), text).toEqual(want);
  });
  it("ignores whitespace around the text", () => {
    expect(ok("  Am  ")).toEqual({ root: 9, quality: "min", inversion: 0 });
  });
  it("round trips every root, quality and inversion with a first-occurrence bass", () => {
    let count = 0;
    for (let root = 0; root < 12; root++) {
      for (const quality of CHORD_QUALITY_IDS) {
        const pcs = CHORD_QUALITIES[quality].iv.map((i) => (root + i) % 12);
        for (let inversion = 0; inversion < pcs.length; inversion++) {
          if (pcs.indexOf(pcs[inversion]) !== inversion) continue;
          const c = { root, quality, inversion };
          const text = chordSymbol(c);
          expect(ok(text), text).toEqual(c);
          count++;
        }
      }
    }
    expect(count).toBeGreaterThan(500);
  });
});
