import React from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { Sparkles, Download } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { SmartDownloadButton } from "@/app/SmartDownloadButton";
import {
  miniAppEntries,
  type MiniAppEntry,
  type MiniAppOutputExample
} from "@/data/miniApps";

const BASE_URL = "https://nodetool.ai";

export const metadata: Metadata = {
  title: "AI Mini Apps — NodeTool",
  description:
    "Ready-to-use AI mini apps built with NodeTool's app builder: fill in a field, press Run, and get your result. Each one is powered by a visual workflow you can open and change.",
  alternates: { canonical: `${BASE_URL}/apps` },
  openGraph: {
    title: "AI Mini Apps — NodeTool",
    description:
      "Ready-to-use AI mini apps built with NodeTool's app builder: fill in a field, press Run, and get your result. Each one is powered by a visual workflow you can open and change.",
    url: `${BASE_URL}/apps`,
    type: "website",
  },
};

function resultPreview(entry: MiniAppEntry): MiniAppOutputExample | undefined {
  return (
    entry.outputExamples.find((output) => output.kind === "image") ??
    entry.outputExamples.find((output) => output.kind === "video") ??
    entry.outputExamples.find(
      (output) => output.kind === "text" || output.kind === "data"
    ) ??
    entry.outputExamples.find((output) => output.kind === "audio")
  );
}

function ResultPreview({
  output,
  name
}: {
  output: MiniAppOutputExample;
  name: string;
}) {
  return (
    <div
      data-testid="mini-app-result"
      className="border-b border-emerald-500/20 bg-slate-950/70"
    >
      <div className="flex items-center justify-between px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
        <span>Result</span>
        <span>{output.label}</span>
      </div>
      {output.kind === "image" ? (
        <Image
          src={output.path}
          alt={`${name}: ${output.label}`}
          width={980}
          height={700}
          className="aspect-video w-full object-cover"
        />
      ) : null}
      {output.kind === "video" ? (
        <video
          aria-label={`${name}: ${output.label}`}
          src={output.path}
          muted
          playsInline
          autoPlay
          loop
          preload="metadata"
          className="aspect-video w-full object-cover"
        />
      ) : null}
      {output.kind === "text" || output.kind === "data" ? (
        <pre className="line-clamp-5 max-h-36 overflow-hidden whitespace-pre-wrap px-4 pb-4 text-xs leading-relaxed text-slate-300">
          {output.excerpt || "Output available on the app page."}
        </pre>
      ) : null}
      {output.kind === "audio" ? (
        <div className="px-4 pb-4 text-sm text-slate-300">
          Audio output available
        </div>
      ) : null}
    </div>
  );
}

function AppCard({ entry }: { entry: MiniAppEntry }) {
  const output = resultPreview(entry);
  return (
    <a
      href={entry.route}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 transition-all hover:border-sky-500/40 hover:bg-slate-900/70"
    >
      {entry.screenshot && !output ? (
        <div className="relative aspect-[16/10] overflow-hidden border-b border-white/5 bg-[#16161c]">
          <Image
            src={entry.screenshot}
            alt={`${entry.name} mini app`}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      ) : null}
      {output ? <ResultPreview output={output} name={entry.name} /> : null}
      <div className="flex flex-1 flex-col p-5">
        <div className="font-semibold text-white">{entry.heading}</div>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-400">
          {entry.tagline || entry.summary}
        </p>
        <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400">
          <Sparkles className="h-3.5 w-3.5" />
          Try the app
        </div>
      </div>
    </a>
  );
}

export default function AppsHub() {
  const entries = [...miniAppEntries].sort(
    (a, b) =>
      Number(b.featured) - Number(a.featured) ||
      Number(b.indexable) - Number(a.indexable) ||
      a.name.localeCompare(b.name),
  );

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "NodeTool AI mini apps",
    itemListElement: entries.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: e.name,
      url: `${BASE_URL}${e.route}`,
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040408] text-white">
      <SiteHeader />
      <JsonLd data={itemListLd} />
      <div className="relative pt-28">
        <section className="relative pb-12 pt-10">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-300">
              Mini Apps
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              AI mini apps anyone can use
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
              A mini app is a simple screen with a few fields and a Run button.
              Each one comes with NodeTool and is powered by real workflows, which
              you can open on the canvas whenever you want to see how they work.
            </p>
            <div className="mt-8">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(56,189,248,0.6)] transition-all hover:bg-sky-400"
              />
            </div>
          </div>
        </section>

        <section className="relative pb-24">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => (
                <AppCard key={entry.slug} entry={entry} />
              ))}
            </div>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
