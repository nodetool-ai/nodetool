import { describe, expect, it } from "vitest";
import {
  addReframeKeyframe,
  clearReframe,
  isReframeStale,
  resolveReframeCrop,
  sampleReframeAt,
  solveReframeSamples
} from "../src/reframe.js";
import { makeClip } from "../src/defaults.js";
import { computeActiveLayers } from "../src/render/sceneModel.js";
import type { ClipReframe, MediaTrack } from "../src/types.js";

const track: MediaTrack = {
  id: "subject",
  clipId: "clip-1",
  sourceAssetId: "asset-1",
  name: "Speaker",
  kind: "box",
  sourceStartMs: 0,
  sourceEndMs: 2000,
  samples: [
    { sourceMs: 0, x: 0.2, y: 0.5, width: 0.1, height: 0.3 },
    { sourceMs: 2000, x: 0.8, y: 0.5, width: 0.2, height: 0.4 }
  ],
  status: "ready"
};

describe("Smart Reframe source-time math", () => {
  it("solves and interpolates a moving track", () => {
    const samples = solveReframeSamples(track);
    expect(samples[0]?.width).toBeCloseTo(0.1);
    expect(samples[1]?.height).toBeCloseTo(0.4);
    const sampled = sampleReframeAt({ mode: "auto", samples }, 1000);
    expect(sampled.x).toBeCloseTo(0.5);
    expect(sampled.y).toBeCloseTo(0.5);
  });

  it("samples a MediaTrack directly for track mode", () => {
    const sampled = sampleReframeAt(
      { mode: "track", trackId: track.id },
      500,
      track
    );
    expect(sampled.x).toBeCloseTo(0.35);
  });

  it("ignores an old automatic path after switching to center mode", () => {
    const sampled = sampleReframeAt(
      {
        mode: "center",
        samples: [{ sourceMs: 0, x: 0.1, y: 0.9 }]
      },
      0
    );
    expect(sampled).toMatchObject({ x: 0.5, y: 0.5 });
  });

  it("interpolates manual corrections as offsets around the automatic path", () => {
    const reframe: ClipReframe = {
      mode: "auto",
      samples: [
        { sourceMs: 0, x: 0.2, y: 0.5 },
        { sourceMs: 2000, x: 0.8, y: 0.5 }
      ],
      keyframes: [
        { sourceMs: 500, x: 0.4, y: 0.4 },
        { sourceMs: 1500, x: 0.6, y: 0.6, zoom: 2 }
      ]
    };
    const sampled = sampleReframeAt(reframe, 1000);
    expect(sampled.x).toBeCloseTo(0.5);
    expect(sampled.y).toBeCloseTo(0.5);
    expect(sampled.zoom).toBeCloseTo(1.5);
  });

  it("creates and clamps a portrait crop around the subject", () => {
    const crop = resolveReframeCrop(
      { mode: "track", trackId: track.id },
      2000,
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
      track
    );
    expect(crop).toBeDefined();
    expect((crop?.left ?? 0) + (crop?.right ?? 0)).toBeCloseTo(0.68359375);
    expect(crop?.right).toBeCloseTo(0.041796875);
    expect(crop?.top).toBeCloseTo(0);
    expect(crop?.bottom).toBeCloseTo(0);
  });

  it("uses subject bounds and safe margin to choose the crop size", () => {
    const tight = resolveReframeCrop(
      { mode: "track", trackId: track.id, safeMargin: 0 },
      0,
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
      track
    );
    const roomy = resolveReframeCrop(
      { mode: "track", trackId: track.id, safeMargin: 0.3 },
      0,
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
      track
    );

    const tightWidth = 1 - (tight?.left ?? 0) - (tight?.right ?? 0);
    const roomyWidth = 1 - (roomy?.left ?? 0) - (roomy?.right ?? 0);
    expect(roomyWidth).toBeGreaterThan(tightWidth);
  });

  it("resolves the same per-frame crop into the shared scene model", () => {
    const clip = makeClip({
      id: "clip-1",
      trackId: "video",
      mediaType: "video",
      currentAssetId: "asset-1",
      status: "generated",
      width: 1920,
      height: 1080,
      durationMs: 2000,
      reframe: {
        mode: "track",
        trackId: track.id,
        sourceWidth: 1920,
        sourceHeight: 1080
      }
    });
    const layers = computeActiveLayers(
      [
        {
          id: "video",
          name: "Video",
          type: "video",
          index: 0,
          visible: true,
          locked: false
        }
      ],
      [clip],
      1000,
      { canvas: { width: 1080, height: 1920 }, mediaTracks: [track] }
    );
    const expected = resolveReframeCrop(
      clip.reframe!,
      1000,
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
      track
    );
    expect(layers[0]?.crop).toEqual(expected);
  });

  it.each([
    {
      name: "speed",
      clip: { speedMultiplier: 2 },
      atMs: 500,
      expectedSourceMs: 1000
    },
    {
      name: "time remap",
      clip: {
        timeRemap: {
          keyframes: [
            { t: 0, sourceMs: 2000 },
            { t: 1, sourceMs: 0 }
          ]
        }
      },
      atMs: 500,
      expectedSourceMs: 1500
    }
  ])(
    "uses the clip source clock through $name",
    ({ clip: timing, atMs, expectedSourceMs }) => {
      const sourceTrack: MediaTrack = {
        ...track,
        samples: [
          { sourceMs: 0, x: 0.2, y: 0.5 },
          { sourceMs: 2000, x: 0.8, y: 0.5 }
        ]
      };
      const clip = makeClip({
        id: "clip-1",
        trackId: "video",
        mediaType: "video",
        currentAssetId: "asset-1",
        status: "generated",
        width: 1920,
        height: 1080,
        durationMs: 2000,
        reframe: { mode: "track", trackId: sourceTrack.id },
        ...timing
      });
      const layers = computeActiveLayers(
        [
          {
            id: "video",
            name: "Video",
            type: "video",
            index: 0,
            visible: true,
            locked: false
          }
        ],
        [clip],
        atMs,
        { canvas: { width: 1080, height: 1920 }, mediaTracks: [sourceTrack] }
      );
      const expected = resolveReframeCrop(
        clip.reframe!,
        expectedSourceMs,
        { width: 1920, height: 1080 },
        { width: 1080, height: 1920 },
        sourceTrack
      );
      expect(layers[0]?.crop).toEqual(expected);
    }
  );

  it("adds replacement keyframes without mutating and clears only reframe", () => {
    const reframe: ClipReframe = {
      mode: "center",
      keyframes: [{ sourceMs: 1000, x: 0.4, y: 0.5 }]
    };
    const next = addReframeKeyframe(reframe, {
      sourceMs: 1000,
      x: 0.7,
      y: 0.5
    });
    expect(next.keyframes).toEqual([{ sourceMs: 1000, x: 0.7, y: 0.5 }]);
    expect(reframe.keyframes?.[0]?.x).toBe(0.4);

    const clip = makeClip({ id: "clip-1", name: "Shot", reframe: next });
    const cleared = clearReframe(clip);
    expect(cleared.reframe).toBeUndefined();
    expect(cleared.name).toBe("Shot");
  });

  it("marks only automatic source analysis stale", () => {
    const clip = makeClip({
      currentAssetId: "asset-2",
      reframe: {
        mode: "auto",
        sourceAssetId: "asset-1",
        keyframes: [{ sourceMs: 0, x: 0.5, y: 0.5 }]
      }
    });
    expect(isReframeStale(clip)).toBe(true);
    expect(clip.reframe?.keyframes).toHaveLength(1);
  });

  it("ignores stale automatic samples in the shared scene model", () => {
    const clip = makeClip({
      id: "clip-1",
      trackId: "video",
      mediaType: "video",
      currentAssetId: "asset-2",
      status: "generated",
      width: 1920,
      height: 1080,
      durationMs: 2000,
      reframe: {
        mode: "auto",
        sourceAssetId: "asset-1",
        samples: [{ sourceMs: 0, x: 0.9, y: 0.5 }]
      }
    });
    const layers = computeActiveLayers(
      [
        {
          id: "video",
          name: "Video",
          type: "video",
          index: 0,
          visible: true,
          locked: false
        }
      ],
      [clip],
      0,
      { canvas: { width: 1080, height: 1920 } }
    );

    expect(layers[0]?.crop?.left).toBeCloseTo(0.341796875);
    expect(layers[0]?.crop?.right).toBeCloseTo(0.341796875);
  });
});
