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
import {
  modelRankings,
  routesFor
} from "@nodetool-ai/model-pricing/model-rankings";
import type { ModelRankingsArtifact } from "@nodetool-ai/model-pricing/model-rankings";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import {
  RANK_BONUS_MAX,
  SCORE_TIERS,
  findModel,
  rankCandidate,
  scoreCandidate
} from "../src/capabilities/models.js";

const ctx = { userId: "u1" } as ProcessingContext;

/** One provider route read out of the shipped artifact, with its rank. */
interface RankedRoute {
  provider: string;
  modelId: string;
  name: string;
  rank: number;
}

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
    expect(ranked.score).toBe(SCORE_TIERS.ranked + RANK_BONUS_MAX);
    expect(ranked.score).toBeGreaterThan(unranked.score);
  });

  it("scales with the leaderboard position, bounded at 80 over the floor", () => {
    const top = scoreCandidate({ ...RANKED, task: "text_to_video" }, FIXTURE);
    const mid = scoreCandidate({ ...RANKED, task: "image_to_video" }, FIXTURE);
    expect(top.score).toBe(SCORE_TIERS.ranked + 80);
    expect(mid.score).toBe(SCORE_TIERS.ranked + 40);
  });

  it("falls back to the model's best task when the caller named none", () => {
    const best = scoreCandidate(RANKED, FIXTURE);
    expect(best.score).toBe(SCORE_TIERS.ranked + 80);
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

  it("stays below every preference the caller stated", () => {
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
    const local = scoreCandidate(
      {
        ...UNRANKED,
        providerId: "ollama",
        task: "text_to_video",
        preferLocal: true
      },
      FIXTURE
    );
    expect(hintedProvider.score).toBeGreaterThan(ranked.score);
    expect(hintedModel.score).toBeGreaterThan(ranked.score);
    expect(local.score).toBeGreaterThan(ranked.score);
  });

  it("leads the hand-pinned recommended list", () => {
    // The default pick — no hint of any kind — is the leaderboard's best, not
    // whichever model RECOMMENDED_MODELS pins. Before the ladder, recommended
    // (+100) outscored any rank (≤ +80), so `find_model("text_to_video")`
    // answered with the pinned openai model even though the artifact does not
    // rank it at all.
    const rankedTop = scoreCandidate(
      { ...RANKED, task: "text_to_video" },
      FIXTURE
    );
    const rankedLow = scoreCandidate(
      {
        ...RANKED,
        model: { id: "fal-ai/minor-video", name: "Minor Video", provider: "fal_ai" },
        task: "text_to_video"
      },
      FIXTURE
    );
    const recommendedUnranked = scoreCandidate(
      { ...UNRANKED, task: "text_to_video", recommended: true },
      FIXTURE
    );
    expect(rankedTop.score).toBeGreaterThan(recommendedUnranked.score);
    expect(rankedLow.score).toBeGreaterThan(recommendedUnranked.score);
    expect(rankedTop.score).toBeGreaterThan(rankedLow.score);
  });

  it("does not let the recommended bonus reorder the leaderboard", () => {
    // A pinned model that the artifact also ranks takes the rank tier only:
    // +100 on top of a 0…80 span would let the static list jump a better-
    // ranked model, which is the blindness the rank term exists to fix.
    const pinnedButLower = scoreCandidate(
      {
        ...RANKED,
        model: { id: "fal-ai/minor-video", name: "Minor Video", provider: "fal_ai" },
        task: "text_to_video",
        recommended: true
      },
      FIXTURE
    );
    const betterRanked = scoreCandidate(
      { ...RANKED, task: "text_to_video" },
      FIXTURE
    );
    expect(betterRanked.score).toBeGreaterThan(pinnedButLower.score);
  });

  it("still orders by the recommended list where nothing is ranked", () => {
    const recommended = scoreCandidate(
      { ...UNRANKED, task: "text_to_video", recommended: true },
      FIXTURE
    );
    const plain = scoreCandidate(
      { ...UNRANKED, task: "text_to_video" },
      FIXTURE
    );
    expect(recommended.score).toBe(SCORE_TIERS.recommended);
    expect(recommended.score).toBeGreaterThan(plain.score);
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
  class FakeImageProvider extends BaseProvider {
    constructor(
      id: ProviderId,
      readonly served: ImageModel[]
    ) {
      super(id);
    }
    override async getAvailableImageModels(): Promise<ImageModel[]> {
      return this.served;
    }
  }

  function findModelOver(
    providers: Record<string, BaseProvider>
  ): ReturnType<typeof toolFromCapability> {
    return toolFromCapability(findModel.spec, findModel.impl, (context) =>
      createCapabilityRun({ context, gate: UNGATED, providers })
    );
  }

  /** The best and the worst text-to-image route the shipped artifact carries. */
  function extremes(): { top: RankedRoute; bottom: RankedRoute } {
    const routes: RankedRoute[] = [];
    for (const [key, entry] of Object.entries(modelRankings.models)) {
      const rank = entry.tasks?.["text_to_image"];
      const colon = key.indexOf(":");
      if (!rank || colon <= 0) continue;
      routes.push({
        provider: key.slice(0, colon),
        modelId: key.slice(colon + 1),
        name: entry.name,
        rank: rank.rank
      });
    }
    routes.sort((a, b) => a.rank - b.rank);
    const top = routes[0];
    const bottom = routes[routes.length - 1];
    // A one-model leaderboard would make the ordering assertion vacuous.
    expect(top).toBeDefined();
    expect(bottom.rank).toBeGreaterThan(top.rank);
    return { top, bottom };
  }

  it("orders find_model's answer by the leaderboard", async () => {
    const { top, bottom } = extremes();
    const providers: Record<string, BaseProvider> = {};
    // Served worst-first, so the answer's order can only come from the score.
    for (const route of [bottom, top]) {
      providers[route.provider] = new FakeImageProvider(
        route.provider as ProviderId,
        [
          {
            id: route.modelId,
            name: route.name,
            provider: route.provider,
            supportedTasks: ["text_to_image"]
          } as ImageModel
        ]
      );
    }
    const result = (await findModelOver(providers).process(ctx, {
      capability: "text_to_image",
      task: "text_to_image"
    })) as { results: Record<string, unknown>[] };
    expect(result.results[0]["model_id"]).toBe(top.modelId);
    expect(result.results[0]["rank"]).toBe(top.rank);
    expect(result.results[1]["model_id"]).toBe(bottom.modelId);
    // Scored apart, not merely sorted apart: the ids also happen to sort this
    // way, so equal scores would let the tiebreak pass this test on nothing.
    expect(result.results[0]["score"]).toBeGreaterThan(
      Number(result.results[1]["score"])
    );
  });

  it("answers with one row per model, not one per route", async () => {
    // The leaderboard leader is reachable through several providers. Five of
    // those routes in a top-5 would show the caller one model.
    const { top } = extremes();
    const entry = modelRankings.models[`${top.provider}:${top.modelId}`];
    const siblings = routesFor(entry?.canonical ?? "");
    expect(siblings.length).toBeGreaterThan(1);

    const providers: Record<string, BaseProvider> = {};
    for (const route of siblings) {
      const existing = providers[route.provider];
      const model = {
        id: route.modelId,
        name: entry?.name ?? route.modelId,
        provider: route.provider,
        supportedTasks: ["text_to_image"]
      } as ImageModel;
      providers[route.provider] = new FakeImageProvider(
        route.provider as ProviderId,
        existing instanceof FakeImageProvider
          ? [...existing.served, model]
          : [model]
      );
    }

    const result = (await findModelOver(providers).process(ctx, {
      capability: "text_to_image",
      task: "text_to_image"
    })) as { results: Record<string, unknown>[]; total: number };
    expect(result.total).toBe(siblings.length);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]["canonical"]).toBe(entry?.canonical);
    expect(
      (result.results[0]["alternate_routes"] as unknown[]).length
    ).toBe(siblings.length - 1);
  });

  it("leaves an unranked model's answer in the pre-rankings shape", async () => {
    // No entry for this id in the artifact, so no ranking field appears and
    // the score is what it was before rankings existed.
    const result = (await findModelOver({
      fal_ai: new FakeImageProvider("fal_ai" as ProviderId, [
        {
          id: "fal-ai/flux/schnell",
          name: "Flux Schnell",
          provider: "fal_ai"
        } as ImageModel
      ])
    }).process(ctx, { capability: "text_to_image" })) as {
      results: Record<string, unknown>[];
    };
    expect(Object.keys(result.results[0]).sort()).toEqual([
      "downloaded",
      "id",
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
