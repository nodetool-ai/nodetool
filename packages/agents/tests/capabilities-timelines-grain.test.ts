import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { ModelObserver, TimelineSequence, initTestDb } from "@nodetool-ai/models";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

describe("edit_timeline film grain", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("persists roughness, softness and seed through the capability", async () => {
    const row = await TimelineSequence.create<TimelineSequence>({
      user_id: "u1",
      project_id: "default",
      name: "Film grain",
      fps: 24,
      width: 1920,
      height: 1080,
      duration_ms: 2000,
      document: JSON.stringify({
        tracks: [{
          id: "track-1", name: "Video 1", type: "video", index: 0,
          visible: true, locked: false
        }],
        clips: [{
          id: "clip-1", trackId: "track-1", name: "Shot 1", startMs: 0,
          durationMs: 2000, mediaType: "video", sourceType: "imported",
          status: "generated", locked: false, versions: []
        }],
        markers: []
      })
    });
    const run = createCapabilityRun({
      // This capability reads only the caller's user ID from the context.
      context: { userId: "u1" } as unknown as ProcessingContext,
      gate: UNGATED
    });
    const grain = {
      type: "grain", amount: 0.25, size: 2, colorAmount: 0.1,
      roughness: 0.7, softness: 0.3, seed: 42, animate: true
    };
    const result = await run.invoke("edit_timeline", {
      timeline_id: row.id,
      ops: [{ op: "set_effects", target: "Shot 1", effects: [grain] }]
    });
    expect(result).toMatchObject({ applied: 1, failed: 0 });
    const saved = await TimelineSequence.findById(row.id);
    expect(saved?.toDocument().clips[0]?.effects).toEqual([
      { ...grain, id: "fx-1", enabled: true }
    ]);
  });
});
