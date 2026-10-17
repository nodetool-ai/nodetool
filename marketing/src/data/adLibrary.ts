import recipes from "./adLibrary.json";
import type { PageEntry } from "./types";

export const adRecipes = recipes;
export type AdRecipe = (typeof adRecipes)[number];
export type AdBeat = AdRecipe["beats"][number];

const WORD_OVERRIDES: Record<string, string> = { cta: "CTA" };

/** Turns a data key such as `outcome_and_cta` or `label_1_2` into a label. */
export function formatKey(key: string): string {
  const text = key
    .replace(/_(\d+)_(\d+)$/, " $1–$2")
    .split("_")
    .map((word) => WORD_OVERRIDES[word] ?? word)
    .join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatSeconds(ms: number): string {
  return `${Number((ms / 1000).toFixed(2))}s`;
}

export function illustrationSrc(beatId: string): string {
  return `/ad-library/illustrations/${beatId}.webp`;
}

export const adLibraryEntries: PageEntry[] = [
  {
    route: "/ad-library",
    title: "Editable Video Ad Templates for Social Media | NodeTool",
    description:
      "Editable vertical video ad templates for social media. Each concept ships as a NodeTool mini app that builds the ad from your images, logo, and copy.",
    priority: 0.8,
    changeFrequency: "monthly",
    indexable: true
  },
  ...adRecipes.map(
    (recipe): PageEntry => ({
      route: recipe.route,
      title: `${recipe.title} video ad template | NodeTool`,
      description: recipe.objective,
      priority: 0.6,
      changeFrequency: "monthly",
      indexable: true
    })
  )
];
