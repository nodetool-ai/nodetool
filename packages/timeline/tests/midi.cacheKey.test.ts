import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIDI_INSTRUMENT,
  instrumentSignature
} from "../src/midi/instrument.js";
import { fnv1a, midiRenderKey } from "../src/midi/cacheKey.js";
import { MIDI_PPQ } from "../src/midi/ticks.js";
import type { MidiInstrument, MidiNote } from "../src/types.js";

const note = (over: Partial<MidiNote>): MidiNote => ({
  id: "n1",
  pitch: 60,
  velocity: 100,
  startTick: 0,
  durationTick: MIDI_PPQ,
  ...over
});

const base = {
  clip: { notes: [note({})], inPointMs: 0, durationMs: 1000 },
  bpm: 120,
  instrument: DEFAULT_MIDI_INSTRUMENT,
  sampleRate: 48000
};

describe("fnv1a", () => {
  it("returns eight hex digits and distinguishes near-identical input", () => {
    expect(fnv1a("")).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
    expect(fnv1a("abc")).toBe(fnv1a("abc"));
  });
});

describe("instrumentSignature", () => {
  it("names every sound-affecting field", () => {
    // Walk the instrument's own keys: a field added without being read here
    // would let the cache hand back audio rendered with the old value.
    const signature = instrumentSignature(DEFAULT_MIDI_INSTRUMENT);
    for (const key of Object.keys(DEFAULT_MIDI_INSTRUMENT)) {
      const field = key as keyof MidiInstrument;
      const changed: MidiInstrument = {
        ...DEFAULT_MIDI_INSTRUMENT,
        ...(field === "waveform"
          ? { waveform: "square" as const }
          : field === "type"
            ? {}
            : { [field]: (DEFAULT_MIDI_INSTRUMENT[field] as number) + 1 })
      };
      if (field === "type") continue;
      expect(instrumentSignature(changed), key).not.toBe(signature);
    }
  });
});

describe("midiRenderKey", () => {
  it("is stable across calls on the same input", () => {
    expect(midiRenderKey(base)).toBe(midiRenderKey(base));
    expect(midiRenderKey(base)).toMatch(/^midi-[0-9a-f]{8}$/);
  });

  it("ignores the order the notes arrive in", () => {
    const a = note({ id: "a", startTick: 0 });
    const b = note({ id: "b", startTick: MIDI_PPQ });
    expect(
      midiRenderKey({ ...base, clip: { ...base.clip, notes: [a, b] } })
    ).toBe(midiRenderKey({ ...base, clip: { ...base.clip, notes: [b, a] } }));
  });

  it("changes when any input field changes", () => {
    const key = midiRenderKey(base);
    const variants: Record<string, ReturnType<typeof midiRenderKey>> = {
      pitch: midiRenderKey({
        ...base,
        clip: { ...base.clip, notes: [note({ pitch: 61 })] }
      }),
      velocity: midiRenderKey({
        ...base,
        clip: { ...base.clip, notes: [note({ velocity: 101 })] }
      }),
      startTick: midiRenderKey({
        ...base,
        clip: { ...base.clip, notes: [note({ startTick: 1 })] }
      }),
      durationTick: midiRenderKey({
        ...base,
        clip: { ...base.clip, notes: [note({ durationTick: 961 })] }
      }),
      noteId: midiRenderKey({
        ...base,
        clip: { ...base.clip, notes: [note({ id: "other" })] }
      }),
      inPointMs: midiRenderKey({
        ...base,
        clip: { ...base.clip, inPointMs: 1 }
      }),
      durationMs: midiRenderKey({
        ...base,
        clip: { ...base.clip, durationMs: 1001 }
      }),
      bpm: midiRenderKey({ ...base, bpm: 121 }),
      sampleRate: midiRenderKey({ ...base, sampleRate: 44100 }),
      instrument: midiRenderKey({
        ...base,
        instrument: { ...DEFAULT_MIDI_INSTRUMENT, cutoffHz: 2000 }
      })
    };
    for (const [field, variant] of Object.entries(variants)) {
      expect(variant, field).not.toBe(key);
    }
  });

  it("treats an absent in-point as zero", () => {
    expect(
      midiRenderKey({
        ...base,
        clip: { notes: base.clip.notes, durationMs: 1000 }
      })
    ).toBe(midiRenderKey(base));
  });
});
