import type { PageEntry } from "./types";
import { templateCatalog, type CatalogCategory } from "./templateCatalog.generated";

/**
 * `/ideas/*` page data, derived from the generated template catalog.
 *
 * One page per idea category (`/ideas/<category-slug>`) plus the `/ideas` hub.
 * The catalog is built by `scripts/generate-template-catalog.mjs` from the
 * shipped example workflows, so this engine needs no data of its own.
 *
 * When PR-2 lands its richer `templateEntries.generated`, the idea pages can
 * link straight to `/templates/<slug>`. Until then they link only to routes
 * that exist today (see `relatedRouteFor` in the page), so there are no broken
 * internal links.
 */

export interface IdeaCategory extends CatalogCategory {
  route: string;
}

const IDEAS_BASE = "/ideas";

export const ideaCategories: IdeaCategory[] = templateCatalog.map((cat) => ({
  ...cat,
  route: `${IDEAS_BASE}/${cat.slug}`,
}));

export function getIdeaCategory(slug: string): IdeaCategory | undefined {
  return ideaCategories.find((c) => c.slug === slug);
}

/** Page entries for the registry: the `/ideas` hub plus one page per category. */
export const ideasPageEntries: PageEntry[] = [
  {
    route: IDEAS_BASE,
    title: "AI workflow ideas — NodeTool",
    description:
      "Ideas for what to build in NodeTool, grouped by category: image, video, audio, agents, marketing, and data workflows.",
    priority: 0.6,
    changeFrequency: "monthly",
    indexable: true,
  },
  ...ideaCategories.map(
    (cat): PageEntry => ({
      route: cat.route,
      title: `${cat.label} workflow ideas — NodeTool`,
      description: cat.description.slice(0, 155),
      priority: 0.5,
      changeFrequency: "monthly",
      indexable: true,
    })
  ),
];
