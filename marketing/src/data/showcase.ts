/**
 * Showcase page-data contract, consumed by the `/showcase/*` routes (PR-3).
 *
 * `showcaseEntries.generated.ts` is written by
 * `marketing/scripts/ingest-showcase.mjs` from the seeder's `manifest.jsonl`
 * batches. Do not edit the generated file by hand.
 *
 * A `ShowcaseEntry` is a `ShowcaseRecord` (see marketing/seo/showcase-schema.ts)
 * plus the derived page fields. The page fields mirror PR-1's `PageEntry`
 * contract; when PR-1 lands its shared `types.ts`, `ShowcaseEntry` should be
 * refactored to `extends PageEntry`.
 */

export interface ShowcaseEntry {
  // --- derived page fields (PageEntry-shaped) ---
  /** Canonical route, e.g. "/showcase/movie-posters/1a2b3c4d". */
  route: string;
  /** Full <title> text. */
  title: string;
  /** Meta description. */
  description: string;
  /** Sitemap priority hint. */
  priority: number;
  changeFrequency: "weekly" | "monthly";
  /** false → noindex + excluded from the sitemap. */
  indexable: boolean;

  // --- showcase-specific fields ---
  id: string;
  batch: string;
  template: string;
  category: string;
  provider: string;
  model: string;
  modelSlug: string;
  prompt: string;
  mediaType: "image" | "video";
  /**
   * Public asset location: a same-origin path like "/showcase/<batch>/<file>"
   * for committed images, or an absolute URL (media.nodetool.ai / R2) for video.
   */
  src: string;
  width: number | null;
  height: number | null;
}

export { showcaseEntries } from "./showcaseEntries.generated";
