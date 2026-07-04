/**
 * Template registry for the showcase seeder.
 *
 * A "template" is a themed showcase domain (movie posters, product shots, …).
 * Each maps to a prompt `category` (which `prompts/<category>.md` system prompt
 * the LLM writes variants with), a render `mediaType`, and generation hints
 * (aspect ratio, default steps). The seeder is invoked per template via
 * `--template <slug>`.
 *
 * This list is intentionally small and hand-curated; grow it as new showcase
 * domains are added. The `domain` string is injected into the prompt-writer's
 * user message to steer variants toward that template's subject matter.
 */

import type { MediaType } from "./showcase-schema.js";

export interface TemplateDef {
  /** URL-safe identifier, passed as `--template`. */
  slug: string;
  /** Human-readable name for titles / logging. */
  name: string;
  /** Which `prompts/<category>.md` system prompt writes the variants. */
  category: string;
  /** What the render model produces. */
  mediaType: MediaType;
  /** One-line domain description handed to the prompt writer. */
  domain: string;
  /** Aspect ratio hint for the render model (provider-dependent). */
  aspectRatio: string;
  /** Inference steps for distilled image models; ignored by video. */
  steps?: number;
}

export const TEMPLATES: TemplateDef[] = [
  {
    slug: "movie-posters",
    name: "Movie Posters",
    category: "posters",
    mediaType: "image",
    domain:
      "dramatic cinematic movie posters for invented films across genres " +
      "(sci-fi, noir, horror, romance, adventure)",
    aspectRatio: "2:3",
    steps: 6
  },
  {
    slug: "product-shots",
    name: "Product Shots",
    category: "product-shots",
    mediaType: "image",
    domain:
      "clean studio product photography of invented consumer products " +
      "(gadgets, cosmetics, footwear, beverages) on seamless backdrops",
    aspectRatio: "1:1",
    steps: 6
  },
  {
    slug: "album-covers",
    name: "Album Covers",
    category: "album-covers",
    mediaType: "image",
    domain:
      "square album cover art for invented bands and records across genres " +
      "(indie, synthwave, jazz, metal, ambient)",
    aspectRatio: "1:1",
    steps: 6
  },
  {
    slug: "product-trailers",
    name: "Product Trailers",
    category: "trailers",
    mediaType: "video",
    domain:
      "short punchy product-teaser video shots for invented tech products, " +
      "single continuous camera move, no text overlays",
    aspectRatio: "16:9"
  }
];

export function templateBySlug(slug: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}
