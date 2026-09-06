/**
 * Recipes: a named outcome, the shipped example app that reaches it, and the
 * ordered example workflows behind that app.
 *
 * The app is what a recipe hands you — the chain's steps bound to one surface,
 * with the handoffs carried as variables. The steps stay listed because they
 * are what the app is made of, and opening one as a graph is how a chain gets
 * changed.
 *
 * A recipe is a file on disk next to the example workflows and apps it composes
 * (`packages/base-nodes/nodetool/examples/recipes/<slug>.recipe.json`), so
 * listing one needs no user and no database, and installing one is the same
 * example-app install and example copy a single one takes.
 *
 * Two shapes live here: {@link recipeBundle}, what a shipped file holds, and
 * {@link exampleRecipeSummary}, what the list endpoint returns after each app
 * and step has been resolved against what is actually on disk.
 */

import { z } from "zod";

import { exampleAppSummary } from "./applications.js";

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

/**
 * A shipped example app the recipe hands you instead of the loose chain: the
 * same workflows bound to one surface, with the handoffs the steps describe in
 * prose carried as variables between operations.
 */
export const recipeBundleApp = z.object({
  /** Example app slug, i.e. its file name without `.app.json`. */
  app: z.string().min(1),
  /** What the app is for, in the recipe's terms. */
  role: z.string()
});
export type RecipeBundleApp = z.infer<typeof recipeBundleApp>;

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
  /**
   * The apps that surface this chain. First is the one built for it; any that
   * follow cover part of it and are worth having anyway.
   */
  apps: z.array(recipeBundleApp).min(1),
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

/**
 * A recipe's app with its shipped bundle resolved: the same summary the example
 * app listing returns — `slug` is what
 * `POST /api/applications/examples/:slug/install` takes — plus what the app is
 * for in this recipe's terms.
 */
export const exampleRecipeApp = exampleAppSummary.extend({
  role: z.string()
});
export type ExampleRecipeApp = z.infer<typeof exampleRecipeApp>;

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
  /** The apps that run this chain, the purpose-built one first. */
  apps: z.array(exampleRecipeApp),
  steps: z.array(exampleRecipeStep)
});
export type ExampleRecipeSummary = z.infer<typeof exampleRecipeSummary>;
