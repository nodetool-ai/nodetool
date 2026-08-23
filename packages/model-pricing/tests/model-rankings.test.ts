/**
 * The rankings accessors. Grouping and leaderboard behavior is pinned against
 * a fixture passed in as an argument — the accessors take the artifact, so no
 * module is mocked. The shipped artifact is whatever the last sync wrote, so
 * the block below asserts its invariants rather than its contents.
 */
import { describe, it, expect } from "vitest";
import {
  buildRankingsIndex,
  getCanonicalId,
  getModelRank,
  modelRankings,
  rankedForTask,
  routesFor,
  type ModelRankingsArtifact
} from "../src/model-rankings.js";

const KLING_TASKS = {
  text_to_video: { score: 1123, normalized: 0.94, rank: 2, of: 41 },
  image_to_video: { score: 1101, normalized: 0.91, rank: 3, of: 38 }
};

const fixture: ModelRankingsArtifact = {
  schemaVersion: 1,
  source: "artificialanalysis.ai",
  generatedAt: "2026-08-19T00:00:00.000Z",
  models: {
    "fal_ai:fal-ai/kling-video/v3/pro": {
      canonical: "kling-3-pro",
      name: "Kling 3 Pro",
      creator: "Kuaishou",
      tasks: { ...KLING_TASKS }
    },
    "kie:kling/v3-pro": {
      canonical: "kling-3-pro",
      name: "Kling 3 Pro",
      creator: "Kuaishou",
      tasks: { ...KLING_TASKS }
    },
    "fal_ai:fal-ai/veo3": {
      canonical: "veo-3",
      name: "Veo 3",
      creator: "Google",
      tasks: {
        text_to_video: { score: 1180, normalized: 1, rank: 1, of: 41 }
      }
    },
    "fal_ai:fal-ai/flux/schnell": {
      canonical: "flux-schnell",
      name: "FLUX schnell",
      tasks: {
        text_to_image: { score: 980, normalized: 0.6, rank: 12, of: 60 }
      }
    }
  }
};

describe("the shipped artifact", () => {
  it("carries the schema this package reads", () => {
    expect(modelRankings.schemaVersion).toBe(1);
    expect(modelRankings.source).toBe("artificialanalysis.ai");
    // Empty until a sync runs, a timestamp after — never something else.
    if (Object.keys(modelRankings.models).length === 0) {
      expect(modelRankings.generatedAt).toBeNull();
    } else {
      expect(modelRankings.generatedAt).toEqual(expect.any(String));
    }
  });

  it("keys every entry `provider:model_id` and groups it by a canonical id", () => {
    const entries = Object.entries(modelRankings.models);
    for (const [key, entry] of entries) {
      const colon = key.indexOf(":");
      expect(colon).toBeGreaterThan(0);
      expect(key.length).toBeGreaterThan(colon + 1);
      expect(entry.canonical).toBeTruthy();
      expect(entry.name).toBeTruthy();
    }
  });

  it("gives every route to one model identical tasks", () => {
    // Quality is a property of the model, never of the route — the accessors
    // and `find_model`'s rank term both rely on it.
    const byCanonical = new Map<string, Record<string, unknown>>();
    for (const entry of Object.values(modelRankings.models)) {
      const first = byCanonical.get(entry.canonical);
      if (first) {
        expect(entry.tasks).toEqual(first);
      } else {
        byCanonical.set(entry.canonical, entry.tasks);
      }
    }
  });

  it("answers for a route it carries and with nothing for one it does not", () => {
    const [key, entry] = Object.entries(modelRankings.models)[0] ?? [];
    if (!key || !entry) {
      // An empty artifact is a valid shipped state: every accessor is total.
      expect(getModelRank("fal_ai", "fal-ai/kling-video/v3/pro")).toBeNull();
      expect(rankedForTask("text_to_video")).toEqual([]);
      return;
    }
    const colon = key.indexOf(":");
    const provider = key.slice(0, colon);
    const modelId = key.slice(colon + 1);
    expect(getModelRank(provider, modelId)).toMatchObject({
      canonical: entry.canonical
    });
    expect(getCanonicalId(provider, modelId)).toBe(entry.canonical);
    expect(routesFor(entry.canonical).length).toBeGreaterThan(0);
    for (const task of Object.keys(entry.tasks)) {
      expect(rankedForTask(task).length).toBeGreaterThan(0);
    }

    expect(getModelRank(provider, "nodetool-test/not-a-real-model")).toBeNull();
    expect(getCanonicalId("nodetool-test", modelId)).toBeNull();
    expect(routesFor("nodetool-test-not-a-canonical-id")).toEqual([]);
    expect(rankedForTask("not_a_task")).toEqual([]);
  });
});

