import type { Metadata } from "next";
import { Check, Minus, Download } from "lucide-react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import JsonLd from "../../../components/JsonLd";
import { SmartDownloadButton } from "../../SmartDownloadButton";

export const metadata: Metadata = {
  title: "NodeTool vs Weavy — open source, BYOK, no credits",
  description:
    "Weavy and similar closed SaaS canvases lock you into credits and a curated model roster. NodeTool is open source (AGPL-3.0) and BYOK: every provider, your keys, provider prices, and you own your workflows and files. Cloud is just managed hosting of the same self-hostable code.",
  alternates: { canonical: "/vs/weavy" },
  openGraph: {
    title: "NodeTool vs Weavy — open source, BYOK, no credits",
    description:
      "No credits, no curated roster, no lock-in. NodeTool is open source and BYOK: every provider at provider prices, with workflows and files you own.",
    url: "https://nodetool.ai/vs/weavy",
    type: "website",
  },
};

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://nodetool.ai" },
    {
      "@type": "ListItem",
      position: 2,
      name: "NodeTool vs Weavy",
      item: "https://nodetool.ai/vs/weavy",
    },
  ],
};

const faq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How is NodeTool different from Weavy?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Weavy and similar closed SaaS canvases lock you into a credit system and a curated model roster. NodeTool is open source and BYOK: every provider, your keys, provider prices, and you own your workflows and files. NodeTool Cloud is just managed hosting of the same open-source code you can self-host.",
      },
    },
    {
      "@type": "Question",
      name: "Does NodeTool use credits?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. NodeTool is BYOK — you bring your own API keys and pay each provider their list price directly. There are no credits, no markup, and no curated roster of models.",
      },
    },
    {
      "@type": "Question",
      name: "Can I self-host NodeTool?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. NodeTool is open source under AGPL-3.0. You can run it as a desktop app on macOS, Windows, or Linux, or self-host the same code that powers NodeTool Cloud.",
      },
    },
    {
      "@type": "Question",
      name: "Who owns my workflows and files in NodeTool?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You do. In the desktop app your workflows and files stay on your machine. NodeTool does not lock your work behind a proprietary platform — the code is open source and self-hostable.",
      },
    },
  ],
};

const rows: { label: string; weavy: string | boolean; nodetool: string | boolean }[] = [
  {
    label: "Pricing model",
    weavy: "Credits",
    nodetool: "BYOK / provider prices",
  },
  {
    label: "Model roster",
    weavy: "Curated roster",
    nodetool: "Every provider",
  },
  { label: "Source", weavy: "Closed", nodetool: "AGPL-3.0" },
  { label: "Self-host", weavy: false, nodetool: true },
  { label: "Data ownership", weavy: false, nodetool: true },
  { label: "Desktop app", weavy: false, nodetool: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true)
    return <Check className="mx-auto h-5 w-5 text-emerald-400" aria-label="Yes" />;
  if (value === false)
    return <Minus className="mx-auto h-5 w-5 text-slate-600" aria-label="No" />;
  return <span className="text-sm text-slate-300">{value}</span>;
}

export default function VsWeavyPage() {
  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={breadcrumb} />
      <JsonLd data={faq} />

      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-[120px]" />
        <div className="absolute top-1/2 -right-24 h-[24rem] w-[24rem] rounded-full bg-fuchsia-500/10 blur-[120px]" />
      </div>

      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        {/* Hero */}
        <section aria-labelledby="vs-title" className="mx-auto max-w-3xl px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
            NodeTool vs Weavy
          </span>
          <h1
            id="vs-title"
            className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
          >
            Open source and BYOK. No credits, no lock-in.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            Weavy and similar closed SaaS canvases lock you into a credit system
            and a curated model roster. NodeTool is open source and BYOK: every
            provider, your keys, provider prices, and you own your workflows and
            files. Cloud is just managed hosting of the same open-source code you
            can self-host.
          </p>
        </section>

        {/* Comparison cards */}
        <section aria-label="At a glance" className="mx-auto mt-16 max-w-5xl px-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Weavy / closed SaaS */}
            <div className="relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 ring-1 ring-white/5 backdrop-blur-md">
              <h2 className="text-xl font-semibold text-white">Weavy</h2>
              <p className="mt-1 text-sm text-slate-400">Closed SaaS canvas</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {[
                  "Credit system you top up and burn",
                  "Curated roster of supported models",
                  "Closed source, hosted only",
                  "Work lives on their platform",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Minus className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* NodeTool */}
            <div className="relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 ring-1 ring-white/5 backdrop-blur-md">
              <h2 className="text-xl font-semibold text-white">NodeTool</h2>
              <p className="mt-1 text-sm text-slate-400">Open source · BYOK</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {[
                  "BYOK — pay providers directly at list prices",
                  "Every major model from every major provider",
                  "Open source under AGPL-3.0, self-hostable",
                  "You own your workflows and files",
                ].map((f) => (
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
                  <th className="px-5 py-4 text-center font-semibold text-white">Weavy</th>
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
                    <td className="px-5 py-4 text-center"><Cell value={row.weavy} /></td>
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
              Pay providers, not credits — and keep your work
            </h2>
            <p className="mt-4 leading-relaxed text-slate-300">
              Credit systems and curated rosters decide which models you can use
              and what each call costs. NodeTool flips that: you add your own API
              keys and pay each provider their published list price — no credits,
              no markup, no curated roster. The whole workspace is open source
              under AGPL-3.0, so you can run it as a desktop app or self-host it,
              and your workflows and files stay yours. NodeTool Cloud is simply
              managed hosting of that same open-source code.
            </p>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto my-24 max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Own your canvas.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Download Studio and build with every provider, at provider prices.
          </p>
          <div className="mt-8 flex justify-center">
            <SmartDownloadButton
              icon={<Download className="h-5 w-5" />}
              classNameOverride="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 focus-ring"
            />
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
