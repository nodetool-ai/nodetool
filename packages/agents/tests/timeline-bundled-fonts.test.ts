/**
 * The two Node hosts draw the same glyphs (T17, D8, F15).
 *
 * `NodeRasterizer` (the server render) and `PreviewRasterizer` (the agent's
 * frame preview) are separate classes in separate packages over one set of
 * drawing rules. Before the bundled corpus they also resolved `Inter, Arial,
 * sans-serif` against whatever the machine had, so "same rules" was as far as
 * the guarantee went — a title previewed here and rendered there could be set
 * in two different faces and nothing would say so.
 *
 * Both now register the same files with the same library, so the comparison is
 * pixel for pixel rather than layout-only. Bebas Neue is the word drawn
 * because it is a static display face with no system twin: on a host with no
 * fonts installed at all, a fallback would still produce two matching
 * bitmaps, so the test also asserts the raster is *not* what the fallback
 * draws.
 */

import { describe, expect, it } from "vitest";
import { GlobalFonts } from "@napi-rs/canvas";
import type { ClipTextStyle } from "@nodetool-ai/timeline";
import { registerBundledFonts } from "@nodetool-ai/timeline/fonts/node";
import { NodeRasterizer } from "@nodetool-ai/video-nodes/nodes/timeline/rasterizers";

import { PreviewRasterizer } from "../src/timeline-preview/rasterize.js";

const W = 640;
const H = 200;

const style = (fontFamily: string): ClipTextStyle => ({
  text: "NODETOOL",
  fontSizePx: 96,
  color: "#ffffff",
  fontFamily
});

/** The alpha channel of a raster, which is where the glyph outlines are. */
function alphaOf(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i += 1) out[i] = rgba[i * 4 + 3]!;
  return out;
}

/** Fraction of pixels whose alpha differs by more than one step. */
function mismatchFraction(a: Uint8Array, b: Uint8Array): number {
  expect(a.length).toBe(b.length);
  let differing = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs(a[i]! - b[i]!) > 1) differing += 1;
  }
  return differing / a.length;
}

function inkFraction(alpha: Uint8Array): number {
  let painted = 0;
  for (const value of alpha) {
    if (value > 8) painted += 1;
  }
  return painted / alpha.length;
}

describe("bundled fonts across the Node hosts", () => {
  it("registers every catalog face from the package's own directory", () => {
    const result = registerBundledFonts();
    expect(result.dir).not.toBeNull();
    expect(result.missing).toEqual([]);
    expect(result.registered.length).toBeGreaterThan(0);
  });

  it("draws Bebas Neue identically in the server render and the preview", () => {
    const server = new NodeRasterizer(W, H).text(style("Bebas Neue"));
    const previewCanvas = new PreviewRasterizer(W, H).text(style("Bebas Neue"));
    expect(server).not.toBeNull();
    expect(previewCanvas).not.toBeNull();

    const serverAlpha = alphaOf(server!.rgba);
    const previewAlpha = alphaOf(
      previewCanvas!.getContext("2d").getImageData(0, 0, W, H).data
    );

    // Same library, same face, same rules: the tolerance is for encoder-level
    // noise, not for a different typeface.
    expect(mismatchFraction(serverAlpha, previewAlpha)).toBeLessThan(0.001);
    // And something was actually drawn, so the comparison is not of two blanks.
    expect(inkFraction(serverAlpha)).toBeGreaterThan(0.01);
  });

  it("draws the face it named, not one face for every family", () => {
    // Without this the parity assertion above would pass on two identical
    // fallbacks: a host with no corpus resolves every family to the same
    // glyphs, and "identical" would then mean nothing.
    expect(
      GlobalFonts.families.some((face) => face.family === "Bebas Neue")
    ).toBe(true);

    const rasterizer = new NodeRasterizer(W, H);
    const bebas = alphaOf(rasterizer.text(style("Bebas Neue"))!.rgba);
    const inter = alphaOf(rasterizer.text(style("Inter"))!.rgba);
    expect(mismatchFraction(bebas, inter)).toBeGreaterThan(0.01);
  });
});
