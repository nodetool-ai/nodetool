/**
 * Caption styling on the Canvas 2D path (T15).
 *
 * The load-bearing test is the first one: T15 made a hard-coded look
 * authorable, so a caption carrying no style of its own must draw the frame it
 * drew before. `drawCaptionBeforeT15` below is the drawing exactly as it stood,
 * inlined so the comparison is against the old arithmetic rather than against a
 * golden PNG whose bytes depend on whichever font the host resolved.
 *
 * `packages/timeline/tests/render.captionStyle.test.ts` pins the cache key.
 */

import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import type { CaptionStyle } from "@nodetool-ai/timeline";
import {
  drawCaption,
  type RasterContext2D,
  type ResolvedCaption
} from "@nodetool-ai/timeline/scene";

const W = 640;
const H = 360;

const CAPTION: ResolvedCaption = {
  words: [
    { text: "the", active: false },
    { text: "quick", active: true },
    { text: "brown", active: false },
    { text: "fox", active: false }
  ]
};

type Rgba = [number, number, number, number];

/** The whole surface as RGBA bytes, plus the reads the assertions want. */
function raster(caption: ResolvedCaption): {
  bytes: Uint8ClampedArray;
  at(index: number): Rgba;
} {
  const canvas = createCanvas(W, H);
  // SAFETY: `RasterContext2D` is the subset of the 2D canvas API `drawCaption`
  // uses; the presence test in timeline-shape-frames.test.ts asserts a skia
  // context provides all of it.
  drawCaption(
    canvas.getContext("2d") as unknown as RasterContext2D,
    caption,
    W,
    H
  );
  const bytes = canvas.getContext("2d").getImageData(0, 0, W, H).data;
  return {
    bytes,
    at: (index) => [
      bytes[index]!,
      bytes[index + 1]!,
      bytes[index + 2]!,
      bytes[index + 3]!
    ]
  };
}

/**
 * `drawCaption` as it stood before `caption.style` existed, byte for byte: the
 * `#FFD60A` highlight, the `rgba(0,0,0,0.85)` outline at 12% of the font size,
 * the 5%-of-height font and the 12% bottom margin.
 */
function drawCaptionBeforeT15(
  ctx: RasterContext2D,
  caption: ResolvedCaption,
  width: number,
  height: number
): void {
  const fontSize = Math.max(24, Math.round(height * 0.05));
  ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";

  const spaceWidth = ctx.measureText(" ").width;
  const maxWidth = width * 0.9;

  const measured = caption.words.map((w) => ({
    text: w.text,
    active: w.active,
    width: ctx.measureText(w.text).width
  }));

  const lines: (typeof measured)[] = [];
  let current: typeof measured = [];
  let currentWidth = 0;
  for (const word of measured) {
    const advance = (current.length > 0 ? spaceWidth : 0) + word.width;
    if (current.length > 0 && currentWidth + advance > maxWidth) {
      lines.push(current);
      current = [word];
      currentWidth = word.width;
    } else {
      current.push(word);
      currentWidth += advance;
    }
  }
  if (current.length > 0) lines.push(current);

  const lineHeight = fontSize * 1.25;
  const totalHeight = lines.length * lineHeight;
  const bottomMargin = height * 0.12;
  let y = height - bottomMargin - totalHeight + fontSize;

  ctx.lineWidth = Math.max(2, fontSize * 0.12);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";

  for (const line of lines) {
    const lineWidth = line.reduce(
      (sum, w, i) => sum + w.width + (i > 0 ? spaceWidth : 0),
      0
    );
    let x = (width - lineWidth) / 2;
    for (let i = 0; i < line.length; i++) {
      const word = line[i]!;
      if (i > 0) x += spaceWidth;
      ctx.fillStyle = word.active ? "#FFD60A" : "#FFFFFF";
      ctx.strokeText(word.text, x, y);
      ctx.fillText(word.text, x, y);
      x += word.width;
    }
    y += lineHeight;
  }
}

function rasterBefore(caption: ResolvedCaption): Uint8ClampedArray {
  const canvas = createCanvas(W, H);
  drawCaptionBeforeT15(
    canvas.getContext("2d") as unknown as RasterContext2D,
    caption,
    W,
    H
  );
  return canvas.getContext("2d").getImageData(0, 0, W, H).data;
}

/** Pixels where the two surfaces disagree. */
function differingPixels(a: Uint8ClampedArray, b: Uint8ClampedArray): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; i += 4) {
    if (
      a[i] !== b[i] ||
      a[i + 1] !== b[i + 1] ||
      a[i + 2] !== b[i + 2] ||
      a[i + 3] !== b[i + 3]
    ) {
      out.push(i);
    }
  }
  return out;
}

function countPixels(
  bytes: Uint8ClampedArray,
  keep: (rgba: Rgba) => boolean
): number {
  let n = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    if (keep([bytes[i]!, bytes[i + 1]!, bytes[i + 2]!, bytes[i + 3]!])) n += 1;
  }
  return n;
}

/** On the `#FFD60A` ramp: red leads, blue trails, and there is ink here. */
const isActiveInk = ([r, g, b, a]: Rgba): boolean =>
  a > 8 && r > b && r >= g && g > b;

