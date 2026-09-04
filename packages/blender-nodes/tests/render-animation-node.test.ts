/**
 * T2 additions: `RenderAnimation` against `FakeBlenderRunner`.
 *
 * Records the `job` and `inputs` the fake receives, proving the node builds
 * the expected `BlenderJob` from its props (frame range, fps, orbit sweep)
 * and never reaches past the `BlenderRunner` interface. No Blender binary
 * is touched here; the real binary runs in `render-animation.test.ts`.
 */

import { afterEach, describe, expect, it } from "vitest";

import { BLENDER_JOB_VERSION } from "../src/job.js";
import { BlenderJobError } from "../src/runner.js";
import { __setBlenderRunnerForTesting } from "../src/run-job.js";
import { RenderAnimationNode } from "../src/nodes/render-animation.js";
import { FakeBlenderRunner } from "./fake-runner.js";
import { triangleModelProp } from "./fixtures.js";

const MP4_BYTES = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);

function cannedRunner(): FakeBlenderRunner {
  return new FakeBlenderRunner({
    outputs: { video: MP4_BYTES },
    stats: { blender_version: "4.5.0-test", render_seconds: 2.5, frames: 5 }
  });
}

function animationNode(): RenderAnimationNode {
  const node = new RenderAnimationNode();
  node.model = triangleModelProp();
  return node;
}

afterEach(() => {
  __setBlenderRunnerForTesting(null);
});

describe("RenderAnimation against FakeBlenderRunner", () => {
  it("builds the expected BlenderJob from its props", async () => {
    const fake = cannedRunner();
    __setBlenderRunnerForTesting(fake);
    const node = animationNode();
    node.camera_mode = "orbit";
    node.width = 320;
    node.height = 240;
    node.azimuth = 10;
    node.elevation = 15;
    node.fov = 40;
    node.zoom = 1.5;
    node.lighting = "soft";
    node.light_intensity = 2;
    node.background_color = "#102030";
    node.transparent = false;
    node.engine = "eevee";
    node.samples = 32;
    node.denoise = true;
    node.resolution_percentage = 50;
    node.frame_start = 1;
    node.frame_end = 5;
    node.fps = 24;
    node.orbit_degrees = 90;
    node.timeout = 60;

    await node.process();
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(call.job.version).toBe(BLENDER_JOB_VERSION);
    expect(call.job.inputs).toEqual({ model: "model.glb" });
    expect(call.job.outputs).toEqual({ video: "anim.mp4" });
    expect(call.job.job).toEqual({
      op: "render_animation",
      params: {
        camera_mode: "orbit",
        azimuth: 10,
        elevation: 15,
        fov: 40,
        zoom: 1.5,
        lighting: "soft",
        light_intensity: 2,
        background_color: "#102030",
        transparent: false,
        engine: "eevee",
        samples: 32,
        denoise: true,
        resolution_percentage: 50,
        width: 320,
        height: 240,
        frame_start: 1,
        frame_end: 5,
        fps: 24,
        orbit_degrees: 90
      }
    });
    expect(call.options.timeoutMs).toBe(60_000);
    expect(call.inputs["model"]!.length).toBeGreaterThan(0);
  });

  it("clamps an inverted frame range to a single frame", async () => {
    const fake = cannedRunner();
    __setBlenderRunnerForTesting(fake);
    const node = animationNode();
    node.frame_start = 10;
    node.frame_end = 4;
    await node.process();
    expect(fake.calls[0]!.job.job).toMatchObject({
      op: "render_animation",
      params: { frame_start: 10, frame_end: 10 }
    });
  });

  it("returns the MP4 bytes as an inline video ref", async () => {
    __setBlenderRunnerForTesting(cannedRunner());
    const result = await animationNode().process();
    expect(result.video.type).toBe("video");
    expect(result.video.uri).toBe("");
    expect(result.video.asset_id).toBe(null);
    expect(result.video.data).toBe(Buffer.from(MP4_BYTES).toString("base64"));
  });

  it("rejects an empty model before touching the runner", async () => {
    const fake = cannedRunner();
    __setBlenderRunnerForTesting(fake);
    const node = new RenderAnimationNode();
    node.model = { type: "model_3d", uri: "", data: null };
    await expect(node.process()).rejects.toThrow(/empty/i);
    expect(fake.calls).toHaveLength(0);
  });

  it("prefixes the node name on an op failure", async () => {
    const fake = new FakeBlenderRunner();
    __setBlenderRunnerForTesting(fake);
    const node = animationNode();
    // The default fake returns zero-byte outputs, which the node refuses.
    const err = await node.process().then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as Error).message).toContain("nodetool.blender.RenderAnimation");
  });

  it("names the timeout fix on a timeout", async () => {
    const fake = {
      kind: "local",
      run: async () => {
        throw new BlenderJobError("timeout", "timed out");
      }
    } as FakeBlenderRunner;
    __setBlenderRunnerForTesting(fake);
    const err = await animationNode().process().then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("timeout");
    expect((err as Error).message).toContain("shorten the range");
  });
});
