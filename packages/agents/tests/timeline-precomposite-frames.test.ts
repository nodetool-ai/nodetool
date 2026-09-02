/**
 * A group's effects and blend mode on the Canvas 2D path (F5, T10).
 *
 * `packages/timeline` checks the rules against a recording context; this reads
 * the pixels `@napi-rs/canvas` actually produced, because the two failures a
 * precomposite exists to prevent are only visible there: an overlap darkened
 * twice, and a blur run per child instead of on the composed picture.
 */

import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type {
  ClipEffect,
  TimelineClip,
  TimelineSequence,
  TimelineTrack
} from "@nodetool-ai/timeline";

import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

const WIDTH = 160;
const HEIGHT = 90;

function track(index: number): TimelineTrack {
  return {
    id: `track-${index}`,
    name: `Track ${index}`,
    type: "video",
    index,
    visible: true,
    locked: false
  };
}

/** A rect covering `[x, x + width)` of the frame, in normalized coordinates. */
function shapeClip(
  id: string,
  trackId: string,
  fill: string,
  x: number,
  width: number,
  over: Partial<TimelineClip> = {}
): TimelineClip {
  return {
    id,
    trackId,
    name: id,
    startMs: 0,
    durationMs: 4000,
    mediaType: "shape",
    sourceType: "generated",
    status: "generated",
    shapeStyle: { kind: "rect", fill, x, y: 0, width, height: 1 },
    ...over
  };
}

function groupClip(id: string, over: Partial<TimelineClip>): TimelineClip {
  return {
    id,
    trackId: "track-0",
    name: id,
    startMs: 0,
    durationMs: 4000,
    mediaType: "group",
    sourceType: "generated",
    status: "generated",
    ...over
  };
}

function sequence(
  tracks: TimelineTrack[],
  clips: TimelineClip[]
): TimelineSequence {
  return {
    id: "seq-1",
    projectId: "proj-1",
    name: "Precomposite sequence",
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

const noAssets = async () => null;

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
  return [d[0], d[1], d[2], d[3]];
}

/** A neutral grade: enough to make a group precomposite, invisible in the pixels. */
const neutralColor: ClipEffect = {
  id: "neutral",
  type: "color",
  enabled: true,
  brightness: 0,
  contrast: 1,
  saturation: 1
};

/** Two white bands overlapping across the middle third of the frame. */
const overlappingChildren = [
  shapeClip("left", "track-1", "#ffffff", 0, 0.6, { parentId: "g" }),
  shapeClip("right", "track-0", "#ffffff", 0.4, 0.6, { parentId: "g" })
];

async function renderOne(clips: TimelineClip[]): Promise<Uint8Array> {
  const { frames } = await renderTimelineFrames({
    sequence: sequence([track(0), track(1)], clips),
    timesMs: [1000],
    width: WIDTH,
    loadAsset: noAssets
  });
  return frames[0]!.png;
}

describe("renderTimelineFrames — group precomposite", () => {
  it("reads a half-opaque group as one 50% layer over its overlap", async () => {
    const png = await renderOne([
      groupClip("g", { opacity: 0.5, effects: [neutralColor] }),
      ...overlappingChildren
    ]);

    const alone = (await pixelAt(png, 16, HEIGHT / 2))[0];
    const overlap = (await pixelAt(png, WIDTH / 2, HEIGHT / 2))[0];
    // White at 50% over black is 128, everywhere the group covers.
    expect(alone).toBeGreaterThan(120);
    expect(alone).toBeLessThan(136);
    expect(Math.abs(overlap - alone)).toBeLessThanOrEqual(2);
  });

  it("stacks the same children twice when the group precomposites nothing", async () => {
    // The same document with the group's effect removed: nothing needs an
    // intermediate, so T9's path multiplies the group's opacity into each
    // child and the overlap is composited twice. This is what the case above
    // has to differ from — without it, a per-child path would pass both.
    const png = await renderOne([
      groupClip("g", { opacity: 0.5 }),
      ...overlappingChildren
    ]);

    expect((await pixelAt(png, 16, HEIGHT / 2))[0]).toBeLessThan(136);
    expect((await pixelAt(png, WIDTH / 2, HEIGHT / 2))[0]).toBeGreaterThan(180);
  });

  it("blurs the composite, so two abutting children keep no seam", async () => {
    // Red and blue meet exactly at the frame's centre. Blurring the composed
    // picture mixes the two colours there and loses no light; blurring each
    // child on its own fades both edges into the black ground first, so the
    // seam comes out dim.
    const png = await renderOne([
      groupClip("g", {
        effects: [{ id: "b", type: "blur", enabled: true, radius: 6 }]
      }),
      shapeClip("left", "track-1", "#ff0000", 0, 0.5, { parentId: "g" }),
      shapeClip("right", "track-0", "#0000ff", 0.5, 0.5, { parentId: "g" })
    ]);

    const [r, g, b] = await pixelAt(png, WIDTH / 2, HEIGHT / 2);
    expect(r).toBeGreaterThan(80);
    expect(b).toBeGreaterThan(80);
    expect(r + g + b).toBeGreaterThan(230);
  });

  it("names a group effect it cannot draw instead of dropping it", async () => {
    const { effectsNotApplied } = await renderTimelineFrames({
      sequence: sequence(
        [track(0), track(1)],
        [
          groupClip("g", {
            effects: [
              { id: "glow", type: "glow", enabled: true, radius: 8, intensity: 1 },
              { id: "b", type: "blur", enabled: true, radius: 4 }
            ]
          }),
          shapeClip("child", "track-1", "#ffffff", 0, 1, { parentId: "g" })
        ]
      ),
      timesMs: [1000],
      width: WIDTH,
      loadAsset: noAssets
    });

    expect(effectsNotApplied).toEqual(["glow"]);
  });
});
