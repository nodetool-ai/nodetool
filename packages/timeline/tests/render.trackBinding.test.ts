/**
 * `trackBinding`'s fold into `resolveAnimatedLayerProps` (P0 AI Video,
 * Phase 2). Only `"position"`/`"position_scale"` are live.
 */
import { describe, expect, it } from "vitest";
import { makeClip } from "../src/index.js";
import type { TimelineClip } from "../src/index.js";
import { resolveAnimatedLayerProps } from "../src/render/sceneModel.js";
import type { MediaTrack } from "../src/types.js";

const CANVAS = { width: 1000, height: 1000 };

function clip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    status: "generated",
    currentAssetId: "asset-1",
    mediaType: "text",
    startMs: 0,
    durationMs: 2000,
    transform: {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 }
    },
    ...overrides
  });
}

function track(overrides: Partial<MediaTrack> = {}): MediaTrack {
  return {
    id: "track_1",
    clipId: "clip_source",
    sourceAssetId: "asset-src",
    name: "Product",
    kind: "box",
    sourceStartMs: 0,
    sourceEndMs: 2000,
    samples: [
      { sourceMs: 0, x: 0.5, y: 0.5 },
      { sourceMs: 2000, x: 0.9, y: 0.9 }
    ],
    status: "ready",
    ...overrides
  };
}

function trackingContext(
  mediaTrack = track(),
  ownerOverrides: Partial<TimelineClip> = {}
) {
  const owner = clip({
    id: mediaTrack.clipId,
    mediaType: "video",
    durationMs: 10_000,
    ...ownerOverrides
  });
  return { mediaTracks: [mediaTrack], clips: [owner] };
}

describe("resolveAnimatedLayerProps with a trackBinding", () => {
  it("offsets the transform by the track sample at the current time", () => {
    const bound = clip({
      trackBinding: { trackId: "track_1", mode: "position" }
    });
    const props = resolveAnimatedLayerProps(
      { clip: bound, transform: bound.transform, opacity: 1 },
      2000,
      CANVAS,
      undefined,
      trackingContext()
    );
    // sample.x = 0.9 → (0.9 - 0.5) * 1000 = 400px offset from center.
    expect(props.transform?.position.x).toBeCloseTo(400);
    expect(props.transform?.position.y).toBeCloseTo(400);
  });

  it("adds the binding's own offset on top of the track sample", () => {
    const bound = clip({
      trackBinding: {
        trackId: "track_1",
        mode: "position",
        offset: { x: 10, y: -20 }
      }
    });
    const props = resolveAnimatedLayerProps(
      { clip: bound, transform: bound.transform, opacity: 1 },
      2000,
      CANVAS,
      undefined,
      trackingContext()
    );
    expect(props.transform?.position.x).toBeCloseTo(410);
    expect(props.transform?.position.y).toBeCloseTo(380);
  });

  it("applies the binding's scale multiplier only in position_scale mode", () => {
    const bound = clip({
      trackBinding: {
        trackId: "track_1",
        mode: "position_scale",
        scale: 2
      }
    });
    const props = resolveAnimatedLayerProps(
      { clip: bound, transform: bound.transform, opacity: 1 },
      0,
      CANVAS,
      undefined,
      trackingContext()
    );
    expect(props.transform?.scale).toEqual({ x: 2, y: 2 });
  });

  it("leaves scale at 1 in plain position mode", () => {
    const bound = clip({
      trackBinding: { trackId: "track_1", mode: "position" }
    });
    const props = resolveAnimatedLayerProps(
      { clip: bound, transform: bound.transform, opacity: 1 },
      0,
      CANVAS,
      undefined,
      trackingContext()
    );
    expect(props.transform?.scale).toEqual({ x: 1, y: 1 });
  });

  it("does nothing for an unbound clip, even with mediaTracks supplied", () => {
    const unbound = clip();
    const props = resolveAnimatedLayerProps(
      { clip: unbound, transform: unbound.transform, opacity: 1 },
      2000,
      CANVAS,
      undefined,
      trackingContext()
    );
    expect(props.transform).toEqual(unbound.transform);
  });

  it("does nothing for a binding in a not-yet-live mode", () => {
    const bound = clip({
      trackBinding: { trackId: "track_1", mode: "mask" }
    });
    const props = resolveAnimatedLayerProps(
      { clip: bound, transform: bound.transform, opacity: 1 },
      2000,
      CANVAS,
      undefined,
      trackingContext()
    );
    expect(props.transform).toEqual(bound.transform);
  });

  it("does nothing when the named track is absent from mediaTracks", () => {
    const bound = clip({
      trackBinding: { trackId: "missing", mode: "position" }
    });
    const props = resolveAnimatedLayerProps(
      { clip: bound, transform: bound.transform, opacity: 1 },
      2000,
      CANVAS,
      undefined,
      trackingContext()
    );
    expect(props.transform).toEqual(bound.transform);
  });

  it("samples the tracked owner's source clock rather than the follower's", () => {
    const bound = clip({
      id: "follower",
      startMs: 1000,
      trackBinding: { trackId: "track_1", mode: "position" }
    });
    const mediaTrack = track({
      sourceStartMs: 5000,
      sourceEndMs: 9000,
      samples: [
        { sourceMs: 5000, x: 0.1, y: 0.5 },
        { sourceMs: 9000, x: 0.9, y: 0.5 }
      ]
    });

    const props = resolveAnimatedLayerProps(
      { clip: bound, transform: bound.transform, opacity: 1 },
      2000,
      CANVAS,
      undefined,
      trackingContext(mediaTrack, { startMs: 0, inPointMs: 5000 })
    );

    expect(props.transform?.position.x).toBeCloseTo(0);
  });

  it("samples a retimed tracked owner", () => {
    const bound = clip({
      id: "follower",
      trackBinding: { trackId: "track_1", mode: "position" }
    });
    const mediaTrack = track({
      sourceEndMs: 4000,
      samples: [
        { sourceMs: 0, x: 0.1, y: 0.5 },
        { sourceMs: 4000, x: 0.9, y: 0.5 }
      ]
    });

    const props = resolveAnimatedLayerProps(
      { clip: bound, transform: bound.transform, opacity: 1 },
      1000,
      CANVAS,
      undefined,
      trackingContext(mediaTrack, {
        timeRemap: {
          keyframes: [
            { t: 0, sourceMs: 0 },
            { t: 1, sourceMs: 4000 }
          ]
        },
        durationMs: 2000
      })
    );

    expect(props.transform?.position.x).toBeCloseTo(0);
  });
});
