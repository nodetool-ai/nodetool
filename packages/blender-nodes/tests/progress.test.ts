/**
 * Progress: `Fra:` lines become `node_progress` messages.
 *
 * The runner half (`Fra:` stderr line → `onProgress`) is pinned in
 * `runner.test.ts` against the fake Blender script. This suite pins the
 * node half (`onProgress` → `context.postMessage`), the way the ComfyUI
 * node reports progress: a fake runner replays the `Fra:1..3` sequence of
 * a three-frame animation, and the test reads the `node_progress` messages
 * back off the context.
 */

import { afterEach, describe, expect, it } from "vitest";

import type {
  BlenderJob,
  BlenderRunOptions,
  BlenderRunner,
  BlenderRunResult
} from "../src/runner.js";
import { __setBlenderRunnerForTesting } from "../src/run-job.js";
import { RenderAnimationNode } from "../src/nodes/render-animation.js";
import { blenderTestContext } from "./context.js";
import { triangleModelProp } from "./fixtures.js";

const MP4_BYTES = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);

/** Replays the `Fra:1..3` of a three-frame animation through `onProgress`. */
class FraReplayingRunner implements BlenderRunner {
  readonly kind = "local" as const;

  async run(
    job: BlenderJob,
    _inputs: Record<string, Uint8Array>,
    options: BlenderRunOptions
  ): Promise<BlenderRunResult> {
    for (const frame of [1, 2, 3]) {
      options.onProgress?.(frame, 3);
    }
    const outputs: Record<string, Uint8Array> = {};
    for (const name of Object.keys(job.outputs)) outputs[name] = MP4_BYTES;
    return {
      outputs,
      stats: { blender_version: "5.2.0-test", render_seconds: 0.3, frames: 3 }
    };
  }
}

afterEach(() => {
  __setBlenderRunnerForTesting(null);
});

describe("Blender node progress", () => {
  it("Fra: lines produce the expected node_progress sequence", async () => {
    __setBlenderRunnerForTesting(new FraReplayingRunner());
    const { context, cleanup } = blenderTestContext();
    try {
      const node = new RenderAnimationNode();
      node.model = triangleModelProp();
      node.__node_id = "progress-node";
      node.frame_start = 1;
      node.frame_end = 3;
      await node.process(context);
      const progress = context
        .getMessages()
        .filter((msg) => msg.type === "node_progress")
        .map((msg) => {
          expect(msg.type).toBe("node_progress");
          if (msg.type !== "node_progress") throw new Error("unreachable");
          return [msg.node_id, msg.progress, msg.total];
        });
      expect(progress).toEqual([
        ["progress-node", 1, 3],
        ["progress-node", 2, 3],
        ["progress-node", 3, 3]
      ]);
    } finally {
      cleanup();
    }
  });

  it("stays silent without a context", async () => {
    // No context means no postMessage target: the run still succeeds.
    __setBlenderRunnerForTesting(new FraReplayingRunner());
    const node = new RenderAnimationNode();
    node.model = triangleModelProp();
    const result = await node.process();
    expect(result.video.data).toBe(Buffer.from(MP4_BYTES).toString("base64"));
  });
});
