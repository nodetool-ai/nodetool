/**
 * `render_model3d_reference` through the `edit_timeline` capability, with the
 * real headless three.js host and the real in-process encoder.
 *
 * The set is built with `@nodetool-ai/model3d` operations: a ground slab, a
 * box and a standing figure. The assertions read frames back out of the
 * stored MP4, so they cover the render, the encode and the asset write
 * together. Skipped when no Chrome is installed, under the same gate the
 * other headless 3D suites use.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ModelObserver, initTestDb } from "@nodetool-ai/models";
import {
  applyOperations,
  createModel3DFile,
  parseOperation,
  serializeModel3D
} from "@nodetool-ai/model3d";
import {
  computeModel3DReferenceHash,
  model3dReferenceSize,
  model3dReferenceStatus,
  type TimelineClip
} from "@nodetool-ai/timeline";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { inspectMedia, readRgbaFrames } from "@nodetool-ai/runtime/media/testing";

import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { withGenerationSeam } from "./_helpers/generation-seam.js";

const USER = "u-reference";
const FPS = 10;
const SEQUENCE = { fps: FPS, width: 320, height: 180 };

function chromeBinary(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

const chromePath = chromeBinary();

/** A small set: a ground slab, a crate and a standing figure. */
function blockoutSet(): Uint8Array {
  const file = createModel3DFile("Set");
  applyOperations(
    file,
    [
      { op: "add_object", kind: "box", name: "Ground", position: [0, -0.05, 0] },
      { op: "set_transform", target: "Ground", scale: [8, 0.1, 8] },
      { op: "add_object", kind: "box", name: "Crate", position: [1.4, 0.4, -0.5] },
      { op: "set_transform", target: "Crate", scale: [0.8, 0.8, 0.8] },
      { op: "add_object", kind: "figure", name: "Ana", body: "female", pose: "stand", position: [0, 0, 0] }
    ].map(parseOperation)
  );
  return serializeModel3D(file);
}

interface Harness {
  context: ProcessingContext;
  bytesOf: (assetId: string) => Uint8Array | undefined;
  scratch: string;
}

function harness(): Harness {
  const store = new Map<string, Uint8Array>();
  store.set("asset-set", blockoutSet());
  const scratch = mkdtempSync(join(tmpdir(), "nodetool-reference-test-"));
  let created = 0;
  const context = withGenerationSeam({
    userId: USER,
    getSetting: async () => null,
    workspace: { scratchDir: async () => scratch },
    hasModelInterface: () => true,
    resolveAssetBytes: async (uri: string) => ({
      bytes: store.get(uri.replace("asset://", "").replace(/\.[a-z0-9]+$/i, ""))
    }),
    createAsset: async (args: { content: Uint8Array }) => {
      // A generated resource id is 32 lowercase hex characters.
      const id = (++created).toString(16).padStart(32, "a");
      store.set(id, args.content);
      return { id };
    }
  }) as unknown as ProcessingContext;
  return { context, bytesOf: (id) => store.get(id), scratch };
}

/** Mean and spread of the colour channels over a frame. */
function frameStats(rgba: Uint8Array) {
  let r = 0;
  let g = 0;
  let b = 0;
  let min = 255;
  let max = 0;
  const pixels = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) {
    r += rgba[i]!;
    g += rgba[i + 1]!;
    b += rgba[i + 2]!;
    const luma = (rgba[i]! + rgba[i + 1]! + rgba[i + 2]!) / 3;
    min = Math.min(min, luma);
    max = Math.max(max, luma);
  }
  return { r: r / pixels, g: g / pixels, b: b / pixels, min, max };
}

/** Largest gap between colour channels over a frame: 0 for a grey picture. */
function maxChroma(rgba: Uint8Array): number {
  let worst = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const hi = Math.max(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
    const lo = Math.min(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
    worst = Math.max(worst, hi - lo);
  }
  return worst;
}

function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i]! - b[i]!);
  }
  return sum / (a.length / 4);
}

