/**
 * The text raster cache key and the pure half of the text styling layout.
 *
 * The cache key is the load-bearing one. A host keys a bitmap by
 * `textStyleSignature` and hands the cached picture back on a hit, so a field
 * the signature does not read renders as the frame drawn before that field
 * changed — a stale title nobody can tell from a stuck render. The enumeration
 * below drives every field of the document schema through the signature rather
 * than listing the ones anybody remembered.
 *
 * Pixels are pinned in `packages/agents/tests/timeline-text-frames.test.ts`,
 * which draws through a real `@napi-rs/canvas` context.
 */

import { describe, expect, it } from "vitest";
import { clipTextStyle } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type { ClipTextStyle } from "../src/types.js";
import { textStyleSignature } from "../src/render/draw.js";
import {
  layoutTextBlock,
  textFontSpec,
  textLetterSpacingPx,
  textLineHeightPx
} from "../src/render/textLayout.js";

const W = 800;
const H = 400;

/**
 * Every field of `ClipTextStyle`, set. `Required` makes TypeScript refuse an
 * omission and the schema check below refuses a field the document carries and
 * this object does not.
 */
const FULL: Required<ClipTextStyle> = {
  text: "HELLO THERE",
  fontFamily: "Georgia",
  fontSizePx: 40,
  fontWeight: 600,
  color: "#ffffff",
  align: "left",
  maxWidthFrac: 0.6,
  fontStyle: "italic",
  letterSpacingPx: 3,
  lineHeight: 1.4,
  verticalAlign: "top",
  stroke: { color: "#000000", widthPx: 4 },
  shadow: { color: "#101010", blurPx: 6, offsetX: 5, offsetY: 7 },
  background: { color: "#202020", paddingPx: 12, radiusPx: 8 },
  fill: {
    type: "linear",
    angle: 45,
    stops: [
      { offset: 0, color: "#ff0000" },
      { offset: 1, color: "#0000ff" }
    ]
  }
};

/** A different value of the same shape, for every field. */
const CHANGED: Required<ClipTextStyle> = {
  text: "GOODBYE",
  fontFamily: "Verdana",
  fontSizePx: 41,
  fontWeight: 400,
  color: "#fefefe",
  align: "right",
  maxWidthFrac: 0.5,
  fontStyle: "normal",
  letterSpacingPx: 4,
  lineHeight: 1.2,
  verticalAlign: "bottom",
  stroke: { color: "#000000", widthPx: 5 },
  shadow: { color: "#101010", blurPx: 6, offsetX: 5, offsetY: 8 },
  background: { color: "#202020", paddingPx: 13, radiusPx: 8 },
  fill: {
    type: "linear",
    angle: 46,
    stops: [
      { offset: 0, color: "#ff0000" },
      { offset: 1, color: "#0000ff" }
    ]
  }
};

describe("textStyleSignature", () => {
  it("names every field the document schema carries", () => {
    // I1's mirror one rung further: a field added to the schema without a
    // value here fails before the enumeration below can miss it.
    expect(Object.keys(FULL).sort()).toEqual(
      Object.keys(clipTextStyle.shape).sort()
    );
  });

  it("changes when any one style field changes", () => {
    const base = textStyleSignature(FULL, W, H);
    for (const field of Object.keys(FULL) as (keyof ClipTextStyle)[]) {
      const mutated: ClipTextStyle = { ...FULL, [field]: CHANGED[field] };
      expect(textStyleSignature(mutated, W, H), field).not.toBe(base);
    }
  });

  it("changes when a field is dropped rather than changed", () => {
    // Every optional value above is away from its default, so dropping one is
    // a different picture. An omitted field that happens to equal the default
    // keys the same on purpose: it draws the same.
    const base = textStyleSignature(FULL, W, H);
    for (const field of Object.keys(FULL) as (keyof ClipTextStyle)[]) {
      if (field === "text" || field === "fontSizePx" || field === "color") {
        continue; // Required by the type; there is no absent form to key.
      }
      const dropped: ClipTextStyle = { ...FULL };
      delete dropped[field];
      expect(textStyleSignature(dropped, W, H), field).not.toBe(base);
    }
  });

  it("keys the raster size too", () => {
    expect(textStyleSignature(FULL, W, H)).not.toBe(
      textStyleSignature(FULL, W, H + 1)
    );
  });

  it("keys two equally-built styles the same", () => {
    const rebuilt: ClipTextStyle = {
      fill: FULL.fill,
      background: FULL.background,
      text: FULL.text,
      color: FULL.color,
      fontSizePx: FULL.fontSizePx,
      shadow: FULL.shadow,
      stroke: FULL.stroke,
      verticalAlign: FULL.verticalAlign,
      lineHeight: FULL.lineHeight,
      letterSpacingPx: FULL.letterSpacingPx,
      fontStyle: FULL.fontStyle,
      maxWidthFrac: FULL.maxWidthFrac,
      align: FULL.align,
      fontWeight: FULL.fontWeight,
      fontFamily: FULL.fontFamily
    };
    expect(textStyleSignature(rebuilt, W, H)).toBe(
      textStyleSignature(FULL, W, H)
    );
  });
});

