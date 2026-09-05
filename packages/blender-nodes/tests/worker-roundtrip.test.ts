/**
 * Real worker contract test. Set NODETOOL_WORKER_URL to a nodetool-core
 * worker from PR #1050 to run it. The worker must have Blender installed.
 *
 * `NODETOOL_REQUIRE_WORKER=1` turns a missing URL into a failed file instead
 * of a skip, the way `NODETOOL_REQUIRE_BLENDER` does for the binary: a
 * skipped suite must not read as green where the worker was meant to run.
 */

import { afterEach, describe, expect, it } from "vitest";

import { RenderImageNode } from "../src/nodes/render-image.js";
import { WorkerBlenderRunner } from "../src/runner.js";
import { __setBlenderRunnerForTesting } from "../src/run-job.js";
import { triangleModelProp } from "./fixtures.js";
import { hasPngSignature, pngSize } from "./png.js";

const workerUrl = process.env["NODETOOL_WORKER_URL"]?.trim() ?? "";

if (process.env["NODETOOL_REQUIRE_WORKER"] === "1" && workerUrl === "") {
  throw new Error(
    "NODETOOL_REQUIRE_WORKER=1 is set but NODETOOL_WORKER_URL is empty. " +
      "Point NODETOOL_WORKER_URL at a nodetool-core worker with Blender, or " +
      "unset NODETOOL_REQUIRE_WORKER to allow the skip."
  );
}

afterEach(() => __setBlenderRunnerForTesting(null));

describe.skipIf(workerUrl === "")("WorkerBlenderRunner real worker round-trip", () => {
  it("runs RenderImage through the configured worker", async () => {
    __setBlenderRunnerForTesting(new WorkerBlenderRunner());
    const node = new RenderImageNode();
    node.model = triangleModelProp();
    node.camera_mode = "orbit";
    node.lighting = "flat";
    node.engine = "eevee";
    node.samples = 1;
    node.width = 64;
    node.height = 64;
    node.timeout = 300;

    const result = await node.process();
    const image = new Uint8Array(Buffer.from(result.image.data, "base64"));

    expect(hasPngSignature(image)).toBe(true);
    expect(pngSize(image)).toEqual({ width: 64, height: 64 });
  }, 300_000);
});
