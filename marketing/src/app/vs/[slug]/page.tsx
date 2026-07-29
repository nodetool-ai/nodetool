import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Minus, Download } from "lucide-react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import JsonLd from "../../../components/JsonLd";
import ComparisonMesh from "../../../components/ComparisonMesh";
import { SmartDownloadButton } from "../../SmartDownloadButton";
import {
  competitors,
  getCompetitor,
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
  const title = `${c.vsTitle} (${yearToken()})`;
  return {
    title,
    description: c.vsDescription,
    alternates: { canonical: `/vs/${c.slug}` },
    openGraph: {
      title: c.vsOgTitle,
      description: c.vsOgDescription,
      url: `https://nodetool.ai/vs/${c.slug}`,
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

export default async function VsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) notFound();

  const theme = THEMES[c.theme];
  const CompetitorBulletIcon =
    c.competitorBulletTone === "negative" ? Minus : Check;
  const competitorBulletClass =
    c.competitorBulletTone === "negative"
      ? "mt-0.5 h-4 w-4 shrink-0 text-slate-600"
      : "mt-0.5 h-4 w-4 shrink-0 text-emerald-400";

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://nodetool.ai" },
      {
        "@type": "ListItem",
        position: 2,
        name: `NodeTool vs ${c.name}`,
        item: `https://nodetool.ai/vs/${c.slug}`,
      },
    ],
  };

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: c.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  const rows: FeatureRow[] = c.rows;

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={breadcrumb} />
      <JsonLd data={faq} />

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
        {/* Hero */}
        <section aria-labelledby="vs-title" className="mx-auto max-w-3xl px-6 text-center">
          <span
            className={`inline-flex items-center gap-2 rounded-full border ${theme.chip} px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]`}
          >
            NodeTool vs {c.name}
          </span>
          <h1
            id="vs-title"
            className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
          >
            {c.heroHeading}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            {c.heroParagraph}
          </p>
        </section>

        {/* Comparison cards */}
        <section aria-label="At a glance" className="mx-auto mt-16 max-w-5xl px-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Competitor */}
            <div className="relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 ring-1 ring-white/5 backdrop-blur-md">
              <h2 className="text-xl font-semibold text-white">{c.name}</h2>
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

            {/* NodeTool */}
            <div className="relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 ring-1 ring-white/5 backdrop-blur-md">
              <h2 className="text-xl font-semibold text-white">NodeTool</h2>
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

        {/* Comparison table */}
        <section aria-label="Compare" className="mx-auto mt-16 max-w-5xl px-6">
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

        {/* Explainer */}
        <section aria-labelledby="explainer-title" className="mx-auto mt-16 max-w-3xl px-6">
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-8 md:p-10">
            <h2 id="explainer-title" className="text-2xl font-semibold tracking-tight text-white">
              {c.explainerHeading}
            </h2>
            <p className="mt-4 leading-relaxed text-slate-300">
              {c.explainerParagraph}
            </p>
          </div>
        </section>

        {/* Sibling comparison mesh */}
        <ComparisonMesh currentSlug={c.slug} basePath="/vs" />

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
