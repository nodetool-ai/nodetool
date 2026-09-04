/**
 * T2b: the three `camera_mode` values against a fixture GLB with a camera
 * and one without, through the real Blender (skipped when Blender is
 * absent, like `model3d-render.test.ts` without Chrome).
 *
 * Which camera rendered is read from `stats.camera`: the imported scene
 * camera keeps its glTF name, the orbit camera is `NodeTool_Orbit`. The
 * lights branches ride along: a strong `KHR_lights_punctual` sun lights the
 * frame under a `flat` preset (which adds no light of its own), while the
 * same preset on a light-less fixture leaves only ambient wash.
 */

import { describe, expect, it } from "vitest";

import type { BlenderOp, RenderImageParams } from "../src/job.js";
import { BlenderJobError } from "../src/runner.js";
import { runBlenderJob } from "../src/run-job.js";
import { blenderAvailable } from "./blender-available.js";
import {
  baseRenderImageParams,
  createTriangleGlb,
  type TriangleFixtureOptions
} from "./fixtures.js";
import { centerBrightness, decodePng } from "./png.js";

const ORBIT_CAMERA_NAME = "NodeTool_Orbit";

function renderImageOp(
  cameraMode: string,
  overrides: Record<string, unknown> = {}
): BlenderOp {
  return {
    op: "render_image",
    params: {
      ...baseRenderImageParams(overrides),
      camera_mode: cameraMode
    } as unknown as RenderImageParams
  };
}

async function render(
  fixture: TriangleFixtureOptions,
  cameraMode: string,
  overrides: Record<string, unknown> = {}
) {
  return runBlenderJob(
    undefined,
    createTriangleGlb(fixture),
    renderImageOp(cameraMode, overrides),
    { image: "render.png" },
    { timeoutMs: 300_000 }
  );
}

describe.skipIf(!blenderAvailable())("camera_mode selection", () => {
  it("auto uses the scene camera when the model has one", async () => {
    const result = await render({ withCamera: true }, "auto");
    expect(result.stats.camera).not.toBe(ORBIT_CAMERA_NAME);
  }, 300_000);

  it("auto falls back to the orbit camera without a scene camera", async () => {
    const result = await render({}, "auto");
    expect(result.stats.camera).toBe(ORBIT_CAMERA_NAME);
  }, 300_000);

  it("scene uses the scene camera", async () => {
    const result = await render({ withCamera: true }, "scene");
    expect(result.stats.camera).not.toBe(ORBIT_CAMERA_NAME);
  }, 300_000);

  it("scene without a camera is no_camera before any render time", async () => {
    const err = await render({}, "scene").then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("no_camera");
  }, 300_000);

  it("orbit ignores the scene camera", async () => {
    const result = await render({ withCamera: true }, "orbit");
    expect(result.stats.camera).toBe(ORBIT_CAMERA_NAME);
  }, 300_000);

  it("a meshless model is no_geometry", async () => {
    const err = await render(
      { withMesh: false, withCamera: true },
      "orbit"
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("no_geometry");
  }, 300_000);
});

describe.skipIf(!blenderAvailable())("scene lights versus the preset", () => {
  it("uses the scene's lights when it has any", async () => {
    // `flat` adds no light of its own, so a lit triangle can only come from
    // the scene sun (KHR intensity 2000 ≈ Blender energy 3).
    const result = await render(
      { withCamera: true, lightIntensity: 2000 },
      "orbit",
      { lighting: "flat" }
    );
    const image = decodePng(result.outputs["image"]!);
    expect(centerBrightness(image)).toBeGreaterThan(130);
  }, 300_000);

  it("falls back to the preset when the scene has no lights", async () => {
    // Same `flat` preset on a light-less fixture: ambient wash only, so the
    // center stays near the background instead of lit.
    const result = await render({}, "orbit", { lighting: "flat" });
    const image = decodePng(result.outputs["image"]!);
    expect(centerBrightness(image)).toBeLessThan(110);
  }, 300_000);
});
