import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Download, KeyRound, AlertTriangle } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import RecipeSampleFigure from "@/components/RecipeSampleFigure";
import { SmartDownloadButton } from "@/app/SmartDownloadButton";
import { recipeEntries, type RecipeEntry } from "@/data/recipes";
import { providerDisplay } from "@/data/providerDisplay";

const BASE_URL = "https://nodetool.ai";

export const dynamicParams = false;

export function generateStaticParams() {
  return recipeEntries.map((r) => ({ slug: r.slug }));
}

function getEntry(slug: string): RecipeEntry | undefined {
  return recipeEntries.find((r) => r.slug === slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = getEntry(slug);
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
      type: "article",
    },
  };
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getEntry(slug);
  if (!entry) notFound();

  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: entry.name,
    description: entry.outcome,
    supply: entry.keys.map((k) => ({
      "@type": "HowToSupply",
      name: `${providerDisplay(k.provider).name} API key`,
    })),
    step: entry.steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.handoff,
      url: `${BASE_URL}${step.route}`,
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040408] text-white">
      <SiteHeader />
      <JsonLd data={howToLd} />

      <div className="relative pt-28">
        {/* Hero */}
        <section className="relative pt-10 pb-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <a
              href="/recipes"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              All recipes
            </a>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
              Recipe
              <span className="text-amber-500/60">·</span>
              {entry.workflowCount} workflows
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              {entry.name}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
              {entry.outcome}
            </p>
            <p className="mt-3 max-w-2xl text-sm text-slate-500">
              For: {entry.audience}
            </p>
            <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-8 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_-10px_rgba(245,158,11,0.6)] transition-all hover:bg-amber-400"
              />
            </div>
          </div>
        </section>

        {/* What it actually produced */}
        {entry.sample && (
          <section className="relative py-10">
            <div className="mx-auto max-w-6xl px-6 lg:px-8">
              <h2 className="mb-2 text-2xl font-bold tracking-tight md:text-3xl">
                What it produced
              </h2>
              <p className="mb-6 max-w-3xl text-sm leading-relaxed text-slate-500">
                Not a mockup. The chain below was run end to end and this came
                back. The list under the caption is every model that ran: green
                where it is the model the workflow names, reached through
                whichever provider this render held a key for, blue where a
                better one was chosen deliberately, and amber where a different
                model had to stand in — each with the reason.
              </p>
              <RecipeSampleFigure sample={entry.sample} name={entry.name} />
            </div>
          </section>
        )}

        {/* Why this order */}
        <section className="relative py-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            {entry.summary.map((paragraph) => (
              <p
                key={paragraph}
                className="mb-5 max-w-3xl text-lg leading-relaxed text-slate-300 last:mb-0"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        {/* What you need */}
        <section className="relative py-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-6 flex items-center gap-3">
              <KeyRound className="h-6 w-6 text-amber-400" />
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                Keys this chain needs
              </h2>
            </div>
            <p className="mb-6 max-w-2xl text-sm leading-relaxed text-slate-400">
              Read out of the workflows themselves, so this list is what the
              graphs actually call. You bring the keys and pay each provider
              directly — NodeTool takes no cut and adds no markup.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {entry.keys.map((key) => {
                const display = providerDisplay(key.provider);
                return (
                  <li
                    key={key.env}
                    className="rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3"
                  >
                    <a
                      href={display.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-white hover:text-amber-300"
                    >
                      {display.name}
                    </a>
                    <div className="mt-1 font-mono text-xs text-slate-500">
                      {key.env}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* The chain */}
        <section id="the-chain" className="relative scroll-mt-28 py-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="mb-8 text-2xl font-bold tracking-tight md:text-3xl">
              The chain, in order
            </h2>
            <ol className="space-y-5">
              {entry.steps.map((step, i) => (
                <li
                  key={step.template}
                  className="grid gap-6 rounded-2xl border border-white/10 bg-slate-900/40 p-6 md:grid-cols-[240px_1fr]"
                >
                  {step.thumbnail ? (
                    <Image
                      src={step.thumbnail}
                      alt={`Card art for the ${step.name} template`}
                      width={640}
                      height={360}
                      className="aspect-video w-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="aspect-video w-full rounded-xl bg-gradient-to-br from-slate-800/60 to-slate-900/60" />
                  )}
                  <div className="min-w-0">
                    <div className="font-mono text-sm text-amber-400">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-white">
                      {step.role}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">
                      {step.handoff}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                      {step.models.length > 0 ? (
                        step.models.map((model) => (
                          <span
                            key={`${model.provider}:${model.model}`}
                            className="rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 font-mono text-slate-400"
                          >
                            {model.model}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 font-medium text-emerald-300">
                          Runs locally — no key, no per-run cost
                        </span>
                      )}
                    </div>
                    <a
                      href={step.route}
                      className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 transition-colors hover:text-amber-300"
                    >
                      {step.name} — see the graph
                      <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Caveats */}
        <section className="relative py-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-6 flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-slate-500" />
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                What it does not do
              </h2>
            </div>
            <ul className="max-w-3xl space-y-4">
              {entry.caveats.map((caveat) => (
                <li
                  key={caveat}
                  className="rounded-xl border border-white/10 bg-slate-900/40 px-5 py-4 text-sm leading-relaxed text-slate-400"
                >
                  {caveat}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How to run */}
        <section id="how-to-run" className="relative scroll-mt-28 py-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="mb-8 text-2xl font-bold tracking-tight md:text-3xl">
              Running it
            </h2>
            <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  title: "Install Studio",
                  body: "The desktop app is free and runs on your own machine. No account is needed to open a workflow.",
                },
                {
                  title: "Import the bundle",
                  body: "Open the command menu and choose Import Workflow as Bundle. All the workflows in this recipe land in your library at once.",
                },
                {
                  title: "Add your keys",
                  body: "Paste each key above into Settings. Studio stores them in your OS keychain and sends them only to that provider.",
                },
                {
                  title: "Run the chain",
                  body: "Work down the list. Each step takes what the one before it produced, so you can stop and change your mind at any point.",
                },
              ].map((step, i) => (
                <li
                  key={step.title}
                  className="rounded-2xl border border-white/10 bg-slate-900/40 p-6"
                >
                  <div className="font-mono text-sm text-amber-400">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Other recipes */}
        <section className="relative py-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="mb-6 text-2xl font-bold tracking-tight md:text-3xl">
              Other recipes
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recipeEntries
                .filter((r) => r.slug !== entry.slug)
                .map((r) => (
                  <a
                    key={r.slug}
                    href={r.route}
                    className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 transition-colors hover:border-amber-500/40"
                  >
                    {(r.sample?.image ?? r.heroThumbnail) && (
                      <Image
                        src={r.sample?.image ?? r.heroThumbnail!}
                        alt=""
                        width={640}
                        height={360}
                        className="aspect-video w-full bg-slate-950 object-contain"
                      />
                    )}
                    <div className="p-4">
                      <div className="font-semibold text-white group-hover:text-amber-300">
                        {r.name}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">
                        {r.outcome}
                      </p>
                    </div>
                  </a>
                ))}
            </div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
