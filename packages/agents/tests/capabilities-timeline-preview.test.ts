/**
 * The frame preview is the only place an agent sees what a timeline *looks*
 * like, so these tests read pixels rather than asserting a call happened.
 *
 * Every case builds a sequence whose correct output is known analytically — a
 * full-frame red shape under a full-frame blue one, a fade sampled at a time
 * whose opacity is arithmetic — and checks the composited pixel. A test that
 * only asserted "a PNG came back" would pass on a black frame.
 */

import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type {
  TimelineClip,
  TimelineSequence,
  TimelineTrack
} from "@nodetool-ai/timeline";

import type { ProcessingContext } from "@nodetool-ai/runtime";

import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

function track(index: number, over: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id: `track-${index}`,
    name: `Track ${index}`,
    type: "video",
    index,
    visible: true,
    locked: false,
    ...over
  };
}

function shapeClip(
  id: string,
  trackId: string,
  fill: string,
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
    shapeStyle: { kind: "rect", fill, x: 0, y: 0, width: 1, height: 1 },
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
    name: "Test sequence",
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

describe("renderTimelineFrames", () => {
  it("composites a shape clip's pixels into the frame", async () => {
    const { frames } = await renderTimelineFrames({
      sequence: sequence(
        [track(0)],
        [shapeClip("red", "track-0", "#ff0000")]
      ),
      timesMs: [1000],
      width: 160,
      loadAsset: noAssets
    });

    expect(frames).toHaveLength(1);
    const [r, g, b] = await pixelAt(frames[0].png, 80, 45);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60);
  });

  it("draws the higher track over the lower one", async () => {
    // Track 0 is the top of the stack in the editor's ordering, so the blue
    // clip on track 0 must cover the red one on track 1.
    const { frames } = await renderTimelineFrames({
      sequence: sequence(
        [track(0), track(1)],
        [
          shapeClip("blue", "track-0", "#0000ff"),
          shapeClip("red", "track-1", "#ff0000")
        ]
      ),
      timesMs: [1000],
      width: 160,
      loadAsset: noAssets
    });

    const [r, , b] = await pixelAt(frames[0].png, 80, 45);
    expect(b).toBeGreaterThan(200);
    expect(r).toBeLessThan(60);

    const [top, under] = frames[0].layers;
    expect(top.clip_name).toBe("blue");
    expect(under.clip_name).toBe("red");
    expect(top.z_index).toBeGreaterThan(under.z_index);
  });

  it("reports and applies a fade animation's opacity mid-flight", async () => {
    const clip = shapeClip("fading", "track-0", "#ffffff", {
      animations: [{ role: "in", preset: "fade", durationMs: 1000 }]
    });
    const { frames } = await renderTimelineFrames({
      sequence: sequence([track(0)], [clip]),
      // 500ms into a 1000ms fade-in over black: mid-ramp, so neither the
      // black ground nor full white.
      timesMs: [500],
      width: 160,
      loadAsset: noAssets
    });

    const layer = frames[0].layers[0];
    expect(layer.opacity).toBeGreaterThan(0);
    expect(layer.opacity).toBeLessThan(1);

    const [r] = await pixelAt(frames[0].png, 80, 45);
    expect(r).toBeGreaterThan(10);
    expect(r).toBeLessThan(245);
  });

  it("renders each requested timecode separately", async () => {
    const { frames } = await renderTimelineFrames({
      sequence: sequence(
        [track(0)],
        [
          shapeClip("first", "track-0", "#ff0000", {
            startMs: 0,
            durationMs: 1000
          }),
          shapeClip("second", "track-0", "#0000ff", {
            startMs: 1000,
            durationMs: 1000
          })
        ]
      ),
      timesMs: [500, 1500],
      width: 160,
      loadAsset: noAssets
    });

    expect(frames.map((f) => f.time_ms)).toEqual([500, 1500]);
    expect(frames[0].layers[0].clip_name).toBe("first");
    expect(frames[1].layers[0].clip_name).toBe("second");

    const [r0] = await pixelAt(frames[0].png, 80, 45);
    const [, , b1] = await pixelAt(frames[1].png, 80, 45);
    expect(r0).toBeGreaterThan(200);
    expect(b1).toBeGreaterThan(200);
  });

  it("draws text clips and reports the text drawn", async () => {
    const { frames } = await renderTimelineFrames({
      sequence: sequence(
        [track(0)],
        [
          {
            ...shapeClip("title", "track-0", "#000000"),
            mediaType: "text",
            shapeStyle: undefined,
            textStyle: {
              text: "HELLO",
              fontSizePx: 120,
              color: "#ffffff"
            }
          }
        ]
      ),
      timesMs: [1000],
      width: 320,
      loadAsset: noAssets
    });

    expect(frames[0].layers[0].text).toBe("HELLO");
    // The glyphs are white on the black ground, so some pixel across the
    // middle band must be bright.
    const image = await loadImage(Buffer.from(frames[0].png));
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const row = ctx.getImageData(0, Math.floor(image.height / 2), image.width, 1)
      .data;
    let brightest = 0;
    for (let i = 0; i < row.length; i += 4) {
      brightest = Math.max(brightest, row[i]);
    }
    expect(brightest).toBeGreaterThan(150);
  });

  it("says why a layer contributed nothing instead of dropping it", async () => {
    const { frames } = await renderTimelineFrames({
      sequence: sequence(
        [track(0)],
        [
          {
            ...shapeClip("pending", "track-0", "#ff0000"),
            mediaType: "image",
            shapeStyle: undefined,
            status: "draft"
          }
        ]
      ),
      timesMs: [1000],
      width: 160,
      loadAsset: noAssets
    });

    expect(frames[0].layers).toHaveLength(1);
    expect(frames[0].layers[0].skipped).toContain("draft");
  });

  it("names the effects Canvas 2D cannot draw", async () => {
    const { effectsNotApplied } = await renderTimelineFrames({
      sequence: sequence(
        [track(0, { effects: [{ type: "vignette", enabled: true, amount: 0.5 }] })],
        [shapeClip("shot", "track-0", "#ff0000")]
      ),
      timesMs: [1000],
      width: 160,
      loadAsset: noAssets
    });

    expect(effectsNotApplied).toContain("vignette");
  });
});

