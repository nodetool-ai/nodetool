import type { MetadataRoute } from "next";

const BASE_URL = "https://nodetool.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  type Entry = {
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  };

  // Ordered by importance so the priority/changeFrequency hints stay obvious.
  const entries: Entry[] = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" },
    { path: "/studio", priority: 0.9, changeFrequency: "weekly" },
    { path: "/cloud", priority: 0.9, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.8, changeFrequency: "weekly" },
    { path: "/agents", priority: 0.8, changeFrequency: "monthly" },
    { path: "/creatives", priority: 0.8, changeFrequency: "monthly" },
    { path: "/developers", priority: 0.8, changeFrequency: "monthly" },
    { path: "/vs/comfyui", priority: 0.7, changeFrequency: "monthly" },
    { path: "/vs/weavy", priority: 0.7, changeFrequency: "monthly" },
    { path: "/use-cases/product-video", priority: 0.6, changeFrequency: "monthly" },
    { path: "/use-cases/movie-poster", priority: 0.6, changeFrequency: "monthly" },
    { path: "/use-cases/movie-trailer", priority: 0.6, changeFrequency: "monthly" },
    { path: "/imprint", priority: 0.3, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  ];

  return entries.map((entry) => ({
    url: `${BASE_URL}${entry.path}`,
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
