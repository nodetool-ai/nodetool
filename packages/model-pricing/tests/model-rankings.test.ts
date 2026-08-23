/**
 * The rankings accessors. Grouping and leaderboard behavior is pinned against
 * a fixture passed in as an argument — the accessors take the artifact, so no
 * module is mocked. The shipped snapshot is checked for its invariants rather
 * than its contents: the nightly sync rewrites it, so pinning what it holds
 * would fail on every sync.
 */
import { describe, it, expect } from "vitest";
import {
  buildRankingsIndex,
  getCanonicalId,
  getModelRank,
  modelRankings,
  rankedForTask,
  routesFor,
  type ModelRankingsArtifact,
  type RankedModelEntry
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
  it("carries the schema every accessor reads", () => {
    expect(modelRankings.schemaVersion).toBe(1);
    expect(modelRankings.source).toBe("artificialanalysis.ai");
    // null before the first sync, an ISO instant after one.
    if (modelRankings.generatedAt !== null) {
      expect(Date.parse(modelRankings.generatedAt)).not.toBeNaN();
    }
  });

  it("keys every entry `<provider>:<model_id>` and ranks it plausibly", () => {
    for (const [key, entry] of Object.entries(modelRankings.models)) {
      const separator = key.indexOf(":");
      expect(separator, key).toBeGreaterThan(0);
      expect(key.slice(separator + 1), key).not.toBe("");
      expect(entry.canonical, key).not.toBe("");
      expect(entry.name, key).not.toBe("");
      expect(Object.keys(entry.tasks).length, key).toBeGreaterThan(0);

      for (const [task, rank] of Object.entries(entry.tasks)) {
        const where = `${key} ${task}`;
        expect(Number.isFinite(rank.score), where).toBe(true);
        expect(rank.normalized, where).toBeGreaterThanOrEqual(0);
        expect(rank.normalized, where).toBeLessThanOrEqual(1);
        expect(rank.rank, where).toBeGreaterThanOrEqual(1);
        expect(rank.rank, where).toBeLessThanOrEqual(rank.of);
      }
    }
  });

  it("gives every route to one model the same name and tasks", () => {
    // Quality is the model's, never the route's — the grouping accessors
    // derive from that, so a snapshot that broke it would rank one route
    // above another for the same model.
    const byCanonical = new Map<string, RankedModelEntry>();
    for (const [key, entry] of Object.entries(modelRankings.models)) {
      const first = byCanonical.get(entry.canonical);
      if (first === undefined) {
        byCanonical.set(entry.canonical, entry);
        continue;
      }
      expect(entry.name, key).toBe(first.name);
      expect(entry.creator, key).toBe(first.creator);
      expect(entry.tasks, key).toEqual(first.tasks);
    }
  });

  it("answers off the shipped snapshot when it holds anything", () => {
    const keys = Object.keys(modelRankings.models);
    if (keys.length === 0) {
      // Before the first sync there is nothing to read, and that is the
      // documented state — every accessor answers with nothing.
      expect(rankedForTask("text_to_video")).toEqual([]);
      return;
    }
    const key = keys[0];
    const separator = key.indexOf(":");
    const provider = key.slice(0, separator);
    const modelId = key.slice(separator + 1);
    const entry = modelRankings.models[key];

    expect(getModelRank(provider, modelId)).toEqual(entry);
    expect(getCanonicalId(provider, modelId)).toBe(entry.canonical);
    expect(routesFor(entry.canonical)).toContainEqual({ provider, modelId, entry });

    const task = Object.keys(entry.tasks)[0];
    expect(rankedForTask(task).map((row) => row.canonical)).toContain(entry.canonical);
  });

  it("answers with nothing for what the snapshot does not carry", () => {
    expect(getModelRank("fal_ai", "fal-ai/nobody-ranks-this")).toBeNull();
    expect(getModelRank(null, "fal-ai/kling-video/v3/pro")).toBeNull();
    expect(getCanonicalId("fal_ai", "fal-ai/nobody-ranks-this")).toBeNull();
    expect(routesFor("no-such-canonical-model")).toEqual([]);
    expect(rankedForTask("no_such_task")).toEqual([]);
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
