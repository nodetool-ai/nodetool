import { ArrowRight } from "lucide-react";
import { recipeEntries } from "@/data/recipes";
import RecipeCard from "./RecipeCard";

export default function RecipeShowcase() {
  return (
    <section
      id="jobs"
      aria-labelledby="jobs-title"
      className="relative overflow-clip-safe py-24"
    >
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-12 max-w-2xl">
          <p className="text-sm font-medium text-amber-300">Guided recipes</p>
          <h2
            id="jobs-title"
            className="mt-4 text-3xl font-semibold tracking-tight text-slate-100 md:text-5xl"
          >
            A clear next step for what you want to make.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-300">
            Start an ad, a catalogue, a translated video, or a story. Follow the
            guided setup, review the result, and make it yours in the editor.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {recipeEntries.map((recipe) => (
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
