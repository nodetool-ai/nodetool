import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Download, Boxes, Cpu, Sparkles } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import WorkflowGraphFromJson from "@/components/WorkflowGraphFromJson";
import { SmartDownloadButton } from "@/app/SmartDownloadButton";
import {
  taskEntries,
  getTask,
  templatesForTask,
  showcaseForTask,
  taskCanonical,
} from "@/data/taskEntries";
import type { OgAccent } from "@/lib/og";

const BASE_URL = "https://nodetool.ai";

export const dynamicParams = false;

export function generateStaticParams() {
  return taskEntries.map((t) => ({ slug: t.slug }));
}

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
  const entry = getTask(slug);
  if (!entry) return {};
  const url = taskCanonical(entry);
  return {
    title: entry.title,
    description: entry.description,
    alternates: { canonical: url },
    robots: entry.indexable ? undefined : { index: false, follow: true },
    openGraph: { title: entry.title, description: entry.description, url, type: "website" },
    twitter: { card: "summary_large_image", title: entry.headline, description: entry.description },
  };
}

export default async function TaskPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getTask(slug);
  if (!entry) notFound();

  const templates = templatesForTask(entry);
  const featured = templates[0];
  const showcase = showcaseForTask(entry);
  // Strip media: real showcase items when the seeder has run, else matched
  // template thumbnails so the strip is never blank.
  const strip: { src: string; alt: string; href: string }[] = showcase.length
    ? showcase.map((s) => ({ src: s.src, alt: `${entry.task} example`, href: s.route }))
    : templates
        .filter((t) => t.thumbnail)
        .map((t) => ({ src: t.thumbnail as string, alt: t.name, href: t.route }));

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `NodeTool — ${entry.task}`,
    description: entry.description,
    brand: { "@type": "Brand", name: "NodeTool" },
    category: `AI ${entry.task}`,
    url: taskCanonical(entry),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: taskCanonical(entry),
    },
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
      <JsonLd data={productLd} />
      <JsonLd data={faqLd} />

      <div className="relative pt-28">
        {/* Hero */}
        <section className="relative pt-10 pb-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <a
              href="/tasks"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              All tasks
            </a>
            <div
              className={`mt-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${CHIP[entry.accent]}`}
            >
              Task
              <span className="opacity-50">·</span>
              {entry.modality}
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              {entry.headline}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
              {entry.subhead}
            </p>
            <div className="mt-8">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(56,189,248,0.6)] transition-all hover:bg-sky-400"
              />
            </div>
          </div>
        </section>

        {/* Showcase strip */}
        {strip.length > 0 && (
          <section className="relative pb-4">
            <div className="mx-auto max-w-6xl px-6 lg:px-8">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {strip.slice(0, 4).map((m) => (
                  <a
                    key={m.href}
                    href={m.href}
                    className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 transition-colors hover:border-white/25"
                  >
                    <Image
                      src={m.src}
                      alt={m.alt}
                      width={640}
                      height={360}
                      className="aspect-video w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Models */}
        <section className="relative py-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-6 flex items-center gap-3">
              <Cpu className="h-6 w-6 text-sky-400" />
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                Models for {entry.task.toLowerCase()}
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {entry.models.map((m) => (
                <div
                  key={m.name}
                  className="rounded-2xl border border-white/10 bg-slate-900/40 p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-white">{m.name}</div>
                    <span className="shrink-0 rounded-md border border-white/10 bg-slate-950/60 px-2 py-0.5 text-xs font-medium text-slate-300">
                      {m.modality}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-medium uppercase tracking-wide text-sky-400/80">
                    {m.provider}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{m.blurb}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Featured workflow */}
        {featured && (
          <section className="relative py-12">
            <div className="mx-auto max-w-6xl px-6 lg:px-8">
              <div className="mb-6 flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-sky-400" />
                <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                  A workflow that does it
                </h2>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl">
                <div className="flex items-center gap-2 border-b border-white/5 bg-slate-900/80 px-4 py-3">
                  <div className="h-3 w-3 rounded-full bg-sky-500/40" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/40" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/40" />
                  <span className="ml-3 text-xs font-medium text-slate-400">Workflow Editor</span>
                  <span className="ml-auto hidden text-xs font-medium text-slate-500 sm:block">
                    {featured.name}
                  </span>
                </div>
                <WorkflowGraphFromJson
                  graph={featured.graph}
                  ariaLabel={`${featured.name} workflow graph`}
                />
              </div>
              <div className="mt-5">
                <a
                  href={featured.route}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-sky-300 transition-colors hover:text-sky-200"
                >
                  Open the {featured.name} template
                  <ArrowLeft className="h-4 w-4 rotate-180" />
                </a>
              </div>
            </div>
          </section>
        )}

        {/* Templates */}
        {templates.length > 0 && (
          <section className="relative py-12">
            <div className="mx-auto max-w-6xl px-6 lg:px-8">
              <div className="mb-6 flex items-center gap-3">
                <Boxes className="h-6 w-6 text-sky-400" />
                <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                  Templates that wire {entry.task.toLowerCase()}
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((t) => (
                  <a
                    key={t.slug}
                    href={t.route}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 transition-colors hover:border-white/25"
                  >
                    {t.thumbnail ? (
                      <Image
                        src={t.thumbnail}
                        alt=""
                        width={640}
                        height={360}
                        className="aspect-video w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-slate-800/60 to-slate-900/60">
                        <Boxes className="h-8 w-8 text-slate-600" />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-sky-400/80">
                        {t.category}
                      </div>
                      <div className="mt-1 font-semibold text-white group-hover:text-sky-300">
                        {t.name}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

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
              Do {entry.task.toLowerCase()} on your own machine
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-400">
              Free, open source, and yours to run. Download Studio, pick a model, and wire it into
              a workflow with your own keys.
            </p>
            <div className="mt-8 flex justify-center">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(56,189,248,0.6)] transition-all hover:bg-sky-400"
              />
            </div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
