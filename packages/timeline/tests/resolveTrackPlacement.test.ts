import { describe, expect, it } from "vitest";
import { resolveTrackPlacement } from "../src/placement/resolveTrackPlacement.js";

describe("resolveTrackPlacement", () => {
  const tracks = [
    { id: "t1", type: "video" as const, index: 0, visible: true, locked: false, name: "V1" },
    { id: "t2", type: "audio" as const, index: 1, visible: true, locked: false, name: "A1" },
    { id: "t3", type: "video" as const, index: 2, visible: true, locked: true, name: "V2" },
  ];

  const trackLayouts = [
    { trackId: "t1", top: 0, height: 40 },
    { trackId: "t2", top: 40, height: 40 },
    { trackId: "t3", top: 80, height: 40 },
  ];

  it("resolves the track under the pointer", () => {
    const result = resolveTrackPlacement({
      tracks,
      trackLayouts,
      pointerY: 20,
      desiredStartMs: 1000,
    });
    expect(result).not.toBeNull();
    expect(result!.trackId).toBe("t1");
  });

  it("returns null when pointer is outside all tracks", () => {
    const result = resolveTrackPlacement({
      tracks,
      trackLayouts,
      pointerY: 200,
      desiredStartMs: 1000,
    });
    expect(result).toBeNull();
  });

  it("detects locked target track", () => {
    const result = resolveTrackPlacement({
      tracks,
      trackLayouts,
      pointerY: 90,
      desiredStartMs: 1000,
    });
    expect(result!.trackId).toBe("t3");
    expect(tracks.find((t) => t.id === "t3")!.locked).toBe(true);
  });

  it("marks audio media compatible with audio track", () => {
    const result = resolveTrackPlacement({
      tracks,
      trackLayouts,
      pointerY: 50,
      desiredStartMs: 0,
      mediaType: "audio",
    });
    expect(result!.isCompatible).toBe(true);
  });

  it("marks audio media incompatible with video track", () => {
    const result = resolveTrackPlacement({
      tracks,
      trackLayouts,
      pointerY: 20,
      desiredStartMs: 0,
      mediaType: "audio",
    });
    expect(result!.isCompatible).toBe(false);
  });

  it("marks video media compatible with video track", () => {
    const result = resolveTrackPlacement({
      tracks,
      trackLayouts,
      pointerY: 20,
      desiredStartMs: 0,
      mediaType: "video",
    });
    expect(result!.isCompatible).toBe(true);
  });

  it("marks overlay media compatible with video track", () => {
    const result = resolveTrackPlacement({
      tracks,
      trackLayouts,
      pointerY: 20,
      desiredStartMs: 0,
      mediaType: "overlay",
    });
    expect(result!.isCompatible).toBe(true);
  });

  it("detects overlap with existing clips on the target track", () => {
    const clips = [
      { id: "c1", trackId: "t1", startMs: 500, durationMs: 1000 },
      { id: "c2", trackId: "t1", startMs: 2000, durationMs: 500 },
    ];
    const result = resolveTrackPlacement({
      tracks,
      trackLayouts,
      pointerY: 20,
      desiredStartMs: 800,
      durationMs: 500,
      clips,
    });
    expect(result!.wouldOverlap).toBe(true);
    expect(result!.overlappingClipIds).toContain("c1");
  });

  it("clamps startMs to >= 0", () => {
    const result = resolveTrackPlacement({
      tracks,
      trackLayouts,
      pointerY: 20,
      desiredStartMs: -500,
    });
    expect(result!.startMs).toBe(0);
  });

  it("returns overlapping clip IDs sorted by intersection", () => {
    const clips = [
      { id: "c1", trackId: "t1", startMs: 0, durationMs: 1000 },
      { id: "c2", trackId: "t1", startMs: 500, durationMs: 1000 },
    ];
    const result = resolveTrackPlacement({
      tracks,
      trackLayouts,
      pointerY: 20,
      desiredStartMs: 400,
      durationMs: 300,
      clips,
    });
    expect(result!.overlappingClipIds).toEqual(["c1", "c2"]);
  });

  it("marks image media compatible with video track", () => {
    const result = resolveTrackPlacement({
      tracks,
      trackLayouts,
      pointerY: 20,
      desiredStartMs: 0,
      mediaType: "image",
    });
    expect(result!.isCompatible).toBe(true);
  });

  it("does not flag overlap when clip is on a different track", () => {
    const clips = [{ id: "c1", trackId: "t2", startMs: 0, durationMs: 1000 }];
    const result = resolveTrackPlacement({
      tracks,
      trackLayouts,
      pointerY: 20,
      desiredStartMs: 100,
      durationMs: 500,
      clips,
    });
    expect(result!.wouldOverlap).toBe(false);
    expect(result!.overlappingClipIds).toEqual([]);
  });

  it("treats undefined mediaType as compatible", () => {
    const result = resolveTrackPlacement({
      tracks,
      trackLayouts,
      pointerY: 50,
      desiredStartMs: 0,
    });
    expect(result!.isCompatible).toBe(true);
  });
});
