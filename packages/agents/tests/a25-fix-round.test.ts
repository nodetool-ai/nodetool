/**
 * Fix-round regressions for A25 in packages/agents (F9, F10, F13, F15).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TimelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { makeTrack } from "@nodetool-ai/timeline";
import { ModelObserver, TimelineSequence, initTestDb } from "@nodetool-ai/models";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { applyOps } from "../src/capabilities/timeline-operations.js";
import { resolveTimelineOpInput } from "../src/capabilities/timelines.js";
import { EDIT_TIMELINE_SCHEMA } from "../src/capabilities/timelines.specs.js";
import { compactResourceIds } from "../src/codeact/compact-ids.js";
import {
  createTimelineToolBridge,
  type TimelineBridgeFinalState
} from "../src/evals/surfaces/timeline.js";

describe("F9: headless retarget_format and applyTrackOps preserve music, master and trackFolders", () => {
  beforeEach(async () => {
    await initTestDb();
    ModelObserver.clear();
  });

  afterEach(() => {
    ModelObserver.clear();
  });

  async function runRetarget(doc: TimelineDocument) {
    const row = await TimelineSequence.create<TimelineSequence>({
      user_id: "u1",
      project_id: "p1",
      name: "Music Cut",
      fps: 30,
      width: 1920,
      height: 1080,
      duration_ms: 2000,
      document: JSON.stringify(doc)
    });
    const run = createCapabilityRun({
      context: { userId: "u1" } as unknown as ProcessingContext,
      gate: UNGATED
    });
    const outcome = await applyOps(run, row, doc, [
      {
        op: "ui_timeline_retarget_format",
        input: { aspect_ratio: "9:16", strategy: "center" }
      }
    ]);
    expect(outcome.records[0]?.ok).toBe(true);
    const derivedId = (outcome.records[0]?.result as { sequenceId: string }).sequenceId;
    return (await TimelineSequence.findById(derivedId))!.toDocument();
  }

  function retargetSeedDoc(): TimelineDocument {
    return {
      tracks: [
        { id: "v1", name: "Video 1", type: "video", index: 0, visible: true, locked: false }
      ],
      clips: [
        {
          id: "c1",
          trackId: "v1",
          name: "Shot",
          startMs: 0,
          durationMs: 2000,
          mediaType: "video",
          sourceType: "imported",
          status: "generated",
          locked: false,
          versions: []
        }
      ],
      markers: [],
      master: {
        volumeDb: -3,
        effects: [{ id: "m1", type: "gain", enabled: true, gainDb: 1 }]
      },
      music: {
        autoCrossfadeMs: 25,
        promptHistory: ["ambient synth"]
      },
      trackFolders: [{ id: "f1", name: "Main" }]
    };
  }

  it("retarget_format preserves master on the derived sequence", async () => {
    const doc = retargetSeedDoc();
    const derived = await runRetarget(doc);
    expect(derived.master).toEqual(doc.master);
  });

  it("retarget_format preserves music on the derived sequence", async () => {
    const doc = retargetSeedDoc();
    const derived = await runRetarget(doc);
    expect(derived.music).toEqual(doc.music);
  });

  async function runTrackOnlyBatch(doc: TimelineDocument) {
    const sequence = {
      id: "seq",
      name: "Seq",
      project_id: "p1",
      fps: 30,
      width: 1920,
      height: 1080
    } as never;
    const run = createCapabilityRun({
      context: { userId: "u1" } as unknown as ProcessingContext,
      gate: UNGATED
    });
    const outcome = await applyOps(run, sequence, doc, [
      { op: "ui_timeline_add_track", input: { type: "audio", name: "Perc" } }
    ]);
    expect(outcome.records[0]?.ok).toBe(true);
    return outcome.state;
  }

  it("track-only applyOps batch preserves master on returned state", async () => {
    const state = await runTrackOnlyBatch({
      tracks: [],
      clips: [],
      markers: [],
      master: { volumeDb: -4 }
    });
    expect(state.master).toEqual({ volumeDb: -4 });
  });

  it("track-only applyOps batch preserves music on returned state", async () => {
    const state = await runTrackOnlyBatch({
      tracks: [],
      clips: [],
      markers: [],
      music: { autoCrossfadeMs: 20 }
    });
    expect(state.music).toEqual({ autoCrossfadeMs: 20 });
  });

  it("track-only applyOps batch preserves trackFolders on returned state", async () => {
    const state = await runTrackOnlyBatch({
      tracks: [],
      clips: [],
      markers: [],
      trackFolders: [{ id: "f1", name: "Drums" }]
    });
    expect(state.trackFolders).toEqual([{ id: "f1", name: "Drums" }]);
  });
});

describe("F10 (agents): resolveTimelineOpInput keeps master bus edits distinct from tracks", () => {
  it("does not resolve track: master to an unrelated track id when result reports master", () => {
    const before = {
      tracks: [{ id: "T1", name: "Audio 1" }],
      clips: []
    } as unknown as TimelineDocument;
    const state = {
      tracks: [{ id: "T1", name: "Audio 1" }],
      clips: []
    } as unknown as TimelineBridgeFinalState;

    const resolved = resolveTimelineOpInput(
      { track: "Master", volumeDb: -6 },
      before,
      state,
      { ok: true, master: { volumeDb: -6 } }
    );
    expect(resolved).toEqual({ track: "master", volumeDb: -6 });
  });
});

describe("F13 (agents): EDIT_TIMELINE_SCHEMA documents all A25 parameters", () => {
  it("names get_state detail, set_track mix/master, set_notes functions/controllers, set_tempo key/crossfade and note_ids/swing", () => {
    const desc =
      (EDIT_TIMELINE_SCHEMA.properties?.["ops"] as { description?: string } | undefined)
        ?.description ?? "";
    expect(desc).toContain("clip");
    expect(desc).toContain("track");
    expect(desc).toContain("master");
    expect(desc).toContain("effects");
    expect(desc).toContain("folder");
    expect(desc).toContain("musicRole");
    expect(desc).toContain("automationMode");
    expect(desc).toContain("automation");
    expect(desc).toContain("function");
    expect(desc).toContain("note_ids");
    expect(desc).toContain("pitches");
    expect(desc).toContain("controllers");
    expect(desc).toContain("scale_quantize");
    expect(desc).toContain("auto_crossfade_ms");
    expect(desc).toContain("swing");
  });
});

describe("F15 (agents): compacted effect IDs from get_state round-trip through set_track.effects", () => {
  const TRACK_FX = "aa112233445500000000000000000001";
  const MASTER_FX = "bb66778899aa00000000000000000002";

  it("preserves full track effect identity and device automation when compacted get_state effects are edited via set_track", async () => {
    const bridge = createTimelineToolBridge({
      sequence: {
        tracks: [
          makeTrack({
            id: "aud",
            type: "audio",
            name: "Aud",
            index: 0,
            effects: [{ id: TRACK_FX, type: "gain", enabled: true, gainDb: 0 }],
            automation: [
              {
                id: "lane-1",
                target: { kind: "device", deviceId: TRACK_FX, param: "gainDb" },
                points: [{ timeMs: 0, value: -3 }]
              }
            ]
          })
        ],
        clips: []
      }
    });
    const getState = bridge.tools.find((t) => t.name === "ui_timeline_get_state")!;
    const setTrack = bridge.tools.find((t) => t.name === "ui_timeline_set_track")!;

    const compacted = compactResourceIds(
      await getState.execute({ track: "Aud" })
    ) as {
      trackDetail: { effects: Array<{ id: string; type: "gain"; enabled: boolean; gainDb: number }> };
    };
    expect(compacted.trackDetail.effects[0]?.id).toBe(TRACK_FX.slice(0, 12));

    await setTrack.execute({
      track: "Aud",
      effects: [{ ...compacted.trackDetail.effects[0]!, gainDb: 4 }]
    });

    const final = bridge.finalState();
    expect(final.documentTracks[0]?.effects).toEqual([
      { id: TRACK_FX, type: "gain", enabled: true, gainDb: 4 }
    ]);
    expect(final.documentTracks[0]?.automation).toEqual([
      {
        id: "lane-1",
        target: { kind: "device", deviceId: TRACK_FX, param: "gainDb" },
        points: [{ timeMs: 0, value: -3 }]
      }
    ]);
  });

  it("preserves full master effect identity when compacted get_state effects are edited via set_track", async () => {
    const bridge = createTimelineToolBridge({
      sequence: {
        tracks: [],
        clips: [],
        master: {
          volumeDb: 0,
          effects: [{ id: MASTER_FX, type: "gain", enabled: true, gainDb: 0 }]
        }
      }
    });
    const getState = bridge.tools.find((t) => t.name === "ui_timeline_get_state")!;
    const setTrack = bridge.tools.find((t) => t.name === "ui_timeline_set_track")!;

    const compacted = compactResourceIds(
      await getState.execute({})
    ) as {
      master: { effects: Array<{ id: string; type: "gain"; enabled: boolean; gainDb: number }> };
    };
    expect(compacted.master.effects[0]?.id).toBe(MASTER_FX.slice(0, 12));

    await setTrack.execute({
      track: "master",
      effects: [{ ...compacted.master.effects[0]!, gainDb: -2 }]
    });

    const final = bridge.finalState();
    expect(final.master?.effects).toEqual([
      { id: MASTER_FX, type: "gain", enabled: true, gainDb: -2 }
    ]);
  });
});
