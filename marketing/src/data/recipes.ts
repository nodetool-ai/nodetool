/**
 * Recipe page-data contract, consumed by the `/recipes/*` routes.
 *
 * A recipe is a named outcome plus the ordered shipped example workflows that
 * reach it, downloadable as one `.nodetool` bundle. Where a template page
 * answers "what does this graph do", a recipe answers "what do I run, in what
 * order, and what does it cost me".
 *
 * `recipeEntries.generated.ts` is written by
 * `marketing/scripts/generate-recipes.mjs` from the editorial specs in
 * `marketing/scripts/recipes.mjs` plus the shipped examples themselves. Do not
 * edit the generated file by hand — run `npm run gen:recipes`.
 */
import type { PageEntry } from "./types";
import { templateEntries } from "./templates";

/** One model a step's graph calls, as the graph records it. */
export interface RecipeModelRef {
  /** Runtime provider id, e.g. "fal_ai". */
  provider: string;
  /** Serving model id, e.g. "fal-ai/flux/schnell". */
  model: string;
}

export interface RecipeStep {
  /** Template slug — resolves in `templateEntries`. */
  template: string;
  name: string;
  /** The template's own page, e.g. "/templates/hook-and-thumbnail-factory". */
  route: string;
  /** What this step is for, in the recipe's terms. */
  role: string;
  /** What goes in and what comes back out. */
  handoff: string;
  thumbnail: string | null;
  nodeCount: number;
  /** Empty when the step runs locally and calls no provider. */
  models: RecipeModelRef[];
}

/** A provider key the chain needs, with the env var NodeTool reads. */
export interface RecipeKey {
  provider: string;
  env: string;
}

/**
 * A real run of the recipe: the chain executed against live models, with the
 * models that actually produced it. Null when a recipe has no sample yet.
 */
export interface RecipeSample {
  /** Contact sheet of the run, `/recipes/samples/<slug>.jpg`. */
  image: string;
  /** Clip from the run, or null when the sample is stills only. */
  video: string | null;
  webm: string | null;
  poster: string | null;
  /** The clip carries sound, so it gets controls rather than a muted loop. */
  hasAudio: boolean;
  caption: string;
  /** `provider:model` in the order the chain ran them. */
  producedBy: string[];
}

export interface RecipeEntry extends PageEntry {
  sample: RecipeSample | null;
  slug: string;
  name: string;
  /** One sentence: what you end up holding. */
  outcome: string;
  audience: string;
  /** Intro paragraphs. */
  summary: string[];
  /** What the recipe does not do, stated plainly. */
  caveats: string[];
  heroThumbnail: string | null;
  /** Public path to the `.nodetool` bundle. */
  bundle: string;
  workflowCount: number;
  /** Nodes across every workflow in the bundle. */
  nodeCount: number;
  keys: RecipeKey[];
  steps: RecipeStep[];
}

export { recipeEntries } from "./recipeEntries.generated";

/** A step's card art, falling back to the template entry if one is missing. */
export function stepThumbnail(step: RecipeStep): string | null {
  if (step.thumbnail) return step.thumbnail;
  return templateEntries.find((t) => t.slug === step.template)?.thumbnail ?? null;
}

/**
 * Recipes that use a given template, so a template page can point at the
 * larger jobs its workflow is one step of.
 */
export function recipesUsingTemplate(
  templateSlug: string,
  all: RecipeEntry[],
): RecipeEntry[] {
  return all.filter((r) => r.steps.some((s) => s.template === templateSlug));
}
