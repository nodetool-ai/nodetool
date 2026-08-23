import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Minus, Download, ArrowRight } from "lucide-react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import JsonLd from "../../../components/JsonLd";
import ComparisonMesh from "../../../components/ComparisonMesh";
import FaqSection from "../../../components/FaqSection";
import { breadcrumbSchema, itemListSchema } from "../../../lib/jsonld";
import { SmartDownloadButton } from "../../SmartDownloadButton";
import {
  competitors,
  getCompetitor,
  alternativesFor,
  shortAnswer,
  THEMES,
  type FeatureRow,
} from "../../../data/competitorEntries";
import { yearToken } from "../../../data/types";

export function generateStaticParams() {
  return competitors.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) return {};
  const title = c.seo?.title ?? `${c.name} alternatives (${yearToken()}) — why teams choose NodeTool`;
  const description =
    c.seo?.description ??
    `${c.limitation} Compare NodeTool with other ${c.category.toLowerCase()} alternatives: open source, run with your own keys, one canvas for image, video, audio, and text.`;
  return {
    title,
    description,
    alternates: { canonical: `/alternatives/${c.slug}` },
    openGraph: {
      title,
      description,
      url: `https://nodetool.ai/alternatives/${c.slug}`,
      type: "website",
    },
  };
}

function Cell({ value }: { value: string | boolean }) {
  if (value === true)
    return <Check className="mx-auto h-5 w-5 text-emerald-400" aria-label="Yes" />;
  if (value === false)
    return <Minus className="mx-auto h-5 w-5 text-slate-600" aria-label="No" />;
  return <span className="text-sm text-slate-300">{value}</span>;
}