describe("getModelRank", () => {
  it("reads one route's entry", () => {
    expect(
      getModelRank("fal_ai", "fal-ai/kling-video/v3/pro", fixture)
    ).toMatchObject({
      canonical: "kling-3-pro",
      name: "Kling 3 Pro",
      creator: "Kuaishou"
    });
  });

  it("returns null for an unranked model, a null provider, and a bad pair", () => {
    expect(getModelRank("fal_ai", "fal-ai/nobody-ranks-this", fixture)).toBeNull();
    expect(getModelRank(null, "fal-ai/kling-video/v3/pro", fixture)).toBeNull();
    // The kie id under the FAL provider is not a route the artifact carries.
    expect(getModelRank("fal_ai", "kling/v3-pro", fixture)).toBeNull();
  });
});

describe("getCanonicalId", () => {
  it("gives both routes the same grouping key", () => {
    expect(
      getCanonicalId("fal_ai", "fal-ai/kling-video/v3/pro", fixture)
    ).toBe("kling-3-pro");
    expect(getCanonicalId("kie", "kling/v3-pro", fixture)).toBe("kling-3-pro");
  });

  it("is null for an unranked model", () => {
    expect(getCanonicalId("kie", "not-a-model", fixture)).toBeNull();
  });
});

describe("routesFor", () => {
  it("returns every provider route to one canonical model", () => {
    const routes = routesFor("kling-3-pro", fixture);
    expect(routes.map(({ provider, modelId }) => ({ provider, modelId }))).toEqual([
      { provider: "fal_ai", modelId: "fal-ai/kling-video/v3/pro" },
      { provider: "kie", modelId: "kling/v3-pro" }
    ]);
  });

  it("carries identical tasks on every route — quality is the model's", () => {
    const [fal, kie] = routesFor("kling-3-pro", fixture);
    expect(fal.entry.tasks).toEqual(kie.entry.tasks);
    expect(fal.entry.tasks.text_to_video).toEqual({
      score: 1123,
      normalized: 0.94,
      rank: 2,
      of: 41
    });
  });

  it("is empty for an unknown canonical id", () => {
    expect(routesFor("no-such-model", fixture)).toEqual([]);
  });
});

describe("rankedForTask", () => {
  it("sorts by rank ascending, one row per canonical model", () => {
    const rows = rankedForTask("text_to_video", fixture);
    expect(rows.map((r) => r.canonical)).toEqual(["veo-3", "kling-3-pro"]);
    expect(rows[1]).toMatchObject({
      canonical: "kling-3-pro",
      name: "Kling 3 Pro",
      rank: 2,
      of: 41,
      normalized: 0.94,
      score: 1123
    });
    expect(rows[1].routes).toEqual([
      { provider: "fal_ai", modelId: "fal-ai/kling-video/v3/pro" },
      { provider: "kie", modelId: "kling/v3-pro" }
    ]);
  });

  it("lists a model only under the tasks it is ranked for", () => {
    expect(rankedForTask("image_to_video", fixture).map((r) => r.canonical)).toEqual(
      ["kling-3-pro"]
    );
    expect(rankedForTask("text_to_image", fixture).map((r) => r.canonical)).toEqual(
      ["flux-schnell"]
    );
    expect(rankedForTask("text_to_music", fixture)).toEqual([]);
  });
});

describe("buildRankingsIndex", () => {
  it("groups routes and tasks off a bare artifact", () => {
    const index = buildRankingsIndex(fixture);
    expect([...index.routesByCanonical.keys()].sort()).toEqual([
      "flux-schnell",
      "kling-3-pro",
      "veo-3"
    ]);
    expect([...index.rankedByTask.keys()].sort()).toEqual([
      "image_to_video",
      "text_to_image",
      "text_to_video"
    ]);
  });

  it("skips a malformed key rather than throwing", () => {
    const index = buildRankingsIndex({
      schemaVersion: 1,
      source: "artificialanalysis.ai",
      generatedAt: null,
      models: {
        "no-colon-here": {
          canonical: "x",
          name: "X",
          tasks: { text_to_image: { score: 1, normalized: 1, rank: 1, of: 1 } }
        },
        ":leading-colon": {
          canonical: "y",
          name: "Y",
          tasks: {}
        }
      }
    });
    expect(index.routesByCanonical.size).toBe(0);
    expect(index.rankedByTask.size).toBe(0);
  });
});
