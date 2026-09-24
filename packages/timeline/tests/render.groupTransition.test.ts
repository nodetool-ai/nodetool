import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/index.js";
import type { ClipTransition, TimelineClip, TimelineTrack } from "../src/index.js";
import {
  drawTimelineFrame,
  type Canvas2DLayer,
  type CompositeContext2D
} from "../src/render/canvas2d.js";
import { computeActiveLayersWithHorizon, trackZ } from "../src/render/sceneModel.js";

const SIZE = 100;
const tracks: TimelineTrack[] = [
  makeTrack({ id: "video", type: "video", index: 0, visible: true }),
  makeTrack({ id: "overlay", type: "overlay", index: 1, visible: true }),
  makeTrack({ id: "deep", type: "overlay", index: 2, visible: true })
];

function context(canvas: Canvas): CompositeContext2D<Canvas> {
  return canvas.getContext("2d") as unknown as CompositeContext2D<Canvas>;
}

function solid(color: string): Canvas {
  const canvas = createCanvas(SIZE, SIZE);
  canvas.getContext("2d").fillStyle = color;
  canvas.getContext("2d").fillRect(0, 0, SIZE, SIZE);
  return canvas;
}

function group(transitionIn: ClipTransition, startMs = 0, id = "group"): TimelineClip {
  return makeClip({
    id, trackId: "video", mediaType: "group", status: "generated",
    startMs, durationMs: 1200, transitionIn
  });
}

function image(id: string, trackId: string, startMs = 0, parentId?: string): TimelineClip {
  return makeClip({
    id, trackId, parentId, mediaType: "image", status: "generated",
    currentAssetId: `asset-${id}`, startMs, durationMs: 1200
  });
}

function render(clips: TimelineClip[], sources: Record<string, Canvas>, timeMs: number): {
  pixels: Uint8ClampedArray;
  scene: ReturnType<typeof computeActiveLayersWithHorizon>;
} {
  const scene = computeActiveLayersWithHorizon(tracks, clips, timeMs, {
    canvas: { width: SIZE, height: SIZE }
  });
  const output = createCanvas(SIZE, SIZE);
  const layers: Canvas2DLayer<Canvas>[] = scene.layers.map((layer) => ({
    clipId: layer.clipId,
    source: sources[layer.clipId]!, sourceWidth: SIZE, sourceHeight: SIZE,
    opacity: layer.opacity, blendMode: layer.blendMode,
    zIndex: trackZ(layer.trackIndex),
    stackOrder: layer.stackOrder,
    transform: layer.transform,
    parentMatrix: layer.parentMatrix,
    precomposeGroupId: layer.precomposeGroupId,
    transition: layer.transition
  }));
  drawTimelineFrame(context(output), layers, {
    canvasWidth: SIZE, canvasHeight: SIZE
  }, {
    alpha: true,
    precomposites: scene.precomposites.map((item) => ({
      id: item.clipId,
      zIndex: trackZ(item.trackIndex),
      stackOrder: item.stackOrder,
      opacity: item.opacity,
      blendMode: item.blendMode,
      effects: item.effects,
      transition: item.transition,
      precomposeGroupId: item.precomposeGroupId
    })),
    precompositeSurface: (width, height) => {
      const canvas = createCanvas(width, height);
      return { surface: canvas, ctx: context(canvas) };
    }
  });
  return {
    pixels: output.getContext("2d").getImageData(0, 0, SIZE, SIZE).data,
    scene
  };
}

function pixel(pixels: Uint8ClampedArray, x: number, y: number): number[] {
  const offset = (y * SIZE + x) * 4;
  return [...pixels.slice(offset, offset + 4)];
}

