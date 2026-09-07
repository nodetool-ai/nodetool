/**
 * Adjustment clips (D-adj): the five things a document can get wrong that the
 * renderer never complains about, each with the fixture that triggers it and a
 * control the check must stay quiet on (I12).
 *
 * None of these fail rendering — `resolveAdjustment`/`attachMattes`
 * (`render/sceneModel.ts`) each fall back to drawing something reasonable
 * (nothing treated, a field ignored, a layer left unmatted) rather than
 * throwing, which is exactly why a static check earns its keep here: nothing
 * at render time ever names the mistake.
 */
import { describe, expect, it } from "vitest";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

type Json = Record<string, unknown>;

const clip = (over: Json): Json => ({
  trackId: "track-1",
  name: "Clip",
  startMs: 0,
  durationMs: 1000,
  mediaType: "video",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  ...over
});

const adjustment = (over: Json): Json =>
  clip({ mediaType: "adjustment", name: "Adjustment", ...over });

const group = (over: Json): Json => clip({ mediaType: "group", ...over });

const track = (over: Json): Json => ({
  id: "track-1",
  name: "Video 1",
  type: "video",
  index: 0,
  visible: true,
  locked: false,
  ...over
});

const doc = (tracks: Json[], clips: Json[]): Json => ({
  tracks,
  clips,
  markers: []
});

const codesOf = (issues: ReadonlyArray<{ code: string }>): string[] =>
  issues.map((issue) => issue.code);

