/**
 * Proof for the `fontVariationSettings` fix in `draw.ts`/`textLayout.ts`.
 *
 * `@napi-rs/canvas` (Skia) does not interpolate a registered variable font's
 * `wght` axis from the `font` shorthand's weight number alone: it snaps to a
 * small set of named instances. Measured directly against the bundled
 * `Inter-Variable.ttf` (no network — this is the same file the bundled
 * catalog ships, used here as the "cached fixture font" a Google-resolved
 * variable file would also be), weights 100/300/400/500 drew byte-identical
 * ink and 600/700/800/900 drew a second, different but likewise identical
 * ink. Setting `ctx.fontVariationSettings` alongside `ctx.font` — what
 * `prepareText` and `resolveCaptionStyle` now do — fixes it: this test draws
 * through the real, shared `drawText` and asserts the ink at weight 300 and
 * weight 900 differs substantially, and that four requested weights across
 * the axis produce four distinct ink counts rather than collapsing into two
 * buckets, which is what "not synthetic" means here — a synthetic/faked bold
 * would still be one of two looks, not a smooth progression.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";

import { drawText } from "../src/render/draw.js";
import type { ClipTextStyle } from "../src/types.js";
import type { RasterContext2D } from "../src/render/draw.js";

const FIXTURE_FAMILY = "Test Variable Weight Probe";
const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fonts");

function registerFixture(): void {
  const path = join(FONTS_DIR, "Inter-Variable.ttf");
  // Prove the fixture is a real, present file before trusting anything the
  // probe below measures — a missing font registers nothing and every weight
  // would draw identically for a reason that has nothing to do with the fix.
  expect(readFileSync(path).length).toBeGreaterThan(1000);
  const key = GlobalFonts.registerFromPath(path, FIXTURE_FAMILY);
  expect(key).not.toBeNull();
}

/** Count of pixels darker than mid-grey — the ink a filled black string left. */
function inkAt(weight: number): number {
  const width = 500;
  const height = 140;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d") as unknown as RasterContext2D;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000000";
  const style: ClipTextStyle = {
    text: "Weight",
    fontFamily: FIXTURE_FAMILY,
    fontSizePx: 72,
    fontWeight: weight,
    color: "#000000",
    verticalAlign: "middle"
  };
  drawText(ctx, style, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i] ?? 255) < 128) dark++;
  }
  return dark;
}

describe("fontVariationSettings fixes Skia's variable-weight snapping", () => {
  it("draws substantially more ink at weight 900 than at weight 300", () => {
    registerFixture();
    const light = inkAt(300);
    const bold = inkAt(900);
    expect(light).toBeGreaterThan(0);
    // A synthetic-bold-free light face at 72px sets a few hundred dark
    // pixels for "Weight"; a genuinely heavier weight comfortably clears
    // 40% more ink drawing the same string at the same size.
    expect(bold).toBeGreaterThan(light * 1.4);
  });

  it("produces four distinct ink counts across the axis, not two buckets", () => {
    registerFixture();
    const weights = [200, 400, 600, 800];
    const inks = weights.map((weight) => inkAt(weight));
    // Monotonically increasing: heavier draws more ink than lighter, at every
    // step — the signature of true axis interpolation. The pre-fix behavior
    // (font shorthand alone) instead produced exactly two values across this
    // whole set (verified interactively; not re-asserted here since it is
    // the bug being fixed, not the contract).
    for (let i = 1; i < inks.length; i++) {
      expect(inks[i]!).toBeGreaterThan(inks[i - 1]!);
    }
    // All four distinct — collapsing to two would fail this.
    expect(new Set(inks).size).toBe(weights.length);
  });
});
