import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, KeyRound } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import {
  providerEntries,
  providersByCategory,
  entries as providerPageEntries,
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  KIND_ORDER,
  KIND_LABEL,
  type ProviderEntry,
} from "@/data/providerEntries";

const BASE_URL = "https://nodetool.ai";

const hub = providerPageEntries[0];

export const metadata: Metadata = {
  title: hub.title,
  description: hub.description,
  alternates: { canonical: "/providers" },
  openGraph: {
    title: hub.title,
    description: hub.description,
    url: `${BASE_URL}/providers`,
    type: "website",
  },
};

export default function ProvidersHubPage() {
  const aggregatorModels = providersByCategory("aggregator").reduce(
    (a, p) => a + (p.catalog?.total ?? 0),
    0
  );

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: providerEntries.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
      url: `${BASE_URL}${p.route}`,
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={itemListLd} />
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-violet-500/15 blur-[120px]" />
        <div className="absolute top-1/2 -right-24 h-[24rem] w-[24rem] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>
      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        <section className="mx-auto max-w-3xl px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">
            Model providers
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl">
            Every provider, bring your own key
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            NodeTool integrates {providerEntries.length} model providers — media
            aggregators serving {aggregatorModels.toLocaleString()}+ image,
            video, audio, and 3D models, plus direct LLM and voice APIs. Every
            one is a node on the canvas, called with your own key at the
            provider&apos;s list price — no credits, no markup.
          </p>
        </section>

        {CATEGORY_ORDER.map((cat) => {
          const providers = providersByCategory(cat);
          if (providers.length === 0) return null;
          return (
            <section
              key={cat}
              aria-label={CATEGORY_LABEL[cat]}
              className="mx-auto mt-16 max-w-5xl px-6"
            >
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                {CATEGORY_LABEL[cat]}
              </h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {providers.map((p) => (
                  <ProviderCard key={p.slug} provider={p} />
                ))}
              </div>
            </section>
          );
        })}

        <div className="h-24" />
      </div>

      <SiteFooter />
    </main>
  );
}

function ProviderLogo({
  provider,
  size = 44,
}: {
  provider: ProviderEntry;
  size?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-700/60 bg-white/5 p-1.5"
      style={{ width: size, height: size }}
    >
      <Image
        src={provider.logo}
        alt={`${provider.name} logo`}
        width={size}
        height={size}
        className="h-full w-full object-contain"
        unoptimized
      />
    </span>
  );
}

function ProviderCard({ provider: p }: { provider: ProviderEntry }) {
  const kinds = p.catalog
    ? KIND_ORDER.filter((k) => p.catalog!.counts[k])
    : [];
  return (
    <Link
      href={p.route}
      className="group flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/50 p-6 ring-1 ring-white/5 transition-colors hover:bg-slate-800/50 focus-ring"
    >
      <div className="flex items-start gap-4">
        <ProviderLogo provider={p} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-lg font-semibold text-white">{p.name}</div>
            {p.catalog ? (
              <div className="shrink-0 text-sm font-medium text-slate-400">
                {p.catalog.total.toLocaleString()} models
              </div>
            ) : (
              <div className="shrink-0 text-xs font-medium text-slate-500">
                {p.capabilities?.[0]}
              </div>
            )}
          </div>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-400">
            {p.tagline}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {p.catalog
          ? kinds.map((k) => (
              <span
                key={k}
                className="rounded-full border border-slate-700/70 bg-slate-800/40 px-2.5 py-1 text-[11px] font-medium text-slate-300"
              >
                {KIND_LABEL[k]} · {p.catalog!.counts[k]}
              </span>
            ))
          : p.strengths.slice(0, 4).map((s) => (
              <span
                key={s}
                className="rounded-full border border-slate-700/70 bg-slate-800/40 px-2.5 py-1 text-[11px] font-medium text-slate-300"
              >
                {s}
              </span>
            ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-500">
          <KeyRound className="h-3.5 w-3.5" />
          {p.byokEnv}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 group-hover:text-white">
          View provider
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
