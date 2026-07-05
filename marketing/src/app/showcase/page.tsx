import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import {
  showcaseEntries,
  showcaseModels,
  showcaseWorkflows,
  humanize,
} from "@/data/showcase";
import { ShowcaseGrid } from "./_components";

const BASE_URL = "https://nodetool.ai";

export const metadata: Metadata = {
  title: "Showcase — AI images & video made with NodeTool",
  description:
    "A gallery of images and video generated with NodeTool workflows. Browse by model or by workflow to see what each one produces.",
  alternates: { canonical: "/showcase" },
  openGraph: {
    title: "Showcase — AI images & video made with NodeTool",
    description:
      "Browse images and video generated with NodeTool workflows, by model and by workflow.",
    url: `${BASE_URL}/showcase`,
    type: "website",
  },
};

export default function ShowcaseHubPage() {
  const entries = showcaseEntries.filter((e) => e.indexable);
  const models = showcaseModels();
  const workflows = showcaseWorkflows();

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "NodeTool Showcase",
    numberOfItems: entries.length,
    itemListElement: entries.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE_URL}${e.route}`,
      name: e.prompt,
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={itemList} />
      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        <section className="mx-auto max-w-3xl px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
            Showcase
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl">
            Made with NodeTool
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            Images and video generated with NodeTool workflows. Pick any shot to
            see the exact model, workflow, and prompt — then remix it in the app.
          </p>
        </section>

        {/* Filters — static pages so crawlers follow them. */}
        <section aria-label="Browse by model" className="mx-auto mt-12 max-w-6xl px-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            By model
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {models.map((m) => (
              <Link
                key={m.slug}
                href={`/showcase/model/${m.slug}`}
                className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:border-blue-500/50 hover:text-white"
              >
                {m.label}
                <span className="ml-1.5 text-slate-500">{m.count}</span>
              </Link>
            ))}
          </div>

          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-400">
            By workflow
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {workflows.map((w) => (
              <Link
                key={w.slug}
                href={`/showcase/workflow/${w.slug}`}
                className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:border-blue-500/50 hover:text-white"
              >
                {humanize(w.slug)}
                <span className="ml-1.5 text-slate-500">{w.count}</span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-label="All generations" className="mx-auto mt-12 max-w-6xl px-6 pb-24">
          <ShowcaseGrid entries={entries} />
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
