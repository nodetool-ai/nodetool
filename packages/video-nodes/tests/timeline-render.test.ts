/**
 * `renderTimelineComposited` driving the real GPU compositor.
 *
 * `timeline-composite.test.ts` mocks this function to test the node around it;
 * this one runs it. The fixture is a text clip over a solid shape, so nothing
 * has to be decoded — the frames come from the rasterizer and the compositor,
 * which is what needs a WebGPU device. The encoder is the one seam that is
 * faked: it counts frames instead of spawning ffmpeg, because what is under
 * test is the frame loop's progress reporting and cancellation, not muxing.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux that
 * means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine, which
 * installs lavapipe (CI does exactly that on the test-packages leg).
 */
import { describe, it, expect, vi } from "vitest";
import type { TimelineSequence } from "@nodetool-ai/timeline";

/** Frames the fake encoder accepted, per render. */
let framesWritten = 0;

vi.mock("../src/nodes/timeline/rawFrames.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    openFrameEncoder: () => ({
      write: async () => {
        framesWritten++;
      },
      finish: async () => {},
      abort: () => {}
    })
  };
});

const { renderTimelineComposited } = await import(
  "../src/nodes/timeline/compositeRender.js"
);

/**
 * Probed at module load, not in `beforeAll` — vitest decides `describe.runIf`
 * while collecting, which is before any hook has run.
 */
const noAdapterReason = await (async (): Promise<string | null> => {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    await getNodeGPUDevice();
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // Straight to stderr: this runs while vitest is collecting, where a
    // console.* call is swallowed rather than reported.
    process.stderr.write(
      `timeline-render: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const FPS = 10;
const DURATION_MS = 2000;
/** 20 frames: enough that a mid-render abort lands well short of the end. */
const TOTAL_FRAMES = (DURATION_MS / 1000) * FPS;

/** A text clip over a solid shape — two layers, no media to decode. */
function fixture(): TimelineSequence {
  return {
    id: "seq-render",
    name: "Render fixture",
    width: 320,
    height: 180,
    fps: FPS,
    durationMs: DURATION_MS,
    tracks: [
      { id: "t-text", type: "overlay", index: 0, visible: true },
      { id: "t-shape", type: "video", index: 1, visible: true }
    ],
    clips: [
      {
        id: "clip-text",
        trackId: "t-text",
        name: "Title",
        startMs: 0,
        durationMs: DURATION_MS,
        mediaType: "text",
        sourceType: "generated",
        textStyle: { text: "Hello", fontSizePx: 32, color: "#ffffff" }
      },
      {
        id: "clip-shape",
        trackId: "t-shape",
        name: "Card",
        startMs: 0,
        durationMs: DURATION_MS,
        mediaType: "shape",
        sourceType: "generated",
        shapeStyle: {
          kind: "rect",
          fill: "#1e3a8a",
          x: 0.1,
          y: 0.1,
          width: 0.8,
          height: 0.8
        }
      }
    ]
  } as TimelineSequence;
}

function render(overrides: {
  onProgress?: (frame: number, totalFrames: number) => void;
  signal?: AbortSignal;
}) {
  return renderTimelineComposited({
    sequence: fixture(),
    width: 320,
    height: 180,
    fps: FPS,
    durationMs: DURATION_MS,
    resolveAssetPath: async () => null,
    // Never opened: the encoder above is a counter, not ffmpeg.
    outPath: "unused.mp4",
    ...overrides
  });
}

describe.runIf(!noAdapterReason)("renderTimelineComposited", () => {
  it("reports every frame in order, ending at the total", async () => {
    framesWritten = 0;
    const progress: Array<[number, number]> = [];
    const result = await render({
      onProgress: (frame, total) => progress.push([frame, total])
    });

    expect(result.totalFrames).toBe(TOTAL_FRAMES);
    expect(framesWritten).toBe(TOTAL_FRAMES);
    expect(progress.map(([frame]) => frame)).toEqual(
      Array.from({ length: TOTAL_FRAMES }, (_, i) => i + 1)
    );
    expect(progress.every(([, total]) => total === TOTAL_FRAMES)).toBe(true);
  }, 120_000);

  it("stops on an already-aborted signal before compositing a frame", async () => {
    framesWritten = 0;
    const controller = new AbortController();
    controller.abort();

    await expect(render({ signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError"
    });
    expect(framesWritten).toBe(0);
  }, 120_000);

  it("stops mid-render when the signal aborts, short of totalFrames", async () => {
    framesWritten = 0;
    const controller = new AbortController();
    const progress: number[] = [];

    await expect(
      render({
        signal: controller.signal,
        onProgress: (frame) => {
          progress.push(frame);
          if (frame === 3) controller.abort();
        }
      })
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(progress).toEqual([1, 2, 3]);
    expect(framesWritten).toBeLessThan(TOTAL_FRAMES);
  }, 120_000);
});
