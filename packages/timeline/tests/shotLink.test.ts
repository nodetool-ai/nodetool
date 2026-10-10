/**
 * Clips linked to storyboard shots follow the shot's selected take.
 */
import { describe, expect, it } from "vitest";

import { makeClip } from "../src/defaults.js";
import {
  applyShotTakeToClip,
  clipsFollowingShot,
  derivedFrameTimesMs,
  MAX_DERIVED_FRAMES
} from "../src/shotLink.js";

const shotClip = (overrides = {}) =>
  makeClip({
    id: "v1",
    trackId: "t1",
    startMs: 1000,
    durationMs: 4000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "old",
    inPointMs: 0,
    outPointMs: 4000,
    storyboardBoardId: "board",
    storyboardShotId: "shot",
    ...overrides
  });

describe("clipsFollowingShot", () => {
  it("returns the shot's video clip and audio twin, not its voiceover", () => {
    const video = shotClip();
    const audio = shotClip({ id: "a1", mediaType: "audio" });
    const voiceover = shotClip({
      id: "vo",
      mediaType: "audio",
      scriptLineId: "line"
    });
    const other = shotClip({ id: "o", storyboardShotId: "other" });
    const still = shotClip({ id: "s", mediaType: "image" });
    expect(
      clipsFollowingShot([video, audio, voiceover, other, still], "board", "shot")
        .map((clip) => clip.id)
    ).toEqual(["v1", "a1"]);
  });
});

describe("applyShotTakeToClip", () => {
  it("swaps the asset and keeps the window when the take holds it", () => {
    const next = applyShotTakeToClip(shotClip(), {
      assetId: "new",
      durationMs: 6000
    });
    expect(next.currentAssetId).toBe("new");
    expect(next.status).toBe("generated");
    expect(next.inPointMs).toBe(0);
    expect(next.outPointMs).toBe(4000);
    expect(next.durationMs).toBe(4000);
    expect(next.startMs).toBe(1000);
  });

  it("slides the window back to end on a shorter take's last frame", () => {
    const next = applyShotTakeToClip(
      shotClip({ inPointMs: 2000, outPointMs: 6000 }),
      { assetId: "new", durationMs: 5000 }
    );
    expect(next.inPointMs).toBe(1000);
    expect(next.outPointMs).toBe(5000);
    expect(next.durationMs).toBe(4000);
  });

  it("shortens the clip to a take shorter than its window", () => {
    const next = applyShotTakeToClip(shotClip(), {
      assetId: "new",
      durationMs: 3000
    });
    expect(next.inPointMs).toBe(0);
    expect(next.outPointMs).toBe(3000);
    expect(next.durationMs).toBe(3000);
  });

  it("measures the window at the clip's speed", () => {
    const next = applyShotTakeToClip(shotClip({ speedMultiplier: 2 }), {
      assetId: "new",
      durationMs: 6000
    });
    // 4000ms of cut at 2x reads 8000ms of source; the take has 6000.
    expect(next.inPointMs).toBe(0);
    expect(next.outPointMs).toBe(6000);
    expect(next.durationMs).toBe(3000);
  });

  it("leaves the window alone when the take length is unknown", () => {
    const clip = shotClip({ inPointMs: 500, outPointMs: 4500 });
    const next = applyShotTakeToClip(clip, { assetId: "new" });
    expect(next.currentAssetId).toBe("new");
    expect(next.inPointMs).toBe(500);
    expect(next.outPointMs).toBe(4500);
  });

  it("points activeTakeId at a recorded take or drops a stale one", () => {
    const clip = shotClip({
      activeTakeId: "take-old",
      versions: [
        {
          id: "take-new",
          createdAt: "",
          jobId: "",
          assetId: "new",
          workflowUpdatedAt: "",
          dependencyHash: "",
          paramOverridesSnapshot: {},
          status: "success"
        }
      ]
    });
    expect(applyShotTakeToClip(clip, { assetId: "new" }).activeTakeId).toBe(
      "take-new"
    );
    expect(
      applyShotTakeToClip(clip, { assetId: "other" }).activeTakeId
    ).toBeUndefined();
  });

  it("refuses locked clips, stills and a take already playing", () => {
    const locked = shotClip({ locked: true });
    expect(applyShotTakeToClip(locked, { assetId: "new" })).toBe(locked);
    const still = shotClip({ mediaType: "image" });
    expect(applyShotTakeToClip(still, { assetId: "new" })).toBe(still);
    const same = shotClip();
    expect(applyShotTakeToClip(same, { assetId: "old" })).toBe(same);
  });
});

describe("derivedFrameTimesMs", () => {
  it("samples the middle of equal slices of the clip's source window", () => {
    const clip = shotClip({ inPointMs: 1000 });
    expect(derivedFrameTimesMs(clip, 1)).toEqual([3000]);
    expect(derivedFrameTimesMs(clip, 4)).toEqual([1500, 2500, 3500, 4500]);
  });

  it("maps through the clip's speed", () => {
    const clip = shotClip({ speedMultiplier: 2 });
    expect(derivedFrameTimesMs(clip, 2)).toEqual([2000, 6000]);
  });

  it("clamps the frame count", () => {
    const clip = shotClip();
    expect(derivedFrameTimesMs(clip, 0)).toHaveLength(1);
    expect(derivedFrameTimesMs(clip, Number.NaN)).toHaveLength(1);
    expect(derivedFrameTimesMs(clip, 99)).toHaveLength(MAX_DERIVED_FRAMES);
  });
});