/** On the `#00FF00` ramp. */
const isGreenInk = ([r, g, b, a]: Rgba): boolean => a > 8 && g > r && g > b;

describe("drawCaption — the default look", () => {
  it("draws the frame it drew before the style existed", () => {
    const before = rasterBefore(CAPTION);
    const after = raster(CAPTION).bytes;
    expect(differingPixels(before, after)).toEqual([]);
    // A surface both drew nothing on would pass the comparison above.
    expect(countPixels(after, ([, , , a]) => a > 8)).toBeGreaterThan(200);
  });

  it("draws the same frame for an empty style object", () => {
    const before = rasterBefore(CAPTION);
    const after = raster({ ...CAPTION, style: {} }).bytes;
    expect(differingPixels(before, after)).toEqual([]);
  });
});

describe("drawCaption — style", () => {
  it("recolours only the active word", () => {
    const plain = raster(CAPTION);
    const styled = raster({ ...CAPTION, style: { activeColor: "#00FF00" } });

    const changed = differingPixels(plain.bytes, styled.bytes);
    expect(changed.length).toBeGreaterThan(0);
    // Every pixel that moved carried the highlight; the other three words and
    // the outline they share are byte-identical.
    for (const index of changed) {
      expect(isActiveInk(plain.at(index)), `pixel ${index}`).toBe(true);
    }
    expect(countPixels(plain.bytes, isActiveInk)).toBeGreaterThan(20);
    expect(countPixels(styled.bytes, isGreenInk)).toBeGreaterThan(20);
  });

  it("recolours the inactive words without touching the active one", () => {
    const plain = raster(CAPTION);
    const styled = raster({ ...CAPTION, style: { color: "#FF00FF" } });
    for (const index of differingPixels(plain.bytes, styled.bytes)) {
      expect(isActiveInk(plain.at(index)), `pixel ${index}`).toBe(false);
    }
  });

  it("sizes the type from fontSizeFrac", () => {
    const ink = (style?: CaptionStyle): number =>
      countPixels(raster({ ...CAPTION, style }).bytes, ([, , , a]) => a > 8);
    expect(ink({ fontSizeFrac: 0.1 })).toBeGreaterThan(ink());
    // 5% of 360 is 18px, under the 24px floor a caption never drops below, so
    // asking for less than the floor draws the floor.
    expect(ink({ fontSizeFrac: 0.01 })).toBe(ink());
  });

  it("lifts the block off the bottom by bottomMarginFrac", () => {
    const lowest = (style?: CaptionStyle): number => {
      const { bytes } = raster({ ...CAPTION, style });
      for (let y = H - 1; y >= 0; y--) {
        for (let x = 0; x < W; x++) {
          if (bytes[(y * W + x) * 4 + 3]! > 8) return y;
        }
      }
      return -1;
    };
    expect(lowest({ bottomMarginFrac: 0.4 })).toBeLessThan(lowest() - 50);
  });

  it("drops the outline when the width is zero", () => {
    const outlined = raster(CAPTION).bytes;
    const bare = raster({
      ...CAPTION,
      style: { outline: { color: "#000000", widthPx: 0 } }
    }).bytes;
    // The outline is the dark ink under the glyphs; without it the drawing is
    // the fills alone, so it covers strictly fewer pixels.
    const inked = (bytes: Uint8ClampedArray): number =>
      countPixels(bytes, ([, , , a]) => a > 8);
    expect(inked(bare)).toBeLessThan(inked(outlined));
    expect(countPixels(bare, ([r, g, b, a]) => a > 200 && r + g + b < 90)).toBe(
      0
    );
  });

  it("draws a scrim behind the block", () => {
    const plain = raster(CAPTION).bytes;
    const scrimmed = raster({
      ...CAPTION,
      style: { background: { color: "#FF0000", paddingPx: 20, radiusPx: 8 } }
    }).bytes;
    const red = ([r, g, b, a]: Rgba): boolean =>
      a > 200 && r > 200 && g < 60 && b < 60;
    expect(countPixels(plain, red)).toBe(0);
    expect(countPixels(scrimmed, red)).toBeGreaterThan(1000);
    // The scrim sits behind: the highlighted word still reads through it.
    expect(countPixels(scrimmed, isActiveInk)).toBeGreaterThan(20);
  });

  it("takes the font family the style names", () => {
    // Read back off the context rather than out of the pixels: a family this
    // host has no face for falls back to the same glyphs, which would make a
    // pixel comparison report a missing font as a missing feature.
    const fontFor = (style?: CaptionStyle): string => {
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext("2d");
      drawCaption(
        ctx as unknown as RasterContext2D,
        { ...CAPTION, style },
        W,
        H
      );
      return ctx.font;
    };
    // 5% of 360 is 18, under the 24px floor.
    expect(fontFor()).toBe("700 24px Inter, Arial, sans-serif");
    expect(fontFor({ fontFamily: "Georgia" })).toBe("700 24px Georgia");
    expect(fontFor({ fontSizeFrac: 0.2 })).toBe(
      "700 72px Inter, Arial, sans-serif"
    );
  });
});
