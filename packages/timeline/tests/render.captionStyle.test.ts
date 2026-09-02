/**
 * The caption raster cache key.
 *
 * A host keys a caption bitmap by `captionSignature` and hands the cached
 * picture back on a hit, so a style field the signature does not read renders
 * as the frame drawn before that field changed — a restyled caption nobody can
 * tell from a stuck render. The enumeration below drives every field of the
 * document schema through the key rather than the ones anybody remembered.
 *
 * Pixels are pinned in `packages/agents/tests/timeline-caption-frames.test.ts`,
 * which draws through a real `@napi-rs/canvas` context.
 */

import { describe, expect, it } from "vitest";
import { captionStyle } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type { CaptionStyle } from "../src/types.js";
import type { ResolvedCaption } from "../src/render/draw.js";
import { captionSignature } from "../src/render/draw.js";

const W = 1920;
const H = 1080;

const WORDS: ResolvedCaption["words"] = [
  { text: "the", active: false },
  { text: "quick", active: true },
  { text: "fox", active: false }
];

/**
 * Every field of `CaptionStyle`, set. `Required` makes TypeScript refuse an
 * omission and the schema check below refuses a field the document carries and
 * this object does not.
 */
const FULL: Required<CaptionStyle> = {
  fontFamily: "Georgia",
  fontSizeFrac: 0.07,
  color: "#eeeeee",
  activeColor: "#00ff00",
  outline: { color: "#101010", widthPx: 5 },
  bottomMarginFrac: 0.2,
  background: { color: "#000000", paddingPx: 12, radiusPx: 8 }
};

/** A different value of the same shape, for every field. */
const CHANGED: Required<CaptionStyle> = {
  fontFamily: "Verdana",
  fontSizeFrac: 0.08,
  color: "#efefef",
  activeColor: "#00fe00",
  outline: { color: "#101010", widthPx: 6 },
  bottomMarginFrac: 0.21,
  background: { color: "#000000", paddingPx: 13, radiusPx: 8 }
};

const sign = (style: CaptionStyle | undefined): string =>
  captionSignature({ words: WORDS, style }, W, H);

describe("captionSignature", () => {
  it("names every field the document schema carries", () => {
    // I1's mirror one rung further: a field added to the schema without a
    // value here fails before the enumeration below can miss it.
    expect(Object.keys(FULL).sort()).toEqual(
      Object.keys(captionStyle.shape).sort()
    );
  });

  it("changes when any one style field changes", () => {
    const base = sign(FULL);
    for (const field of Object.keys(FULL) as (keyof CaptionStyle)[]) {
      const mutated: CaptionStyle = { ...FULL, [field]: CHANGED[field] };
      expect(sign(mutated), field).not.toBe(base);
    }
  });

  it("changes when a field is dropped rather than changed", () => {
    // Every value above is away from its default, so dropping one is a
    // different picture.
    const base = sign(FULL);
    for (const field of Object.keys(FULL) as (keyof CaptionStyle)[]) {
      const dropped: CaptionStyle = { ...FULL };
      delete dropped[field];
      expect(sign(dropped), field).not.toBe(base);
    }
  });

  it("separates a styled caption from an unstyled one", () => {
    expect(sign(FULL)).not.toBe(sign(undefined));
  });

  it("still keys the words and the raster size", () => {
    expect(sign(FULL)).not.toBe(
      captionSignature({ words: [...WORDS].reverse(), style: FULL }, W, H)
    );
    expect(sign(FULL)).not.toBe(
      captionSignature({ words: WORDS, style: FULL }, W, H + 1)
    );
  });

  it("keys which word is active", () => {
    const moved = WORDS.map((w, i) => ({ ...w, active: i === 0 }));
    expect(captionSignature({ words: moved, style: FULL }, W, H)).not.toBe(
      sign(FULL)
    );
  });
});
