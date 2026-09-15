import { describe, expect, it, vi } from "vitest";
import {
  makeClip,
  makeTrack,
  type MediaTrack,
  type TimelineClip
} from "@nodetool-ai/timeline";
import { createTimelineToolBridge } from "../src/evals/surfaces/timeline.js";

function clip(reframe?: TimelineClip["reframe"]): TimelineClip {
  return makeClip({
    id: "clip_subject",
    trackId: "track_video",
    name: "Speaker",
    startMs: 0,
    durationMs: 4000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset_source",
    width: 1920,
    height: 1080,
    reframe
  });
}

function mediaTrack(overrides: Partial<MediaTrack> = {}): MediaTrack {
  return {
    id: "track_subject",
    clipId: "clip_subject",
    sourceAssetId: "asset_source",
    name: "Speaker",
    kind: "box",
    sourceStartMs: 0,
    sourceEndMs: 4000,
    samples: [
      { sourceMs: 0, x: 0.2, y: 0.5, width: 0.2, height: 0.4 },
      { sourceMs: 4000, x: 0.8, y: 0.5, width: 0.2, height: 0.4 }
    ],
    status: "ready",
    ...overrides
  };
}

function bridge(
  reframe?: TimelineClip["reframe"],
  track: MediaTrack = mediaTrack(),
  retargetFormat?: (sequence: Parameters<
    NonNullable<Parameters<typeof createTimelineToolBridge>[0]["retargetFormat"]>
  >[0]) => Promise<{ sequenceId: string; name?: string }>
) {
  return createTimelineToolBridge({
    sequenceId: "sequence_source",
    sequenceName: "Campaign",
    projectId: "project_1",
    sequence: {
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [
        makeTrack({
          id: "track_video",
          type: "video",
          name: "Video 1",
          index: 0
        })
      ],
      clips: [clip(reframe)],
      markers: [{ id: "marker_1", timeMs: 1000, label: "CTA" }],
      mediaTracks: [track]
    },
    retargetFormat
  });
}

function tool(
  instance: ReturnType<typeof bridge>,
  name: string
) {
  const found = instance.tools.find((candidate) => candidate.name === name);
  expect(found, `${name} is registered`).toBeDefined();
  return found!;
}

describe("Smart Reframe timeline tools", () => {
  it("creates a derived portrait sequence without changing the source", async () => {
    const persist = vi.fn(async () => ({
      sequenceId: "sequence_portrait",
      name: "Campaign (1080×1920)"
    }));
    const instance = bridge(undefined, mediaTrack(), persist);

    const result = await tool(
      instance,
      "ui_timeline_retarget_format"
    ).execute({
      aspect_ratio: "9:16",
      strategy: "smart",
      safe_margin: 0.1
    });

    expect(result).toMatchObject({
      ok: true,
      sourceSequenceId: "sequence_source",
      sequenceId: "sequence_portrait",
      width: 1080,
      height: 1920,
      strategy: "smart"
    });
    expect(persist).toHaveBeenCalledOnce();
    const persisted = persist.mock.calls[0]![0];
    expect(persisted.templateId).toBe("sequence_source");
    expect(persisted.markers).toEqual([
      { id: "marker_1", timeMs: 1000, label: "CTA" }
    ]);
    expect(persisted.mediaTracks).toEqual([mediaTrack()]);
    expect(persisted.clips[0]?.reframe).toMatchObject({
      mode: "auto",
      safeMargin: 0.1,
      sourceAssetId: "asset_source"
    });
    expect(persisted.clips[0]?.reframe?.samples).toHaveLength(2);

    const state = instance.finalState();
    expect(state.width).toBe(1920);
    expect(state.height).toBe(1080);
    expect(state.documentClips[0]?.reframe).toBeUndefined();
    expect(state.derivedSequences).toHaveLength(1);
  });

  it("sets a tracked subject while preserving manual corrections", async () => {
    const instance = bridge({
      mode: "auto",
      safeMargin: 0.05,
      sourceWidth: 1920,
      sourceHeight: 1080,
      keyframes: [{ sourceMs: 2000, x: 0.6, y: 0.4, zoom: 1.2 }]
    });

    await tool(instance, "ui_timeline_set_reframe_subject").execute({
      clip_id: "Speaker",
      track_id: "track_subject",
      smoothing: 0.35
    });

    expect(instance.finalState().documentClips[0]?.reframe).toEqual({
      mode: "track",
      trackId: "track_subject",
      sourceAssetId: "asset_source",
      safeMargin: 0.05,
      smoothing: 0.35,
      sourceWidth: 1920,
      sourceHeight: 1080,
      keyframes: [{ sourceMs: 2000, x: 0.6, y: 0.4, zoom: 1.2 }]
    });
  });

  it("adds source-time keyframes in order, replaces collisions, and clears", async () => {
    const instance = bridge({ mode: "center" });
    const add = tool(instance, "ui_timeline_add_reframe_keyframe");

    await add.execute({
      clip_id: "clip_subject",
      source_ms: 3000,
      x: 0.8,
      y: 0.5
    });
    await add.execute({
      clip_id: "clip_subject",
      source_ms: 1000,
      x: 0.25,
      y: 0.45,
      zoom: 1.1
    });
    await add.execute({
      clip_id: "clip_subject",
      source_ms: 3000,
      x: 0.7,
      y: 0.4
    });

    expect(
      instance.finalState().documentClips[0]?.reframe?.keyframes
    ).toEqual([
      { sourceMs: 1000, x: 0.25, y: 0.45, zoom: 1.1 },
      { sourceMs: 3000, x: 0.7, y: 0.4 }
    ]);

    await tool(instance, "ui_timeline_clear_reframe").execute({
      clip_id: "clip_subject"
    });
    expect(instance.finalState().documentClips[0]?.reframe).toBeUndefined();
  });

  it("rejects a subject track that is stale or belongs to another clip", async () => {
    const stale = bridge(undefined, mediaTrack({ status: "stale" }));
    await expect(
      tool(stale, "ui_timeline_set_reframe_subject").execute({
        clip_id: "clip_subject",
        track_id: "track_subject"
      })
    ).rejects.toThrow(/is stale/);

    const wrongClip = bridge(
      undefined,
      mediaTrack({ clipId: "another_clip" })
    );
    await expect(
      tool(wrongClip, "ui_timeline_set_reframe_subject").execute({
        clip_id: "clip_subject",
        track_id: "track_subject"
      })
    ).rejects.toThrow(/belongs to clip/);
  });
});
