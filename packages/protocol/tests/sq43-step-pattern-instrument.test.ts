/**
 * SQ43 Step Pattern Saved Instrument — Protocol schema & tool contract tests.
 */
import { describe, expect, it } from "vitest";
import { uiToolParams } from "../src/api-schemas/ui-tool-contract.js";
import { buildTimelineToolContracts } from "../src/api-schemas/timeline-tool-contracts.js";
import * as timelineSchemas from "../src/api-schemas/timeline.js";

const VOCAB = {
  staggerUnits: ["word", "character", "line"] as [string, ...string[]],
  animatedProperties: ["offsetX", "offsetY", "opacity"],
  beatToleranceMs: 60
};

const basePattern = {
  version: 1 as const,
  seed: 1,
  lengthSteps: 16,
  stepRate: "1/16" as const,
  playback: "forward" as const,
  legato: false,
  swing: 0,
  swingDivision: "1/16" as const,
  pitchSource: "off" as const,
  scale: "chromatic" as const,
  noTranspose: false,
  scaleQuantize: false,
  midiChannel: 1,
  automationMode: "latch" as const,
  mono: false,
  name: "Test Pattern",
  rows: []
};

const sampleSubtractiveInstrument = {
  type: "subtractive" as const,
  waveform: "saw" as const,
  attackMs: 5,
  decayMs: 120,
  sustain: 0.7,
  releaseMs: 150,
  cutoffHz: 2400,
  resonance: 0.8,
  gainDb: -6
};

describe("SQ43 step pattern saved instrument protocol schema", () => {
  it("exports stepPatternAssetEnvelope validating optional instrument and instrumentPreset", () => {
    const schema = (
      timelineSchemas as Record<string, { parse: (v: unknown) => unknown; safeParse: (v: unknown) => { success: boolean } }>
    )["stepPatternAssetEnvelope"];
    expect(schema, "stepPatternAssetEnvelope must be exported from timeline schemas").toBeDefined();

    // Legacy saved pattern envelope without instrument fields remains valid.
    const legacy = {
      version: 1,
      name: "Legacy Beat",
      kind: "pattern",
      category: "user",
      tags: ["pattern", "user"],
      folder: "Step Patterns/Patterns",
      pattern: basePattern
    };
    const parsedLegacy = schema!.parse(legacy) as Record<string, unknown>;
    expect(parsedLegacy).not.toHaveProperty("instrument");
    expect(parsedLegacy).not.toHaveProperty("instrumentPreset");

    // Envelope with saved instrument and preset round-trips intact.
    const withInstrument = {
      ...legacy,
      instrument: sampleSubtractiveInstrument,
      instrumentPreset: "dr1-tr-void"
    };
    expect(schema!.parse(withInstrument)).toEqual(withInstrument);

    // Preset-only envelope is also valid.
    const presetOnly = {
      ...legacy,
      instrumentPreset: "bl1-acid"
    };
    expect(schema!.parse(presetOnly)).toEqual(presetOnly);

    // Malformed instrument or empty preset is rejected.
    expect(
      schema!.safeParse({ ...legacy, instrument: { type: "bogus" } }).success
    ).toBe(false);
    expect(
      schema!.safeParse({ ...legacy, instrumentPreset: "" }).success
    ).toBe(false);
  });

  it("documents saved instrument behavior on ui_timeline_apply_step_pattern and ui_timeline_save_step_pattern", () => {
    const contracts = buildTimelineToolContracts(VOCAB);
    const applyContract = contracts.ui_timeline_apply_step_pattern;
    const saveContract = contracts.ui_timeline_save_step_pattern;

    expect(applyContract.description.toLowerCase()).toContain("instrument");
    expect(saveContract.description.toLowerCase()).toContain("instrument");

    const applySchema = uiToolParams(applyContract);
    expect(
      applySchema.parse({
        trackId: "track_midi",
        atBar: 1,
        pattern: "Boom Bap"
      })
    ).toEqual({
      trackId: "track_midi",
      atBar: 1,
      pattern: "Boom Bap"
    });
    expect(
      applySchema.safeParse({ trackId: "track_midi", pattern: "Boom Bap", extra: 1 })
        .success
    ).toBe(false);
  });
});
