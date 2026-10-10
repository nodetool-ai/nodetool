/**
 * The shipped recipes, resolved against the shipped examples.
 *
 * These run against the real manifests in
 * `packages/base-nodes/nodetool/examples/recipes` and the real workflows and
 * apps they name, so a renamed or deleted example fails here rather than
 * dropping a recipe out of the app's Examples page with no other signal.
 */
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { exampleRecipeSummary } from "@nodetool-ai/protocol/api-schemas/recipes.js";

import { listExampleRecipes } from "../src/lib/example-recipes.js";

const NODETOOL_DIR = nodePath.resolve(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  "../../base-nodes/nodetool"
);
const EXAMPLES_DIR = nodePath.join(NODETOOL_DIR, "examples/nodetool-base");
const RECIPES_DIR = nodePath.join(NODETOOL_DIR, "examples/recipes");
const APPS_DIR = nodePath.join(NODETOOL_DIR, "examples/apps");

const options = { examplesDir: EXAMPLES_DIR };

const shippedSlugs = (): string[] =>
  readdirSync(RECIPES_DIR)
    .filter((file) => file.endsWith(".recipe.json"))
    .map((file) => file.slice(0, -".recipe.json".length))
    .sort((a, b) => a.localeCompare(b));

describe("example recipes", () => {
  it("resolves every shipped recipe against the shipped examples", () => {
    const slugs = shippedSlugs();
    expect(slugs.length).toBeGreaterThan(0);
    const recipes = listExampleRecipes(options);
    // A recipe whose step names a missing example is dropped by the listing,
    // so comparing the slugs is what catches a renamed workflow.
    expect(recipes.map((recipe) => recipe.slug)).toEqual(slugs);
  });

  it("matches the schema the tRPC procedure declares", () => {
    // `workflows.recipes` parses its output through this schema, so a field
    // the listing shapes differently would fail the call, not the build.
    const parsed = z
      .array(exampleRecipeSummary)
      .parse(listExampleRecipes(options));
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.some((recipe) => recipe.thumbnailUrl !== null)).toBe(true);
    expect(
      parsed.some((recipe) => recipe.steps.some((step) => step.alternative))
    ).toBe(true);
    expect(parsed.every((recipe) => recipe.apps.length > 0)).toBe(true);
  });

  it("hands every recipe an app that binds the whole chain", () => {
    for (const recipe of listExampleRecipes(options)) {
      // The first app is the one built for this chain, and a chain the app
      // does not cover is a recipe that cannot be run from one surface.
      const [primary] = recipe.apps;
      const bound = new Set(primary.workflows);
      const missing = recipe.steps
        .map((step) => step.example)
        .filter((example) => !bound.has(example));
      expect({ slug: recipe.slug, missing }).toEqual({
        slug: recipe.slug,
        missing: []
      });
      expect(primary.operationCount).toBeGreaterThanOrEqual(
        recipe.steps.length
      );
    }
  });

  it("drops a recipe whose app this install does not ship", () => {
    // Same manifests, an apps directory that holds nothing: every recipe names
    // an app, so every recipe must fall out. Without this the resolution is
    // indistinguishable from one that never looks at the apps at all.
    expect(
      listExampleRecipes({
        ...options,
        exampleAppsDir: nodePath.join(NODETOOL_DIR, "examples/not-here")
      })
    ).toEqual([]);
    expect(
      listExampleRecipes({ ...options, exampleAppsDir: APPS_DIR }).length
    ).toBe(shippedSlugs().length);
  });

  it("orders the steps the manifest names and keeps them openable", () => {
    const recipes = listExampleRecipes(options);
    for (const recipe of recipes) {
      const manifest = JSON.parse(
        readFileSync(
          nodePath.join(RECIPES_DIR, `${recipe.slug}.recipe.json`),
          "utf8"
        )
      ) as { steps: { example: string }[] };
      expect(recipe.steps.map((step) => step.example)).toEqual(
        manifest.steps.map((step) => step.example)
      );
      for (const step of recipe.steps) {
        // exampleId is the file the copy reads; packageName is the directory
        // it lives in. Both go straight into a create-from-example call.
        expect(step.exampleId).toBe(`${step.example}.json`);
        expect(step.packageName).toBe("nodetool-base");
        expect(step.nodeCount).toBeGreaterThan(0);
      }
      expect(recipe.nodeCount).toBe(
        recipe.steps.reduce((total, step) => total + step.nodeCount, 0)
      );
    }
  });

  it("reads each chain's models out of the graphs themselves", () => {
    const recipes = listExampleRecipes(options);
    for (const recipe of recipes) {
      const fromSteps = [
        ...new Set(
          recipe.steps.flatMap((step) => step.models.map((m) => m.provider))
        )
      ];
      expect(recipe.providers).toEqual(fromSteps);
    }
    // Examples ship every model unselected, so the editor can fill each one
    // with the user's default. An empty model names no provider.
    expect(recipes.every((recipe) => recipe.providers.length === 0)).toBe(true);
  });

  it("lists the provider of a model a step's graph selects", () => {
    // A copy of the shipped examples with one model selected, so a walk that
    // stopped matching the graph format still fails here.
    const root = mkdtempSync(nodePath.join(tmpdir(), "example-recipes-"));
    try {
      const examplesDir = nodePath.join(root, "nodetool-base");
      cpSync(EXAMPLES_DIR, examplesDir, { recursive: true });
      cpSync(RECIPES_DIR, nodePath.join(root, "recipes"), { recursive: true });
      cpSync(APPS_DIR, nodePath.join(root, "apps"), { recursive: true });
      const [recipe] = listExampleRecipes(options);
      const stepFile = nodePath.join(examplesDir, recipe.steps[0].exampleId);
      const workflow = JSON.parse(readFileSync(stepFile, "utf8")) as {
        graph: { nodes: { data: Record<string, unknown> }[] };
      };
      workflow.graph.nodes[0].data.model = {
        type: "language_model",
        provider: "openai",
        id: "gpt-test"
      };
      writeFileSync(stepFile, JSON.stringify(workflow));

      const copied = listExampleRecipes({ examplesDir }).find(
        (entry) => entry.slug === recipe.slug
      );
      expect(copied?.steps[0].models).toContainEqual({
        provider: "openai",
        model: "gpt-test"
      });
      expect(copied?.providers).toContain("openai");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns nothing when the install ships no recipes directory", () => {
    expect(
      listExampleRecipes({
        examplesDir: EXAMPLES_DIR,
        exampleRecipesDir: nodePath.join(NODETOOL_DIR, "examples/not-here")
      })
    ).toEqual([]);
  });
});
