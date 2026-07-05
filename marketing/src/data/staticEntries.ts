import type { PageEntry } from "./types";

/**
 * Hand-authored routes that don't come from a generated page engine — the
 * homepage, product/segment landings, the current comparison and use-case
 * pages, and the legal pages. Ordered by importance so the priority hints stay
 * obvious. This is just another data module: adding an entry here flows into the
 * sitemap and the smoke suite with no other edits.
 *
 * priority / changeFrequency reproduce the previous hand-ordered sitemap exactly
 * (this list is the source of that sitemap now). title / description are
 * placeholders for these routes — each static page owns its own <title> via its
 * own metadata; the sitemap only reads route / priority / changeFrequency.
 */
export const staticEntries: PageEntry[] = [
  { route: "/", title: "NodeTool", description: "The open creative AI workspace.", priority: 1.0, changeFrequency: "weekly", indexable: true },
  { route: "/studio", title: "NodeTool Studio", description: "Run open models on your own machine.", priority: 0.9, changeFrequency: "weekly", indexable: true },
  { route: "/cloud", title: "NodeTool Cloud", description: "Run NodeTool workflows in the cloud.", priority: 0.9, changeFrequency: "weekly", indexable: true },
  { route: "/pricing", title: "Pricing", description: "Free Studio, your own keys, pay providers directly.", priority: 0.8, changeFrequency: "weekly", indexable: true },
  { route: "/agents", title: "AI Agents", description: "Build planning agents on a visual canvas.", priority: 0.8, changeFrequency: "monthly", indexable: true },
  { route: "/creatives", title: "For Creatives", description: "A node-based canvas for creative AI work.", priority: 0.8, changeFrequency: "monthly", indexable: true },
  { route: "/developers", title: "For Developers", description: "Wire every major model into one canvas.", priority: 0.8, changeFrequency: "monthly", indexable: true },
  { route: "/marketing", title: "For Marketing", description: "Produce campaign assets with AI workflows.", priority: 0.8, changeFrequency: "monthly", indexable: true },
  // /vs/* and /alternatives/* come from the competitorEntries engine module.
  { route: "/templates", title: "AI Workflow Templates", description: "Browse ready-to-run NodeTool workflow templates by category.", priority: 0.8, changeFrequency: "weekly", indexable: true },
  { route: "/use-cases/product-video", title: "Product Video", description: "Make product videos with AI workflows.", priority: 0.6, changeFrequency: "monthly", indexable: true },
  { route: "/use-cases/movie-poster", title: "Movie Poster", description: "Generate movie posters with AI workflows.", priority: 0.6, changeFrequency: "monthly", indexable: true },
  { route: "/use-cases/movie-trailer", title: "Movie Trailer", description: "Cut movie trailers with AI workflows.", priority: 0.6, changeFrequency: "monthly", indexable: true },
  { route: "/imprint", title: "Imprint", description: "Legal imprint.", priority: 0.3, changeFrequency: "yearly", indexable: true },
  { route: "/privacy", title: "Privacy Policy", description: "Privacy policy.", priority: 0.3, changeFrequency: "yearly", indexable: true },
  { route: "/terms", title: "Terms of Service", description: "Terms of service.", priority: 0.3, changeFrequency: "yearly", indexable: true },
];
