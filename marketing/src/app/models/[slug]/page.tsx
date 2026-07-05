import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Download, ArrowRight, KeyRound } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import ShowcaseMedia from "@/components/models/ShowcaseMedia";
import { SmartDownloadButton } from "../../SmartDownloadButton";
import {
  modelBySlug,
  modelEntries,
  modalityLabel,
  type Accent,
  type ModelEntry,
} from "@/data/modelEntries";
import {
  comparisonBySlug,
  modelComparisonEntries,
  type ModelComparison,
} from "@/data/modelComparisonEntries";
import { providerDisplay } from "@/data/providerDisplay";
import {
  heroShowcaseForModel,
  promptExamplesForModel,
  duelPairsForComparison,
} from "@/data/modelShowcase";

const BASE_URL = "https://nodetool.ai";

export const dynamicParams = false;

export function generateStaticParams() {
  return [
    ...modelEntries.map((m) => ({ slug: m.slug })),
    ...modelComparisonEntries.map((c) => ({ slug: c.slug })),
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = modelBySlug(slug) ?? comparisonBySlug(slug);
  if (!entry) return {};
  const route = `/models/${slug}`;
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

function DownloadCta({
  heading,
  sub,
}: {
  heading: string;
  sub: string;
}) {
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

export default async function ModelRoutePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const model = modelBySlug(slug);
  if (model) return <ModelPage model={model} />;
  const comparison = comparisonBySlug(slug);
  if (comparison) return <ComparisonPage comparison={comparison} />;
  notFound();
}

// ---------------------------------------------------------------------------
// Single-model page
// ---------------------------------------------------------------------------

function ModelPage({ model }: { model: ModelEntry }) {
  const accent = ACCENT[model.accent];
  const heroes = heroShowcaseForModel(model.slug, 3);
  const examples = promptExamplesForModel(model.slug, 3, 6);

  const softwareLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `${model.name} in NodeTool`,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "macOS, Windows, Linux, Web",
    description: model.description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    isPartOf: {
      "@type": "SoftwareApplication",
      name: "NodeTool",
      url: BASE_URL,
    },
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: model.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={softwareLd} />
      <JsonLd data={faqLd} />
      <BackgroundGlow accent={model.accent} />
      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        {/* Hero */}
        <section aria-labelledby="model-title" className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${accent.badge}`}
            >
              {modalityLabel(model.modality)} · {model.vendor}
            </span>
            <h1
              id="model-title"
              className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
            >
              {model.name} in a visual AI workflow
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-slate-300">
              {model.tagline}
            </p>
          </div>

          {/* Showcase heroes or thumbnail fallback — never an empty section */}
          <div className="mt-12">
            {heroes.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {heroes.map((h, i) => (
                  <figure
                    key={h.id}
                    className="overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/50 ring-1 ring-white/5"
                  >
                    <ShowcaseMedia
                      entry={h}
                      priority={i === 0}
                      className="aspect-[3/4] w-full object-cover"
                    />
                    <figcaption className="line-clamp-2 px-4 py-3 text-xs text-slate-400">
                      {h.prompt}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/50 ring-1 ring-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/preview.png"
                  alt={`${model.name} in the NodeTool canvas`}
                  className="w-full object-cover"
                />
                <p className="px-5 py-4 text-center text-sm text-slate-400">
                  Fresh {model.name} examples are on the way. Meanwhile, here&apos;s
                  the NodeTool canvas where you&apos;ll run it.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Blurb */}
        <section aria-label="About" className="mx-auto mt-20 max-w-3xl px-6">
          <div className="space-y-5 text-lg leading-relaxed text-slate-300">
            {model.blurb.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>

        {/* Capability facts */}
        <section aria-label="Capabilities" className="mx-auto mt-16 max-w-4xl px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {model.facts.map((f) => (
              <div
                key={f.label}
                className="rounded-xl border border-slate-800/70 bg-slate-900/40 px-5 py-4"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {f.label}
                </div>
                <div className="mt-1 text-sm text-slate-200">{f.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Provider table */}
        <ProviderTable model={model} />

        {/* Featured template */}
        {model.templateSlug && (
          <section aria-label="Template" className="mx-auto mt-20 max-w-3xl px-6">
            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-8 md:p-10">
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                Use {model.name} in a ready-made workflow
              </h2>
              <p className="mt-4 leading-relaxed text-slate-300">
                Drop {model.name} into a template and you have a repeatable
                pipeline — prompt in, asset out — that you can edit, re-run, and
                share as a single file. Open it in NodeTool and swap in your own
                key.
              </p>
              <Link
                href={`/templates/${model.templateSlug}`}
                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-ring"
              >
                Open the template
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        )}

        {/* Prompt examples */}
        {examples.length > 0 && (
          <section
            aria-label="Prompt examples"
            className="mx-auto mt-20 max-w-5xl px-6"
          >
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              More {model.name} prompts
            </h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {examples.map((e) => (
                <figure
                  key={e.id}
                  className="overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/50 ring-1 ring-white/5"
                >
                  <ShowcaseMedia
                    entry={e}
                    className="aspect-[3/4] w-full object-cover"
                  />
                  <figcaption className="line-clamp-2 px-4 py-3 text-xs text-slate-400">
                    {e.prompt}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* FAQ */}
        <FaqSection faq={model.faq} />

        <DownloadCta
          heading={`Run ${model.name} your way.`}
          sub="Download NodeTool Studio and build across image, video, audio, and text with your own keys."
        />
      </div>

      <SiteFooter />
    </main>
  );
}

function ProviderTable({ model }: { model: ModelEntry }) {
  return (
    <section aria-label="Providers" className="mx-auto mt-20 max-w-4xl px-6">
      <h2 className="text-2xl font-semibold tracking-tight text-white">
        Where to run {model.name}
      </h2>
      <p className="mt-3 max-w-2xl leading-relaxed text-slate-400">
        NodeTool is bring-your-own-key: you call {model.name} through a provider
        you already have access to and pay their list price — no credits, no
        markup. These providers serve {model.name} today.
      </p>

      {model.providers.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800/70 ring-1 ring-white/5">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-900/60 text-sm">
                <th className="px-5 py-4 font-medium text-slate-400">Provider</th>
                <th className="px-5 py-4 font-medium text-slate-400">
                  BYOK env var
                </th>
              </tr>
            </thead>
            <tbody>
              {model.providers.map((id, i) => {
                const p = providerDisplay(id);
                return (
                  <tr
                    key={id}
                    className={i % 2 ? "bg-slate-950/40" : "bg-slate-900/20"}
                  >
                    <td className="px-5 py-4 text-sm text-slate-200">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white"
                      >
                        {p.name}
                      </a>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <KeyRound className="h-3.5 w-3.5" />
                        {p.byokEnv}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-800/70 bg-slate-900/40 px-5 py-6 text-sm text-slate-400">
          Provider coverage for {model.name} is being wired up. NodeTool is
          bring-your-own-key, so you&apos;ll call it at the serving provider&apos;s
          list price.
        </div>
      )}
    </section>
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

// ---------------------------------------------------------------------------
// Model-vs-model comparison page
// ---------------------------------------------------------------------------

function ComparisonPage({ comparison }: { comparison: ModelComparison }) {
  const accent = ACCENT[comparison.accent];
  const pairs = duelPairsForComparison(comparison.a, comparison.b);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Models",
        item: `${BASE_URL}/models`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `${comparison.aName} vs ${comparison.bName}`,
        item: `${BASE_URL}${comparison.route}`,
      },
    ],
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: comparison.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={faqLd} />
      <BackgroundGlow accent={comparison.accent} />
      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        {/* Hero */}
        <section
          aria-labelledby="compare-title"
          className="mx-auto max-w-3xl px-6 text-center"
        >
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${accent.badge}`}
          >
            Same prompt · side by side
          </span>
          <h1
            id="compare-title"
            className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
          >
            {comparison.aName} vs {comparison.bName}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            {comparison.description}
          </p>
        </section>

        {/* Same-prompt duel pairs */}
        <section aria-label="Side by side" className="mx-auto mt-16 max-w-5xl px-6">
          {pairs.length > 0 ? (
            <div className="space-y-10">
              {pairs.map((pair) => (
                <figure
                  key={pair.duelId}
                  className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-5 ring-1 ring-white/5"
                >
                  <figcaption className="mb-4 text-sm text-slate-400">
                    <span className="text-slate-500">Prompt:</span> {pair.prompt}
                  </figcaption>
                  <div className="grid gap-5 md:grid-cols-2">
                    {[
                      { side: pair.first, name: comparison.aName },
                      { side: pair.second, name: comparison.bName },
                    ].map(({ side, name }) => (
                      <div
                        key={side.id}
                        className="overflow-hidden rounded-xl border border-slate-800/70 bg-slate-900/50"
                      >
                        <div className="border-b border-slate-800/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          {name}
                        </div>
                        <ShowcaseMedia
                          entry={side}
                          className="aspect-[3/4] w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </figure>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800/70 bg-slate-900/40 px-6 py-8 text-center text-sm text-slate-400">
              Same-prompt {comparison.aName} vs {comparison.bName} pairs are
              generating. Run the duel yourself in NodeTool: one prompt, both
              models, outputs side by side.
            </div>
          )}
        </section>

        {/* Verdict */}
        <section aria-label="Verdict" className="mx-auto mt-20 max-w-3xl px-6">
          <div className="space-y-5 text-lg leading-relaxed text-slate-300">
            {comparison.verdict.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/models/${comparison.a}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-ring"
            >
              {comparison.aName} details
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={`/models/${comparison.b}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-ring"
            >
              {comparison.bName} details
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <FaqSection faq={comparison.faq} />

        <DownloadCta
          heading="Run the duel yourself."
          sub="Download NodeTool and put any two models through the same prompt, side by side."
        />
      </div>

      <SiteFooter />
    </main>
  );
}
