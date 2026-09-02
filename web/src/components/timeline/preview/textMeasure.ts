/**
 * The browser's text measurer for the scene model.
 *
 * A `"line"` stagger is timed against the number of WRAPPED lines, so the
 * count has to wrap through the same measurement the rasterizer draws with.
 * One scratch context, shared: measuring never draws.
 */

import type { MeasureTextWidth, RasterContext2D } from "@nodetool-ai/timeline/render";
import { measureTextWith } from "@nodetool-ai/timeline/render";

let measurer: MeasureTextWidth | undefined;
let resolved = false;

/**
 * A measurer backed by an `OffscreenCanvas`, or `undefined` where there is no
 * canvas to measure with (jsdom). Without one a soft-wrapped `"line"` stagger
 * counts authored line breaks instead; every other unit is wrap-independent
 * and unaffected.
 */
export function textMeasurer(): MeasureTextWidth | undefined {
  if (resolved) return measurer;
  resolved = true;
  if (typeof OffscreenCanvas === "undefined") return undefined;
  const ctx = new OffscreenCanvas(1, 1).getContext("2d");
  if (!ctx) return undefined;
  measurer = measureTextWith(ctx as unknown as RasterContext2D);
  return measurer;
}
