/**
 * Two-clip transitions on the GPU path (F6, T11).
 *
 * The same document, the same scene model and the same two assertions the
 * Canvas 2D suite makes in `packages/agents/tests/timeline-transition-frames.test.ts`
 * — mid-`push` the frame is half each clip, mid-`dipToColor` it is the colour.
 * Two compositors drawing one cut differently is the failure this pins (AS1),
 * and only pixels off a real device can say they do not.
 *
 * A missing WebGPU adapter skips the suite and says why. On headless Linux that
 * means no Vulkan ICD — see AGENTS.md § WebGPU on a headless machine, which
 * installs lavapipe (CI does exactly that on the test-packages leg).
 */
import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/index.js";
import type { ClipTransition, TimelineClip } from "../src/index.js";
import { computeActiveLayers, trackZ } from "../src/render/sceneModel.js";
import {
  HeadlessFrameCompositor,
  type FrameLayer
} from "../src/render/frameCompositor.js";

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
      `render.transition.gpu: skipping every case — no WebGPU device. ${reason}\n`
    );
    return reason;
  }
})();

const SIZE = 64;
const CUT_START = 800;
const CUT_MS = 400;
const MID = CUT_START + CUT_MS / 2;

const track = makeTrack({ id: "track-0", type: "video", index: 0, visible: true });

const clip = (
  id: string,
  startMs: number,
  transitionIn?: ClipTransition
): TimelineClip =>
  makeClip({
    id,
    trackId: track.id,
    name: id,
    status: "generated",
    currentAssetId: `asset-${id}`,
    mediaType: "video",
    startMs,
    durationMs: 1200,
    ...(transitionIn ? { transitionIn } : {})
  });

/** A frame-sized opaque source in one colour. */
function solid(r: number, g: number, b: number): FrameLayer["source"] {
  const rgba = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, width: SIZE, height: SIZE, version: `${r}-${g}-${b}` };
}

const SOURCES: Record<string, FrameLayer["source"]> = {
  blue: solid(0, 0, 255),
  red: solid(255, 0, 0)
};

/** The frame a red clip cutting in over a blue one produces at `timeMs`. */
async function cutFrame(
  transition: ClipTransition,
  timeMs = MID
): Promise<Uint8Array> {
  const clips = [clip("blue", 0), clip("red", CUT_START, transition)];
  const canvas = { width: SIZE, height: SIZE };
  const layers: FrameLayer[] = computeActiveLayers(
    [track],
    clips,
    timeMs,
    { canvas }
  ).map((layer) => ({
    id: layer.clipId,
    source: SOURCES[layer.clipId]!,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    // Two clips on one track share a z; the scene model already ordered them
    // by start time, and the compositor's sort is stable.
    zIndex: trackZ(layer.trackIndex),
    transform: layer.transform,
    transition: layer.transition
  }));

  const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
  const device = await getNodeGPUDevice();
  const compositor = new HeadlessFrameCompositor(device, SIZE, SIZE);
  try {
    return await compositor.renderFrame(layers);
  } finally {
    compositor.dispose();
  }
}

/** The RGB of one pixel of a straight-alpha RGBA8 frame. */
function pixelAt(
  rgba: Uint8Array,
  x: number,
  y: number
): [number, number, number] {
  const i = (y * SIZE + x) * 4;
  return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!];
}

describe.runIf(noAdapterReason === null)(
  "HeadlessFrameCompositor — two-clip transitions",
  () => {
    it("push shows half the incoming clip and half the outgoing one", async () => {
      const frame = await cutFrame({
        type: "push",
        durationMs: CUT_MS,
        direction: "left"
      });

      const [lr, , lb] = pixelAt(frame, 8, SIZE / 2);
      const [rr, , rb] = pixelAt(frame, SIZE - 8, SIZE / 2);
      expect(lr).toBeGreaterThan(200);
      expect(lb).toBeLessThan(50);
      expect(rb).toBeGreaterThan(200);
      expect(rr).toBeLessThan(50);
    });

    it("dipToColor is the colour at the midpoint, and neither clip", async () => {
      const frame = await cutFrame({
        type: "dipToColor",
        durationMs: CUT_MS,
        color: "#00ff00"
      });

      for (const x of [4, SIZE / 2, SIZE - 4]) {
        const [r, g, b] = pixelAt(frame, x, SIZE / 2);
        expect(g).toBeGreaterThan(240);
        expect(r).toBeLessThan(12);
        expect(b).toBeLessThan(12);
      }
    });

    it("wipe reveals the incoming clip over an outgoing one that holds", async () => {
      const frame = await cutFrame({
        type: "wipe",
        durationMs: CUT_MS,
        direction: "left",
        softness: 0
      });
      expect(pixelAt(frame, 8, SIZE / 2)[0]).toBeGreaterThan(200);
      expect(pixelAt(frame, SIZE - 8, SIZE / 2)[2]).toBeGreaterThan(200);
    });

    it("crossfade blends the two rather than moving either", async () => {
      const frame = await cutFrame({ type: "crossfade", durationMs: CUT_MS });
      for (const x of [4, SIZE / 2, SIZE - 4]) {
        const [r, , b] = pixelAt(frame, x, SIZE / 2);
        expect(r).toBeGreaterThan(100);
        expect(r).toBeLessThan(160);
        expect(b).toBeGreaterThan(100);
        expect(b).toBeLessThan(160);
      }
    });
  }
);
