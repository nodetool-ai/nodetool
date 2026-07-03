/**
 * Showcase page-data contract, consumed by the `/showcase/*` routes (PR-3).
 *
 * `showcaseEntries.generated.ts` is written by
 * `marketing/scripts/ingest-showcase.mjs` from the seeder's `manifest.jsonl`
 * batches (W-1). Do not edit the generated file by hand.
 *
 * A `ShowcaseEntry` is a `ShowcaseRecord` (see marketing/seo/showcase-schema.ts)
 * plus the derived page fields — it `extends PageEntry`, so it drops straight
 * into the registry, sitemap, and smoke suite.
 *
 * Until W-1 lands a real batch the generated file is empty, so the routes fall
 * back to `showcaseFixtures` — five committed seed rows (one a near-duplicate
 * carrying `canonicalOf`) that let the route build and render. A real ingest run
 * fills the generated file and the fixtures drop out automatically.
 */
import type { PageEntry } from "./types";
import { showcaseEntries as generatedEntries } from "./showcaseEntries.generated";
import { showcaseFixtures } from "./showcaseFixtures";

export interface ShowcaseEntry extends PageEntry {
  // --- showcase-specific fields ---
  id: string;
  batch: string;
  /** Workflow/template slug the prompt was written for, e.g. "movie-posters". */
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
  /**
   * Near-duplicate marker. When set, this row renders a `<link rel="canonical">`
   * pointing at `canonicalOf` (the route of the kept entry) and is `indexable:
   * false`. The near-duplicate rule is enforced at ingest, not render.
   */
  canonicalOf?: string;
}

/**
 * The live showcase rows. Real ingested batches take precedence; the seed
 * fixtures only stand in while the generated file is empty (pre-W-1).
 */
export const showcaseEntries: ShowcaseEntry[] =
  generatedEntries.length > 0 ? generatedEntries : showcaseFixtures;

/** Distinct model slugs across the live entries, sorted, with a count each. */
export function showcaseModels(
  entries: ShowcaseEntry[] = showcaseEntries
): { slug: string; label: string; count: number }[] {
  return facet(entries, (e) => e.modelSlug);
}

/** Distinct workflow (template) slugs across the live entries, with counts. */
export function showcaseWorkflows(
  entries: ShowcaseEntry[] = showcaseEntries
): { slug: string; label: string; count: number }[] {
  return facet(entries, (e) => e.template);
}

function facet(
  entries: ShowcaseEntry[],
  key: (e: ShowcaseEntry) => string
): { slug: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(key(e), (counts.get(key(e)) ?? 0) + 1);
  return [...counts.entries()]
    .map(([slug, count]) => ({ slug, label: humanize(slug), count }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** "movie-posters" → "Movie Posters". */
export function humanize(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Up to `limit` entries related to `entry`, prioritised: same model, then same
 * workflow, then same batch (playbook order). The entry itself and any
 * non-indexable near-duplicates are excluded.
 */
export function relatedEntries(
  entry: ShowcaseEntry,
  entries: ShowcaseEntry[] = showcaseEntries,
  limit = 9
): ShowcaseEntry[] {
  const pool = entries.filter((e) => e.id !== entry.id && e.indexable);
  const seen = new Set<string>();
  const picked: ShowcaseEntry[] = [];
  const tiers: ((e: ShowcaseEntry) => boolean)[] = [
    (e) => e.modelSlug === entry.modelSlug,
    (e) => e.template === entry.template,
    (e) => e.batch === entry.batch,
    () => true, // backfill with anything else
  ];
  for (const match of tiers) {
    for (const e of pool) {
      if (picked.length >= limit) break;
      if (seen.has(e.id) || !match(e)) continue;
      seen.add(e.id);
      picked.push(e);
    }
  }
  return picked.slice(0, limit);
}

export function entryByTemplateAndId(
  template: string,
  id: string
): ShowcaseEntry | undefined {
  return showcaseEntries.find((e) => e.template === template && e.id === id);
}
