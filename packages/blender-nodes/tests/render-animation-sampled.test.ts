/**
 * T11: the sampled `render_animation` — the timeline bake's producer (§D6).
 *
 * A bake is a still per entry: each `frame_times` entry names a model time and
 * each `cameras` entry the camera that frame is rendered through. What is
 * checked here is that both are honoured per entry — the pose at an entry's
 * own time rather than the list position, a camera that moves frame to frame,
 * the named action playing alone, and `scene` mode reaching a glTF camera by
 * name. Skipped without Blender, like every other integration suite here.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BakeCameraParams, BlenderOp, RenderAnimationParams } from "../src/job.js";
import { bakeFrameOutputs } from "../src/bake.js";
import { runBlenderJob } from "../src/run-job.js";
import { blenderAvailable, failWhenBlenderRequired } from "./blender-available.js";

failWhenBlenderRequired();
import { blenderTestContext, type BlenderTestContext } from "./context.js";
import {
  createAnimatedGlb,
  createDepthGlb,
  createTriangleGlb,
  createTwoAnimationGlb
} from "./fixtures.js";
import { decodePng, type DecodedPng } from "./png.js";
import { meanAbsDiff } from "./video.js";

const WIDTH = 160;
const HEIGHT = 120;

/** The camera every frame shares unless a case sweeps it. */
function camera(overrides: Partial<BakeCameraParams> = {}): BakeCameraParams {
  return {
    camera_mode: "orbit",
    azimuth: 0,
    elevation: 0,
    fov: 35,
    zoom: 1,
    lighting: "studio",
    light_intensity: 1,
    background_color: "#102030",
    transparent: false,
    engine: "eevee",
    samples: 16,
    denoise: true,
    resolution_percentage: 100,
    ...overrides
  };
}

function sampledOp(
  frameTimes: number[],
  cameras: BakeCameraParams[],
  overrides: Partial<RenderAnimationParams> = {}
): BlenderOp {
  return {
    op: "render_animation",
    params: {
      ...cameras[0]!,
      width: WIDTH,
      height: HEIGHT,
      frame_start: 1,
      frame_end: frameTimes.length,
      fps: 24,
      orbit_degrees: 0,
      frame_times: frameTimes,
      cameras,
      ...overrides
    }
  };
}

/** Frames of one sampled run, decoded, in play order. */
async function renderSampled(
  helper: BlenderTestContext,
  model: Uint8Array,
  frameTimes: number[],
  cameras: BakeCameraParams[] = frameTimes.map(() => camera()),
  overrides: Partial<RenderAnimationParams> = {}
): Promise<{ frames: DecodedPng[]; stats: Record<string, unknown> }> {
  const outputs = bakeFrameOutputs(frameTimes.length);
  const result = await runBlenderJob(
    helper.context,
    model,
    sampledOp(frameTimes, cameras, overrides),
    outputs,
    { timeoutMs: 300_000, maxOutputCount: frameTimes.length }
  );
  const frames = Object.keys(outputs)
    .sort()
    .map((name) => decodePng(result.outputs[name]!));
  return { frames, stats: result.stats as unknown as Record<string, unknown> };
}

