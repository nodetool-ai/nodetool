/**
 * Character and line stagger: the unit count the compiler times against and
 * the unit list the rasterizer walks have to be the same number, or the last
 * units of a title animate at the wrong moment. These tests drive both sides
 * from one fake 2D context so a divergence shows up as a failing count rather
 * than as a frame nobody looks at.
 */

import { describe, expect, it } from "vitest";
import { compileClipAnimations } from "../src/animation/compile.js";
import type { ClipAnimation } from "../src/animation/types.js";
import type { ClipTextStyle } from "../src/types.js";
import {
  drawStaggeredText,
  drawText,
  createStaggerScratch,
  measureTextWith,
  type RasterContext2D
} from "../src/render/draw.js";
import {
  countTextStaggerUnits,
  layoutStaggerUnits,
  segmentGraphemes
} from "../src/render/textLayout.js";
import { clipStaggerCount } from "../src/render/sceneModel.js";
import type { TimelineClip } from "../src/types.js";

/** Width of one code unit in the fake font, so wraps are arithmetic. */
const GLYPH_PX = 10;

interface DrawnUnit {
  text: string;
  x: number;
  y: number;
  alpha: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

/**
 * A recording `RasterContext2D` with a fixed-advance font: `measureText` is
 * length × {@link GLYPH_PX}, and every `fillText` is captured with the
 * transform in force. Enough to assert what a draw put where without a canvas.
 */
class RecordingContext implements RasterContext2D {
  font = "";
  fillStyle: string | object = "";
  strokeStyle: string | object = "";
  filter = "none";
  globalCompositeOperation = "source-over";
  lineWidth = 0;
  lineJoin = "";
  lineCap = "";
  textAlign = "";
  textBaseline = "";
  globalAlpha = 1;
  shadowColor = "rgba(0, 0, 0, 0)";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  readonly drawn: DrawnUnit[] = [];
  private stack: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    alpha: number;
  }[] = [];
  private state = {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    alpha: 1
  };

