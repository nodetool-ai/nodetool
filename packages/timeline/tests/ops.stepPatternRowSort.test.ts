/**
 * StepPattern.rowSort & set_pattern_row_sort — Timeline model, parse, op, and parity fixture tests.
 */
import { describe, expect, it } from "vitest";
import { stepRowSort } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  DEFAULT_TEMPO,
  addPatternRow,
  findInstrumentPreset,
  makeClip,
  makeTrack,
  normalizePattern,
  patternFromText,
  validateStepPattern,
  type DrumMidiInstrument,
  type StepPattern,
  type TimelineClip,
  type TimelineTrack
} from "../src/index.js";
import * as stepPatternMod from "../src/midi/stepPattern.js";
import {
  TIMELINE_OP_NAMES,
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOpState
} from "../src/ops/index.js";
import { FIXTURES, directContext } from "../src/testing/ops.js";

const DR1 = findInstrumentPreset("dr1-tr-void")!.instrument as DrumMidiInstrument;

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

function makeState(tracks: TimelineTrack[], clips: TimelineClip[]): TimelineOpState {
  return {
    tempo: DEFAULT_TEMPO,
    fps: 30,
    width: 1920,
    height: 1080,
    tracks,
    clips,
    markers: [],
    mediaTracks: [],
    playheadMs: 0,
    selectedClipIds: []
  };
}

function dr1Track(id = "t1"): TimelineTrack {
  return makeTrack({ id, type: "midi", name: "Drums", index: 0, instrument: DR1 });
}

function patClip(id: string, pattern: StepPattern, trackId = "t1"): TimelineClip {
  return makeClip({
    id,
    trackId,
    name: pattern.name,
    startMs: 0,
    durationMs: 2000,
    mediaType: "midi",
    sourceType: "imported",
    status: "generated",
    pattern
  });
}

