/**
 * T11: what the bake sends to Blender, without running one.
 *
 * The sampled job is one declared output per frame plus the two parallel
 * lists, and the caps that bound it are checked before a runner is picked —
 * so a request that could not be rendered is refused here rather than after
 * minutes of render time.
 */

import { describe, expect, it } from "vitest";

import {
  animationDurations,
  parseModel3D
} from "@nodetool-ai/model3d";
import {
  DEFAULT_MODEL3D_STYLE,
  model3dBakeCameraParams,
  clipModel3DCameraFromBakeParams,
  type Model3DBakeCameraParams
} from "@nodetool-ai/timeline";

import {
  bakeFrameOutputs,
  bakeRenderAnimationParams,
  renderModel3DBakeFrames,
  MAX_BAKE_FRAMES
} from "../src/bake.js";
import type { BakeCameraParams } from "../src/job.js";
import { BlenderJobError } from "../src/runner.js";
import { __setBlenderRunnerForTesting } from "../src/run-job.js";
import { FakeBlenderRunner } from "./fake-runner.js";
import { blenderTestContext } from "./context.js";
import { createTwoAnimationGlb } from "./fixtures.js";

function camera(azimuth = 0): BakeCameraParams {
  return {
    camera_mode: "orbit",
    azimuth,
    elevation: 10,
    fov: 35,
    zoom: 1,
    lighting: "studio",
    light_intensity: 1,
    background_color: "#102030",
    transparent: false,
    engine: "eevee",
    samples: 16,
    denoise: true,
    resolution_percentage: 100
  };
}

describe("bakeFrameOutputs", () => {
  it("declares one six-digit output per frame, sorting in play order", () => {
    const outputs = bakeFrameOutputs(3);
    expect(outputs).toEqual({
      frame_000001: "frame_000001.png",
      frame_000002: "frame_000002.png",
      frame_000003: "frame_000003.png"
    });
    expect(Object.keys(bakeFrameOutputs(12)).sort()).toEqual(
      Object.keys(bakeFrameOutputs(12))
    );
  });
});

describe("bakeRenderAnimationParams", () => {
  const request = {
    frameTimes: [0, 0.5],
    cameras: [camera(0), camera(90)],
    width: 1920,
    height: 1080,
    fps: 30
  };

  it("carries the sample lists and takes the shared settings from frame one", () => {
    const params = bakeRenderAnimationParams(request);
    expect(params.frame_times).toEqual([0, 0.5]);
    expect(params.cameras).toHaveLength(2);
    expect(params.lighting).toBe("studio");
    expect(params.width).toBe(1920);
    expect(params.fps).toBe(30);
    // The range is the entry count, which is what the runner's `Fra:`
    // progress arithmetic reads.
    expect(params.frame_start).toBe(1);
    expect(params.frame_end).toBe(2);
  });

  it("leaves `animation_name` off when the style names none", () => {
    expect(bakeRenderAnimationParams(request).animation_name).toBeUndefined();
    expect(
      bakeRenderAnimationParams({ ...request, animationName: "MoveA" })
        .animation_name
    ).toBe("MoveA");
  });
});

describe("renderModel3DBakeFrames", () => {
  const model = new Uint8Array([1, 2, 3]);
  const helper = blenderTestContext();

  const render = (frameTimes: number[], cameras: BakeCameraParams[]) =>
    renderModel3DBakeFrames(
      helper.context,
      model,
      { frameTimes, cameras, width: 640, height: 360, fps: 30 },
      { timeoutMs: 1000 }
    );

  it("hands the runner one job with a frame output per entry", async () => {
    const runner = new FakeBlenderRunner({
      outputs: {
        frame_000001: new Uint8Array([1]),
        frame_000002: new Uint8Array([2])
      },
      stats: { blender_version: "5.2.0-test", render_seconds: 1 }
    });
    __setBlenderRunnerForTesting(runner);
    try {
      const { frames } = await render([0, 0.5], [camera(0), camera(90)]);
      expect(frames.map((f) => [...f])).toEqual([[1], [2]]);
      expect(Object.keys(runner.calls[0]!.job.outputs)).toEqual([
        "frame_000001",
        "frame_000002"
      ]);
      expect(runner.calls[0]!.job.job.op).toBe("render_animation");
    } finally {
      __setBlenderRunnerForTesting(null);
    }
  });

  it("refuses more frames than one bake may hold", async () => {
    const many = Array.from({ length: MAX_BAKE_FRAMES + 1 }, () => 0);
    await expect(render(many, many.map(() => camera()))).rejects.toThrow(
      /above the \d+-frame cap/
    );
  });

  it("refuses a camera list that does not match the times", async () => {
    await expect(render([0, 1], [camera()])).rejects.toBeInstanceOf(
      BlenderJobError
    );
  });

  it("refuses an empty sample list", async () => {
    await expect(render([], [])).rejects.toThrow(/at least one frame/);
  });
});

/**
 * The timeline builds the per-frame camera and this package renders it, and
 * the two declare the shape separately — `packages/timeline` is pure and knows
 * nothing about a runner, so it cannot import `BakeCameraParams`. A type
 * annotation would not catch drift here (vitest transpiles without checking,
 * and `tsc -p` covers `src` only), so the field names are compared as data:
 * either side gaining or losing one fails.
 */
describe("the timeline's camera DTO and this package's", () => {
  it("carry the same fields, optionals included", () => {
    const fromTimeline = model3dBakeCameraParams(
      {
        ...DEFAULT_MODEL3D_STYLE.camera,
        sceneCameraName: "Shot01",
        targetOffset: [0, 1, 2]
      },
      {
        ...DEFAULT_MODEL3D_STYLE,
        background: { transparent: false, color: "#101010" }
      },
      { engine: "eevee", samples: 16, denoise: true, resolutionPercentage: 100 }
    );
    const here: BakeCameraParams = {
      ...camera(),
      scene_camera_name: "Shot01",
      target_offset: [0, 1, 2]
    };
    expect(Object.keys(fromTimeline).sort()).toEqual(Object.keys(here).sort());

    // And the values a clip owns survive the round trip through this DTO.
    expect(clipModel3DCameraFromBakeParams(fromTimeline)).toEqual({
      ...DEFAULT_MODEL3D_STYLE.camera,
      sceneCameraName: "Shot01",
      targetOffset: [0, 1, 2]
    });
  });
});

describe("the two-animation fixture", () => {
  it("is a glTF with two named one-second animations", () => {
    const durations = animationDurations(
      parseModel3D(createTwoAnimationGlb()).json
    );
    expect(durations).toEqual([
      { name: "MoveA", durationSec: 1 },
      { name: "MoveB", durationSec: 1 }
    ]);
  });
});
