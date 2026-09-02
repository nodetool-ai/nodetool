import { BLOG_BASE, postsByDate } from "@/data/blogEntries";

/**
 * RSS 2.0 feed for the blog. Static at build time — it re-renders when the
 * generated post module changes, which is the only way a post changes.
 */
export const dynamic = "force-static";

const BASE_URL = "https://nodetool.ai";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rfc822(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toUTCString();
}

export function GET(): Response {
  const items = postsByDate
    .map(
      (p) => `    <item>
      <title>${escapeXml(p.headline)}</title>
      <link>${BASE_URL}${p.route}</link>
      <guid isPermaLink="true">${BASE_URL}${p.route}</guid>
      <description>${escapeXml(p.description)}</description>
      <category>${escapeXml(p.tag)}</category>
      <pubDate>${rfc822(p.date)}</pubDate>
    </item>`,
    )
    .join("\n");

  const lastBuild = postsByDate[0] ? rfc822(postsByDate[0].updated ?? postsByDate[0].date) : rfc822("1970-01-01");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>NodeTool blog</title>
    <link>${BASE_URL}${BLOG_BASE}</link>
    <atom:link href="${BASE_URL}${BLOG_BASE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Guides, cost breakdowns, model roundups, tutorials, and comparisons on building AI workflows in NodeTool.</description>
    <language>en</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
