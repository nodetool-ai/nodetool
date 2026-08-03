/**
 * Executes the image-processing examples in `examples/workflows/` and asserts
 * what each operation did to the pixels.
 *
 * Like `image-examples-run.test.ts`, these need a WebGPU adapter through Dawn.
 * CI installs `mesa-vulkan-drivers` (lavapipe) for that; see
 * [AGENTS.md § WebGPU on a headless machine]. Without a Vulkan ICD every case
 * here fails with "No WebGPU adapter available (Node/Dawn)", which is a missing
 * driver rather than a broken test.
 *
 * The assertions lean on one property throughout: **an operation set to its
 * neutral value must return the original pixels exactly, and the same operation
 * with a real setting must not.** `Exposure` at 0 stops, `Offset` at dx 0,
 * an identity affine matrix, an identity channel shuffle, `ColorOverlay` at
 * amount 0 — each is paired with an active counterpart. A node that ignored its
 * input parameter would pass one half and fail the other, and a node that was
 * silently a no-op fails the active half. "Something came back" proves neither.
 *
 * Comparisons run through `nodetool.compare.CompareImages`, which compares
 * pixels including alpha — two images differing only in alpha compare unequal.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NodeRegistry,
  createGraphNodeTypeResolver
} from "@nodetool-ai/node-sdk";
import { ExecutionSession } from "@nodetool-ai/execution";
import { registerBaseNodes } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(__dirname, "../../../examples/workflows");

async function run(file: string): Promise<Record<string, unknown[]>> {
  const { graph } = JSON.parse(
    fs.readFileSync(path.join(EXAMPLES_DIR, file), "utf8")
  ) as { graph: unknown };
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  const session = await ExecutionSession.create({
    graph,
    registry,
    resolveNodeType: createGraphNodeTypeResolver(registry).resolveNodeType,
    jobId: `image-proc-${file}`,
    params: {}
  } as never);
  const result = await session.result;
  expect(result.error ?? null, `${file} errored`).toBeNull();
  expect(result.status, `${file} did not complete`).toBe("completed");
  return (result.outputs ?? {}) as Record<string, unknown[]>;
}

/** Every listed output must report the image as changed from its reference. */
function expectAllChanged(
  out: Record<string, unknown[]>,
  keys: string[]
): void {
  for (const k of keys) {
    expect(out[k], `${k}: the operation left the image untouched`).toEqual([
      false
    ]);
  }
}

describe("image_grading_cli", () => {
  it("leaves the image alone at a neutral setting and changes it otherwise", async () => {
    const out = await run("image_grading_cli.json");
    // The pair that makes the rest meaningful: 0 stops is an exact identity,
    // +1.5 stops is not. Without the first half, "changed" could just mean the
    // op corrupts everything it touches.
    expect(out["exposure_neutral_equal"]).toEqual([true]);
    expect(out["exposure_up_equal"]).toEqual([false]);
  });

  it("applies every grading and enhancement operation", async () => {
    const out = await run("image_grading_cli.json");
    expectAllChanged(out, [
      "grade_equal",
      "channel_split_equal",
      "cdl_equal",
      "color_balance_equal",
      "curves_equal",
      "film_look_equal",
      "hsl_equal",
      "lgg_equal",
      "split_toning_equal",
      "vignette_equal",
      "adaptive_equal",
      "detail_equal",
      "edge_equal",
      "equalize_equal",
      "rank_equal",
      "levels_equal"
    ]);
    // Grading is per-pixel: the canvas is untouched.
    expect(out["vignette_width"]).toEqual([48]);
    expect(out["vignette_height"]).toEqual([32]);
  });
});