export default async function AlternativesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) notFound();

  const theme = THEMES[c.theme];
  const tools = alternativesFor(c.slug);
  const rows: FeatureRow[] = c.rows;
  // Most competitor bullets are real capabilities, so they read as checks. Only
  // the records that opt into "negative" (the credit/lock-in framings) show a
  // minus. Carried over with the at-a-glance cards from the retired /vs page.
  const CompetitorBulletIcon =
    c.competitorBulletTone === "negative" ? Minus : Check;
  const competitorBulletClass =
    c.competitorBulletTone === "negative"
      ? "mt-0.5 h-4 w-4 shrink-0 text-slate-600"
      : "mt-0.5 h-4 w-4 shrink-0 text-emerald-400";

  const breadcrumb = breadcrumbSchema([
    { name: `${c.name} alternatives`, url: `/alternatives/${c.slug}` },
  ]);

  const itemList = itemListSchema(
    `${c.name} alternatives`,
    tools.map((t) => ({ name: t.name, ...(t.href ? { url: t.href } : {}) }))
  );

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={breadcrumb} />
      <JsonLd data={itemList} />

      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className={`absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full ${theme.glowA} blur-[120px]`}
        />
        <div
          className={`absolute top-1/2 -right-24 h-[24rem] w-[24rem] rounded-full ${theme.glowB} blur-[120px]`}
        />
      </div>

      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        {/* Hero + limitation intro */}
        <section aria-labelledby="alt-title" className="mx-auto max-w-3xl px-6 text-center">
          <span
            className={`inline-flex items-center gap-2 rounded-full border ${theme.chip} px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]`}
          >
            {c.name} alternatives
          </span>
          <h1
            id="alt-title"
            className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
          >
            Looking for a {c.name} alternative?
          </h1>
          {/* Direct answer first — the paragraph an answer engine can lift. */}
          <p className="mt-5 text-lg leading-relaxed text-white">
            {shortAnswer(c)}
          </p>
          <p className="mt-4 leading-relaxed text-slate-400">
            {c.limitation} If that is what brought you here, these are the
            alternatives worth weighing, and why teams pick NodeTool: an
            open-source canvas for image, video, audio, and text that runs on
            your own keys.
          </p>
        </section>

        {/* Tool list */}
        <section
          aria-labelledby="alt-list-title"
          className="mx-auto mt-16 max-w-3xl px-6"
        >
          <h2
            id="alt-list-title"
            className="mb-6 text-2xl font-semibold tracking-tight text-white"
          >
            What are the best {c.name} alternatives?
          </h2>
          <ul className="space-y-4">
            {tools.map((t) => (
              <li
                key={t.name}
                className={`rounded-2xl border p-6 ${
                  t.isNodetool
                    ? "border-emerald-500/30 bg-emerald-500/5 ring-1 ring-emerald-500/10"
                    : "border-slate-800/70 bg-slate-900/40"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white">
                    {t.name}
                    {t.isNodetool && (
                      <span className="ml-2 align-middle text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                        Recommended
                      </span>
                    )}
                  </h3>
                  {t.href && (
                    <a
                      href={t.href}
                      className="inline-flex shrink-0 items-center gap-1 text-sm text-slate-300 transition-colors hover:text-white focus-ring rounded"
                    >
                      Compare <ArrowRight className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {t.note}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* At a glance — ported from the retired /vs page so the head-to-head
            copy still has a home. */}
        <section aria-labelledby="glance-title" className="mx-auto mt-16 max-w-5xl px-6">
          <h2
            id="glance-title"
            className="mb-6 text-center text-2xl font-semibold tracking-tight text-white"
          >
            NodeTool vs {c.name} at a glance
          </h2>
          <p className="mx-auto mb-8 max-w-3xl text-center leading-relaxed text-slate-400">
            {c.heroParagraph}
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 ring-1 ring-white/5 backdrop-blur-md">
              <h3 className="text-xl font-semibold text-white">{c.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{c.competitorTagline}</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {c.competitorBullets.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CompetitorBulletIcon className={competitorBulletClass} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 ring-1 ring-white/5 backdrop-blur-md">
              <h3 className="text-xl font-semibold text-white">NodeTool</h3>
              <p className="mt-1 text-sm text-slate-400">{c.nodetoolTagline}</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {c.nodetoolBullets.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Feature table: NodeTool vs the tool people are leaving */}
        <section aria-label="Compare" className="mx-auto mt-16 max-w-5xl px-6">
          <h2 className="mb-6 text-center text-2xl font-semibold tracking-tight text-white">
            NodeTool vs {c.name}, feature by feature
          </h2>
          <div className="overflow-hidden rounded-2xl border border-slate-800/70 ring-1 ring-white/5">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-900/60 text-sm">
                  <th className="px-5 py-4 font-medium text-slate-400">Feature</th>
                  <th className="px-5 py-4 text-center font-semibold text-white">{c.name}</th>
                  <th className="px-5 py-4 text-center font-semibold text-white">NodeTool</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.label}
                    className={i % 2 ? "bg-slate-950/40" : "bg-slate-900/20"}
                  >
                    <td className="px-5 py-4 text-sm text-slate-300">{row.label}</td>
                    <td className="px-5 py-4 text-center"><Cell value={row.competitor} /></td>
                    <td className="px-5 py-4 text-center"><Cell value={row.nodetool} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Explainer — also ported from the retired /vs page. */}
        <section aria-labelledby="explainer-title" className="mx-auto mt-16 max-w-3xl px-6">
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-8 md:p-10">
            <h2
              id="explainer-title"
              className="text-2xl font-semibold tracking-tight text-white"
            >
              {c.explainerHeading}
            </h2>
            <p className="mt-4 leading-relaxed text-slate-300">
              {c.explainerParagraph}
            </p>
          </div>
        </section>

        {/* Visible FAQ — and the FAQPage schema, built from these same rows. */}
        <FaqSection items={c.faq} />

        {/* Sibling comparison mesh */}
        <ComparisonMesh currentSlug={c.slug} />

        {/* Closing CTA */}
        <section className="mx-auto my-24 max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            {c.ctaHeading}
          </h2>
          <p className="mt-4 text-lg text-slate-300">{c.ctaParagraph}</p>
          <div className="mt-8 flex justify-center">
            <SmartDownloadButton
              icon={<Download className="h-5 w-5" />}
              classNameOverride={`inline-flex items-center justify-center gap-2 rounded-xl ${theme.button} px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-all focus-ring`}
            />
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
