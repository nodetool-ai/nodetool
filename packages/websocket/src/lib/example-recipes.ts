/**
 * The shipped recipes: a named outcome plus the ordered example workflows that
 * reach it.
 *
 * A recipe is a file on disk next to the examples it composes
 * (`packages/base-nodes/nodetool/examples/recipes/<slug>.recipe.json`), the
 * same layout the example apps and storyboards use. It stores no graphs of its
 * own — every step names a shipped example, and this module resolves those
 * names against the examples directory the server is already serving, so a
 * recipe cannot drift into claiming a workflow, a model, or a thumbnail the
 * install does not have.
 *
 * The site's downloadable `.nodetool` bundles are packed from the same
 * manifests (`marketing/scripts/generate-recipes.mjs`), so the chain a page
 * describes and the chain the app offers are one list.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import nodePath from "node:path";
import {
  parseRecipeBundle,
  type ExampleRecipeStep,
  type ExampleRecipeSummary,
  type RecipeBundle,
  type RecipeModelRef
} from "@nodetool-ai/protocol/api-schemas/recipes.js";
import { deriveExampleAssetsDir, resolveExampleJsonPath } from "../example-workflows.js";
import { withCacheBuster } from "./example-thumbnail.js";
import { isString } from "./wire-values.js";

const BUNDLE_SUFFIX = ".recipe.json";

const EXAMPLES_THUMBNAILS_PREFIX = "/api/workflows/examples/thumbnails/";

export interface ExampleRecipeOptions {
  examplesDir?: string;
  examplesAssetsFallbackDir?: string;
  exampleRecipesDir?: string;
}

/**
 * Where the manifests live: an explicit override, else the `recipes` sibling of
 * the example workflows directory — the layout the monorepo, the packaged
 * backend, and the server image share.
 */
export function resolveExampleRecipesDir(
  options: ExampleRecipeOptions
): string | null {
  if (options.exampleRecipesDir) {
    return existsSync(options.exampleRecipesDir)
      ? options.exampleRecipesDir
      : null;
  }
  if (!options.examplesDir) return null;
  const sibling = nodePath.join(
    nodePath.dirname(options.examplesDir),
    "recipes"
  );
  return existsSync(sibling) ? sibling : null;
}

function readBundle(dir: string, file: string): RecipeBundle | null {
  // Callers only pass names that came out of readdirSync, but resolve and
  // check containment anyway so no future caller can read outside the
  // recipes directory by passing a path-shaped name.
  const root = nodePath.resolve(dir);
  const target = nodePath.resolve(root, file);
  if (target !== root && !target.startsWith(root + nodePath.sep)) return null;
  try {
    return parseRecipeBundle(JSON.parse(readFileSync(target, "utf8")));
  } catch {
    return null;
  }
}

/**
 * Every `{provider, model}` a graph references, in first-seen order.
 *
 * A model reference is any object carrying a `provider` field — that covers a
 * top-level model property, one inside a settings object, and one nested in a
 * list, which is why this walks rather than reads known keys.
 */
function modelRefs(graph: unknown): RecipeModelRef[] {
  const seen = new Map<string, RecipeModelRef>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (isString(record.provider) && record.provider) {
      const model = record.id ?? record.model ?? record.repo_id ?? record.name;
      if (isString(model) && model) {
        const key = `${record.provider} ${model}`;
        if (!seen.has(key)) {
          seen.set(key, { provider: record.provider, model });
        }
      }
    }
    for (const item of Object.values(record)) walk(item);
  };
  walk(graph);
  return [...seen.values()];
}

/** One example workflow as a recipe step needs it: metadata, no graph. */
interface ResolvedExample {
  name: string;
  id: string;
  description: string;
  thumbnailUrl: string | null;
  nodeCount: number;
  models: RecipeModelRef[];
}

function resolveExample(
  examplesDir: string,
  assetsDir: string,
  exampleName: string
): ResolvedExample | null {
  const file = resolveExampleJsonPath(examplesDir, exampleName);
  if (!file) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  const name = isString(parsed.name)
    ? parsed.name
    : nodePath.basename(file, ".json");
  const jpgFile = `${name}.jpg`;
  const jpgPath = nodePath.join(assetsDir, jpgFile);
  const graph = (parsed.graph ?? {}) as Record<string, unknown>;
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  return {
    name,
    id: nodePath.basename(file),
    description: isString(parsed.description) ? parsed.description : "",
    thumbnailUrl: existsSync(jpgPath)
      ? withCacheBuster(
          `${EXAMPLES_THUMBNAILS_PREFIX}${encodeURIComponent(jpgFile)}`,
          jpgPath
        )
      : null,
    nodeCount: nodes.length,
    models: modelRefs(graph)
  };
}

/**
 * Resolve one manifest against the examples on disk, or null when a step names
 * an example this install does not ship — half a chain is worse than none, and
 * `tests/example-recipes.test.ts` fails when a shipped recipe stops resolving.
 */
function buildRecipe(
  bundle: RecipeBundle,
  examplesDir: string,
  assetsDir: string,
  packageName: string
): ExampleRecipeSummary | null {
  const steps: ExampleRecipeStep[] = [];
  for (const step of bundle.steps) {
    const example = resolveExample(examplesDir, assetsDir, step.example);
    if (!example) return null;
    let alternative: ExampleRecipeStep["alternative"] = null;
    if (step.alternative) {
      const alt = resolveExample(examplesDir, assetsDir, step.alternative.example);
      if (!alt) return null;
      alternative = {
        example: alt.name,
        exampleId: alt.id,
        packageName,
        label: step.alternative.label,
        why: step.alternative.why
      };
    }
    steps.push({
      example: example.name,
      exampleId: example.id,
      packageName,
      description: example.description,
      role: step.role,
      handoff: step.handoff,
      thumbnailUrl: example.thumbnailUrl,
      nodeCount: example.nodeCount,
      models: example.models,
      alternative
    });
  }
  const hero = resolveExample(examplesDir, assetsDir, bundle.hero);
  if (!hero) return null;
  return {
    slug: bundle.slug,
    name: bundle.name,
    outcome: bundle.outcome,
    audience: bundle.audience,
    summary: bundle.summary,
    caveats: bundle.caveats,
    thumbnailUrl: hero.thumbnailUrl,
    providers: [
      ...new Set(steps.flatMap((s) => s.models.map((m) => m.provider)))
    ],
    nodeCount: steps.reduce((total, step) => total + step.nodeCount, 0),
    steps
  };
}

/** Every shipped recipe whose steps all resolve, sorted by slug. */
export function listExampleRecipes(
  options: ExampleRecipeOptions
): ExampleRecipeSummary[] {
  const dir = resolveExampleRecipesDir(options);
  if (!dir || !options.examplesDir || !existsSync(options.examplesDir)) {
    return [];
  }
  const examplesDir = options.examplesDir;
  const assetsDir = deriveExampleAssetsDir(
    examplesDir,
    options.examplesAssetsFallbackDir
  );
  const packageName = nodePath.basename(examplesDir);
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((file) => file.endsWith(BUNDLE_SUFFIX))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
  const recipes: ExampleRecipeSummary[] = [];
  for (const file of files) {
    const bundle = readBundle(dir, file);
    if (!bundle) continue;
    const recipe = buildRecipe(bundle, examplesDir, assetsDir, packageName);
    if (recipe) recipes.push(recipe);
  }
  return recipes;
}
