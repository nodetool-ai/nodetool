/**
 * Cancellation inside the motion-blur loop (A5.7).
 *
 * The signal was checked once per frame, so a cancel arriving during a
 * 32-sample frame still paid for 32 scene resolutions and 32 decodes before
 * anything noticed. The fake signal below flips after the loop's second read,
 * which is inside frame 0's samples: with a per-sample check the render throws
 * before it composites anything, and with the old per-frame check frame 0
 * would have finished and composited once.
 */
import { describe, expect, it, vi } from "vitest";
import type { TimelineSequence } from "@nodetool-ai/timeline";

const composites: number[] = [];

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
    async renderFrameSamples(): Promise<Uint8Array> {
      composites.push(1);
      return new Uint8Array(this.width * this.height * 4);
    }
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

function sequence(): TimelineSequence {
  return {
    id: "seq",
    name: "Moving",
    width: 32,
    height: 16,
    fps: 25,
    durationMs: 200,
    tracks: [{ id: "t1", type: "video", index: 0, visible: true }],
    clips: [
      {
        id: "c1",
        trackId: "t1",
        name: "Card",
        startMs: 0,
        durationMs: 4000,
        mediaType: "text",
        status: "generated",
        textStyle: { text: "move", fontSize: 8, color: "#ffffff" },
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
    ],
    transcript: []
  } as unknown as TimelineSequence;
}

/** Aborted from the `flipAfter`-th read onward. */
function flakySignal(flipAfter: number): AbortSignal {
  let reads = 0;
  return {
    get aborted(): boolean {
      reads += 1;
      return reads > flipAfter;
    },
    addEventListener() {},
    removeEventListener() {}
  } as unknown as AbortSignal;
}

describe("render cancellation", () => {
  it("stops inside a frame's samples, not after them", async () => {
    composites.length = 0;
    const os = await import("node:os");
    const outPath = `${os.tmpdir()}/abort-${Date.now()}.zip`;
    await expect(
      renderTimelineComposited({
        sequence: sequence(),
        width: 32,
        height: 16,
        fps: 25,
        durationMs: 200,
        resolveAssetPath: async () => null,
        outPath,
        output: resolveTimelineOutput({
          format: "png_sequence",
          alpha: false,
          motionBlurSamples: 8,
          shutterAngle: 180
        }),
        signal: flakySignal(2)
      } as never)
    ).rejects.toThrow(/abort|cancel/i);
    expect(composites).toHaveLength(0);
    await (await import("node:fs")).promises.rm(outPath, { force: true });
  });
});
