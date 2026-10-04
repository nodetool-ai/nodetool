/**
 * The nightly model-rankings sync. Its output decides which model an agent
 * reaches for first, so the matcher is tested on the shapes Artificial Analysis
 * actually serves — including the ones that must be dropped and reported rather
 * than guessed at. No network: every leaderboard here is a fixture, and the
 * route universe is a literal list standing in for the providers' own model
 * lists.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseLeaderboard } from "../../../scripts/rankings/leaderboards.mjs";
import { modelKeys } from "../../../scripts/rankings/model-keys.mjs";
import {
  buildRouteIndex,
  matchRow
} from "../../../scripts/rankings/match.mjs";
import * as genspendNormalize from "../../../scripts/genspend/normalize.mjs";
import {
  buildRankings,
  collectRankings
} from "../../../scripts/sync-model-rankings.mjs";

/**
 * Provider routes as the providers list them: an id, a display name, and the
 * tasks the route serves. `fal-ai/flux-2/pro/edit` carries the same comparison
 * key as `fal-ai/flux-2/pro` once the task word is stripped, which is exactly
 * the collision the task filter exists for.
 */
const routes = [
  { provider: "fal_ai", modelId: "fal-ai/kling-video/v3/pro", name: "Kling 3 Pro", tasks: ["text_to_video", "image_to_video"] },
  { provider: "kie", modelId: "kling/v3-pro", name: "Kling 3 Pro", tasks: ["text_to_video", "image_to_video"] },
  { provider: "fal_ai", modelId: "fal-ai/flux-2/pro", name: "FLUX.2 Pro", tasks: ["text_to_image"] },
  { provider: "fal_ai", modelId: "fal-ai/flux-2/pro/edit", name: "FLUX.2 Pro Edit", tasks: ["image_to_image"] },
  { provider: "fal_ai", modelId: "fal-ai/flux-2/flex", name: "FLUX.2 Flex", tasks: ["text_to_image"] },
  { provider: "elevenlabs", modelId: "eleven_v3", name: "Eleven v3", tasks: ["text_to_speech"] },
  // One route that two differently-slugged rows both reach: the vendor prefix
  // is stripped from `minimax-hailuo-3`, so both rows answer to `hailuo-3`.
  { provider: "kie", modelId: "hailuo/v3", name: "Hailuo 3", tasks: ["text_to_video"] },
  // A route that declares no tasks is never filtered out.
  { provider: "replicate", modelId: "luma/ray-2", name: "Luma Ray 2" }
];

const index = buildRouteIndex(routes);

const aaModel = (over: Record<string, unknown> = {}) => ({
  id: "61270a9b",
  name: "Kling 3 Pro",
  slug: "kling-3-pro",
  model_creator: { id: "62cc833b", name: "Kuaishou" },
  elo: 1123,
  rank: 2,
  ci95: "-5/+5",
  appearances: 4210,
  ...over
});

const board = (task: string, models: unknown[]) =>
  parseLeaderboard(task, { status: 200, data: models });

