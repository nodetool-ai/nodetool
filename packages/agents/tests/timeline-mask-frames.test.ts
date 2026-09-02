/**
 * Shape masks and track mattes on the Canvas 2D path (F7, T12, D6).
 *
 * `packages/timeline` checks the records the scene model resolves; this reads
 * the pixels `@napi-rs/canvas` actually produced, because that is where a mask
 * is either cutting the layer or not. `render.mask.gpu.test.ts` asserts the
 * same four claims off the WebGPU compositor — a mask that cuts one way in the
 * preview and another in the export is the failure both suites exist to catch
 * (AS1).
 */

import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type {
  ClipMask,
  TimelineClip,
  TimelineSequence,
  TimelineTrack
} from "@nodetool-ai/timeline";

import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

const WIDTH = 160;
const HEIGHT = 90;

/** Two tracks: the matte source lives on its own so nothing auto-dissolves. */
const tracks: TimelineTrack[] = [
  {
    id: "track-0",
    name: "V1",
    type: "video",
    index: 0,
    visible: true,
    locked: false
  },
  {
    id: "track-1",
    name: "V2",
    type: "video",
    index: 1,
    visible: true,
    locked: false
  }
];

/** A full-frame solid, so every pixel of the frame belongs to one clip. */
function fullFrameShape(
  id: string,
  fill: string,
  over: Partial<TimelineClip> = {}
): TimelineClip {
  return {
    id,
    trackId: tracks[0]!.id,
    name: id,
    startMs: 0,
    durationMs: 2000,
    mediaType: "shape",
    sourceType: "generated",
    status: "generated",
    shapeStyle: { kind: "rect", fill, x: 0, y: 0, width: 1, height: 1 },
    ...over
  };
}

