/**
 * F17: `MAX_VIDEO_LAYERS` used to drop layers with a bare `continue`, so a
 * frame quietly lost a clip and nothing said which one. Two halves are tested
 * against one fixture: the scene model now names each clip it turned away, and
 * the validator warns before a render that any of it happens.
 *
 * The validator's half is a sweep over the clip windows, not a walk over
 * sampled frames — the last test here is an overlap one frame interval could
 * step straight over.
 */
import { describe, expect, it } from "vitest";

import type { TimelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  MAX_VIDEO_LAYERS,
  computeActiveLayersWithHorizon
} from "@nodetool-ai/timeline/scene";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

interface ClipSpec {
  id: string;
  startMs: number;
  durationMs: number;
}

/** One video track per clip, so every clip competes for a video slot. */
function document(specs: ClipSpec[]): TimelineDocument {
  return {
    tracks: specs.map((spec, index) => ({
      id: `track-${spec.id}`,
      name: `Video ${index}`,
      type: "video" as const,
      index,
      visible: true,
      locked: false
    })),
    clips: specs.map((spec) => ({
      id: spec.id,
      trackId: `track-${spec.id}`,
      name: spec.id,
      startMs: spec.startMs,
      durationMs: spec.durationMs,
      mediaType: "video" as const,
      sourceType: "imported" as const,
      status: "generated" as const,
      currentAssetId: `asset-${spec.id}`,
      locked: false,
      versions: []
    })),
    markers: []
  };
}

/** `n` video clips all live over the same window. */
const stacked = (n: number, durationMs = 10_000): ClipSpec[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `clip-${i}`,
    startMs: 0,
    durationMs
  }));

const layerCapWarnings = (doc: TimelineDocument) =>
  validateTimelineSequence(doc).warnings.filter(
    (issue) => issue.code === "layer_cap_exceeded"
  );

describe("video layer cap", () => {
  it("drops one layer and warns once when nine video clips overlap", () => {
    const doc = document(stacked(9));

    const { layers, droppedLayers } = computeActiveLayersWithHorizon(
      doc.tracks,
      doc.clips,
      100
    );
    expect(layers).toHaveLength(MAX_VIDEO_LAYERS);
    expect(droppedLayers).toEqual([
      { clipId: "clip-8", reason: "video_layer_cap" }
    ]);

    const warnings = layerCapWarnings(doc);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("9 video clips overlap at 0ms");
    // A warning, never an error: the frame still renders, minus a layer.
    expect(validateTimelineSequence(doc).ok).toBe(true);
  });

  // I12: the check has to be able to stay quiet, or it is reporting nothing
  // about the document.
  it("says nothing at exactly the cap", () => {
    const doc = document(stacked(MAX_VIDEO_LAYERS));
    expect(computeActiveLayersWithHorizon(doc.tracks, doc.clips, 100)
      .droppedLayers).toEqual([]);
    expect(layerCapWarnings(doc)).toEqual([]);
  });

  it("says nothing when nine clips never coincide", () => {
    const doc = document(
      Array.from({ length: 9 }, (_, i) => ({
        id: `clip-${i}`,
        startMs: i * 1000,
        durationMs: 1000
      }))
    );
    expect(layerCapWarnings(doc)).toEqual([]);
  });

  it("ignores image clips, which the compositor does not cap", () => {
    const doc = document(stacked(9));
    const imageClips = doc.clips.map((clip) => ({
      ...clip,
      mediaType: "image" as const
    }));
    expect(layerCapWarnings({ ...doc, clips: imageClips })).toEqual([]);
  });

  it("ignores clips on a hidden track", () => {
    const doc = document(stacked(9));
    const tracks = doc.tracks.map((track, index) =>
      index === 0 ? { ...track, visible: false } : track
    );
    expect(layerCapWarnings({ ...doc, tracks })).toEqual([]);
  });

  it("catches an overlap shorter than a frame at 30fps", () => {
    // Eight clips fill [0, 10000). The ninth opens at 9999 — a 1ms window that
    // no 33.3ms sample lands in, so a frame-sampling implementation would call
    // this document clean. The sweep reads the boundaries themselves.
    const doc = document([
      ...stacked(MAX_VIDEO_LAYERS),
      { id: "clip-late", startMs: 9_999, durationMs: 1_000 }
    ]);

    const frameMs = 1000 / 30;
    const sampled = Array.from({ length: 400 }, (_, i) => i * frameMs).filter(
      (timeMs) =>
        computeActiveLayersWithHorizon(doc.tracks, doc.clips, timeMs)
          .droppedLayers.length > 0
    );
    expect(sampled).toEqual([]);

    const warnings = layerCapWarnings(doc);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("9 video clips overlap at 9999ms");
  });
});
