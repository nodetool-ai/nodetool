/**
 * Committed same-prompt duel fixtures — stand-ins for W-2 (Model Duel) output
 * until a real duel batch is seeded into `showcaseEntries.generated.ts`.
 *
 * Each pair is two rows sharing a `params.duelId` (same prompt, two models),
 * matching the W-2 schema. They point at images already in `public/`, so pair
 * pages render a real side-by-side out of the box. When generated duel rows
 * exist for a pair, `modelShowcase.ts` prefers them and ignores these.
 */
import type { ShowcaseEntry } from "./showcase";

type FixtureSide = {
  id: string;
  modelSlug: string;
  model: string;
  provider: string;
  src: string;
};

function duel(
  duelId: string,
  duelPair: string,
  template: string,
  category: string,
  mediaType: "image" | "video",
  prompt: string,
  a: FixtureSide,
  b: FixtureSide
): ShowcaseEntry[] {
  return [a, b].map((side) => ({
    route: `/showcase/${template}/${side.id}`,
    title: `${prompt} — ${side.model}`,
    description: prompt,
    priority: 0.4,
    changeFrequency: "monthly" as const,
    indexable: false,
    id: side.id,
    batch: "duel-fixtures",
    template,
    category,
    provider: side.provider,
    model: side.model,
    modelSlug: side.modelSlug,
    prompt,
    mediaType,
    src: side.src,
    width: 832,
    height: 1216,
    params: { duelId, duelPair },
  }));
}

export const duelFixtures: ShowcaseEntry[] = [
  ...duel(
    "fixture-flux-seedream-1",
    "flux-dev-vs-seedream-4",
    "movie-posters",
    "posters",
    "image",
    "A lone astronaut watching a supernova bloom over a dead city, neon title type",
    {
      id: "fixflux1",
      modelSlug: "flux-dev",
      model: "FLUX.1 [dev]",
      provider: "fal_ai",
      src: "/poster-singularity-1.png",
    },
    {
      id: "fixseed1",
      modelSlug: "seedream-4",
      model: "Seedream 4",
      provider: "replicate",
      src: "/poster-singularity-2.png",
    }
  ),
  ...duel(
    "fixture-flux-seedream-2",
    "flux-dev-vs-seedream-4",
    "movie-posters",
    "posters",
    "image",
    "Cyberpunk detective in rain-soaked alley, holographic signage, one-sheet poster",
    {
      id: "fixflux2",
      modelSlug: "flux-dev",
      model: "FLUX.1 [dev]",
      provider: "fal_ai",
      src: "/poster-singularity-3.png",
    },
    {
      id: "fixseed2",
      modelSlug: "seedream-4",
      model: "Seedream 4",
      provider: "replicate",
      src: "/poster-singularity-4.png",
    }
  ),
  ...duel(
    "fixture-imagen-flux-1",
    "flux-dev-vs-imagen-4",
    "movie-posters",
    "posters",
    "image",
    "Mythic desert temple at golden hour, epic scale, teaser poster with clean title",
    {
      id: "fiximagen1",
      modelSlug: "imagen-4",
      model: "Imagen 4",
      provider: "fal_ai",
      src: "/poster-singularity-5.png",
    },
    {
      id: "fixflux3",
      modelSlug: "flux-dev",
      model: "FLUX.1 [dev]",
      provider: "fal_ai",
      src: "/poster-singularity-1.png",
    }
  ),
];
