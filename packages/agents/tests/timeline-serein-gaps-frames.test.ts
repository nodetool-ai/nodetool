import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { timelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type { TimelineSequence } from "@nodetool-ai/timeline";

import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

const fixturePath = new URL("../../../demo/benchmarks/serein/timeline-gap-repro.json", import.meta.url);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const document = timelineDocument.parse(fixture.document);
const sequence: TimelineSequence = {
  id: fixture.id,
  projectId: "serein-gap-test",
  name: fixture.name,
  fps: fixture.fps,
  width: fixture.width,
  height: fixture.height,
  durationMs: fixture.durationMs,
  tracks: document.tracks,
  clips: document.clips,
  markers: document.markers,
  camera2d: document.camera2d,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const WIDTH = 480;
const HEIGHT = 270;
const noAssets = async (): Promise<null> => null;

async function preview(timesMs: number[], clips = sequence.clips, camera2d = sequence.camera2d) {
  return renderTimelineFrames({
    sequence: { ...sequence, clips, camera2d },
    timesMs,
    width: WIDTH,
    loadAsset: noAssets
  });
}

async function pixels(png: Uint8Array): Promise<Uint8ClampedArray> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
}

function rgba(data: Uint8ClampedArray, x: number, y: number): [number, number, number, number] {
  const index = (y * WIDTH + x) * 4;
  return [data[index]!, data[index + 1]!, data[index + 2]!, data[index + 3]!];
}

function countWhere(
  data: Uint8ClampedArray,
  box: { x0: number; x1: number; y0: number; y1: number },
  predicate: (pixel: [number, number, number, number]) => boolean
): number {
  let count = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      if (predicate(rgba(data, x, y))) count++;
    }
  }
  return count;
}

function changedPixels(a: Uint8ClampedArray, b: Uint8ClampedArray, threshold = 8): number {
  let count = 0;
  for (let index = 0; index < a.length; index += 4) {
    if (Math.abs(a[index]! - b[index]!) > threshold ||
        Math.abs(a[index + 1]! - b[index + 1]!) > threshold ||
        Math.abs(a[index + 2]! - b[index + 2]!) > threshold) count++;
  }
  return count;
}

function bottomOfCard(data: Uint8ClampedArray, x: number): number {
  for (let y = HEIGHT - 1; y >= 0; y--) {
    const [r, g, b] = rgba(data, x, y);
    if (r > 20 && r < 70 && g > 35 && g < 90 && b > 50 && b < 120) return y;
  }
  return -1;
}