describe("StepPattern.rowSort model, op, and parity fixture", () => {
  it("exports STEP_ROW_SORTS matching protocol and normalizes/validates rowSort", () => {
    const exported = (stepPatternMod as Record<string, unknown>)["STEP_ROW_SORTS"];
    expect(exported).toEqual([...stepRowSort.options]);
    expect(exported).toEqual([...EXPECTED_ROW_SORTS]);

    // Default pattern omits rowSort; explicit "none" normalizes to omitted.
    expect(normalizePattern({})).not.toHaveProperty("rowSort");
    expect(
      normalizePattern({ rowSort: "none" } as Partial<StepPattern>)
    ).not.toHaveProperty("rowSort");

    const withSort = normalizePattern({
      rowSort: "typeAndNoteAsc"
    } as Partial<StepPattern>);
    expect((withSort as unknown as Record<string, unknown>).rowSort).toBe(
      "typeAndNoteAsc"
    );

    const problems = validateStepPattern({
      ...normalizePattern({}),
      rowSort: "badSort"
    } as StepPattern);
    expect(problems.join("\n")).toMatch(/rowSort/i);
    expect(problems.join("\n")).toContain("typeAndNoteAsc");
  });

  it("addPatternRow keeps newly added rows in sorted order when rowSort is set", () => {
    const base = normalizePattern({
      rowSort: "typeAndNoteAsc",
      rows: [
        { id: "r1", assignment: { type: "note", pitch: 36 } },
        { id: "r2", assignment: { type: "note", pitch: 38 } }
      ]
    } as Partial<StepPattern>);

    const next = addPatternRow(base, {
      id: "r3",
      assignment: { type: "note", pitch: 37 }
    });
    expect(
      next.rows.map((r) => (r.assignment as { pitch: number }).pitch)
    ).toEqual([36, 37, 38]);
  });

  it("parses and registers set_pattern_row_sort in TIMELINE_OP_NAMES and FIXTURES", () => {
    expect(TIMELINE_OP_NAMES).toContain("set_pattern_row_sort");
    expect(FIXTURES.some((f) => f.tool === "set_pattern_row_sort")).toBe(true);

    for (const mode of EXPECTED_ROW_SORTS) {
      const parsed = timelineOpFromToolArgs("set_pattern_row_sort" as never, {
        clipId: "c1",
        rowSort: mode
      });
      expect(parsed).toEqual({
        op: "set_pattern_row_sort",
        clipId: "c1",
        rowSort: mode
      });
    }
    expect(() =>
      timelineOpFromToolArgs("set_pattern_row_sort" as never, {
        clipId: "c1",
        rowSort: "invalid"
      })
    ).toThrow();
  });

  it("set_pattern_row_sort sorts existing rows, reports rowSort in get_pattern, and keeps add_pattern_rows sorted", async () => {
    const pat = patternFromText(
      "Snare: .... x... .... x...\nKick: x... x... x... x...",
      { name: "Beat", seed: 1 }
    );
    const state = makeState([dr1Track()], [patClip("c1", pat)]);

    // Set typeAndNoteAsc -> reorders [Snare(38), Kick(36)] to [Kick(36), Snare(38)].
    const sorted = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("set_pattern_row_sort" as never, {
        clipId: "c1",
        rowSort: "typeAndNoteAsc"
      }),
      directContext(state)
    );
    expect(sorted.error).toBeUndefined();
    expect(sorted.result.rowSort).toBe("typeAndNoteAsc");
    const p1 = sorted.state.clips[0]!.pattern!;
    expect((p1 as unknown as Record<string, unknown>).rowSort).toBe(
      "typeAndNoteAsc"
    );
    expect(p1.rows.map((r) => r.name)).toEqual(["Kick", "Snare"]);

    // get_pattern includes rowSort in settings.
    const read = await applyTimelineOp(
      sorted.state,
      timelineOpFromToolArgs("get_pattern", { clipId: "c1" }),
      directContext(sorted.state)
    );
    expect(read.error).toBeUndefined();
    expect(
      (read.result.settings as Record<string, unknown>).rowSort
    ).toBe("typeAndNoteAsc");

    // Adding a row with pitch 37 (between 36 and 38) lands in sorted place.
    const added = await applyTimelineOp(
      sorted.state,
      timelineOpFromToolArgs("add_pattern_rows", {
        clipId: "c1",
        rows: [{ pitch: 37, name: "Rim" }]
      }),
      directContext(sorted.state)
    );
    expect(added.error).toBeUndefined();
    expect(
      added.state.clips[0]!.pattern!.rows.map(
        (r) => (r.assignment as { pitch: number }).pitch
      )
    ).toEqual([36, 37, 38]);

    // Switching to typeAndNoteDesc reverses and keeps new rows sorted descending.
    const desc = await applyTimelineOp(
      added.state,
      timelineOpFromToolArgs("set_pattern_row_sort" as never, {
        clipId: "c1",
        rowSort: "typeAndNoteDesc"
      }),
      directContext(added.state)
    );
    expect(desc.error).toBeUndefined();
    expect(
      desc.state.clips[0]!.pattern!.rows.map(
        (r) => (r.assignment as { pitch: number }).pitch
      )
    ).toEqual([38, 37, 36]);

    const addedDesc = await applyTimelineOp(
      desc.state,
      timelineOpFromToolArgs("add_pattern_rows", {
        clipId: "c1",
        rows: [{ pitch: 42, name: "Hat" }]
      }),
      directContext(desc.state)
    );
    expect(addedDesc.error).toBeUndefined();
    expect(
      addedDesc.state.clips[0]!.pattern!.rows.map(
        (r) => (r.assignment as { pitch: number }).pitch
      )
    ).toEqual([42, 38, 37, 36]);

    // Setting rowSort to "none" clears rowSort without changing current order,
    // and subsequent add_pattern_rows appends at the end.
    const cleared = await applyTimelineOp(
      addedDesc.state,
      timelineOpFromToolArgs("set_pattern_row_sort" as never, {
        clipId: "c1",
        rowSort: "none"
      }),
      directContext(addedDesc.state)
    );
    expect(cleared.error).toBeUndefined();
    expect(cleared.result.rowSort).toBe("none");
    expect(
      (cleared.state.clips[0]!.pattern! as unknown as Record<string, unknown>)
        .rowSort
    ).toBeUndefined();
    expect(
      cleared.state.clips[0]!.pattern!.rows.map(
        (r) => (r.assignment as { pitch: number }).pitch
      )
    ).toEqual([42, 38, 37, 36]);

    const appended = await applyTimelineOp(
      cleared.state,
      timelineOpFromToolArgs("add_pattern_rows", {
        clipId: "c1",
        rows: [{ pitch: 50, name: "Tom" }]
      }),
      directContext(cleared.state)
    );
    expect(appended.error).toBeUndefined();
    expect(
      appended.state.clips[0]!.pattern!.rows.map(
        (r) => (r.assignment as { pitch: number }).pitch
      )
    ).toEqual([42, 38, 37, 36, 50]);
  });

  it("supports type, typeAndName, and typeAndKitPad modes and clears rowSort on move_pattern_row", async () => {
    const base = normalizePattern({
      name: "Kit",
      seed: 2,
      rows: [
        { id: "r1", name: "Cutoff", assignment: { type: "automation", target: { kind: "cc", cc: 74 } } },
        { id: "r2", assignment: { type: "kit", pad: 5 } },
        { id: "r3", assignment: { type: "kit", pad: 1 } }
      ]
    });
    const state = makeState([dr1Track()], [patClip("c1", base)]);

    const byKit = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("set_pattern_row_sort" as never, {
        clipId: "c1",
        rowSort: "typeAndKitPadAsc"
      }),
      directContext(state)
    );
    expect(byKit.error).toBeUndefined();
    expect(byKit.state.clips[0]!.pattern!.rows.map((r) => r.id)).toEqual([
      "r3",
      "r2",
      "r1"
    ]);

    // Adding pad 3 inserts between pad 1 (r3) and pad 5 (r2).
    const addedKit = await applyTimelineOp(
      byKit.state,
      timelineOpFromToolArgs("add_pattern_rows", {
        clipId: "c1",
        rows: [{ pad: 3 }]
      }),
      directContext(byKit.state)
    );
    expect(addedKit.error).toBeUndefined();
    expect(
      addedKit.state.clips[0]!.pattern!.rows.map((r) =>
        r.assignment.type === "kit" ? r.assignment.pad : "cc"
      )
    ).toEqual([1, 3, 5, "cc"]);

    // Manual move_pattern_row ends the active sort (SQ36).
    const moved = await applyTimelineOp(
      addedKit.state,
      timelineOpFromToolArgs("move_pattern_row", {
        clipId: "c1",
        row: "r1",
        toIndex: 0
      }),
      directContext(addedKit.state)
    );
    expect(moved.error).toBeUndefined();
    expect(
      (moved.state.clips[0]!.pattern! as unknown as Record<string, unknown>)
        .rowSort
    ).toBeUndefined();

    // Subsequent add appends at the end instead of re-sorting r1 back to bottom.
    const afterMove = await applyTimelineOp(
      moved.state,
      timelineOpFromToolArgs("add_pattern_rows", {
        clipId: "c1",
        rows: [{ pad: 0 }]
      }),
      directContext(moved.state)
    );
    expect(afterMove.error).toBeUndefined();
    expect(afterMove.state.clips[0]!.pattern!.rows[0]!.id).toBe("r1");
    expect(
      afterMove.state.clips[0]!.pattern!.rows[
        afterMove.state.clips[0]!.pattern!.rows.length - 1
      ]!.assignment
    ).toEqual({ type: "kit", pad: 0 });
  });
});
