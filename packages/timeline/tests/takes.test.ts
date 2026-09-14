/**
 * Take switching, renaming and deletion (P0 AI Video, PRD § 8.10).
 */
import { describe, expect, it } from "vitest";

import { makeClip } from "../src/defaults.js";
import { deleteTake, renameTake, selectTake } from "../src/takes.js";
import type { ClipVersion, TimelineClip } from "../src/types.js";

function version(overrides: Partial<ClipVersion> = {}): ClipVersion {
  return {
    id: "take_1",
    createdAt: "2026-01-01T00:00:00.000Z",
    jobId: "job_1",
    assetId: "asset_1",
    workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
    dependencyHash: "hash_1",
    paramOverridesSnapshot: {},
    status: "success",
    ...overrides
  };
}

function clipWithTwoTakes(): TimelineClip {
  return makeClip({
    id: "clip_1",
    trackId: "track_1",
    name: "Shot",
    startMs: 1000,
    durationMs: 5000,
    mediaType: "video",
    sourceType: "generated",
    status: "generated",
    currentAssetId: "asset_2",
    activeTakeId: "take_2",
    dependencyHash: "hash_2",
    // Editorial fields the take ops must never touch.
    locked: false,
    opacity: 0.5,
    effects: [{ id: "fx_1", type: "vignette", enabled: true, amount: 0.3 } as never],
    versions: [
      version({ id: "take_1", assetId: "asset_1", dependencyHash: "hash_1" }),
      version({
        id: "take_2",
        assetId: "asset_2",
        dependencyHash: "hash_2",
        createdAt: "2026-01-02T00:00:00.000Z"
      })
    ]
  });
}

describe("selectTake", () => {
  it("switches currentAssetId/activeTakeId without touching editorial fields", () => {
    const clip = clipWithTwoTakes();
    const next = selectTake(clip, "take_1");

    expect(next.currentAssetId).toBe("asset_1");
    expect(next.activeTakeId).toBe("take_1");
    expect(next.status).toBe("stale"); // dependencyHash no longer matches
    // Untouched.
    expect(next.startMs).toBe(clip.startMs);
    expect(next.durationMs).toBe(clip.durationMs);
    expect(next.trackId).toBe(clip.trackId);
    expect(next.opacity).toBe(clip.opacity);
    expect(next.effects).toEqual(clip.effects);
    expect(next.versions).toEqual(clip.versions);
  });

  it("sets status to generated when the restored take matches the clip's dependencyHash", () => {
    const clip = clipWithTwoTakes();
    clip.dependencyHash = "hash_1";
    const next = selectTake(clip, "take_1");
    expect(next.status).toBe("generated");
  });

  it("is a no-op for a missing take", () => {
    const clip = clipWithTwoTakes();
    const next = selectTake(clip, "nope");
    expect(next).toBe(clip);
  });

  it("is a no-op for a take that did not finish successfully", () => {
    const clip = clipWithTwoTakes();
    clip.versions = [
      ...clip.versions,
      version({ id: "take_3", assetId: "asset_3", status: "failed" })
    ];
    const next = selectTake(clip, "take_3");
    expect(next).toBe(clip);
  });
});

describe("renameTake", () => {
  it("sets a take's label", () => {
    const clip = clipWithTwoTakes();
    const next = renameTake(clip, "take_1", "Wide shot");
    expect(next.versions.find((v) => v.id === "take_1")?.label).toBe(
      "Wide shot"
    );
    // The other take, and everything else, is untouched.
    expect(next.versions.find((v) => v.id === "take_2")?.label).toBeUndefined();
    expect(next.currentAssetId).toBe(clip.currentAssetId);
  });

  it("is a no-op for a take id not on the clip", () => {
    const clip = clipWithTwoTakes();
    const next = renameTake(clip, "nope", "Wide shot");
    expect(next).toBe(clip);
  });
});

describe("deleteTake", () => {
  it("refuses to delete the sole take on a clip with an active asset", () => {
    const clip = clipWithTwoTakes();
    clip.versions = [clip.versions[1]!]; // only the active take left
    const { clip: next, error } = deleteTake(clip, "take_2");
    expect(error).toBeTruthy();
    expect(next).toBe(clip);
  });

  it("refuses to delete the active take when other takes exist", () => {
    const clip = clipWithTwoTakes();
    const { clip: next, error } = deleteTake(clip, "take_2");
    expect(error).toBeTruthy();
    expect(next).toBe(clip);
    expect(next.versions).toHaveLength(2);
  });

  it("succeeds deleting a non-active take", () => {
    const clip = clipWithTwoTakes();
    const { clip: next, error } = deleteTake(clip, "take_1");
    expect(error).toBeUndefined();
    expect(next.versions.map((v) => v.id)).toEqual(["take_2"]);
    // Editorial fields untouched.
    expect(next.currentAssetId).toBe(clip.currentAssetId);
    expect(next.activeTakeId).toBe(clip.activeTakeId);
  });

  it("reports an error for an unknown take id", () => {
    const clip = clipWithTwoTakes();
    const { clip: next, error } = deleteTake(clip, "nope");
    expect(error).toBeTruthy();
    expect(next).toBe(clip);
  });
});
