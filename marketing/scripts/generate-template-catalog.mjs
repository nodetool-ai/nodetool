/**
 * Template catalog generator — buckets the shipped example workflows into idea
 * categories for the `/ideas/*` pages.
 *
 * Reads every `packages/base-nodes/nodetool/examples/nodetool-base/*.json`,
 * takes name / description / tags, maps the tags onto a small set of idea
 * categories, and writes `marketing/src/data/templateCatalog.generated.ts`
 * (checked in; CI can re-run this to catch drift).
 *
 * This is deliberately minimal: PR-2 ships a richer `templateEntries.generated`
 * from the same examples (graph geometry, thumbnails, node lists). When it
 * lands, `/ideas/*` can point at that module instead — this file only needs
 * name/description/tags to bucket ideas, so it stays dependency-correct on PR-1.
 *
 * Usage (from repo root or marketing/):
 *   node marketing/scripts/generate-template-catalog.mjs
 *   node marketing/scripts/generate-template-catalog.mjs --check   # fail if stale
 */

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const EXAMPLES_DIR = join(
  REPO_ROOT,
  "packages/base-nodes/nodetool/examples/nodetool-base"
);
const OUT_FILE = resolve(
  __dirname,
  "..",
  "src/data/templateCatalog.generated.ts"
);

/**
 * Idea categories, in display order. Each has an ordered list of tags that map
 * onto it; the first category whose tags match a template's tags wins. A
 * template that matches nothing lands in `automation` (the catch-all).
 */
const CATEGORIES = [
  {
    slug: "image-generation",
    label: "Image Generation",
    description:
      "Generate and edit images on the canvas — concept art, product shots, posters, and batch pipelines.",
    tags: ["image", "photo", "concept-art", "brand-asset", "product-mockup", "design", "thumbnails"],
  },
  {
    slug: "video-generation",
    label: "Video Generation",
    description:
      "Turn prompts, images, and briefs into video — trailers, product spots, animations, and music visuals.",
    tags: ["video", "trailer", "storytelling", "animation", "visualization"],
  },
  {
    slug: "audio-and-voice",
    label: "Audio & Voice",
    description:
      "Transcribe, summarize, and generate audio — podcasts, voiceovers, and music-driven pipelines.",
    tags: ["audio", "music", "podcast"],
  },
  {
    slug: "agents-and-research",
    label: "Agents & Research",
    description:
      "Planning agents that search, gather, and synthesize — news, papers, and web research on the canvas.",
    tags: ["agents", "agent", "research", "search", "google", "hackernews", "wikipedia", "news", "analysis"],
  },
  {
    slug: "marketing-and-content",
    label: "Marketing & Content",
    description:
      "Campaign assets and content at scale — ad creative, social calendars, SEO copy, and outreach.",
    tags: ["marketing", "advertising", "seo", "content", "social", "social media", "sales", "outreach", "writing", "business"],
  },
  {
    slug: "learning-and-data",
    label: "Learning & Data",
    description:
      "Study aids and data workflows — flashcards, learning paths, summaries, and structured generation.",
    tags: ["education", "learning", "flashcards", "data", "database", "automation"],
  },
];

const FALLBACK_CATEGORY = "marketing-and-content";

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function categoryFor(tags) {
  const lower = tags.map((t) => String(t).toLowerCase());
  for (const cat of CATEGORIES) {
    if (cat.tags.some((t) => lower.includes(t))) return cat.slug;
  }
  return FALLBACK_CATEGORY;
}

function readTemplates() {
  if (!existsSync(EXAMPLES_DIR)) {
    throw new Error(`Examples dir not found: ${EXAMPLES_DIR}`);
  }
  const files = readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const templates = [];
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(EXAMPLES_DIR, file), "utf8"));
    const name = String(raw.name || "").trim();
    const description = String(raw.description || "").trim();
    const tags = Array.isArray(raw.tags)
      ? raw.tags.filter((t) => t && t !== "example" && t !== "start")
      : [];
    // Skip templates with no usable description — nothing to say about them.
    if (!name || description.length < 20) continue;
    templates.push({
      slug: slugify(name),
      name,
      description,
      tags,
      category: categoryFor(tags),
    });
  }
  return templates;
}

function buildCatalog(templates) {
  return CATEGORIES.map((cat) => ({
    slug: cat.slug,
    label: cat.label,
    description: cat.description,
    templates: templates
      .filter((t) => t.category === cat.slug)
      .map(({ slug, name, description, tags }) => ({ slug, name, description, tags })),
  })).filter((c) => c.templates.length > 0);
}

function render(catalog) {
  const body = JSON.stringify(catalog, null, 2);
  return `// AUTO-GENERATED by marketing/scripts/generate-template-catalog.mjs — do not edit by hand.
// Regenerate: node marketing/scripts/generate-template-catalog.mjs

/** One example workflow, reduced to what the idea pages need. */
export interface CatalogTemplate {
  slug: string;
  name: string;
  description: string;
  tags: string[];
}

/** An idea category with the templates bucketed into it. */
export interface CatalogCategory {
  slug: string;
  label: string;
  description: string;
  templates: CatalogTemplate[];
}

export const templateCatalog: CatalogCategory[] = ${body};
`;
}

function main() {
  const check = process.argv.includes("--check");
  const templates = readTemplates();
  const catalog = buildCatalog(templates);
  const next = render(catalog);

  if (check) {
    const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : "";
    if (current !== next) {
      console.error(
        "templateCatalog.generated.ts is stale. Run: node marketing/scripts/generate-template-catalog.mjs"
      );
      process.exit(1);
    }
    console.log("templateCatalog.generated.ts is up to date.");
    return;
  }

  writeFileSync(OUT_FILE, next);
  const count = catalog.reduce((n, c) => n + c.templates.length, 0);
  console.log(
    `Wrote ${OUT_FILE} — ${count} templates across ${catalog.length} categories.`
  );
}

main();