describe("Serein timeline gap fixture", () => {
  it("renders the ticker with an explicit thousands separator", async () => {
    const { frames } = await preview([5999]);
    expect(frames[0]!.layers.find((layer) => layer.clip_id === "grouped-ticker")?.text).toMatch(/^2,\d{3}$/);
    expect(frames[0]!.degraded).toEqual([]);
  });

  it("changes generator pixels as the effect color animates", async () => {
    const { frames } = await preview([6200, 7100]);
    const [start, end] = await Promise.all(frames.map((frame) => pixels(frame.png)));
    let changed = 0;
    for (let index = 0; index < start.length; index += 4) {
      if (Math.abs(start[index + 1]! - end[index + 1]!) > 8) changed++;
    }
    expect(changed).toBeGreaterThan(1000);
    expect(frames.map((frame) => frame.degraded)).toEqual([[], []]);
  });

  it("shrinks the card from 700px to 300px without shrinking its corners or child text", async () => {
    expect(sequence.clips.find((clip) => clip.id === "summary-title")?.parentId).toBe("summary-group");
    expect(sequence.clips.find((clip) => clip.id === "summary-card")?.parentId).toBe("summary-group");
    const { frames } = await preview([100, 400, 1100]);
    const [before, moving, after] = await Promise.all(frames.map((frame) => pixels(frame.png)));

    expect(rgba(before, 180, 190)[0]).toBeGreaterThan(20);
    expect(rgba(after, 180, 190)[0]).toBeLessThan(10);
    expect(rgba(after, 180, 100)[0]).toBeGreaterThan(20);
    const firstBottom = bottomOfCard(before, 180);
    const middleBottom = bottomOfCard(moving, 180);
    const lastBottom = bottomOfCard(after, 180);
    expect(firstBottom).toBeGreaterThan(215);
    expect(lastBottom).toBeGreaterThan(110);
    expect(lastBottom).toBeLessThan(130);
    expect(middleBottom).toBeGreaterThan(lastBottom + 5);
    expect(middleBottom).toBeLessThan(firstBottom - 5);

    const titleBox = { x0: 90, x1: 390, y0: 60, y1: 115 };
    const white = ([r, g, b]: [number, number, number, number]) => r > 180 && g > 180 && b > 180;
    const titleBefore = countWhere(before, titleBox, white);
    const titleAfter = countWhere(after, titleBox, white);
    expect(titleBefore).toBeGreaterThan(100);
    expect(titleAfter).toBe(titleBefore);

    // At both sizes the top-left corner remains rounded, with a filled interior.
    expect(rgba(before, 128, 49)[0]).toBeLessThan(10);
    expect(rgba(after, 128, 49)[0]).toBeLessThan(10);
    expect(rgba(before, 145, 65)[0]).toBeGreaterThan(20);
    expect(rgba(after, 145, 65)[0]).toBeGreaterThan(20);
    expect(frames.map((frame) => frame.degraded)).toEqual([[], [], []]);
  });

  it("applies RGB split to the already composited full frame through an adjustment", async () => {
    const treated = await preview([1700]);
    const untreated = await preview([1700], sequence.clips.filter((clip) => clip.id !== "full-frame-rgb-split"));
    const a = await pixels(treated.frames[0]!.png);
    const b = await pixels(untreated.frames[0]!.png);
    const edge = { x0: 108, x1: 135, y0: 95, y1: 175 };
    const fringed = countWhere(a, edge, ([r, , blue]) => Math.abs(r - blue) > 30);
    const plainFringes = countWhere(b, edge, ([r, , blue]) => Math.abs(r - blue) > 30);
    expect(fringed).toBeGreaterThan(30);
    expect(plainFringes).toBe(0);
    expect(treated.effectsNotApplied).toEqual([]);
    expect(treated.frames[0]!.degraded).toEqual([]);
  });

  it("crossfades two fitText chips and sizes each pill to its own text", async () => {
    const { frames } = await preview([2600, 3000, 3450]);
    const mid = frames[1]!;
    const outgoing = mid.layers.find((layer) => layer.clip_id === "chip-out-text");
    const incoming = mid.layers.find((layer) => layer.clip_id === "chip-in-text");
    expect(outgoing?.transition).toMatchObject({ type: "crossfade", role: "out", progress: 0.333 });
    expect(incoming?.opacity).toBeGreaterThan(0);
    expect(incoming?.opacity).toBeLessThan(1);
    expect(incoming?.transition).toMatchObject({ type: "crossfade", role: "in", progress: 0.333 });

    const first = await pixels(frames[0]!.png);
    const last = await pixels(frames[2]!.png);
    const darkChip = ([r, g, b]: [number, number, number, number]) => r > 20 && r < 80 && g > 30 && g < 95 && b > 45 && b < 120;
    const area = { x0: 100, x1: 380, y0: 105, y1: 165 };
    expect(countWhere(first, area, darkChip)).toBeGreaterThan(150);
    expect(countWhere(last, area, darkChip)).toBeGreaterThan(countWhere(first, area, darkChip));
    expect(frames.map((frame) => frame.degraded)).toEqual([[], [], []]);
  });

  it("draws the separately authored zero with a gradient after the white zero", async () => {
    const { frames } = await preview([4100, 4500]);
    const white = await pixels(frames[0]!.png);
    const dusk = await pixels(frames[1]!.png);
    const ink = ([r, g, b]: [number, number, number, number]) => r > 80 && g > 80 && b > 80;
    const colorful = ([r, g, b]: [number, number, number, number]) =>
      r > 80 && g > 80 && b > 80 && Math.max(r, g, b) - Math.min(r, g, b) > 35;
    const area = { x0: 140, x1: 340, y0: 70, y1: 205 };
    expect(countWhere(white, area, ink)).toBeGreaterThan(300);
    expect(countWhere(white, area, colorful)).toBe(0);
    expect(countWhere(dusk, area, colorful)).toBeGreaterThan(300);
    expect(frames.map((frame) => frame.degraded)).toEqual([[], []]);
  });

  it("renders the tilted wall with camera scale and near-layer depth blur", async () => {
    const camera = sequence.camera2d;
    expect(camera).toBeDefined();
    const [full, sharp, still] = await Promise.all([
      preview([7200, 7600]),
      preview([7200], sequence.clips, { ...camera!, aperturePx: 0 }),
      preview([7600], sequence.clips, { ...camera!, depthPx: 0, keyframes: [] })
    ]);
    const [start, moved, noBlur, noCameraPush] = await Promise.all([
      pixels(full.frames[0]!.png), pixels(full.frames[1]!.png),
      pixels(sharp.frames[0]!.png), pixels(still.frames[0]!.png)
    ]);
    const peach = ([r, g, b]: [number, number, number, number]) => r > 100 && g > 60 && b > 40 && r > b;
    const violet = ([r, g, b]: [number, number, number, number]) => r > 70 && b > 70 && b > g;
    expect(countWhere(start, { x0: 0, x1: 180, y0: 60, y1: 130 }, peach)).toBeGreaterThan(100);
    expect(countWhere(start, { x0: 300, x1: 470, y0: 0, y1: 60 }, violet)).toBeGreaterThan(100);
    expect(changedPixels(start, noBlur, 1)).toBeGreaterThan(100);
    expect(changedPixels(moved, noCameraPush)).toBeGreaterThan(100);
    expect(full.frames.map((frame) => frame.degraded)).toEqual([[], []]);
  });

  it("flies three in-bounds cards and exposes off-surface source clipping", async () => {
    const { frames } = await preview([8500, 9300]);
    expect(frames[0]!.layers.map((layer) => layer.clip_id)).toContain("flight-left");
    const [flight, sourceControl] = await Promise.all(frames.map((frame) => pixels(frame.png)));
    const fullFrame = { x0: 0, x1: WIDTH, y0: 0, y1: HEIGHT };
    const green = ([r, g, b]: [number, number, number, number]) => g > 120 && g > r + 30 && b > r + 20;
    const lavender = ([r, g, b]: [number, number, number, number]) => r > 100 && b > 130 && b > g + 20;
    const peach = ([r, g, b]: [number, number, number, number]) => r > 150 && r > g + 20 && g > b + 20;
    const blue = ([r, , b]: [number, number, number, number]) => b > 150 && b > r + 100;
    expect(countWhere(flight, fullFrame, green)).toBeGreaterThan(100);
    expect(countWhere(flight, fullFrame, lavender)).toBeGreaterThan(100);
    expect(countWhere(flight, fullFrame, peach)).toBeGreaterThan(100);
    expect(countWhere(sourceControl, fullFrame, green)).toBeGreaterThan(100);
    expect(countWhere(sourceControl, fullFrame, blue)).toBe(0);
    expect(frames.map((frame) => frame.degraded)).toEqual([[], []]);
  });
});
