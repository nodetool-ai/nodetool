/**
 * Seed showcase fixtures — committed test data for the `/showcase/*` routes.
 *
 * These five rows stand in for a generated batch until W-1 (the showcase seeder)
 * lands a real one: `showcase.ts` uses them only while
 * `showcaseEntries.generated.ts` is empty. They also double as the manifest the
 * acceptance criteria build against — five entries, one of them a near-duplicate
 * carrying `canonicalOf` (so the canonical-tag path is exercised).
 *
 * The shape and derived fields (route/title/description/…) match what
 * `marketing/scripts/ingest-showcase.mjs` emits, so swapping in real data is a
 * no-op for the pages.
 */
import type { ShowcaseEntry } from "./showcase";

const MOVIE_1_ROUTE = "/showcase/movie-posters/a1b2c3d4e5f60718";

export const showcaseFixtures: ShowcaseEntry[] = [
  {
    route: MOVIE_1_ROUTE,
    title:
      "Movie Posters · A lone astronaut adrift before a dying star — flux-schnell | NodeTool",
    description:
      "AI-generated image (movie posters) made with flux-schnell on NodeTool: A lone astronaut adrift before a dying star, cinematic sci-fi key art, deep shadows and cold blue rim light.",
    priority: 0.6,
    changeFrequency: "monthly",
    indexable: true,
    id: "a1b2c3d4e5f60718",
    batch: "seed-movie-posters",
    template: "movie-posters",
    category: "posters",
    provider: "fal_ai",
    model: "fal-ai/flux/schnell",
    modelSlug: "flux-schnell",
    prompt:
      "A lone astronaut adrift before a dying star, cinematic sci-fi key art, deep shadows and cold blue rim light, dramatic negative space, title treatment at the base.",
    mediaType: "image",
    src: "/showcase/seed-movie-posters/a1b2c3d4e5f60718.svg",
    width: 800,
    height: 1200,
  },
  {
    route: "/showcase/movie-posters/b2c3d4e5f6071829",
    title:
      "Movie Posters · Neon-drenched cyberpunk detective in the rain — flux-dev | NodeTool",
    description:
      "AI-generated image (movie posters) made with flux-dev on NodeTool: Neon-drenched cyberpunk detective in the rain, noir key art, magenta and cyan reflections on wet asphalt.",
    priority: 0.6,
    changeFrequency: "monthly",
    indexable: true,
    id: "b2c3d4e5f6071829",
    batch: "seed-movie-posters",
    template: "movie-posters",
    category: "posters",
    provider: "fal_ai",
    model: "fal-ai/flux/dev",
    modelSlug: "flux-dev",
    prompt:
      "Neon-drenched cyberpunk detective in the rain, noir movie poster, magenta and cyan reflections on wet asphalt, towering city, moody backlit silhouette.",
    mediaType: "image",
    src: "/showcase/seed-movie-posters/b2c3d4e5f6071829.svg",
    width: 800,
    height: 1200,
  },
  {
    route: "/showcase/product-shots/c3d4e5f607182930",
    title:
      "Product Shots · Matte-black wireless earbuds on a seamless backdrop — flux-schnell | NodeTool",
    description:
      "AI-generated image (product shots) made with flux-schnell on NodeTool: Matte-black wireless earbuds floating above a seamless studio backdrop, soft key light, subtle cyan glow.",
    priority: 0.6,
    changeFrequency: "monthly",
    indexable: true,
    id: "c3d4e5f607182930",
    batch: "seed-product-shots",
    template: "product-shots",
    category: "product-shots",
    provider: "fal_ai",
    model: "fal-ai/flux/schnell",
    modelSlug: "flux-schnell",
    prompt:
      "Matte-black wireless earbuds floating above a seamless studio backdrop, clean commercial product photography, soft key light, subtle cyan accent glow, shallow depth of field.",
    mediaType: "image",
    src: "/showcase/seed-product-shots/c3d4e5f607182930.svg",
    width: 1024,
    height: 1024,
  },
  {
    route: "/showcase/album-covers/d4e5f60718293041",
    title:
      "Album Covers · Dreamy synthwave sunset over a chrome grid — flux-schnell | NodeTool",
    description:
      "AI-generated image (album covers) made with flux-schnell on NodeTool: Dreamy synthwave sunset over a chrome grid, square record cover, gradient sky from cyan to magenta.",
    priority: 0.6,
    changeFrequency: "monthly",
    indexable: true,
    id: "d4e5f60718293041",
    batch: "seed-album-covers",
    template: "album-covers",
    category: "album-covers",
    provider: "fal_ai",
    model: "fal-ai/flux/schnell",
    modelSlug: "flux-schnell",
    prompt:
      "Dreamy synthwave sunset over an endless chrome grid, square album cover, gradient sky from cyan to magenta, retro sun, bold centered typography.",
    mediaType: "image",
    src: "/showcase/seed-album-covers/d4e5f60718293041.svg",
    width: 1024,
    height: 1024,
  },
  // Near-duplicate of the first entry (same normalized prompt on the same
  // model). Ingest keeps it but points it at the canonical route and marks it
  // non-indexable — so the page emits <link rel="canonical"> and noindex.
  {
    route: "/showcase/movie-posters/e5f6071829304152",
    title:
      "Movie Posters · A lone astronaut adrift before a dying star — flux-schnell | NodeTool",
    description:
      "AI-generated image (movie posters) made with flux-schnell on NodeTool: A lone astronaut adrift before a dying star, cinematic sci-fi key art.",
    priority: 0.6,
    changeFrequency: "monthly",
    indexable: false,
    canonicalOf: MOVIE_1_ROUTE,
    id: "e5f6071829304152",
    batch: "seed-movie-posters",
    template: "movie-posters",
    category: "posters",
    provider: "fal_ai",
    model: "fal-ai/flux/schnell",
    modelSlug: "flux-schnell",
    prompt:
      "A lone astronaut adrift before a dying star, cinematic sci-fi key art, deep shadows and cold blue rim light.",
    mediaType: "image",
    src: "/showcase/seed-movie-posters/a1b2c3d4e5f60718.svg",
    width: 800,
    height: 1200,
  },
];
