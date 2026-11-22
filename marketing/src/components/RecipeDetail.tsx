import Image from "next/image";
import { ArrowLeft, ArrowRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import RecipeProductionRun from "@/components/RecipeProductionRun";
import RecipeGuide from "@/components/RecipeGuide";
import RecipeCard from "@/components/RecipeCard";
import LocalizedCatalog from "@/components/localized/LocalizedCatalog";
import { recipeStepVisuals } from "@/components/recipeSteps";
import { recipeEntries } from "@/data/recipes";
import type { RecipeEntry } from "@/data/recipes";
import { runDate } from "@/data/contentDates";
import { videoUploadDate } from "@/lib/jsonld";
import { fmt } from "@/i18n/detailLabels";
import { localizedRecipe, recipeLabels } from "@/i18n/detailPages";
import { localeHref } from "@/i18n/links";
import { LOCALES, type Locale } from "@/i18n/routes";

/*
 * The page of one recipe, /recipes/<slug>, and its translations
 * (/zh/recipes/<slug>). A translation passes its locale: the recipe's text and
 * the page's words switch. The step diagrams and the example brief keep the
 * recorded run's English.
 */

const BASE_URL = "https://nodetool.ai";

export default function RecipeDetail({
  recipe: english,
  locale = null
}: {
  recipe: RecipeEntry;
  locale?: Locale | null;
}) {
  const entry = localizedRecipe(locale, english);
  const labels = recipeLabels(locale);
  const href = (route: string) => localeHref(locale, route).href;
  const others = recipeEntries.filter((recipe) => recipe.slug !== entry.slug);
  const preview = entry.guide.steps.find(
    (step) => step.stage === "Entities" || step.stage === "Voices"
  )?.image;
  const hero = entry.productionRun?.hero ?? preview;
  const heroIsPortrait = Boolean(
    hero?.width && hero.height && hero.height > hero.width
  );
  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: entry.name,
    description: entry.outcome,
    ...(locale ? { inLanguage: LOCALES[locale].hreflang } : {}),
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
  const runVideo = entry.productionRun?.video;
  const runUploadDate = entry.productionRun
    ? runDate(entry.productionRun.runId)
    : undefined;
  const videoLd =
    runVideo && runUploadDate
      ? {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: entry.name,
          description: runVideo.caption ?? entry.outcome,
          thumbnailUrl: `${BASE_URL}${runVideo.poster}`,
          contentUrl: `${BASE_URL}${runVideo.mp4}`,
          uploadDate: videoUploadDate(runUploadDate)
        }
      : null;
  const related = [
    ...labels.relatedLinks,
    ...(entry.guide.entry === "Storyboard"
      ? [{ href: "https://docs.nodetool.ai/storyboard-editor", label: labels.guideLink }]
      : [])
  ];
  return (
    <main
      lang={locale ? LOCALES[locale].hreflang : undefined}
      className="overflow-clip-safe relative min-h-screen bg-slate-950 text-slate-100"
    >
      <SiteHeader />
      <JsonLd data={howToLd} />
      {videoLd && <JsonLd data={videoLd} />}
      <div className="relative pt-24 lg:pt-28">
        <section className="pt-6 pb-12 lg:pt-10">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <a
              href={href("/recipes")}
              className="focus-ring inline-flex items-center gap-2 rounded text-sm text-slate-400 hover:text-slate-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {labels.back}
            </a>
            <div className="mt-6 grid gap-x-10 gap-y-6 lg:mt-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-y-0">
              <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
                <p className="text-sm font-medium text-amber-300">
                  {labels.kicker}
                </p>
                <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                  {entry.name}
                </h1>
                <p className="mt-5 text-lg leading-relaxed text-slate-300">
                  {entry.outcome}
                </p>
              </div>
              {hero && (
                <figure
                  className={`min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center ${heroIsPortrait ? "flex justify-center" : ""}`}
                >
                  <Image
                    src={hero.src}
                    alt={hero.alt}
                    width={hero.width ?? (entry.productionRun ? 1600 : 3200)}
                    height={hero.height ?? (entry.productionRun ? 900 : 2000)}
                    quality={90}
                    sizes={
                      heroIsPortrait
                        ? "(min-width: 1024px) 315px, calc(100vw - 48px)"
                        : "(min-width: 1024px) 640px, calc(100vw - 48px)"
                    }
                    priority
                    className={`rounded-xl border border-white/15 bg-slate-950 ${heroIsPortrait ? "h-[560px] w-auto max-w-full object-contain" : "h-auto w-full"}`}
                  />
                </figure>
              )}
              <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <a
                    href={href("/download")}
                    className="focus-ring inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300"
                  >
                    {labels.download}{" "}
                    <ArrowRight
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                  </a>
                  <a
                    href="#guided-flow"
                    className="focus-ring rounded px-2 py-3 text-sm font-medium text-slate-200 hover:text-amber-300"
                  >
                    {labels.seeSteps}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
        {entry.productionRun && (
          <RecipeProductionRun run={entry.productionRun} />
        )}
        <RecipeGuide
          guide={entry.guide}
          recipe={entry.slug}
          visuals={recipeStepVisuals[entry.slug] ?? {}}
          labels={labels.guide}
          briefLang={locale ? "en" : undefined}
          diagramNote={labels.diagramNote}
        />
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-6 border-y border-white/10 py-8 md:flex-row md:items-center">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {entry.guide.entry === "Script" ? labels.startScript : labels.startIdea}
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
                  {fmt(labels.startBody, { entry: entry.guide.entry })}
                </p>
              </div>
              <a
                href={href("/download")}
                className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300"
              >
                {labels.download}{" "}
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-4 text-sm text-slate-400">
              {labels.footnote}
            </p>
            <nav aria-label={labels.related} className="mt-6">
              <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
                {related.map((link) => (
                  <li key={link.href}>
                    <a
                      href={localeHref(locale, link.href).href}
                      hrefLang={localeHref(locale, link.href).hrefLang}
                      className="focus-ring rounded text-amber-300 underline underline-offset-2 hover:text-amber-200"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </section>
        <section className="pb-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">
              {labels.another}
            </h2>
            {locale ? (
              <LocalizedCatalog
                locale={locale}
                source="recipes"
                slugs={others.map((recipe) => recipe.slug)}
              />
            ) : (
              <div className="grid gap-6 md:grid-cols-3">
                {others.map((recipe) => (
                  <RecipeCard key={recipe.slug} recipe={recipe} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
