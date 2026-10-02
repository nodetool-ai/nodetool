import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Asset,
  ModelObserver,
  TimelineSequence,
  initTestDb
} from "@nodetool-ai/models";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { findInstrumentPreset } from "@nodetool-ai/timeline";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

describe("soundtrack presets through edit_timeline", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it.each([
    "wt1-cinematic-strings",
    "wt1-short-strings",
    "bl1-cinematic-sub",
    "dr1-cinematic",
    "sampler"
  ])("stores and reports the %s voice", async (presetId) => {
    // Timeline editing only reads userId from the processing context.
    const context = { userId: "composer" } as unknown as ProcessingContext;
    const run = createCapabilityRun({ context, gate: UNGATED });
    const row = await TimelineSequence.create<TimelineSequence>({
      user_id: "composer",
      project_id: "default",
      name: "Score",
      fps: 30,
      width: 1920,
      height: 1080,
      duration_ms: 4000,
      document: JSON.stringify({ tracks: [], clips: [], markers: [] })
    });
    expect(
      await run.invoke("edit_timeline", {
        timeline_id: row.id,
        ops: [
          { op: "add_track", type: "midi", name: "Score" },
          {
            op: "set_track_instrument",
            track: "Score",
            instrument: { preset: presetId }
          }
        ]
      })
    ).toMatchObject({ applied: 2, failed: 0 });

    const preset = findInstrumentPreset(presetId);
    expect(preset).toBeDefined();
    const saved = await TimelineSequence.findById(row.id);
    expect(saved?.toDocument().tracks).toEqual([
      expect.objectContaining({ name: "Score", instrument: preset?.instrument })
    ]);
    const state = await run.invoke("edit_timeline", {
      timeline_id: row.id,
      ops: [{ op: "get_state" }]
    });
    expect(state).toMatchObject({
      failed: 0,
      ops: [
        {
          ok: true,
          result: { tracks: [expect.objectContaining({ presetId })] }
        }
      ]
    });
  });
  it("resolves a short sampler asset id in the caller's scope and stores the full id", async () => {
    const assetId = "a".repeat(32);
    await Asset.create<Asset>({
      id: assetId,
      user_id: "composer",
      name: "Taiko",
      content_type: "audio/wav",
      size: 100,
      duration: 1
    });
    // This edit needs only the caller id because the fixture asset has a known duration.
    const context = { userId: "composer" } as unknown as ProcessingContext;
    const run = createCapabilityRun({ context, gate: UNGATED });
    const row = await TimelineSequence.create<TimelineSequence>({
      user_id: "composer",
      project_id: "default",
      name: "Sample score",
      fps: 30,
      width: 1920,
      height: 1080,
      duration_ms: 1000,
      document: JSON.stringify({ tracks: [], clips: [], markers: [] })
    });
    const voice = {
      type: "sampler",
      oneShot: true,
      attackMs: 0,
      releaseMs: 100,
      gainDb: -6,
      zones: [
        {
          id: "hit",
          name: "Taiko",
          assetId: assetId.slice(0, 12),
          rootNote: 36,
          lowNote: 36,
          highNote: 36,
          gainDb: 0
        }
      ]
    };
    expect(
      await run.invoke("edit_timeline", {
        timeline_id: row.id,
        ops: [
          { op: "add_track", type: "midi", name: "Drums" },
          { op: "set_track_instrument", track: "Drums", instrument: voice }
        ]
      })
    ).toMatchObject({ applied: 2, failed: 0 });
    const saved = await TimelineSequence.findById(row.id);
    expect(saved?.toDocument().tracks[0].instrument).toMatchObject({
      zones: [{ assetId }]
    });
    const other = {
      ...voice,
      zones: [{ ...voice.zones[0], assetId: "b".repeat(32) }]
    };
    await Asset.create<Asset>({
      id: "b".repeat(32),
      user_id: "someone-else",
      name: "Private",
      content_type: "audio/wav",
      size: 100,
      duration: 1
    });
    expect(
      await run.invoke("edit_timeline", {
        timeline_id: row.id,
        ops: [{ op: "set_track_instrument", track: "Drums", instrument: other }]
      })
    ).toMatchObject({ failed: 1 });
    expect(
      (await TimelineSequence.findById(row.id))?.toDocument().tracks[0]
        .instrument
    ).toMatchObject({ zones: [{ assetId }] });
  });
});