describe("validateTimelineSequence — adjustment clips", () => {
  describe("adjustment_no_effects", () => {
    it("flags an adjustment with no effects at all", () => {
      const result = validateTimelineSequence(
        doc([track({})], [adjustment({ id: "adj" })])
      );
      expect(codesOf(result.warnings)).toContain("adjustment_no_effects");
    });

    it("flags an adjustment whose only effect is disabled", () => {
      const result = validateTimelineSequence(
        doc(
          [track({})],
          [
            adjustment({
              id: "adj",
              effects: [{ id: "e1", type: "blur", enabled: false, radius: 4 }]
            })
          ]
        )
      );
      expect(codesOf(result.warnings)).toContain("adjustment_no_effects");
    });

    it("stays quiet on an adjustment with an enabled effect", () => {
      const result = validateTimelineSequence(
        doc(
          [
            track({ id: "track-1", index: 0 }),
            track({ id: "track-2", index: 1 })
          ],
          [
            adjustment({
              id: "adj",
              trackId: "track-1",
              effects: [{ id: "e1", type: "blur", enabled: true, radius: 4 }]
            }),
            clip({ id: "below", trackId: "track-2" })
          ]
        )
      );
      expect(codesOf(result.warnings)).not.toContain("adjustment_no_effects");
    });
  });

  describe("adjustment_treats_nothing", () => {
    it("flags an adjustment with no clip on a lower track overlapping its window", () => {
      const result = validateTimelineSequence(
        doc(
          [
            track({ id: "track-1", index: 0 }),
            track({ id: "track-2", index: 1 })
          ],
          [
            adjustment({
              id: "adj",
              trackId: "track-1",
              startMs: 0,
              durationMs: 1000,
              effects: [{ id: "e1", type: "blur", enabled: true, radius: 4 }]
            }),
            // On the lower track, but outside the adjustment's window.
            clip({ id: "below", trackId: "track-2", startMs: 5000, durationMs: 1000 })
          ]
        )
      );
      expect(codesOf(result.warnings)).toContain("adjustment_treats_nothing");
    });

    it("does not count a clip on a higher (more on-top) track", () => {
      const result = validateTimelineSequence(
        doc(
          [
            track({ id: "track-1", index: 0 }),
            track({ id: "track-2", index: 1 })
          ],
          [
            adjustment({
              id: "adj",
              trackId: "track-2",
              startMs: 0,
              durationMs: 1000,
              effects: [{ id: "e1", type: "blur", enabled: true, radius: 4 }]
            }),
            // Overlaps in time, but on track-1 (index 0 — above the adjustment).
            clip({ id: "above", trackId: "track-1", startMs: 0, durationMs: 1000 })
          ]
        )
      );
      expect(codesOf(result.warnings)).toContain("adjustment_treats_nothing");
    });

    it("stays quiet when a clip on a lower track overlaps its window", () => {
      const result = validateTimelineSequence(
        doc(
          [
            track({ id: "track-1", index: 0 }),
            track({ id: "track-2", index: 1 })
          ],
          [
            adjustment({
              id: "adj",
              trackId: "track-1",
              startMs: 0,
              durationMs: 1000,
              effects: [{ id: "e1", type: "blur", enabled: true, radius: 4 }]
            }),
            clip({ id: "below", trackId: "track-2", startMs: 0, durationMs: 1000 })
          ]
        )
      );
      expect(codesOf(result.warnings)).not.toContain("adjustment_treats_nothing");
    });
  });

  describe("adjustment_group_empty", () => {
    it("flags an adjustment parented to a group with nothing else overlapping it", () => {
      const result = validateTimelineSequence(
        doc(
          [track({})],
          [
            group({ id: "g" }),
            adjustment({
              id: "adj",
              parentId: "g",
              startMs: 0,
              durationMs: 1000,
              effects: [{ id: "e1", type: "blur", enabled: true, radius: 4 }]
            })
          ]
        )
      );
      expect(codesOf(result.warnings)).toContain("adjustment_group_empty");
    });

    it("stays quiet when a sibling in the group overlaps its window", () => {
      const result = validateTimelineSequence(
        doc(
          [track({})],
          [
            group({ id: "g" }),
            adjustment({
              id: "adj",
              parentId: "g",
              startMs: 0,
              durationMs: 1000,
              effects: [{ id: "e1", type: "blur", enabled: true, radius: 4 }]
            }),
            clip({ id: "sibling", parentId: "g", startMs: 0, durationMs: 1000 })
          ]
        )
      );
      expect(codesOf(result.warnings)).not.toContain("adjustment_group_empty");
    });
  });

  describe("adjustment_field_ignored", () => {
    it("flags an adjustment carrying transform, borderRadius, blendMode and matte", () => {
      const result = validateTimelineSequence(
        doc(
          [track({})],
          [
            clip({ id: "src" }),
            adjustment({
              id: "adj",
              transform: {
                position: { x: 0, y: 0 },
                scale: { x: 1, y: 1 },
                rotation: 0,
                anchor: { x: 0.5, y: 0.5 }
              },
              borderRadius: 8,
              blendMode: "screen",
              matte: { sourceClipId: "src", mode: "luma" }
            })
          ]
        )
      );
      const issue = result.warnings.find(
        (w) => w.code === "adjustment_field_ignored"
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("transform");
      expect(issue?.message).toContain("borderRadius");
      expect(issue?.message).toContain("blendMode");
      expect(issue?.message).toContain("matte");
    });

    it("stays quiet on an adjustment carrying none of those fields", () => {
      const result = validateTimelineSequence(
        doc(
          [
            track({ id: "track-1", index: 0 }),
            track({ id: "track-2", index: 1 })
          ],
          [
            adjustment({
              id: "adj",
              trackId: "track-1",
              effects: [{ id: "e1", type: "blur", enabled: true, radius: 4 }]
            }),
            clip({ id: "below", trackId: "track-2" })
          ]
        )
      );
      expect(codesOf(result.warnings)).not.toContain("adjustment_field_ignored");
    });
  });

  describe("matte_source_invalid", () => {
    it("flags a matte whose source names an adjustment clip", () => {
      const result = validateTimelineSequence(
        doc(
          [
            track({ id: "track-1", index: 0 }),
            track({ id: "track-2", index: 1 })
          ],
          [
            adjustment({
              id: "adj",
              trackId: "track-1",
              effects: [{ id: "e1", type: "blur", enabled: true, radius: 4 }]
            }),
            clip({
              id: "matted",
              trackId: "track-2",
              matte: { sourceClipId: "adj", mode: "luma" }
            })
          ]
        )
      );
      expect(codesOf(result.warnings)).toContain("matte_source_invalid");
    });

    it("stays quiet when the matte source is an ordinary clip", () => {
      const result = validateTimelineSequence(
        doc(
          [track({})],
          [
            clip({ id: "src" }),
            clip({
              id: "matted",
              matte: { sourceClipId: "src", mode: "luma" }
            })
          ]
        )
      );
      expect(codesOf(result.warnings)).not.toContain("matte_source_invalid");
    });
  });
});
