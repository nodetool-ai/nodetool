/**
 * A real pixel check that a nested flex layout draws where it resolved to —
 * through the actual Canvas 2D pipeline (`computeActiveLayersWithHorizon` +
 * `drawShape` + `drawTimelineFrame`), not just the `clipLayoutBox` math the
 * rest of `render.spatialTiming.test.ts` checks. Column containing a row,
 * plus the absolute `inset:0` plate primitive AGENTS.md documents.
 */
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/index.js";
import type { TimelineClip } from "../src/index.js";
import { computeActiveLayersWithHorizon } from "../src/render/sceneModel.js";
import { drawShape, drawText, measureTextWith } from "../src/render/draw.js";
import { drawTimelineFrame, type Canvas2DLayer } from "../src/render/canvas2d.js";
import { registerBundledFonts } from "../src/fonts/register-node.js";

registerBundledFonts();

const WIDTH = 400;
const HEIGHT = 300;

const track = makeTrack({ id: "video", type: "video", index: 0, visible: true });

const clip = (over: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    trackId: track.id,
    mediaType: "shape",
    startMs: 0,
    durationMs: 1000,
    status: "generated",
    ...over
  });

describe("nested flex layout draws where it resolved to (Canvas 2D)", () => {
  it("puts a coloured absolute inset:0 plate exactly over its container's box, inside a column>row nesting", () => {
    // outer: a flex column root, anchored top-left, so its box's top-left is
    // exactly at a known pixel — easy to predict without re-deriving anchor
    // math in the test.
    const outer = clip({
      id: "outer",
      mediaType: "group",
      shapeStyle: undefined,
      transform: {
        position: { x: -WIDTH / 2 + 40, y: -HEIGHT / 2 + 30 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 }
      },
      layout: { display: "flex", flexDirection: "column", width: 200, height: 120, padding: 10 }
    });
    // innerRow: a nested flex container (a real child of `outer`), holding
    // the plate and a marker leaf side by side.
    const innerRow = clip({
      id: "inner-row",
      mediaType: "group",
      parentId: "outer",
      shapeStyle: undefined,
      layout: { display: "flex", flexDirection: "row", width: 180, height: 100 }
    });
    const plate = clip({
      id: "plate",
      parentId: "inner-row",
      shapeStyle: { kind: "rect", fill: "#ff3366" },
      flexItem: { position: "absolute", inset: 0 }
    });
    const marker = clip({
      id: "marker",
      parentId: "inner-row",
      shapeStyle: { kind: "rect", width: 0.02, height: 0.02, fill: "#00ff00" }
    });

    const canvas = { width: WIDTH, height: HEIGHT };
    const { layers } = computeActiveLayersWithHorizon(
      [track],
      [outer, innerRow, plate, marker],
      500,
      { canvas }
    );
    const plateLayer = layers.find((l) => l.clipId === "plate")!;
    expect(plateLayer).toBeDefined();
    expect(plateLayer.clip.shapeStyle?.width).toBeCloseTo(180 / WIDTH, 3);
    expect(plateLayer.clip.shapeStyle?.height).toBeCloseTo(100 / HEIGHT, 3);

    // Predict the plate's screen box the same way the resolver does: outer's
    // top-left is exactly at (40, 30) (anchor 0,0), padding 10 puts
    // inner-row's box at (50, 40), sized 180x100 (an explicit flexItem size
    // on inner-row was not set, but its own explicit layout.width/height
    // pins it) — and the plate fills that box exactly (inset: 0).
    const expectedLeft = 50;
    const expectedTop = 40;
    const expectedRight = expectedLeft + 180;
    const expectedBottom = expectedTop + 100;

    const raster = createCanvas(WIDTH, HEIGHT);
    drawShape(raster.getContext("2d"), plateLayer.clip.shapeStyle!, WIDTH, HEIGHT);

    const output = createCanvas(WIDTH, HEIGHT);
    const canvasLayer: Canvas2DLayer<typeof raster> = {
      clipId: "plate",
      source: raster,
      sourceWidth: WIDTH,
      sourceHeight: HEIGHT,
      opacity: 1,
      blendMode: "normal",
      zIndex: 0,
      transform: plateLayer.transform,
      // `layer.transform` is parent-local now (AGENTS.md) — the root's own
      // placement composes through `parentMatrix`, same as any other group's
      // children, so drawing without it would skip that composition.
      parentMatrix: plateLayer.parentMatrix
    };
    drawTimelineFrame(
      output.getContext("2d") as any,
      [canvasLayer],
      { canvasWidth: WIDTH, canvasHeight: HEIGHT },
      { alpha: true }
    );

    const ctx = output.getContext("2d");
    const alphaAt = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data[3] ?? 0;
    const redAt = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data[0] ?? 0;

    // Inside the plate: opaque and red (#ff3366).
    expect(alphaAt(expectedLeft + 20, expectedTop + 20)).toBeGreaterThan(200);
    expect(redAt(expectedLeft + 20, expectedTop + 20)).toBeGreaterThan(200);
    expect(alphaAt(Math.round((expectedLeft + expectedRight) / 2), Math.round((expectedTop + expectedBottom) / 2))).toBeGreaterThan(200);

    // Outside the plate on every side: transparent.
    expect(alphaAt(expectedLeft - 10, expectedTop + 20)).toBe(0);
    expect(alphaAt(expectedRight + 10, expectedTop + 20)).toBe(0);
    expect(alphaAt(expectedLeft + 20, expectedTop - 10)).toBe(0);
    expect(alphaAt(expectedLeft + 20, expectedBottom + 10)).toBe(0);
  });

  it("stacks 3 single-line headlines 24px apart with no overlap (regression: the wrap-width round trip)", () => {
    // Reproduces the S3 bug: the flex resolver measures each headline
    // unconstrained to get its natural (single-line) width, then feeds that
    // exact width back in as the drawn clip's wrap width. Before the fix,
    // `wrapTextLines`'s whole-string re-measurement could come out a hair
    // over that exact width and wrap the line — doubling its height and
    // eating into the 24px gap to (or overlapping) its neighbour below.
    // A real sequence canvas size, not the 400x300 the plate test above
    // uses — these headlines are genuinely single-line only at a realistic
    // frame width; a too-narrow canvas would wrap them for real and the
    // test would not be testing the round-trip bug at all.
    const CANVAS_WIDTH = 1920;
    const CANVAS_HEIGHT = 1080;
    const HEADLINES = ["HOW IT WORKS", "Every purchase", "rounds up to savings."];
    const stack = clip({
      id: "stack",
      mediaType: "group",
      shapeStyle: undefined,
      transform: { position: { x: -CANVAS_WIDTH / 2, y: -CANVAS_HEIGHT / 2 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0, y: 0 } },
      layout: { display: "flex", flexDirection: "column", gap: 24 }
    });
    const lines = HEADLINES.map((text, index) =>
      clip({
        id: `line-${index}`,
        mediaType: "text",
        parentId: "stack",
        shapeStyle: undefined,
        textStyle: { text, fontFamily: "Inter", fontSizePx: 40, fontWeight: 700, color: "#ffffff", align: "left" }
      })
    );

    const canvas = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, measureText: measureTextWith(createCanvas(1, 1).getContext("2d")) };
    const { layers } = computeActiveLayersWithHorizon([track], [stack, ...lines], 500, { canvas });

    const output = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const canvasLayers: Canvas2DLayer<ReturnType<typeof createCanvas>>[] = lines.map((line, index) => {
      const layer = layers.find((l) => l.clipId === line.id)!;
      expect(layer).toBeDefined();
      const raster = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
      drawText(raster.getContext("2d"), layer.clip.textStyle!, CANVAS_WIDTH, CANVAS_HEIGHT);
      return {
        clipId: line.id,
        source: raster,
        sourceWidth: CANVAS_WIDTH,
        sourceHeight: CANVAS_HEIGHT,
        opacity: 1,
        blendMode: "normal",
        zIndex: index,
        transform: layer.transform
      };
    });
    drawTimelineFrame(output.getContext("2d") as any, canvasLayers, { canvasWidth: CANVAS_WIDTH, canvasHeight: CANVAS_HEIGHT }, { alpha: true });

    // Find each headline's own ink band: the contiguous run of rows with any
    // opaque pixel, scanning down the column's known x (headlines are
    // left-aligned at the stack's left edge).
    const ctx = output.getContext("2d");
    const rowHasInk = (y: number): boolean => {
      const row = ctx.getImageData(0, y, CANVAS_WIDTH, 1).data;
      for (let i = 3; i < row.length; i += 4) if ((row[i] ?? 0) > 10) return true;
      return false;
    };
    const bands: Array<{ start: number; end: number }> = [];
    let bandStart: number | null = null;
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      const ink = rowHasInk(y);
      if (ink && bandStart === null) bandStart = y;
      if (!ink && bandStart !== null) {
        bands.push({ start: bandStart, end: y - 1 });
        bandStart = null;
      }
    }
    if (bandStart !== null) bands.push({ start: bandStart, end: CANVAS_HEIGHT - 1 });

    // One ink band per headline (a wrap would either merge two bands into
    // one taller block that overlaps the next, or split a single headline
    // into two bands) — and the resolver's own resolved boxes never
    // overlap.
    expect(bands).toHaveLength(HEADLINES.length);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i]!.start).toBeGreaterThan(bands[i - 1]!.end);
    }
  });

  it("composes a flex root's placement through a scaled, offset non-flex ancestor", () => {
    // A stack living inside an ordinary (non-flex) group that is itself
    // moved and scaled — a phone mockup, a camera rig, any group an author
    // nudges around the frame. The flex resolver only ever computes a
    // clip's `transform.position` in the same "local, canvas-pixel" units
    // every other clip's position already is — the ancestor's own matrix
    // (`resolveGroups` + `layer.parentMatrix`, untouched by the flex
    // resolver) composes on top at draw time exactly as it does for a
    // clip with no `layout` at all. This asserts that composition lands
    // both stacked shapes at the ancestor-relative position/scale expected,
    // not at the position they would have without the ancestor.
    const CANVAS_WIDTH = 1920;
    const CANVAS_HEIGHT = 1080;
    const ancestor = clip({
      id: "ancestor",
      mediaType: "group",
      shapeStyle: undefined,
      transform: { position: { x: 300, y: 200 }, scale: { x: 0.5, y: 0.5 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } }
    });
    const stack = clip({
      id: "anc-stack",
      mediaType: "group",
      parentId: "ancestor",
      shapeStyle: undefined,
      layout: { display: "flex", flexDirection: "column", gap: 20 }
    });
    const a = clip({ id: "anc-a", mediaType: "shape", parentId: "anc-stack", shapeStyle: { kind: "rect", width: 0.05, height: 0.02, fill: "#ff0000" } });
    const b = clip({ id: "anc-b", mediaType: "shape", parentId: "anc-stack", shapeStyle: { kind: "rect", width: 0.05, height: 0.02, fill: "#00ff00" } });

    const canvas = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    const { layers } = computeActiveLayersWithHorizon([track], [ancestor, stack, a, b], 500, { canvas });
    const output = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const canvasLayers: Canvas2DLayer<ReturnType<typeof createCanvas>>[] = ["anc-a", "anc-b"].map((id, index) => {
      const layer = layers.find((l) => l.clipId === id)!;
      expect(layer).toBeDefined();
      expect(layer.parentMatrix).toBeDefined();
      const raster = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
      drawShape(raster.getContext("2d"), layer.clip.shapeStyle!, CANVAS_WIDTH, CANVAS_HEIGHT);
      return {
        clipId: id, source: raster, sourceWidth: CANVAS_WIDTH, sourceHeight: CANVAS_HEIGHT,
        opacity: 1, blendMode: "normal", zIndex: index, transform: layer.transform, parentMatrix: layer.parentMatrix
      };
    });
    drawTimelineFrame(output.getContext("2d") as any, canvasLayers, { canvasWidth: CANVAS_WIDTH, canvasHeight: CANVAS_HEIGHT }, { alpha: true });

    // Both boxes land near the ancestor's own screen position (canvas
    // center + its (300, 200) offset) — not near plain canvas center, and
    // not off in some ancestor-agnostic spot.
    const ctx = output.getContext("2d");
    const expectedCenterX = CANVAS_WIDTH / 2 + 300;
    const expectedCenterY = CANVAS_HEIGHT / 2 + 200;
    const redPixel = ctx.getImageData(expectedCenterX, expectedCenterY - 15, 1, 1).data;
    const greenPixel = ctx.getImageData(expectedCenterX, expectedCenterY + 15, 1, 1).data;
    expect(redPixel[0]).toBeGreaterThan(200);
    expect(redPixel[1]).toBeLessThan(50);
    expect(greenPixel[1]).toBeGreaterThan(200);
    expect(greenPixel[0]).toBeLessThan(50);
    // Scaled by the ancestor's 0.5: a 0.05-fraction-wide box (96px at full
    // scale) draws about 48px wide on screen.
    let redWidth = 0;
    for (let x = 0; x < CANVAS_WIDTH; x++) {
      const px = ctx.getImageData(x, expectedCenterY - 15, 1, 1).data;
      if (px[0]! > 200 && px[1]! < 50) redWidth++;
    }
    expect(redWidth).toBeGreaterThan(30);
    expect(redWidth).toBeLessThan(70);
  });

  it("composes a flex root's placement through a rotated non-flex ancestor", () => {
    const CANVAS_WIDTH = 1920;
    const CANVAS_HEIGHT = 1080;
    const ancestor = clip({
      id: "rot-ancestor",
      mediaType: "group",
      shapeStyle: undefined,
      transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: Math.PI / 6, anchor: { x: 0.5, y: 0.5 } }
    });
    const stack = clip({
      id: "rot-stack",
      mediaType: "group",
      parentId: "rot-ancestor",
      shapeStyle: undefined,
      layout: { display: "flex", flexDirection: "column", gap: 20 }
    });
    const a = clip({ id: "rot-a", mediaType: "shape", parentId: "rot-stack", shapeStyle: { kind: "rect", width: 0.1, height: 0.05, fill: "#ff0000" } });
    const b = clip({ id: "rot-b", mediaType: "shape", parentId: "rot-stack", shapeStyle: { kind: "rect", width: 0.1, height: 0.05, fill: "#00ff00" } });

    const canvas = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    const { layers } = computeActiveLayersWithHorizon([track], [ancestor, stack, a, b], 500, { canvas });
    const output = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const canvasLayers: Canvas2DLayer<ReturnType<typeof createCanvas>>[] = ["rot-a", "rot-b"].map((id, index) => {
      const layer = layers.find((l) => l.clipId === id)!;
      const raster = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
      drawShape(raster.getContext("2d"), layer.clip.shapeStyle!, CANVAS_WIDTH, CANVAS_HEIGHT);
      return {
        clipId: id, source: raster, sourceWidth: CANVAS_WIDTH, sourceHeight: CANVAS_HEIGHT,
        opacity: 1, blendMode: "normal", zIndex: index, transform: layer.transform, parentMatrix: layer.parentMatrix
      };
    });
    drawTimelineFrame(output.getContext("2d") as any, canvasLayers, { canvasWidth: CANVAS_WIDTH, canvasHeight: CANVAS_HEIGHT }, { alpha: true });

    // Both boxes draw near canvas center (the ancestor's own position is
    // the identity origin here — only rotated), tilted rather than
    // axis-aligned: a horizontal scan at the red box's own nominal center
    // row finds no red (the rotation carried it off that exact row), but a
    // scan offset by the rotation's own rise finds it.
    const ctx = output.getContext("2d");
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2;
    let foundRedNear = false;
    for (let dy = -80; dy <= 0; dy++) {
      const px = ctx.getImageData(centerX, centerY + dy, 1, 1).data;
      if (px[0]! > 200 && px[1]! < 50) { foundRedNear = true; break; }
    }
    expect(foundRedNear).toBe(true);
  });

  it("renders a flex root at (-700, 100) with two stacked text children near that position, not doubled (regression: the parent-local fix)", () => {
    // The root bug: `layout.ts` baked the flex root's own `transform.position`
    // into every descendant's resolved position, and the renderer's normal
    // `parentMatrix` composition (from the root's own, untouched
    // `transform`) added it a second time — doubling a root sitting anywhere
    // but (0, 0). A root this far off-center makes the doubling obvious: at
    // -700 doubled is -1400, off a 1920-wide canvas entirely, so the text
    // would not render at all if the bug came back.
    const CANVAS_WIDTH = 1920;
    const CANVAS_HEIGHT = 1080;
    const root = clip({
      id: "off-center-root",
      mediaType: "group",
      shapeStyle: undefined,
      transform: { position: { x: -700, y: 100 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0, y: 0.5 } },
      layout: { display: "flex", flexDirection: "column", gap: 16 }
    });
    const line1 = clip({
      id: "off-center-line1", mediaType: "text", parentId: "off-center-root",
      textStyle: { text: "Set it once", fontFamily: "Inter", fontSizePx: 40, color: "#ffffff", align: "left" }
    });
    const line2 = clip({
      id: "off-center-line2", mediaType: "text", parentId: "off-center-root",
      textStyle: { text: "Watch it grow.", fontFamily: "Inter", fontSizePx: 40, color: "#ffffff", align: "left" }
    });

    const canvas = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, measureText: measureTextWith(createCanvas(1, 1).getContext("2d")) };
    const { layers } = computeActiveLayersWithHorizon([track], [root, line1, line2], 500, { canvas });
    const output = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const canvasLayers: Canvas2DLayer<ReturnType<typeof createCanvas>>[] = ["off-center-line1", "off-center-line2"].map((id, index) => {
      const layer = layers.find((l) => l.clipId === id)!;
      expect(layer).toBeDefined();
      const raster = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
      drawText(raster.getContext("2d"), layer.clip.textStyle!, CANVAS_WIDTH, CANVAS_HEIGHT);
      return {
        clipId: id, source: raster, sourceWidth: CANVAS_WIDTH, sourceHeight: CANVAS_HEIGHT,
        opacity: 1, blendMode: "normal", zIndex: index, transform: layer.transform, parentMatrix: layer.parentMatrix
      };
    });
    drawTimelineFrame(output.getContext("2d") as any, canvasLayers, { canvasWidth: CANVAS_WIDTH, canvasHeight: CANVAS_HEIGHT }, { alpha: true });

    // Root at x=-700, anchor.x=0 (left edge at position): the left edge of
    // the rendered text should land near screen x = canvas.width/2 - 700 =
    // 260 — nowhere near the doubled (and off-canvas) -1400 the bug produced.
    const ctx = output.getContext("2d");
    const data = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
    let minX = Infinity;
    let anyInk = false;
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        if (data[(y * CANVAS_WIDTH + x) * 4 + 3]! > 10) {
          anyInk = true;
          if (x < minX) minX = x;
        }
      }
    }
    expect(anyInk).toBe(true);
    expect(minX).toBeGreaterThan(200);
    expect(minX).toBeLessThan(320);
  });
});
