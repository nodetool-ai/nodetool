import { ArrowRight } from "lucide-react";
import { recipeEntries } from "@/data/recipes";
import type { RecipeEntry } from "@/data/recipes";
import RecipeCard from "./RecipeCard";

const HOMEPAGE_RECIPE_ORDER = [
  "viral-video-ad-engine",
  "impossible-product-worlds",
  "ecommerce-sku-visual-factory",
  "multilingual-video-dubber",
  "storyboard-to-trailer"
];

export default function RecipeShowcase() {
  const projects = HOMEPAGE_RECIPE_ORDER.map((slug) =>
    recipeEntries.find((recipe) => recipe.slug === slug)
  ).filter((recipe): recipe is RecipeEntry => Boolean(recipe));

  return (
    <section
      id="jobs"
      aria-labelledby="jobs-title"
      className="relative overflow-clip-safe py-24"
    >
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <h2
            id="jobs-title"
            className="text-3xl font-semibold tracking-tight text-slate-100 md:text-5xl"
          >
            Made with NodeTool
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
            Ads, catalogue images, dubbed videos, and storyboards. Start with an example.
          </p>
        </div>
        {projects[0] && <RecipeCard recipe={projects[0]} featured />}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {projects.slice(1).map((recipe) => (
            <RecipeCard key={recipe.slug} recipe={recipe} />
          ))}
        </div>
        <a
          href="/recipes"
          className="focus-ring mt-8 inline-flex items-center gap-2 rounded text-sm font-medium text-amber-300 hover:text-amber-200"
        >
          Explore all recipes{" "}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
