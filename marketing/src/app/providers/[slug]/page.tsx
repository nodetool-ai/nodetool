import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Download, ArrowRight, KeyRound, ExternalLink } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { SmartDownloadButton } from "../../SmartDownloadButton";
import {
  providerBySlug,
  providerEntries,
  KIND_ORDER,
  KIND_LABEL,
  type Accent,
  type ProviderEntry,
} from "@/data/providerEntries";
import type { ProviderModelKind } from "@/data/providerCatalog.generated";

const BASE_URL = "https://nodetool.ai";

export const dynamicParams = false;

export function generateStaticParams() {
  return providerEntries.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = providerBySlug(slug);
  if (!entry) return {};
  const route = `/providers/${slug}`;
  return {
    title: entry.title,
    description: entry.description,
    alternates: { canonical: route },
    openGraph: {
      title: entry.title,
      description: entry.description,
      url: `${BASE_URL}${route}`,
      type: "website",
    },
  };
}

const ACCENT: Record<Accent, { glowA: string; glowB: string; badge: string }> = {
  blue: {
    glowA: "bg-blue-500/15",
    glowB: "bg-fuchsia-500/10",
    badge: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  },
  violet: {
    glowA: "bg-violet-500/15",
    glowB: "bg-fuchsia-500/10",
    badge: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  },
  emerald: {
    glowA: "bg-emerald-500/15",
    glowB: "bg-cyan-500/10",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  rose: {
    glowA: "bg-rose-500/15",
    glowB: "bg-amber-500/10",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  },
  amber: {
    glowA: "bg-amber-500/15",
    glowB: "bg-rose-500/10",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  cyan: {
    glowA: "bg-cyan-500/15",
    glowB: "bg-blue-500/10",
    badge: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  },
};

function BackgroundGlow({ accent }: { accent: Accent }) {
  const a = ACCENT[accent];
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className={`absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full ${a.glowA} blur-[120px]`}
      />
      <div
        className={`absolute top-1/2 -right-24 h-[24rem] w-[24rem] rounded-full ${a.glowB} blur-[120px]`}
      />
    </div>
  );
}

export default async function ProviderRoutePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = providerBySlug(slug);
  if (!entry) notFound();
  return <ProviderPage entry={entry} />;
}