  measureText(text: string): { width: number } {
    return { width: text.length * GLYPH_PX };
  }
  fillText(text: string, x: number, y: number): void {
    this.drawn.push({
      text,
      x: this.state.x + x * this.state.scaleX,
      y: this.state.y + y * this.state.scaleY,
      alpha: this.globalAlpha,
      scaleX: this.state.scaleX,
      scaleY: this.state.scaleY,
      rotation: this.state.rotation
    });
  }
  strokeText(): void {}
  beginPath(): void {}
  closePath(): void {}
  rect(): void {}
  ellipse(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  fill(): void {}
  stroke(): void {}
  clip(): void {}
  clearRect(): void {}
  fillRect(): void {}
  setLineDash(): void {}
  createLinearGradient(): { addColorStop(): void } {
    return { addColorStop(): void {} };
  }
  createRadialGradient(): { addColorStop(): void } {
    return { addColorStop(): void {} };
  }
  save(): void {
    this.stack.push({ ...this.state });
  }
  restore(): void {
    const prev = this.stack.pop();
    if (prev) this.state = prev;
    this.globalAlpha = this.state.alpha;
  }
  translate(x: number, y: number): void {
    this.state.x += x;
    this.state.y += y;
  }
  rotate(angle: number): void {
    this.state.rotation += angle;
  }
  scale(x: number, y: number): void {
    this.state.scaleX *= x;
    this.state.scaleY *= y;
  }
}

const WIDTH = 800;
const HEIGHT = 400;

function style(over: Partial<ClipTextStyle> = {}): ClipTextStyle {
  return {
    text: "HELLO",
    fontSizePx: 40,
    color: "#ffffff",
    ...over
  };
}

function measure(ctx: RecordingContext): (text: string) => number {
  return (text) => ctx.measureText(text).width;
}

function canvasFor(ctx: RecordingContext) {
  return { width: WIDTH, height: HEIGHT, measureText: measureTextWith(ctx) };
}

function textClip(
  textStyle: ClipTextStyle,
  stagger: ClipAnimation["stagger"]
): TimelineClip {
  return {
    id: "clip-1",
    trackId: "track-0",
    name: "title",
    startMs: 0,
    durationMs: 5000,
    mediaType: "text",
    sourceType: "generated",
    status: "generated",
    textStyle,
    animations: [
      {
        id: "a1",
        role: "in",
        preset: "fade",
        durationMs: 400,
        easing: "linear",
        stagger
      }
    ]
  };
}

function compiledFade(
  count: number,
  unit: "word" | "character" | "line",
  offsetMs = 100
) {
  return compileClipAnimations(
    [
      {
        id: "a1",
        role: "in",
        preset: "fade",
        durationMs: 400,
        easing: "linear",
        stagger: { unit, offsetMs }
      }
    ],
    5000,
    { width: WIDTH, height: HEIGHT },
    { staggerCount: count, staggerUnit: unit }
  );
}

describe("grapheme segmentation", () => {
  it("counts a multi-codepoint emoji as one cluster", () => {
    expect(segmentGraphemes("👨‍👩‍👧‍👦")).toHaveLength(1);
    expect(segmentGraphemes("🇩🇪")).toHaveLength(1);
    expect(segmentGraphemes("a👨‍👩‍👧‍👦b")).toEqual(["a", "👨‍👩‍👧‍👦", "b"]);
  });
});

describe("countTextStaggerUnits", () => {
  const ctx = new RecordingContext();
  const canvas = canvasFor(ctx);

  it("counts characters, whitespace included, drawn or not", () => {
    expect(countTextStaggerUnits(style({ text: "HELLO" }), canvas, "character"))
      .toBe(5);
    // a, b, the space, c, d.
    expect(countTextStaggerUnits(style({ text: "ab cd" }), canvas, "character"))
      .toBe(5);
    expect(countTextStaggerUnits(style({ text: "" }), canvas, "character"))
      .toBe(0);
  });

  it("counts an emoji grapheme once", () => {
    expect(
      countTextStaggerUnits(style({ text: "hi 👨‍👩‍👧‍👦" }), canvas, "character")
    ).toBe(4);
  });

  it("counts wrapped lines, not authored ones", () => {
    expect(countTextStaggerUnits(style({ text: "one\ntwo" }), canvas, "line"))
      .toBe(2);
    // 12 code units at 10px each is 120px, over the 80px wrap width.
    const narrow = style({ text: "aaaa bbbb cccc", maxWidthFrac: 0.1 });
    expect(countTextStaggerUnits(narrow, canvas, "line")).toBe(3);
  });

  it("counts words the way it always did", () => {
    expect(countTextStaggerUnits(style({ text: "one two three" }), canvas, "word"))
      .toBe(3);
  });
});

describe("count and draw agree", () => {
  const units = ["word", "character", "line"] as const;
  const texts = [
    "HELLO",
    "ab cd",
    "one\ntwo three",
    "aaaa bbbb cccc dddd eeee",
    "a\n\nb"
  ];

  for (const unit of units) {
    for (const text of texts) {
      it(`${unit} count matches the laid-out unit list for ${JSON.stringify(text)}`, () => {
        const ctx = new RecordingContext();
        const canvas = canvasFor(ctx);
        const textStyle = style({ text, maxWidthFrac: 0.1 });
        const laidOut = layoutStaggerUnits(
          measure(ctx),
          textStyle,
          WIDTH,
          HEIGHT,
          unit
        );
        expect(laidOut).toHaveLength(
          countTextStaggerUnits(textStyle, canvas, unit)
        );
      });
    }
  }

  it("a wrapped line count matches between clipStaggerCount and the draw", () => {
    const ctx = new RecordingContext();
    const canvas = canvasFor(ctx);
    const textStyle = style({ text: "aaaa bbbb cccc", maxWidthFrac: 0.1 });
    const clip = textClip(textStyle, { unit: "line", offsetMs: 100 });
    const counted = clipStaggerCount(clip, canvas);
    expect(counted).toEqual({ unit: "line", count: 3 });
    expect(
      layoutStaggerUnits(measure(ctx), textStyle, WIDTH, HEIGHT, "line")
    ).toHaveLength(counted.count);
  });
});

describe("drawStaggeredText", () => {
  it("draws one glyph per character, in reading order", () => {
    const ctx = new RecordingContext();
    const compiled = compiledFade(5, "character");
    // 250ms in: glyphs 0..2 have opened, 3 and 4 are still at opacity 0.
    drawStaggeredText(
      ctx,
      style(),
      WIDTH,
      HEIGHT,
      { compiled, localMs: 250 },
      createStaggerScratch()
    );
    expect(ctx.drawn.map((d) => d.text)).toEqual(["H", "E", "L"]);
    expect(ctx.drawn[0].alpha).toBeCloseTo(0.625, 6);
    expect(ctx.drawn[1].alpha).toBeCloseTo(0.375, 6);
    expect(ctx.drawn[2].alpha).toBeCloseTo(0.125, 6);
    // Advances come from measureText, so the glyphs sit one width apart.
    expect(ctx.drawn[1].x - ctx.drawn[0].x).toBeCloseTo(GLYPH_PX, 6);
  });

  it("times whitespace but draws none of it", () => {
    const ctx = new RecordingContext();
    // "ab cd" is 5 units; at 450ms units 0..4 have delays 0,100,200,300,400.
    const compiled = compiledFade(5, "character");
    drawStaggeredText(
      ctx,
      style({ text: "ab cd" }),
      WIDTH,
      HEIGHT,
      { compiled, localMs: 450 },
      createStaggerScratch()
    );
    expect(ctx.drawn.map((d) => d.text)).toEqual(["a", "b", "c", "d"]);
    // "c" is unit 3, not unit 2: the space it follows took an index.
    expect(ctx.drawn[2].alpha).toBeCloseTo((450 - 300) / 400, 6);
    expect(ctx.drawn[3].alpha).toBeCloseTo((450 - 400) / 400, 6);
  });

  it("draws one unit per wrapped line for the line unit", () => {
    const ctx = new RecordingContext();
    const compiled = compiledFade(2, "line");
    drawStaggeredText(
      ctx,
      style({ text: "one\ntwo" }),
      WIDTH,
      HEIGHT,
      { compiled, localMs: 450 },
      createStaggerScratch()
    );
    expect(ctx.drawn.map((d) => d.text)).toEqual(["one", "two"]);
    expect(ctx.drawn[0].y).toBeLessThan(ctx.drawn[1].y);
  });

  it("applies the per-unit channels a glyph can honor", () => {
    const ctx = new RecordingContext();
    const compiled = compileClipAnimations(
      [
        {
          id: "a1",
          role: "in",
          preset: "custom",
          durationMs: 400,
          easing: "linear",
          stagger: { unit: "character", offsetMs: 0.0001 },
          custom: {
            curves: [
              { property: "scaleX", keyframes: [{ t: 0, value: 3 }, { t: 1, value: 3 }] },
              { property: "scaleY", keyframes: [{ t: 0, value: 2 }, { t: 1, value: 2 }] },
              { property: "rotation", keyframes: [{ t: 0, value: 1 }, { t: 1, value: 1 }] },
              { property: "positionX", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 0 }] },
              { property: "positionY", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 0 }] }
            ]
          }
        }
      ],
      5000,
      { width: WIDTH, height: HEIGHT },
      { staggerCount: 5, staggerUnit: "character" }
    );
    drawStaggeredText(
      ctx,
      style(),
      WIDTH,
      HEIGHT,
      { compiled, localMs: 200 },
      createStaggerScratch()
    );
    expect(ctx.drawn).toHaveLength(5);
    for (const unit of ctx.drawn) {
      expect(unit.scaleX).toBeCloseTo(3, 6);
      expect(unit.scaleY).toBeCloseTo(2, 6);
      expect(unit.rotation).toBeCloseTo(1, 6);
      // positionX/Y replace the laid-out pivot with the canvas center, so
      // every glyph stacks there instead of sitting on its own advance.
      expect(unit.x).toBeCloseTo(WIDTH / 2 - GLYPH_PX * 3 * 0.5, 6);
      expect(unit.y).toBeCloseTo(HEIGHT / 2, 6);
    }
  });

  it("moves the pivot with anchorX", () => {
    const ctx = new RecordingContext();
    const compiled = compileClipAnimations(
      [
        {
          id: "a1",
          role: "in",
          preset: "custom",
          durationMs: 400,
          easing: "linear",
          stagger: { unit: "character", offsetMs: 0.0001 },
          custom: {
            curves: [
              { property: "anchorX", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 0 }] },
              { property: "scaleX", keyframes: [{ t: 0, value: 2 }, { t: 1, value: 2 }] }
            ]
          }
        }
      ],
      5000,
      { width: WIDTH, height: HEIGHT },
      { staggerCount: 5, staggerUnit: "character" }
    );
    drawStaggeredText(
      ctx,
      style(),
      WIDTH,
      HEIGHT,
      { compiled, localMs: 200 },
      createStaggerScratch()
    );
    // Anchored on the left edge, a doubled glyph grows to the right from
    // where it was laid out rather than about its own center.
    const laidOut = layoutStaggerUnits(
      measure(ctx),
      style(),
      WIDTH,
      HEIGHT,
      "character"
    );
    expect(ctx.drawn[0].x).toBeCloseTo(laidOut[0].x, 6);
  });
});