describe("parseLeaderboard", () => {
  it("ranks rows by score and sizes the leaderboard", () => {
    const result = board("text_to_video", [
      aaModel({ name: "Second", slug: "flux-2-pro", elo: 1100 }),
      aaModel({ name: "First", elo: 1200 }),
      aaModel({ name: "Third", slug: "eleven-v3", elo: 1000 })
    ]);
    expect(result.rows.map((r: { name: string }) => r.name)).toEqual([
      "First",
      "Second",
      "Third"
    ]);
    expect(result.rows[0]).toMatchObject({ rank: 1, of: 3, normalized: 1, score: 1200 });
    expect(result.rows[1]).toMatchObject({ rank: 2, of: 3, normalized: 0.5 });
    expect(result.rows[2]).toMatchObject({ rank: 3, of: 3, normalized: 0 });
  });

  it("drops a row with no score and names it", () => {
    const result = board("text_to_image", [
      aaModel({ elo: null }),
      aaModel({ name: "Priced", slug: "flux-2-pro" })
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.dropped).toEqual([{ name: "Kling 3 Pro", reason: "no-score" }]);
  });

  it("drops the whole task when the response is not a leaderboard", () => {
    // Fail closed: a body nobody can read must not become a rank nobody can
    // trace. The task leaves the artifact and the run report says why.
    for (const garbage of [{ error: "Invalid API key." }, "<!DOCTYPE html>", null, 42]) {
      expect(parseLeaderboard("text_to_image", garbage).error).toBe(
        "unrecognized-response"
      );
    }
  });

  it("treats a leaderboard that ranks nothing as an error, not as empty", () => {
    expect(board("text_to_speech", []).error).toBe("no-rows");
    expect(board("text_to_speech", [aaModel({ elo: "high" })]).error).toBe(
      "no-rows"
    );
  });
});

describe("buildRouteIndex", () => {
  it("keys every route as <provider>:<model_id>", () => {
    expect([...index.routes.keys()]).toContain("fal_ai:fal-ai/flux-2/pro");
    expect(index.routes.size).toBe(routes.length);
  });

  it("skips an entry that names no provider or no model id", () => {
    const partial = buildRouteIndex([
      { provider: "", modelId: "x" },
      { provider: "fal_ai", modelId: "" },
      { provider: "fal_ai", modelId: "fal-ai/ok" }
    ]);
    expect([...partial.routes.keys()]).toEqual(["fal_ai:fal-ai/ok"]);
  });

  it("is empty for an empty route universe", () => {
    expect(buildRouteIndex([]).routes.size).toBe(0);
  });
});

describe("matchRow", () => {
  const match = (
    row: unknown,
    aliases: unknown = { models: {} },
    task = "text_to_video"
  ) => matchRow(row, index, aliases, task);

  it("matches every route whose id answers to the row's exact key", () => {
    expect(match({ name: "Kling 3 Pro", slug: "kling-v3.0-pro" })).toEqual({
      routes: ["fal_ai:fal-ai/kling-video/v3/pro", "kie:kling/v3-pro"],
      match: "key"
    });
  });

  it("serves a route through the task its own list declares", () => {
    const row = { name: "FLUX.2 Pro", slug: "flux-2-pro" };
    expect(match(row, undefined, "text_to_image").routes).toEqual([
      "fal_ai:fal-ai/flux-2/pro"
    ]);
    // The edit route shares the task-stripped key, so only the task filter
    // keeps a text-to-image rank off an image editor.
    expect(match(row, undefined, "image_to_image").routes).toEqual([
      "fal_ai:fal-ai/flux-2/pro/edit"
    ]);
  });

  it("never filters out a route that declares no tasks", () => {
    expect(
      match({ name: "Luma Ray 2", slug: "luma-ray-2" }, undefined, "text_to_video")
        .routes
    ).toEqual(["replicate:luma/ray-2"]);
  });

  it("takes a hand-pinned route over the comparison", () => {
    expect(
      match(
        { name: "FLUX.2 Flexible", slug: "flux-2-flexible" },
        { models: { "flux-2-flexible": "fal_ai:fal-ai/flux-2/flex" } },
        "text_to_image"
      )
    ).toEqual({ routes: ["fal_ai:fal-ai/flux-2/flex"], match: "alias" });
  });

  it("accepts a list of pinned routes", () => {
    expect(
      match(
        { name: "X", slug: "x" },
        { models: { x: ["kie:kling/v3-pro", "fal_ai:fal-ai/kling-video/v3/pro"] } }
      )
    ).toEqual({
      routes: ["fal_ai:fal-ai/kling-video/v3/pro", "kie:kling/v3-pro"],
      match: "alias"
    });
  });

  it("still serves a pinned route only for a task it serves", () => {
    // A pin chooses the model, not the task: pinning `flux-2-pro` to its
    // text-to-image route must not hand that route an image-to-image rank.
    const aliases = { models: { "flux-2-pro": "fal_ai:fal-ai/flux-2/pro" } };
    const row = { name: "FLUX.2 Pro", slug: "flux-2-pro" };
    expect(match(row, aliases, "text_to_image").routes).toEqual([
      "fal_ai:fal-ai/flux-2/pro"
    ]);
    expect(match(row, aliases, "image_to_image")).toMatchObject({
      routes: [],
      reason: "unmatched"
    });
  });

  it("blocks a model an alias pins to null", () => {
    expect(
      match({ name: "Kling 3 Pro", slug: "kling-3-pro" }, { models: { "kling-3-pro": null } })
    ).toMatchObject({ routes: [], reason: "blocked" });
  });

  it("reports an alias pinned to a route no provider lists", () => {
    expect(
      match({ name: "X", slug: "x" }, { models: { x: "fal_ai:no/such-model" } })
    ).toMatchObject({
      routes: [],
      reason: "alias-target-unknown",
      detail: "fal_ai:no/such-model"
    });
  });

  it("reports a model no provider lists rather than guessing", () => {
    expect(match({ name: "Imagen 5 Ultra", slug: "imagen-5-ultra" })).toMatchObject({
      routes: [],
      reason: "unmatched"
    });
  });

  it("matches nothing at all against an empty route universe", () => {
    expect(
      matchRow(
        { name: "Kling 3 Pro", slug: "kling-3-pro" },
        buildRouteIndex([]),
        { models: {} },
        "text_to_video"
      )
    ).toMatchObject({ routes: [], reason: "unmatched" });
  });
});

describe("collectRankings", () => {
  const collect = (leaderboards: unknown[], aliases: unknown = { models: {} }, idx = index) =>
    collectRankings({ leaderboards, index: idx, aliases });

  it("names a model by the leaderboard's own slug, across providers", () => {
    const { byRoute } = collect([board("text_to_video", [aaModel()])]);
    expect(Object.fromEntries(byRoute)).toEqual({
      "fal_ai:fal-ai/kling-video/v3/pro": expect.objectContaining({
        canonical: "kling-3-pro",
        name: "Kling 3 Pro",
        creator: "Kuaishou"
      }),
      "kie:kling/v3-pro": expect.objectContaining({ canonical: "kling-3-pro" })
    });
  });

  it("falls back to the normalized name when a row carries no slug", () => {
    const { byRoute } = collect([
      board("text_to_video", [aaModel({ slug: undefined })])
    ]);
    expect(byRoute.get("kie:kling/v3-pro")?.canonical).toBe("kling-3-pro");
  });

  it("keeps one entry per route across tasks", () => {
    const { byRoute, report } = collect([
      board("text_to_video", [aaModel({ elo: 1123 })]),
      board("image_to_video", [aaModel({ elo: 1101 })])
    ]);
    expect(byRoute.get("kie:kling/v3-pro")).toMatchObject({
      canonical: "kling-3-pro",
      tasks: {
        text_to_video: { score: 1123, rank: 1, of: 1, normalized: 1 },
        image_to_video: { score: 1101, rank: 1, of: 1, normalized: 1 }
      }
    });
    expect(report.tasks).toEqual([
      { task: "text_to_video", rows: 1, matched: 1, routes: 2, error: null },
      { task: "image_to_video", rows: 1, matched: 1, routes: 2, error: null }
    ]);
  });

  it("carries a dropped task's reason into the report and ranks nothing for it", () => {
    const { byRoute, report } = collect([
      parseLeaderboard("text_to_image", { error: "Invalid API key." }),
      board("text_to_video", [aaModel()])
    ]);
    expect(report.tasks[0]).toMatchObject({
      task: "text_to_image",
      error: "unrecognized-response"
    });
    expect(Object.keys(byRoute.get("kie:kling/v3-pro")!.tasks)).toEqual([
      "text_to_video"
    ]);
  });

  it("reports every straggler it refused to rank", () => {
    const { report } = collect(
      [
        board("text_to_video", [
          aaModel({ name: "Imagen 5 Ultra", slug: "imagen-5-ultra", elo: 1150 }),
          aaModel({ name: "Kling 3 Pro", slug: "kling-3-pro", elo: 1100 })
        ])
      ],
      { models: { "kling-3-pro": null } }
    );
    expect(report.unmatched).toEqual([
      expect.objectContaining({ name: "Imagen 5 Ultra", reason: "unmatched" })
    ]);
    expect(report.blocked).toEqual([
      expect.objectContaining({ name: "Kling 3 Pro" })
    ]);
  });

  it("drops a route two different models both claim, and says so", () => {
    // `hailuo-3` is the key of both rows. Two rows with different slugs reach
    // the same route, and attaching either rank to it is worse than leaving
    // it unranked.
    const { byRoute, report } = collect([
      board("text_to_video", [
        aaModel({ name: "Hailuo 3", slug: "hailuo-3", elo: 1200 }),
        aaModel({ name: "Minimax Hailuo 3", slug: "minimax-hailuo-3", elo: 1100 })
      ])
    ]);
    expect(byRoute.size).toBe(0);
    expect(report.ambiguous.map((e: { name: string }) => e.name).sort()).toEqual([
      "Hailuo 3",
      "Minimax Hailuo 3"
    ]);
    expect(report.ambiguous[0].detail).toContain("kie:hailuo/v3");
  });

  it("lets a hand-pinned route win a conflict a key match would lose", () => {
    const { byRoute, report } = collect(
      [
        board("text_to_video", [
          aaModel({ name: "Hailuo 3", slug: "hailuo-3", elo: 1200 }),
          aaModel({ name: "Minimax Hailuo 3", slug: "minimax-hailuo-3", elo: 1100 })
        ])
      ],
      { models: { "minimax-hailuo-3": "kie:hailuo/v3" } }
    );
    expect(byRoute.get("kie:hailuo/v3")?.canonical).toBe("minimax-hailuo-3");
    expect(report.ambiguous).toEqual([]);
  });

  it("keeps the better rank when two rows of one slug land on one route", () => {
    const { byRoute, report } = collect([
      board("text_to_video", [
        aaModel({ name: "Kling 3 Pro 1080p", elo: 1123 }),
        aaModel({ name: "Kling 3 Pro 720p", elo: 1050 })
      ])
    ]);
    expect(byRoute.get("kie:kling/v3-pro")!.tasks.text_to_video.score).toBe(1123);
    expect(report.collisions).toEqual(
      expect.arrayContaining([
        {
          task: "text_to_video",
          canonical: "kling-3-pro",
          route: "kie:kling/v3-pro",
          dropped: "Kling 3 Pro 720p"
        }
      ])
    );
    expect(report.ambiguous).toEqual([]);
  });

  it("keeps the first slug a route was named by and reports a later disagreement", () => {
    const { byRoute, report } = collect([
      board("text_to_video", [aaModel({ slug: "kling-3-pro" })]),
      board("image_to_video", [aaModel({ slug: "kling-3-0-pro-i2v" })])
    ]);
    expect(byRoute.get("kie:kling/v3-pro")).toMatchObject({
      canonical: "kling-3-pro",
      tasks: {
        text_to_video: expect.any(Object),
        image_to_video: expect.any(Object)
      }
    });
    expect(report.canonicalConflicts).toEqual(
      expect.arrayContaining([
        {
          task: "image_to_video",
          route: "kie:kling/v3-pro",
          kept: "kling-3-pro",
          other: "kling-3-0-pro-i2v"
        }
      ])
    );
  });

  it("inspects every row, even against an empty route universe", () => {
    const { byRoute, report } = collect(
      [board("text_to_video", [aaModel(), aaModel({ name: "Other", slug: "other" })])],
      { models: {} },
      buildRouteIndex([])
    );
    expect(byRoute.size).toBe(0);
    expect(report.tasks[0]).toMatchObject({ rows: 2, matched: 0, routes: 0 });
    expect(report.unmatched).toHaveLength(2);
  });
});

describe("buildRankings", () => {
  const build = (leaderboards: unknown[], previous: unknown, nowIso: string) =>
    buildRankings({ leaderboards, index, aliases: { models: {} }, previous, nowIso });

  it("writes the shape the accessor module reads", () => {
    const { artifact } = build(
      [board("text_to_video", [aaModel()])],
      null,
      "2026-01-01T00:00:00.000Z"
    );
    expect(artifact).toMatchObject({
      schemaVersion: 1,
      source: "artificialanalysis.ai",
      generatedAt: "2026-01-01T00:00:00.000Z"
    });
    expect(artifact.models["kie:kling/v3-pro"]).toEqual({
      canonical: "kling-3-pro",
      name: "Kling 3 Pro",
      creator: "Kuaishou",
      tasks: { text_to_video: { score: 1123, normalized: 1, rank: 1, of: 1 } }
    });
  });

  it("gives every route of one model identical tasks", () => {
    const { artifact } = build(
      [board("text_to_video", [aaModel()])],
      null,
      "2026-01-01T00:00:00.000Z"
    );
    expect(artifact.models["kie:kling/v3-pro"]).toEqual(
      artifact.models["fal_ai:fal-ai/kling-video/v3/pro"]
    );
  });

  it("keeps task-specific routes limited to the tasks they serve", () => {
    const taskIndex = buildRouteIndex([
      { provider: "fal_ai", modelId: "kling/text", name: "Kling 3 Pro", tasks: ["text_to_video"] },
      { provider: "kie", modelId: "kling/image", name: "Kling 3 Pro", tasks: ["image_to_video"] }
    ]);
    const { artifact } = buildRankings({
      leaderboards: [
        board("text_to_video", [aaModel({ elo: 1123 })]),
        board("image_to_video", [aaModel({ elo: 1101 })])
      ],
      index: taskIndex,
      aliases: { models: {} },
      previous: null,
      nowIso: "2026-01-01T00:00:00.000Z"
    });

    expect(artifact.models["fal_ai:kling/text"]).toMatchObject({
      canonical: "kling-3-pro",
      tasks: { text_to_video: { score: 1123, normalized: 1, rank: 1, of: 1 } }
    });
    expect(Object.keys(artifact.models["fal_ai:kling/text"].tasks)).toEqual(["text_to_video"]);
    expect(artifact.models["kie:kling/image"]).toMatchObject({
      canonical: "kling-3-pro",
      tasks: { image_to_video: { score: 1101, normalized: 1, rank: 1, of: 1 } }
    });
    expect(Object.keys(artifact.models["kie:kling/image"].tasks)).toEqual(["image_to_video"]);
  });

  it("sorts keys so an unchanged leaderboard produces no diff", () => {
    const { artifact } = build(
      [
        board("text_to_image", [
          aaModel({ name: "FLUX.2 Pro", slug: "flux-2-pro", elo: 1200 })
        ]),
        board("text_to_video", [aaModel({ elo: 1100 })])
      ],
      null,
      "2026-01-01T00:00:00.000Z"
    );
    const keys = Object.keys(artifact.models);
    expect(keys.length).toBeGreaterThan(1);
    expect(keys).toEqual([...keys].sort());
  });

  it("reports canonical models and routes", () => {
    const { report } = build(
      [board("text_to_video", [aaModel()])],
      null,
      "2026-01-01T00:00:00.000Z"
    );
    expect(report).toMatchObject({ canonicalModels: 1, routes: 2 });
  });

  it("keeps the previous generatedAt when no rank moved", () => {
    const first = build(
      [board("text_to_video", [aaModel()])],
      null,
      "2026-01-01T00:00:00.000Z"
    ).artifact;
    const second = build(
      [board("text_to_video", [aaModel()])],
      first,
      "2026-01-02T00:00:00.000Z"
    ).artifact;
    expect(second.generatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("stamps a new generatedAt when a score moved", () => {
    const first = build(
      [board("text_to_video", [aaModel()])],
      null,
      "2026-01-01T00:00:00.000Z"
    ).artifact;
    const second = build(
      [board("text_to_video", [aaModel({ elo: 1130 })])],
      first,
      "2026-01-02T00:00:00.000Z"
    ).artifact;
    expect(second.generatedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("produces nothing at all from a leaderboard nobody could parse", () => {
    // The sync refuses to write an empty artifact, so this is the state that
    // aborts the run rather than shipping a file with every rank gone.
    const { artifact, report } = build(
      [parseLeaderboard("text_to_image", "<!DOCTYPE html>")],
      null,
      "2026-01-01T00:00:00.000Z"
    );
    expect(artifact.models).toEqual({});
    expect(report.tasks[0].error).toBe("unrecognized-response");
  });
});

describe("independence from the GenSpend catalog", () => {
  const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), "../../../scripts");

  it("shares one modelKeys with the price sync", () => {
    // The price sync re-exports the shared module, so its matching is
    // byte-for-byte what it was before the move.
    expect(genspendNormalize.modelKeys).toBe(modelKeys);
    expect([...modelKeys("black-forest-labs/FLUX.2-pro")]).toEqual(
      expect.arrayContaining(["flux-2-pro"])
    );
  });

  it("imports nothing from scripts/genspend and reads no price catalog", () => {
    const files = [
      join(scriptsDir, "sync-model-rankings.mjs"),
      ...readdirSync(join(scriptsDir, "rankings"))
        .filter((f) => f.endsWith(".mjs"))
        .map((f) => join(scriptsDir, "rankings", f))
    ];
    // The audit must have inspected the files it claims to cover.
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const code = source
        .split("\n")
        .filter((line) => !/^\s*(\/\*|\*|\/\/)/.test(line))
        .join("\n");
      expect(code, file).not.toMatch(/genspend/i);
    }
  });
});
