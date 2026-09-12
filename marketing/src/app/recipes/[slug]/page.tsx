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
  const hero = entry.productionRun?.hero ?? preview;
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
      <div className="relative pt-24 lg:pt-28">
        <section className="pt-6 pb-12 lg:pt-10">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <a
              href="/recipes"
              className="focus-ring inline-flex items-center gap-2 rounded text-sm text-slate-400 hover:text-slate-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              All recipes
            </a>
            <div className="mt-6 grid gap-x-10 gap-y-6 lg:mt-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-y-0">
              <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
                <p className="text-sm font-medium text-amber-300">
                  NodeTool example project
                </p>
                <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                  {entry.name}
                </h1>
                <p className="mt-5 text-lg leading-relaxed text-slate-300">
                  {entry.outcome}
                </p>
              </div>
              {hero && (
                <figure className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
                  <Image
                    src={hero.src}
                    alt={hero.alt}
                    width={hero.width ?? (entry.productionRun ? 1600 : 3200)}
                    height={hero.height ?? (entry.productionRun ? 900 : 2000)}
                    quality={90}
                    sizes="(min-width: 1024px) 640px, calc(100vw - 48px)"
                    priority
                    className="h-auto w-full rounded-xl border border-white/15 bg-slate-950"
                  />
                  <figcaption className="mt-3 text-sm leading-relaxed text-slate-400">
                    {hero.caption ?? hero.alt}
                  </figcaption>
                </figure>
              )}
              <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
                <p className="text-sm text-slate-400 lg:mt-4">
                  For {entry.audience.charAt(0).toLowerCase()}
                  {entry.audience.slice(1)}
                </p>
                {entry.productionRun && (
                  <p className="mt-5 text-sm leading-relaxed text-slate-300">
                    <span className="font-medium text-amber-200">
                      {entry.productionRun.reviewLabel}
                    </span>
                    {" · "}
                    {entry.productionRun.statusLabel}
                  </p>
                )}
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <a
                    href="/download"
                    className="focus-ring inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300"
                  >
                    Download NodeTool Studio{" "}
                    <ArrowRight
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                  </a>
                  <a
                    href="#guided-flow"
                    className="focus-ring rounded px-2 py-3 text-sm font-medium text-slate-200 hover:text-amber-300"
                  >
                    See every step
                  </a>
                </div>
                <p className="mt-4 text-sm text-slate-400">
                  Install Studio, create a project, then choose{" "}
                  {entry.guide.entry}. Use the example brief and your own
                  provider keys to begin.
                </p>
              </div>
            </div>
          </div>
        </section>
        {entry.productionRun && (
          <RecipeProductionRun run={entry.productionRun} />
        )}
        <RecipeGuide guide={entry.guide} />
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-6 border-y border-white/10 py-8 md:flex-row md:items-center">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Start with your own{" "}
                  {entry.guide.entry === "Script" ? "script" : "idea"}
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
                  Install NodeTool Studio, create a project, and choose{" "}
                  {entry.guide.entry}. Add your brief and references, then
                  connect your provider keys before generating media.
                </p>
              </div>
              <a
                href="/download"
                className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300"
              >
                Download NodeTool Studio{" "}
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-4 text-sm text-slate-400">
              Studio is free and open source. You pay providers directly for
              media generation. Set up your own project using the guide above.
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
