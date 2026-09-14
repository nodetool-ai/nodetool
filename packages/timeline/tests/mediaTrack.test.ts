/**
 * Subject/object track math (P0 AI Video, Phase 2).
 */
import { describe, expect, it } from "vitest";

import {
  applyMediaTrackResult,
  applySmoothingToSample,
  isMediaTrackStale,
  markMediaTrackGenerating,
  mediaTrackAfterFailure,
  resliceMediaTrackSamples,
  sampleMediaTrackAt
} from "../src/mediaTrack.js";
import type { MediaTrack } from "../src/types.js";

function track(overrides: Partial<MediaTrack> = {}): MediaTrack {
  return {
    id: "track_1",
    clipId: "clip_1",
    sourceAssetId: "asset_1",
    name: "Product",
    kind: "box",
    sourceStartMs: 0,
    sourceEndMs: 4000,
    samples: [
      { sourceMs: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      { sourceMs: 2000, x: 0.5, y: 0.5, width: 0.3, height: 0.3 },
      { sourceMs: 4000, x: 0.9, y: 0.9, width: 0.2, height: 0.2 }
    ],
    status: "ready",
    ...overrides
  };
}

describe("sampleMediaTrackAt", () => {
  it("holds the first sample flat before it", () => {
    const s = sampleMediaTrackAt(track(), -500);
    expect(s).toEqual({ sourceMs: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
  });

  it("holds the last sample flat after it", () => {
    const s = sampleMediaTrackAt(track(), 9000);
    expect(s).toEqual({
      sourceMs: 4000,
      x: 0.9,
      y: 0.9,
      width: 0.2,
      height: 0.2
    });
  });

  it("returns the exact sample when sourceMs matches one", () => {
    const s = sampleMediaTrackAt(track(), 2000);
    expect(s?.x).toBeCloseTo(0.5);
    expect(s?.y).toBeCloseTo(0.5);
  });

  it("linearly interpolates between two samples", () => {
    const s = sampleMediaTrackAt(track(), 1000);
    expect(s?.x).toBeCloseTo(0.3);
    expect(s?.y).toBeCloseTo(0.3);
    expect(s?.width).toBeCloseTo(0.25);
  });

  it("returns undefined for a track with no samples", () => {
    expect(sampleMediaTrackAt(track({ samples: [] }), 1000)).toBeUndefined();
  });

  it("leaves a channel absent from both bracketing samples absent", () => {
    const t = track({
      samples: [
        { sourceMs: 0, x: 0.1, y: 0.1 },
        { sourceMs: 1000, x: 0.5, y: 0.5 }
      ]
    });
    const s = sampleMediaTrackAt(t, 500);
    expect(s?.width).toBeUndefined();
  });
});

describe("applySmoothingToSample", () => {
  it("returns the exact sample when factor is 0", () => {
    const exact = sampleMediaTrackAt(track(), 2000);
    const smoothed = applySmoothingToSample(track(), 2000, 0);
    expect(smoothed).toEqual(exact);
  });

  it("dampens a sharp jump when factor is high", () => {
    const t = track({
      samples: [
        { sourceMs: 0, x: 0, y: 0 },
        { sourceMs: 1000, x: 1, y: 1 }
      ]
    });
    const smoothed = applySmoothingToSample(t, 1000, 0.9);
    const exact = sampleMediaTrackAt(t, 1000);
    expect(smoothed?.x).toBeLessThan(exact?.x ?? 1);
  });
});

describe("resliceMediaTrackSamples", () => {
  it("keeps in-window samples and synthesizes boundary samples", () => {
    const sliced = resliceMediaTrackSamples(track(), 500, 3000);
    expect(sliced.sourceStartMs).toBe(500);
    expect(sliced.sourceEndMs).toBe(3000);
    expect(sliced.samples[0]!.sourceMs).toBe(500);
    expect(sliced.samples[sliced.samples.length - 1]!.sourceMs).toBe(3000);
    expect(sliced.samples.some((s) => s.sourceMs === 2000)).toBe(true);
  });

  it("does not duplicate a boundary that lands exactly on an existing sample", () => {
    const sliced = resliceMediaTrackSamples(track(), 0, 2000);
    expect(sliced.samples).toHaveLength(2);
    expect(sliced.samples.map((s) => s.sourceMs)).toEqual([0, 2000]);
  });

  it("leaves an empty track's window narrowed with no samples to slice", () => {
    const sliced = resliceMediaTrackSamples(track({ samples: [] }), 500, 1500);
    expect(sliced.samples).toEqual([]);
    expect(sliced.sourceStartMs).toBe(500);
    expect(sliced.sourceEndMs).toBe(1500);
  });
});

describe("isMediaTrackStale", () => {
  it("is false when the clip's asset matches the track's", () => {
    expect(isMediaTrackStale(track(), { currentAssetId: "asset_1" })).toBe(
      false
    );
  });

  it("is true when the clip's asset was replaced", () => {
    expect(isMediaTrackStale(track(), { currentAssetId: "asset_2" })).toBe(
      true
    );
  });
});

describe("markMediaTrackGenerating / mediaTrackAfterFailure / applyMediaTrackResult", () => {
  it("marks generating while keeping samples", () => {
    const generating = markMediaTrackGenerating(track());
    expect(generating.status).toBe("generating");
    expect(generating.samples).toEqual(track().samples);
  });

  it("restores the previous ready track after a failure", () => {
    const previous = track();
    const generating = markMediaTrackGenerating(previous);
    const reverted = mediaTrackAfterFailure(generating, previous);
    expect(reverted).toEqual(previous);
  });

  it("marks failed when there was no previous ready track", () => {
    const generating = markMediaTrackGenerating(track({ samples: [] }));
    const reverted = mediaTrackAfterFailure(generating, undefined);
    expect(reverted.status).toBe("failed");
  });

  it("applies a finished result as ready, updating sourceAssetId", () => {
    const result = {
      samples: [{ sourceMs: 0, x: 0.2, y: 0.2 }],
      sourceStartMs: 0,
      sourceEndMs: 1000,
      sourceAssetId: "asset_2",
      confidence: 0.8
    };
    const next = applyMediaTrackResult(track(), result);
    expect(next.status).toBe("ready");
    expect(next.samples).toEqual(result.samples);
    expect(next.sourceAssetId).toBe("asset_2");
    expect(next.confidence).toBe(0.8);
  });
});
