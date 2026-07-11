import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Download, Boxes, Play } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import WorkflowGraphFromJson from "@/components/WorkflowGraphFromJson";
import { SmartDownloadButton } from "@/app/SmartDownloadButton";
import {
  templateEntries,
  relatedTemplates,
  type TemplateEntry,
} from "@/data/templates";
import { miniAppEntries } from "@/data/miniApps";

const BASE_URL = "https://nodetool.ai";
const GITHUB_URL = "https://github.com/nodetool-ai/nodetool";

export const dynamicParams = false;

export function generateStaticParams() {
  return templateEntries.map((t) => ({ slug: t.slug }));
}

function getEntry(slug: string): TemplateEntry | undefined {
  return templateEntries.find((t) => t.slug === slug);
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
    robots: entry.indexable ? undefined : { index: false, follow: true },
    openGraph: {
      title: entry.title,
      description: entry.description,
      url,
      type: "website",
    },
  };
}

// Generic, template-agnostic run steps — every page always ships a walkthrough,
// so no page has an empty output *and* empty walkthrough.
function runSteps(entry: TemplateEntry) {
  const primaryModels = entry.nodeTypes
    .filter((t) => /generator|agent|image|video|audio|llm/i.test(t.type))
    .slice(0, 3)
    .map((t) => t.label);
  return [
    {
      title: "Download NodeTool Studio",
      body: "Install the free desktop app for macOS, Windows, or Linux. It runs on your own machine, no account required to start.",
    },
    {
      title: `Open the ${entry.name} template`,
      body: "Browse the built-in template library inside Studio and open this workflow onto the canvas. Every node is already wired up.",
    },
    {
      title: "Add your keys",
      body:
        primaryModels.length > 0
          ? `Connect the providers this workflow uses (${primaryModels.join(", ")}). Bring your own keys — you pay the provider directly.`
          : "Connect any model providers this workflow calls with your own API keys, or point it at local models.",
    },
    {
      title: "Run and remix",
      body: "Hit Run to execute the graph and watch results stream in. Swap models, edit prompts, or rewire nodes to make it yours.",
    },
  ];
}

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getEntry(slug);
  if (!entry) notFound();

  const steps = runSteps(entry);
  const related = relatedTemplates(entry, templateEntries, 9);
  const miniApp = miniAppEntries.find((a) => a.slug === entry.slug);
  const summary =
    entry.summary ||
    `${entry.name} is a ready-to-run NodeTool workflow. Open it in Studio, connect your keys, and run it — then edit any node to make it yours.`;

  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `How to run the ${entry.name} workflow in NodeTool`,
    description: summary,
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.body,
    })),
  };
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Related NodeTool templates",
    itemListElement: related.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: r.name,
      url: `${BASE_URL}${r.route}`,
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040408] text-white">
      <SiteHeader />
      <JsonLd data={howToLd} />
      <JsonLd data={itemListLd} />

      <div className="relative pt-28">
        {/* Hero */}
        <section className="relative pt-10 pb-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <a
              href="/templates"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              All templates
            </a>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-300">
              Template
              <span className="text-sky-500/60">·</span>
              {entry.category}
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              {entry.name}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
              {summary}
            </p>
            <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(56,189,248,0.6)] transition-all hover:bg-sky-400"
              />
              <a
                href="#how-to-run"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0a0a14]/70 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:border-white/25 hover:bg-white/5"
              >
                <Play className="h-4 w-4" />
                How to run it
              </a>
              {miniApp && (
                <a
                  href={miniApp.route}
                  className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-8 py-3.5 text-sm font-semibold text-sky-300 transition-all hover:border-sky-500/50 hover:bg-sky-500/20"
                >
                  Try it as a mini app
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Output / thumbnail */}
        {entry.thumbnail && (
          <section className="relative pb-4">
            <div className="mx-auto max-w-6xl px-6 lg:px-8">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl">
                <Image
                  src={entry.thumbnail}
                  alt={`${entry.name} — example output from the NodeTool workflow`}
                  width={1280}
                  height={720}
                  className="w-full object-cover"
                  priority
                />
              </div>
            </div>
          </section>
        )}

        {/* Graph */}
        <section className="relative py-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="mb-6 text-2xl font-bold tracking-tight md:text-3xl">
              The workflow
            </h2>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl">
              <div className="flex items-center gap-2 border-b border-white/5 bg-slate-900/80 px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-sky-500/40" />
                <div className="h-3 w-3 rounded-full bg-amber-500/40" />
                <div className="h-3 w-3 rounded-full bg-emerald-500/40" />
                <span className="ml-3 text-xs font-medium text-slate-400">
                  Workflow Editor
                </span>
                <span className="ml-auto hidden text-xs font-medium text-slate-500 sm:block">
                  {entry.name}
                </span>
              </div>
              <WorkflowGraphFromJson
                graph={entry.graph}
                ariaLabel={`${entry.name} workflow graph`}
              />
            </div>
          </div>
        </section>

        {/* Nodes list */}
        {entry.nodeTypes.length > 0 && (
          <section className="relative py-12">
            <div className="mx-auto max-w-6xl px-6 lg:px-8">
              <div className="mb-6 flex items-center gap-3">
                <Boxes className="h-6 w-6 text-sky-400" />
                <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                  Nodes in this workflow
                </h2>
                <span className="text-sm text-slate-500">
                  {entry.nodeCount} nodes · {entry.nodeTypes.length} types
                </span>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {entry.nodeTypes.map((t) => (
                  <li
                    key={t.type}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">
                        {t.label}
                      </div>
                      <div className="truncate font-mono text-xs text-slate-500">
                        {t.type}
                      </div>
                    </div>
                    {t.count > 1 && (
                      <span className="shrink-0 rounded-md border border-white/10 bg-slate-950/60 px-2 py-0.5 text-xs font-medium text-slate-300">
                        ×{t.count}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* How to run */}
        <section id="how-to-run" className="relative scroll-mt-28 py-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="mb-8 text-2xl font-bold tracking-tight md:text-3xl">
              How to run it
            </h2>
            <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <li
                  key={step.title}
                  className="rounded-2xl border border-white/10 bg-slate-900/40 p-6"
                >
                  <div className="font-mono text-sm text-sky-400">
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

        {/* Related */}
        {related.length > 0 && (
          <section className="relative py-12">
            <div className="mx-auto max-w-6xl px-6 lg:px-8">
              <h2 className="mb-6 text-2xl font-bold tracking-tight md:text-3xl">
                Related templates
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((r) => (
                  <a
                    key={r.slug}
                    href={r.route}
                    className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 transition-colors hover:border-white/25"
                  >
                    {r.thumbnail ? (
                      <Image
                        src={r.thumbnail}
                        alt=""
                        width={640}
                        height={360}
                        className="aspect-video w-full object-cover"
                      />
                    ) : (
                      <div className="aspect-video w-full bg-gradient-to-br from-slate-800/60 to-slate-900/60" />
                    )}
                    <div className="p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-sky-400/80">
                        {r.category}
                      </div>
                      <div className="mt-1 font-semibold text-white group-hover:text-sky-300">
                        {r.name}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="relative py-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Run {entry.name} on your machine
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-400">
              Free, open source, and yours to run. Download Studio, open the
              template, and run it with your own keys.
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
