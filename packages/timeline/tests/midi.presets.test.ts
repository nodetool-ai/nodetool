import { describe, expect, it } from "vitest";
import { midiInstrument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  MIDI_INSTRUMENT_PRESETS,
  findInstrumentPreset,
  presetIdForInstrument
} from "../src/midi/presets.js";
import {
  DEFAULT_MIDI_INSTRUMENT,
  instrumentSignature,
  instrumentTailMs
} from "../src/midi/instrument.js";
import { renderInstrumentEvents } from "../src/midi/voice.js";

const SAMPLE_RATE = 48000;
const frame = (ms: number): number => Math.round((ms * SAMPLE_RATE) / 1000);
const peak = (samples: Float32Array): number =>
  samples.reduce((highest, sample) => Math.max(highest, Math.abs(sample)), 0);
const rms = (samples: Float32Array): number =>
  Math.sqrt(
    samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length
  );

const soundtrackIds = [
  "wt1-cinematic-strings",
  "wt1-chamber-strings",
  "wt1-short-strings",
  "wt1-low-strings",
  "wt1-warm-brass",
  "wt1-air-choir",
  "wt1-dark-swell",
  "wt1-soft-keys",
  "wt1-glass-mallet",
  "wt1-muted-pluck",
  "bl1-cinematic-sub",
  "bl1-score-pulse",
  "bl1-rounded-bass",
  "dr1-cinematic"
];

describe("instrument presets", () => {
  it("ships the six voices the tools name, with unique ids", () => {
    const ids = MIDI_INSTRUMENT_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "saw-lead",
        "square-lead",
        "soft-pad",
        "pluck",
        "bass",
        "bell"
      ])
    );
  });

  it("stores what the document schema accepts", () => {
    for (const preset of MIDI_INSTRUMENT_PRESETS) {
      expect(midiInstrument.parse(preset.instrument)).toEqual(
        preset.instrument
      );
      expect(preset.name.length).toBeGreaterThan(0);
    }
  });

  it("gives every preset a different sound", () => {
    const signatures = MIDI_INSTRUMENT_PRESETS.map((preset) =>
      instrumentSignature(preset.instrument)
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("keeps the default instrument equal to saw-lead", () => {
    expect(findInstrumentPreset("saw-lead")?.instrument).toEqual(
      DEFAULT_MIDI_INSTRUMENT
    );
  });

  it("finds a preset by id, and an id back from an instrument", () => {
    expect(findInstrumentPreset("pluck")?.name).toBe("Pluck");
    expect(findInstrumentPreset("nope")).toBeUndefined();
    expect(presetIdForInstrument(DEFAULT_MIDI_INSTRUMENT)).toBe("saw-lead");
    expect(
      presetIdForInstrument({ ...DEFAULT_MIDI_INSTRUMENT, cutoffHz: 1234 })
    ).toBeUndefined();
  });

  it.each(soundtrackIds)(
    "renders %s with headroom and a complete tail",
    (id) => {
      const preset = findInstrumentPreset(id);
      expect(preset).toBeDefined();
      if (!preset) throw new Error(`Missing preset ${id}`);
      const instrument = midiInstrument.parse(
        JSON.parse(JSON.stringify(preset.instrument))
      );
      expect(presetIdForInstrument(instrument)).toBe(id);
      const pitches =
        instrument.type === "bass"
          ? [36]
          : instrument.type === "drum"
            ? [36, 38, 44]
            : [48, 55, 60, 64];
      const samples = renderInstrumentEvents(
        pitches.map((pitch) => ({
          pitch,
          velocity: 110,
          startFrame: 0,
          gateOffFrame: frame(3000)
        })),
        frame(3000 + instrumentTailMs(instrument) + 100),
        instrument,
        SAMPLE_RATE
      );
      expect(samples.every(Number.isFinite)).toBe(true);
      expect(peak(samples)).toBeGreaterThan(0.015);
      expect(peak(samples)).toBeLessThan(0.85);
      expect(rms(samples.subarray(0, frame(3000)))).toBeGreaterThan(0.002);
      expect(peak(samples.subarray(-frame(50)))).toBeLessThan(0.00001);
    }
  );

  it("gives cinematic strings a swell and short strings a detached articulation", () => {
    const render = (id: string): Float32Array => {
      const preset = findInstrumentPreset(id);
      if (!preset) throw new Error(`Missing preset ${id}`);
      return renderInstrumentEvents(
        [
          { pitch: 60, velocity: 100, startFrame: 0, gateOffFrame: frame(1800) }
        ],
        frame(2200),
        preset.instrument,
        SAMPLE_RATE
      );
    };
    const strings = render("wt1-cinematic-strings");
    const short = render("wt1-short-strings");
    expect(rms(strings.subarray(frame(400), frame(700)))).toBeGreaterThan(
      rms(strings.subarray(0, frame(50))) * 3
    );
    expect(rms(strings.subarray(frame(1900), frame(2100)))).toBeGreaterThan(
      0.002
    );
    expect(peak(short.subarray(0, frame(200)))).toBeGreaterThan(0.015);
    expect(peak(short.subarray(frame(500)))).toBeLessThan(0.00001);
  });

  it("makes every cinematic percussion pad audible with a short MIDI trigger", () => {
    const instrument = findInstrumentPreset("dr1-cinematic")?.instrument;
    if (instrument?.type !== "drum") throw new Error("Missing cinematic kit");
    expect(instrument.pads).toHaveLength(16);
    for (const [index, pad] of instrument.pads.entries()) {
      const samples = renderInstrumentEvents(
        [
          {
            pitch: instrument.baseNote + index,
            velocity: 110,
            startFrame: 0,
            gateOffFrame: frame(5)
          }
        ],
        frame(instrumentTailMs(instrument) + 100),
        instrument,
        SAMPLE_RATE
      );
      expect(samples.every(Number.isFinite), pad.name).toBe(true);
      expect(peak(samples), pad.name).toBeGreaterThan(0.005);
      expect(peak(samples), pad.name).toBeLessThan(0.85);
      expect(peak(samples.subarray(-frame(50))), pad.name).toBe(0);
    }
  });
});