describe("whole-group transitions", () => {
  it("crossfades the composed result once across overlapping children", () => {
    const { pixels, scene } = render([
      group({ type: "crossfade", durationMs: 400 }),
      image("red", "overlay", 0, "group"),
      image("green", "overlay", 0, "group")
    ], { red: solid("#ff0000"), green: solid("#00ff00") }, 200);
    expect(scene.precomposites[0]?.transition?.role).toBe("in");
    expect(scene.layers.map((layer) => layer.opacity)).toEqual([1, 1]);
    expect(pixel(pixels, 50, 50)).toEqual([0, 255, 0, 128]);
  });

  it("pushes the composed group in while pushing the outgoing clip out", () => {
    const { pixels, scene } = render([
      image("blue", "video"),
      group({ type: "push", durationMs: 400, direction: "left" }, 800),
      image("red", "overlay", 800, "group")
    ], { blue: solid("#0000ff"), red: solid("#ff0000") }, 1000);
    expect(scene.precomposites[0]?.transition?.role).toBe("in");
    expect(scene.layers.find((layer) => layer.clipId === "blue")?.transition?.role).toBe("out");
    expect(pixel(pixels, 20, 50)[0]).toBeGreaterThan(200);
    expect(pixel(pixels, 80, 50)[2]).toBeGreaterThan(200);
  });

  it("pairs an incoming group with an outgoing group on the same track", () => {
    const { pixels, scene } = render([
      group({ type: "crossfade", durationMs: 0 }, 0, "outgoing"),
      image("blue", "overlay", 0, "outgoing"),
      group({ type: "push", durationMs: 400, direction: "left" }, 800),
      image("red", "overlay", 800, "group")
    ], { blue: solid("#0000ff"), red: solid("#ff0000") }, 1000);
    expect(scene.precomposites.find((item) => item.clipId === "outgoing")?.transition?.role).toBe("out");
    expect(pixel(pixels, 20, 50)[0]).toBeGreaterThan(200);
    expect(pixel(pixels, 80, 50)[2]).toBeGreaterThan(200);
  });

  it("stacks overlapping group surfaces by their own start times, not child track discovery", () => {
    const { pixels, scene } = render([
      group({ type: "crossfade", durationMs: 0 }, 0, "outgoing"),
      image("blue", "deep", 0, "outgoing"),
      group({ type: "crossfade", durationMs: 400 }, 800, "incoming"),
      image("red", "overlay", 800, "incoming")
    ], { blue: solid("#0000ff"), red: solid("#ff0000") }, 1000);
    expect(scene.precomposites.map((item) => item.clipId)).toEqual(["outgoing", "incoming"]);
    const [red, green, blue, alpha] = pixel(pixels, 50, 50);
    expect(red).toBeGreaterThan(115);
    expect(red).toBeLessThan(140);
    expect(green).toBe(0);
    expect(blue).toBeGreaterThan(115);
    expect(blue).toBeLessThan(140);
    expect(alpha).toBe(255);
  });

  it("stacks an outgoing group beneath an incoming ordinary clip on the same track", () => {
    const { pixels, scene } = render([
      group({ type: "crossfade", durationMs: 0 }, 0, "outgoing"),
      image("blue", "overlay", 0, "outgoing"),
      { ...image("red", "video", 800), transitionIn: { type: "crossfade", durationMs: 400 } }
    ], { blue: solid("#0000ff"), red: solid("#ff0000") }, 1000);
    expect(scene.precomposites.map((item) => item.clipId)).toEqual(["outgoing"]);
    expect(scene.precomposites[0]?.stackOrder).toBeLessThan(scene.layers.find((item) => item.clipId === "red")?.stackOrder ?? -1);
    const [red, , blue, alpha] = pixel(pixels, 50, 50);
    expect(red).toBeGreaterThan(115);
    expect(red).toBeLessThan(140);
    expect(blue).toBeGreaterThan(115);
    expect(blue).toBeLessThan(140);
    expect(alpha).toBe(255);
  });

  it("reveals the composed group with a frame-wide wipe", () => {
    const { pixels } = render([
      image("blue", "video"),
      group({ type: "wipe", durationMs: 400, direction: "left" }, 800),
      image("red", "overlay", 800, "group")
    ], { blue: solid("#0000ff"), red: solid("#ff0000") }, 1000);
    expect(pixel(pixels, 20, 50)[0]).toBeGreaterThan(200);
    expect(pixel(pixels, 80, 50)[2]).toBeGreaterThan(200);
  });

  it("dips the frame beneath an incoming group to the authored color", () => {
    const { pixels } = render([
      image("blue", "video"),
      group({ type: "dipToColor", durationMs: 400, color: "#00ff00" }, 800),
      image("red", "overlay", 800, "group")
    ], { blue: solid("#0000ff"), red: solid("#ff0000") }, 1000);
    const [red, green, blue] = pixel(pixels, 50, 50);
    expect(red).toBeLessThan(12);
    expect(green).toBeGreaterThan(240);
    expect(blue).toBeLessThan(12);
  });
});
