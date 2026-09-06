/**
 * T11: the agent frame path seeks a baked `model3d` clip by clip-local time.
 *
 * A bake is the clip's evaluated picture rendered from its own first frame, so
 * however the clip is trimmed or retimed the video plays from zero (§D6, time
 * origin). The decoder is mocked because what is under test is the timestamp
 * this pass asks for, not what Mediabunny returns for it.
 */

import { describe, expect, it, vi } from "vitest";
import {
  computeModel3DBakeHash,
  DEFAULT_MODEL3D_STYLE,
  type ClipModel3DStyle,
  type TimelineClip,
  type TimelineSequence,
  type TimelineTrack
} from "@nodetool-ai/timeline";

const { forEachVideoFrame } = vi.hoisted(() => ({
  forEachVideoFrame:
    vi.fn<
      (
        bytes: Uint8Array,
        timestamps: readonly number[],
        onFrame: (frame: {
          width: number;
          height: number;
          rgba: Uint8Array;
        }) => void | Promise<void>
      ) => Promise<number>
    >()
}));

vi.mock("../src/analysis/media-decode.js", () => ({ forEachVideoFrame }));

import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

const W = 160;
const H = 90;
const FPS = 30;

const tracks: TimelineTrack[] = [
  {
    id: "track-0",
    name: "Video",
    type: "video",
    index: 0,
    visible: true,
    locked: false
  }
];

/** A trimmed, sped-up 3D clip carrying a bake taken at its current picture. */
function bakedClip(): TimelineClip {
  const clip: TimelineClip = {
    id: "cube",
    trackId: "track-0",
    name: "Cube",
    startMs: 1000,
    durationMs: 4000,
    inPointMs: 5000,
    speedMultiplier: 2,
    mediaType: "model3d",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset-glb",
    model3dStyle: {
      ...DEFAULT_MODEL3D_STYLE,
      background: { transparent: false, color: "#101010" }
    } satisfies ClipModel3DStyle
  };
  clip.model3dStyle = {
    ...clip.model3dStyle!,
    bake: {
      assetId: "asset-bake",
      dependencyHash: computeModel3DBakeHash(clip, {
        fps: FPS,
        width: 1920,
        height: 1080
      })
    }
  };
  return clip;
}

function sequenceOf(clips: TimelineClip[]): TimelineSequence {
  return {
    id: "seq-1",
    projectId: "proj-1",
    name: "Baked sequence",
    fps: FPS,
    width: 1920,
    height: 1080,
    durationMs: 5000,
    tracks,
    clips,
    markers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/** The source timestamps the pass asked the decoder for, in call order. */
async function seekTimes(timesMs: number[]): Promise<number[]> {
  forEachVideoFrame.mockReset();
  forEachVideoFrame.mockImplementation(async (_bytes, timestamps, onFrame) => {
    await onFrame({ width: W, height: H, rgba: new Uint8Array(W * H * 4) });
    return timestamps.length;
  });
  await renderTimelineFrames({
    sequence: sequenceOf([bakedClip()]),
    timesMs,
    width: W,
    loadAsset: async () => new Uint8Array([0, 0, 0, 0])
  });
  return forEachVideoFrame.mock.calls.flatMap(([, timestamps]) => [
    ...timestamps
  ]);
}

describe("a baked 3D clip on the agent frame path", () => {
  it("seeks the bake to zero at the clip's first frame", async () => {
    // The clip starts 5 s into its model and plays at 2x; the bake is that
    // already evaluated, so its own clock starts at zero.
    expect(await seekTimes([1000])).toEqual([0]);
  });

  it("seeks one second in one second later", async () => {
    expect(await seekTimes([2000])).toEqual([1]);
  });

  it("does not decode anything while the bake is stale", async () => {
    forEachVideoFrame.mockReset();
    forEachVideoFrame.mockImplementation(async () => 0);
    const stale = bakedClip();
    stale.model3dStyle = {
      ...stale.model3dStyle!,
      bake: { assetId: "asset-bake", dependencyHash: "not-the-hash" }
    };
    await renderTimelineFrames({
      sequence: sequenceOf([stale]),
      timesMs: [1000],
      width: W,
      loadAsset: async () => new Uint8Array([0x67, 0x6c, 0x54, 0x46])
    });
    expect(forEachVideoFrame).not.toHaveBeenCalled();
  });
});