describe.skipIf(!blenderAvailable())("render_animation — sampled bake", () => {
  let helper: BlenderTestContext | null = null;

  beforeEach(() => {
    helper = blenderTestContext();
  });

  afterEach(() => {
    helper?.cleanup();
    helper = null;
  });

  it("renders each entry at its own model time, whatever its place in the list", async () => {
    // The animated fixture translates the front quad by +2 in x over t in
    // [0, 1], so the three entries are three distinct poses — and the third
    // is the midpoint, not the end.
    const { frames, stats } = await renderSampled(
      helper!,
      createAnimatedGlb(),
      [0, 1.0, 0.5]
    );
    expect(frames).toHaveLength(3);
    expect(stats["frames"]).toBe(3);
    expect(meanAbsDiff(frames[0]!, frames[1]!)).toBeGreaterThan(5);
    expect(meanAbsDiff(frames[1]!, frames[2]!)).toBeGreaterThan(5);

    // The entry's time is what renders, not its index: a single-entry run at
    // 1.0 is the same picture as the 1.0 entry inside the list above.
    const alone = await renderSampled(helper!, createAnimatedGlb(), [1.0]);
    expect(meanAbsDiff(alone.frames[0]!, frames[1]!)).toBeLessThanOrEqual(1);

    const half = await renderSampled(helper!, createAnimatedGlb(), [0.5]);
    expect(meanAbsDiff(half.frames[0]!, frames[2]!)).toBeLessThanOrEqual(1);
  }, 600_000);

  it("writes RGBA with a see-through ground under a transparent style", async () => {
    // T13: the alpha bake's whole premise is that the producer's PNGs carry
    // the channel — `film_transparent` plus `color_mode RGBA` — because the
    // VP9 encode downstream has nothing to encode otherwise.
    const { frames } = await renderSampled(
      helper!,
      createTriangleGlb(),
      [0],
      [camera({ transparent: true })]
    );
    const frame = frames[0]!;
    expect(frame.channels).toBe(4);
    // The corner is ground the model does not cover, so it is fully clear.
    expect(frame.pixels[3]).toBe(0);
    // And something in the frame is opaque, or "all transparent" would pass
    // this on an empty render.
    const opaque = frame.pixels.filter((_v, i) => i % 4 === 3 && _v === 255);
    expect(opaque.length).toBeGreaterThan(0);
  }, 600_000);

  it("writes an opaque ground under an opaque style", async () => {
    // Same four channels — the sequence is RGBA either way, so a bake frame
    // is comparable with the still `render_image` draws — and it is
    // `film_transparent` that decides whether any of it is see-through.
    const { frames } = await renderSampled(helper!, createTriangleGlb(), [0]);
    const frame = frames[0]!;
    expect(frame.channels).toBe(4);
    for (let i = 3; i < frame.pixels.length; i += 4) {
      expect(frame.pixels[i]).toBe(255);
    }
  }, 600_000);

  it("places the camera of each entry", async () => {
    // A 180-degree sweep across three entries: the camera location must be a
    // different point at each, which the stats report without reading pixels.
    const sweep = [0, 90, 180].map((azimuth) => camera({ azimuth }));
    const { frames, stats } = await renderSampled(
      helper!,
      createAnimatedGlb(),
      [0, 0, 0],
      sweep
    );
    const locations = stats["frame_camera_locations"] as number[][];
    expect(locations).toHaveLength(3);
    expect(locations[0]).not.toEqual(locations[1]);
    expect(locations[1]).not.toEqual(locations[2]);
    expect(locations[0]).not.toEqual(locations[2]);
    // Same model time at every entry, so only the camera moved — and it did.
    expect(meanAbsDiff(frames[0]!, frames[2]!)).toBeGreaterThan(1);
  }, 600_000);

  it("plays every animation without a name and only the named one with it", async () => {
    // At one second the fixture is three distinct pictures: both quads moved
    // apart, only the left one dropped, only the right one lifted. Anything
    // that leaves an animation playing when it should not — or, as the
    // importer's stashed NLA tracks used to, leaves the first one playing
    // whatever was asked for — collapses two of the three into one.
    const model = createTwoAnimationGlb();
    const at = [1.0];
    const all = await renderSampled(helper!, model, at);
    const onlyA = await renderSampled(helper!, model, at, [camera()], {
      animation_name: "MoveA"
    });
    const onlyB = await renderSampled(helper!, model, at, [camera()], {
      animation_name: "MoveB"
    });

    expect(meanAbsDiff(all.frames[0]!, onlyA.frames[0]!)).toBeGreaterThan(1);
    expect(meanAbsDiff(all.frames[0]!, onlyB.frames[0]!)).toBeGreaterThan(1);
    expect(meanAbsDiff(onlyA.frames[0]!, onlyB.frames[0]!)).toBeGreaterThan(1);
  }, 600_000);

  it("renders the rest pose at every entry for a model with no animation", async () => {
    const { frames } = await renderSampled(
      helper!,
      createDepthGlb(),
      [0, 1.0, 0.5]
    );
    expect(meanAbsDiff(frames[0]!, frames[1]!)).toBeLessThanOrEqual(1);
    expect(meanAbsDiff(frames[0]!, frames[2]!)).toBeLessThanOrEqual(1);

    // And that pose is what `render_image` draws from the same camera, which
    // is what makes a bake of a static model the still the editor shows.
    const still = await runBlenderJob(
      helper!.context,
      createDepthGlb(),
      {
        op: "render_image",
        params: { ...camera(), width: WIDTH, height: HEIGHT }
      },
      { image: "still.png" },
      { timeoutMs: 300_000 }
    );
    expect(
      meanAbsDiff(frames[0]!, decodePng(still.outputs["image"]!))
    ).toBeLessThanOrEqual(1);
  }, 600_000);

  it("renders through the named glTF camera in scene mode", async () => {
    const { stats } = await renderSampled(
      helper!,
      createTriangleGlb({ cameraNames: ["Shot02", "Shot01"] }),
      [0],
      [camera({ camera_mode: "scene", scene_camera_name: "Shot01" })]
    );
    expect(stats["camera"]).toBe("Shot01");
  }, 600_000);
});
