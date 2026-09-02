/**
 * Motion blur on the Canvas 2D path, read off the pixels (F11, T28, D10).
 *
 * `packages/timeline/tests/render.motionBlur.test.ts` pins the sample times and
 * the composite operation the accumulation uses. This asserts what those
 * produce: a shape crossing the frame at a known speed leaves a smear whose two
 * edges are where the arithmetic says they are, and a frame with blur off is the
 * frame it was before blur existed, byte for byte.
 *
 * The expected edges are computed from the fixture's own numbers — the shape's
 * geometry, the animation's speed, the shutter's width — and not from the
 * sampler, so a wrong sample offset moves the measured smear away from them
 * instead of moving both together.
 */

import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type {
  TimelineClip,
  TimelineSequence,
  TimelineTrack
} from "@nodetool-ai/timeline";

import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

// The fixture, in one place, because every expected number below is derived
// from it. The shape is white on the compositor's opaque black ground, so a
// covered pixel is bright and an uncovered one is zero.
const FRAME_W = 400;
const FRAME_H = 200;
const FPS = 25;
const FRAME_MS = 1000 / FPS; // 40
const SHUTTER_ANGLE = 180;
const WINDOW_MS = (SHUTTER_ANGLE / 360) * FRAME_MS; // 20
const SAMPLES = 8;

/** The shape's own box, in frame pixels at rest. */
const SHAPE_LEFT = 20;
const SHAPE_RIGHT = 60;
const SHAPE_ROW = 100;

/** The `offsetX` ramp: 2000px over 500ms, so 4px per millisecond. */
const RAMP_PX = 2000;
const RAMP_MS = 500;
const SPEED_PX_PER_MS = RAMP_PX / RAMP_MS;

/** The frame under test, early enough that the whole smear stays on screen. */
const FRAME_TIME_MS = 10;

function sequence(): TimelineSequence {
  const track: TimelineTrack = {
    id: "track-0",
    name: "Track 0",
    type: "video",
    index: 0,
    visible: true,
    locked: false
  };
  const clip: TimelineClip = {
    id: "mover",
    trackId: "track-0",
    name: "mover",
    startMs: 0,
    durationMs: 2000,
    mediaType: "shape",
    sourceType: "generated",
    status: "generated",
    shapeStyle: {
      kind: "rect",
      fill: "#ffffff",
      x: SHAPE_LEFT / FRAME_W,
      y: 0.4,
      width: (SHAPE_RIGHT - SHAPE_LEFT) / FRAME_W,
      height: 0.2
    },
    animations: [
      {
        id: "ramp",
        role: "in",
        preset: "custom",
        durationMs: RAMP_MS,
        custom: {
          curves: [
            {
              property: "offsetX",
              keyframes: [
                { t: 0, value: 0 },
                { t: 1, value: RAMP_PX }
              ]
            }
          ]
        }
      }
    ]
  };
  return {
    id: "seq-blur",
    projectId: "proj-1",
    name: "Motion blur",
    fps: FPS,
    width: FRAME_W,
    height: FRAME_H,
    durationMs: 2000,
    tracks: [track],
    clips: [clip],
    markers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

const noAssets = async (): Promise<Uint8Array | null> => null;

/**
 * The first and last column of `row` carrying any light at all.
 *
 * The threshold is deliberately low: one of N samples contributes 1/N of the
 * shape's brightness, so at N = 8 the faintest genuinely-covered pixel is
 * around 32/255. Anything above a few counts is a sample, not rounding.
 */
async function litSpan(
  png: Uint8Array,
  row: number
): Promise<{ first: number; last: number }> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, row, image.width, 1);
  let first = -1;
  let last = -1;
  for (let x = 0; x < image.width; x++) {
    if (data[x * 4] > 8) {
      if (first === -1) first = x;
      last = x;
    }
  }
  return { first, last };
}

async function renderOne(
  motionBlur?: { samplesPerFrame?: number; shutterAngle?: number }
): Promise<Uint8Array> {
  const { frames } = await renderTimelineFrames({
    sequence: sequence(),
    timesMs: [FRAME_TIME_MS],
    // Render at the sequence's own resolution so a frame pixel is a
    // reference pixel and the arithmetic below needs no scale factor.
    width: FRAME_W,
    loadAsset: noAssets,
    motionBlur
  });
  return frames[0].png;
}

describe("motion blur in the frame preview", () => {
  it("places the unblurred shape where the ramp says (the fixture's own claim)", async () => {
    const span = await litSpan(await renderOne(), SHAPE_ROW);
    const offset = SPEED_PX_PER_MS * FRAME_TIME_MS;
    expect(span.first).toBeCloseTo(SHAPE_LEFT + offset, -0.5);
    expect(span.last).toBeCloseTo(SHAPE_RIGHT + offset - 1, -0.5);
  });

  it("smears across the shutter window, both edges within a pixel", async () => {
    const span = await litSpan(
      await renderOne({ samplesPerFrame: SAMPLES, shutterAngle: SHUTTER_ANGLE }),
      SHAPE_ROW
    );

    // The samples sit at the midpoints of the window's N slices, so the first
    // is half a slice in and the last half a slice short of the close.
    const firstSampleMs = FRAME_TIME_MS + (0.5 / SAMPLES) * WINDOW_MS;
    const lastSampleMs =
      FRAME_TIME_MS + ((SAMPLES - 0.5) / SAMPLES) * WINDOW_MS;
    const expectedFirst = SHAPE_LEFT + SPEED_PX_PER_MS * firstSampleMs;
    const expectedLast = SHAPE_RIGHT + SPEED_PX_PER_MS * lastSampleMs - 1;

    expect(Math.abs(span.first - expectedFirst)).toBeLessThanOrEqual(1);
    expect(Math.abs(span.last - expectedLast)).toBeLessThanOrEqual(1);
    // And the smear really is wider than the shape it came from.
    expect(span.last - span.first).toBeGreaterThan(SHAPE_RIGHT - SHAPE_LEFT);
  });

  it("averages rather than fading, so the smear is uniformly faint", async () => {
    const png = await renderOne({
      samplesPerFrame: SAMPLES,
      shutterAngle: SHUTTER_ANGLE
    });
    const image = await loadImage(Buffer.from(png));
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, SHAPE_ROW, image.width, 1);

    const { first, last } = await litSpan(png, SHAPE_ROW);
    // The shape is 40px wide and each sample steps 10px, so the middle of the
    // smear is covered by four of the eight samples: 4/8 of white.
    const middle = Math.round((first + last) / 2);
    expect(data[middle * 4]).toBeGreaterThan(0.35 * 255);
    expect(data[middle * 4]).toBeLessThan(0.65 * 255);
    // A `source-over` accumulation would leave the last sample far brighter
    // than the first; a summed one leaves the two ends alike.
    expect(data[(first + 2) * 4]).toBeGreaterThan(8);
    expect(data[(last - 2) * 4]).toBeGreaterThan(8);
  });

  it("renders the frame it always rendered when blur is off", async () => {
    const plain = await renderOne();
    const oneSample = await renderOne({ samplesPerFrame: 1, shutterAngle: 180 });
    const zeroSamples = await renderOne({ samplesPerFrame: 0 });
    expect(Buffer.from(oneSample).equals(Buffer.from(plain))).toBe(true);
    expect(Buffer.from(zeroSamples).equals(Buffer.from(plain))).toBe(true);
  });
});
