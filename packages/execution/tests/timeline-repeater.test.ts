/**
 * Repeater copies that run past their clip. Each copy starts `timeStepMs`
 * later than the one before and keeps the original's duration, so the copies
 * reach past the original's end and can draw over the next clip on the track.
 */
import { describe, expect, it } from "vitest";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

type Json = Record<string, unknown>;

const clip = (over: Json): Json => ({
  trackId: "track-1",
  name: "Clip",
  startMs: 0,
  durationMs: 1000,
  mediaType: "shape",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  ...over
});

const doc = (clips: Json[]): Json => ({
  tracks: [{ id: "track-1", name: "Video 1", type: "video", index: 0, visible: true, locked: false }],
  clips,
  markers: []
});

const repeater = (timeStepMs: number): Json => ({ count: 5, positionStep: { x: 100, y: 0 }, timeStepMs });
const overlaps = (clips: Json[]) =>
  validateTimelineSequence(doc(clips)).warnings.filter((w) => w.code === "clips_overlap");

describe("validateTimelineSequence — repeater copies past the clip", () => {
  it("stays quiet when the copies end before the next clip", () => {
    expect(overlaps([
      clip({ id: "a", repeater: repeater(50) }),
      clip({ id: "b", startMs: 1200 })
    ])).toEqual([]);
  });

  it("warns when the last copy reaches the next clip on the track", () => {
    // Four steps of 100ms put the last copy's end at 1400ms.
    const found = overlaps([
      clip({ id: "a", repeater: repeater(100) }),
      clip({ id: "b", startMs: 1200 })
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("repeater copies run to 1400ms");
  });

  it("stays quiet when the parent group's window ends at the cut", () => {
    expect(overlaps([
      clip({ id: "g1", mediaType: "group", trackId: "track-0", durationMs: 1000 }),
      clip({ id: "a", parentId: "g1", repeater: repeater(100) }),
      clip({ id: "b", startMs: 1000 })
    ])).toEqual([]);
  });
});
