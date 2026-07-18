/**
 * Mini-app page-data contract, consumed by the `/apps/*` routes.
 *
 * `miniAppEntries.generated.ts` is written by
 * `marketing/scripts/generate-miniapp-entries.mjs` from the app-builder
 * documents (`workflow.app_doc`) on the shipped example workflows. Do not edit
 * the generated file by hand — run `npm run gen:apps`.
 *
 * A `MiniAppEntry` extends the `PageEntry` contract, so it folds into the
 * sitemap and smoke walk with no special-casing.
 */
import type { PageEntry } from "./types";

export interface MiniAppInput {
  label: string;
  /** Presentation kind: text | number | toggle | choice | image | audio | video | color. */
  kind: string;
}

export interface MiniAppOutput {
  label: string;
  /** What the widget displays: text | image | audio | video | data | progress. */
  kind: string;
}

export interface MiniAppEntry extends PageEntry {
  slug: string;
  /** Human name, e.g. "Movie Posters". */
  name: string;
  /** The workflow's own description (may be empty). */
  summary: string;
  /** Hero app — leads the /apps index (curation table `featured: true`). */
  featured: boolean;
  /** Route of the matching /templates page. */
  templateRoute: string;
  /** Public path to the app screenshot (`/apps/<slug>.png`) or null. */
  screenshot: string | null;
  tags: string[];
  /** The app's H1, straight from the app document (usually emoji-prefixed). */
  heading: string;
  /** The app's one-line pitch, straight from the app document. */
  tagline: string;
  /** The run button's label, e.g. "Generate my ads". */
  buttonLabel: string;
  inputs: MiniAppInput[];
  outputs: MiniAppOutput[];
  widgetCount: number;
}

export { miniAppEntries } from "./miniAppEntries.generated";

/** Mini apps sharing the most tags with `entry`, best first. */
export function relatedMiniApps(
  entry: MiniAppEntry,
  all: MiniAppEntry[],
  limit = 6,
): MiniAppEntry[] {
  const tags = new Set(entry.tags);
  return all
    .filter((a) => a.slug !== entry.slug)
    .map((a) => ({ a, score: a.tags.filter((t) => tags.has(t)).length }))
    .sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name))
    .slice(0, limit)
    .map((x) => x.a);
}
