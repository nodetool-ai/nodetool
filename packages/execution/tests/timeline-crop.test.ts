/**
 * `crop_degenerate` — insets that keep no picture, with the fixture that
 * triggers the code (I12) and the controls the check must stay quiet on.
 *
 * A warning rather than an error: both compositors fall back to the whole
 * source, so the shot still renders. What the user needs told is that the
 * framing they set is not the framing they are seeing.
 *
 * The round trip matters as much as the check. `crop` is one of the fields Zod
 * would drop on every PATCH if the schema did not carry it, and a dropped field
 * leaves nothing for the check below to find — every "no issues" case would
 * then pass for the wrong reason. `field_stripped` is the validator's own
 * mechanical guard against that, so the first case simply asserts it stays
 * quiet about `crop`.
 */
import { describe, expect, it } from "vitest";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";
import type { TimelineValidation } from "../src/timeline-debug/types.js";

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

const doc = (clips: Json[]): Json => ({
  tracks: [
    {
      id: "track-1",
      name: "Video 1",
      type: "video",
      index: 0,
      visible: true,
      locked: false
    }
  ],
  clips,
  markers: []
});

const cropIssues = (result: TimelineValidation) =>
  result.warnings.filter((w) => w.code === "crop_degenerate");

describe("validateTimelineSequence — crop", () => {
  it("keeps a crop through the parse instead of stripping it", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          id: "a",
          crop: { left: 0.1, right: 0.2, top: 0.05, bottom: 0.15 }
        })
      ])
    );
    const stripped = result.warnings.filter((w) => w.code === "field_stripped");
    expect(stripped.map((w) => w.path)).toEqual([]);
  });

  it("stays quiet on a crop that keeps picture, and on no crop at all", () => {
    const result = validateTimelineSequence(
      doc([
        clip({ id: "a", crop: { left: 0.25, right: 0.25, top: 0, bottom: 0 } }),
        clip({
          id: "b",
          startMs: 1000,
          crop: { left: 0.49, right: 0.49, top: 0.49, bottom: 0.49 }
        }),
        clip({ id: "c", startMs: 2000 })
      ])
    );
    expect(cropIssues(result)).toEqual([]);
  });

  it("reports a horizontal pair that keeps nothing", () => {
    const result = validateTimelineSequence(
      doc([
        clip({ id: "a", crop: { left: 0.6, right: 0.6, top: 0, bottom: 0 } })
      ])
    );
    const issues = cropIssues(result);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ clipId: "a", path: "crop" });
    expect(issues[0]!.message).toContain("whole source");
  });

  it("reports a vertical pair that keeps nothing", () => {
    const result = validateTimelineSequence(
      doc([
        clip({ id: "a", crop: { left: 0, right: 0, top: 0.5, bottom: 0.5 } })
      ])
    );
    expect(cropIssues(result)).toHaveLength(1);
  });

  it("reports a negative inset, which no drag produces and no reader expects", () => {
    const result = validateTimelineSequence(
      doc([
        clip({ id: "a", crop: { left: -0.2, right: 0, top: 0, bottom: 0 } })
      ])
    );
    expect(cropIssues(result)).toHaveLength(1);
  });

  it("is a warning, never an error — the shot still renders", () => {
    const result = validateTimelineSequence(
      doc([
        clip({ id: "a", crop: { left: 0.6, right: 0.6, top: 0, bottom: 0 } })
      ])
    );
    expect(result.errors.map((e) => e.code)).not.toContain("crop_degenerate");
  });
});
