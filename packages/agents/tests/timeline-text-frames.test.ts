/**
 * Text styling on the Canvas 2D path (F4's styling half, T14): slant, letter
 * spacing, line height, vertical alignment, outline, shadow, scrim and
 * gradient fill.
 *
 * `packages/timeline/tests/render.textStyle.test.ts` pins what the layout and
 * the cache key decide. This reads the pixels `@napi-rs/canvas` actually
 * produced, because a style that lays out correctly and then draws nothing — a
 * shadow set after the glyph, a scrim behind an empty box, a gradient assigned
 * to the wrong property — is exactly the failure a pure test cannot see.
 */

import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { compileClipAnimations, type ClipTextStyle } from "@nodetool-ai/timeline";
import {
  drawStaggeredText,
  drawText,
  createStaggerScratch,
  type RasterContext2D
} from "@nodetool-ai/timeline/scene";
import { registerBundledFonts } from "@nodetool-ai/timeline/fonts/node";

// Draw in the face NodeTool ships, the way every production rasterizer does
// (`timeline-preview/rasterize.ts`, `video-nodes/.../rasterizers.ts`). Without
// this the styles below are set in `Inter` and drawn in whatever the machine
// falls back to, so every pixel assertion here measures a font the product
// never uses — and the metrics differ per platform. Skia caches the first
// resolution of a family, so this has to run before the first draw.
registerBundledFonts();

const W = 400;
const H = 300;

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface Pixels {
  at(x: number, y: number): [number, number, number, number];
  on(x: number, y: number): boolean;
  /** Bounds of every pixel `keep` accepts, or null when it accepts none. */
  bounds(keep: (rgba: [number, number, number, number]) => boolean): Bounds | null;
}

function readPixels(data: Uint8ClampedArray, width: number, height: number): Pixels {
  const at = (x: number, y: number): [number, number, number, number] => {
    const i = (Math.round(y) * width + Math.round(x)) * 4;
    return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
  };
  return {
    at,
    on: (x, y) => at(x, y)[3] > 24,
    bounds(keep) {
      let left = width;
      let right = -1;
      let top = height;
      let bottom = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!keep(at(x, y))) continue;
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
      if (right < 0) return null;
      return {
        left,
        right,
        top,
        bottom,
        width: right - left + 1,
        height: bottom - top + 1,
        centerX: (left + right) / 2,
        centerY: (top + bottom) / 2
      };
    }
  };
}

/** Draw one style on a fresh surface and hand back its pixels. */
function raster(style: ClipTextStyle, width = W, height = H): Pixels {
  const canvas = createCanvas(width, height);
  // SAFETY: `RasterContext2D` is the subset of the 2D canvas API `drawText`
  // uses; the presence test in timeline-shape-frames.test.ts asserts a skia
  // context provides all of it.
  drawText(
    canvas.getContext("2d") as unknown as RasterContext2D,
    style,
    width,
    height
  );
  return readPixels(
    canvas.getContext("2d").getImageData(0, 0, width, height).data,
    width,
    height
  );
}

const INK = (rgba: [number, number, number, number]): boolean => rgba[3] > 24;
/** Only the pixels that are mostly red — a scrim or a shadow drawn in red. */
const RED = (rgba: [number, number, number, number]): boolean =>
  rgba[3] > 24 && rgba[0] > 180 && rgba[1] < 80 && rgba[2] < 80;

function title(over: Partial<ClipTextStyle> = {}): ClipTextStyle {
  return { text: "HELLO", fontSizePx: 60, color: "#ffffff", ...over };
}

function inkBounds(style: ClipTextStyle): Bounds {
  const found = raster(style).bounds(INK);
  if (!found) throw new Error("nothing was drawn");
  return found;
}