function ProviderPage({ entry }: { entry: ProviderEntry }) {
  const accent = ACCENT[entry.accent];
  const catalog = entry.catalog;
  const kinds = catalog ? KIND_ORDER.filter((k) => catalog.counts[k]) : [];

  const softwareLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `${entry.name} in NodeTool`,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "macOS, Windows, Linux, Web",
    description: entry.description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    isPartOf: {
      "@type": "SoftwareApplication",
      name: "NodeTool",
      url: BASE_URL,
    },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Providers",
        item: `${BASE_URL}/providers`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: entry.name,
        item: `${BASE_URL}${entry.route}`,
      },
    ],
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entry.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={softwareLd} />
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={faqLd} />
      <BackgroundGlow accent={entry.accent} />
      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        {/* Hero */}
        <section
          aria-labelledby="provider-title"
          className="mx-auto max-w-4xl px-6 text-center"
        >
          <span className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-700/60 bg-white/5 p-3 shadow-lg shadow-black/30">
            <Image
              src={entry.logo}
              alt={`${entry.name} logo`}
              width={80}
              height={80}
              className="h-full w-full object-contain"
              unoptimized
            />
          </span>
          <span
            className={`mt-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${accent.badge}`}
          >
            Model provider · Bring your own key
          </span>
          <h1
            id="provider-title"
            className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
          >
            {entry.name} in a visual AI workflow
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-slate-300">
            {entry.tagline}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {entry.strengths.map((s) => (
              <span
                key={s}
                className="rounded-full border border-slate-700/70 bg-slate-800/40 px-3 py-1 text-xs font-medium text-slate-300"
              >
                {s}
              </span>
            ))}
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-800/40 px-3 py-1 text-xs font-medium text-slate-300 hover:text-white"
            >
              {entry.url.replace(/^https?:\/\//, "")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </section>

        {/* Stat tiles (aggregators) */}
        {catalog && (
          <section
            aria-label="Catalog stats"
            className="mx-auto mt-14 max-w-4xl px-6"
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile
                label="Models"
                value={catalog.total.toLocaleString()}
                highlight
              />
              {kinds.map((k) => (
                <StatTile
                  key={k}
                  label={KIND_LABEL[k]}
                  value={String(catalog.counts[k])}
                />
              ))}
            </div>
          </section>
        )}

        {/* Blurb */}
        <section aria-label="About" className="mx-auto mt-16 max-w-3xl px-6">
          <div className="space-y-5 text-lg leading-relaxed text-slate-300">
            {entry.blurb.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>

        {/* BYOK card */}
        <section
          aria-label="Bring your own key"
          className="mx-auto mt-14 max-w-3xl px-6"
        >
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-800/70 bg-slate-950/40 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Set your key in NodeTool
              </div>
              <div className="mt-2 inline-flex items-center gap-2 font-mono text-sm text-slate-200">
                <KeyRound className="h-4 w-4 text-slate-500" />
                {entry.byokEnv}
              </div>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-slate-400">
              Calls go straight to {entry.name} with your key at their list
              price — NodeTool never proxies or marks up the request.
            </p>
          </div>
        </section>

        {/* Capabilities (curated providers) */}
        {entry.capabilities && entry.capabilities.length > 0 && (
          <section
            aria-label="Capabilities"
            className="mx-auto mt-14 max-w-4xl px-6"
          >
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              What {entry.name} does in NodeTool
            </h2>
            <div className="mt-5 flex flex-wrap gap-2">
              {entry.capabilities.map((c) => (
                <span
                  key={c}
                  className="rounded-lg border border-slate-800/70 bg-slate-900/40 px-3 py-1.5 text-sm text-slate-300"
                >
                  {c}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Capability tags (aggregators) */}
        {catalog && catalog.topTags.length > 0 && (
          <section
            aria-label="Capabilities"
            className="mx-auto mt-14 max-w-4xl px-6"
          >
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              What you can build with {entry.name}
            </h2>
            <div className="mt-5 flex flex-wrap gap-2">
              {catalog.topTags.map((t) => (
                <span
                  key={t}
                  className="rounded-lg border border-slate-800/70 bg-slate-900/40 px-3 py-1.5 text-sm capitalize text-slate-300"
                >
                  {t}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Model highlights (curated providers) */}
        {entry.highlights && entry.highlights.length > 0 && (
          <section
            aria-label="Model highlights"
            className="mx-auto mt-20 max-w-5xl px-6"
          >
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Featured {entry.name} models
            </h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-slate-400">
              NodeTool queries {entry.name} for the exact models your key can
              access and exposes each as a node. These are the families you can
              build with.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {entry.highlights.map((m) => (
                <div
                  key={m.name}
                  className="flex flex-col rounded-xl border border-slate-800/70 bg-slate-900/40 p-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-white">{m.name}</div>
                    <span className="shrink-0 rounded-full border border-slate-700/70 bg-slate-800/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      {m.kind}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {m.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Model catalog (aggregators) */}
        {catalog && (
          <section
            aria-label="Supported models"
            className="mx-auto mt-20 max-w-5xl px-6"
          >
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Supported {entry.name} models
            </h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-slate-400">
              Each model below is its own node in NodeTool — the id is what{" "}
              {entry.name} serves it under. This list is generated from{" "}
              {entry.name}&apos;s node manifest, so it tracks what the provider
              actually ships.
            </p>
            <div className="mt-8 space-y-12">
              {kinds.map((kind) => (
                <ModelGroup
                  key={kind}
                  kind={kind}
                  entry={entry}
                  models={catalog.models.filter((m) => m.kind === kind)}
                  total={catalog.counts[kind] ?? 0}
                />
              ))}
            </div>
          </section>
        )}

        {/* FAQ */}
        <FaqSection faq={entry.faq} />

        {/* Related providers */}
        <section
          aria-label="Other providers"
          className="mx-auto mt-20 max-w-5xl px-6"
        >
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Other providers
          </h2>
          <div className="mt-6 flex flex-wrap gap-3">
            {providerEntries
              .filter((p) => p.slug !== entry.slug)
              .map((p) => (
                <Link
                  key={p.slug}
                  href={p.route}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-800/70 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-slate-800 focus-ring"
                >
                  <Image
                    src={p.logo}
                    alt=""
                    width={18}
                    height={18}
                    className="h-4 w-4 object-contain"
                    unoptimized
                  />
                  {p.name}
                  <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                </Link>
              ))}
          </div>
        </section>

        <DownloadCta
          heading={`Run ${entry.name} your way.`}
          sub="Download NodeTool Studio and build across image, video, audio, and text with your own keys."
        />
      </div>

      <SiteFooter />
    </main>
  );
}

function StatTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-4 text-center ${
        highlight
          ? "border-slate-700 bg-slate-900/60"
          : "border-slate-800/70 bg-slate-900/30"
      }`}
    >
      <div className="text-2xl font-bold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
    </div>
  );
}

function ModelGroup({
  kind,
  entry,
  models,
  total,
}: {
  kind: ProviderModelKind;
  entry: ProviderEntry;
  models: NonNullable<ProviderEntry["catalog"]>["models"];
  total: number;
}) {
  if (models.length === 0) return null;
  const more = total - models.length;
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <h3 className="text-lg font-semibold text-white">
          {KIND_LABEL[kind]} models
        </h3>
        <span className="text-sm text-slate-500">{total} total</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((m) => (
          <div
            key={m.id}
            className="flex flex-col rounded-xl border border-slate-800/70 bg-slate-900/40 p-4"
          >
            <div className="text-sm font-semibold text-white">{m.name}</div>
            <code className="mt-1 truncate font-mono text-[11px] text-slate-500">
              {m.id}
            </code>
            {m.desc && (
              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-400">
                {m.desc}
              </p>
            )}
          </div>
        ))}
      </div>
      {more > 0 && (
        <p className="mt-4 text-sm text-slate-500">
          + {more} more {KIND_LABEL[kind].toLowerCase()} model
          {more === 1 ? "" : "s"} available in {entry.name}.
        </p>
      )}
    </div>
  );
}

function FaqSection({ faq }: { faq: { q: string; a: string }[] }) {
  if (faq.length === 0) return null;
  return (
    <section aria-label="FAQ" className="mx-auto mt-20 max-w-3xl px-6">
      <h2 className="text-2xl font-semibold tracking-tight text-white">
        Frequently asked
      </h2>
      <dl className="mt-6 space-y-4">
        {faq.map((f) => (
          <div
            key={f.q}
            className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-6"
          >
            <dt className="font-semibold text-white">{f.q}</dt>
            <dd className="mt-2 leading-relaxed text-slate-300">{f.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DownloadCta({ heading, sub }: { heading: string; sub: string }) {
  return (
    <section className="mx-auto my-24 max-w-2xl px-6 text-center">
      <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
        {heading}
      </h2>
      <p className="mt-4 text-lg text-slate-300">{sub}</p>
      <div className="mt-8 flex justify-center">
        <SmartDownloadButton
          icon={<Download className="h-5 w-5" />}
          classNameOverride="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 focus-ring"
        />
      </div>
    </section>
  );
}
