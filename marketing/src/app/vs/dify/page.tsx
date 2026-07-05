import type { Metadata } from "next";
import { Check, Minus, Download } from "lucide-react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import JsonLd from "../../../components/JsonLd";
import { SmartDownloadButton } from "../../SmartDownloadButton";

export const metadata: Metadata = {
  title: "NodeTool vs Dify — an LLM app platform vs a media-generation canvas",
  description:
    "Dify is a strong LLM app platform: prompt orchestration, knowledge bases, and agent debugging for text-first products. NodeTool starts from the same agent and RAG ground, then puts native image, video, and music generation and editing tools on the same canvas — your own keys at provider prices, no markup.",
  alternates: { canonical: "/vs/dify" },
  openGraph: {
    title: "NodeTool vs Dify — an LLM app platform vs a media-generation canvas",
    description:
      "Dify is built for text-first LLM apps. NodeTool adds native image, video, and music generation on the same canvas as agents and RAG — with your own keys.",
    url: "https://nodetool.ai/vs/dify",
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
      name: "NodeTool vs Dify",
      item: "https://nodetool.ai/vs/dify",
    },
  ],
};

const faq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the difference between NodeTool and Dify?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Dify is an LLM app development platform focused on prompt orchestration, knowledge bases, and agent debugging for text-first products like chatbots and copilots. NodeTool covers the same agent and RAG ground on a node-based canvas, then adds native image, video, and music generation and editing tools — masks, inpaint, relight, layers — as first-class nodes, so a workflow can produce media, not just text and structured output.",
      },
    },
    {
      "@type": "Question",
      name: "Is Dify open source?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Dify's source is published under a modified Apache 2.0 license that adds commercial-use conditions above certain usage thresholds — check Dify's own license file for the current terms before relying on it for a commercial deployment. NodeTool is open source under AGPL-3.0, an OSI-approved license, and lets you bring your own keys on both self-hosted and NodeTool Cloud deployments.",
      },
    },
    {
      "@type": "Question",
      name: "Can Dify generate images or video?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Dify can call image-generation APIs through its tool/plugin system, but it is not built around media generation the way it is built around text and RAG. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools, on the same canvas as its agent and knowledge-base nodes.",
      },
    },
    {
      "@type": "Question",
      name: "When should I pick Dify instead of NodeTool?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "When the product is a text-first LLM app — a support chatbot, an internal copilot, a knowledge-base assistant — and you want Dify's prompt-orchestration UI, built-in observability, and app-store-style deployment. NodeTool is the better fit when the workflow needs to produce image, video, or audio alongside the agent and RAG work, or when you want a desktop app with local-model support and your own keys throughout.",
      },
    },
  ],
};

const rows: { label: string; dify: string | boolean; nodetool: string | boolean }[] = [
  {
    label: "Focus",
    dify: "Text-first LLM apps & knowledge bases",
    nodetool: "AI generation + agents",
  },
  {
    label: "Native media generation (image, video, music)",
    dify: "Via tool/plugin calls",
    nodetool: "Built-in nodes",
  },
  {
    label: "Editing tools (masks, inpaint, relight, layers)",
    dify: false,
    nodetool: true,
  },
  {
    label: "Agent debugging & tracing",
    dify: true,
    nodetool: true,
  },
  {
    label: "License",
    dify: "Modified Apache 2.0 (commercial limits)",
    nodetool: "AGPL-3.0 (open source)",
  },
  { label: "Local models", dify: "LLMs via self-hosted endpoints", nodetool: "Ollama, MLX, llama.cpp" },
  {
    label: "Pricing model",
    dify: "Seat/usage plans (cloud)",
    nodetool: "Your own keys / provider prices",
  },
  { label: "Desktop app", dify: false, nodetool: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true)
    return <Check className="mx-auto h-5 w-5 text-emerald-400" aria-label="Yes" />;
  if (value === false)
    return <Minus className="mx-auto h-5 w-5 text-slate-600" aria-label="No" />;
  return <span className="text-sm text-slate-300">{value}</span>;
}

export default function VsDifyPage() {
  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={breadcrumb} />
      <JsonLd data={faq} />

      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-amber-500/15 blur-[120px]" />
        <div className="absolute top-1/2 -right-24 h-[24rem] w-[24rem] rounded-full bg-rose-500/10 blur-[120px]" />
      </div>

      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        {/* Hero */}
        <section aria-labelledby="vs-title" className="mx-auto max-w-3xl px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
            NodeTool vs Dify
          </span>
          <h1
            id="vs-title"
            className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
          >
            Text apps are the floor, not the ceiling.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            Dify is a strong platform for text-first LLM apps — prompt
            orchestration, knowledge bases, agent debugging. NodeTool starts
            from the same agent and RAG ground, then puts native image,
            video, and music generation and editing tools on the same canvas
            — open source under AGPL-3.0, your own keys at provider prices, with a
            desktop app and local models.
          </p>
        </section>

        {/* Comparison cards */}
        <section aria-label="At a glance" className="mx-auto mt-16 max-w-5xl px-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Dify */}
            <div className="relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 ring-1 ring-white/5 backdrop-blur-md">
              <h2 className="text-xl font-semibold text-white">Dify</h2>
              <p className="mt-1 text-sm text-slate-400">
                LLM app development platform
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {[
                  "Prompt orchestration and app-store-style deployment",
                  "Built-in knowledge bases and agent debugging",
                  "Modified Apache 2.0 license with commercial limits",
                  "Cloud sold on seat/usage plans",
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
                  "Agents, RAG, and native image/video/music generation",
                  "Built-in editing tools — masks, inpaint, relight, layers",
                  "Open source under AGPL-3.0, desktop app included",
                  "Your own keys at provider prices — no credits, no markup",
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
                  <th className="px-5 py-4 text-center font-semibold text-white">Dify</th>
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
                    <td className="px-5 py-4 text-center"><Cell value={row.dify} /></td>
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
              Great for the chatbot. Not built for the render.
            </h2>
            <p className="mt-4 leading-relaxed text-slate-300">
              Dify earns its reputation on debugging and knowledge-base
              tooling for text-first LLM apps — a support bot, an internal
              copilot, a document Q&amp;A assistant. But when the deliverable
              includes a generated image, a video cut, or a synthesized
              voice line, that step has to leave the platform. NodeTool puts
              image, video, and music models from every major provider on
              the same canvas as its agent and retrieval nodes, with masks,
              inpaint, relight, upscale, and layers built in — every call on
              your own keys at list price.
            </p>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto my-24 max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Build past the chatbot.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Download Studio and put generation on the same canvas as your
            agents and knowledge base.
          </p>
          <div className="mt-8 flex justify-center">
            <SmartDownloadButton
              icon={<Download className="h-5 w-5" />}
              classNameOverride="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-amber-900/40 transition-all hover:bg-amber-500 focus-ring"
            />
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
