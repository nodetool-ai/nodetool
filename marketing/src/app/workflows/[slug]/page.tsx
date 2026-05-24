import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Clock, Layers, Cpu, Workflow as WorkflowIcon, ArrowLeft, Download } from "lucide-react";
import { WORKFLOWS, getWorkflowBySlug } from "@/lib/workflows/data";
import WorkflowVideo from "@/components/workflows/WorkflowVideo";
import WorkflowShareBar from "@/components/workflows/WorkflowShareBar";
import WorkflowFlowClient from "@/components/workflows/WorkflowFlowClient";

const BASE_URL = "https://nodetool.ai";

export function generateStaticParams() {
  return WORKFLOWS.map((w) => ({ slug: w.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const wf = getWorkflowBySlug(slug);
  if (!wf) return {};
  const url = `${BASE_URL}/workflows/${wf.slug}`;
  const description = `${wf.tagline} Uses ${wf.models.join(", ")} via ${wf.providers.join(", ")}.`;
  return {
    title: `${wf.title} | NodeTool Workflow`,
    description,
    alternates: { canonical: `/workflows/${wf.slug}` },
    keywords: [
      wf.title,
      "NodeTool workflow",
      ...wf.tags,
      ...wf.models,
      ...wf.providers,
      "BYOK AI workflow",
      "open source AI workflow",
    ],
    openGraph: {
      title: `${wf.title} — NodeTool Workflow`,
      description,
      url,
      siteName: "NodeTool",
      images: [{ url: wf.ogImage ?? "/preview.png", alt: wf.title }],
      locale: "en_US",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${wf.title} — NodeTool Workflow`,
      description,
      images: [wf.ogImage ?? "/preview.png"],
    },
  };
}

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const wf = getWorkflowBySlug(slug);
  if (!wf) notFound();

  const url = `${BASE_URL}/workflows/${wf.slug}`;

  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: wf.title,
    description: wf.description,
    totalTime: wf.runtime,
    image: wf.ogImage ? `${BASE_URL}${wf.ogImage}` : `${BASE_URL}/preview.png`,
    tool: wf.models.map((m) => ({ "@type": "HowToTool", name: m })),
    supply: wf.providers.map((p) => ({ "@type": "HowToSupply", name: `${p} API key` })),
    step: wf.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.detail,
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "NodeTool", item: BASE_URL },
      { "@type": "ListItem", position: 2, name: "Workflows", item: `${BASE_URL}/workflows` },
      { "@type": "ListItem", position: 3, name: wf.title, item: url },
    ],
  };

  const related = WORKFLOWS.filter((w) => w.slug !== wf.slug)
    .filter((w) => w.category === wf.category || w.tags.some((t) => wf.tags.includes(t)))
    .slice(0, 3);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-200">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[500px] overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <Link href="/workflows" className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> All workflows
        </Link>
        <div className="hidden gap-6 text-sm text-neutral-400 sm:flex">
          <Link href="/studio" className="hover:text-white">Studio</Link>
          <Link href="/cloud" className="hover:text-white">Cloud</Link>
          <Link href="https://docs.nodetool.ai" className="hover:text-white">Docs</Link>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-10 pb-12 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr,0.9fr] lg:gap-12">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-blue-200 ring-1 ring-blue-400/20">
                {wf.category}
              </span>
              {wf.tags.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-md bg-white/5 px-2 py-1 text-[11px] font-medium text-neutral-400 ring-1 ring-white/10"
                >
                  {t}
                </span>
              ))}
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">{wf.title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-neutral-400">{wf.description}</p>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-400">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-neutral-500" /> {wf.runtime}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-neutral-500" /> {wf.difficulty}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-neutral-500" /> {wf.models.length} models
              </span>
              <span className="inline-flex items-center gap-1.5">
                <WorkflowIcon className="h-4 w-4 text-neutral-500" /> {wf.preview.nodes.length} nodes
              </span>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="https://github.com/nodetool-ai/nodetool/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:from-blue-400 hover:to-violet-400"
              >
                <Download className="h-4 w-4" /> Open in NodeTool
              </a>
              <Link
                href="/cloud"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                Run on Cloud
              </Link>
              <WorkflowShareBar url={url} title={wf.title} />
            </div>
          </div>

          <div>
            {wf.video ? (
              <WorkflowVideo video={wf.video} title={wf.title} />
            ) : (
              <div className="aspect-video w-full rounded-2xl bg-neutral-900/60 ring-1 ring-white/10 flex items-center justify-center text-neutral-500 text-sm">
                Demo video coming soon
              </div>
            )}
          </div>
        </div>
      </section>

      {/* The flow */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-12 lg:px-8">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">The graph</h2>
            <p className="mt-1 text-sm text-neutral-400">
              The actual nodes you&apos;ll see when you open this workflow on the canvas.
            </p>
          </div>
        </div>
        <div className="h-[480px] w-full overflow-hidden rounded-2xl border border-neutral-800/70 bg-neutral-950/60 ring-1 ring-white/5">
          <WorkflowFlowClient
            nodes={wf.preview.nodes}
            edges={wf.preview.edges}
            scaleX={260}
            scaleY={160}
          />
        </div>
      </section>

      {/* Steps + sidebar */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-16 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr,0.6fr]">
          <div>
            <h2 className="text-2xl font-semibold text-white">How it works</h2>
            <ol className="mt-6 space-y-5">
              {wf.steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-blue-500/15 text-sm font-semibold text-blue-200 ring-1 ring-blue-400/30">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-white">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-400">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            <h2 className="mt-12 text-2xl font-semibold text-white">What you can build with it</h2>
            <ul className="mt-4 space-y-2 text-neutral-300">
              {wf.useCases.map((u) => (
                <li key={u} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-blue-400" />
                  <span className="text-sm leading-relaxed">{u}</span>
                </li>
              ))}
            </ul>
          </div>

          <aside className="flex flex-col gap-6">
            <div className="rounded-2xl border border-neutral-800/70 bg-neutral-900/40 p-5 ring-1 ring-white/5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Models</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {wf.models.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center rounded-md bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-200 ring-1 ring-violet-400/20"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-800/70 bg-neutral-900/40 p-5 ring-1 ring-white/5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Providers</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {wf.providers.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-400/20"
                  >
                    {p}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                Bring your own keys. NodeTool calls providers directly — no credits, no markup.
              </p>
            </div>
          </aside>
        </div>
      </section>

      {related.length > 0 ? (
        <section className="relative z-10 border-t border-neutral-800/60 bg-neutral-950/40">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
            <h2 className="text-2xl font-semibold text-white">Related workflows</h2>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/workflows/${r.slug}`}
                  className="group rounded-xl border border-neutral-800/70 bg-neutral-900/40 p-5 ring-1 ring-white/5 transition-all hover:border-blue-500/40 hover:ring-blue-400/20"
                >
                  <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                    {r.category}
                  </span>
                  <h3 className="mt-1 text-base font-semibold text-white group-hover:text-blue-300">
                    {r.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm text-neutral-400">{r.tagline}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
