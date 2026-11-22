import { describe, expect, it } from "vitest";
import { chordSymbol, detectChordsFromAudio, mixWindowChroma, windowChroma } from "../src/index.js";

const SR = 44100;
const midiHz = (p: number) => 440 * 2 ** ((p - 69) / 12);

/** Sum of sines, one list of MIDI pitches per segment of `seconds` each. */
function synth(segments: Array<{ pitches: number[]; seconds: number }>): Float32Array {
  const total = segments.reduce((a, s) => a + Math.round(s.seconds * SR), 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const seg of segments) {
    const n = Math.round(seg.seconds * SR);
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (const p of seg.pitches) v += Math.sin((2 * Math.PI * midiHz(p) * (at + i)) / SR);
      out[at + i] = (0.5 * v) / Math.max(1, seg.pitches.length);
    }
    at += n;
  }
  return out;
}

const windows = (n: number, ms: number) =>
  Array.from({ length: n }, (_, i) => ({ startMs: i * ms, endMs: (i + 1) * ms }));
const names = (chords: ReturnType<typeof detectChordsFromAudio>) =>
  chords.map((c) => [chordSymbol(c), c.startTick, c.durationTick]);

describe("detectChordsFromAudio", () => {
  it("names C E G as C", () => {
    const x = synth([{ pitches: [60, 64, 67], seconds: 2 }]);
    expect(names(detectChordsFromAudio(x, SR, windows(1, 2000)))).toEqual([["C", 0, 2000]]);
  });
  it("names A C E as Am", () => {
    const x = synth([{ pitches: [57, 60, 64], seconds: 2 }]);
    expect(names(detectChordsFromAudio(x, SR, windows(1, 2000)))).toEqual([["Am", 0, 2000]]);
  });
  it("follows a change from C to G", () => {
    const x = synth([
      { pitches: [60, 64, 67], seconds: 1 },
      { pitches: [55, 59, 62], seconds: 1 }
    ]);
    expect(names(detectChordsFromAudio(x, SR, windows(2, 1000)))).toEqual([
      ["C", 0, 1000],
      ["G", 1000, 1000]
    ]);
  });
  it("reads a C F G C progression over 4 bars", () => {
    // 4/4 at 120 bpm: one bar is 2 s.
    const x = synth([
      { pitches: [48, 60, 64, 67], seconds: 2 },
      { pitches: [53, 60, 65, 69], seconds: 2 },
      { pitches: [43, 62, 67, 71], seconds: 2 },
      { pitches: [48, 60, 64, 67], seconds: 2 }
    ]);
    expect(names(detectChordsFromAudio(x, SR, windows(4, 2000))).map((c) => c[0])).toEqual(["C", "F", "G", "C"]);
  });
  it("finds nothing in silence and holds a chord over a silent window", () => {
    const silent = new Float32Array(SR);
    expect(detectChordsFromAudio(silent, SR, windows(1, 1000))).toEqual([]);
    const x = synth([{ pitches: [60, 64, 67], seconds: 1 }]);
    const padded = new Float32Array(2 * SR);
    padded.set(x);
    expect(names(detectChordsFromAudio(padded, SR, windows(2, 1000)))).toEqual([["C", 0, 2000]]);
  });
  it("works at 48 kHz", () => {
    const sr = 48000;
    const x = new Float32Array(sr * 2);
    for (let i = 0; i < x.length; i++) {
      x[i] = (0.5 * [57, 60, 64].reduce((a, p) => a + Math.sin((2 * Math.PI * midiHz(p) * i) / sr), 0)) / 3;
    }
    expect(names(detectChordsFromAudio(x, sr, windows(1, 2000)))).toEqual([["Am", 0, 2000]]);
  });
  it("reads the tail of a multi-frame window", () => {
    // 6143 samples: silence for the first 4096, then C E G. Frames at 0 only would hear nothing.
    const x = new Float32Array(6143);
    const chord = synth([{ pitches: [60, 64, 67], seconds: 6143 / SR }]);
    x.set(chord.subarray(0, 6143 - 4096), 4096);
    const out = detectChordsFromAudio(x, SR, [{ startMs: 0, endMs: (6143 * 1000) / SR }]);
    expect(out.map((c) => chordSymbol(c))).toEqual(["C"]);
  });
  it("reads a 50 ms window without a step at its edge", () => {
    const x = synth([{ pitches: [60, 64, 67], seconds: 1 }]);
    expect(names(detectChordsFromAudio(x, SR, [{ startMs: 100, endMs: 150 }])).map((c) => c[0])).toEqual(["C"]);
  });
  it("hears a 55 Hz bass at 22.05 kHz, as at 44.1 and 48 kHz", () => {
    for (const sr of [22050, 44100, 48000]) {
      const x = new Float32Array(sr * 2);
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        x[i] =
          0.6 * Math.sin(2 * Math.PI * 55 * t) +
          0.15 * [60, 64, 67].reduce((a, p) => a + Math.sin(2 * Math.PI * midiHz(p) * t), 0);
      }
      expect(windowChroma(x, sr, 0, x.length)?.bass).toBe(9);
    }
  });
  it("weights the bass vote by frame energy, so a quiet hum cannot outvote a chord hit", () => {
    // 250 ms C major hit over C2, then 1.75 s of a 60 Hz (B) hum 50 dB down.
    const n = 2 * SR;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      x[i] =
        i < 0.25 * SR
          ? 0.5 * Math.sin(2 * Math.PI * midiHz(36) * t) + 0.1 * [60, 64, 67].reduce((a, p) => a + Math.sin(2 * Math.PI * midiHz(p) * t), 0)
          : 0.003 * Math.sin(2 * Math.PI * 60 * t);
    }
    const c = windowChroma(x, SR, 0, n)!;
    expect(c.bass).toBe(0);
  });
  it("drops a bass whose pitch class is below the chroma floor", () => {
    const c = windowChroma(synth([{ pitches: [60, 64, 67], seconds: 1 }]), SR, 0, SR)!;
    expect(c.bass === -1 || c.weights[c.bass] > 0).toBe(true);
  });
  it("mixes sources by level and takes the lowest bass", () => {
    const piano = windowChroma(synth([{ pitches: [60, 64, 67], seconds: 2 }]), SR, 0, 2 * SR)!;
    const bassOnly = new Float32Array(2 * SR);
    for (let i = 0; i < bassOnly.length; i++) bassOnly[i] = 0.5 * Math.sin((2 * Math.PI * midiHz(40) * i) / SR);
    const bass = windowChroma(bassOnly, SR, 0, 2 * SR)!;
    const mixed = mixWindowChroma([piano, bass])!;
    expect(mixed.bass).toBe(4);
    // A near-silent bleed does not move the result.
    const bleed = { ...bass, level: 1e-4, bass: 11, bassHz: 30 };
    expect(mixWindowChroma([piano, bleed])!.bass).not.toBe(11);
  });
});
