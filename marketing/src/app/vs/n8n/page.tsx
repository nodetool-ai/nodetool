import type { Metadata } from "next";
import { Check, Minus, Download } from "lucide-react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import JsonLd from "../../../components/JsonLd";
import { SmartDownloadButton } from "../../SmartDownloadButton";

export const metadata: Metadata = {
  title: "NodeTool vs n8n — when the workflow creates, not just connects",
  description:
    "n8n moves data between hundreds of business apps. NodeTool is built for workflows where the AI work is the point: native image, video, and music generation, agents, and editing tools on one canvas — open source under AGPL-3.0 (not fair-code), BYOK at provider prices, with a desktop app and local models.",
  alternates: { canonical: "/vs/n8n" },
  openGraph: {
    title: "NodeTool vs n8n — when the workflow creates, not just connects",
    description:
      "n8n connects apps. NodeTool generates — image, video, music, and agents on one canvas. Open source (AGPL-3.0), BYOK, desktop app, local models.",
    url: "https://nodetool.ai/vs/n8n",
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
      name: "NodeTool vs n8n",
      item: "https://nodetool.ai/vs/n8n",
    },
  ],
};

const faq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the difference between NodeTool and n8n?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "n8n is a workflow automation platform: it moves data between hundreds of business apps, with AI agent nodes built on LangChain. NodeTool is built for workflows where the AI work is the point — native image, video, and music generation, agents, and media editing tools on one node-based canvas. If the job is connecting Salesforce to Slack on a schedule, use n8n. If the job is producing something with AI, use NodeTool.",
      },
    },
    {
      "@type": "Question",
      name: "Is n8n open source?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "n8n is fair-code under its Sustainable Use License: the source is available, but commercial use is restricted. NodeTool is open source under AGPL-3.0, an OSI-approved license — you can self-host it, modify it, and build on it, and NodeTool Cloud is managed hosting of the same code.",
      },
    },
    {
      "@type": "Question",
      name: "Can n8n generate images or video?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Only by calling external APIs from generic HTTP or integration nodes. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools — masks, inpaint, outpaint, relight, upscale, layers, and compositing.",
      },
    },
    {
      "@type": "Question",
      name: "When should I pick n8n instead of NodeTool?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "When the hard part of your workflow is business-app plumbing: hundreds of connectors, schedules, retries, and branching between SaaS tools. That is what n8n is built for. NodeTool is the better fit when the workflow's output is AI-generated media or agent work, and you want local models, BYOK provider pricing, and a desktop app.",
      },
    },
  ],
};

const rows: { label: string; n8n: string | boolean; nodetool: string | boolean }[] = [
  {
    label: "Focus",
    n8n: "App-to-app automation",
    nodetool: "AI generation + agents",
  },
  {
    label: "Native media generation (image, video, music)",
    n8n: "Via external APIs",
    nodetool: "Built-in nodes",
  },
  {
    label: "Editing tools (masks, inpaint, relight, layers)",
    n8n: false,
    nodetool: true,
  },
  {
    label: "Business app connectors",
    n8n: "400+ integrations",
    nodetool: "AI-focused set",
  },
  {
    label: "License",
    n8n: "Sustainable Use (fair-code)",
    nodetool: "AGPL-3.0 (open source)",
  },
  { label: "Local models", n8n: "LLMs via Ollama", nodetool: "Ollama, MLX, llama.cpp" },
  {
    label: "Pricing model",
    n8n: "Per-execution plans (cloud)",
    nodetool: "BYOK / provider prices",
  },
  { label: "Desktop app", n8n: false, nodetool: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true)
    return <Check className="mx-auto h-5 w-5 text-emerald-400" aria-label="Yes" />;
  if (value === false)
    return <Minus className="mx-auto h-5 w-5 text-slate-600" aria-label="No" />;
  return <span className="text-sm text-slate-300">{value}</span>;
}

export default function VsN8nPage() {
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
            NodeTool vs n8n
          </span>
          <h1
            id="vs-title"
            className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
          >
            Workflows that create, not just connect.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            n8n moves data between hundreds of business apps — schedules,
            retries, branching. NodeTool is built for workflows where the AI
            work is the point: native image, video, and music generation,
            agents, and editing tools on one canvas. Open source under
            AGPL-3.0, BYOK at provider prices, with a desktop app and local
            models.
          </p>
        </section>

        {/* Comparison cards */}
        <section aria-label="At a glance" className="mx-auto mt-16 max-w-5xl px-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* n8n */}
            <div className="relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 ring-1 ring-white/5 backdrop-blur-md">
              <h2 className="text-xl font-semibold text-white">n8n</h2>
              <p className="mt-1 text-sm text-slate-400">
                Workflow automation platform
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {[
                  "400+ integrations for business apps",
                  "Orchestration: schedules, retries, branching",
                  "AI agent nodes built on LangChain",
                  "Fair-code: source-available, commercially restricted",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* NodeTool */}
            <div className="relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 ring-1 ring-white/5 backdrop-blur-md">
              <h2 className="text-xl font-semibold text-white">NodeTool</h2>
              <p className="mt-1 text-sm text-slate-400">
                The AI-native canvas
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {[
                  "Native image, video, and music generation nodes",
                  "Agents and RAG on the same canvas as generation",
                  "Open source under AGPL-3.0, desktop app included",
                  "BYOK at provider prices — no credits, no markup",
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
                  <th className="px-5 py-4 text-center font-semibold text-white">n8n</th>
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
                    <td className="px-5 py-4 text-center"><Cell value={row.n8n} /></td>
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
              Plumbing is solved. Production isn&apos;t.
            </h2>
            <p className="mt-4 leading-relaxed text-slate-300">
              If the hard part of your workflow is moving records between
              Salesforce, Slack, and a spreadsheet on a schedule, n8n is built
              for exactly that. But when the workflow&apos;s output is the
              thing itself — a product video, a batch of campaign images, a
              soundtrack, an agent&apos;s research report — the generation
              can&apos;t live in a generic HTTP node. NodeTool makes it native:
              image, video, and music models from every major provider as
              first-class nodes, agents and retrieval on the same canvas, and
              editing tools — masks, inpaint, relight, upscale, layers — built
              in. It&apos;s open source under AGPL-3.0 rather than fair-code,
              runs as a desktop app on macOS, Windows, and Linux, and calls
              models with your own keys at provider list prices.
            </p>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto my-24 max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Make the workflow the studio.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Download Studio and generate image, video, and music where your
            agents already work.
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
