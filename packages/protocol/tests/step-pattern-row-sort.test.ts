/**
 * StepPattern.rowSort & ui_timeline_set_pattern_row_sort — Protocol schema & contract tests.
 */
import { describe, expect, it } from "vitest";
import { uiToolParams } from "../src/api-schemas/ui-tool-contract.js";
import { buildTimelineToolContracts } from "../src/api-schemas/timeline-tool-contracts.js";
import { SHARED_TIMELINE_TOOL_NAMES } from "../src/api-schemas/timeline-tool-params.js";
import {
  stepPattern,
  timelineDocument
} from "../src/api-schemas/timeline.js";

const VOCAB = {
  staggerUnits: ["word", "character", "line"] as [string, ...string[]],
  animatedProperties: ["offsetX", "offsetY", "opacity"],
  beatToleranceMs: 60
};

const EXPECTED_ROW_SORTS = [
  "none",
  "typeAsc",
  "typeDesc",
  "typeAndNoteAsc",
  "typeAndNoteDesc",
  "typeAndNameAsc",
  "typeAndNameDesc",
  "typeAndKitPadAsc",
  "typeAndKitPadDesc"
] as const;

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
  name: "Beat",
  rows: []
};

describe("StepPattern.rowSort protocol schema and tool contract", () => {
  it("accepts optional rowSort on stepPattern and round-trips through timelineDocument", () => {
    // Omitted rowSort stays valid for legacy documents.
    const withoutSort = stepPattern.parse(basePattern);
    expect(withoutSort).not.toHaveProperty("rowSort");

    for (const mode of EXPECTED_ROW_SORTS) {
      const parsed = stepPattern.parse({ ...basePattern, rowSort: mode });
      expect((parsed as Record<string, unknown>).rowSort).toBe(mode);
    }

    const doc = timelineDocument.parse({
      tracks: [
        { id: "t1", name: "Drums", type: "midi", index: 0, visible: true, locked: false }
      ],
      clips: [
        {
          id: "c1",
          trackId: "t1",
          name: "Beat",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          versions: [],
          locked: false,
          pattern: { ...basePattern, rowSort: "typeAndNoteAsc" }
        }
      ],
      markers: []
    });
    expect((doc.clips[0]!.pattern as Record<string, unknown>).rowSort).toBe(
      "typeAndNoteAsc"
    );

    expect(
      stepPattern.safeParse({ ...basePattern, rowSort: "invalidSort" }).success
    ).toBe(false);
  });

  it("registers ui_timeline_set_pattern_row_sort in SHARED_TIMELINE_TOOL_NAMES and contracts", () => {
    const contracts = buildTimelineToolContracts(VOCAB);
    expect(SHARED_TIMELINE_TOOL_NAMES).toContain(
      "ui_timeline_set_pattern_row_sort"
    );
    const contract = (contracts as Record<string, { description: string }>)[
      "ui_timeline_set_pattern_row_sort"
    ];
    expect(contract).toBeDefined();
    expect(contract!.description.length).toBeGreaterThan(20);

    const schema = uiToolParams(contract as never);
    for (const mode of EXPECTED_ROW_SORTS) {
      expect(schema.parse({ clipId: "c1", rowSort: mode })).toEqual({
        clipId: "c1",
        rowSort: mode
      });
    }
    expect(schema.safeParse({ clipId: "c1" }).success).toBe(false);
    expect(schema.safeParse({ clipId: "c1", rowSort: "bogus" }).success).toBe(
      false
    );
    expect(
      schema.safeParse({ clipId: "c1", rowSort: "none", extra: 1 }).success
    ).toBe(false);
  });
});
