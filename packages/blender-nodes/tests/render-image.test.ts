/**
 * T4: render a fixture GLB through the real Blender and assert the PNG
 * decodes, has the requested size, and is not uniform.
 *
 * Skipped when Blender is absent, the way `model3d-render.test.ts` skips
 * without Chrome — but it must not skip on a machine with Blender
 * installed. The Blender under test reports through
 * `stats.blender_version`, which the version assertion pins loosely
 * (major.minor at or above the `BLENDER_MIN_VERSION` floor) rather than to
 * one release.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BLENDER_MIN_VERSION } from "../src/blender-binary.js";
import type { BlenderOp, RenderImageParams } from "../src/job.js";
import { runBlenderJob } from "../src/run-job.js";
import { blenderAvailable } from "./blender-available.js";
import { blenderTestContext, type BlenderTestContext } from "./context.js";
import { baseRenderImageParams, createTriangleGlb } from "./fixtures.js";
import { decodePng, hasPngSignature, topColorFraction } from "./png.js";

function renderImageOp(
  overrides: Record<string, unknown> = {}
): BlenderOp {
  return {
    op: "render_image",
    params: {
      ...baseRenderImageParams(overrides)
    } as unknown as RenderImageParams
  };
}

function blenderVersionAtLeastFloor(version: string): boolean {
  const match = /(\d+)\.(\d+)/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return (
    major > BLENDER_MIN_VERSION[0] ||
    (major === BLENDER_MIN_VERSION[0] && minor >= BLENDER_MIN_VERSION[1])
  );
}

describe.skipIf(!blenderAvailable())("render_image integration", () => {
  let helper: BlenderTestContext | null = null;

  beforeEach(() => {
    helper = blenderTestContext();
  });

  afterEach(() => {
    helper?.cleanup();
    helper = null;
  });

  it("renders a GLB to a PNG of the requested size that is not uniform", async () => {
    const result = await runBlenderJob(
      helper!.context,
      createTriangleGlb(),
      renderImageOp({ width: 320, height: 240 }),
      { image: "render.png" },
      { timeoutMs: 300_000 }
    );
    const png = result.outputs["image"]!;
    expect(hasPngSignature(png)).toBe(true);
    const image = decodePng(png);
    expect(image.width).toBe(320);
    expect(image.height).toBe(240);
    // A lit triangle on a dark background: the background never covers the
    // whole frame, and the file is never near-empty.
    expect(topColorFraction(image)).toBeLessThan(0.99);
    expect(png.byteLength).toBeGreaterThan(500);
    expect(
      blenderVersionAtLeastFloor(result.stats.blender_version)
    ).toBe(true);
  }, 300_000);
});