describe("drawText on a context with no letter spacing of its own", () => {
  // Both shipping contexts have `letterSpacing`, so this fallback is the path
  // nothing else exercises — and the one that has to land the glyphs where the
  // native path lands them.
  it("issues one call per grapheme at the accumulated advance", () => {
    const ctx = new RecordingContext();
    drawText(ctx, style({ text: "abc", letterSpacingPx: 5 }), WIDTH, HEIGHT);
    expect(ctx.drawn.map((d) => d.text)).toEqual(["a", "b", "c"]);
    expect(ctx.drawn[1].x - ctx.drawn[0].x).toBeCloseTo(GLYPH_PX + 5, 6);
    expect(ctx.drawn[2].x - ctx.drawn[1].x).toBeCloseTo(GLYPH_PX + 5, 6);
  });

  it("issues the whole line in one call when there is no spacing", () => {
    const ctx = new RecordingContext();
    drawText(ctx, style({ text: "abc" }), WIDTH, HEIGHT);
    expect(ctx.drawn.map((d) => d.text)).toEqual(["abc"]);
  });

  it("outlines each grapheme before it fills it", () => {
    const ctx = new RecordingContext();
    drawText(
      ctx,
      style({
        text: "ab",
        letterSpacingPx: 5,
        stroke: { color: "#000000", widthPx: 4 }
      }),
      WIDTH,
      HEIGHT
    );
    // `strokeText` is not recorded, so the fills are all that show — but a
    // stroke drawn per line while the fill was drawn per glyph would have put
    // the outline under a different set of advances.
    expect(ctx.drawn.map((d) => d.text)).toEqual(["a", "b"]);
  });
});
