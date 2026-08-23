/**
 * The nightly model-rankings sync. Its output decides which model an agent
 * reaches for first, so the matcher is tested on the shapes Artificial Analysis
 * actually serves — including the ones that must be dropped and reported rather
 * than guessed at. No network: every leaderboard here is a fixture.
 */
import { describe, it, expect } from "vitest";
import { parseLeaderboard } from "../../../scripts/rankings/leaderboards.mjs";
import { buildSlugIndex, matchRow } from "../../../scripts/rankings/match.mjs";
import {
  buildRankings,
  collectRankings,
  expandRoutes
} from "../../../scripts/sync-model-rankings.mjs";

/** A price catalog carrying three canonical slugs, one of them multi-route. */
const pricing = {
  prices: {
    "fal_ai:fal-ai/kling-video/v3/pro": { model_slug: "kling-3-pro" },
    "kie:kling/v3-pro": { model_slug: "kling-3-pro" },
    "fal_ai:fal-ai/flux-2/pro": { model_slug: "flux-2-pro" },
    "fal_ai:fal-ai/flux-2/flex": { model_slug: "flux-2-flex" },
    "elevenlabs:eleven_v3": { model_slug: "eleven-v3" },
    // Two slugs that reduce to one comparison key — the vendor prefix is
    // stripped, so both answer to `hailuo-3`.
    "minimax:MiniMax-Hailuo-03": { model_slug: "minimax-hailuo-3" },
    "kie:hailuo/v3": { model_slug: "hailuo-3" }
  }
};

const index = buildSlugIndex(pricing);

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
    expect(board("text_to_speech", [aaModel({ elo: "high" })]).error).toBe("no-rows");
  });
});

describe("matchRow", () => {
  const match = (row: unknown, aliases: unknown = { models: {} }) =>
    matchRow(row, index, aliases);

  it("matches on the exact comparison key, through AA's own spelling", () => {
    expect(match({ name: "Kling 3 Pro", slug: "kling-v3.0-pro" })).toEqual({
      slug: "kling-3-pro",
      match: "key"
    });
  });

  it("takes a hand-pinned alias over the comparison", () => {
    expect(
      match(
        { name: "FLUX.2 Flexible", slug: "flux-2-flexible" },
        { models: { "flux-2-flexible": "flux-2-flex" } }
      )
    ).toEqual({ slug: "flux-2-flex", match: "alias" });
  });

  it("blocks a model an alias pins to null", () => {
    expect(
      match({ name: "Kling 3 Pro", slug: "kling-3-pro" }, { models: { "kling-3-pro": null } })
    ).toMatchObject({ slug: null, reason: "blocked" });
  });

  it("reports an alias pinned to a slug nothing ships", () => {
    expect(
      match({ name: "X", slug: "x" }, { models: { x: "no-such-model" } })
    ).toMatchObject({ slug: null, reason: "alias-target-unknown" });
  });

  it("drops a name that cannot choose between two canonical models", () => {
    // `hailuo-3` answers for both the vendor-prefixed slug and the bare one.
    // Attaching one model's rank to the other's routes is worse than leaving
    // both unranked.
    expect(match({ name: "Hailuo 3", slug: "hailuo-3" })).toMatchObject({
      slug: null,
      reason: "ambiguous",
      detail: "hailuo-3, minimax-hailuo-3"
    });
  });

  it("reports a model GenSpend does not price rather than guessing", () => {
    expect(match({ name: "Imagen 5 Ultra", slug: "imagen-5-ultra" })).toMatchObject({
      slug: null,
      reason: "unmatched"
    });
  });
});

