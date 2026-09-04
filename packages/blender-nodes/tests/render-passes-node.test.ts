/**
 * T2 additions: `RenderPasses` against `FakeBlenderRunner`.
 *
 * Records the `job` and `inputs` the fake receives, proving the node builds
 * the expected `BlenderJob` from its props (including the `passes` subset
 * and `depth_format`) and never reaches past the `BlenderRunner` interface.
 * No Blender binary is touched here; the real binary runs in
 * `render-passes.test.ts`.
 */

import { afterEach, describe, expect, it } from "vitest";

import { BLENDER_JOB_VERSION } from "../src/job.js";
import { BlenderJobError } from "../src/runner.js";
import { __setBlenderRunnerForTesting } from "../src/run-job.js";
import { RenderPassesNode } from "../src/nodes/render-passes.js";
import { FakeBlenderRunner } from "./fake-runner.js";
import { triangleModelProp } from "./fixtures.js";

const COLOR = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
const DEPTH = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 2]);
const NORMAL = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 3]);
const MASK = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 4]);

function cannedRunner(): FakeBlenderRunner {
  return new FakeBlenderRunner({
    outputs: { color: COLOR, depth: DEPTH, normal: NORMAL, mask: MASK },
    stats: {
      blender_version: "5.2.0-test",
      render_seconds: 1.25,
      depth_near: 2.25,
      depth_far: 3.75
    }
  });
}

function passesNode(): RenderPassesNode {
  const node = new RenderPassesNode();
  node.model = triangleModelProp();
  return node;
}

afterEach(() => {
  __setBlenderRunnerForTesting(null);
});

describe("RenderPasses against FakeBlenderRunner", () => {
  it("builds the expected BlenderJob from its props", async () => {
    const fake = cannedRunner();
    __setBlenderRunnerForTesting(fake);
    const node = passesNode();
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
    node.passes = ["color", "depth", "normal", "mask"];
    node.depth_format = "exr";
    node.timeout = 60;

    await node.process();
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(call.job.version).toBe(BLENDER_JOB_VERSION);
    expect(call.job.inputs).toEqual({ model: "model.glb" });
    expect(call.job.outputs).toEqual({
      color: "color.png",
      depth: "depth.exr",
      normal: "normal.png",
      mask: "mask.png"
    });
    expect(call.job.job).toEqual({
      op: "render_passes",
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
        height: 240,
        passes: ["color", "depth", "normal", "mask"],
        depth_format: "exr"
      }
    });
    expect(call.options.timeoutMs).toBe(60_000);
    expect(call.inputs["model"]!.length).toBeGreaterThan(0);
  });

  it("declares only the selected passes", async () => {
    const fake = new FakeBlenderRunner({
      outputs: { depth: DEPTH },
      stats: {
        blender_version: "5.2.0-test",
        render_seconds: 0.5,
        depth_near: 1,
        depth_far: 2
      }
    });
    __setBlenderRunnerForTesting(fake);
    const node = passesNode();
    node.passes = ["depth"];
    node.depth_format = "png16";

    const result = await node.process();
    expect(fake.calls[0]!.job.outputs).toEqual({ depth: "depth.png" });
    expect(fake.calls[0]!.job.job).toMatchObject({
      op: "render_passes",
      params: { passes: ["depth"], depth_format: "png16" }
    });
    // Unselected passes come back as empty-data refs, not as failures.
    expect(result.color.data).toBe("");
    expect(result.normal.data).toBe("");
    expect(result.mask.data).toBe("");
    expect(result.depth.data).toBe(Buffer.from(DEPTH).toString("base64"));
    expect(result.depth_near).toBe(1);
    expect(result.depth_far).toBe(2);
  });

  it("returns the pass bytes as inline image refs with the depth range", async () => {
    __setBlenderRunnerForTesting(cannedRunner());
    const result = await passesNode().process();
    expect(result.color.data).toBe(Buffer.from(COLOR).toString("base64"));
    expect(result.normal.data).toBe(Buffer.from(NORMAL).toString("base64"));
    expect(result.mask.data).toBe(Buffer.from(MASK).toString("base64"));
    expect(result.depth_near).toBe(2.25);
    expect(result.depth_far).toBe(3.75);
  });

  it("rejects an empty model before touching the runner", async () => {
    const fake = cannedRunner();
    __setBlenderRunnerForTesting(fake);
    const node = new RenderPassesNode();
    node.model = { type: "model_3d", uri: "", data: null };
    await expect(node.process()).rejects.toThrow(/empty/i);
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses an empty passes list before touching the runner", async () => {
    const fake = cannedRunner();
    __setBlenderRunnerForTesting(fake);
    const node = passesNode();
    node.passes = [];
    const err = await node.process().then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("bad_job");
    expect((err as Error).message).toContain("nodetool.blender.RenderPasses");
    expect(fake.calls).toHaveLength(0);
  });

  it("fails when the depth range is missing from stats", async () => {
    const fake = new FakeBlenderRunner({
      outputs: { depth: DEPTH },
      stats: { blender_version: "5.2.0-test", render_seconds: 0.5 }
    });
    __setBlenderRunnerForTesting(fake);
    const node = passesNode();
    node.passes = ["depth"];
    const err = await node.process().then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("missing_output");
    expect((err as Error).message).toContain("nodetool.blender.RenderPasses");
  });

  it("prefixes the node name on an op failure", async () => {
    const fake = new FakeBlenderRunner();
    __setBlenderRunnerForTesting(fake);
    const node = passesNode();
    // The default fake returns zero-byte outputs, which the node refuses.
    const err = await node.process().then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as Error).message).toContain("nodetool.blender.RenderPasses");
  });

  it("names the timeout fix on a timeout", async () => {
    const fake = {
      kind: "local",
      run: async () => {
        throw new BlenderJobError("timeout", "timed out");
      }
    } as FakeBlenderRunner;
    __setBlenderRunnerForTesting(fake);
    const err = await passesNode().process().then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("timeout");
    expect((err as Error).message).toContain("Lower the samples");
  });
});
