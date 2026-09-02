/**
 * Masks and mattes through the whole server render path (F7, T12).
 *
 * `packages/timeline`'s GPU suite feeds the compositor coverage buffers it
 * built itself; this one starts from a document, so the wiring in between is
 * what is under test: `computeActiveLayers` diverting a matte source,
 * `NodeRasterizer.mask` rasterizing the clip's mask at the layer's own size,
 * and `compositeRender` handing both to the compositor. A mask that never
 * reached the GPU would pass every unit test and render an uncut frame.
 *
 * The encoder is the one seam that is faked: it keeps the composited frames
 * instead of spawning ffmpeg, which is what makes the pixels readable here.
 *
 * A missing WebGPU adapter skips the suite and says why — see AGENTS.md
 * § WebGPU on a headless machine.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TimelineClip, TimelineSequence } from "@nodetool-ai/timeline";

/** Every frame the render handed the encoder, straight-alpha RGBA8. */
let frames: Uint8Array[] = [];

vi.mock("../src/nodes/timeline/rawFrames.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    openFrameEncoder: () => ({
      write: async (rgba: Uint8Array) => {
        frames.push(rgba);
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
    process.stderr.write(
      `timeline-mask.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const WIDTH = 160;
const HEIGHT = 90;

const shape = (
  id: string,
  fill: string,
  trackId: string,
  over: Partial<TimelineClip> = {}
): TimelineClip => ({
  id,
  trackId,
  name: id,
  startMs: 0,
  durationMs: 1000,
  mediaType: "shape",
  sourceType: "generated",
  status: "generated",
  locked: false,
  versions: [],
  shapeStyle: { kind: "rect", fill, x: 0, y: 0, width: 1, height: 1 },
  ...over
});

function sequence(clips: TimelineClip[]): TimelineSequence {
  return {
    id: "seq-mask",
    projectId: "proj-1",
    name: "Mask fixture",
    fps: 10,
    width: WIDTH,
    height: HEIGHT,
    durationMs: 100,
    tracks: [
      {
        id: "t0",
        name: "V1",
        type: "video",
        index: 0,
        visible: true,
        locked: false
      },
      {
        id: "t1",
        name: "V2",
        type: "video",
        index: 1,
        visible: true,
        locked: false
      }
    ],
    clips,
    markers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function renderOneFrame(clips: TimelineClip[]): Promise<Uint8Array> {
  await renderTimelineComposited({
    sequence: sequence(clips),
    width: WIDTH,
    height: HEIGHT,
    fps: 10,
    durationMs: 100,
    resolveAssetPath: async () => null,
    outPath: "/dev/null"
  });
  expect(frames).toHaveLength(1);
  return frames[0]!;
}

function pixelAt(
  rgba: Uint8Array,
  x: number,
  y: number
): [number, number, number] {
  const i = (y * WIDTH + x) * 4;
  return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!];
}

describe.runIf(noAdapterReason === null)(
  "renderTimelineComposited — masks and mattes",
  () => {
    beforeEach(() => {
      frames = [];
    });

    it("cuts a clip to its ellipse mask", async () => {
      const frame = await renderOneFrame([
        shape("red", "#ff0000", "t0", { mask: { kind: "ellipse" } })
      ]);

      expect(pixelAt(frame, WIDTH / 2, HEIGHT / 2)[0]).toBeGreaterThan(240);
      expect(pixelAt(frame, 2, 2)[0]).toBeLessThan(12);
      expect(pixelAt(frame, WIDTH - 3, HEIGHT - 3)[0]).toBeLessThan(12);
    });

    it("reads an inverted path mask the other way round", async () => {
      const frame = await renderOneFrame([
        shape("red", "#ff0000", "t0", {
          mask: {
            kind: "path",
            d: "M 0.5 0.05 L 0.95 0.5 L 0.5 0.95 L 0.05 0.5 Z",
            invert: true
          }
        })
      ]);

      expect(pixelAt(frame, WIDTH / 2, HEIGHT / 2)[0]).toBeLessThan(12);
      expect(pixelAt(frame, 2, 2)[0]).toBeGreaterThan(240);
    });

    it("mattes one clip with another, and the source never draws itself", async () => {
      // The source sits on the track *above* the layer it drives, so if it
      // drew it would cover the pixels the matte reveals — green anywhere on
      // the frame means the diversion did not happen.
      const frame = await renderOneFrame([
        shape("red", "#ff0000", "t1", {
          matte: { sourceClipId: "key", mode: "alpha" }
        }),
        shape("key", "#00ff00", "t0", {
          shapeStyle: {
            kind: "rect",
            fill: "#00ff00",
            x: 0,
            y: 0,
            width: 0.5,
            height: 1
          }
        })
      ]);

      const [lr, lg] = pixelAt(frame, 4, HEIGHT / 2);
      expect(lr).toBeGreaterThan(240);
      expect(lg).toBeLessThan(12);
      const [rr, rg] = pixelAt(frame, WIDTH - 5, HEIGHT / 2);
      expect(rr).toBeLessThan(12);
      expect(rg).toBeLessThan(12);
    });
  }
);