/**
 * The capability layer above the compositor: argument handling, the default
 * sampling, and the shape a caller actually reads. Driven through
 * `toolForCapabilityName` so it goes through the same lookup and validation an
 * agent's call does, not straight into the implementation.
 */
describe("preview_timeline_frame", () => {
  const document = {
    tracks: [track(0)],
    clips: [
      shapeClip("red", "track-0", "#ff0000", { startMs: 0, durationMs: 2000 }),
      shapeClip("blue", "track-0", "#0000ff", { startMs: 2000, durationMs: 2000 })
    ],
    markers: []
  };

  function call(args: Record<string, unknown>) {
    return toolForCapabilityName("preview_timeline_frame").process(
      { userId: "u1" } as unknown as ProcessingContext,
      args
    ) as Promise<Record<string, unknown>>;
  }

  it("renders an inline document at the requested timecodes", async () => {
    const result = await call({
      document,
      times_ms: [1000, 3000],
      width: 160,
      width_px: 640,
      height_px: 360
    });

    expect(result.error).toBeUndefined();
    const frames = result.frames as Array<Record<string, unknown>>;
    expect(frames.map((f) => f.time_ms)).toEqual([1000, 3000]);
    for (const frame of frames) {
      expect(frame.image).toMatchObject({ type: "image", mime_type: "image/png" });
      expect(Number(frame.width)).toBe(160);
    }
  });

  it("samples inside the sequence when no timecodes are given", async () => {
    const result = await call({
      document,
      count: 3,
      width: 96,
      width_px: 640,
      height_px: 360
    });

    const times = (result.frames as Array<{ time_ms: number }>).map(
      (f) => f.time_ms
    );
    expect(times).toHaveLength(3);
    // Evenly spaced and strictly inside the cut — never the first or last frame.
    expect(times).toEqual([1000, 2000, 3000]);
  });

  it("refuses more timecodes than it will render", async () => {
    const result = await call({
      document,
      times_ms: [0, 1, 2, 3, 4, 5, 6, 7, 8]
    });
    expect(String(result.error)).toContain("at most");
  });

  it("refuses a document with no clips instead of returning black frames", async () => {
    const result = await call({
      document: { tracks: [track(0)], clips: [], markers: [] }
    });
    expect(String(result.error)).toContain("no clips");
  });
});
