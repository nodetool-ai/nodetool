import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import RecipeCard from "@/components/RecipeCard";
import { recipeEntries } from "@/data/recipes";

const BASE_URL = "https://nodetool.ai";
export const metadata: Metadata = {
  title: "Guided AI recipes | NodeTool",
  description:
    "Make product ads, multilingual videos, catalogue images, and storyboards with NodeTool's guided flows. Follow each step with real UI examples.",
  alternates: { canonical: `${BASE_URL}/recipes` }
};

export default function RecipesHub() {
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "NodeTool guided recipes",
    itemListElement: recipeEntries.map((recipe, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: recipe.name,
      url: `${BASE_URL}${recipe.route}`
    }))
  };
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <SiteHeader />
      <JsonLd data={itemListLd} />
      <div className="relative pt-28">
        <section className="pt-10 pb-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <p className="text-sm font-medium text-amber-300">Guided recipes</p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              Start with an idea.
              <br />
              Make it step by step.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
              Pick what you want to make. Follow the Storyboard or Script guide,
              review each part, and keep refining in the editor.
            </p>
          </div>
        </section>
        <section aria-label="Choose a recipe" className="pb-16">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 lg:grid-cols-2 lg:px-8">
            {recipeEntries.map((recipe) => (
              <RecipeCard key={recipe.slug} recipe={recipe} />
            ))}
          </div>
        </section>
        <section className="pb-24">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="border-t border-white/10 pt-8">
              <h2 className="text-2xl font-semibold tracking-tight">
                Keep every part editable.
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-300">
                Keep characters and products consistent with entities. Review
                pictures in a storyboard, tune the script line by line, and
                bring everything together in the timeline.
              </p>
              <a
                href="https://app.nodetool.ai/workspace"
                className="focus-ring mt-6 inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300"
              >
                Open NodeTool{" "}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