describe("image_warp_cli", () => {
  it("treats warp distances as fractions of the image, not pixels", async () => {
    const out = await run("image_warp_cli.json");

    // This is the trap. `Pad` takes each edge as a fraction of the
    // corresponding dimension, so on a 40x24 image left/right 0.25 adds
    // 0.25*40 per side and top/bottom 0.5 adds 0.5*24 per side. Read as pixels,
    // `left: 5` would look like a 5px border; it actually asks for five times
    // the width.
    expect(out["pad_width"]).toEqual([60]);
    expect(out["pad_height"]).toEqual([48]);

    // Offset is the same: dx is a fraction of the width, so a whole-width
    // shift with wrap on comes back byte-identical.
    expect(out["offset_zero_equal"]).toEqual([true]);
    expect(out["offset_shift_equal"]).toEqual([false]);
    expect(out["offset_full_equal"]).toEqual([true]);
  });

  it("returns the original pixels for an identity transform", async () => {
    const out = await run("image_warp_cli.json");
    expect(out["affine_identity_equal"]).toEqual([true]);
    expect(out["cornerpin_identity_equal"]).toEqual([true]);
    expect(out["spherize_zero_equal"]).toEqual([true]);

    expectAllChanged(out, [
      "cornerpin_skew_equal",
      "spherize_bulge_equal",
      "polar_equal",
      "displaced_equal",
      "pasted_equal"
    ]);
  });

  it("resamples to the affine target size and leaves Paste's canvas alone", async () => {
    const out = await run("image_warp_cli.json");
    // Affine sizes the output explicitly, unlike the other warps.
    expect(out["affine_width"]).toEqual([60]);
    expect(out["affine_height"]).toEqual([48]);
    // Paste composites into the existing canvas rather than growing it.
    expect(out["paste_width"]).toEqual([40]);
  });
});

describe("image_masks_effects_cli", () => {
  it("inverts a mask and inverts it back", async () => {
    const out = await run("image_masks_effects_cli.json");
    expect(out["mask_inverted_equal"]).toEqual([false]);
    expect(out["mask_roundtrip_equal"]).toEqual([true]);
  });

  it("passes the image through an identity channel shuffle", async () => {
    const out = await run("image_masks_effects_cli.json");
    // r<-r, g<-g, b<-b, a<-a rebuilds the same image; swapping R and B does
    // not. The source runs red to blue precisely so the swap is detectable —
    // on a source where R and B happen to match, the swap is a real identity
    // and proves nothing.
    expect(out["shuffle_identity_equal"]).toEqual([true]);
    expect(out["shuffle_swapped_equal"]).toEqual([false]);
  });

  it("treats ColorOverlay at amount 0 as a no-op", async () => {
    const out = await run("image_masks_effects_cli.json");
    expect(out["overlay_zero_equal"]).toEqual([true]);
    expect(out["overlay_equal"]).toEqual([false]);
  });

  it("applies masks, keys, effects and filters", async () => {
    const out = await run("image_masks_effects_cli.json");
    expectAllChanged(out, [
      // Apply reads coverage from the mask's *alpha*, so the mask comes from
      // FromImage in luminance mode (1). Mode 0 reads alpha, and an opaque
      // source yields a mask that covers everything — a silent no-op.
      "mask_apply_equal",
      "tri_mask_equal",
      "merge_equal",
      "chroma_equal",
      "luma_equal",
      "fx_add_equal",
      // DropShadow and Outline work on the alpha silhouette, so they are fed a
      // transparently-padded image; against a fully opaque frame there is no
      // edge to draw and both are no-ops.
      "shadow_equal",
      "glow_equal",
      "outline_equal",
      "contour_equal",
      "smooth_equal"
    ]);
  });

  it("expands by a pixel border", async () => {
    const out = await run("image_masks_effects_cli.json");
    // Unlike the warp nodes, `Expand.border` is in pixels: 4 per side on a
    // 40x24 image. Units are per-parameter here — `Outline.width` and
    // `DropShadow.radius` are pixels too, while `DropShadow.offset_x` is a
    // fraction.
    expect(out["expand_width"]).toEqual([48]);
    expect(out["expand_height"]).toEqual([32]);
  });
});
