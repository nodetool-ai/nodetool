import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import FaqSection from "../../../components/FaqSection";
import JsonLd from "../../../components/JsonLd";
import { breadcrumbSchema } from "@/lib/jsonld";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";
import {
  COMPARISON_DESCRIPTION,
  COMPARISON_FAQ,
  COMPARISON_LEAD,
  COMPARISON_ROWS,
  COMPARISON_TITLE,
  ENGINES,
  ENGINE_SOURCES,
  NODETOOL_DIFFERENCES,
  NODETOOL_GAPS,
  RECOMMENDATIONS,
  SOURCES_CHECKED,
} from "@/data/gameEngineComparison";

const PAGE_TITLE = `${COMPARISON_TITLE} | NodeTool`;

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: COMPARISON_DESCRIPTION,
  alternates: { canonical: "/gamedev/ai-game-engines" },
  openGraph: { title: PAGE_TITLE, description: COMPARISON_DESCRIPTION, url: "https://nodetool.ai/gamedev/ai-game-engines", siteName: "NodeTool", type: "article", images: DEFAULT_OG_IMAGES },
  twitter: { card: "summary_large_image", title: PAGE_TITLE, description: COMPARISON_DESCRIPTION },
};

const sectionTitle = "text-3xl font-semibold tracking-tight md:text-4xl";
const bodyText = "leading-relaxed text-slate-300";

export default function AiGameEnginesPage() {
  return (
    <>
      <SiteHeader />
      <main id="content" className="bg-slate-950 text-slate-100">
        <article className="mx-auto max-w-7xl px-6 pb-24 pt-36 lg:px-8">
          <header className="max-w-3xl">
            <p className="mb-5 text-base font-medium text-cyan-200"><a href="/gamedev" className="focus-ring rounded hover:text-cyan-100">Game development</a></p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-6xl">AI game engines compared</h1>
            <p className={`mt-6 text-lg ${bodyText}`}>{COMPARISON_LEAD}</p>
            <p className="mt-4 text-sm text-slate-400">Facts about other products come from their own pages, checked on {SOURCES_CHECKED}. Sources are listed at the end.</p>
          </header>

          <section aria-labelledby="table-title" className="mt-16">
            <h2 id="table-title" className={sectionTitle}>Side by side</h2>
            <div className="mt-6 overflow-x-auto rounded-xl border border-slate-700">
              <table className="w-full min-w-[64rem] text-left text-sm">
                <caption className="sr-only">How six game engines and tools compare for AI agent game development</caption>
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-900 text-slate-100">
                    <th scope="col" className="p-4 font-medium"><span className="sr-only">Question</span></th>
                    {ENGINES.map((engine) => <th key={engine.key} scope="col" className="p-4 font-medium">{engine.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.label} className="border-b border-slate-800 align-top last:border-b-0">
                      <th scope="row" className="p-4 font-medium text-slate-100">{row.label}</th>
                      {ENGINES.map((engine) => <td key={engine.key} className="p-4 text-slate-300">{row.cells[engine.key]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="pick-title" className="mt-24 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="pick-title" className={sectionTitle}>Which one to pick</h2>
            <dl className="space-y-6">
              {RECOMMENDATIONS.map((rec) => (
                <div key={rec.name}>
                  <dt className="text-xl font-medium">{rec.name}</dt>
                  <dd className={`mt-1 ${bodyText}`}>{rec.when}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="differs-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-2">
            <div>
              <h2 id="differs-title" className="text-2xl font-semibold tracking-tight">Where NodeTool differs</h2>
              <ul className="mt-5 list-disc space-y-3 pl-5 text-slate-300">
                {NODETOOL_DIFFERENCES.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Where NodeTool is weaker</h2>
              <ul className="mt-5 list-disc space-y-3 pl-5 text-slate-300">
                {NODETOOL_GAPS.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <a href="/gamedev" className="focus-ring mt-6 inline-flex items-center gap-1 rounded font-medium text-cyan-200 hover:text-cyan-100">Play games made in NodeTool<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
            </div>
          </section>

          <FaqSection items={COMPARISON_FAQ} heading="Questions" className="mt-24 max-w-3xl" id="engines-faq" />

          <section aria-labelledby="sources-title" className="mt-16 max-w-3xl">
            <h2 id="sources-title" className="text-xl font-semibold">Sources</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {ENGINE_SOURCES.map((source) => (
                <li key={source.href}><a href={source.href} rel="noreferrer" className="focus-ring rounded text-cyan-200 underline underline-offset-2 hover:text-cyan-100">{source.label}</a></li>
              ))}
            </ul>
          </section>
        </article>
        <JsonLd data={breadcrumbSchema([{ name: "Game development", url: "/gamedev" }, { name: "AI game engines compared", url: "/gamedev/ai-game-engines" }])} />
      </main>
      <SiteFooter />
    </>
  );
}
