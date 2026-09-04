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
import { blenderAvailable, failWhenBlenderRequired } from "./blender-available.js";

failWhenBlenderRequired();
import { blenderTestContext, type BlenderTestContext } from "./context.js";
import {
  countGlbFaces,
  createGridGlb,
  createTwoMeshGridGlb,
  createTwoMaterialGlb,
  extractGlbImages,
  parseGlbJson
} from "./fixtures.js";
import { decodePng, hasPngSignature, type DecodedPng } from "./png.js";

/** Mean 8-bit sample over every channel: 0 for a black bake, ~255 for white. */
function meanBrightness(image: DecodedPng): number {
  let total = 0;
  for (let i = 0; i < image.pixels.length; i++) total += image.pixels[i]!;
  return total / image.pixels.length;
}

/** Fraction of pixels brighter than mid-gray on the first channel. */
function litFraction(image: DecodedPng): number {
  const count = image.pixels.length / image.channels;
  let lit = 0;
  for (let i = 0; i < count; i++) {
    if (image.pixels[i * image.channels]! > 128) lit++;
  }
  return lit / count;
}

/**
 * Mean absolute distance from the flat tangent-space normal color: a real
 * normal bake of a flat grid lands within a few levels of (128, 128, 255).
 */
function meanNormalDistance(image: DecodedPng): number {
  const target = [128, 128, 255];
  const channels = image.channels;
  const count = image.pixels.length / channels;
  let total = 0;
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 3; c++) {
      total += Math.abs(image.pixels[i * channels + c]! - target[c]!);
    }
  }
  return total / count / 3;
}

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

  it("halves the total face count across multiple mesh objects per LOD", async () => {
    const input = createTwoMeshGridGlb();
    expect(countGlbFaces(input)).toBe(200);
    const result = await runBlenderJob(
      helper!.context,
      input,
      prepareOp({ target_faces: 100, unwrap: false, bake: "none" }),
      { model: "model.glb", lod_1: "lod_1.glb", lod_2: "lod_2.glb" },
      { timeoutMs: 300_000 }
    );
    const modelFaces = countGlbFaces(result.outputs["model"]!);
    const lod1Faces = countGlbFaces(result.outputs["lod_1"]!);
    const lod2Faces = countGlbFaces(result.outputs["lod_2"]!);
    expect(modelFaces).toBe(200);
    expect(lod1Faces).toBe(100);
    expect(lod2Faces).toBe(50);
  }, 300_000);

  it("bakes a two-material mesh: every slot gets a lit AO map", async () => {
    // One mesh, two material slots. An image count alone proves nothing: a
    // cancelled bake still packs the black default image per material, so
    // this asserts pixel values. A flat quad's AO bakes near white.
    const input = createTwoMaterialGlb();
    expect(countGlbFaces(input)).toBe(4);
    const result = await runBlenderJob(
      helper!.context,
      input,
      prepareOp({ bake: "ao", lod_count: 0, target_faces: 5000 }),
      { model: "model.glb" },
      { timeoutMs: 300_000 }
    );
    const model = result.outputs["model"]!;
    const validation = validateModel3D(
      parseGlbJson(model) as Parameters<typeof validateModel3D>[0]
    );
    expect(validation.ok).toBe(true);
    expect(countGlbFaces(model)).toBe(4);
    // One baked AO image per material, embedded in the GLB. Each face
    // bakes into its own material's image over a shared unwrapped island,
    // so neither map is full-white: the means below are half the measured
    // 100 with a black bake at exactly 0.
    const images = extractGlbImages(model);
    expect(images.length).toBe(2);
    for (const image of images) {
      expect(image.mimeType).toBe("image/png");
      expect(hasPngSignature(image.bytes)).toBe(true);
      const decoded = decodePng(image.bytes);
      expect(meanBrightness(decoded)).toBeGreaterThan(50);
      expect(litFraction(decoded)).toBeGreaterThan(0.2);
    }
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
    // Both baked maps ride along as embedded images, and both carry light:
    // the AO map bakes near white, the normal map near (128, 128, 255).
    // A cancelled bake packs black defaults, which the old count-only
    // assertion could not see.
    const images = extractGlbImages(model);
    expect(images.length).toBeGreaterThanOrEqual(2);
    const decoded = images.map((image) => {
      expect(image.mimeType).toBe("image/png");
      return decodePng(image.bytes);
    });
    expect(Math.max(...decoded.map(meanBrightness))).toBeGreaterThan(200);
    expect(Math.min(...decoded.map(meanNormalDistance))).toBeLessThan(8);
    expect(countGlbFaces(model)).toBeLessThan(GRID_FACES);
  }, 300_000);
});
