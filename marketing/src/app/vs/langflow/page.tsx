import type { Metadata } from "next";
import { Check, Minus, Download } from "lucide-react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import JsonLd from "../../../components/JsonLd";
import { SmartDownloadButton } from "../../SmartDownloadButton";

export const metadata: Metadata = {
  title: "NodeTool vs Langflow — agents plus native media generation",
  description:
    "Langflow is a low-code builder for LLM apps: chatbots, RAG, agents. NodeTool covers the same agent and RAG ground and adds what Langflow leaves to external APIs: native image, video, and music generation with editing tools on the same canvas — open source, BYOK, local models included.",
  alternates: { canonical: "/vs/langflow" },
  openGraph: {
    title: "NodeTool vs Langflow — agents plus native media generation",
    description:
      "Both build agents and RAG pipelines. Only one renders image, video, and music natively on the same canvas. Open source, BYOK, local models.",
    url: "https://nodetool.ai/vs/langflow",
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
      name: "NodeTool vs Langflow",
      item: "https://nodetool.ai/vs/langflow",
    },
  ],
};

const faq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the difference between NodeTool and Langflow?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Langflow is a low-code visual builder for LLM applications — chatbots, RAG pipelines, and agents — rooted in the Python and LangChain ecosystem. NodeTool covers the same agent and RAG ground but treats media as a first-class output: image, video, and music generation run as native nodes on the same canvas, with editing tools like masks, inpaint, and layers built in. Both are open source and self-hostable.",
      },
    },
    {
      "@type": "Question",
      name: "Can Langflow generate images and video?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Langflow is built for text and LLM workloads; generating media means wiring up external APIs yourself. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools — masks, inpaint, outpaint, relight, upscale, layers, and compositing.",
      },
    },
    {
      "@type": "Question",
      name: "Is NodeTool open source like Langflow?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Langflow is MIT-licensed; NodeTool is open source under AGPL-3.0. Both can be self-hosted. NodeTool also ships as a desktop app for macOS, Windows, and Linux, and NodeTool Cloud is managed hosting of the same open-source code.",
      },
    },
    {
      "@type": "Question",
      name: "Can I run local models in NodeTool?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. NodeTool runs local models via Ollama, MLX, and llama.cpp in the desktop app, and connects to every major cloud provider BYOK — your keys, provider list prices, no credits or markup.",
      },
    },
  ],
};

const rows: { label: string; langflow: string | boolean; nodetool: string | boolean }[] = [
  {
    label: "Focus",
    langflow: "LLM apps: chat, RAG, agents",
    nodetool: "Agents + image, video, audio, text",
  },
  {
    label: "Native media generation (image, video, music)",
    langflow: "Via external APIs",
    nodetool: "Built-in nodes",
  },
  {
    label: "Editing tools (masks, inpaint, relight, layers)",
    langflow: false,
    nodetool: true,
  },
  { label: "Agents & RAG", langflow: true, nodetool: true },
  { label: "Local models", langflow: "LLMs via Ollama", nodetool: "Ollama, MLX, llama.cpp" },
  { label: "BYOK / provider billing", langflow: true, nodetool: true },
  { label: "Open source", langflow: "MIT", nodetool: "AGPL-3.0" },
  {
    label: "Desktop app",
    langflow: "macOS, Windows",
    nodetool: "macOS, Windows, Linux",
  },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true)
    return <Check className="mx-auto h-5 w-5 text-emerald-400" aria-label="Yes" />;
  if (value === false)
    return <Minus className="mx-auto h-5 w-5 text-slate-600" aria-label="No" />;
  return <span className="text-sm text-slate-300">{value}</span>;
}

export default function VsLangflowPage() {
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
            NodeTool vs Langflow
          </span>
          <h1
            id="vs-title"
            className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
          >
            Agents that ship media, not just messages.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            Langflow is a low-code builder for LLM apps — chatbots, RAG, agents —
            rooted in Python and LangChain. NodeTool covers that same ground and
            adds what Langflow leaves to external APIs: native image, video, and
            music generation with editing tools on the same canvas. Open source,
            BYOK at provider prices, local models included.
          </p>
        </section>

        {/* Comparison cards */}
        <section aria-label="At a glance" className="mx-auto mt-16 max-w-5xl px-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Langflow */}
            <div className="relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 ring-1 ring-white/5 backdrop-blur-md">
              <h2 className="text-xl font-semibold text-white">Langflow</h2>
              <p className="mt-1 text-sm text-slate-400">
                Low-code builder for LLM apps
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {[
                  "Visual flows for chatbots, RAG, and agents",
                  "Python-extensible, LangChain ecosystem",
                  "Open source (MIT), self-hostable",
                  "Text and LLM pipelines first",
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
                Agents plus native generation
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {[
                  "Agents, RAG, and chat on the same canvas",
                  "Native image, video, and music generation nodes",
                  "Editing tools: masks, inpaint, relight, layers",
                  "BYOK at provider prices — local models via Ollama, MLX, llama.cpp",
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
                  <th className="px-5 py-4 text-center font-semibold text-white">Langflow</th>
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
                    <td className="px-5 py-4 text-center"><Cell value={row.langflow} /></td>
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
              The pipeline and the picture, on one canvas
            </h2>
            <p className="mt-4 leading-relaxed text-slate-300">
              If your project ends at a chatbot or a RAG pipeline, Langflow is a
              solid choice — visual flows, Python extensibility, a mature
              LangChain ecosystem. But the moment an agent needs to produce
              something you can look at or listen to — a storyboard, a product
              video, a soundtrack — Langflow hands you an API key form and a
              blank HTTP node. NodeTool keeps going: generation nodes for image,
              video, and music from every major provider sit on the same canvas
              as your agents and retrieval, with masks, inpaint, relight,
              upscale, and layers built in. You bring your own keys and pay
              provider list prices — no credits, no markup — and run local
              models via Ollama, MLX, and llama.cpp on the desktop.
            </p>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto my-24 max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Build agents that make things.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Download Studio and put generation on the same canvas as your agents.
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
