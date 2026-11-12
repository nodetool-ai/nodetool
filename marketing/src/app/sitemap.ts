import type { MetadataRoute } from "next";
import { registry } from "@/data/registry";
import { routeUpdated } from "@/data/contentDates";
import { HOME_LANGUAGE_ALTERNATES } from "@/data/languagePages";

const BASE_URL = "https://nodetool.ai";

/** Routes with translations list every language version (xhtml:link). */
const LANGUAGE_URLS = Object.fromEntries(
  Object.entries(HOME_LANGUAGE_ALTERNATES).map(([lang, path]) => [lang, `${BASE_URL}${path}`])
);
const LANGUAGE_ROUTES = new Set<string>(Object.values(HOME_LANGUAGE_ALTERNATES));

export default function sitemap(): MetadataRoute.Sitemap {
  return registry
    .filter((entry) => entry.indexable)
    .map((entry) => {
      // Only routes with a commit-derived date get lastmod. See
      // scripts/generate-content-dates.mjs.
      const lastModified = routeUpdated(entry.route);
      return {
        url: `${BASE_URL}${entry.route}`,
        ...(lastModified ? { lastModified } : {}),
        ...(LANGUAGE_ROUTES.has(entry.route) ? { alternates: { languages: LANGUAGE_URLS } } : {}),
        changeFrequency: entry.changeFrequency,
        priority: entry.priority,
      };
    });
}
