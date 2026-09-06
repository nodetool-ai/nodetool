/**
 * The three template derivations: `fillTimelineText`, `cloneTimelineForBoard`
 * and `retargetSequence`.
 *
 * Every produced sequence is run through `expectValidDocument`, which parses it
 * with the same `timelineDocument` zod schema `validateTimelineSequence`
 * (`@nodetool-ai/execution/timeline-debug`) parses before its structural checks
 * — that validator itself cannot be imported here, because `execution` depends
 * on this package. The helper also asserts nothing was stripped from a clip, so
 * a derivation that invented a field would fail rather than lose it silently.
 *
 * The cases that must fail if the code regressed:
 * - `fillTimelineText` blanking an unresolved key (asserted `{{price}}` stays)
 * - `cloneTimelineForBoard` touching a foreign clip (asserted byte-identical)
 * - `retargetSequence` rescaling only the base of a keyframed transform
 *   (asserted on every keyframe of the curve)
 */
import { describe, it, expect } from "vitest";
import { timelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { cloneTimelineForBoard } from "../src/clone.js";
import { fillTimelineText } from "../src/fill-text.js";
import { retargetSequence } from "../src/retarget.js";
import { makeClip, makeSequence, makeTrack } from "../src/defaults.js";
import { setKeyframe } from "../src/keyframes.js";
import { frameSizeForAspect } from "../src/storyboard.js";
import type { TimelineClip, TimelineSequence } from "../src/types.js";

const BOARD = "board-template";
const COPY = "board-copy";

/** Parse the document half of a sequence the way the validator does first. */
function expectValidDocument(seq: TimelineSequence): void {
  const parsed = timelineDocument.safeParse({
    tracks: seq.tracks,
    clips: seq.clips,
    markers: seq.markers,
    templateId: seq.templateId
  });
  expect(parsed.error?.issues ?? []).toEqual([]);
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  // Nothing a clip carries may be dropped by the schema: a stripped field is
  // how lineage and provenance are lost on the first save.
  for (const [index, clip] of seq.clips.entries()) {
    expect(Object.keys(parsed.data.clips[index]).sort()).toEqual(
      Object.keys(clip).sort()
    );
  }
}

/** A cut with two board shot clips, a text overlay and a music bed. */
function templateCut(): TimelineSequence {
  const shotTrack = makeTrack({ id: "trk-shots", name: "Shots", index: 0 });
  const textTrack = makeTrack({
    id: "trk-text",
    name: "Text",
    type: "overlay",
    index: 1
  });
  const musicTrack = makeTrack({
    id: "trk-music",
    name: "Music",
    type: "audio",
    index: 2
  });

  const shot = (n: number): TimelineClip =>
    makeClip({
      id: `clip-shot-${n}`,
      trackId: shotTrack.id,
      name: `Shot ${n}`,
      startMs: (n - 1) * 4000,
      durationMs: 4000,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      currentAssetId: `asset-shot-${n}`,
      thumbnailAssetId: `asset-thumb-${n}`,
      storyboardBoardId: BOARD,
      storyboardShotId: `shot-${n}`
    });

  const overlay = makeClip({
    id: "clip-text",
    trackId: textTrack.id,
    name: "Lower third",
    startMs: 500,
    durationMs: 3000,
    mediaType: "text",
    sourceType: "generated",
    status: "generated",
    textStyle: {
      text: "{{name}} — {{price}}",
      fontSizePx: 72,
      color: "#ffffff"
    }
  });

  const music = makeClip({
    id: "clip-music",
    trackId: musicTrack.id,
    name: "Bed",
    startMs: 0,
    durationMs: 8000,
    mediaType: "audio",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset-music"
  });

  return makeSequence({
    id: "seq-template",
    projectId: "default",
    name: "Hero 16:9",
    width: 1920,
    height: 1080,
    durationMs: 8000,
    tracks: [shotTrack, textTrack, musicTrack],
    clips: [shot(1), shot(2), overlay, music]
  });
}

const clipById = (seq: TimelineSequence, id: string): TimelineClip => {
  const clip = seq.clips.find((c) => c.id === id);
  if (!clip) throw new Error(`no clip ${id}`);
  return clip;
};

describe("fillTimelineText", () => {
  it("fills a text clip and reports the keys", () => {
    const seq = templateCut();

    const result = fillTimelineText(seq, { name: "Aero 9", price: "$79" });

    expect(clipById(result.sequence, "clip-text").textStyle?.text).toBe(
      "Aero 9 — $79"
    );
    expect(result.filled).toEqual(["name", "price"]);
    expect(result.unresolved).toEqual([]);
    expectValidDocument(result.sequence);
  });

  it("leaves a placeholder with no value in place and reports it", () => {
    const seq = templateCut();

    const result = fillTimelineText(seq, { name: "Aero 9" });

    expect(clipById(result.sequence, "clip-text").textStyle?.text).toBe(
      "Aero 9 — {{price}}"
    );
    expect(result.filled).toEqual(["name"]);
    expect(result.unresolved).toEqual(["price"]);
    expectValidDocument(result.sequence);
  });

  it("fills caption words", () => {
    const seq = templateCut();
    seq.clips.push(
      makeClip({
        id: "clip-vo",
        trackId: "trk-music",
        name: "VO",
        startMs: 0,
        durationMs: 2000,
        mediaType: "audio",
        sourceType: "imported",
        caption: {
          words: [
            { word: "Meet", startMs: 0, endMs: 400 },
            { word: "{{name}}", startMs: 400, endMs: 900 },
            { word: "for", startMs: 900, endMs: 1200 },
            { word: "{{price}}", startMs: 1200, endMs: 1800 }
          ]
        }
      })
    );

    const result = fillTimelineText(seq, { name: "Aero 9" });

    expect(
      clipById(result.sequence, "clip-vo").caption?.words.map((w) => w.word)
    ).toEqual(["Meet", "Aero 9", "for", "{{price}}"]);
    expect(result.unresolved).toEqual(["price"]);
    expectValidDocument(result.sequence);
  });

  it("does not mutate the source and returns untouched clips by reference", () => {
    const seq = templateCut();

    const result = fillTimelineText(seq, { name: "Aero 9", price: "$79" });

    expect(clipById(seq, "clip-text").textStyle?.text).toBe(
      "{{name}} — {{price}}"
    );
    expect(clipById(result.sequence, "clip-music")).toBe(
      clipById(seq, "clip-music")
    );
  });
});

describe("cloneTimelineForBoard", () => {
  it("re-stamps every owned clip onto the copy and clears its media", () => {
    const seq = templateCut();

    const cloned = cloneTimelineForBoard(seq, { boardId: BOARD }, { boardId: COPY });

    for (const id of ["clip-shot-1", "clip-shot-2"]) {
      const clip = clipById(cloned, id);
      expect(clip.storyboardBoardId).toBe(COPY);
      expect(clip.storyboardShotId).toBe(clipById(seq, id).storyboardShotId);
      expect(clip.currentAssetId).toBeUndefined();
      expect(clip.thumbnailAssetId).toBeUndefined();
      expect(clip.versions).toEqual([]);
      expect(clip.status).toBe("draft");
      // Placement is the approved edit and survives the clone.
      expect(clip.startMs).toBe(clipById(seq, id).startMs);
      expect(clip.durationMs).toBe(clipById(seq, id).durationMs);
    }
    expectValidDocument(cloned);
  });

  it("copies every foreign clip and every track verbatim", () => {
    const seq = templateCut();

    const cloned = cloneTimelineForBoard(seq, { boardId: BOARD }, { boardId: COPY });

    expect(clipById(cloned, "clip-text")).toEqual(clipById(seq, "clip-text"));
    expect(clipById(cloned, "clip-music")).toEqual(clipById(seq, "clip-music"));
    expect(cloned.tracks).toEqual(seq.tracks);
    expect(cloned.markers).toEqual(seq.markers);
  });

  it("takes a fresh id and stamps templateId with the source's", () => {
    const seq = templateCut();

    const cloned = cloneTimelineForBoard(seq, { boardId: BOARD }, { boardId: COPY });

    expect(cloned.id).not.toBe(seq.id);
    expect(cloned.templateId).toBe("seq-template");
    expect(seq.templateId).toBeUndefined();
  });

  it("leaves a clip owned by some other board alone", () => {
    const seq = templateCut();
    seq.clips.push(
      makeClip({
        id: "clip-other",
        trackId: "trk-shots",
        startMs: 8000,
        durationMs: 1000,
        currentAssetId: "asset-other",
        storyboardBoardId: "board-elsewhere"
      })
    );

    const cloned = cloneTimelineForBoard(seq, { boardId: BOARD }, { boardId: COPY });

    expect(clipById(cloned, "clip-other")).toEqual(clipById(seq, "clip-other"));
  });

  it("carries the filled overlay text when the copy is filled afterwards", () => {
    const seq = templateCut();

    const cloned = cloneTimelineForBoard(seq, { boardId: BOARD }, { boardId: COPY });
    const filled = fillTimelineText(cloned, { name: "Aero 9", price: "$79" });

    expect(clipById(filled.sequence, "clip-text").textStyle?.text).toBe(
      "Aero 9 — $79"
    );
    expect(filled.sequence.templateId).toBe("seq-template");
  });
});

describe("retargetSequence", () => {
  it("resizes the canvas and stamps lineage", () => {
    const seq = templateCut();

    const { sequence } = retargetSequence(seq, "9:16", "cover");

    expect({ width: sequence.width, height: sequence.height }).toEqual(
      frameSizeForAspect("9:16")
    );
    expect(sequence.id).not.toBe(seq.id);
    expect(sequence.templateId).toBe("seq-template");
    expect(seq.width).toBe(1920);
    expectValidDocument(sequence);
  });

  it("scales clips to fill under cover and reports every cropped clip", () => {
    const seq = templateCut();

    const { sequence, croppedClipIds } = retargetSequence(seq, "9:16", "cover");

    // 1920x1080 → 1080x1920: contain-fit to cover-fit is 1920/1080 ÷ 1080/1920.
    const expected = (1920 / 1080) / (1080 / 1920);
    expect(clipById(sequence, "clip-shot-1").transform?.scale.x).toBeCloseTo(
      expected,
      6
    );
    // The text overlay is rasterized at frame size, so it is neither scaled
    // nor cropped: only the two shots lose their sides.
    expect(clipById(sequence, "clip-text").transform?.scale.x).toBe(1);
    expect(croppedClipIds).toEqual(["clip-shot-1", "clip-shot-2"]);
    expectValidDocument(sequence);
  });

  it("letterboxes under contain and crops nothing that fit before", () => {
    const seq = templateCut();

    const { sequence, croppedClipIds } = retargetSequence(seq, "9:16", "contain");

    expect(clipById(sequence, "clip-shot-1").transform?.scale.x).toBe(1);
    expect(croppedClipIds).toEqual([]);
    expectValidDocument(sequence);
  });

  it("reports a clip already zoomed past the frame even under contain", () => {
    const seq = templateCut();
    const zoomed = clipById(seq, "clip-shot-2");
    zoomed.transform = {
      position: { x: 0, y: 0 },
      scale: { x: 1.4, y: 1.4 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 }
    };

    const { croppedClipIds } = retargetSequence(seq, "9:16", "contain");

    expect(croppedClipIds).toEqual(["clip-shot-2"]);
  });

  it("keeps a clip's place in the frame by scaling its position per axis", () => {
    const seq = templateCut();
    clipById(seq, "clip-text").transform = {
      position: { x: 480, y: -270 },
      scale: { x: 1, y: 1 },
      rotation: 0.25,
      anchor: { x: 0.5, y: 0.5 }
    };

    const { sequence } = retargetSequence(seq, "1:1", "contain");

    const transform = clipById(sequence, "clip-text").transform;
    // 1920x1080 → 1080x1080: x by 1080/1920, y by 1080/1080.
    expect(transform?.position.x).toBeCloseTo(480 * (1080 / 1920), 6);
    expect(transform?.position.y).toBeCloseTo(-270, 6);
    expect(transform?.rotation).toBe(0.25);
    expect(transform?.anchor).toEqual({ x: 0.5, y: 0.5 });
  });

  it("rescales a text clip's font size with the short edge", () => {
    const seq = templateCut();

    const wider = retargetSequence(seq, "9:16", "contain").sequence;
    const square = retargetSequence(seq, "1:1", "contain").sequence;

    // 16:9 and 9:16 both have a 1080 short edge; 1:1 does too.
    expect(clipById(wider, "clip-text").textStyle?.fontSizePx).toBe(72);
    expect(clipById(square, "clip-text").textStyle?.fontSizePx).toBe(72);
  });

  it("rescales the font size when the short edge actually moves", () => {
    const seq = templateCut();
    seq.width = 960;
    seq.height = 540;

    const { sequence } = retargetSequence(seq, "16:9", "contain");

    // 540 → 1080 short edge, so the title doubles rather than staying 72px.
    expect(clipById(sequence, "clip-text").textStyle?.fontSizePx).toBe(144);
  });

  it("rescales every keyframe of a keyframed transform, not just the base", () => {
    const seq = templateCut();
    const clip = clipById(seq, "clip-shot-1");
    clip.transform = {
      position: { x: 200, y: 100 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 }
    };
    // A pan across the frame plus a fade: pixels move with the canvas, the
    // multiplier does not.
    clip.animations = setKeyframe(clip, "offsetX", 0, -400);
    clip.animations = setKeyframe({ ...clip }, "offsetX", 4000, 400);
    clip.animations = setKeyframe({ ...clip }, "offsetY", 2000, 120);
    clip.animations = setKeyframe({ ...clip }, "opacity", 0, 0.5);

    const { sequence } = retargetSequence(seq, "1:1", "contain");

    const curves = clipById(sequence, "clip-shot-1").animations?.[0].custom
      ?.curves;
    const curveFor = (property: string) =>
      curves?.find((c) => c.property === property)?.keyframes ?? [];
    const sx = 1080 / 1920;

    expect(curveFor("offsetX").map((kf) => kf.value)).toEqual([
      -400 * sx,
      400 * sx
    ]);
    expect(curveFor("offsetY").map((kf) => kf.value)).toEqual([120]);
    expect(curveFor("opacity").map((kf) => kf.value)).toEqual([0.5]);
    // The base moved too, by the same rule.
    expect(clipById(sequence, "clip-shot-1").transform?.position.x).toBeCloseTo(
      200 * sx,
      6
    );
    expectValidDocument(sequence);
  });

  it("leaves a clip with no animations without one", () => {
    const seq = templateCut();

    const { sequence } = retargetSequence(seq, "1:1", "cover");

    expect(clipById(sequence, "clip-music").animations).toBeUndefined();
  });
});
