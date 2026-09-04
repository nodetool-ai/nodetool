/**
 * T4: `prepare_for_engine` through the real Blender.
 *
 * A 10x10 grid fixture carries exactly 200 triangular faces. Prepared
 * toward a budget of 40 with a normal bake and two LODs, the model comes
 * back under the budget, the LODs come back two in number with strictly
 * decreasing face counts, and the model GLB passes `validateModel3D`.
 * Skipped without Blender, like the render T4s.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateModel3D } from "@nodetool-ai/model3d";

import type { BlenderOp, PrepareForEngineParams } from "../src/job.js";
import { runBlenderJob } from "../src/run-job.js";
import { blenderAvailable } from "./blender-available.js";
import { blenderTestContext, type BlenderTestContext } from "./context.js";
import { countGlbFaces, createGridGlb, parseGlbJson } from "./fixtures.js";

const GRID_SIZE = 10;
const GRID_FACES = 2 * GRID_SIZE * GRID_SIZE;
const TARGET_FACES = 40;

function prepareOp(
  overrides: Partial<PrepareForEngineParams> = {}
): BlenderOp {
  return {
    op: "prepare_for_engine",
    params: {
      target_faces: TARGET_FACES,
      unwrap: true,
      bake: "normal",
      bake_resolution: 64,
      lod_count: 2,
      ...overrides
    }
  };
}

describe.skipIf(!blenderAvailable())("prepare_for_engine integration", () => {
  let helper: BlenderTestContext | null = null;

  beforeEach(() => {
    helper = blenderTestContext();
  });

  afterEach(() => {
    helper?.cleanup();
    helper = null;
  });

  it("decimates toward the budget and emits decreasing LODs", async () => {
    const input = createGridGlb(GRID_SIZE);
    const before = countGlbFaces(input);
    expect(before).toBe(GRID_FACES);

    const result = await runBlenderJob(
      helper!.context,
      input,
      prepareOp(),
      { model: "model.glb", lod_1: "lod_1.glb", lod_2: "lod_2.glb" },
      { timeoutMs: 300_000 }
    );
    const model = result.outputs["model"]!;
    const lod1 = result.outputs["lod_1"]!;
    const lod2 = result.outputs["lod_2"]!;
    const after = countGlbFaces(model);
    const lod1Faces = countGlbFaces(lod1);
    const lod2Faces = countGlbFaces(lod2);

    // The numbers, not just that it ran: 200 in, at most the budget out,
    // and each LOD strictly smaller than the last.
    expect(after).toBeLessThan(before);
    expect(after).toBeLessThanOrEqual(TARGET_FACES + TARGET_FACES / 2);
    expect(lod1Faces).toBeLessThan(after);
    expect(lod2Faces).toBeLessThan(lod1Faces);

    const validation = validateModel3D(
      parseGlbJson(model) as Parameters<typeof validateModel3D>[0]
    );
    expect(validation.ok).toBe(true);
  }, 300_000);

  it("bakes both maps and stays a valid GLB", async () => {
    const input = createGridGlb(GRID_SIZE);
    const result = await runBlenderJob(
      helper!.context,
      input,
      prepareOp({ bake: "both", lod_count: 0 }),
      { model: "model.glb" },
      { timeoutMs: 300_000 }
    );
    const model = result.outputs["model"]!;
    const json = parseGlbJson(model);
    const validation = validateModel3D(
      json as Parameters<typeof validateModel3D>[0]
    );
    expect(validation.ok).toBe(true);
    // Both baked maps ride along as embedded images.
    expect((json["images"] as unknown[]).length).toBeGreaterThanOrEqual(2);
    expect(countGlbFaces(model)).toBeLessThan(GRID_FACES);
  }, 300_000);
});
