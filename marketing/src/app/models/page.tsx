import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import {
  modelEntries,
  modalityLabel,
  entries as modelPageEntries,
  type Modality,
} from "@/data/modelEntries";
import { modelComparisonEntries } from "@/data/modelComparisonEntries";

const BASE_URL = "https://nodetool.ai";

const hub = modelPageEntries[0];

export const metadata: Metadata = {
  title: hub.title,
  description: hub.description,
  alternates: { canonical: "/models" },
  openGraph: {
    title: hub.title,
    description: hub.description,
    url: `${BASE_URL}/models`,
    type: "website",
  },
};

const VIDEO_MODALITIES: Modality[] = ["text-to-video", "image-to-video"];

export default function ModelsHubPage() {
  const video = modelEntries.filter((m) =>
    VIDEO_MODALITIES.includes(m.modality)
  );
  const image = modelEntries.filter(
    (m) => !VIDEO_MODALITIES.includes(m.modality)
  );

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: modelEntries.map((m, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: m.name,
      url: `${BASE_URL}${m.route}`,
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={itemListLd} />
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-[120px]" />
        <div className="absolute top-1/2 -right-24 h-[24rem] w-[24rem] rounded-full bg-violet-500/10 blur-[120px]" />
      </div>
      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        <section className="mx-auto max-w-3xl px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
            Model directory
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl">
            Every top model, as a node
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            Image and video&apos;s best models — run each in a visual AI
            workflow, chain them, and put any two through the same prompt.
            Bring-your-own-key at provider prices.
          </p>
        </section>

        <ModelGroup title="Video models" models={video} />
        <ModelGroup title="Image models" models={image} />

        {/* Comparisons */}
        <section
          aria-label="Comparisons"
          className="mx-auto mt-20 max-w-5xl px-6"
        >
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Head-to-head
          </h2>
          <p className="mt-3 max-w-2xl text-slate-400">
            Same prompt, two models, side by side.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {modelComparisonEntries.map((c) => (
              <Link
                key={c.slug}
                href={c.route}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-800/70 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-slate-800 focus-ring"
              >
                {c.aName} vs {c.bName}
                <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
              </Link>
            ))}
          </div>
        </section>

        <div className="h-24" />
      </div>

      <SiteFooter />
    </main>
  );
}

function ModelGroup({
  title,
  models,
}: {
  title: string;
  models: typeof modelEntries;
}) {
  return (
    <section aria-label={title} className="mx-auto mt-16 max-w-5xl px-6">
      <h2 className="text-2xl font-semibold tracking-tight text-white">
        {title}
      </h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((m) => (
          <Link
            key={m.slug}
            href={m.route}
            className="group flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/50 p-6 ring-1 ring-white/5 transition-colors hover:bg-slate-800/50 focus-ring"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {modalityLabel(m.modality)} · {m.vendor}
            </div>
            <div className="mt-2 text-lg font-semibold text-white">
              {m.name}
            </div>
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-400">
              {m.tagline}
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 group-hover:text-white">
              View model
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
