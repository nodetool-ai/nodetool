import type { MetadataRoute } from "next";
import { registry } from "@/data/registry";

const BASE_URL = "https://nodetool.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  return registry
    .filter((entry) => entry.indexable)
    .map((entry) => ({
      url: `${BASE_URL}${entry.route}`,
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    }));
}
