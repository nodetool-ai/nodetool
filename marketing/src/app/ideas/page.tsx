import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { ideaCategories } from "@/data/ideasEntries";

export const metadata: Metadata = {
  title: "AI workflow ideas — NodeTool",
  description:
    "Ideas for what to build in NodeTool, grouped by category: image and video generation, audio and voice, agents and research, marketing content, and data workflows.",
  alternates: { canonical: "/ideas" },
  openGraph: {
    title: "AI workflow ideas — NodeTool",
    description:
      "What to build in NodeTool: image, video, audio, agents, marketing, and data workflows.",
    url: "https://nodetool.ai/ideas",
    type: "website",
  },
};

const BASE_URL = "https://nodetool.ai";

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
    { "@type": "ListItem", position: 2, name: "Ideas", item: `${BASE_URL}/ideas` },
  ],
};

const itemList = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  itemListElement: ideaCategories.map((cat, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: `${cat.label} workflow ideas`,
    url: `${BASE_URL}${cat.route}`,
  })),
};

export default function IdeasHubPage() {
  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={breadcrumb} />
      <JsonLd data={itemList} />

      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-[120px]" />
        <div className="absolute top-1/2 -right-24 h-[24rem] w-[24rem] rounded-full bg-fuchsia-500/10 blur-[120px]" />
      </div>

      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        <section className="mx-auto max-w-3xl px-6 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
            AI workflow ideas
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            What to build on the canvas — grouped by category, drawn from the
            example workflows that ship with NodeTool.
          </p>
        </section>

        <section className="mx-auto mt-16 mb-24 max-w-5xl px-6">
          <div className="grid gap-6 sm:grid-cols-2">
            {ideaCategories.map((cat) => (
              <Link
                key={cat.slug}
                href={cat.route}
                className="group flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-7 ring-1 ring-white/5 backdrop-blur-md transition-colors hover:border-blue-500/40"
              >
                <h2 className="text-xl font-semibold text-white group-hover:text-blue-200">
                  {cat.label}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {cat.description}
                </p>
                <span className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {cat.templates.length} ideas →
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
