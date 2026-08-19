/**
 * The rankings term in `find_model`'s scoring: a leaderboard orders the field,
 * an explicit hint still wins, and an empty artifact leaves both the score and
 * the answer shape exactly as they were before rankings existed.
 *
 * The helpers take the artifact as a parameter, so a fixture drives them
 * directly — nothing here mocks a module.
 */

import { describe, expect, it } from "vitest";
import { BaseProvider } from "@nodetool-ai/runtime";
import type {
  ImageModel,
  ProcessingContext,
  ProviderId
} from "@nodetool-ai/runtime";
import type { ModelRankingsArtifact } from "@nodetool-ai/model-pricing/model-rankings";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import {
  RANK_BONUS_MAX,
  findModel,
  rankCandidate,
  scoreCandidate
} from "../src/capabilities/models.js";

const ctx = { userId: "u1" } as ProcessingContext;

/**
 * Two routes to one canonical video model, plus a second model ranked lower.
 * `kling-3-pro` tops text_to_video and sits mid-field on image_to_video, so a
 * best-task fallback and an exact-task lookup answer differently.
 */
const FIXTURE: ModelRankingsArtifact = {
  schemaVersion: 1,
  source: "test",
  generatedAt: "2026-08-19T00:00:00.000Z",
  models: {
    "fal_ai:fal-ai/kling-video/v3/pro": {
      canonical: "kling-3-pro",
      name: "Kling 3 Pro",
      creator: "Kuaishou",
      tasks: {
        text_to_video: { score: 1123, normalized: 1, rank: 1, of: 41 },
        image_to_video: { score: 1101, normalized: 0.5, rank: 12, of: 38 }
      }
    },
    "kie:kling/v3-pro": {
      canonical: "kling-3-pro",
      name: "Kling 3 Pro",
      creator: "Kuaishou",
      tasks: {
        text_to_video: { score: 1123, normalized: 1, rank: 1, of: 41 },
        image_to_video: { score: 1101, normalized: 0.5, rank: 12, of: 38 }
      }
    },
    "fal_ai:fal-ai/minor-video": {
      canonical: "minor-video",
      name: "Minor Video",
      tasks: {
        text_to_video: { score: 900, normalized: 0.25, rank: 30, of: 41 }
      }
    }
  }
};

const RANKED = {
  providerId: "fal_ai",
  model: { id: "fal-ai/kling-video/v3/pro", name: "Kling 3 Pro", provider: "fal_ai" },
  recommended: false,
  modelHints: new Set<string>(),
  preferLocal: false,
  rankedCapability: true
};

const UNRANKED = {
  ...RANKED,
  model: { id: "some/unlisted-model", name: "Unlisted", provider: "fal_ai" }
};

describe("the rank term", () => {
  it("puts a ranked model above an unranked one for the requested task", () => {
    const ranked = scoreCandidate({ ...RANKED, task: "text_to_video" }, FIXTURE);
    const unranked = scoreCandidate(
      { ...UNRANKED, task: "text_to_video" },
      FIXTURE
    );
    expect(unranked.score).toBe(0);
    expect(ranked.score).toBe(RANK_BONUS_MAX);
    expect(ranked.score).toBeGreaterThan(unranked.score);
  });

  it("scales with the leaderboard position, bounded at 80", () => {
    const top = scoreCandidate({ ...RANKED, task: "text_to_video" }, FIXTURE);
    const mid = scoreCandidate({ ...RANKED, task: "image_to_video" }, FIXTURE);
    expect(top.score).toBe(80);
    expect(mid.score).toBe(40);
  });

  it("falls back to the model's best task when the caller named none", () => {
    const best = scoreCandidate(RANKED, FIXTURE);
    expect(best.score).toBe(80);
    expect(best.fields.ranked_task).toBe("text_to_video");
  });

  it("does not fall back for a capability rankings do not cover", () => {
    const language = scoreCandidate(
      { ...RANKED, rankedCapability: false },
      FIXTURE
    );
    expect(language.score).toBe(0);
    expect(language.fields.rank).toBeUndefined();
    // The grouping is still reported — it is a fact about the model, not a task.
    expect(language.fields.canonical).toBe("kling-3-pro");
  });

  it("stays below every explicit preference", () => {
    const ranked = scoreCandidate({ ...RANKED, task: "text_to_video" }, FIXTURE);
    const hintedProvider = scoreCandidate(
      { ...UNRANKED, task: "text_to_video", providerHint: "fal_ai" },
      FIXTURE
    );
    const hintedModel = scoreCandidate(
      {
        ...UNRANKED,
        task: "text_to_video",
        modelHints: new Set(["some/unlisted-model"])
      },
      FIXTURE
    );
    const recommended = scoreCandidate(
      { ...UNRANKED, task: "text_to_video", recommended: true },
      FIXTURE
    );
    expect(hintedProvider.score).toBeGreaterThan(ranked.score);
    expect(hintedModel.score).toBeGreaterThan(ranked.score);
    expect(recommended.score).toBeGreaterThan(ranked.score);
  });
});

describe("the ranking fields", () => {
  it("reports the canonical id, the rank, and the sibling route", () => {
    const { fields } = rankCandidate(
      "fal_ai",
      "fal-ai/kling-video/v3/pro",
      "text_to_video",
      true,
      FIXTURE
    );
    expect(fields).toEqual({
      canonical: "kling-3-pro",
      ranked_task: "text_to_video",
      rank: 1,
      of: 41,
      alternate_routes: [{ provider: "kie", model_id: "kling/v3-pro" }]
    });
  });

  it("omits alternate_routes for a model with one route", () => {
    const { fields } = rankCandidate(
      "fal_ai",
      "fal-ai/minor-video",
      "text_to_video",
      true,
      FIXTURE
    );
    expect(fields.alternate_routes).toBeUndefined();
    expect(fields.canonical).toBe("minor-video");
  });

  it("says nothing at all about a model the artifact does not carry", () => {
    const ranking = rankCandidate(
      "fal_ai",
      "some/unlisted-model",
      "text_to_video",
      true,
      FIXTURE
    );
    expect(ranking).toEqual({ bonus: 0, fields: {} });
  });
});

describe("the shipped artifact", () => {
  it("leaves find_model's answer exactly as it was", async () => {
    // The shipped artifact is empty until the sync lands, so every result must
    // carry the pre-rankings shape and nothing else.
    class FakeImageProvider extends BaseProvider {
      constructor(
        id: ProviderId,
        private readonly models: ImageModel[]
      ) {
        super(id);
      }
      override async getAvailableImageModels(): Promise<ImageModel[]> {
        return this.models;
      }
    }
    const tool = toolFromCapability(
      findModel.spec,
      findModel.impl,
      (context) =>
        createCapabilityRun({
          context,
          gate: UNGATED,
          providers: {
            fal_ai: new FakeImageProvider("fal_ai" as ProviderId, [
              {
                id: "fal-ai/flux/schnell",
                name: "Flux Schnell",
                provider: "fal_ai"
              } as ImageModel
            ])
          }
        })
    );
    const result = (await tool.process(ctx, {
      capability: "text_to_image"
    })) as { results: Record<string, unknown>[] };
    expect(Object.keys(result.results[0]).sort()).toEqual([
      "downloaded",
      "model_id",
      "name",
      "provider",
      "recommended",
      "ref",
      "score"
    ]);
    expect(result.results[0]["score"]).toBe(0);
  });
});
