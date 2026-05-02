import type { MetadataRoute } from "next";

const BASE_URL = "https://nodetool.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${BASE_URL}/`,
      lastModified: now,
    },
    {
      url: `${BASE_URL}/agents`,
      lastModified: now,
    },
    {
      url: `${BASE_URL}/creatives`,
      lastModified: now,
    },
    {
      url: `${BASE_URL}/business`,
      lastModified: now,
    },
    {
      url: `${BASE_URL}/developers`,
      lastModified: now,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: now,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: now,
    },
  ];
}
