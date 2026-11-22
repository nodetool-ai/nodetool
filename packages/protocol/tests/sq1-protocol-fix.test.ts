/**
 * SQ1 Fix Round Wave 1 — Protocol schema & description defects (F25, F26, F32).
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildTimelineToolContracts } from "../src/api-schemas/timeline-tool-contracts.js";
import {
  MOVE_PATTERN_ROW_DESCRIPTION,
  SORT_PATTERN_ROWS_DESCRIPTION,
  addPatternRowsParams,
  convertMidiToPatternParams,
  nudgePatternValuesParams,
  randomizePatternParams,
  setPatternParams,
  setPatternRowParams,
  setStepsParams
} from "../src/api-schemas/timeline-tool-params.js";

describe("SQ1 Fix Round — Protocol schemas (F25, F26, F32)", () => {
  it("F25: tool descriptions match their Zod validators and actual behavior", () => {
    // 1. set_pattern.key describes { tonic, mode }, not { tonic, scale }
    const keyDesc = setPatternParams.shape.key.description ?? "";
    expect(keyDesc).toContain("mode");
    expect(keyDesc).not.toMatch(/\{\s*tonic\s*,\s*scale\s*\}/);

    // 2. randomize_pattern.mode lists "onOff", not "on"
    const randModeDesc = randomizePatternParams.shape.mode.description ?? "";
    expect(randModeDesc).toContain("onOff");
    expect(randModeDesc).not.toMatch(/\(\s*e\.g\.\s*on\b/);

    // 3. convert_midi_to_pattern.stepRate accurately says it defaults to 1/16
    const rateDesc = convertMidiToPatternParams.shape.stepRate.description ?? "";
    expect(rateDesc).toContain("1/16");
    expect(rateDesc).not.toMatch(/finest note spacing/i);

    // 4. set_pattern.legato describes gate-100 +1 tick overlap (SQ12)
    const legatoDesc = setPatternParams.shape.legato.description ?? "";
    expect(legatoDesc).toMatch(/gate.?100|\+1\s*tick/i);
    expect(legatoDesc).not.toMatch(/extend each note to the next note/i);

    // 5. move_pattern_row and sort_pattern_rows do not claim nonexistent sort-order state
    expect(MOVE_PATTERN_ROW_DESCRIPTION).not.toMatch(/clear automatic row sorting/i);
    expect(SORT_PATTERN_ROWS_DESCRIPTION).not.toMatch(/record the sort order/i);
  });

  it("F26: row schemas accept automationMode, color, subrowsExpanded and step value accepts wide/fractional numbers", () => {
    const addParsed = addPatternRowsParams.parse({
      clipId: "c1",
      rows: [
        {
          param: "cutoffHz",
          automationMode: "slide",
          color: "#ff6600",
          subrowsExpanded: true
        }
      ]
    });
    expect(addParsed.rows[0]).toMatchObject({
      automationMode: "slide",
      color: "#ff6600",
      subrowsExpanded: true
    });

    const setRowParsed = setPatternRowParams.parse({
      clipId: "c1",
      row: "r1",
      automationMode: "latch",
      color: "#00aa88",
      subrowsExpanded: false
    });
    expect(setRowParsed).toMatchObject({
      automationMode: "latch",
      color: "#00aa88",
      subrowsExpanded: false
    });

    const stepParsed = setStepsParams.parse({
      clipId: "c1",
      row: "r1",
      steps: "1",
      values: { value: 18000 }
    });
    expect(stepParsed.values?.value).toBe(18000);

    const nudgeParsed = nudgePatternValuesParams.parse({
      clipId: "c1",
      mode: "value",
      delta: 0.25,
      row: "r1"
    });
    expect(nudgeParsed.delta).toBe(0.25);
  });

  it("F32: ui_timeline_trim_clip contract accepts startMs for head-trim", () => {
    const contracts = buildTimelineToolContracts({
      staggerUnits: ["clip"],
      animatedProperties: ["opacity"],
      beatToleranceMs: 60
    });
    const schema = z.object(contracts.ui_timeline_trim_clip.shape);
    const parsed = schema.parse({ target: "c1", startMs: 500 });
    expect((parsed as Record<string, unknown>).startMs).toBe(500);
  });
});
