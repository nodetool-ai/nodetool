/**
 * Shared page-data contract for the programmatic-SEO engines.
 *
 * Every page engine (templates, showcase, models, competitors, …) exports an
 * `entries: PageEntry[]` array plus its own engine-specific fields. The sitemap
 * and the e2e smoke suite both derive their coverage from these entries, so a
 * page added to a data module shows up in both with no other edits.
 */
export type ChangeFrequency = "weekly" | "monthly" | "yearly";

export type PageEntry = {
  /** Absolute path, e.g. "/templates/movie-posters". */
  route: string;
  /** Full <title> text. */
  title: string;
  /** Meta description. */
  description: string;
  /** Sitemap priority hint (0–1). */
  priority: number;
  changeFrequency: ChangeFrequency;
  /** false → noindex and excluded from the sitemap. */
  indexable: boolean;
};

/**
 * Build-time current year, for title/description templates
 * (e.g. `Best AI video models ${yearToken()}`). Evaluated when the page or
 * sitemap is generated, so a rebuild refreshes it.
 */
export function yearToken(): number {
  return new Date().getFullYear();
}
