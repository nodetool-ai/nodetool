import { describe, expect, it } from "vitest";
import { getReplayRecipe } from "../src/recipe.js";
import type { ClipVersion } from "../src/types.js";

const recipe = {
  schemaVersion: 1 as const,
  task: "text_to_video" as const,
  prompt: "a cat on a roof",
  provider: "provider",
  model: "video-model",
  durationMs: 4000,
  aspectRatio: "16:9",
  resolution: "720p",
  width: 1280,
  height: 720,
  strength: 0.65,
  numInferenceSteps: 30,
  seed: 7,
  referenceAssetIds: ["reference-1"]
};

const take = (overrides: Partial<ClipVersion> = {}): ClipVersion => ({
  id: "take-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  jobId: "job-1",
  assetId: "asset-1",
  workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
  dependencyHash: "hash",
  paramOverridesSnapshot: {},
  status: "success",
  source: "generated",
  generationRecipe: recipe,
  ...overrides
});

describe("getReplayRecipe", () => {
  it("returns the immutable complete recipe", () => {
    const result = getReplayRecipe(take());
    expect(result).toEqual({ ok: true, recipe });
    if (result.ok) expect(result.recipe).toBe(recipe);
  });

  it("rejects imported, video-edit, and legacy takes with reasons", () => {
    expect(getReplayRecipe(take({ source: "imported", generationRecipe: undefined }))).toMatchObject({ ok: false });
    expect(getReplayRecipe(take({ source: "video_to_video", mediaEdit: { action: "video_edit", modelTask: "video_to_video", requestId: "r", instruction: "x", provider: "p", model: "m", sourceContext: { sequenceId: "s", clipId: "c", sourceAssetId: "a", sourceStartMs: 0, sourceEndMs: 1, timelineStartMs: 0, timelineDurationMs: 1, speedMultiplier: 1 } } }))).toMatchObject({ ok: false });
    expect(getReplayRecipe(take({ generationRecipe: undefined }))).toMatchObject({ ok: false });
  });

  it("rejects incomplete recipes", () => {
    expect(getReplayRecipe(take({ generationRecipe: { ...recipe, aspectRatio: undefined, resolution: undefined } }))).toMatchObject({ ok: false, reason: expect.stringContaining("framing") });
  });
});
