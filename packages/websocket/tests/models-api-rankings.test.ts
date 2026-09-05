/**
 * The ranked-model merge: hand-pinned RECOMMENDED_MODELS entries first, the
 * task leaderboard after them, one row per canonical model.
 *
 * The helper takes the artifact as a parameter, so a fixture drives it
 * directly — nothing here mocks a module.
 */
import { describe, it, expect } from "vitest";
import { RECOMMENDED_MODELS } from "@nodetool-ai/runtime";
import { rankedForTask } from "@nodetool-ai/model-pricing";
import type { ModelRankingsArtifact } from "@nodetool-ai/model-pricing";
import type { UnifiedModel } from "@nodetool-ai/protocol";
import { mergeRankedRecommendations } from "../src/models-api.js";

const EMPTY_ARTIFACT: ModelRankingsArtifact = {
  schemaVersion: 1,
  source: "test",
  generatedAt: null,
  models: {}
};

/**
 * Three canonical models ranked for text_to_video:
 *  - kling-3-pro (rank 1) has two routes, FAL first;
 *  - sora-2 (rank 2) is also a pinned RECOMMENDED_MODELS entry (openai:sora-2);
 *  - veo-4 (rank 3) is stored out of rank order to pin the sort.
 */
const ARTIFACT: ModelRankingsArtifact = {
  schemaVersion: 1,
  source: "test",
  generatedAt: "2026-08-19T00:00:00.000Z",
  models: {
    "fal_ai:fal-ai/kling-video/v3/pro": {
      canonical: "kling-3-pro",
      name: "Kling 3 Pro",
      tasks: {
        text_to_video: { score: 1123, normalized: 0.94, rank: 1, of: 3 }
      }
    },
    "kie:kling/v3-pro": {
      canonical: "kling-3-pro",
      name: "Kling 3 Pro",
      tasks: {
        text_to_video: { score: 1123, normalized: 0.94, rank: 1, of: 3 }
      }
    },
    "fal_ai:fal-ai/veo/4": {
      canonical: "veo-4",
      name: "Veo 4",
      tasks: {
        text_to_video: { score: 1002, normalized: 0.71, rank: 3, of: 3 }
      }
    },
    "openai:sora-2": {
      canonical: "sora-2",
      name: "Sora 2",
      tasks: {
        text_to_video: { score: 1080, normalized: 0.85, rank: 2, of: 3 }
      }
    }
  }
};

const pinned = (task: string): UnifiedModel[] =>
  RECOMMENDED_MODELS.filter((model) => model.task === task);

describe("mergeRankedRecommendations", () => {
  it("appends ranked models after the pinned entries, in rank order", () => {
    const base = pinned("text_to_video");
    const merged = mergeRankedRecommendations(base, "text_to_video", ARTIFACT);

    expect(merged.slice(0, base.length)).toEqual(base);
    expect(merged.slice(base.length).map((m) => m.name)).toEqual([
      "Kling 3 Pro",
      "Veo 4"
    ]);
  });

  it("emits one entry per canonical model, using its first route", () => {
    const merged = mergeRankedRecommendations([], "text_to_video", ARTIFACT);
    const kling = merged.filter((m) => m.name === "Kling 3 Pro");

    expect(kling).toHaveLength(1);
    expect(kling[0]).toEqual({
      id: "fal-ai/kling-video/v3/pro",
      type: "video_model",
      name: "Kling 3 Pro",
      repo_id: null,
      path: null,
      downloaded: false,
      provider: "fal_ai"
    });
  });

  it("skips a ranked model already pinned in RECOMMENDED_MODELS", () => {
    const base = pinned("text_to_video");
    expect(base.some((m) => m.provider === "openai" && m.id === "sora-2")).toBe(
      true
    );

    const merged = mergeRankedRecommendations(base, "text_to_video", ARTIFACT);
    const soras = merged.filter(
      (m) => m.provider === "openai" && m.id === "sora-2"
    );
    expect(soras).toHaveLength(1);
  });

  it("returns the base unchanged for an empty artifact", () => {
    const base = pinned("text_to_video");
    expect(
      mergeRankedRecommendations(base, "text_to_video", EMPTY_ARTIFACT)
    ).toEqual(base);
  });

  it("returns the base unchanged for a task with no ranked surface", () => {
    const base = pinned("text_generation");
    expect(
      mergeRankedRecommendations(base, "text_generation", ARTIFACT)
    ).toEqual(base);
  });
});

describe("the shipped artifact", () => {
  it("has something to merge, so a ranked task is never an empty tail", () => {
    expect(rankedForTask("text_to_image").length).toBeGreaterThan(0);
    expect(rankedForTask("text_to_video").length).toBeGreaterThan(0);
  });
});
