import { describe, expect, it, vi } from "vitest";

const bakeOnServer = vi.fn(async () => ({ assetId: "baked-asset" }));
vi.mock("../src/capabilities/timeline-bake.js", () => ({
  bakeModel3DClipOnServer: bakeOnServer
}));

import { createTimelineToolBridge } from "../src/capabilities/timeline-bridge.js";
import { timelineModel3DBaker } from "../src/capabilities/timeline-operations.js";
import type { CapabilityRun } from "../src/capabilities/types.js";

const CLIP_ID = "c0ffee000000aaaaaaaaaaaaaaaaaaaa";
const TAKE_ID = "7a7e00000000bbbbbbbbbbbbbbbbbbbb";

function bridge(locked = false) {
  return createTimelineToolBridge({
    sequenceId: "sequence-1",
    generateMediaEdit: async () => ({
      generationId: TAKE_ID,
      assetId: "edited-asset"
    }),
    sequence: {
      tracks: [
        {
          id: "track-1",
          name: "Video",
          type: "video",
          index: 0,
          visible: true,
          locked: false
        }
      ],
      clips: [
        {
          id: CLIP_ID,
          trackId: "track-1",
          name: "hero",
          startMs: 0,
          durationMs: 4000,
          inPointMs: 0,
          outPointMs: 4000,
          mediaType: "video",
          sourceType: "imported",
          status: "generated",
          locked,
          currentAssetId: "asset-1"
        }
      ],
      trackFolders: [{ id: "folder-1", name: "Picture", trackIds: ["track-1"] }]
    }
  });
}

function tool(instance: ReturnType<typeof bridge>, name: string) {
  const found = instance.tools.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`no tool ${name}`);
  }
  return found;
}

describe("AI edit tools accept 12-character ids (F10)", () => {
  it("edits and applies a take named by short clip and take ids", async () => {
    const instance = bridge();
    const edited = (await tool(
      instance,
      "ui_timeline_generatively_edit_clip"
    ).execute({
      clip_id: CLIP_ID.slice(0, 12),
      instruction: "night",
      provider: "fal",
      model: "video-edit-model"
    })) as { candidate: { id: string } };
    expect(edited.candidate.id).toBe(TAKE_ID);
    const applied = (await tool(instance, "ui_timeline_apply_take").execute({
      clip_id: CLIP_ID.slice(0, 12),
      take_id: TAKE_ID.slice(0, 12)
    })) as { clip: { id: string; currentAssetId: string } };
    expect(applied.clip).toMatchObject({
      id: CLIP_ID,
      currentAssetId: "edited-asset"
    });
  });
});

describe("apply_take respects locks (F5)", () => {
  it("refuses to apply a take to a locked clip", async () => {
    const instance = bridge();
    await tool(instance, "ui_timeline_generatively_edit_clip").execute({
      clip_id: CLIP_ID,
      instruction: "night",
      provider: "fal",
      model: "video-edit-model"
    });
    const locked = createTimelineToolBridge({
      sequenceId: "sequence-1",
      sequence: {
        tracks: instance.finalState().documentTracks,
        clips: instance
          .finalState()
          .documentClips.map((clip) => ({ ...clip, locked: true }))
      }
    });
    await expect(
      tool(locked, "ui_timeline_apply_take").execute({
        clip_id: CLIP_ID,
        take_id: TAKE_ID
      })
    ).rejects.toThrow(/locked/);
  });
});

describe("3D bakes across edit retries (F3)", () => {
  it("renders one clip and dependency hash once", async () => {
    bakeOnServer.mockClear();
    const run = { context: {} } as unknown as CapabilityRun;
    const bake = timelineModel3DBaker(run);
    const request = {
      clip: { id: "clip-3d" },
      sequence: { fps: 30, width: 1920, height: 1080 },
      dependencyHash: "hash-1"
    } as unknown as Parameters<typeof bake>[0];
    await bake(request);
    await bake(request);
    expect(bakeOnServer).toHaveBeenCalledTimes(1);
    await bake({ ...request, dependencyHash: "hash-2" });
    expect(bakeOnServer).toHaveBeenCalledTimes(2);
  });
});

describe("format adaptation keeps track folders (notes)", () => {
  it("hands the derived sequence the source's track folders", async () => {
    const derived: Array<{ trackFolders?: unknown }> = [];
    const instance = createTimelineToolBridge({
      sequenceId: "sequence-1",
      retargetFormat: async (sequence) => {
        derived.push(sequence);
        return { sequenceId: "derived-1" };
      },
      sequence: {
        tracks: bridge().finalState().documentTracks,
        clips: [],
        trackFolders: [
          { id: "folder-1", name: "Picture", trackIds: ["track-1"] }
        ]
      }
    });
    await tool(instance, "ui_timeline_retarget_format").execute({
      aspect_ratio: "9:16",
      strategy: "center"
    });
    expect(derived[0]?.trackFolders).toEqual([
      { id: "folder-1", name: "Picture", trackIds: ["track-1"] }
    ]);
  });
});
