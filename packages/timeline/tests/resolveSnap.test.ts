import { describe, expect, it } from "vitest";
import { resolveSnap } from "../src/snapping/resolveSnap.js";

describe("resolveSnap", () => {
  it("snaps to a candidate within threshold", () => {
    const result = resolveSnap(100, [120], 5, 5);
    expect(result.value).toBe(120);
    expect(result.snapped).toBe(true);
  });

  it("returns original time when no candidate is in threshold", () => {
    const result = resolveSnap(100, [150], 5, 5);
    expect(result.value).toBe(100);
    expect(result.snapped).toBe(false);
  });

  it("picks the closest candidate", () => {
    const result = resolveSnap(100, [95, 103, 120], 5, 5);
    expect(result.value).toBe(103);
    expect(result.snapped).toBe(true);
  });

  it("breaks ties deterministically toward the smaller candidate", () => {
    const result = resolveSnap(100, [103, 97], 1, 3);
    expect(result.value).toBe(97);
    expect(result.snapped).toBe(true);
  });

  it("reports snapped: false when value is unchanged", () => {
    const result = resolveSnap(500, [1000], 2, 10);
    expect(result.snapped).toBe(false);
    expect(result.value).toBe(500);
  });

  it("reports correct distanceMs and distancePx", () => {
    const result = resolveSnap(100, [130], 10, 5);
    expect(result.value).toBe(130);
    expect(result.distanceMs).toBe(30);
    expect(result.distancePx).toBe(6);
  });

  it("works with empty candidates array", () => {
    const result = resolveSnap(100, [], 5, 5);
    expect(result.value).toBe(100);
    expect(result.snapped).toBe(false);
    expect(result.distanceMs).toBe(0);
  });

  it("returns zero distancePx when msPerPx is zero", () => {
    const result = resolveSnap(100, [100], 5, 0);
    expect(result.value).toBe(100);
    expect(result.distancePx).toBe(0);
  });

  it("reports snapped: true when a candidate sits exactly on the input time", () => {
    // The closest candidate equals timeMs, so value is unchanged but a snap
    // target was still found and adopted.
    const result = resolveSnap(100, [100, 101], 5, 5);
    expect(result.value).toBe(100);
    expect(result.snapped).toBe(true);
    expect(result.distanceMs).toBe(0);
  });

  it("snaps when candidate is exactly at threshold edge", () => {
    // thresholdMs = 5 * 5 = 25. Candidate at 125 is distance 25, which is
    // <= thresholdMs, so it should snap.
    const result = resolveSnap(100, [125], 5, 5);
    expect(result.value).toBe(125);
    expect(result.snapped).toBe(true);
  });
});
