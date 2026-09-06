/**
 * The shipped recipes, resolved against the shipped examples.
 *
 * These run against the real manifests in
 * `packages/base-nodes/nodetool/examples/recipes` and the real workflows they
 * name, so a renamed or deleted example fails here rather than dropping a
 * recipe out of the app's Examples page with no other signal.
 */
import { readFileSync, readdirSync } from "node:fs";
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
    const parsed = z.array(exampleRecipeSummary).parse(listExampleRecipes(options));
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.some((recipe) => recipe.thumbnailUrl !== null)).toBe(true);
    expect(
      parsed.some((recipe) => recipe.steps.some((step) => step.alternative))
    ).toBe(true);
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
    // The chains ship with paid steps; a listing that found no model at all
    // would mean the walk stopped matching the graph format.
    expect(recipes.some((recipe) => recipe.providers.length > 0)).toBe(true);
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
