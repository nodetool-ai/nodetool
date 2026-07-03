import React from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { Boxes, Download } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { SmartDownloadButton } from "@/app/SmartDownloadButton";
import { templateEntries, type TemplateEntry } from "@/data/templates";

const BASE_URL = "https://nodetool.ai";

export const metadata: Metadata = {
  title: "AI Workflow Templates — NodeTool",
  description:
    "Browse ready-to-run NodeTool AI workflow templates for image, video, audio, agents, and marketing. Open any one in Studio and run it with your own keys.",
  alternates: { canonical: `${BASE_URL}/templates` },
};

// Hub grouping order — most visual categories first.
const CATEGORY_ORDER = [
  "Image & Design",
  "Video",
  "Audio & Music",
  "Agents & Research",
  "Marketing & Content",
  "Learning & Productivity",
  "Text & Data",
];

function groupByCategory(entries: TemplateEntry[]) {
  const groups = new Map<string, TemplateEntry[]>();
  for (const e of entries) {
    const list = groups.get(e.category) ?? [];
    list.push(e);
    groups.set(e.category, list);
  }
  const ordered = [...groups.keys()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return ordered.map((category) => ({
    category,
    items: groups
      .get(category)!
      .slice()
      .sort(
        (a, b) =>
          Number(b.indexable) - Number(a.indexable) ||
          a.name.localeCompare(b.name),
      ),
  }));
}

export default function TemplatesHub() {
  const groups = groupByCategory(templateEntries);

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "NodeTool AI workflow templates",
    itemListElement: templateEntries
      .filter((t) => t.indexable)
      .map((t, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: t.name,
        url: `${BASE_URL}${t.route}`,
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
              <Boxes className="h-3.5 w-3.5" />
              {templateEntries.length} templates
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              AI workflow templates
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
              Ready-to-run NodeTool workflows for image, video, audio, agents,
              and marketing. Open any one in Studio, connect your keys, and run
              it — then rewire the nodes to make it yours.
            </p>
            <div className="mt-8">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(56,189,248,0.6)] transition-all hover:bg-sky-400"
              />
            </div>
          </div>
        </section>

        {groups.map(({ category, items }) => (
          <section key={category} className="relative py-8">
            <div className="mx-auto max-w-6xl px-6 lg:px-8">
              <h2 className="mb-5 text-xl font-bold tracking-tight text-white/90 md:text-2xl">
                {category}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => (
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
                      <div className="font-semibold text-white group-hover:text-sky-300">
                        {t.name}
                      </div>
                      {t.summary && (
                        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-400">
                          {t.summary}
                        </p>
                      )}
                      <div className="mt-3 text-xs font-medium text-slate-500">
                        {t.nodeCount} nodes
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>

      <SiteFooter />
    </main>
  );
}