describe("drawText — outline", () => {
  it("grows the silhouette by the stroke width, half on each side", () => {
    const plain = inkBounds(title());
    const stroked = inkBounds(
      title({ stroke: { color: "#ffffff", widthPx: 12 } })
    );
    // A canvas centres a stroke on the glyph outline, so a 12px pen reaches
    // 6px past the fill on each side — 12px wider and 12px taller overall.
    expect(stroked.width - plain.width).toBeGreaterThanOrEqual(10);
    expect(stroked.width - plain.width).toBeLessThanOrEqual(14);
    expect(stroked.height - plain.height).toBeGreaterThanOrEqual(10);
    expect(stroked.height - plain.height).toBeLessThanOrEqual(14);
  });

  it("scales with the width it is given", () => {
    const thin = inkBounds(title({ stroke: { color: "#fff", widthPx: 4 } }));
    const thick = inkBounds(title({ stroke: { color: "#fff", widthPx: 20 } }));
    expect(thick.width - thin.width).toBeGreaterThanOrEqual(14);
  });

  it("draws the outline under the fill, not over it", () => {
    // A red pen under a white fill leaves the glyph's interior white.
    const pixels = raster(
      title({ stroke: { color: "#ff0000", widthPx: 10 } })
    );
    const white = pixels.bounds(
      (rgba) => rgba[3] > 24 && rgba[0] > 200 && rgba[1] > 200 && rgba[2] > 200
    );
    expect(white).not.toBeNull();
    const red = pixels.bounds(RED);
    expect(red).not.toBeNull();
    // The pen's silhouette contains the fill's.
    expect(red!.left).toBeLessThan(white!.left);
    expect(red!.right).toBeGreaterThan(white!.right);
  });

  it("ignores a stroke with no width", () => {
    expect(inkBounds(title({ stroke: { color: "#f00", widthPx: 0 } }))).toEqual(
      inkBounds(title())
    );
  });
});

describe("drawText — shadow", () => {
  it("casts the glyphs at the offset it is given", () => {
    const plain = inkBounds(title());
    const shadowed = raster(
      title({
        shadow: { color: "#ff0000", blurPx: 0, offsetX: 24, offsetY: 18 }
      })
    );
    const cast = shadowed.bounds(RED);
    expect(cast).not.toBeNull();
    // A hard shadow is the same silhouette, moved.
    expect(cast!.left - plain.left).toBeCloseTo(24, -0.5);
    expect(cast!.top - plain.top).toBeCloseTo(18, -0.5);
  });

  it("spreads past the silhouette when it is blurred", () => {
    const hard = raster(
      title({ shadow: { color: "#ff0000", blurPx: 0, offsetX: 0, offsetY: 0 } })
    ).bounds(INK)!;
    const soft = raster(
      title({ shadow: { color: "#ff0000", blurPx: 20, offsetX: 0, offsetY: 0 } })
    ).bounds(INK)!;
    expect(soft.width).toBeGreaterThan(hard.width);
    expect(soft.height).toBeGreaterThan(hard.height);
  });

  it("casts one shadow, from the outline, when the title is stroked", () => {
    // The pen is the outer edge; a second cast from the fill would darken the
    // silhouette twice and read as a heavier shadow than was asked for.
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d") as unknown as RasterContext2D;
    drawText(
      ctx,
      title({
        color: "#ffffff",
        stroke: { color: "#ffffff", widthPx: 8 },
        shadow: { color: "#7f0000", blurPx: 0, offsetX: 40, offsetY: 0 }
      }),
      W,
      H
    );
    const pixels = readPixels(
      canvas.getContext("2d").getImageData(0, 0, W, H).data,
      W,
      H
    );
    // Clear of the glyphs, the cast is exactly the colour asked for — a second
    // opaque pass over the same pixels would still read 0x7f, so probe the
    // channel that stacking would raise instead.
    const cast = pixels.bounds(
      (rgba) => rgba[3] > 200 && rgba[0] > 100 && rgba[0] < 160 && rgba[1] < 40
    );
    expect(cast).not.toBeNull();
    expect(pixels.at(cast!.right - 2, cast!.centerY)[0]).toBeLessThan(160);
  });
});