describe("collectRankings", () => {
  const collect = (leaderboards: unknown[], aliases: unknown = { models: {} }) =>
    collectRankings({ leaderboards, index, aliases });

  it("keeps one entry per canonical model across tasks", () => {
    const { bySlug, report } = collect([
      board("text_to_video", [aaModel({ elo: 1123 })]),
      board("image_to_video", [aaModel({ elo: 1101 })])
    ]);
    expect(bySlug.get("kling-3-pro")).toMatchObject({
      canonical: "kling-3-pro",
      name: "Kling 3 Pro",
      creator: "Kuaishou",
      tasks: {
        text_to_video: { score: 1123, rank: 1, of: 1, normalized: 1 },
        image_to_video: { score: 1101, rank: 1, of: 1, normalized: 1 }
      }
    });
    expect(report.tasks).toEqual([
      { task: "text_to_video", rows: 1, matched: 1, error: null },
      { task: "image_to_video", rows: 1, matched: 1, error: null }
    ]);
  });

  it("carries a dropped task's reason into the report and ranks nothing for it", () => {
    const { bySlug, report } = collect([
      parseLeaderboard("text_to_image", { error: "Invalid API key." }),
      board("text_to_video", [aaModel()])
    ]);
    expect(report.tasks[0]).toMatchObject({
      task: "text_to_image",
      error: "unrecognized-response"
    });
    expect(Object.keys(bySlug.get("kling-3-pro").tasks)).toEqual(["text_to_video"]);
  });

  it("reports every straggler it refused to rank", () => {
    const { report } = collect(
      [
        board("text_to_image", [
          aaModel({ name: "Hailuo 3", slug: "hailuo-3", elo: 1200 }),
          aaModel({ name: "Imagen 5 Ultra", slug: "imagen-5-ultra", elo: 1150 }),
          aaModel({ name: "Kling 3 Pro", slug: "kling-3-pro", elo: 1100 })
        ])
      ],
      { models: { "kling-3-pro": null } }
    );
    expect(report.ambiguous).toEqual([
      expect.objectContaining({ task: "text_to_image", name: "Hailuo 3" })
    ]);
    expect(report.unmatched).toEqual([
      expect.objectContaining({ name: "Imagen 5 Ultra", reason: "unmatched" })
    ]);
    expect(report.blocked).toEqual([
      expect.objectContaining({ name: "Kling 3 Pro" })
    ]);
  });

  it("keeps the better rank when two rows of one task land on one model", () => {
    const { bySlug, report } = collect([
      board("text_to_video", [
        aaModel({ name: "Kling 3 Pro 1080p", elo: 1123 }),
        aaModel({ name: "Kling 3 Pro 720p", elo: 1050 })
      ])
    ]);
    expect(bySlug.get("kling-3-pro").tasks.text_to_video.score).toBe(1123);
    expect(report.collisions).toEqual([
      { task: "text_to_video", canonical: "kling-3-pro", dropped: "Kling 3 Pro 720p" }
    ]);
  });
});

describe("expandRoutes", () => {
  it("gives every route of one model identical tasks", () => {
    const { bySlug } = collectRankings({
      leaderboards: [board("text_to_video", [aaModel()])],
      index,
      aliases: { models: {} }
    });
    const models = expandRoutes(bySlug, index);
    expect(Object.keys(models)).toEqual([
      "fal_ai:fal-ai/kling-video/v3/pro",
      "kie:kling/v3-pro"
    ]);
    const [fal, kie] = Object.values(models);
    expect(fal.canonical).toBe("kling-3-pro");
    expect(kie.canonical).toBe("kling-3-pro");
    expect(kie.tasks).toEqual(fal.tasks);
  });

  it("sorts keys so an unchanged leaderboard produces no diff", () => {
    const { bySlug } = collectRankings({
      leaderboards: [
        board("text_to_image", [
          aaModel({ name: "FLUX.2 Pro", slug: "flux-2-pro", elo: 1200 }),
          aaModel({ elo: 1100 })
        ])
      ],
      index,
      aliases: { models: {} }
    });
    const keys = Object.keys(expandRoutes(bySlug, index));
    expect(keys).toEqual([...keys].sort());
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
