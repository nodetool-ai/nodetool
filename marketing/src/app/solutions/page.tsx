import React from "react";
import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { landingEntries, solutionsHubEntry } from "@/data/landingEntries";

const BASE_URL = "https://nodetool.ai";

export const metadata: Metadata = {
  title: solutionsHubEntry.title,
  description: solutionsHubEntry.description,
  alternates: { canonical: `${BASE_URL}/solutions` },
};

const GROUPS: { kind: "use-case" | "persona"; label: string }[] = [
  { kind: "use-case", label: "By outcome" },
  { kind: "persona", label: "By audience" },
];

export default function SolutionsHub() {
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "NodeTool AI workflow solutions",
    itemListElement: landingEntries.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: e.headline,
      url: `${BASE_URL}${e.route}`,
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040408] text-white">
      <SiteHeader />
      <JsonLd data={itemListLd} />

      <div className="relative pt-28">
        <section className="relative pt-10 pb-8">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-300">
              <Sparkles className="h-3.5 w-3.5" />
              Solutions
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              What do you want to build?
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
              Outcome and audience landing pages — each with a runnable NodeTool workflow you can
              open in Studio and make your own.
            </p>
          </div>
        </section>

        {GROUPS.map(({ kind, label }) => {
          const items = landingEntries.filter((e) => e.kind === kind);
          if (items.length === 0) return null;
          return (
            <section key={kind} className="relative py-8">
              <div className="mx-auto max-w-6xl px-6 lg:px-8">
                <h2 className="mb-5 text-xl font-bold tracking-tight text-white/90 md:text-2xl">
                  {label}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((e) => (
                    <a
                      key={e.slug}
                      href={e.route}
                      className="group flex flex-col rounded-2xl border border-white/10 bg-slate-900/40 p-6 transition-colors hover:border-white/25"
                    >
                      <div className="text-xs font-medium uppercase tracking-wide text-sky-400/80">
                        {e.eyebrow}
                      </div>
                      <div className="mt-2 font-semibold text-white group-hover:text-sky-300">
                        {e.headline}
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-400">
                        {e.subhead}
                      </p>
                    </a>
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <SiteFooter />
    </main>
  );
}
