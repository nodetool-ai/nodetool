import type { MetadataRoute } from "next";
import { registry } from "@/data/registry";
import { routeUpdated } from "@/data/contentDates";

const BASE_URL = "https://nodetool.ai";

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
        changeFrequency: entry.changeFrequency,
        priority: entry.priority,
      };
    });
}
