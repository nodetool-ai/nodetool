import type { Metadata } from "next";
import { Check, Minus, Download } from "lucide-react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import JsonLd from "../../../components/JsonLd";
import { SmartDownloadButton } from "../../SmartDownloadButton";

export const metadata: Metadata = {
  title: "NodeTool vs Flowise — RAG chatbots plus native media generation",
  description:
    "Flowise is the fastest drag-and-drop path to a LangChain-based RAG chatbot. NodeTool covers the same agent and retrieval ground, then adds native image, video, and music generation and editing tools on the same canvas — BYOK at provider prices, no hosted-credit tiers.",
  alternates: { canonical: "/vs/flowise" },
  openGraph: {
    title: "NodeTool vs Flowise — RAG chatbots plus native media generation",
    description:
      "Flowise builds RAG chatbots fast. NodeTool builds the chatbot and the image, video, and music pipeline around it — one canvas, BYOK.",
    url: "https://nodetool.ai/vs/flowise",
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
      name: "NodeTool vs Flowise",
      item: "https://nodetool.ai/vs/flowise",
    },
  ],
};

const faq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the difference between NodeTool and Flowise?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Flowise is a drag-and-drop builder for LangChain-based LLM apps — its fastest path is a RAG chatbot backed by a vector store. NodeTool covers the same agent and retrieval ground, then adds native image, video, and music generation nodes, plus editing tools (masks, inpaint, relight, layers), on the same canvas. If the deliverable is a chatbot, Flowise gets there fastest. If the deliverable includes generated media, NodeTool is built for the whole pipeline.",
      },
    },
    {
      "@type": "Question",
      name: "Is Flowise open source?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Flowise is source-available under the Apache 2.0 license, with a hosted Flowise Cloud sold on usage-based credit tiers. NodeTool is open source under AGPL-3.0 and BYOK: you connect your own provider keys and pay providers directly at their list prices, with no credit markup on either self-hosted or NodeTool Cloud usage.",
      },
    },
    {
      "@type": "Question",
      name: "Can Flowise generate images or video?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Only by wiring a generic HTTP request node to an external API. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools, as first-class citizens on the same canvas as its agent and RAG nodes.",
      },
    },
    {
      "@type": "Question",
      name: "When should I pick Flowise instead of NodeTool?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "When the job is strictly a LangChain-flavored chatbot or assistant over a document set, and you want the fastest drag-and-drop path to that specific shape. NodeTool is the better fit once the workflow also needs to produce image, video, or audio, or you want a desktop app with local-model support and BYOK pricing across everything, not just the LLM calls.",
      },
    },
  ],
};

const rows: { label: string; flowise: string | boolean; nodetool: string | boolean }[] = [
  {
    label: "Focus",
    flowise: "LangChain chatbots & RAG",
    nodetool: "AI generation + agents",
  },
  {
    label: "Native media generation (image, video, music)",
    flowise: "Via HTTP request nodes",
    nodetool: "Built-in nodes",
  },
  {
    label: "Editing tools (masks, inpaint, relight, layers)",
    flowise: false,
    nodetool: true,
  },
  {
    label: "Vector store / RAG nodes",
    flowise: true,
    nodetool: true,
  },
  {
    label: "License",
    flowise: "Apache 2.0 (source-available)",
    nodetool: "AGPL-3.0 (open source)",
  },
  { label: "Local models", flowise: "LLMs via Ollama", nodetool: "Ollama, MLX, llama.cpp" },
  {
    label: "Pricing model",
    flowise: "Usage-based credits (cloud)",
    nodetool: "BYOK / provider prices",
  },
  { label: "Desktop app", flowise: false, nodetool: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true)
    return <Check className="mx-auto h-5 w-5 text-emerald-400" aria-label="Yes" />;
  if (value === false)
    return <Minus className="mx-auto h-5 w-5 text-slate-600" aria-label="No" />;
  return <span className="text-sm text-slate-300">{value}</span>;
}

export default function VsFlowisePage() {
  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={breadcrumb} />
      <JsonLd data={faq} />

      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-violet-500/15 blur-[120px]" />
        <div className="absolute top-1/2 -right-24 h-[24rem] w-[24rem] rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        {/* Hero */}
        <section aria-labelledby="vs-title" className="mx-auto max-w-3xl px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">
            NodeTool vs Flowise
          </span>
          <h1
            id="vs-title"
            className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
          >
            The chatbot, plus everything it needs to produce.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            Flowise is the fastest drag-and-drop path to a LangChain RAG
            chatbot. NodeTool covers the same agent and retrieval ground, then
            adds native image, video, and music generation and editing tools
            on the same canvas — open source under AGPL-3.0, BYOK at provider
            prices, with a desktop app and local models.
          </p>
        </section>

        {/* Comparison cards */}
        <section aria-label="At a glance" className="mx-auto mt-16 max-w-5xl px-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Flowise */}
            <div className="relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 ring-1 ring-white/5 backdrop-blur-md">
              <h2 className="text-xl font-semibold text-white">Flowise</h2>
              <p className="mt-1 text-sm text-slate-400">
                Drag-and-drop LangChain builder
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {[
                  "Fastest path to a RAG chatbot",
                  "Vector store and LangChain node library",
                  "Source-available under Apache 2.0",
                  "Hosted cloud sold on usage-based credits",
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
                  <th className="px-5 py-4 text-center font-semibold text-white">Flowise</th>
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
                    <td className="px-5 py-4 text-center"><Cell value={row.flowise} /></td>
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
              A chatbot is often just the front door.
            </h2>
            <p className="mt-4 leading-relaxed text-slate-300">
              Flowise is genuinely fast at what it&apos;s built for: wire a
              vector store, a retriever, and an LLM node into a working RAG
              chatbot in minutes. But the moment the workflow needs to
              produce something — a rendered image, a video cut, a voice
              line — that step lands in a generic HTTP node calling an
              external API by hand. In NodeTool, image, video, and music
              models from every major provider sit on the same canvas as the
              agent and retrieval nodes, with masks, inpaint, relight,
              upscale, and layers built in — every call on your own keys at
              list price, no credit tiers on top.
            </p>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto my-24 max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Build the chatbot. Ship the media too.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Download Studio and put generation on the same canvas as your
            agents and retrieval.
          </p>
          <div className="mt-8 flex justify-center">
            <SmartDownloadButton
              icon={<Download className="h-5 w-5" />}
              classNameOverride="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-all hover:bg-violet-500 focus-ring"
            />
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
