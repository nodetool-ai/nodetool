import React from "react";
import Link from "next/link";
import WorkflowFilters from "@/components/workflows/WorkflowFilters";
import { WORKFLOWS } from "@/lib/workflows/data";

const BASE_URL = "https://nodetool.ai";

export default function WorkflowsIndexPage() {
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "NodeTool Workflow Marketplace",
    description:
      "Production-ready NodeTool workflows for image, video, audio, agents, and RAG. Open source, BYOK, runs on your machine.",
    url: `${BASE_URL}/workflows`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: WORKFLOWS.map((w, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        url: `${BASE_URL}/workflows/${w.slug}`,
        name: w.title,
        description: w.tagline,
      })),
    },
  };

  return (
    <main className="min-h-screen bg-[#05050A] text-slate-200">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />

      {/* Background glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[600px] overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-[120px]" />
        <div className="absolute right-0 top-40 h-[300px] w-[400px] rounded-full bg-violet-500/10 blur-[100px]" />
      </div>

      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <Link href="/" className="text-sm font-semibold text-slate-300 hover:text-white">
          ← NodeTool
        </Link>
        <div className="hidden gap-6 text-sm text-slate-400 sm:flex">
          <Link href="/studio" className="hover:text-white">Studio</Link>
          <Link href="/cloud" className="hover:text-white">Cloud</Link>
          <Link href="/agents" className="hover:text-white">Agents</Link>
          <Link href="https://docs.nodetool.ai" className="hover:text-white">Docs</Link>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-16 pb-12 lg:px-8 lg:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Workflow Marketplace
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
            Fork a workflow.{" "}
            <span className="bg-gradient-to-r from-blue-400 via-violet-300 to-rose-300 bg-clip-text text-transparent">
              Ship in minutes.
            </span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-slate-400">
            Production-ready NodeTool graphs you can open on the canvas, plug your keys into,
            and ship. Every workflow comes with a fancy preview, a demo video, and one-click
            import into Studio or Cloud.
          </p>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24 lg:px-8">
        <WorkflowFilters workflows={WORKFLOWS} />
      </section>

      <section className="relative z-10 border-t border-slate-800/60 bg-slate-950/40">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 py-16 text-center lg:flex-row lg:px-8 lg:text-left">
          <div>
            <h2 className="text-2xl font-semibold text-white">Built a workflow worth sharing?</h2>
            <p className="mt-2 max-w-2xl text-slate-400">
              Submit it to the marketplace. Open-source workflows are credited on the page and
              promoted across our social channels.
            </p>
          </div>
          <a
            href="https://github.com/nodetool-ai/nodetool/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-white px-6 py-3 font-semibold text-slate-900 transition-colors hover:bg-slate-100"
          >
            Submit a workflow
          </a>
        </div>
      </section>
    </main>
  );
}
