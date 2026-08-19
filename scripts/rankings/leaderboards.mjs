/**
 * The Artificial Analysis media leaderboards, and the one function that turns
 * a response into rows the sync can use.
 *
 * AA publishes one endpoint per arena, each answering with
 * `{status, data: [{id, name, slug, model_creator: {name}, elo, rank, …}]}`.
 * The paths and the score field are pinned to the AA data API documentation
 * (https://artificialanalysis.ai/documentation, "Media Endpoints"); they live
 * in the table below so a change upstream is one edit here.
 *
 * The parse is deliberately unforgiving: a body that is not the documented
 * shape, or a leaderboard left with no usable row, drops the whole task from
 * the artifact and says so. A rank nobody can trace is worse than no rank —
 * everything downstream treats an absent task as "unranked", which is what the
 * product did before this pipeline existed.
 */

export const AA_BASE_URL = "https://artificialanalysis.ai/api/v2";

/**
 * NodeTool task → the AA endpoint that ranks it. `image_to_image` is AA's
 * image-editing arena: an image in, an image out, which is the same product
 * NodeTool's `image_to_image` names.
 */
export const LEADERBOARDS = [
  { task: "text_to_image", path: "/data/media/text-to-image" },
  { task: "image_to_image", path: "/data/media/image-editing" },
  { task: "text_to_video", path: "/data/media/text-to-video" },
  { task: "image_to_video", path: "/data/media/image-to-video" },
  { task: "text_to_speech", path: "/data/media/text-to-speech" }
];

export const LEADERBOARD_TASKS = LEADERBOARDS.map((board) => board.task);

/** The full URL for one leaderboard. */
export const leaderboardUrl = (path, base = AA_BASE_URL) => `${base}${path}`;

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

const nonEmptyString = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * The rows of one leaderboard, best first.
 *
 * Returns `{task, rows, dropped}` on success and `{task, rows: [], error}`
 * when the response is not a leaderboard this code recognizes. A single row
 * missing a name or a score is dropped and named in `dropped`; a body that
 * parses to no rows at all is an error, because a leaderboard that ranks
 * nothing cannot be told apart from one the parser failed to read.
 *
 * Rank and leaderboard size are computed here rather than taken from AA's own
 * `rank`: `of` has to be the count of rows this artifact carries, and the two
 * must agree or `rank`/`of` reads as a fraction of nothing.
 */
export function parseLeaderboard(task, body) {
  const data = Array.isArray(body) ? body : body?.data;
  if (!Array.isArray(data)) {
    return { task, rows: [], dropped: [], error: "unrecognized-response" };
  }

  const dropped = [];
  const parsed = [];
  for (const item of data) {
    const name = nonEmptyString(item?.name);
    const slug = nonEmptyString(item?.slug);
    const score = item?.elo;
    if (!name && !slug) {
      dropped.push({ name: "(unnamed)", reason: "no-name" });
      continue;
    }
    if (!isFiniteNumber(score)) {
      dropped.push({ name: name ?? slug, reason: "no-score" });
      continue;
    }
    parsed.push({
      name: name ?? slug,
      slug,
      creator: nonEmptyString(item?.model_creator?.name),
      score
    });
  }

  if (parsed.length === 0) {
    return { task, rows: [], dropped, error: "no-rows" };
  }

  // Ties keep a stable order by name so an unchanged leaderboard produces an
  // unchanged artifact.
  parsed.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const of = parsed.length;
  const rows = parsed.map((row, i) => ({
    ...row,
    rank: i + 1,
    of,
    // Position, not score: Elo spreads differ per arena, so a score-scaled
    // number would not mean the same thing across tasks. Best is 1, worst 0.
    normalized: of > 1 ? Number(((of - (i + 1)) / (of - 1)).toFixed(4)) : 1
  }));

  return { task, rows, dropped, error: null };
}
