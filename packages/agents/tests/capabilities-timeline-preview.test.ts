/**
 * The frame preview is the only place an agent sees what a timeline *looks*
 * like, so these tests read pixels rather than asserting a call happened.
 *
 * Every case builds a sequence whose correct output is known analytically — a
 * full-frame red shape under a full-frame blue one, a fade sampled at a time
 * whose opacity is arithmetic — and checks the composited pixel. A test that
 * only asserted "a PNG came back" would pass on a black frame.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initTestDb, ModelObserver } from "@nodetool-ai/models";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type {
  TimelineClip,
  TimelineSequence,
  TimelineTrack
} from "@nodetool-ai/timeline";

import type { ProcessingContext } from "@nodetool-ai/runtime";

import { resolveAnimatedLayerProps } from "@nodetool-ai/timeline/scene";

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

/** How many pixels of a row or column of a PNG frame are red. */
async function redSpan(
  png: Uint8Array,
  axis: "row" | "column"
): Promise<{ length: number; total: number }> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const data =
    axis === "row"
      ? ctx.getImageData(0, Math.floor(image.height / 2), image.width, 1).data
      : ctx.getImageData(Math.floor(image.width / 2), 0, 1, image.height).data;
  let length = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) length += 1;
  }
  return {
    length,
    total: axis === "row" ? image.width : image.height
  };
}

