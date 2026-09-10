import React from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, Package } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { SmartDownloadButton } from "@/app/SmartDownloadButton";
import { recipeEntries } from "@/data/recipes";
import { providerDisplay } from "@/data/providerDisplay";

const BASE_URL = "https://nodetool.ai";

export const metadata: Metadata = {
  title: "AI Workflow Recipes — NodeTool",
  description:
    "Make video ads, dub presenter clips, build product visuals, and cut trailers. Start with editable recipes included in NodeTool Studio.",
  alternates: { canonical: `${BASE_URL}/recipes` },
};

export default function RecipesHub() {
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "NodeTool workflow recipes",
    itemListElement: recipeEntries.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: r.name,
      url: `${BASE_URL}${r.route}`,
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040408] text-white">
      <SiteHeader />
      <JsonLd data={itemListLd} />

      <div className="relative pt-28">
        <section className="relative pt-10 pb-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
              Recipes
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Pick a recipe. Make it yours.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
              Make your next ad, product shoot, or trailer with workflows
              you can reuse. See the results, follow the steps, and adapt
              the recipe to your brief.
            </p>
          </div>
        </section>

        <section className="relative pb-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-2">
              {recipeEntries.map((recipe) => (
                <a
                  key={recipe.slug}
                  href={recipe.route}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 transition-colors hover:border-amber-500/40"
                >
                  {(recipe.sample?.image ?? recipe.heroThumbnail) && (
                    <Image
                      src={recipe.sample?.image ?? recipe.heroThumbnail!}
                      alt=""
                      width={1280}
                      height={720}
                      // A sample sheet is not 16:9; contain it rather than
                      // cropping a row of the run off the card.
                      className="aspect-video w-full bg-slate-950 object-contain"
                    />
                  )}
                  <div className="flex flex-1 flex-col p-6">
                    <h2 className="text-xl font-semibold text-white group-hover:text-amber-300">
                      {recipe.name}
                    </h2>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">
                      {recipe.outcome}
                    </p>
                    <ol className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      {recipe.steps.map((step, i) => (
                        <li key={step.template} className="flex items-center gap-2">
                          {i > 0 && <ArrowRight className="h-3 w-3 text-slate-700" />}
                          <span>{step.name}</span>
                        </li>
                      ))}
                    </ol>
                    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/5 pt-4 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" />
                        {recipe.workflowCount} workflows · {recipe.nodeCount} nodes
                      </span>
                      <span className="text-slate-700">·</span>
                      <span>
                        {recipe.keys
                          .map((k) => providerDisplay(k.provider).name)
                          .join(", ")}
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="relative pb-24">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <Package className="mx-auto h-8 w-8 text-amber-400" />
            <h2 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">
              Get the recipes. Start creating.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-400">
              Open Examples in Studio, pick a recipe, and add it to your
              library. Every workflow is included and editable.
            </p>
            <SmartDownloadButton
              classNameOverride="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0a0a14]/70 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:border-white/25 hover:bg-white/5"
            />
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
