/**
 * T6b node seam: `PrepareForEngine` against `FakeBlenderRunner`.
 *
 * Records the `job` and `inputs` the fake receives, proving the node builds
 * the expected `BlenderJob` from its props and never reaches past the
 * `BlenderRunner` interface. No Blender binary is touched here; the real
 * binary runs in `prepare-for-engine.test.ts`.
 */

import { afterEach, describe, expect, it } from "vitest";

import { BLENDER_JOB_VERSION } from "../src/job.js";
import { BlenderJobError } from "../src/runner.js";
import { __setBlenderRunnerForTesting } from "../src/run-job.js";
import { PrepareForEngineNode } from "../src/nodes/prepare-for-engine.js";
import { FakeBlenderRunner } from "./fake-runner.js";
import { createTriangleGlb, triangleModelProp } from "./fixtures.js";

const TRIANGLE_GLB = createTriangleGlb();
const LOD_BYTES = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 4, 5, 6]);

function cannedRunner(): FakeBlenderRunner {
  return new FakeBlenderRunner({
    outputs: {
      model: TRIANGLE_GLB,
      lod_1: LOD_BYTES,
      lod_2: LOD_BYTES
    },
    stats: { blender_version: "5.2.0-test", render_seconds: 2.5, objects: 1 }
  });
}

function prepareNode(): PrepareForEngineNode {
  const node = new PrepareForEngineNode();
  node.model = triangleModelProp();
  return node;
}

afterEach(() => {
  __setBlenderRunnerForTesting(null);
});

describe("PrepareForEngine against FakeBlenderRunner", () => {
  it("builds the expected BlenderJob from its props", async () => {
    const fake = cannedRunner();
    __setBlenderRunnerForTesting(fake);
    const node = prepareNode();
    node.target_faces = 1000;
    node.unwrap = false;
    node.bake = "both";
    node.bake_resolution = 512;
    node.lod_count = 2;
    node.timeout = 60;

    await node.process();
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(call.job.version).toBe(BLENDER_JOB_VERSION);
    expect(call.job.inputs).toEqual({ model: "model.glb" });
    expect(call.job.outputs).toEqual({
      model: "model.glb",
      lod_1: "lod_1.glb",
      lod_2: "lod_2.glb"
    });
    expect(call.job.job).toEqual({
      op: "prepare_for_engine",
      params: {
        target_faces: 1000,
        unwrap: false,
        bake: "both",
        bake_resolution: 512,
        lod_count: 2
      }
    });
    expect(call.options.timeoutMs).toBe(60_000);
    expect(call.inputs["model"]!.length).toBeGreaterThan(0);
  });

  it("declares no LOD outputs when lod_count is 0", async () => {
    const fake = new FakeBlenderRunner({
      outputs: { model: TRIANGLE_GLB },
      stats: { blender_version: "5.2.0-test", render_seconds: 1 }
    });
    __setBlenderRunnerForTesting(fake);
    const node = prepareNode();
    node.lod_count = 0;

    const result = await node.process();
    expect(fake.calls[0]!.job.outputs).toEqual({ model: "model.glb" });
    expect(result.lods).toEqual([]);
    expect(result.model.type).toBe("model_3d");
  });

  it("returns the model and LOD bytes as inline model_3d refs", async () => {
    __setBlenderRunnerForTesting(cannedRunner());
    const node = prepareNode();
    node.lod_count = 2;
    const result = await node.process();
    expect(result.model).toEqual({
      type: "model_3d",
      uri: "",
      asset_id: null,
      data: Buffer.from(TRIANGLE_GLB).toString("base64")
    });
    expect(result.lods).toHaveLength(2);
    for (const lod of result.lods) {
      expect(lod.type).toBe("model_3d");
      expect(lod.data).toBe(Buffer.from(LOD_BYTES).toString("base64"));
    }
  });

  it("rejects an empty model before touching the runner", async () => {
    const fake = cannedRunner();
    __setBlenderRunnerForTesting(fake);
    const node = new PrepareForEngineNode();
    node.model = { type: "model_3d", uri: "", data: null };
    await expect(node.process()).rejects.toThrow(/empty/i);
    expect(fake.calls).toHaveLength(0);
  });

  it("prefixes the node name on an op failure", async () => {
    const fake = new FakeBlenderRunner();
    __setBlenderRunnerForTesting(fake);
    const node = prepareNode();
    // The default fake returns zero-byte outputs, which the node refuses.
    const err = await node.process().then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as Error).message).toContain("nodetool.blender.PrepareForEngine");
  });

  it("names the timeout fix on a timeout", async () => {
    const fake = {
      kind: "local",
      run: async () => {
        throw new BlenderJobError("timeout", "timed out");
      }
    } as FakeBlenderRunner;
    __setBlenderRunnerForTesting(fake);
    const err = await prepareNode().process().then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("timeout");
    expect((err as Error).message).toContain("bake resolution");
  });
});
