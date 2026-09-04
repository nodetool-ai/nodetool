/**
 * T6b node seam: `RenderImage` against `FakeBlenderRunner`.
 *
 * Records the `job` and `inputs` the fake receives, proving the node builds
 * the expected `BlenderJob` from its props and never reaches past the
 * `BlenderRunner` interface. No Blender binary is touched here; the real
 * binary runs in `render-image.test.ts` and `camera-mode.test.ts`.
 */

import { afterEach, describe, expect, it } from "vitest";

import { BLENDER_JOB_VERSION } from "../src/job.js";
import { BlenderJobError } from "../src/runner.js";
import { __setBlenderRunnerForTesting } from "../src/run-job.js";
import { RenderImageNode } from "../src/nodes/render-image.js";
import { FakeBlenderRunner } from "./fake-runner.js";
import { triangleModelProp } from "./fixtures.js";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function cannedRunner(): FakeBlenderRunner {
  return new FakeBlenderRunner({
    outputs: { image: PNG_BYTES },
    stats: { blender_version: "5.2.0-test", render_seconds: 1.25 }
  });
}

function renderNode(): RenderImageNode {
  const node = new RenderImageNode();
  node.model = triangleModelProp();
  return node;
}

afterEach(() => {
  __setBlenderRunnerForTesting(null);
});

describe("RenderImage against FakeBlenderRunner", () => {
  it("builds the expected BlenderJob from its props", async () => {
    const fake = cannedRunner();
    __setBlenderRunnerForTesting(fake);
    const node = renderNode();
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
    node.transparent = true;
    node.engine = "cycles";
    node.samples = 32;
    node.denoise = false;
    node.resolution_percentage = 50;
    node.timeout = 60;

    await node.process();
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(call.job.version).toBe(BLENDER_JOB_VERSION);
    expect(call.job.inputs).toEqual({ model: "model.glb" });
    expect(call.job.outputs).toEqual({ image: "render.png" });
    expect(call.job.job).toEqual({
      op: "render_image",
      params: {
        camera_mode: "orbit",
        azimuth: 10,
        elevation: 15,
        fov: 40,
        zoom: 1.5,
        lighting: "soft",
        light_intensity: 2,
        background_color: "#102030",
        transparent: true,
        engine: "cycles",
        samples: 32,
        denoise: false,
        resolution_percentage: 50,
        width: 320,
        height: 240
      }
    });
    expect(call.options.timeoutMs).toBe(60_000);
    expect(call.inputs["model"]!.length).toBeGreaterThan(0);
  });

  it("returns the PNG bytes as an inline image ref", async () => {
    __setBlenderRunnerForTesting(cannedRunner());
    const result = await renderNode().process();
    expect(result.image.type).toBe("image");
    expect(result.image.uri).toBe("");
    expect(result.image.asset_id).toBe(null);
    expect(result.image.data).toBe(Buffer.from(PNG_BYTES).toString("base64"));
  });

  it("rejects an empty model before touching the runner", async () => {
    const fake = cannedRunner();
    __setBlenderRunnerForTesting(fake);
    const node = new RenderImageNode();
    node.model = { type: "model_3d", uri: "", data: null };
    await expect(node.process()).rejects.toThrow(/empty/i);
    expect(fake.calls).toHaveLength(0);
  });

  it("prefixes the node name on an op failure", async () => {
    const fake = new FakeBlenderRunner();
    __setBlenderRunnerForTesting(fake);
    const node = renderNode();
    // The default fake returns zero-byte outputs, which the node refuses.
    const err = await node.process().then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as Error).message).toContain("nodetool.blender.RenderImage");
  });

  it("names the timeout fix on a timeout", async () => {
    const fake = {
      kind: "local",
      run: async () => {
        throw new BlenderJobError("timeout", "timed out");
      }
    } as FakeBlenderRunner;
    __setBlenderRunnerForTesting(fake);
    const err = await renderNode().process().then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("timeout");
    expect((err as Error).message).toContain("Lower the samples");
  });
});
