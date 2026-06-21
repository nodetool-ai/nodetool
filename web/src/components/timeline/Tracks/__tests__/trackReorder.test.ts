import { describe, it, expect } from "@jest/globals";
import type { TimelineTrack } from "@nodetool-ai/timeline";
import { computeReorderedTrackIds } from "../trackReorder";

type T = Pick<TimelineTrack, "id" | "type">;

// V1 V2 V3 (video) then A1 A2 (audio) — the canonical contiguous layout.
const tracks: T[] = [
  { id: "v1", type: "video" },
  { id: "v2", type: "video" },
  { id: "v3", type: "video" },
  { id: "a1", type: "audio" },
  { id: "a2", type: "audio" }
];

describe("computeReorderedTrackIds", () => {
  it("moves a video track down within the video block (drop after)", () => {
    expect(
      computeReorderedTrackIds(tracks, "v1", "v3", "after")
    ).toEqual(["v2", "v3", "v1", "a1", "a2"]);
  });

  it("moves a video track up within the video block (drop before)", () => {
    expect(
      computeReorderedTrackIds(tracks, "v3", "v1", "before")
    ).toEqual(["v3", "v1", "v2", "a1", "a2"]);
  });

  it("reorders audio tracks among themselves", () => {
    expect(
      computeReorderedTrackIds(tracks, "a2", "a1", "before")
    ).toEqual(["v1", "v2", "v3", "a2", "a1"]);
  });

  it("rejects cross-type drops (audio onto video)", () => {
    expect(computeReorderedTrackIds(tracks, "a1", "v2", "after")).toBeNull();
    expect(computeReorderedTrackIds(tracks, "v1", "a1", "before")).toBeNull();
  });

  it("returns null when dropping a track onto itself", () => {
    expect(computeReorderedTrackIds(tracks, "v2", "v2", "before")).toBeNull();
  });

  it("returns null for no-op moves (order unchanged)", () => {
    // Dropping v1 before v2 leaves it first — no change.
    expect(computeReorderedTrackIds(tracks, "v1", "v2", "before")).toBeNull();
    // Dropping v2 after v1 leaves v2 second — no change.
    expect(computeReorderedTrackIds(tracks, "v2", "v1", "after")).toBeNull();
  });

  it("returns null for unknown ids", () => {
    expect(computeReorderedTrackIds(tracks, "nope", "v1", "after")).toBeNull();
    expect(computeReorderedTrackIds(tracks, "v1", "nope", "after")).toBeNull();
  });
});
