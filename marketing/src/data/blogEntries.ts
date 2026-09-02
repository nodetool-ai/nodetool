import type { OgAccent } from "@/lib/og";
import type { PageEntry } from "./types";
import { generatedBlogPosts } from "./blogEntries.generated";

/**
 * Blog / resource-hub page data.
 *
 * Posts are Markdown files in `marketing/content/blog/<slug>.md` — front
 * matter plus a GFM body, with `## FAQ` and `## Read next` sections lifted out
 * as structured data. `scripts/generate-blog-entries.mjs` turns that folder
 * into `blogEntries.generated.ts` (`npm run gen:blog`; `seo:check` fails when
 * it is stale). This module owns the types and the helpers the pages use.
 *
 * `bodyMd` is rendered by `react-markdown` + `remark-gfm` (the same pair
 * `FaqBlock` uses), so tables and links work without new dependencies.
 *
 * A `BlogPost` extends PR-1's `PageEntry`, so the hub and every post fold into
 * the sitemap and the smoke walk through `registry.ts` with no other edits.
 */

export const BLOG_BASE = "/blog";

/**
 * Coarse grouping shown on the hub and as the post's chip. The families and
 * the title formulas behind them are in `marketing/seo/BLOG_STRATEGY.md`.
 */
export type BlogTag =
  | "Tutorial"
  | "Comparison"
  | "Deep dive"
  | "Guide"
  | "Cost"
  | "Roundup";

export interface BlogPost extends PageEntry {
  slug: string;
  /** H1 on the post page and card title on the hub. */
  headline: string;
  /** Lead paragraph under the H1; also the card summary. */
  excerpt: string;
  tag: BlogTag;
  /** ISO date (YYYY-MM-DD) — drives `datePublished` and the visible byline. */
  date: string;
  /** ISO date of the last substantive edit, when it differs from `date`. */
  updated?: string;
  author: string;
  accent: OgAccent;
  /** Screenshot in `public/` composited into the OG card. */
  ogImage: string;
  /** GitHub-flavored Markdown body. Starts at H2 — the page owns the H1. */
  bodyMd: string;
  /** Rendered as a visible FAQ and emitted as FAQPage JSON-LD. */
  faqs: { question: string; answer: string }[];
  /** Curated "read next" links, rendered at the foot of the post. */
  related: { label: string; href: string; note: string }[];
}

export const blogPosts: BlogPost[] = generatedBlogPosts;

/** Newest first — the order the hub renders. */
export const postsByDate: BlogPost[] = [...blogPosts].sort((a, b) =>
  b.date.localeCompare(a.date),
);

export function getPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

export const blogTags: BlogTag[] = [
  "Guide",
  "Cost",
  "Roundup",
  "Tutorial",
  "Comparison",
  "Deep dive",
];

export function postsForTag(tag: BlogTag): BlogPost[] {
  return postsByDate.filter((p) => p.tag === tag);
}

/** Reading time in whole minutes at 220 wpm, floored at 1. */
export function readingMinutes(post: BlogPost): number {
  const words = post.bodyMd.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

/** "14 July 2026" — stable across locales because the format is explicit. */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Two other posts to surface at the foot of a post — same family first. */
export function siblingPosts(slug: string): BlogPost[] {
  const self = getPost(slug);
  const others = postsByDate.filter((p) => p.slug !== slug);
  const sameTag = others.filter((p) => p.tag === self?.tag);
  const rest = others.filter((p) => p.tag !== self?.tag);
  return [...sameTag, ...rest].slice(0, 2);
}

/** Registry entries: the `/blog` hub plus one page per post. */
export const blogPageEntries: PageEntry[] = [
  {
    route: BLOG_BASE,
    title: "Blog — NodeTool",
    description:
      "Guides, cost breakdowns, model roundups, tutorials, and comparisons on building AI workflows in NodeTool, all on your own keys.",
    priority: 0.7,
    changeFrequency: "weekly",
    indexable: true,
  },
  ...postsByDate.map(
    (p): PageEntry => ({
      route: p.route,
      title: p.title,
      description: p.description,
      priority: p.priority,
      changeFrequency: p.changeFrequency,
      indexable: p.indexable,
    }),
  ),
];
