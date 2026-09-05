/**
 * Recipes: a named outcome plus the ordered shipped example workflows that
 * reach it.
 *
 * A recipe is a file on disk next to the example workflows it composes
 * (`packages/base-nodes/nodetool/examples/recipes/<slug>.recipe.json`), so
 * listing one needs no user and no database, and "installing" one is the same
 * copy a single example takes, run once per step.
 *
 * Two shapes live here: {@link recipeBundle}, what a shipped file holds, and
 * {@link exampleRecipeSummary}, what the list endpoint returns after each step
 * has been resolved against the examples actually on disk.
 */

import { z } from "zod";

/** Bumped when a field the reader depends on changes shape. */
export const RECIPE_BUNDLE_SCHEMA_VERSION = 1;

/**
 * Another shipped example that can take a step's place and end somewhere else
 * — the same shots delivered as an editable sequence rather than a file.
 */
export const recipeStepAlternative = z.object({
  /** Example workflow name, as the shipped file records it. */
  example: z.string().min(1),
  /** Call to action on the step. */
  label: z.string(),
  /** What changes if you swap it in. */
  why: z.string()
});
export type RecipeStepAlternative = z.infer<typeof recipeStepAlternative>;

export const recipeBundleStep = z.object({
  example: z.string().min(1),
  /** What this step is for, in the recipe's terms. */
  role: z.string(),
  /** What goes in and what comes back out. */
  handoff: z.string(),
  alternative: recipeStepAlternative.nullish()
});
export type RecipeBundleStep = z.infer<typeof recipeBundleStep>;

export const recipeBundle = z.object({
  schemaVersion: z.number().int().positive(),
  slug: z.string().min(1),
  name: z.string().min(1),
  /** One sentence: what you end up holding. */
  outcome: z.string(),
  audience: z.string(),
  /** Intro paragraphs. */
  summary: z.array(z.string()),
  /** What the recipe does not do, stated plainly. */
  caveats: z.array(z.string()),
  /** Example whose thumbnail heads the recipe. */
  hero: z.string().min(1),
  steps: z.array(recipeBundleStep).min(1)
});
export type RecipeBundle = z.infer<typeof recipeBundle>;

/**
 * Parse a shipped recipe file. Returns null for anything that is not one — a
 * malformed file is skipped rather than taking the whole listing down — and
 * for a file written against a newer schema than this build understands.
 */
export function parseRecipeBundle(value: unknown): RecipeBundle | null {
  const parsed = recipeBundle.safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.schemaVersion > RECIPE_BUNDLE_SCHEMA_VERSION) return null;
  return parsed.data;
}

/** One model a step's graph calls, as the graph records it. */
export const recipeModelRef = z.object({
  /** Runtime provider id, e.g. "fal_ai". */
  provider: z.string(),
  /** Serving model id, e.g. "fal-ai/flux/schnell". */
  model: z.string()
});
export type RecipeModelRef = z.infer<typeof recipeModelRef>;

/** A step with its example resolved: enough to render and open it. */
export const exampleRecipeStep = z.object({
  /** Example workflow name — what `from_example_name` takes. */
  example: z.string(),
  /** The example's own id in the gallery listing (its file name). */
  exampleId: z.string(),
  packageName: z.string(),
  description: z.string(),
  role: z.string(),
  handoff: z.string(),
  thumbnailUrl: z.string().nullable(),
  nodeCount: z.number(),
  /** Empty when the step runs locally and calls no provider. */
  models: z.array(recipeModelRef),
  alternative: z
    .object({
      example: z.string(),
      exampleId: z.string(),
      packageName: z.string(),
      label: z.string(),
      why: z.string()
    })
    .nullable()
});
export type ExampleRecipeStep = z.infer<typeof exampleRecipeStep>;

/** What the list endpoint returns per recipe. */
export const exampleRecipeSummary = z.object({
  slug: z.string(),
  name: z.string(),
  outcome: z.string(),
  audience: z.string(),
  summary: z.array(z.string()),
  caveats: z.array(z.string()),
  /** The hero step's thumbnail, or null when it ships without one. */
  thumbnailUrl: z.string().nullable(),
  /** Providers the chain calls, deduplicated across steps. */
  providers: z.array(z.string()),
  nodeCount: z.number(),
  steps: z.array(exampleRecipeStep)
});
export type ExampleRecipeSummary = z.infer<typeof exampleRecipeSummary>;
