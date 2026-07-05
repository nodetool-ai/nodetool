import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Play, Boxes, Check } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import FeaturesSection from "@/components/FeaturesSection";
import UseCasesShowcase from "@/components/UseCasesShowcase";
import WorkflowGraphFromJson from "@/components/WorkflowGraphFromJson";
import { SmartDownloadButton } from "@/app/SmartDownloadButton";
import {
  landingEntries,
  getLanding,
  featuredTemplateFor,
  landingCanonical,
} from "@/data/landingEntries";
import type { OgAccent } from "@/lib/og";

const BASE_URL = "https://nodetool.ai";
const GITHUB_URL = "https://github.com/nodetool-ai/nodetool";

export const dynamicParams = false;

export function generateStaticParams() {
  return landingEntries.map((e) => ({ slug: e.slug }));
}

// Chip theming per accent (matches the OG accent palette used elsewhere).
const CHIP: Record<OgAccent, string> = {
  blue: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = getLanding(slug);
  if (!entry) return {};
  const url = landingCanonical(entry);
  return {
    title: entry.title,
    description: entry.description,
    alternates: { canonical: url },
    robots: entry.indexable ? undefined : { index: false, follow: true },
    openGraph: {
      title: entry.title,
      description: entry.description,
      url,
      type: entry.kind === "persona" ? "website" : "article",
    },
    twitter: { card: "summary_large_image", title: entry.headline, description: entry.description },
  };
}

export default async function SolutionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getLanding(slug);
  if (!entry) notFound();

  const template = featuredTemplateFor(entry);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
      { "@type": "ListItem", position: 2, name: "Solutions", item: `${BASE_URL}/solutions` },
      { "@type": "ListItem", position: 3, name: entry.headline, item: landingCanonical(entry) },
    ],
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entry.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040408] text-white">
      <SiteHeader />
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={faqLd} />

      <div className="relative pt-28">
        {/* Hero */}
        <section className="relative pt-10 pb-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <a
              href="/solutions"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              All solutions
            </a>
            <div
              className={`mt-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${CHIP[entry.accent]}`}
            >
              {entry.eyebrow}
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              {entry.headline}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
              {entry.subhead}
            </p>
            <ul className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
              {entry.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  {h}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(56,189,248,0.6)] transition-all hover:bg-sky-400"
              />
              {template && (
                <a
                  href={template.route}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0a0a14]/70 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:border-white/25 hover:bg-white/5"
                >
                  <Play className="h-4 w-4" />
                  See the workflow
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Featured template embed */}
        {template && (
          <section className="relative py-12">
            <div className="mx-auto max-w-6xl px-6 lg:px-8">
              <div className="mb-6 flex items-center gap-3">
                <Boxes className="h-6 w-6 text-sky-400" />
                <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                  The workflow behind it
                </h2>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl">
                <div className="flex items-center gap-2 border-b border-white/5 bg-slate-900/80 px-4 py-3">
                  <div className="h-3 w-3 rounded-full bg-sky-500/40" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/40" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/40" />
                  <span className="ml-3 text-xs font-medium text-slate-400">Workflow Editor</span>
                  <span className="ml-auto hidden text-xs font-medium text-slate-500 sm:block">
                    {template.name}
                  </span>
                </div>
                <WorkflowGraphFromJson
                  graph={template.graph}
                  ariaLabel={`${template.name} workflow graph`}
                />
              </div>
              <div className="mt-5">
                <a
                  href={template.route}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-sky-300 transition-colors hover:text-sky-200"
                >
                  Open the {template.name} template
                  <ArrowLeft className="h-4 w-4 rotate-180" />
                </a>
              </div>
            </div>
          </section>
        )}

        {/* Shared body sections */}
        {entry.sections.includes("features") && <FeaturesSection />}
        {entry.sections.includes("use-cases") && <UseCasesShowcase />}

        {/* FAQ */}
        {entry.faqs.length > 0 && (
          <section className="relative py-12">
            <div className="mx-auto max-w-3xl px-6 lg:px-8">
              <h2 className="mb-8 text-2xl font-bold tracking-tight md:text-3xl">
                Frequently asked questions
              </h2>
              <div className="space-y-4">
                {entry.faqs.map((f) => (
                  <div
                    key={f.q}
                    className="rounded-2xl border border-white/10 bg-slate-900/40 p-6"
                  >
                    <h3 className="text-base font-semibold text-white">{f.q}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="relative py-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Build it on your own machine
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-400">
              Free, open source, and yours to run. Download Studio, open the template, and make
              it yours with your own keys.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(56,189,248,0.6)] transition-all hover:bg-sky-400"
              />
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0a0a14]/70 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:border-white/25 hover:bg-white/5"
              >
                Star on GitHub
              </a>
            </div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
