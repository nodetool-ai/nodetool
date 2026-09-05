import React from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, Package } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { recipeEntries } from "@/data/recipes";
import { providerDisplay } from "@/data/providerDisplay";

const BASE_URL = "https://nodetool.ai";

export const metadata: Metadata = {
  title: "AI Workflow Recipes — NodeTool",
  description:
    "Multi-step NodeTool recipes for ad production, video dubbing, product catalogues, and trailers. Each one is the workflows to run, in order, and each ships inside Studio.",
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
              The whole job, not one node
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
              A template shows you a graph. A recipe gives you the finished job:
              which workflows to run, in what order, what each one hands the
              next, and where the money goes. Every recipe ships inside Studio,
              on the Examples page.
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
              Every recipe is already installed
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-400">
              Studio ships these chains with its examples: open Examples, pick a
              recipe, and add its workflows to your library in one click,
              editable node by node. Nothing to download or import.
            </p>
            <a
              href="/templates"
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0a0a14]/70 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:border-white/25 hover:bg-white/5"
            >
              Browse all templates
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
