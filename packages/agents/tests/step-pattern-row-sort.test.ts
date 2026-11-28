/**
 * StepPattern.rowSort & ui_timeline_set_pattern_row_sort — Headless bridge, schema, and searchTools tests.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  makeClip,
  makeTrack,
  patternFromText
} from "@nodetool-ai/timeline";
import { createTimelineToolBridge } from "../src/capabilities/timeline-bridge.js";
import { EDIT_TIMELINE_SCHEMA } from "../src/capabilities/timelines.specs.js";
import { searchTools } from "../src/tools/tool-search.js";
import { focusedSurfaceTools } from "./fixtures/focused-surface-tools.js";

describe("StepPattern.rowSort headless bridge & tool discovery", () => {
  it("exposes ui_timeline_set_pattern_row_sort on the headless bridge and keeps added rows sorted", async () => {
    const bridge = createTimelineToolBridge({
      sequence: {
        tempo: DEFAULT_TEMPO,
        tracks: [
          makeTrack({
            id: "t1",
            type: "midi",
            name: "Drums",
            index: 0,
            instrument: DEFAULT_MIDI_INSTRUMENT
          })
        ],
        clips: [
          makeClip({
            id: "c1",
            trackId: "t1",
            name: "Beat",
            startMs: 0,
            durationMs: 2000,
            mediaType: "midi",
            sourceType: "imported",
            status: "generated",
            pattern: patternFromText(
              "Snare: .... x... .... x...\nKick: x... x... x... x...",
              { name: "Beat", seed: 1 }
            )
          })
        ]
      }
    });

    const setSort = bridge.tools.find(
      (t) => t.name === "ui_timeline_set_pattern_row_sort"
    );
    expect(setSort).toBeDefined();

    const addRows = bridge.tools.find(
      (t) => t.name === "ui_timeline_add_pattern_rows"
    )!;

    const sorted = (await setSort!.execute({
      clipId: "c1",
      rowSort: "typeAndNoteAsc"
    })) as { ok: boolean; rowSort: string };
    expect(sorted.ok).toBe(true);
    expect(sorted.rowSort).toBe("typeAndNoteAsc");
    expect(bridge.finalState().documentClips[0]!.pattern?.rowSort).toBe(
      "typeAndNoteAsc"
    );
    expect(
      bridge.finalState().documentClips[0]!.pattern?.rows.map((r) => r.name)
    ).toEqual(["Kick", "Snare"]);

    await addRows.execute({
      clipId: "c1",
      rows: [{ pitch: 37, name: "Rim" }]
    });
    expect(
      bridge
        .finalState()
        .documentClips[0]!.pattern?.rows.map(
          (r) => (r.assignment as { pitch: number }).pitch
        )
    ).toEqual([36, 37, 38]);

    const cleared = (await setSort!.execute({
      clipId: "c1",
      rowSort: "none"
    })) as { ok: boolean; rowSort: string };
    expect(cleared.rowSort).toBe("none");
    expect(
      bridge.finalState().documentClips[0]!.pattern?.rowSort
    ).toBeUndefined();
  });

  it("documents set_pattern_row_sort in EDIT_TIMELINE_SCHEMA and surfaces it via searchTools", async () => {
    const desc = (
      EDIT_TIMELINE_SCHEMA.properties as Record<string, { description?: string }>
    )["ops"]!.description!;
    expect(desc).toContain("set_pattern_row_sort");

    const tools = await focusedSurfaceTools("timeline");
    const hits = searchTools(
      tools.map((t) => ({ name: t.name, description: t.description })),
      "+ui_timeline_ row sort"
    ).map((h) => h.name);
    expect(hits).toContain("ui_timeline_set_pattern_row_sort");
  });
});
