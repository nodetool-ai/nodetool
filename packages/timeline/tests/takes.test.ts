/**
 * Take switching, renaming and deletion (P0 AI Video, PRD § 8.10).
 */
import { describe, expect, it } from "vitest";

import { makeClip } from "../src/defaults.js";
import { clipSourceMsAt } from "../src/timeRemap.js";
import {
  activeTakeIdOf,
  deleteTake,
  ensureBaselineTake,
  previewTake,
  renameTake,
  selectTake
} from "../src/takes.js";
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

  it("is a no-op for a model3d clip, so a bake render never replaces the glTF source", () => {
    // Reproduces the reviewer's finding on PR #5774: bake_model3d_clip pushes
    // the rendered movie into `versions` while deliberately leaving
    // `currentAssetId` pointing at the glTF. Generic take selection has no
    // bake-aware path, so it must refuse rather than swap the source out from
    // under `model3dStyle`.
    const clip: TimelineClip = {
      ...clipWithTwoTakes(),
      mediaType: "model3d",
      currentAssetId: "gltf_1",
      versions: [version({ id: "bake_1", assetId: "movie_1" })]
    };
    const next = selectTake(clip, "bake_1");
    expect(next).toBe(clip);
    expect(next.currentAssetId).toBe("gltf_1");
  });
});

describe("activeTakeIdOf", () => {
  it("prefers the take whose assetId matches currentAssetId over a stale activeTakeId alias", () => {
    // Reproduces the reviewer's finding: a writer that patches
    // currentAssetId without updating activeTakeId (direct generation before
    // this fix) must not leave two takes reading as active, and must not let
    // the take that is actually playing be deleted.
    const clip = clipWithTwoTakes();
    clip.activeTakeId = "take_1"; // stale — currentAssetId already moved on
    clip.currentAssetId = "asset_2"; // take_2's asset
    expect(activeTakeIdOf(clip)).toBe("take_2");
  });

  it("falls back to the stored alias when no version's assetId matches currentAssetId", () => {
    // A model3d clip's currentAssetId (the glTF) is never a recorded take's
    // assetId, so there is nothing to derive from — fall back rather than
    // report no active take at all.
    const clip = clipWithTwoTakes();
    clip.currentAssetId = "gltf_1";
    clip.activeTakeId = "take_2";
    expect(activeTakeIdOf(clip)).toBe("take_2");
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

  it("refuses to delete the take actually playing even when activeTakeId is stale", () => {
    // Reproduces the reviewer's finding: activeTakeId names take_1, but
    // currentAssetId already moved on to take_2's asset (e.g. a direct
    // generation that landed without updating the alias). Deleting take_2 —
    // the asset on screen — must still be refused.
    const clip = clipWithTwoTakes();
    clip.activeTakeId = "take_1";
    clip.currentAssetId = "asset_2"; // take_2's asset
    const { clip: next, error } = deleteTake(clip, "take_2");
    expect(error).toBeTruthy();
    expect(next).toBe(clip);
  });

  it("adds an imported active asset as a baseline only once", () => {
    const clip = makeClip({
      id: "clip-1",
      mediaType: "video",
      sourceType: "imported",
      currentAssetId: "asset-original",
      versions: []
    });

    const withBaseline = ensureBaselineTake(clip, "2026-01-01T00:00:00.000Z");
    expect(withBaseline.versions).toHaveLength(1);
    expect(withBaseline.versions[0]).toMatchObject({
      assetId: "asset-original",
      source: "imported"
    });
    expect(ensureBaselineTake(withBaseline)).toBe(withBaseline);
  });

  it("maps a candidate to source zero while preserving clip-relative timing", () => {
    const clip = makeClip({
      id: "clip-1",
      startMs: 10000,
      durationMs: 4000,
      inPointMs: 40000,
      outPointMs: 44000,
      mediaType: "video",
      currentAssetId: "asset-original",
      versions: [
        {
          id: "candidate",
          createdAt: "2026-01-01T00:00:00.000Z",
          jobId: "job-1",
          assetId: "asset-candidate",
          workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
          dependencyHash: "",
          paramOverridesSnapshot: {},
          durationMs: 5000,
          status: "success",
          mediaEdit: {
            action: "video_edit",
            modelTask: "video_to_video",
            requestId: "request-1",
            instruction: "Make it warmer",
            provider: "provider-a",
            model: "edit-model",
            sourceContext: {
              sequenceId: "sequence-1",
              clipId: "clip-1",
              sourceAssetId: "asset-original",
              sourceStartMs: 40000,
              sourceEndMs: 44000,
              timelineStartMs: 10000,
              timelineDurationMs: 4000,
              speedMultiplier: 1
            }
          }
        }
      ]
    });

    const candidate = previewTake(clip, "candidate");
    expect(candidate?.currentAssetId).toBe("asset-candidate");
    expect(clipSourceMsAt(clip, 11250)).toBe(41250);
    expect(clipSourceMsAt(candidate!, 11250)).toBe(1250);
  });
});
