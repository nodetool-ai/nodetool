import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import ReadMoreLinks from "@/components/ReadMoreLinks";
import TrackedLink from "@/components/TrackedLink";
import RecipeCard from "@/components/RecipeCard";
import { recipeEntries } from "@/data/recipes";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";

const BASE_URL = "https://nodetool.ai";
export const metadata: Metadata = {
  title: "Guided AI recipes | NodeTool",
  description:
    "Make product ads, multilingual videos, catalogue images, and storyboards with NodeTool's guided flows. Follow each step with real UI examples.",
  alternates: { canonical: `${BASE_URL}/recipes` },
  openGraph: {
    images: DEFAULT_OG_IMAGES,
    title: "Guided AI recipes | NodeTool",
    description:
      "Make product ads, multilingual videos, catalogue images, and storyboards with NodeTool's guided flows. Follow each step with real UI examples.",
    url: `${BASE_URL}/recipes`,
    type: "website",
  },
};

const READ_MORE = [
  { label: "Workflow templates", href: "/templates" },
  { label: "Ad library", href: "/ad-library" },
  { label: "Cookbook", href: "https://docs.nodetool.ai/cookbook" },
  { label: "Use cases guide", href: "https://docs.nodetool.ai/use-cases" },
];

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
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-400">
                Browse the{" "}
                <a href="/storyboards" className="focus-ring rounded text-amber-300 underline underline-offset-2 hover:text-amber-200">
                  example AI storyboards
                </a>{" "}
                with every shot shown, or start from one of the{" "}
                <a href="/ad-library" className="focus-ring rounded text-amber-300 underline underline-offset-2 hover:text-amber-200">
                  editable video ad templates
                </a>
                .
              </p>
              <TrackedLink
                href="https://app.nodetool.ai/workspace"
                event="Try Cloud"
                eventProps={{ placement: "recipes" }}
                className="focus-ring mt-6 inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300"
              >
                Open NodeTool{" "}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </TrackedLink>
            </div>
          </div>
        </section>
      <ReadMoreLinks id="recipes-links" links={READ_MORE} className="mx-auto max-w-5xl px-6 pb-24" />

      </div>
      <SiteFooter />
    </main>
  );
}
