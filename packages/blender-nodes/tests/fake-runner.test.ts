import { describe, expect, it } from "vitest";

import { BLENDER_JOB_VERSION, type BlenderJob } from "../src/job.js";
import { FakeBlenderRunner } from "./fake-runner.js";

function testJob(): BlenderJob {
  return {
    version: BLENDER_JOB_VERSION,
    inputs: { model: "model.glb" },
    outputs: { image: "render.png" },
    job: {
      op: "render_image",
      params: {
        camera_mode: "orbit",
        azimuth: 45,
        elevation: 25,
        fov: 35,
        zoom: 1,
        lighting: "studio",
        light_intensity: 1,
        background_color: "#ffffff",
        transparent: false,
        engine: "eevee",
        samples: 16,
        denoise: true,
        resolution_percentage: 100,
        width: 64,
        height: 64
      }
    }
  };
}

describe("FakeBlenderRunner", () => {
  it("records the job and inputs it receives", async () => {
    const runner = new FakeBlenderRunner();
    const job = testJob();
    const model = new Uint8Array([1, 2, 3]);
    await runner.run(job, { model }, { timeoutMs: 1000 });
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]?.job).toBe(job);
    expect(runner.calls[0]?.inputs["model"]).toBe(model);
  });

  it("returns one output per declared output by default", async () => {
    const runner = new FakeBlenderRunner();
    const result = await runner.run(testJob(), { model: new Uint8Array([9]) }, {
      timeoutMs: 1000
    });
    expect(Object.keys(result.outputs)).toEqual(["image"]);
    expect(result.stats.blender_version).toBe("4.5.0-test");
  });

  it("honors a canned result", async () => {
    const canned = new Uint8Array([7, 7]);
    const runner = new FakeBlenderRunner({
      outputs: { image: canned },
      stats: { blender_version: "x", render_seconds: 1.5 }
    });
    const result = await runner.run(testJob(), { model: new Uint8Array() }, {
      timeoutMs: 1000
    });
    expect(result.outputs["image"]).toBe(canned);
    expect(result.stats.render_seconds).toBe(1.5);
  });
});
