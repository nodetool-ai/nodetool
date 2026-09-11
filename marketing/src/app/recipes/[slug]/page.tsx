import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, ArrowRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import RecipeProductionRun from "@/components/RecipeProductionRun";
import RecipeGuide from "@/components/RecipeGuide";
import RecipeCard from "@/components/RecipeCard";
import { recipeEntries } from "@/data/recipes";

const BASE_URL = "https://nodetool.ai";
const APP_URL = "https://app.nodetool.ai/workspace";

interface RecipePageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return recipeEntries.map((recipe) => ({ slug: recipe.slug }));
}

export async function generateMetadata({
  params
}: RecipePageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = recipeEntries.find((recipe) => recipe.slug === slug);
  if (!entry) return {};
  const url = `${BASE_URL}${entry.route}`;
  return {
    title: entry.title,
    description: entry.description,
    alternates: { canonical: url },
    openGraph: {
      title: entry.title,
      description: entry.description,
      url,
      type: "article"
    }
  };
}

export default async function RecipePage({ params }: RecipePageProps) {
  const { slug } = await params;
  const entry = recipeEntries.find((recipe) => recipe.slug === slug);
  if (!entry) notFound();
  const preview = entry.guide.steps.find(
    (step) => step.stage === "Entities" || step.stage === "Voices"
  )?.image;
  const hero = preview ?? entry.productionRun?.hero;
  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: entry.name,
    description: entry.outcome,
    tool: { "@type": "HowToTool", name: `NodeTool ${entry.guide.entry}` },
    supply: entry.guide.inputs.map((name) => ({
      "@type": "HowToSupply",
      name
    })),
    step: entry.guide.steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: `${step.description} ${step.action}.`,
      url: `${BASE_URL}${entry.route}#guided-flow`,
      ...(step.image ? { image: `${BASE_URL}${step.image.src}` } : {})
    }))
  };
  return (
    <main className="overflow-clip-safe relative min-h-screen bg-slate-950 text-slate-100">
      <SiteHeader />
      <JsonLd data={howToLd} />
      <div className="relative pt-28">
        <section className="pt-10 pb-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <a
              href="/recipes"
              className="focus-ring inline-flex items-center gap-2 rounded text-sm text-slate-400 hover:text-slate-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              All recipes
            </a>
            <div className="mt-8 grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
              <div>
                <p className="text-sm font-medium text-amber-300">
                  {entry.guide.entry} guided flow
                </p>
                <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                  {entry.name}
                </h1>
                <p className="mt-5 text-lg leading-relaxed text-slate-300">
                  {entry.outcome}
                </p>
                <p className="mt-4 text-sm text-slate-400">
                  For {entry.audience.charAt(0).toLowerCase()}
                  {entry.audience.slice(1)}
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <a
                    href={APP_URL}
                    className="focus-ring inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300"
                  >
                    Open NodeTool{" "}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                  <a
                    href="#guided-flow"
                    className="focus-ring rounded px-2 py-3 text-sm font-medium text-slate-200 hover:text-amber-300"
                  >
                    See every step
                  </a>
                </div>
                <p className="mt-4 text-sm text-slate-400">
                  Create a project, then choose {entry.guide.entry}.
                </p>
              </div>
              {hero && (
                <figure className="min-w-0">
                  <Image
                    src={hero.src}
                    alt={hero.alt}
                    width={preview ? (preview.width ?? 3200) : 1600}
                    height={preview ? (preview.height ?? 2000) : 900}
                    quality={90}
                    sizes="(min-width: 1024px) 640px, 100vw"
                    priority
                    className="h-auto w-full rounded-xl border border-white/15 bg-slate-950"
                  />
                  <figcaption className="mt-3 text-sm leading-relaxed text-slate-400">
                    {preview
                      ? preview.caption
                      : "Three opening compositions from the example product ad."}
                  </figcaption>
                </figure>
              )}
            </div>
          </div>
        </section>
        <RecipeGuide guide={entry.guide} />
        {entry.productionRun && (
          <RecipeProductionRun run={entry.productionRun} />
        )}
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-6 border-y border-white/10 py-8 md:flex-row md:items-center">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Start with your own{" "}
                  {entry.guide.entry === "Script" ? "script" : "idea"}
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
                  Open NodeTool and choose {entry.guide.entry}. The guide takes
                  you through the setup, and the editors let you keep refining
                  each part.
                </p>
              </div>
              <a
                href={APP_URL}
                className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300"
              >
                Open NodeTool{" "}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-4 text-sm text-slate-400">
              Prefer the desktop app?{" "}
              <a
                href="/download"
                className="focus-ring rounded text-slate-200 underline underline-offset-4 hover:text-amber-300"
              >
                Download NodeTool
              </a>
              .
            </p>
          </div>
        </section>
        <section className="pb-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">
              Try another recipe
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {recipeEntries
                .filter((recipe) => recipe.slug !== entry.slug)
                .map((recipe) => (
                  <RecipeCard key={recipe.slug} recipe={recipe} />
                ))}
            </div>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
