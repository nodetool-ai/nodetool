/**
 * The package tests op-conformance.mjs skips, replaced here:
 *
 * - "splitClip preserves clip metadata and source references across both
 *   halves" checks `toBe` on nested objects. A value that crossed a process
 *   boundary is a copy, so the same case runs with deep equality. The same
 *   applies to "rateStretchClips leaves a time-remapped clip alone" and
 *   "slideClips leaves a group clip alone".
 */
import { describe, expect, it } from "vitest";
import * as native from "./native-ops.ts";

function makeBaseClip(): any {
  return {
    id: "clip-1",
    trackId: "track-1",
    name: "Base clip",
    startMs: 100,
    durationMs: 400,
    inPointMs: 50,
    outPointMs: 450,
    mediaType: "video",
    sourceType: "generated",
    workflowId: "workflow-1",
    paramOverrides: { prompt: "hello" },
    dependencyHash: "dep-hash",
    lastGeneratedHash: "last-hash",
    currentAssetId: "asset-1",
    status: "generated",
    locked: false,
    versions: [
      {
        id: "version-1",
        createdAt: "2026-05-05T14:00:00.000Z",
        jobId: "job-1",
        assetId: "asset-1",
        workflowUpdatedAt: "2026-05-05T14:00:00.000Z",
        dependencyHash: "dep-hash",
        paramOverridesSnapshot: {},
        status: "success"
      }
    ]
  };
}

describe("known differences", () => {
  it("splitClip preserves clip metadata and source references across both halves (deep equality)", () => {
    const clip = makeBaseClip();
    const [left, right] = native.splitClip(clip, 250);
    for (const half of [left, right]) {
      expect(half.workflowId).toBe(clip.workflowId);
      expect(half.currentAssetId).toBe(clip.currentAssetId);
      expect(half.paramOverrides).toStrictEqual(clip.paramOverrides);
      expect(half.dependencyHash).toBe(clip.dependencyHash);
      expect(half.lastGeneratedHash).toBe(clip.lastGeneratedHash);
      expect(half.versions).toStrictEqual(clip.versions);
    }
    expect(left.startMs).toBe(clip.startMs);
    expect(left.durationMs).toBe(150);
    expect(right.startMs).toBe(250);
    expect(right.durationMs).toBe(250);
    expect(left.inPointMs).toBe(50);
    expect(left.outPointMs).toBe(200);
    expect(right.inPointMs).toBe(200);
    expect(right.outPointMs).toBe(450);
  });

});

describe("unchanged results, with deep equality", () => {
  const clip = (id: string, extra: any = {}) => ({
    id, trackId: "v1", name: id, startMs: 0, durationMs: 1000, mediaType: "video",
    sourceType: "imported", status: "draft", locked: false, versions: [], ...extra
  });
  it("rateStretchClips leaves a time-remapped clip alone", () => {
    const remapped = clip("a", { timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }] } });
    expect(native.rateStretchClips([remapped], new Set(["a"]), "a", "end", 2000)).toEqual([remapped]);
  });
  it("slideClips leaves a group clip alone", () => {
    const grouped = [clip("g", { mediaType: "group" })];
    expect(native.slideClips(grouped, new Set(["g"]), 100)).toEqual(grouped);
  });
});
