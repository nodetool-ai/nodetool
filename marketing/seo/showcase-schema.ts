/**
 * Manifest schema shared by the seeder (`seed.ts`) and — conceptually — the
 * ingest step (`marketing/scripts/ingest-showcase.mjs`, which re-implements the
 * few plain-JS helpers so it stays dependency-free).
 *
 * A `ShowcaseRecord` is one row of `manifest.jsonl`: the raw, non-derived facts
 * about a single generated asset. Ingest turns each surviving record into a
 * `ShowcaseEntry` (see `marketing/src/data/showcase.ts`) by adding the derived
 * page fields (route/title/description/priority/…). Keep this in sync with the
 * `ShowcaseEntry` fields it feeds.
 */

export type MediaType = "image" | "video";

/**
 * Structured, engine-specific params carried on a manifest row. Optional: a
 * plain single-model seed leaves it undefined. The Model Duel wrapper
 * (`--duel <modelA>,<modelB>`) sets `duelId`/`duelPair` so PR-4's pair pages can
 * group by `duelPair` and join a model-A row to its model-B counterpart by the
 * shared `duelId` (same prompt, both models).
 */
export interface ShowcaseParams {
  /**
   * Shared across BOTH models' rows for one duel prompt — the join key PR-4
   * uses to line up a matched pair. Stable across re-runs.
   */
  duelId: string;
  /** Canonical pair slug (model slugs sorted), e.g. "flux-dev-vs-flux-schnell". */
  duelPair: string;
}

export interface ShowcaseRecord {
  /** Stable id — first 16 hex chars of `hash`. Names the asset file too. */
  id: string;
  /** Batch this row belongs to (the `marketing/seo/out/<batch>/` dir name). */
  batch: string;
  /** Template slug the prompt was written for, e.g. "movie-posters". */
  template: string;
  /** Prompt category (the `prompts/<category>.md` used), e.g. "posters". */
  category: string;
  /** Runtime provider id, e.g. "fal_ai". */
  provider: string;
  /** Resolved provider model id, e.g. "fal-ai/flux/schnell". */
  model: string;
  /** User-facing model slug from `--models`, e.g. "flux-schnell". */
  modelSlug: string;
  /** The generated prompt as sent to the render model. */
  prompt: string;
  /** Normalized prompt used for dedup (lowercase, punctuation-stripped). */
  promptNormalized: string;
  /** sha256(`${model}\0${promptNormalized}`) — the dedup key. */
  hash: string;
  mediaType: MediaType;
  /**
   * Where the asset lives.
   *  - image: relative path inside the batch dir, e.g. "assets/<id>.png".
   *  - video: an absolute R2 / media.nodetool.ai URL when uploaded, otherwise a
   *    relative local path like images. Ingest branches on whether this is an
   *    http(s) URL: URLs pass through, local paths get copied into
   *    `marketing/public/showcase/<batch>/`.
   */
  asset: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  /** Summed USD cost attributed to this row (LLM share + render estimate). */
  costUsd: number;
  /** ISO timestamp the row was written. */
  createdAt: string;
  /** Engine-specific params. Duel rows carry `duelId`/`duelPair`; else absent. */
  params?: ShowcaseParams;
}
