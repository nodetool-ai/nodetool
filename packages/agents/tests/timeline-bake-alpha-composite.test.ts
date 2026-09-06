/**
 * T13: an alpha bake composites over what is under it (§D6 output format).
 *
 * The point of encoding a transparent bake as WebM VP9 `yuva420p` rather than
 * MP4 is that the pixels the model does not cover stay out of the picture. So
 * this renders for real — `@napi-rs/canvas`, the shared Canvas 2D drawing
 * rules, a whole frame read back pixel by pixel — with a red card under a
 * baked 3D clip whose frame is a green square on a clear ground. If the alpha
 * were lost anywhere between the decoder and the composite, the corners would
 * come back black or green instead of red.
 *
 * The decoder is mocked because there is no ffmpeg here to make a real WebM
 * with; what it returns is the RGBA a VP9-with-alpha decode gives, which is
 * the input the composite has to honour.
 */

import { describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  computeModel3DBakeHash,
  DEFAULT_MODEL3D_STYLE,
  type TimelineClip,
  type TimelineSequence,
  type TimelineTrack
} from "@nodetool-ai/timeline";

const { forEachVideoFrame } = vi.hoisted(() => ({
  forEachVideoFrame:
    vi.fn<
      (
        bytes: Uint8Array,
        timestamps: readonly number[],
        onFrame: (frame: {
          width: number;
          height: number;
          rgba: Uint8Array;
        }) => void | Promise<void>
      ) => Promise<number>
    >()
}));

vi.mock("../src/analysis/media-decode.js", () => ({ forEachVideoFrame }));

import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

const W = 160;
const H = 90;
const FPS = 30;

const tracks: TimelineTrack[] = [
  // Track 0 draws over track 1 (`trackZ` counts down), so the bake is on top.
  {
    id: "track-3d",
    name: "3D",
    type: "overlay",
    index: 0,
    visible: true,
    locked: false
  },
  {
    id: "track-bg",
    name: "Background",
    type: "video",
    index: 1,
    visible: true,
    locked: false
  }
];

/** One frame of an alpha bake: an opaque green square on a clear ground. */
function bakeFrameRgba(): Uint8Array {
  const rgba = new Uint8Array(W * H * 4);
  const x0 = Math.floor(W * 0.25);
  const x1 = Math.floor(W * 0.75);
  const y0 = Math.floor(H * 0.25);
  const y1 = Math.floor(H * 0.75);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const at = (y * W + x) * 4;
      rgba[at + 1] = 255;
      rgba[at + 3] = 255;
    }
  }
  return rgba;
}

/** A 3D clip with a transparent style and a bake that still matches it. */
function transparentBakedClip(): TimelineClip {
  const clip: TimelineClip = {
    id: "cube",
    trackId: "track-3d",
    name: "Cube",
    startMs: 0,
    durationMs: 2000,
    mediaType: "model3d",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset-glb",
    model3dStyle: {
      ...DEFAULT_MODEL3D_STYLE,
      background: { transparent: true }
    }
  };
  clip.model3dStyle = {
    ...clip.model3dStyle!,
    bake: {
      assetId: "asset-bake",
      dependencyHash: computeModel3DBakeHash(clip, {
        fps: FPS,
        width: W,
        height: H
      })
    }
  };
  return clip;
}

/** A red card filling the frame, so any hole in the bake is visible. */
const background: TimelineClip = {
  id: "card",
  trackId: "track-bg",
  name: "Card",
  startMs: 0,
  durationMs: 2000,
  mediaType: "shape",
  sourceType: "generated",
  status: "generated",
  shapeStyle: { kind: "rect", fill: "#ff0000", x: 0, y: 0, width: 1, height: 1 }
} as TimelineClip;

function sequence(): TimelineSequence {
  return {
    id: "seq-alpha-bake",
    projectId: "proj-1",
    name: "Alpha bake over a card",
    fps: FPS,
    width: W,
    height: H,
    durationMs: 2000,
    tracks,
    clips: [transparentBakedClip(), background],
    markers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/** The RGBA of one composited frame, read back through a real canvas. */
async function compositeOnce(): Promise<{
  at: (x: number, y: number) => [number, number, number, number];
}> {
  forEachVideoFrame.mockReset();
  forEachVideoFrame.mockImplementation(async (_bytes, timestamps, onFrame) => {
    await onFrame({ width: W, height: H, rgba: bakeFrameRgba() });
    return timestamps.length;
  });
  const out = await renderTimelineFrames({
    sequence: sequence(),
    timesMs: [500],
    width: W,
    loadAsset: async () => new Uint8Array([0, 0, 0, 0])
  });
  const frame = out.frames[0]!;
  const image = await loadImage(Buffer.from(frame.png));
  const canvas = createCanvas(frame.width, frame.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, frame.width, frame.height);
  return {
    at: (x, y) => {
      const i = (y * frame.width + x) * 4;
      return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    }
  };
}

describe("a transparent bake composited over a solid colour", () => {
  it("leaves the ground showing where the model does not cover", async () => {
    const frame = await compositeOnce();

    // A pixel the model does not cover: the card underneath, not black and
    // not the bake's own ground.
    const [r, g, b] = frame.at(4, 4);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60);
  });

  it("draws the model where it does cover", async () => {
    const frame = await compositeOnce();
    const [r, g, b] = frame.at(Math.floor(W / 2), Math.floor(H / 2));
    expect(g).toBeGreaterThan(200);
    expect(r).toBeLessThan(60);
    expect(b).toBeLessThan(60);
  });
});
