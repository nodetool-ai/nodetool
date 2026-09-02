/**
 * Two-clip transitions on the Canvas 2D path (F6, T11).
 *
 * `packages/timeline` checks the records the scene model resolves; this reads
 * the pixels `@napi-rs/canvas` actually produced, because what a two-clip
 * transition is for is only visible there: mid-`push` the frame is half the
 * outgoing shot and half the incoming one, and mid-`dipToColor` it is neither.
 * A type that moved only the clip declaring it would still resolve correctly
 * and still look wrong.
 *
 * This is also the preview-parity half of the task: the frame harness an agent
 * calls draws through the same `render/` rules the exporter does, so a case
 * that passes here pins both. `render.transition.gpu.test.ts` asserts the same
 * two frames off the WebGPU compositor.
 */

import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type {
  ClipTransition,
  TimelineClip,
  TimelineSequence,
  TimelineTrack
} from "@nodetool-ai/timeline";

import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

const WIDTH = 160;
const HEIGHT = 90;

/** The cut runs over [800, 1200); 1000 is its midpoint. */
const CUT_START = 800;
const CUT_MS = 400;
const MID = CUT_START + CUT_MS / 2;

const track: TimelineTrack = {
  id: "track-0",
  name: "V1",
  type: "video",
  index: 0,
  visible: true,
  locked: false
};

/** A full-frame solid, so every pixel of the frame belongs to one clip. */
function fullFrameShape(
  id: string,
  fill: string,
  over: Partial<TimelineClip> = {}
): TimelineClip {
  return {
    id,
    trackId: track.id,
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
    name: "Transition sequence",
    fps: 30,
    width: 640,
    height: 360,
    durationMs: 4000,
    tracks: [track],
    clips,
    markers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

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

/**
 * A red clip cutting in over a blue one with `transition`, rendered at the
 * midpoint of the cut. Red starts later, so it composites on top.
 */
async function cutFrame(
  transition: ClipTransition,
  timeMs = MID
): Promise<Uint8Array> {
  const { frames } = await renderTimelineFrames({
    sequence: sequence([
      fullFrameShape("blue", "#0000ff", { startMs: 0, durationMs: 1200 }),
      fullFrameShape("red", "#ff0000", {
        startMs: CUT_START,
        durationMs: 1200,
        transitionIn: transition
      })
    ]),
    timesMs: [timeMs],
    width: WIDTH,
    loadAsset: async () => null
  });
  return frames[0]!.png;
}

describe("renderTimelineFrames — two-clip transitions", () => {
  it("push shows half the incoming clip and half the outgoing one", async () => {
    const png = await cutFrame({
      type: "push",
      durationMs: CUT_MS,
      direction: "left"
    });

    // `left` is the edge the incoming clip arrives from: at the midpoint its
    // trailing half covers the left of the frame and the outgoing clip's
    // leading half covers the right.
    const [lr, , lb] = await pixelAt(png, 16, HEIGHT / 2);
    const [rr, , rb] = await pixelAt(png, WIDTH - 16, HEIGHT / 2);
    expect(lr).toBeGreaterThan(200);
    expect(lb).toBeLessThan(50);
    expect(rb).toBeGreaterThan(200);
    expect(rr).toBeLessThan(50);
  });

  it("push runs the other way when the direction does", async () => {
    const png = await cutFrame({
      type: "push",
      durationMs: CUT_MS,
      direction: "right"
    });
    expect((await pixelAt(png, 16, HEIGHT / 2))[2]).toBeGreaterThan(200);
    expect((await pixelAt(png, WIDTH - 16, HEIGHT / 2))[0]).toBeGreaterThan(200);
  });

  it("dipToColor is the colour at the midpoint, and neither clip", async () => {
    const png = await cutFrame({
      type: "dipToColor",
      durationMs: CUT_MS,
      color: "#00ff00"
    });

    for (const x of [8, WIDTH / 2, WIDTH - 8]) {
      const [r, g, b] = await pixelAt(png, x, HEIGHT / 2);
      expect(g).toBeGreaterThan(240);
      expect(r).toBeLessThan(12);
      expect(b).toBeLessThan(12);
    }
  });

  it("dipToColor shows each clip on its own side of the dip", async () => {
    const dip: ClipTransition = {
      type: "dipToColor",
      durationMs: CUT_MS,
      color: "#00ff00"
    };
    // A quarter in: the outgoing clip is still half up and the solid half on,
    // so the frame is neither the pure clip nor the pure colour.
    const early = await pixelAt(await cutFrame(dip, CUT_START + 100), 8, 8);
    expect(early[1]).toBeGreaterThan(100);
    expect(early[2]).toBeGreaterThan(50);
    expect(early[0]).toBeLessThan(12);

    // Three quarters in: the incoming clip is arriving through the fading dip.
    const late = await pixelAt(await cutFrame(dip, CUT_START + 300), 8, 8);
    expect(late[0]).toBeGreaterThan(100);
    expect(late[2]).toBeLessThan(12);
  });

  it("slide leaves the outgoing clip where it was", async () => {
    const png = await cutFrame({
      type: "slide",
      durationMs: CUT_MS,
      direction: "left"
    });
    // Only the incoming clip moves, so the half it has not reached is still
    // the outgoing shot rather than the ground.
    expect((await pixelAt(png, 16, HEIGHT / 2))[0]).toBeGreaterThan(200);
    expect((await pixelAt(png, WIDTH - 16, HEIGHT / 2))[2]).toBeGreaterThan(200);
  });

  it("crossfade blends the two rather than moving either", async () => {
    const png = await cutFrame({ type: "crossfade", durationMs: CUT_MS });
    for (const x of [8, WIDTH / 2, WIDTH - 8]) {
      const [r, , b] = await pixelAt(png, x, HEIGHT / 2);
      expect(r).toBeGreaterThan(100);
      expect(r).toBeLessThan(160);
      expect(b).toBeGreaterThan(100);
      expect(b).toBeLessThan(160);
    }
  });

  it("reports which side of the cut each layer is on", async () => {
    const { frames } = await renderTimelineFrames({
      sequence: sequence([
        fullFrameShape("blue", "#0000ff", { startMs: 0, durationMs: 1200 }),
        fullFrameShape("red", "#ff0000", {
          startMs: CUT_START,
          durationMs: 1200,
          transitionIn: { type: "wipe", durationMs: CUT_MS, direction: "left" }
        })
      ]),
      timesMs: [MID],
      width: WIDTH,
      loadAsset: async () => null
    });

    const byClip = new Map(
      frames[0]!.layers.map((layer) => [layer.clip_id, layer])
    );
    expect(byClip.get("red")?.transition).toEqual({
      type: "wipe",
      role: "in",
      progress: 0.5
    });
    expect(byClip.get("blue")?.transition?.role).toBe("out");
    // The wipe's reveal is reported as the layer's mask, the way an animated
    // one is — an agent reading the frame sees one wipe, not two concepts.
    expect(byClip.get("red")?.wipe).toEqual({ direction: "left", progress: 0.5 });
  });
});
