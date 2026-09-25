/**
 * @jest-environment node
 */
import {
  clipIdsByTrack,
  clipsById,
  findClipById,
  visibleClipIdsByTrack
} from "../clipLookup";
import { stub } from "../../../test-utils/doubles";
import type { TimelineClip } from "@nodetool-ai/timeline";

const makeClip = (id: string): TimelineClip =>
  stub<TimelineClip>({
    id,
    trackId: "t1",
    name: "",
    startMs: 0,
    durationMs: 1000,
    mediaType: "audio",
    sourceType: "generated",
    locked: false,
    versions: [],
    status: "generated",
  });

describe("clipLookup", () => {
  describe("clipsById", () => {
    it("builds an index from clips array", () => {
      const clips = [makeClip("a"), makeClip("b"), makeClip("c")];
      const index = clipsById(clips);
      expect(index.size).toBe(3);
      expect(index.get("a")).toBe(clips[0]);
      expect(index.get("b")).toBe(clips[1]);
      expect(index.get("c")).toBe(clips[2]);
    });

    it("returns the same Map for the same array reference", () => {
      const clips = [makeClip("x")];
      const first = clipsById(clips);
      const second = clipsById(clips);
      expect(first).toBe(second);
    });

    it("returns a new Map for a different array reference", () => {
      const clips1 = [makeClip("x")];
      const clips2 = [makeClip("x")];
      const map1 = clipsById(clips1);
      const map2 = clipsById(clips2);
      expect(map1).not.toBe(map2);
    });

    it("handles empty array", () => {
      const clips: TimelineClip[] = [];
      const index = clipsById(clips);
      expect(index.size).toBe(0);
    });
  });

  describe("findClipById", () => {
    it("finds a clip by id", () => {
      const clips = [makeClip("a"), makeClip("b")];
      expect(findClipById(clips, "a")).toBe(clips[0]);
      expect(findClipById(clips, "b")).toBe(clips[1]);
    });

    it("returns undefined for missing id", () => {
      const clips = [makeClip("a")];
      expect(findClipById(clips, "missing")).toBeUndefined();
    });

    it("returns undefined for empty clips", () => {
      expect(findClipById([], "any")).toBeUndefined();
    });

    it("uses cached index on repeated lookups", () => {
      const clips = [makeClip("a"), makeClip("b"), makeClip("c")];
      const r1 = findClipById(clips, "a");
      const r2 = findClipById(clips, "b");
      const r3 = findClipById(clips, "c");
      expect(r1).toBe(clips[0]);
      expect(r2).toBe(clips[1]);
      expect(r3).toBe(clips[2]);
      // Verify caching: same array reference produces same Map
      expect(clipsById(clips)).toBe(clipsById(clips));
    });
  });
});

describe("clipIdsByTrack", () => {
  const onTrack = (id: string, trackId: string): TimelineClip => ({
    ...makeClip(id),
    trackId
  });

  it("groups ids by track in clips order", () => {
    const clips = [onTrack("a", "t1"), onTrack("b", "t2"), onTrack("c", "t1")];
    const index = clipIdsByTrack(clips);
    expect(index.get("t1")).toEqual(["a", "c"]);
    expect(index.get("t2")).toEqual(["b"]);
    expect(index.get("t3")).toBeUndefined();
  });

  it("returns the same Map (and arrays) for the same clips reference", () => {
    const clips = [onTrack("a", "t1")];
    expect(clipIdsByTrack(clips)).toBe(clipIdsByTrack(clips));
    expect(clipIdsByTrack(clips).get("t1")).toBe(clipIdsByTrack(clips).get("t1"));
  });

  it("rebuilds for a new clips reference", () => {
    const first = [onTrack("a", "t1")];
    const second = [...first];
    expect(clipIdsByTrack(first)).not.toBe(clipIdsByTrack(second));
  });
});

describe("visibleClipIdsByTrack", () => {
  it("windows a sparse track without changing paint order", () => {
    const clips = [
      { ...makeClip("later"), startMs: 20_000, durationMs: 500 },
      { ...makeClip("spanning"), startMs: 0, durationMs: 30_000 },
      { ...makeClip("near"), startMs: 1000, durationMs: 500 }
    ];
    expect(visibleClipIdsByTrack(clips, "t1", 900, 2000)).toEqual([
      "spanning",
      "near"
    ]);
  });

  it("keeps spanning clips and document paint order in a dense track", () => {
    const clips = Array.from({ length: 100 }, (_, index) => ({
      ...makeClip(`clip-${index}`),
      startMs: index * 1000,
      durationMs: 500
    }));
    clips.push({ ...makeClip("long"), startMs: 0, durationMs: 100_000 });

    expect(visibleClipIdsByTrack(clips, "t1", 50_000, 52_000)).toEqual([
      "clip-50",
      "clip-51",
      "long"
    ]);
    expect(visibleClipIdsByTrack(clips, "t1", 50_000, 52_000, "clip-2")).toEqual([
      "clip-2",
      "clip-50",
      "clip-51",
      "long"
    ]);
  });

  it("locates a small window in a large sparse track", () => {
    const clips = Array.from({ length: 10_000 }, (_, index) => ({
      ...makeClip(`clip-${index}`),
      startMs: index * 1000,
      durationMs: 500
    }));
    clips.push({ ...makeClip("spanning"), startMs: 0, durationMs: 10_000_000 });
    expect(visibleClipIdsByTrack(clips, "t1", 9_000_000, 9_002_000)).toEqual([
      "clip-9000",
      "clip-9001",
      "spanning"
    ]);
  });
});
