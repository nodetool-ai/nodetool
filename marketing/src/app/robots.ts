import type { MetadataRoute } from "next";

const BASE_URL = "https://nodetool.ai";

/**
 * Search and assistant crawlers are named so the intent to be crawled and
 * cited is explicit. `*` already allows them; naming them keeps that true if
 * a later rule narrows `*`.
 */
const AI_CRAWLERS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/" })),
      { userAgent: "*", allow: "/" },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
