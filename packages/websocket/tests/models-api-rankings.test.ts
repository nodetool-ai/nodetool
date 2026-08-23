/**
 * The ranked-model merge behind the task-specific `/api/models/recommended/*`
 * endpoints: hand-pinned RECOMMENDED_MODELS entries first, the task
 * leaderboard after them, one row per canonical model.
 *
 * The helper takes the artifact as a parameter, so a fixture drives it
 * directly — nothing here mocks a module. The endpoint tests below run against
 * the shipped artifact, which the nightly sync rewrites, so they pin the merge
 * contract rather than the rows it produces today.
 */
import { describe, it, expect } from "vitest";
import { RECOMMENDED_MODELS } from "@nodetool-ai/runtime";
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

/** What an endpoint answers before the merge: its modality, then its task. */
const base = (modality: string, task?: string): UnifiedModel[] =>
  RECOMMENDED_MODELS.filter(
    (model) => model.modality === modality && (!task || model.task === task)
  );

/** The response shape: JSON drops undefined fields the in-memory value keeps. */
const json = (models: UnifiedModel[]): UnifiedModel[] =>
  JSON.parse(JSON.stringify(models)) as UnifiedModel[];

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
  /** Each endpoint, the task it merges, and the pinned base it merges onto. */
  const cases: Array<[string, string, UnifiedModel[]]> = [
    ["/recommended/image/text-to-image", "text_to_image", base("image", "text_to_image")],
    ["/recommended/image/image-to-image", "image_to_image", base("image", "image_to_image")],
    ["/recommended/video/text-to-video", "text_to_video", base("video", "text_to_video")],
    ["/recommended/video/image-to-video", "image_to_video", base("video", "image_to_video")],
    ["/recommended/tts", "text_to_speech", base("tts")],
    ["/recommended/music", "text_to_music", base("music")]
  ];

  /**
   * The shipped artifact is rewritten by the nightly sync, so what an endpoint
   * appends today is not what it appends next week. Pin the contract instead:
   * each endpoint merges the leaderboard for its own task onto its own pinned
   * base, and every row it adds is a usable model of the task's type.
   */
  for (const [path, task, pinnedBase] of cases) {
    it(`GET ${path} merges the ${task} leaderboard onto the pinned entries`, async () => {
      const res = await handleModelsApiRequest(get(path));
      expect(res!.status).toBe(200);
      const body = (await res!.json()) as UnifiedModel[];

      const head = json(pinnedBase);
      expect(body.slice(0, head.length)).toEqual(head);
      expect(body).toEqual(json(mergeRankedRecommendations(pinnedBase, task)));

      // The type comes off the pinned entries, not off RANKED_TASK_MODEL_TYPE:
      // reading the table the merge reads would assert it against itself.
      const types = new Set(head.map((model) => model.type));
      expect(types.size, `${path} pins one model type`).toBe(1);
      const [type] = types;
      for (const model of body.slice(head.length)) {
        expect(model.type, model.id).toBe(type);
        expect(model.id, path).not.toBe("");
        expect(model.name, model.id).not.toBe("");
        expect(model.provider, model.id).toBeTruthy();
        expect(model.downloaded, model.id).toBe(false);
        expect(model.repo_id, model.id).toBeNull();
        expect(model.path, model.id).toBeNull();
      }

      const keys = body.map((model) => `${model.provider ?? ""}::${model.id}`);
      expect(new Set(keys).size, "one row per provider route").toBe(keys.length);
    });
  }

  it("leaves an endpoint with no ranked surface at its pinned entries", async () => {
    // `/recommended/asr` never calls the merge, so no leaderboard can reach it
    // however full the artifact gets.
    const res = await handleModelsApiRequest(get("/recommended/asr"));
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual(json(base("asr")));
  });
});