/** First and last column of a PNG's middle row that carries a bright pixel. */
async function brightColumns(
  png: Uint8Array,
  threshold = 60
): Promise<{ first: number; last: number; count: number }> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const row = ctx.getImageData(0, Math.floor(image.height / 2), image.width, 1)
    .data;
  let first = -1;
  let last = -1;
  let count = 0;
  for (let i = 0; i < row.length; i += 4) {
    if (row[i] > threshold) {
      const column = i / 4;
      if (first < 0) first = column;
      last = column;
      count += 1;
    }
  }
  return { first, last, count };
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

  it("draws a character stagger one glyph at a time", async () => {
    // Each glyph fades in over 200ms, 300ms after the one before it, so at
    // 650ms only the first three have opened. A raster that ignored the
    // stagger would light the whole word at once.
    const staggered = {
      ...shapeClip("stagger", "track-0", "#000000"),
      mediaType: "text" as const,
      shapeStyle: undefined,
      textStyle: {
        text: "HHHHHHHHHH",
        fontSizePx: 30,
        color: "#ffffff"
      },
      animations: [
        {
          id: "a1",
          role: "in" as const,
          preset: "fade",
          durationMs: 200,
          easing: "linear",
          stagger: { unit: "character", offsetMs: 300 }
        }
      ]
    };
    const { frames } = await renderTimelineFrames({
      sequence: sequence([track(0)], [staggered]),
      timesMs: [650, 3500],
      width: 320,
      loadAsset: noAssets
    });

    const mid = await brightColumns(frames[0].png);
    const settled = await brightColumns(frames[1].png);
    expect(mid.count).toBeGreaterThan(0);
    // The word is centered, so the un-opened glyphs are the right-hand ones.
    expect(mid.first).toBeCloseTo(settled.first, -1);
    expect(mid.last).toBeLessThan(settled.last - 20);
    expect(mid.count).toBeLessThan(settled.count);
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

  it("names the layers the video cap kept out of the frame", async () => {
    // Nine video clips overlap; the compositor holds eight. The ninth used to
    // vanish with no trace anywhere in the report.
    const tracks = Array.from({ length: 9 }, (_, i) => track(i));
    const clips = tracks.map((t, i) => ({
      ...shapeClip(`shot-${i}`, t.id, "#ff0000"),
      name: `Shot ${i}`,
      mediaType: "video" as const,
      currentAssetId: `asset-${i}`,
      shapeStyle: undefined
    }));

    const { frames } = await renderTimelineFrames({
      sequence: sequence(tracks, clips),
      timesMs: [1000],
      width: 160,
      loadAsset: noAssets
    });

    expect(frames[0].dropped).toEqual([
      { clip_id: "shot-8", clip_name: "Shot 8", reason: "video_layer_cap" }
    ]);
  });

  it("reports no dropped layer for a frame that fits", async () => {
    const { frames } = await renderTimelineFrames({
      sequence: sequence([track(0)], [shapeClip("red", "track-0", "#ff0000")]),
      timesMs: [1000],
      width: 160,
      loadAsset: noAssets
    });

    expect(frames[0].dropped).toEqual([]);
  });

  /**
   * The channels T7 added have to reach the picture, not just the sample. A
   * `scaleX` curve widens the layer and leaves its height alone, and the span
   * the frame actually shows is the one the scene model resolved — the harness
   * and the renderer read the same sample or this diverges silently.
   */
  it("widens a shape with scaleX and leaves its height alone", async () => {
    const middleSquare = {
      kind: "rect" as const,
      fill: "#ff0000",
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5
    };
    const plain = shapeClip("plain", "track-0", "#ff0000", {
      shapeStyle: middleSquare
    });
    const widened: TimelineClip = {
      ...plain,
      id: "widened",
      name: "widened",
      animations: [
        {
          id: "wide",
          role: "loop",
          preset: "custom",
          durationMs: 1000,
          easing: "linear",
          custom: {
            curves: [
              {
                property: "scaleX",
                keyframes: [
                  { t: 0, value: 2 },
                  { t: 1, value: 2 }
                ]
              }
            ]
          }
        }
      ]
    };

    const render = (clip: TimelineClip) =>
      renderTimelineFrames({
        sequence: sequence([track(0)], [clip]),
        timesMs: [1000],
        width: 160,
        loadAsset: noAssets
      });

    const before = await render(plain);
    const after = await render(widened);

    const baseRow = await redSpan(before.frames[0].png, "row");
    const wideRow = await redSpan(after.frames[0].png, "row");
    const baseColumn = await redSpan(before.frames[0].png, "column");
    const wideColumn = await redSpan(after.frames[0].png, "column");

    // The scene model is the authority on the factor; the pixels must match it.
    const props = resolveAnimatedLayerProps(
      { clip: widened, opacity: 1 },
      1000,
      { width: 640, height: 360 }
    );
    expect(props.transform?.scale.x).toBe(2);
    expect(props.transform?.scale.y).toBe(1);

    // Antialiased edges cost a pixel either side, so the widths are compared
    // with a small tolerance; the height is untouched and must match exactly.
    const expectedWide = baseRow.length * (props.transform?.scale.x ?? 1);
    expect(Math.abs(wideRow.length - expectedWide)).toBeLessThanOrEqual(4);
    expect(wideRow.length).toBeGreaterThan(wideRow.total - 5);
    expect(wideColumn.length).toBe(baseColumn.length);
  });

  /**
   * A group is a transform parent (D4), and the picture is where that has to
   * show up. A half-turn about a point a quarter of the way across the frame
   * takes a bar in the leftmost quarter into the second quarter; the same
   * rotation about the layer's own centre would take it to the rightmost one,
   * so the two cannot be confused in the pixels.
   */
  it("rotates a child about the group's anchor, not its own", async () => {
    const leftBar = {
      kind: "rect" as const,
      fill: "#ff0000",
      x: 0,
      y: 0,
      width: 0.25,
      height: 1
    };
    const halfTurnAtQuarterWidth = {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: Math.PI,
      anchor: { x: 0.25, y: 0.5 }
    };
    const bar = shapeClip("bar", "track-0", "#ff0000", {
      shapeStyle: leftBar
    });
    const group: TimelineClip = {
      id: "group",
      trackId: "track-0",
      name: "Group",
      startMs: 0,
      durationMs: 4000,
      mediaType: "group",
      sourceType: "generated",
      status: "generated",
      transform: halfTurnAtQuarterWidth
    };

    const render = (clips: TimelineClip[]) =>
      renderTimelineFrames({
        sequence: sequence([track(0)], clips),
        timesMs: [1000],
        width: 160,
        loadAsset: noAssets
      });

    const unparented = await render([bar]);
    const parented = await render([group, { ...bar, parentId: "group" }]);

    const before = await brightColumns(unparented.frames[0].png, 60);
    const after = await brightColumns(parented.frames[0].png, 60);

    // 160px wide: the bar starts in columns 0–39 and lands in 40–79.
    expect(before.first).toBeLessThanOrEqual(1);
    expect(before.last).toBeGreaterThanOrEqual(38);
    expect(before.last).toBeLessThan(42);
    expect(after.first).toBeGreaterThan(38);
    expect(after.first).toBeLessThan(42);
    expect(after.last).toBeGreaterThan(76);
    expect(after.last).toBeLessThan(82);
    expect(after.count).toBeCloseTo(before.count, -1);
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

  it("adds a brightness lift the way the GPU grade does", async () => {
    // `colorGradeV1` is `rgb + brightness`; CSS `brightness()` multiplies. On
    // mid-grey at +0.25 that is 192 against 160 — the same document, two
    // pictures, which is what the scratch-copy pass exists to prevent.
    const { frames } = await renderTimelineFrames({
      sequence: sequence(
        [track(0)],
        [
          shapeClip("shot", "track-0", "#808080", {
            effects: [
              { id: "b", type: "color", enabled: true, brightness: 0.25 }
            ]
          })
        ]
      ),
      timesMs: [1000],
      width: 160,
      loadAsset: noAssets
    });

    const [r] = await pixelAt(frames[0]!.png, 80, 45);
    expect(r).toBeGreaterThanOrEqual(190);
    expect(r).toBeLessThanOrEqual(194);
    expect(frames[0]!.degraded).toEqual([]);
  });

  it("names what it drew differently from the export, and the clip", async () => {
    // `ctx.shadow*` is one set of fields, so the second cast in the chain is
    // not drawn. That is a picture that differs from the export with nothing
    // in `effects_not_applied` to read about it — hence `degraded` (I7).
    const shadow = (id: string, offset: number) => ({
      id,
      type: "dropShadow" as const,
      enabled: true,
      offsetX: offset,
      offsetY: offset,
      blur: 4,
      color: "#000000"
    });
    const { frames } = await renderTimelineFrames({
      sequence: sequence(
        [track(0)],
        [
          shapeClip("shot", "track-0", "#ff0000", {
            name: "Hero",
            effects: [shadow("s1", 4), shadow("s2", 20)]
          })
        ]
      ),
      timesMs: [1000],
      width: 160,
      loadAsset: noAssets
    });

    expect(frames[0]!.degraded).toEqual([
      {
        clip_id: "shot",
        clip_name: "Hero",
        reason: "drop_shadow_extra_ignored"
      }
    ]);
  });

  it("reports nothing degraded for a feathered mask it draws in full", async () => {
    // The preview vends every surface the compositor asks for, so a soft mask
    // is drawn soft — an empty list is the claim that this frame is the
    // export.
    const { frames } = await renderTimelineFrames({
      sequence: sequence(
        [track(0)],
        [
          shapeClip("shot", "track-0", "#ff0000", {
            mask: { kind: "rect", x: 0.25, y: 0, width: 0.5, height: 1, featherPx: 16 }
          })
        ]
      ),
      timesMs: [1000],
      width: 160,
      loadAsset: noAssets
    });

    expect(frames[0]!.degraded).toEqual([]);
  });

  it("names every clip effect from the shader catalog it cannot draw", async () => {
    // The whole catalog on one clip (D7). Canvas 2D draws `dropShadow` through
    // `ctx.shadow*` and approximates `color`/`blur` with `ctx.filter`; the
    // other seven have no equivalent, and a caller learns that here rather
    // than by comparing this frame against a GPU render (I7).
    const { effectsNotApplied } = await renderTimelineFrames({
      sequence: sequence(
        [track(0)],
        [
          shapeClip("shot", "track-0", "#ff0000", {
            effects: [
              { id: "1", type: "color", enabled: true, brightness: 0.2 },
              { id: "2", type: "blur", enabled: true, radius: 3 },
              { id: "3", type: "glow", enabled: true, radius: 8, intensity: 1 },
              {
                id: "4",
                type: "dropShadow",
                enabled: true,
                offsetX: 4,
                offsetY: 4,
                blur: 6,
                color: "#000000"
              },
              {
                id: "5",
                type: "vignette",
                enabled: true,
                amount: 0.5,
                softness: 0.4
              },
              { id: "6", type: "sharpen", enabled: true, amount: 1 },
              {
                id: "7",
                type: "chromaKey",
                enabled: true,
                color: "#00ff00",
                tolerance: 0.2,
                softness: 0.05
              },
              {
                id: "8",
                type: "curves",
                enabled: true,
                master: [
                  { x: 0, y: 0 },
                  { x: 1, y: 1 }
                ]
              },
              {
                id: "9",
                type: "levels",
                enabled: true,
                inBlack: 0,
                inWhite: 1,
                gamma: 1,
                outBlack: 0,
                outWhite: 1
              },
              {
                id: "10",
                type: "liftGammaGain",
                enabled: true,
                lift: [0, 0, 0],
                gamma: [1, 1, 1],
                gain: [1, 1, 1]
              }
            ]
          })
        ]
      ),
      timesMs: [1000],
      width: 160,
      loadAsset: noAssets
    });

    expect(effectsNotApplied).toEqual([
      "chromaKey",
      "curves",
      "glow",
      "levels",
      "liftGammaGain",
      "sharpen",
      "vignette"
    ]);
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

  it("spaces a range evenly and includes both ends", async () => {
    const result = await call({
      document,
      range: { from_ms: 0, to_ms: 4000, count: 5 },
      width: 96,
      width_px: 640,
      height_px: 360
    });

    expect(result.error).toBeUndefined();
    const times = (result.frames as Array<{ time_ms: number }>).map(
      (f) => f.time_ms
    );
    // Inclusive: a range is how a move's start and end get looked at.
    expect(times).toEqual([0, 1000, 2000, 3000, 4000]);
  });

  it("refuses times_ms and range together rather than picking one", async () => {
    const result = await call({
      document,
      times_ms: [500],
      range: { from_ms: 0, to_ms: 1000, count: 2 }
    });
    expect(String(result.error)).toContain("not both");
  });

  it("refuses a range denser than it will render", async () => {
    const result = await call({
      document,
      range: { from_ms: 0, to_ms: 4000, count: 25 }
    });
    expect(String(result.error)).toContain("at most 24");
  });
});

/**
 * The contact sheet: five frames must land as three columns over two rows, and
 * the tiled image must really be that grid — a report saying "3 × 2" over a
 * one-cell PNG would pass an assertion on the numbers alone.
 */
describe("preview_timeline_frame contact sheet", () => {
  const document = {
    tracks: [track(0)],
    clips: [
      shapeClip("red", "track-0", "#ff0000", { startMs: 0, durationMs: 2000 }),
      shapeClip("blue", "track-0", "#0000ff", { startMs: 2000, durationMs: 2000 })
    ],
    markers: []
  };

  it("tiles five frames into three columns over two rows", async () => {
    const stored = new Map<string, Uint8Array>();
    const context = {
      userId: "u1",
      hasModelInterface: (name: string) => name === "createAsset",
      createAsset: async ({ content }: { content: Uint8Array }) => {
        const id = `asset-${stored.size + 1}`;
        stored.set(id, content);
        return { id };
      }
    } as unknown as ProcessingContext;

    const result = (await toolForCapabilityName(
      "preview_timeline_frame"
    ).process(context, {
      document,
      range: { from_ms: 0, to_ms: 4000, count: 5 },
      sheet: true,
      width: 96,
      width_px: 640,
      height_px: 360
    })) as {
      error?: string;
      frames: Array<Record<string, unknown>>;
      sheet: {
        columns: number;
        rows: number;
        cells: number;
        cell_width: number;
        cell_height: number;
        width: number;
        height: number;
        image: { asset_id: string };
      };
    };

    expect(result.error).toBeUndefined();
    expect(result.sheet.columns).toBe(3);
    expect(result.sheet.rows).toBe(2);
    expect(result.sheet.cells).toBe(5);
    // One handle for the sheet, and none per frame — the layer reports stay.
    expect(result.frames).toHaveLength(5);
    for (const frame of result.frames) {
      expect(frame.image).toBeUndefined();
      expect(Array.isArray(frame.layers)).toBe(true);
    }

    const png = stored.get(result.sheet.image.asset_id);
    expect(png).toBeDefined();
    const image = await loadImage(Buffer.from(png as Uint8Array));
    expect(image.width).toBe(3 * result.sheet.cell_width);
    expect(image.height).toBe(2 * result.sheet.cell_height);
    expect(image.width).toBeLessThanOrEqual(1280);
  });
});

/**
 * The acceptance for the custom-animation op (T4): keyframes an agent writes
 * through `edit_timeline` have to reach the picture, not just the document.
 * The curve here is arithmetic — a white layer over black at opacity 0.5 —
 * so the pixel is the assertion.
 */
describe("edit_timeline custom curves through preview_timeline_frame", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  /** Context with an asset store, so a previewed frame's bytes are readable. */
  function contextWithAssets() {
    const stored = new Map<string, Uint8Array>();
    const context = {
      userId: "u1",
      hasModelInterface: (name: string) => name === "createAsset",
      createAsset: async ({ content }: { content: Uint8Array }) => {
        const id = `asset-${stored.size + 1}`;
        stored.set(id, content);
        return { id };
      }
    } as unknown as ProcessingContext;
    return { context, stored };
  }

  it("renders the interpolated opacity at mid-curve", async () => {
    const { TimelineSequence } = await import("@nodetool-ai/models");
    const white = shapeClip("plate", "track-0", "#ffffff");
    const row = await TimelineSequence.create<
      InstanceType<typeof TimelineSequence>
    >({
      user_id: "u1",
      project_id: "default",
      name: "Fade plate",
      fps: 30,
      width: 640,
      height: 360,
      duration_ms: 4000,
      document: JSON.stringify({
        tracks: [track(0)],
        clips: [white],
        markers: []
      })
    });

    const { context, stored } = contextWithAssets();
    const edit = (await toolForCapabilityName("edit_timeline").process(context, {
      timeline_id: row.id,
      ops: [
        {
          op: "animate_clip",
          target: "plate",
          animations: [
            {
              role: "in",
              preset: "custom",
              durationMs: 2000,
              curves: [
                {
                  property: "opacity",
                  keyframes: [
                    { t: 0, value: 0 },
                    { t: 1, value: 1 }
                  ]
                }
              ]
            }
          ]
        }
      ]
    })) as { applied: number; failed: number };
    expect(edit).toMatchObject({ applied: 1, failed: 0 });

    const saved = await TimelineSequence.findById(row.id);
    const document = JSON.parse(String(saved?.document)) as {
      clips: TimelineClip[];
    };
    expect(document.clips[0].animations?.[0].custom?.curves[0].property).toBe(
      "opacity"
    );

    const preview = (await toolForCapabilityName(
      "preview_timeline_frame"
    ).process(context, {
      document,
      // Half way through a 2000ms window whose curve runs 0 → 1 linearly.
      times_ms: [1000],
      width: 160,
      width_px: 640,
      height_px: 360
    })) as {
      error?: string;
      frames: Array<{
        image: { asset_id: string };
        layers: Array<{ opacity: number }>;
      }>;
    };
    expect(preview.error).toBeUndefined();
    expect(preview.frames[0].layers[0].opacity).toBeCloseTo(0.5, 2);

    const png = stored.get(preview.frames[0].image.asset_id);
    expect(png).toBeDefined();
    // White at half opacity over the compositor's black ground is mid grey.
    // Full opacity would read 255 and a dropped curve 0 — both outside this.
    const [r, g, b] = await pixelAt(png as Uint8Array, 80, 45);
    expect(r).toBeGreaterThan(110);
    expect(r).toBeLessThan(145);
    expect(g).toBe(r);
    expect(b).toBe(r);
  });
});
