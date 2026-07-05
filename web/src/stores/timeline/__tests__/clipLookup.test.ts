/**
 * @jest-environment node
 */
import { clipsById, findClipById } from "../clipLookup";
import type { TimelineClip } from "@nodetool-ai/timeline";

const makeClip = (id: string): TimelineClip =>
  ({
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
  }) as unknown as TimelineClip;

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
