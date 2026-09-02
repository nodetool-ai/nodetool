/**
 * A document from a newer build, at the render layer (I2, T11b).
 *
 * `transitionIn.type` and `effects[].type` are plain strings on the wire, so a
 * cut or an effect this build has never heard of reaches the scene model and
 * the compositors as data. Neither may throw: the cut falls back to a
 * cross-fade and the effect is skipped and *named*, because a picture that
 * quietly differs from the one the document asked for is the bug I7 exists to
 * prevent.
 *
 * Pixels are not the subject here — the Canvas 2D rules are checked against a
 * recording fake, and the GPU half is in `render.forwardCompat.gpu.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/index.js";
import type { ClipEffect, TimelineClip, TimelineTrack } from "../src/index.js";
import { computeActiveLayersWithHorizon } from "../src/render/sceneModel.js";
import {
  drawTimelineFrame,
  filterForEffects,
  unsupportedEffectTypes,
  type Canvas2DLayer,
  type CompositeContext2D
} from "../src/render/canvas2d.js";
import { resolveTransition } from "../src/render/transition.js";

const CANVAS = { width: 100, height: 100 };
const GEOMETRY = { canvasWidth: 100, canvasHeight: 100 };

/** An effect only a newer build applies. `id`/`type`/`enabled` are the shape
 *  every compositor addresses the chain by; the rest is that build's own. */
const filmGrain: ClipEffect = {
  id: "fx-grain",
  type: "filmGrain",
  enabled: true,
  size: 2,
  strength: 0.4
};

const blur: ClipEffect = {
  id: "fx-blur",
  type: "blur",
  enabled: true,
  radius: 4
};

const tracks: TimelineTrack[] = [
  makeTrack({ id: "video", type: "video", index: 0, visible: true })
];

const videoClip = (over: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    mediaType: "video",
    trackId: "video",
    status: "generated",
    currentAssetId: "asset-1",
    startMs: 0,
    durationMs: 2000,
    ...over
  });

/** Records what each `drawImage` drew under, so a draw names its layer. */
class RecordingContext implements CompositeContext2D<string> {
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  filter = "none";
  shadowColor = "rgba(0, 0, 0, 0)";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  fillStyle: string | object = "#000";
  readonly draws: { source: string; alpha: number; filter: string }[] = [];

  save(): void {}
  restore(): void {}
  setTransform(): void {}
  clearRect(): void {}
  fillRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  rect(): void {}
  moveTo(): void {}
  arcTo(): void {}
  clip(): void {}
  drawImage(source: string): void {
    this.draws.push({
      source,
      alpha: this.globalAlpha,
      filter: this.filter
    });
  }
  createLinearGradient(): {
    addColorStop(offset: number, color: string): void;
  } {
    return { addColorStop: () => {} };
  }
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  ellipse(): void {}
  fill(): void {}
  translate(): void {}
  scale(): void {}
  createRadialGradient(): {
    addColorStop(offset: number, color: string): void;
  } {
    return { addColorStop: () => {} };
  }
  getImageData(
    _x: number,
    _y: number,
    w: number,
    h: number
  ): { data: Uint8ClampedArray; width: number; height: number } {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  putImageData(): void {}
}

const layer = (
  over: Partial<Canvas2DLayer<string>>
): Canvas2DLayer<string> => ({
  id: "l1",
  source: "l1",
  sourceWidth: 100,
  sourceHeight: 100,
  opacity: 1,
  blendMode: "normal",
  zIndex: 0,
  ...over
});

describe("Canvas 2D — an effect type this build cannot apply", () => {
  it("names it rather than dropping it silently (I7)", () => {
    expect(unsupportedEffectTypes([{ effects: [filmGrain, blur] }])).toEqual([
      "filmGrain"
    ]);
  });

  it("leaves it out of the filter it builds, keeping the ones it knows", () => {
    expect(filterForEffects([filmGrain], undefined)).toBe("none");
    expect(filterForEffects([filmGrain, blur], undefined)).toBe("blur(4.00px)");
  });

  it("still draws the layer", () => {
    const ctx = new RecordingContext();
    drawTimelineFrame(ctx, [layer({ effects: [filmGrain] })], GEOMETRY);
    expect(ctx.draws.map((d) => d.source)).toEqual(["l1"]);
  });
});

describe("scene model — a cut this build cannot draw", () => {
  const clips = [
    videoClip({ id: "under", startMs: 0, durationMs: 2000 }),
    videoClip({
      id: "over",
      startMs: 1000,
      durationMs: 2000,
      transitionIn: {
        type: "futureWipe3D",
        durationMs: 500,
        axis: "z"
      }
    })
  ];

  it("cross-fades it, at the halfway point of its own window", () => {
    const pair = resolveTransition(clips[1]!, clips, 1250);
    expect(pair?.incoming.type).toBe("crossfade");
    expect(pair?.incoming.opacity).toBeCloseTo(0.5);
    // A cross-fade fades the incoming clip over an outgoing one that stays
    // opaque, which is the record the partner gets.
    expect(pair?.outgoing?.opacity).toBe(1);
  });

  it("reaches both compositors as a resolved cross-fade", () => {
    const { layers } = computeActiveLayersWithHorizon(tracks, clips, 1250, {
      canvas: CANVAS
    });
    const over = layers.find((l) => l.clip.id === "over");
    expect(over?.transition?.type).toBe("crossfade");
    expect(over?.opacity).toBeCloseTo(0.5);
  });

  it("draws both clips of the cut without throwing", () => {
    const ctx = new RecordingContext();
    const { layers } = computeActiveLayersWithHorizon(tracks, clips, 1250, {
      canvas: CANVAS
    });
    drawTimelineFrame(
      ctx,
      layers.map((l) =>
        layer({
          id: l.clip.id,
          source: l.clip.id,
          opacity: l.opacity,
          zIndex: l.trackIndex,
          ...(l.transition ? { transition: l.transition } : {})
        })
      ),
      GEOMETRY
    );
    expect(ctx.draws.map((d) => d.source).sort()).toEqual(["over", "under"]);
  });
});
