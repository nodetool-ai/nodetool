/**
 * The ranked-model merge behind the task-specific `/api/models/recommended/*`
 * endpoints: hand-pinned RECOMMENDED_MODELS entries first, the task
 * leaderboard after them, one row per canonical model.
 *
 * The helper takes the artifact as a parameter, so a fixture drives it
 * directly — nothing here mocks a module. The endpoint tests below run
 * against the shipped artifact, whose contents the nightly sync rewrites, so
 * they assert the merge's invariants rather than a fixed list of models.
 */
import { describe, it, expect } from "vitest";
import { RECOMMENDED_MODELS } from "@nodetool-ai/runtime";
import { rankedForTask } from "@nodetool-ai/model-pricing";
import type { ModelRankingsArtifact } from "@nodetool-ai/model-pricing";
import type { UnifiedModel } from "@nodetool-ai/protocol";
import {
  handleModelsApiRequest,
  mergeRankedRecommendations
} from "../src/models-api.js";

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

function get(path: string): Request {
  return new Request(`http://localhost/api/models${path}`, { method: "GET" });
}

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

describe("recommended endpoints with the shipped artifact", () => {
  /**
   * What the endpoint must answer for a ranked task, whatever the sync last
   * wrote: the pinned entries first and unchanged, then the task's
   * leaderboard in rank order, one row per canonical model, and nothing
   * listed twice.
   */
  async function expectPinnedThenRanked(
    path: string,
    task: string,
    base: UnifiedModel[],
    type: string
  ): Promise<void> {
    const res = await handleModelsApiRequest(get(path));
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as UnifiedModel[];

    expect(body.slice(0, base.length)).toEqual(
      JSON.parse(JSON.stringify(base))
    );

    const pinnedKeys = new Set(
      base.map((model) => `${model.provider ?? ""}::${model.id}`)
    );
    const expectedTail = rankedForTask(task)
      .filter(
        (entry) =>
          !entry.routes.some((route) =>
            pinnedKeys.has(`${route.provider}::${route.modelId}`)
          )
      )
      .map((entry) => entry.name);
    expect(body.slice(base.length).map((model) => model.name)).toEqual(
      expectedTail
    );

    for (const model of body.slice(base.length)) {
      expect(model.type).toBe(type);
    }
    const keys = body.map((model) => `${model.provider ?? ""}::${model.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  }

  const cases: Array<[string, string, string]> = [
    ["/recommended/image/text-to-image", "text_to_image", "image_model"],
    ["/recommended/image/image-to-image", "image_to_image", "image_model"],
    ["/recommended/video/text-to-video", "text_to_video", "video_model"],
    ["/recommended/video/image-to-video", "image_to_video", "video_model"]
  ];

  for (const [path, task, type] of cases) {
    it(`GET ${path} pins first, then the ${task} leaderboard`, async () => {
      await expectPinnedThenRanked(path, task, pinned(task), type);
    });
  }

  it("GET /recommended/tts and /recommended/music merge by modality", async () => {
    const byModality = (modality: string): UnifiedModel[] =>
      RECOMMENDED_MODELS.filter((model) => model.modality === modality);

    await expectPinnedThenRanked(
      "/recommended/tts",
      "text_to_speech",
      byModality("tts"),
      "tts_model"
    );
    await expectPinnedThenRanked(
      "/recommended/music",
      "text_to_music",
      byModality("music"),
      "music_model"
    );
  });

  it("has something to merge, so the assertions above are not vacuous", () => {
    // A leaderboard that answered with nothing would make every tail above an
    // empty list, and the endpoint tests would pass on an empty artifact.
    expect(rankedForTask("text_to_image").length).toBeGreaterThan(0);
    expect(rankedForTask("text_to_video").length).toBeGreaterThan(0);
  });
});
