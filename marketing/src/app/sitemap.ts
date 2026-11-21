import type { MetadataRoute } from "next";
import { registry } from "@/data/registry";
import { routeUpdated } from "@/data/contentDates";
import { HOME_LANGUAGE_ALTERNATES } from "@/data/languagePages";
import { englishRoute, languageAlternates } from "@/i18n/routes";

const BASE_URL = "https://nodetool.ai";

const absolute = (languages: Record<string, string>) =>
  Object.fromEntries(Object.entries(languages).map(([lang, path]) => [lang, `${BASE_URL}${path}`]));

/** The home page and the language overviews list one another. */
const HOME_LANGUAGE_URLS = absolute(HOME_LANGUAGE_ALTERNATES);
const HOME_LANGUAGE_ROUTES = new Set<string>(Object.values(HOME_LANGUAGE_ALTERNATES));

/**
 * Routes with translations list every language version (xhtml:link): the
 * home set above, and each translated page with its English page.
 */
function languageUrls(route: string): Record<string, string> | undefined {
  if (HOME_LANGUAGE_ROUTES.has(route)) return HOME_LANGUAGE_URLS;
  const languages = languageAlternates(englishRoute(route));
  return languages ? absolute(languages) : undefined;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return registry
    .filter((entry) => entry.indexable)
    .map((entry) => {
      // Only routes with a commit-derived date get lastmod. See
      // scripts/generate-content-dates.mjs.
      const lastModified = routeUpdated(entry.route);
      const languages = languageUrls(entry.route);
      return {
        url: `${BASE_URL}${entry.route}`,
        ...(lastModified ? { lastModified } : {}),
        ...(languages ? { alternates: { languages } } : {}),
        changeFrequency: entry.changeFrequency,
        priority: entry.priority,
      };
    });
}