describe("drawText — background", () => {
  const scrim = (paddingPx: number, radiusPx?: number): Bounds => {
    const found = raster(
      title({ background: { color: "#ff0000", paddingPx, radiusPx } })
    ).bounds(RED);
    if (!found) throw new Error("no scrim was drawn");
    return found;
  };

  it("sits behind the wrapped block, one line height tall plus padding", () => {
    // 60px text at the default 1.2 line height is a 72px box; 20px of padding
    // on each side makes 112.
    expect(scrim(20).height).toBeCloseTo(112, -0.5);
    expect(scrim(20).centerX).toBeCloseTo(W / 2, -0.5);
    expect(scrim(20).centerY).toBeCloseTo(H / 2, -0.5);
  });

  it("grows by twice the padding in each direction", () => {
    const small = scrim(10);
    const large = scrim(30);
    expect(large.width - small.width).toBeCloseTo(40, -0.5);
    expect(large.height - small.height).toBeCloseTo(40, -0.5);
  });

  it("is wider than the text it sits behind", () => {
    const text = inkBounds(title());
    const box = scrim(20);
    expect(box.left).toBeLessThan(text.left);
    expect(box.right).toBeGreaterThan(text.right);
    expect(box.top).toBeLessThan(text.top);
    expect(box.bottom).toBeGreaterThan(text.bottom);
  });

  it("rounds its corners when a radius is set", () => {
    const square = scrim(20);
    const rounded = scrim(20, 40);
    // Same box, but the corner pixel is gone.
    expect(rounded.width).toBeCloseTo(square.width, -0.5);
    const pixels = raster(
      title({ background: { color: "#ff0000", paddingPx: 20, radiusPx: 40 } })
    );
    expect(pixels.on(square.left + 1, square.top + 1)).toBe(false);
    expect(pixels.on(square.left + 1, square.centerY)).toBe(true);
  });

  it("draws no scrim behind an empty title", () => {
    // The block collapses to a point, so a full-frame red wash would be the
    // bug here rather than a missing box.
    const pixels = raster(
      title({ text: "", background: { color: "#ff0000", paddingPx: 20 } })
    );
    expect(pixels.on(W / 2, H / 2)).toBe(false);
  });
});

describe("drawText — vertical alignment", () => {
  it("sits the block against the top edge", () => {
    const top = inkBounds(title({ verticalAlign: "top" }));
    expect(top.centerY).toBeLessThan(H / 4);
    expect(top.top).toBeGreaterThanOrEqual(0);
  });

  it("centres it by default and drops it to the bottom on request", () => {
    expect(inkBounds(title()).centerY).toBeCloseTo(H / 2, -1);
    expect(inkBounds(title({ verticalAlign: "middle" })).centerY).toBeCloseTo(
      H / 2,
      -1
    );
    expect(
      inkBounds(title({ verticalAlign: "bottom" })).centerY
    ).toBeGreaterThan((H * 3) / 4);
  });

  it("keeps the block's own height, whichever edge it is against", () => {
    const heights = ["top", "middle", "bottom"].map(
      (verticalAlign) => inkBounds(title({ verticalAlign })).height
    );
    expect(heights[1]).toBe(heights[0]);
    expect(heights[2]).toBe(heights[0]);
  });

  it("reads an unknown alignment as the default", () => {
    expect(inkBounds(title({ verticalAlign: "sideways" })).centerY).toBe(
      inkBounds(title()).centerY
    );
  });
});

describe("drawText — spacing and line height", () => {
  it("pushes the glyphs apart by the letter spacing", () => {
    const plain = inkBounds(title());
    const spaced = inkBounds(title({ letterSpacingPx: 12 }));
    // Five glyphs: four gaps of ink between the first and the last.
    expect(spaced.width - plain.width).toBeCloseTo(48, -0.7);
  });

  it("stacks wrapped lines by the line height", () => {
    const twoLines = title({ text: "ONE\nTWO" });
    const tight = inkBounds({ ...twoLines, lineHeight: 1 });
    const loose = inkBounds({ ...twoLines, lineHeight: 2 });
    expect(loose.height - tight.height).toBeCloseTo(60, -0.7);
  });

  it("slants the glyphs when the style asks for italic", () => {
    const upright = raster(title({ fontFamily: "Arial" }));
    const italic = raster(title({ fontFamily: "Arial", fontStyle: "italic" }));
    const differs = (): boolean => {
      for (let y = 0; y < H; y += 3) {
        for (let x = 0; x < W; x += 3) {
          if (upright.on(x, y) !== italic.on(x, y)) return true;
        }
      }
      return false;
    };
    expect(differs()).toBe(true);
  });
});