describe("textFontSpec", () => {
  const base: ClipTextStyle = { text: "x", fontSizePx: 40, color: "#fff" };

  it("puts the slant before the weight, where the shorthand wants it", () => {
    expect(textFontSpec({ ...base, fontStyle: "italic", fontWeight: 700 })).toBe(
      "italic 700 40px Inter, Arial, sans-serif"
    );
  });

  it("drops a slant it does not know rather than emitting it", () => {
    // The shorthand is parsed whole: one unreadable token and the context
    // keeps whatever font it had, which is a wrong picture, not a plain one.
    expect(textFontSpec({ ...base, fontStyle: "slanty" })).toBe(
      textFontSpec(base)
    );
    expect(textFontSpec({ ...base, fontStyle: "normal" })).toBe(
      textFontSpec(base)
    );
  });
});

describe("line height and letter spacing", () => {
  const base: ClipTextStyle = { text: "x", fontSizePx: 40, color: "#fff" };

  it("defaults the line advance to 1.2 font sizes", () => {
    expect(textLineHeightPx(base)).toBe(48);
    expect(textLineHeightPx({ ...base, lineHeight: 2 })).toBe(80);
  });

  it("ignores a line height that would collapse the block", () => {
    expect(textLineHeightPx({ ...base, lineHeight: 0 })).toBe(48);
    expect(textLineHeightPx({ ...base, lineHeight: -1 })).toBe(48);
  });

  it("reads no spacing as zero, and a broken one as zero too", () => {
    expect(textLetterSpacingPx(base)).toBe(0);
    expect(textLetterSpacingPx({ ...base, letterSpacingPx: 4 })).toBe(4);
    expect(textLetterSpacingPx({ ...base, letterSpacingPx: NaN })).toBe(0);
  });
});

/** A fixed-advance measurer, so the layout is arithmetic. */
const GLYPH_PX = 10;
const measure = (text: string): number => text.length * GLYPH_PX;

describe("layoutTextBlock", () => {
  const base: ClipTextStyle = {
    text: "one two",
    fontSizePx: 40,
    color: "#fff"
  };

  it("charges letter spacing on every grapheme, trailing one included", () => {
    const plain = layoutTextBlock(measure, base, W, H);
    const spaced = layoutTextBlock(
      measure,
      { ...base, letterSpacingPx: 5 },
      W,
      H
    );
    // "one two" is seven graphemes drawn as two words plus a space: three
    // word graphemes each side and the separator.
    expect(spaced.lines[0]!.width - plain.lines[0]!.width).toBe(7 * 5);
    expect(spaced.spaceWidth).toBe(GLYPH_PX + 5);
  });

  it("stacks lines by the line height", () => {
    const layout = layoutTextBlock(
      measure,
      { ...base, text: "one\ntwo", lineHeight: 2 },
      W,
      H
    );
    expect(layout.lineHeight).toBe(80);
    expect(layout.lines[1]!.y - layout.lines[0]!.y).toBe(80);
  });

  it("moves the block with verticalAlign, and keeps its height", () => {
    const of = (verticalAlign: string): { y: number; height: number } => {
      const box = layoutTextBlock(
        measure,
        { ...base, text: "one\ntwo", verticalAlign },
        W,
        H
      ).box;
      return { y: box.y, height: box.height };
    };
    expect(of("top")).toEqual({ y: 0, height: 96 });
    expect(of("middle")).toEqual({ y: H / 2 - 48, height: 96 });
    expect(of("bottom")).toEqual({ y: H - 96, height: 96 });
    // An unknown value reads as the default rather than throwing (I2).
    expect(of("sideways")).toEqual(of("middle"));
  });

  it("measures the block against the text, not the raster", () => {
    const box = layoutTextBlock(measure, base, W, H).box;
    expect(box.width).toBe("one two".length * GLYPH_PX);
    expect(box.x).toBe((W - box.width) / 2);
  });

  it("collapses to a point when there is nothing to draw", () => {
    const box = layoutTextBlock(measure, { ...base, text: "" }, W, H).box;
    expect(box.width).toBe(0);
    expect(box.x).toBe(W / 2);
  });
});
