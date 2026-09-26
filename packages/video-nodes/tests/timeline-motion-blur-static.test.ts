/**
 * The static early-out in the server render loop (A5.2).
 *
 * A held image at 8 samples per frame averages 8 copies of one picture: 8×
 * the decode and 8× the composite for the frame it already had. The
 * compositor and the GPU device are faked, so what this measures is the
 * sampling decision and nothing else — and the moving case proves the check
 * can still say "not static".
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TimelineSequence } from "@nodetool-ai/timeline";

const sampleCounts: number[] = [];

vi.mock("@nodetool-ai/gpu/node", () => ({
  getNodeGPUDevice: async () => ({}) as unknown
}));

vi.mock("@nodetool-ai/timeline/render", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  class FakeCompositor {
    constructor(
      _device: unknown,
      private width: number,
      private height: number
    ) {}
    async renderFrameSamples(samples: unknown[]): Promise<Uint8Array> {
      sampleCounts.push(samples.length);
      return new Uint8Array(this.width * this.height * 4);
    }
    setReferenceSize(): void {}
    dispose(): void {}
  }
  return { ...original, HeadlessFrameCompositor: FakeCompositor };
});

const { renderTimelineComposited } = await import(
  "../src/nodes/timeline/compositeRender.js"
);
const { resolveTimelineOutput } = await import(
  "../src/nodes/timeline/outputFormats.js"
);

const WIDTH = 32;
const HEIGHT = 16;
const FPS = 25;

function sequence(animated: boolean, movingCamera = false): TimelineSequence {
  return {
    id: "seq",
    name: "Static",
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    durationMs: 80,
    ...(movingCamera ? { camera2d: { position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 1000, keyframes: [
      { timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0 },
      { timeMs: 1000, position: { x: 100, y: 0 }, depthPx: 0 }
    ] } } : {}),
    tracks: [{ id: "t1", type: "video", index: 0, visible: true }],
    clips: [
      {
        id: "clip-1",
        trackId: "t1",
        name: "Card",
        startMs: 0,
        durationMs: 4000,
        mediaType: "text",
        status: "generated",
        textStyle: { text: "hold", fontSize: 12, color: "#ffffff" },
        ...(animated
          ? {
              animations: [
                {
                  id: "a1",
                  role: "in",
                  preset: "slide",
                  durationMs: 2000,
                  easing: "linear"
                }
              ]
            }
          : {})
      }
    ],
    transcript: []
  } as unknown as TimelineSequence;
}

async function render(animated: boolean, movingCamera = false): Promise<void> {
  const outPath = `${await import("node:os").then((m) => m.tmpdir())}/mb-${animated}-${Date.now()}.zip`;
  await renderTimelineComposited({
    sequence: sequence(animated, movingCamera),
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    durationMs: 80,
    resolveAssetPath: async () => null,
    outPath,
    output: resolveTimelineOutput({
      format: "png_sequence",
      alpha: false,
      motionBlurSamples: 8,
      shutterAngle: 180
    })
  } as never);
  await (await import("node:fs")).promises.rm(outPath, { force: true });
}

beforeEach(() => {
  sampleCounts.length = 0;
});

describe("motion blur — static frames", () => {
  it("composites a still document once per frame at 8 samples", async () => {
    await render(false);
    expect(sampleCounts.length).toBeGreaterThan(0);
    expect(sampleCounts.every((n) => n === 1)).toBe(true);
  });

  it("still takes all 8 samples while an animation is in flight", async () => {
    await render(true);
    expect(sampleCounts.every((n) => n === 8)).toBe(true);
  });

  it("takes all 8 samples when a camera moves over a still", async () => {
    await render(false, true);
    expect(sampleCounts.length).toBeGreaterThan(0);
    expect(sampleCounts.every((n) => n === 8)).toBe(true);
  });

  it("does not sample early animated frames for blur requested by a later clip", async () => {
    const doc = sequence(true);
    doc.clips[0].durationMs = 80;
    doc.clips.push({
      ...doc.clips[0],
      id: "clip-2",
      startMs: 80,
      motionBlur: { samplesPerFrame: 8, shutterAngle: 180 }
    });
    const outPath = `${await import("node:os").then((m) => m.tmpdir())}/mb-later-${Date.now()}.zip`;
    try {
      await renderTimelineComposited({
        sequence: doc,
        width: WIDTH,
        height: HEIGHT,
        fps: FPS,
        durationMs: 160,
        resolveAssetPath: async () => null,
        outPath,
        output: resolveTimelineOutput({ format: "png_sequence", alpha: false })
      });
    } finally {
      await (await import("node:fs")).promises.rm(outPath, { force: true });
    }
    expect(sampleCounts).toEqual([1, 1, 8, 8]);
  });
});
