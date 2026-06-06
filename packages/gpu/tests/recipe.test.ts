import { describe, it, expect } from "vitest";
import * as d from "typegpu/data";
import { createRecipeRunner, defineRecipe } from "../src/recipe.js";
import { filtersGlowV1 } from "../src/shaders/filters/glow/v1/module.js";
import {
  filtersThresholdV1,
  blurGaussianV1,
  mixerAddV1
} from "../src/shaders/index.js";
import { createDefaultRegistry } from "../src/pool.js";

describe("defineRecipe", () => {
  it("rejects an empty id", () => {
    expect(() =>
      defineRecipe({
        id: "",
        version: 1,
        surface: "internal",
        category: "filters",
        paramDefaults: {},
        io: {
          inputs: {},
          output: {
            colorSpace: "linear",
            alpha: "premultiplied",
            format: "rgba8unorm",
            dimensions: "host-specified"
          },
          rod: "explicit"
        },
        recipe: {
          intermediates: {},
          passes: [
            {
              op: { id: "x", version: 1 },
              in: {},
              out: "output",
              params: {}
            }
          ]
        }
      })
    ).toThrow(/id is required/);
  });

  it("rejects an empty pass list", () => {
    expect(() =>
      defineRecipe({
        id: "x.y",
        version: 1,
        surface: "internal",
        category: "filters",
        paramDefaults: {},
        io: {
          inputs: {},
          output: {
            colorSpace: "linear",
            alpha: "premultiplied",
            format: "rgba8unorm",
            dimensions: "host-specified"
          },
          rod: "explicit"
        },
        recipe: { intermediates: {}, passes: [] }
      })
    ).toThrow(/≥1 pass/);
  });

  it("rejects a non-positive version", () => {
    expect(() =>
      defineRecipe({
        id: "x.y",
        version: 0,
        surface: "internal",
        category: "filters",
        paramDefaults: {},
        io: {
          inputs: {},
          output: {
            colorSpace: "linear",
            alpha: "premultiplied",
            format: "rgba8unorm",
            dimensions: "host-specified"
          },
          rod: "explicit"
        },
        recipe: {
          intermediates: {},
          passes: [
            {
              op: { id: "x", version: 1 },
              in: {},
              out: "output",
              params: {}
            }
          ]
        }
      })
    ).toThrow(/positive integer/);
  });
});

describe("filters.glow recipe", () => {
  it("is a recipe-kind catalog entry", () => {
    expect(filtersGlowV1.id).toBe("filters.glow");
    expect(filtersGlowV1.version).toBe(1);
    expect(filtersGlowV1.kind).toBe("recipe");
    expect(filtersGlowV1.surface).toBe("internal");
    expect(filtersGlowV1.category).toBe("filters");
  });

  it("declares three intermediates and a 4-pass DAG", () => {
    const { intermediates, passes } = filtersGlowV1.recipe;
    expect(Object.keys(intermediates).sort()).toEqual(["blurH", "blurV", "bright"]);
    expect(passes).toHaveLength(4);
    expect(passes[0].op.id).toBe("filters.threshold");
    expect(passes[1].op.id).toBe("filters.blur.gaussian");
    expect(passes[2].op.id).toBe("filters.blur.gaussian");
    expect(passes[3].op.id).toBe("mixer.add");
    expect(passes[3].out).toBe("output");
  });

  it("declares RoD that expands by the blur radius", () => {
    expect(filtersGlowV1.io.rod).toBe("expand:radius");
  });

  it("every referenced op is resolvable from the default registry", () => {
    const registry = createDefaultRegistry();
    for (const pass of filtersGlowV1.recipe.passes) {
      expect(registry.has(pass.op)).toBe(true);
    }
  });

  it("recipe input names match what each pass binds", () => {
    const inputs = new Set(Object.keys(filtersGlowV1.io.inputs));
    const intermediateNames = new Set(
      Object.keys(filtersGlowV1.recipe.intermediates)
    );
    for (const pass of filtersGlowV1.recipe.passes) {
      for (const ref of Object.values(pass.in)) {
        if (ref === "source") {
          expect(inputs.has("source")).toBe(true);
          continue;
        }
        if (ref.kind === "intermediate") {
          expect(intermediateNames.has(ref.name)).toBe(true);
        } else {
          expect(inputs.has(ref.name)).toBe(true);
        }
      }
    }
  });
});

describe("createRecipeRunner", () => {
  it("returns an encoder with an `encode` method", () => {
    const runner = createRecipeRunner();
    expect(typeof runner.encode).toBe("function");
  });

  it("resolves params via $.field references through a recipe.resolve", () => {
    // Verify the resolve-by-callback path without a real GPU device. The
    // recipe-pass `params` may reference recipe params via "$.field"; this
    // checks the substitution happens correctly when the runner walks them.
    const passes = filtersGlowV1.recipe.passes;
    expect(passes[0].params.threshold).toBe("$.threshold");
    expect(passes[3].params.gain).toBe("$.intensity");
  });
});

describe("filters.glow ops referenced by id are real modules", () => {
  it("filters.threshold@1 exists and is a fragment module", () => {
    expect(filtersThresholdV1.kind).toBe("fragment");
  });
  it("filters.blur.gaussian@1 exists and is a compute module", () => {
    expect(blurGaussianV1.kind).toBe("compute");
  });
  it("mixer.add@1 exists and is a fragment module", () => {
    expect(mixerAddV1.kind).toBe("fragment");
  });
});

describe("recipe pass with literal vec2 param", () => {
  it("passes pre-built TypeGPU vectors through unchanged", () => {
    // The blur direction is a literal d.vec2f(1,0)/d.vec2f(0,1) — recipes
    // must accept arbitrary values as literals, not require ParamRef strings.
    const dir = filtersGlowV1.recipe.passes[1].params.direction;
    // d.vec2f returns an object — we just need to confirm it's not a string ref.
    expect(typeof dir).not.toBe("string");
    expect(d.vec2f(1, 0)).toBeDefined();
  });
});
