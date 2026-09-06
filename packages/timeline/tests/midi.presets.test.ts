import { describe, expect, it } from "vitest";
import { midiInstrument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  MIDI_INSTRUMENT_PRESETS,
  findInstrumentPreset,
  presetIdForInstrument
} from "../src/midi/presets.js";
import {
  DEFAULT_MIDI_INSTRUMENT,
  instrumentSignature
} from "../src/midi/instrument.js";

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
      expect(midiInstrument.parse(preset.instrument)).toEqual(preset.instrument);
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
});
