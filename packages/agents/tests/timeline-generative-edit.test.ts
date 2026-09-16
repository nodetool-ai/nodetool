import { describe, expect, it } from "vitest";
import { createTimelineToolBridge } from "../src/evals/surfaces/timeline.js";

const originalTake = {
  id: "take-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  jobId: "job-1",
  assetId: "asset-1",
  workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
  dependencyHash: "",
  paramOverridesSnapshot: {},
  durationMs: 4000,
  status: "success" as const,
  source: "imported" as const,
  sourceMapping: {
    inPointMs: 40000,
    outPointMs: 44000,
    speedMultiplier: 1,
    speedBaked: false
  }
};

function bridge() {
  return createTimelineToolBridge({
    sequenceId: "sequence-1",
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
          id: "clip-1",
          trackId: "track-1",
          name: "hero",
          startMs: 1200,
          durationMs: 4000,
          inPointMs: 40000,
          outPointMs: 44000,
          mediaType: "video",
          sourceType: "imported",
          status: "generated",
          locked: false,
          versions: [originalTake],
          currentAssetId: "asset-1",
          activeTakeId: "take-1"
        }
      ]
    }
  });
}

describe("ui_timeline_generatively_edit_clip", () => {
  it("captures the trimmed source, returns an inactive candidate, and applies it explicitly", async () => {
    const bridgeInstance = bridge();
    const edit = bridgeInstance.tools.find(
      (candidate) => candidate.name === "ui_timeline_generatively_edit_clip"
    );
    const apply = bridgeInstance.tools.find(
      (candidate) => candidate.name === "ui_timeline_apply_take"
    );
    expect(edit).toBeDefined();
    expect(apply).toBeDefined();

    const result = (await edit!.execute({
      clip_id: "clip-1",
      instruction: "Make this station deserted at night",
      provider: "fal",
      model: "video-edit-model"
    })) as {
      generationId: string;
      activeTakeId: string;
      candidate: { id: string; status: string; source: string };
      clip: { currentAssetId: string; inPointMs: number; outPointMs: number };
    };

    expect(result).toMatchObject({
      generationId: result.candidate.id,
      activeTakeId: "take-1",
      candidate: { status: "success", source: "video_to_video" },
      clip: {
        currentAssetId: "asset-1",
        inPointMs: 40000,
        outPointMs: 44000
      }
    });
    const candidate = bridgeInstance.finalState().documentClips[0].versions?.find(
      (take) => take.id === result.candidate.id
    );
    expect(candidate?.mediaEdit).toMatchObject({
      instruction: "Make this station deserted at night",
      provider: "fal",
      model: "video-edit-model",
      sourceContext: {
        sequenceId: "sequence-1",
        clipId: "clip-1",
        sourceAssetId: "asset-1",
        sourceStartMs: 40000,
        sourceEndMs: 44000,
        timelineStartMs: 1200,
        timelineDurationMs: 4000
      }
    });

    const applied = (await apply!.execute({
      clip_id: "clip-1",
      take_id: result.candidate.id
    })) as { clip: { currentAssetId: string; inPointMs: number; outPointMs: number } };
    expect(applied.clip).toMatchObject({
      currentAssetId: expect.stringContaining("generative://clip-1/"),
      inPointMs: 0,
      outPointMs: 4000
    });
  });

  it("requires explicit clip ids and does not promote a non-edit take", async () => {
    const editBridge = bridge();
    const edit = editBridge.tools.find(
      (candidate) => candidate.name === "ui_timeline_generatively_edit_clip"
    )!;
    await expect(
      edit.execute({
        clip_id: "hero",
        instruction: "night",
        provider: "fal",
        model: "video-edit-model"
      })
    ).rejects.toThrow(/clip with id/i);

    const applyBridge = bridge();
    const apply = applyBridge.tools.find(
      (candidate) => candidate.name === "ui_timeline_apply_take"
    )!;
    await expect(
      apply.execute({ clip_id: "clip-1", take_id: "take-1" })
    ).rejects.toThrow(/AI edit candidate/i);
  });

  it("rejects a partial provider/model pair", async () => {
    const edit = bridge()
      .tools.find(
        (candidate) => candidate.name === "ui_timeline_generatively_edit_clip"
      )!;

    expect(() =>
      edit.execute({
        clip_id: "clip-1",
        instruction: "night",
        provider: "fal"
      })
    ).toThrow();
  });

  it("does not reuse a source clip's text-to-video model", async () => {
    const editBridge = createTimelineToolBridge({
      sequenceId: "sequence-1",
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
            id: "clip-1",
            trackId: "track-1",
            name: "hero",
            startMs: 1200,
            durationMs: 4000,
            inPointMs: 40000,
            outPointMs: 44000,
            mediaType: "video",
            sourceType: "generated",
            status: "generated",
            locked: false,
            provider: "fal",
            model: "text-to-video-only",
            versions: [originalTake],
            currentAssetId: "asset-1",
            activeTakeId: "take-1"
          }
        ]
      }
    });
    const edit = editBridge.tools.find(
      (candidate) => candidate.name === "ui_timeline_generatively_edit_clip"
    )!;

    const result = (await edit.execute({
      clip_id: "clip-1",
      instruction: "night"
    })) as { generationId: string };
    const candidate = editBridge
      .finalState()
      .documentClips[0].versions?.find(
        (take) => take.id === result.generationId
      );

    expect(candidate?.mediaEdit).toMatchObject({
      provider: "headless",
      model: "headless-video-to-video"
    });
  });
});
