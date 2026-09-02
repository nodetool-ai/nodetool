/**
 * A shape clip's animated trim reaching the rasterizer (F8, T16).
 *
 * `trimStart`/`trimEnd` are the only animated channels the compositor cannot
 * apply — they change the outline itself, so they have to be in hand *before*
 * the layer is rasterized. Both browser hosts get them the same way, through
 * the sampled props `buildCompositeLayer` now hands to `resolveSource`; before
 * that they rasterized `layer.shapeStyle` and a trim animation held its first
 * frame in the preview and the export while animating in the server render.
 *
 * jsdom has no 2D canvas, so this pins the style the host would draw rather
 * than the pixels. The pixels are checked in
 * `packages/agents/tests/timeline-shape-frames.test.ts`.
 */

import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type {
  ClipAnimation,
  ClipShapeStyle,
  TimelineClip
} from "@nodetool-ai/timeline";
import {
  computeActiveLayersWithHorizon,
  type ActiveLayer,
  type AnimatedLayerProps
} from "@nodetool-ai/timeline/render";

import { buildCompositeLayers } from "../compositeLayers";
import type { CompositeSource } from "../gpu/types";

const FRAME = { width: 200, height: 100 };

const track = makeTrack({
  id: "video",
  type: "video",
  index: 0,
  visible: true
});

const stroke: ClipShapeStyle = {
  kind: "line",
  x: 0,
  y: 0.5,
  x2: 1,
  y2: 0.5,
  stroke: "#ffffff",
  strokeWidthPx: 4
};

/** `trimEnd` sweeping 0 → 1 across the clip. */
const drawOn: ClipAnimation = {
  id: "draw-on",
  role: "in",
  preset: "custom",
  durationMs: 1000,
  custom: {
    curves: [
      {
        property: "trimEnd",
        keyframes: [
          { t: 0, value: 0 },
          { t: 1, value: 1 }
        ]
      }
    ]
  }
};

function shapeClip(animations?: ClipAnimation[]): TimelineClip {
  return makeClip({
    id: "stroke",
    trackId: track.id,
    mediaType: "shape",
    startMs: 0,
    durationMs: 1000,
    status: "generated",
    shapeStyle: stroke,
    animations
  });
}

/** The style the host would rasterize at `atMs`. */
function rasterizedStyleAt(
  clip: TimelineClip,
  atMs: number
): ClipShapeStyle | undefined {
  const scene = computeActiveLayersWithHorizon([track], [clip], atMs, {
    canvas: FRAME
  });
  let seen: ClipShapeStyle | undefined;
  buildCompositeLayers(scene.layers, {
    atMs,
    canvas: FRAME,
    resolveSource: (layer: ActiveLayer, anim: AnimatedLayerProps) => {
      seen = anim.shapeStyle ?? layer.shapeStyle;
      return { source: {} as CompositeSource };
    }
  });
  return seen;
}

describe("an animated trim on a shape clip", () => {
  it("hands the rasterizer a different range at two timecodes", () => {
    const clip = shapeClip([drawOn]);
    expect(rasterizedStyleAt(clip, 250)?.trimEnd).toBeCloseTo(0.25, 3);
    expect(rasterizedStyleAt(clip, 750)?.trimEnd).toBeCloseTo(0.75, 3);
  });

  it("leaves the clip's own style alone when nothing drives the trim", () => {
    const style = rasterizedStyleAt(shapeClip(), 500);
    expect(style).toBe(stroke);
    expect(style?.trimEnd).toBeUndefined();
  });
});
