/**
 * @jest-environment node
 */
import {
  trackTypeMeta,
  trackIndexWithinType,
  buildTypedIndexMap
} from "../trackVisuals";

const makeTrack = (
  id: string,
  type: "video" | "audio" | "overlay" | "subtitle",
  index: number
) => ({
  id,
  name: `${type}-${id}`,
  type,
  index,
  visible: true,
  locked: false
});

describe("trackTypeMeta", () => {
  it("returns correct meta for video", () => {
    const meta = trackTypeMeta("video");
    expect(meta.prefix).toBe("V");
    expect(meta.label).toBe("Video");
  });

  it("returns correct meta for audio", () => {
    const meta = trackTypeMeta("audio");
    expect(meta.prefix).toBe("A");
    expect(meta.label).toBe("Audio");
  });

  it("returns correct meta for overlay", () => {
    const meta = trackTypeMeta("overlay");
    expect(meta.prefix).toBe("O");
    expect(meta.label).toBe("Overlay");
  });

  it("returns correct meta for subtitle", () => {
    const meta = trackTypeMeta("subtitle");
    expect(meta.prefix).toBe("T");
    expect(meta.label).toBe("Text");
  });

  it("falls back to video for unknown types", () => {
    const meta = trackTypeMeta("unknown" as never);
    expect(meta.prefix).toBe("V");
  });
});

describe("trackIndexWithinType", () => {
  const tracks = [
    makeTrack("v1", "video", 0),
    makeTrack("a1", "audio", 1),
    makeTrack("v2", "video", 2),
    makeTrack("a2", "audio", 3),
    makeTrack("v3", "video", 4)
  ];

  it("returns 1-based index within same type", () => {
    expect(trackIndexWithinType(tracks as never[], "v1")).toBe(1);
    expect(trackIndexWithinType(tracks as never[], "v2")).toBe(2);
    expect(trackIndexWithinType(tracks as never[], "v3")).toBe(3);
  });

  it("counts independently per type", () => {
    expect(trackIndexWithinType(tracks as never[], "a1")).toBe(1);
    expect(trackIndexWithinType(tracks as never[], "a2")).toBe(2);
  });

  it("returns 1 for missing track id", () => {
    expect(trackIndexWithinType(tracks as never[], "nonexistent")).toBe(1);
  });

  it("returns 1 for empty track list", () => {
    expect(trackIndexWithinType([], "v1")).toBe(1);
  });
});

describe("buildTypedIndexMap", () => {
  const tracks = [
    makeTrack("v1", "video", 0),
    makeTrack("a1", "audio", 1),
    makeTrack("v2", "video", 2),
    makeTrack("o1", "overlay", 3),
    makeTrack("a2", "audio", 4)
  ];

  it("returns a Map with correct size", () => {
    const map = buildTypedIndexMap(tracks as never[]);
    expect(map.size).toBe(5);
  });

  it("assigns per-type indices matching trackIndexWithinType", () => {
    const map = buildTypedIndexMap(tracks as never[]);
    for (const t of tracks) {
      expect(map.get(t.id)).toBe(
        trackIndexWithinType(tracks as never[], t.id)
      );
    }
  });

  it("returns empty map for empty tracks", () => {
    const map = buildTypedIndexMap([]);
    expect(map.size).toBe(0);
  });
});