describe("drawText — gradient fill", () => {
  const gradient = title({
    text: "AB",
    fontSizePx: 90,
    fill: {
      type: "linear",
      angle: 0,
      stops: [
        { offset: 0, color: "#ff0000" },
        { offset: 1, color: "#0000ff" }
      ]
    }
  });

  it("spans the text block rather than the raster", () => {
    const pixels = raster(gradient);
    const box = pixels.bounds(INK)!;
    const sample = (x: number): [number, number, number, number] => {
      for (let y = box.top; y <= box.bottom; y++) {
        const rgba = pixels.at(x, y);
        if (rgba[3] > 200) return rgba;
      }
      throw new Error(`no opaque ink in column ${x}`);
    };
    // The block is ~150px wide on a 400px raster. Measured against the raster
    // the whole word would sit in the middle of the ramp and read purple;
    // measured against the block it runs end to end.
    const left = sample(box.left + 3);
    const right = sample(box.right - 3);
    expect(left[0]).toBeGreaterThan(200);
    expect(left[2]).toBeLessThan(60);
    expect(right[2]).toBeGreaterThan(200);
    expect(right[0]).toBeLessThan(60);
  });

  it("wins over the plain colour", () => {
    const pixels = raster({
      ...gradient,
      color: "#00ff00",
      fill: { type: "solid", color: "#ff0000" }
    });
    const box = pixels.bounds(INK)!;
    expect(pixels.bounds(RED)).not.toBeNull();
    expect(
      pixels.bounds(
        (rgba) => rgba[3] > 200 && rgba[1] > 200 && rgba[0] < 60
      )
    ).toBeNull();
    expect(box.width).toBeGreaterThan(0);
  });
});

describe("drawStaggeredText — the same style", () => {
  /** Every unit fully in, so the frame is the finished title. */
  function staggered(style: ClipTextStyle): Pixels {
    const compiled = compileClipAnimations(
      [
        {
          id: "a1",
          role: "in",
          preset: "fade",
          durationMs: 200,
          easing: "linear",
          stagger: { unit: "character", offsetMs: 20 }
        }
      ],
      5000,
      { width: W, height: H },
      { staggerCount: 5, staggerUnit: "character" }
    );
    const canvas = createCanvas(W, H);
    drawStaggeredText(
      canvas.getContext("2d") as unknown as RasterContext2D,
      style,
      W,
      H,
      { compiled, localMs: 2000 },
      createStaggerScratch()
    );
    return readPixels(
      canvas.getContext("2d").getImageData(0, 0, W, H).data,
      W,
      H
    );
  }

  it("draws the scrim once behind the block, not once per glyph", () => {
    const style = title({
      background: { color: "#ff0000", paddingPx: 20 }
    });
    const box = staggered(style).bounds(RED);
    const plain = raster(style).bounds(RED)!;
    expect(box).not.toBeNull();
    expect(box!.width).toBeCloseTo(plain.width, -1);
    expect(box!.height).toBeCloseTo(plain.height, -0.5);
  });

  it("outlines and shadows every unit the way the plain draw does", () => {
    const pixels = staggered(
      title({
        stroke: { color: "#ffffff", widthPx: 12 },
        shadow: { color: "#ff0000", blurPx: 0, offsetX: 24, offsetY: 18 }
      })
    );
    const cast = pixels.bounds(RED);
    expect(cast).not.toBeNull();
    const glyphs = raster(title({ stroke: { color: "#ffffff", widthPx: 12 } }));
    expect(cast!.left - glyphs.bounds(INK)!.left).toBeCloseTo(24, -1);
  });

  it("runs one gradient across the block, not one per glyph", () => {
    const pixels = staggered(
      title({
        text: "AB",
        fontSizePx: 90,
        fill: {
          type: "linear",
          angle: 0,
          stops: [
            { offset: 0, color: "#ff0000" },
            { offset: 1, color: "#0000ff" }
          ]
        }
      })
    );
    const box = pixels.bounds(INK)!;
    const sample = (x: number): [number, number, number, number] => {
      for (let y = box.top; y <= box.bottom; y++) {
        const rgba = pixels.at(x, y);
        if (rgba[3] > 200) return rgba;
      }
      throw new Error(`no opaque ink in column ${x}`);
    };
    // Per-glyph gradients would restart, so the second glyph's left edge would
    // be red again instead of continuing towards blue.
    expect(sample(box.left + 3)[0]).toBeGreaterThan(200);
    expect(sample(box.right - 3)[2]).toBeGreaterThan(200);
  });
});
