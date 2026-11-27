import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { ModelObserver, TimelineSequence, initTestDb } from "@nodetool-ai/models";
import { keyframeTimesMs } from "@nodetool-ai/timeline";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

describe("edit_timeline blockout camera", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("adds a free-camera 3D clip, keys it and applies a move through the capability", async () => {
    const row = await TimelineSequence.create<TimelineSequence>({
      user_id: "u1",
      project_id: "default",
      name: "Blockout",
      fps: 24,
      width: 1280,
      height: 720,
      duration_ms: 4000,
      document: JSON.stringify({
        tracks: [{
          id: "track-1", name: "Video 1", type: "video", index: 0,
          visible: true, locked: false
        }],
        clips: [],
        markers: []
      })
    });
    const run = createCapabilityRun({
      // This capability reads only the caller's user ID from the context.
      context: { userId: "u1" } as unknown as ProcessingContext,
      gate: UNGATED
    });

    const added = await run.invoke("edit_timeline", {
      timeline_id: row.id,
      ops: [{
        op: "add_model3d_clip",
        assetId: "asset_set",
        trackId: "track-1",
        durationMs: 4000,
        style: {
          camera: {
            mode: "free", position: [0, 1.6, 4], target: [0, 1.4, 0],
            focalLengthMm: 35
          }
        }
      }]
    });
    expect(added).toMatchObject({ applied: 1, failed: 0 });
    const clipId = (await TimelineSequence.findById(row.id))?.toDocument()
      .clips[0]?.id;
    expect(clipId).toBeTruthy();

    const moved = await run.invoke("edit_timeline", {
      timeline_id: row.id,
      ops: [
        {
          op: "set_model3d_style", target: clipId, keyAtMs: 0,
          patch: { camera: { position: [0, 1.6, 4], target: [0, 1.4, 0] } }
        },
        {
          op: "apply_model3d_camera_move", target: clipId, move: "pushIn",
          amount: 0.5, startMs: 0, durationMs: 2000, easing: "easeInOut"
        },
        // An unknown move is refused and the batch records the failure.
        {
          op: "apply_model3d_camera_move", target: clipId, move: "warp"
        }
      ]
    });
    expect(moved).toMatchObject({ applied: 2, failed: 1 });

    const clip = (await TimelineSequence.findById(row.id))?.toDocument().clips[0];
    expect(clip?.model3dStyle?.camera).toMatchObject({ mode: "free" });
    // 35 mm on a 24 mm tall sensor, stored as a vertical field of view.
    expect(clip?.model3dStyle?.camera.fovDeg).toBeCloseTo(37.85, 1);
    const times = clip ? keyframeTimesMs(clip, ["cameraPosZ"]) : [];
    expect(times).toContain(0);
    expect(times).toContain(2000);
  });
});
