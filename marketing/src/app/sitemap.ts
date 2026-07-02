import type { MetadataRoute } from "next";
import { registry } from "@/data/registry";

const BASE_URL = "https://nodetool.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return registry
    .filter((entry) => entry.indexable)
    .map((entry) => ({
      url: `${BASE_URL}${entry.route}`,
      lastModified: now,
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    }));
}