function sequence(clips: TimelineClip[]): TimelineSequence {
  return {
    id: "seq-1",
    projectId: "proj-1",
    name: "Mask sequence",
    fps: 30,
    width: 640,
    height: 360,
    durationMs: 4000,
    tracks,
    clips,
    markers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/** A left-to-right luminance ramp, as PNG bytes an asset load can return. */
function gradientPng(): Uint8Array {
  const canvas = createCanvas(640, 360);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 640, 0);
  gradient.addColorStop(0, "#000000");
  gradient.addColorStop(1, "#ffffff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 640, 360);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

/** White at half alpha, as PNG bytes an asset load can return. */
function halfAlphaWhitePng(): Uint8Array {
  const canvas = createCanvas(640, 360);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.fillRect(0, 0, 640, 360);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

/**
 * White through a luma matte whose source is white at half alpha: the matte
 * reads 0.5, so the layer lands halfway to the black ground. The GPU twin in
 * `packages/timeline/tests/render.mask.gpu.test.ts` asserts the same number —
 * the two hosts have to agree on it, not just each be self-consistent.
 */
const HALF_COVERED_WHITE = 128;
/** Two 8-bit quantizations of the same coverage, plus each host's rounding. */
const HOST_TOLERANCE = 14;

/** The RGBA of one pixel of a rendered PNG frame. */
async function pixelAt(
  png: Uint8Array,
  x: number,
  y: number
): Promise<[number, number, number, number]> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0]!, d[1]!, d[2]!, d[3]!];
}

async function frameOf(
  clips: TimelineClip[],
  loadAsset: (id: string) => Promise<Uint8Array | null> = async () => null
): Promise<Uint8Array> {
  const { frames } = await renderTimelineFrames({
    sequence: sequence(clips),
    timesMs: [500],
    width: WIDTH,
    loadAsset
  });
  return frames[0]!.png;
}

/** The matte source: an image clip on its own track carrying the gradient. */
const gradientClip = (over: Partial<TimelineClip> = {}): TimelineClip => ({
  id: "key",
  trackId: tracks[1]!.id,
  name: "Key",
  startMs: 0,
  durationMs: 2000,
  mediaType: "image",
  sourceType: "imported",
  status: "generated",
  currentAssetId: "asset-gradient",
  ...over
});

describe("renderTimelineFrames — shape masks", () => {
  it("an ellipse mask keeps the centre and cuts the corners", async () => {
    const mask: ClipMask = { kind: "ellipse" };
    const png = await frameOf([fullFrameShape("red", "#ff0000", { mask })]);

    expect((await pixelAt(png, WIDTH / 2, HEIGHT / 2))[0]).toBeGreaterThan(240);
    for (const [x, y] of [
      [2, 2],
      [WIDTH - 3, 2],
      [2, HEIGHT - 3],
      [WIDTH - 3, HEIGHT - 3]
    ]) {
      expect((await pixelAt(png, x!, y!))[0]).toBeLessThan(12);
    }
  });

  it("an inverted path mask reads the reverse", async () => {
    // A diamond covering the middle of the frame, kept inside-out.
    const d = "M 0.5 0.05 L 0.95 0.5 L 0.5 0.95 L 0.05 0.5 Z";
    const plain = await frameOf([
      fullFrameShape("red", "#ff0000", { mask: { kind: "path", d } })
    ]);
    const inverted = await frameOf([
      fullFrameShape("red", "#ff0000", {
        mask: { kind: "path", d, invert: true }
      })
    ]);

    expect((await pixelAt(plain, WIDTH / 2, HEIGHT / 2))[0]).toBeGreaterThan(240);
    expect((await pixelAt(plain, 2, 2))[0]).toBeLessThan(12);

    expect((await pixelAt(inverted, WIDTH / 2, HEIGHT / 2))[0]).toBeLessThan(12);
    expect((await pixelAt(inverted, 2, 2))[0]).toBeGreaterThan(240);
  });

  it("a feathered mask fades rather than stepping at its edge", async () => {
    const png = await frameOf([
      fullFrameShape("red", "#ff0000", {
        mask: {
          kind: "rect",
          x: 0.25,
          y: 0,
          width: 0.5,
          height: 1,
          featherPx: 24
        }
      })
    ]);

    const inside = (await pixelAt(png, WIDTH / 2, HEIGHT / 2))[0];
    const band = (await pixelAt(png, Math.round(WIDTH * 0.29), HEIGHT / 2))[0];
    const outside = (await pixelAt(png, 2, HEIGHT / 2))[0];
    expect(inside).toBeGreaterThan(240);
    expect(outside).toBeLessThan(12);
    expect(band).toBeGreaterThan(20);
    expect(band).toBeLessThan(220);
  });

  it("draws unmasked when the mask names a kind it cannot rasterize", async () => {
    const png = await frameOf([
      fullFrameShape("red", "#ff0000", { mask: { kind: "star" } })
    ]);
    expect((await pixelAt(png, 2, 2))[0]).toBeGreaterThan(240);
  });
});

describe("renderTimelineFrames — track mattes", () => {
  const loadGradient = async (): Promise<Uint8Array> => gradientPng();

  it("a luma matte from a gradient produces a ramp", async () => {
    const png = await frameOf(
      [
        fullFrameShape("white", "#ffffff", {
          matte: { sourceClipId: "key", mode: "luma" }
        }),
        gradientClip()
      ],
      loadGradient
    );

    const left = (await pixelAt(png, 3, HEIGHT / 2))[0];
    const middle = (await pixelAt(png, WIDTH / 2, HEIGHT / 2))[0];
    const right = (await pixelAt(png, WIDTH - 4, HEIGHT / 2))[0];
    expect(left).toBeLessThan(24);
    expect(middle).toBeGreaterThan(100);
    expect(middle).toBeLessThan(160);
    expect(right).toBeGreaterThan(225);
    expect(left).toBeLessThan(middle);
    expect(middle).toBeLessThan(right);
  });

  it("a luma matte weights the luminance by the source's own alpha", async () => {
    // Outside the matte clip's own pixels there is no picture, so the
    // luminance only means anything weighted by the coverage it was drawn
    // with. The GPU path read straight colour and let a half-transparent white
    // matte pass the layer through opaque; both hosts land on
    // HALF_COVERED_WHITE now.
    const png = await frameOf(
      [
        fullFrameShape("white", "#ffffff", {
          matte: { sourceClipId: "key", mode: "luma" }
        }),
        gradientClip()
      ],
      async () => halfAlphaWhitePng()
    );

    const centre = (await pixelAt(png, WIDTH / 2, HEIGHT / 2))[0];
    expect(centre).toBeGreaterThan(HALF_COVERED_WHITE - HOST_TOLERANCE);
    expect(centre).toBeLessThan(HALF_COVERED_WHITE + HOST_TOLERANCE);
  });

  it("a matte source never draws itself", async () => {
    // The source is a green shape over the left half, on the track *above* the
    // layer it drives — so if it drew, it would cover the very pixels the
    // matte reveals. The red layer survives only where the source covers, and
    // green is nowhere on the frame.
    const png = await frameOf([
      {
        ...fullFrameShape("red", "#ff0000", {
          matte: { sourceClipId: "key", mode: "alpha" }
        }),
        trackId: tracks[1]!.id
      },
      {
        ...fullFrameShape("key", "#00ff00"),
        trackId: tracks[0]!.id,
        shapeStyle: {
          kind: "rect",
          fill: "#00ff00",
          x: 0,
          y: 0,
          width: 0.5,
          height: 1
        }
      }
    ]);

    const [lr, lg] = await pixelAt(png, 4, HEIGHT / 2);
    expect(lr).toBeGreaterThan(240);
    expect(lg).toBeLessThan(12);
    const [rr, rg] = await pixelAt(png, WIDTH - 5, HEIGHT / 2);
    expect(rr).toBeLessThan(12);
    expect(rg).toBeLessThan(12);
  });

  it("reports the matte in the layer report, since the source draws nothing", async () => {
    const { frames } = await renderTimelineFrames({
      sequence: sequence([
        fullFrameShape("white", "#ffffff", {
          matte: { sourceClipId: "key", mode: "luma", invert: true }
        }),
        gradientClip()
      ]),
      timesMs: [500],
      width: WIDTH,
      loadAsset: loadGradient
    });

    expect(frames[0]!.layers).toHaveLength(1);
    expect(frames[0]!.layers[0]!.matte).toEqual({
      source_clip_id: "key",
      mode: "luma",
      invert: true
    });
  });

  it("drops a matted layer whose source is not active, and says so", async () => {
    const { frames } = await renderTimelineFrames({
      sequence: sequence([
        fullFrameShape("red", "#ff0000", {
          matte: { sourceClipId: "key", mode: "alpha" }
        }),
        gradientClip({ startMs: 3000, durationMs: 500 })
      ]),
      timesMs: [500],
      width: WIDTH,
      loadAsset: loadGradient
    });

    expect(frames[0]!.dropped).toEqual([
      { clip_id: "red", clip_name: "red", reason: "matte_source_inactive" }
    ]);
    expect((await pixelAt(frames[0]!.png, WIDTH / 2, HEIGHT / 2))[0]).toBeLessThan(
      12
    );
  });
});