describe.skipIf(!chromePath)("render_model3d_reference through edit_timeline", () => {
  let bench: Harness;

  beforeEach(() => {
    process.env.CHROME_PATH = chromePath!;
    initTestDb();
    bench = harness();
  });

  afterEach(() => {
    ModelObserver.clear();
    rmSync(bench.scratch, { recursive: true, force: true });
  });

  const run = () =>
    createCapabilityRun({ context: bench.context, gate: UNGATED });

  /** A timeline with one free-camera clip of the set and a keyed push in. */
  async function timelineWithBlockout(): Promise<{
    timelineId: string;
    clipId: string;
  }> {
    const created = (await run().invoke("create_timeline", {
      name: "Blockout",
      ...SEQUENCE
    })) as { timeline_id: string };
    const added = (await run().invoke("edit_timeline", {
      timeline_id: created.timeline_id,
      ops: [
        {
          op: "add_model3d_clip",
          assetId: "asset-set",
          durationMs: 500,
          style: {
            camera: {
              mode: "free",
              position: [0.5, 1.5, 5],
              target: [0.3, 0.9, 0],
              fovDeg: 40
            },
            // Choices a reference must ignore.
            lighting: "flat",
            background: { transparent: false, color: "#ff0000" }
          }
        }
      ]
    })) as { failed: number; ops: Array<{ result?: { clip?: { id: string } } }> };
    expect(added.failed).toBe(0);
    const clipId = added.ops[0]!.result!.clip!.id;
    const moved = (await run().invoke("edit_timeline", {
      timeline_id: created.timeline_id,
      ops: [
        { op: "apply_model3d_camera_move", target: clipId, move: "pushIn", amount: 0.4 }
      ]
    })) as { failed: number };
    expect(moved.failed).toBe(0);
    return { timelineId: created.timeline_id, clipId };
  }

  const clipOf = async (timelineId: string): Promise<TimelineClip> => {
    const read = (await run().invoke("get_timeline", {
      timeline_id: timelineId
    })) as { timeline: { clips: TimelineClip[] } };
    return read.timeline.clips[0]!;
  };

  async function renderPass(
    timelineId: string,
    clipId: string,
    pass: "clay" | "depth" | "normal"
  ) {
    const out = (await run().invoke("edit_timeline", {
      timeline_id: timelineId,
      ops: [{ op: "render_model3d_reference", target: clipId, pass }]
    })) as {
      failed: number;
      ops: Array<{
        ok: boolean;
        error?: string;
        result?: {
          referenceRendered?: boolean;
          cameraMove?: string;
          reference?: { assetId: string; dependencyHash: string; pass: string };
        };
      }>;
    };
    expect(out.ops[0]?.error).toBeUndefined();
    expect(out.failed).toBe(0);
    return out.ops[0]!.result!;
  }

  async function framesOf(assetId: string): Promise<Uint8Array[]> {
    const bytes = bench.bytesOf(assetId);
    expect(bytes?.length ?? 0).toBeGreaterThan(1000);
    const file = join(bench.scratch, `${assetId}.mp4`);
    writeFileSync(file, bytes!);
    const report = await inspectMedia(file);
    expect(report.video?.codec).toBe("avc");
    return readRgbaFrames(file, model3dReferenceSize(SEQUENCE));
  }

  it(
    "stores a grey shaded clay video and a different depth video",
    async () => {
      const { timelineId, clipId } = await timelineWithBlockout();

      const clay = await renderPass(timelineId, clipId, "clay");
      expect(clay.referenceRendered).toBe(true);
      expect(clay.cameraMove).toBe("The camera pushes in quickly.");
      const clip = await clipOf(timelineId);
      const reference = clip.model3dStyle?.reference;
      expect(reference).toEqual(clay.reference);
      expect(reference?.pass).toBe("clay");
      // The full asset id reaches the clip, as the host stored it.
      expect(reference?.assetId).toMatch(/^[0-9a-f]{32}$/);
      expect(reference?.dependencyHash).toBe(
        computeModel3DReferenceHash(clip, SEQUENCE, "clay")
      );
      expect(model3dReferenceStatus(clip, SEQUENCE)).toBe("current");
      // The clip itself still draws its glTF.
      expect(clip.currentAssetId).toBe("asset-set");

      const clayFrames = await framesOf(reference!.assetId);
      // 500 ms at 10 fps is five frames.
      expect(clayFrames).toHaveLength(5);
      const first = clayFrames[0]!;
      const stats = frameStats(first);
      // Grey: the channels agree, on every pixel within codec tolerance. The
      // clip's red background is not in the picture.
      expect(Math.abs(stats.r - stats.g)).toBeLessThan(3);
      expect(Math.abs(stats.g - stats.b)).toBeLessThan(3);
      expect(maxChroma(first)).toBeLessThan(24);
      // Shaded and non-empty: a lit set spans a range of greys, where an
      // empty frame is one flat colour.
      expect(stats.max - stats.min).toBeGreaterThan(60);
      // The camera pushes in, so the last frame differs from the first.
      expect(meanAbsDiff(first, clayFrames[4]!)).toBeGreaterThan(2);

      const depth = await renderPass(timelineId, clipId, "depth");
      expect(depth.referenceRendered).toBe(true);
      expect(depth.reference?.pass).toBe("depth");
      expect(depth.reference?.assetId).not.toBe(reference!.assetId);
      const depthFrames = await framesOf(depth.reference!.assetId);
      expect(depthFrames).toHaveLength(5);
      const depthStats = frameStats(depthFrames[0]!);
      expect(depthStats.max - depthStats.min).toBeGreaterThan(60);
      expect(meanAbsDiff(first, depthFrames[0]!)).toBeGreaterThan(10);

      // A second call for the stored pass renders nothing.
      const again = await renderPass(timelineId, clipId, "depth");
      expect(again.referenceRendered).toBe(false);
      expect(again.reference).toEqual(depth.reference);
    },
    180_000
  );
});
