/**
 * T4: `render_animation` through the real Blender, plus ffprobe/ffmpeg.
 *
 * Skipped when Blender is absent (like `model3d-render.test.ts` without
 * Chrome) or when ffprobe/ffmpeg are absent: frame counts and per-frame
 * pixels need a decoder, and the package itself needs neither (D5). The
 * orbit case asserts the MP4 decodes with the expected frame count for the
 * range and fps, and that the sweep differs frame to frame. The glTF case
 * pins the D4 timestamp mapping: a translation of +2 in x over t in
 * [0, 1] at fps 2 puts the end pose exactly on frame 2, so the bright
 * centroid travels tens of pixels — a 24 fps import would move it ~6.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BlenderOp, RenderAnimationParams } from "../src/job.js";
import { runBlenderJob } from "../src/run-job.js";
import { RenderAnimationNode } from "../src/nodes/render-animation.js";
import { blenderAvailable, failWhenBlenderRequired } from "./blender-available.js";

failWhenBlenderRequired();
failWhenFfmpegRequired();
import { blenderTestContext, type BlenderTestContext } from "./context.js";
import { createAnimatedGlb, triangleModelProp } from "./fixtures.js";
import {
  brightCentroidX,
  extractFrame,
  failWhenFfmpegRequired,
  ffmpegAvailable,
  meanAbsDiff,
  probeVideo
} from "./video.js";

function animationOp(overrides: Record<string, unknown> = {}): BlenderOp {
  return {
    op: "render_animation",
    params: {
      camera_mode: "orbit",
      azimuth: 45,
      elevation: 25,
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
      width: 160,
      height: 120,
      frame_start: 1,
      frame_end: 5,
      fps: 24,
      orbit_degrees: 90,
      ...overrides
    } as unknown as RenderAnimationParams
  };
}

const shouldRun = blenderAvailable() && ffmpegAvailable();

describe.skipIf(!shouldRun)("render_animation integration", () => {
  let helper: BlenderTestContext | null = null;

  beforeEach(() => {
    helper = blenderTestContext();
  });

  afterEach(() => {
    helper?.cleanup();
    helper = null;
  });

  it("renders an orbit sweep with the expected frame count that differs frame to frame", async () => {
    const node = new RenderAnimationNode();
    node.model = triangleModelProp();
    node.__node_id = "anim-node";
    node.width = 160;
    node.height = 120;
    node.frame_start = 1;
    node.frame_end = 5;
    node.fps = 24;
    node.orbit_degrees = 90;
    const result = await node.process(helper!.context);

    expect(result.video.type).toBe("video");
    const mp4 = Buffer.from(result.video.data, "base64");
    // An MP4 box: 4-byte big-endian size, then the `ftyp` type tag.
    expect(mp4[4]).toBe(0x66);
    expect(mp4[5]).toBe(0x74);
    expect(mp4[6]).toBe(0x79);
    expect(mp4[7]).toBe(0x70);

    const progress = helper!.context
      .getMessages()
      .filter((msg) => msg.type === "node_progress");
    expect(progress).toHaveLength(5);

    // Re-run through runBlenderJob for the byte-level probe (the node
    // already proved the same job above).
    const probed = await runBlenderJob(
      helper!.context,
      Buffer.from(triangleModelProp().data, "base64"),
      animationOp({}),
      { video: "anim.mp4" },
      { timeoutMs: 300_000 }
    );
    const dir = mkdtempSync(join(tmpdir(), "blender-anim-"));
    try {
      const file = join(dir, "anim.mp4");
      writeFileSync(file, probed.outputs["video"]!);
      const probe = probeVideo(file);
      expect(probe.frames).toBe(5);
      expect(probe.fps).toBeCloseTo(24, 0);
      expect(probe.codec).toBe("h264");
      expect(probe.pixFmt).toBe("yuv420p");
      expect(probe.width).toBe(160);
      expect(probe.height).toBe(120);
      const first = extractFrame(file, 0);
      const last = extractFrame(file, 4);
      expect(meanAbsDiff(first, last)).toBeGreaterThan(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);

  it("maps a glTF animation timestamp t onto frame round(t * fps)", async () => {
    const result = await runBlenderJob(
      helper!.context,
      createAnimatedGlb(),
      animationOp({ frame_start: 0, frame_end: 2, fps: 2, orbit_degrees: 0 }),
      { video: "anim.mp4" },
      { timeoutMs: 300_000 }
    );
    expect(result.stats.frames).toBe(3);
    const dir = mkdtempSync(join(tmpdir(), "blender-anim-"));
    try {
      const file = join(dir, "anim.mp4");
      writeFileSync(file, result.outputs["video"]!);
      const probe = probeVideo(file);
      expect(probe.frames).toBe(3);
      expect(probe.fps).toBeCloseTo(2, 0);
      const first = extractFrame(file, 0);
      const last = extractFrame(file, 2);
      // The end pose (+2 in x) substantially differs from the start pose.
      expect(meanAbsDiff(first, last)).toBeGreaterThan(5);
      // The centroid travels tens of pixels: at fps 2 the end pose lands
      // exactly on frame 2, while a 24 fps import would move it ~6 px.
      expect(brightCentroidX(last) - brightCentroidX(first)).toBeGreaterThan(20);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);
});
