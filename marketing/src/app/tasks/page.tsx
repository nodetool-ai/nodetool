import React from "react";
import type { Metadata } from "next";
import { Cpu } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { taskEntries, tasksHubEntry } from "@/data/taskEntries";

const BASE_URL = "https://nodetool.ai";

export const metadata: Metadata = {
  title: tasksHubEntry.title,
  description: tasksHubEntry.description,
  alternates: { canonical: `${BASE_URL}/tasks` },
};

export default function TasksHub() {
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "NodeTool AI tasks",
    itemListElement: taskEntries.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.task,
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
              <Cpu className="h-3.5 w-3.5" />
              {taskEntries.length} tasks
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              AI tasks, done on one canvas
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
              Pick a capability — the models that do it, the templates that wire it, and how to run
              it yourself with your own keys.
            </p>
          </div>
        </section>

        <section className="relative py-8">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {taskEntries.map((t) => (
                <a
                  key={t.slug}
                  href={t.route}
                  className="group flex flex-col rounded-2xl border border-white/10 bg-slate-900/40 p-6 transition-colors hover:border-white/25"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-white group-hover:text-sky-300">
                      {t.task}
                    </div>
                    <span className="shrink-0 rounded-md border border-white/10 bg-slate-950/60 px-2 py-0.5 text-xs font-medium text-slate-300">
                      {t.modality}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-400">
                    {t.subhead}
                  </p>
                  <div className="mt-3 text-xs font-medium text-slate-500">
                    {t.models.length} models
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
