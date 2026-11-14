import React from "react";
import type { Metadata } from "next";
import { ArrowRight, Sparkles } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import NodeChain from "@/components/NodeChain";
import { featuredTemplateFor, landingEntries, solutionsHubEntry } from "@/data/landingEntries";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";

const BASE_URL = "https://nodetool.ai";

export const metadata: Metadata = {
  title: solutionsHubEntry.title,
  description: solutionsHubEntry.description,
  alternates: { canonical: `${BASE_URL}/solutions` },
  openGraph: {
    images: DEFAULT_OG_IMAGES,
    title: solutionsHubEntry.title,
    description: solutionsHubEntry.description,
    url: `${BASE_URL}/solutions`,
    type: "website",
  },
};

/**
 * The solution pages in the header menu, each with a picture taken from its
 * own page. The titles are those pages' H1s.
 */
const FEATURED: { href: string; label: string; title: string; image: string; alt: string; fit?: "contain" }[] = [
  {
    href: "/agents",
    label: "Agents",
    title: "Give Claude Code a creative harness.",
    image: "/surface-timeline-poster.webp",
    alt: "A timeline the agent assembled, open in NodeTool Studio",
  },
  {
    href: "/marketing",
    label: "Marketing",
    title: "One brief. Four deliverables.",
    image: "/marketing-why/campaign-16x9.webp",
    alt: "The 16:9 hero image from the Directed Campaign Kit example",
  },
  {
    href: "/gamedev",
    label: "Game development",
    title: "Build a game with an agent. Keep editing it yourself.",
    image: "/games/kindle/poster.jpg",
    alt: "Kindle, a platformer built in NodeTool's game engine",
  },
  {
    href: "/developers",
    label: "Developers",
    title: "Your coding agent writes the app. Now it makes the media too.",
    image: "/screen_canvas.webp",
    alt: "A NodeTool workflow on the canvas, the graph an app calls over the API",
  },
];

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
              Pages grouped by what you want to make and who you are, each with a
              NodeTool workflow you can open in Studio and adapt.
            </p>
          </div>
        </section>

        <section aria-labelledby="featured-title" className="relative py-8">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 id="featured-title" className="mb-5 text-xl font-bold tracking-tight text-white/90 md:text-2xl">
              Start here
            </h2>
            <ul className="grid gap-5 sm:grid-cols-2">
              {FEATURED.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 transition-colors hover:border-white/25"
                  >
                    <div className="aspect-video overflow-hidden border-b border-white/10 bg-slate-950">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.image}
                        alt={item.alt}
                        loading="lazy"
                        decoding="async"
                        className="no-desaturate h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
                      />
                    </div>
                    <div className="flex flex-1 items-end justify-between gap-4 p-5">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-sky-400/80">{item.label}</div>
                        <div className="mt-1.5 text-lg font-semibold leading-snug text-white group-hover:text-sky-300">
                          {item.title}
                        </div>
                      </div>
                      <ArrowRight className="mb-1 h-5 w-5 shrink-0 text-slate-500 group-hover:text-sky-300" aria-hidden />
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {GROUPS.map(({ kind, label }) => {
          const items = landingEntries.filter((e) => e.kind === kind);
          if (items.length === 0) return null;
          return (
            <section key={kind} className="relative py-8">
              <div className="mx-auto max-w-6xl px-6 lg:px-8">
                <h2 className="mb-2 text-xl font-bold tracking-tight text-white/90 md:text-2xl">
                  {label}
                </h2>
                <p className="mb-5 text-sm text-slate-400">Each page opens with the workflow below it.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {items.map((e) => {
                    const template = featuredTemplateFor(e);
                    return (
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
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-400">
                          {e.subhead}
                        </p>
                        {template ? (
                          <div className="mt-4 border-t border-white/10 pt-4">
                            <NodeChain graph={template.graph} />
                          </div>
                        ) : null}
                      </a>
                    );
                  })}
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
