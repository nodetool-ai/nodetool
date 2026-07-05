import type { Metadata } from "next";
import { Check, Minus, Download } from "lucide-react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import JsonLd from "../../../components/JsonLd";
import FaqBlock from "../../../components/FaqBlock";
import { SmartDownloadButton } from "../../SmartDownloadButton";

export const metadata: Metadata = {
  title: "NodeTool vs ComfyUI — the open creative AI workspace",
  description:
    "ComfyUI is an engineer-first node editor for Stable Diffusion. NodeTool is the studio around it: image, video, music, and text on one node-based canvas, far more models across providers, and built-in editing tools — all called with your own keys at provider prices. Both are open source.",
  alternates: { canonical: "/vs/comfyui" },
  openGraph: {
    title: "NodeTool vs ComfyUI — the open creative AI workspace",
    description:
      "Beyond Stable Diffusion images: NodeTool puts image, video, audio, and text on one node-based canvas with editing tools built in. Open source, your own keys, provider prices.",
    url: "https://nodetool.ai/vs/comfyui",
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
      name: "NodeTool vs ComfyUI",
      item: "https://nodetool.ai/vs/comfyui",
    },
  ],
};

const faq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the difference between NodeTool and ComfyUI?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "ComfyUI is a node editor focused on Stable Diffusion image generation, built for engineers. NodeTool is the studio around it: image, video, music, and text on one node-based canvas, far more models across providers and media types, and editing tools creatives actually use — called with your own keys at provider prices. Both are node-based and open source.",
      },
    },
    {
      "@type": "Question",
      name: "Is NodeTool open source like ComfyUI?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. NodeTool is open source under AGPL-3.0. You can run it as a desktop app on macOS, Windows, or Linux, or in the browser via NodeTool Cloud, which is managed hosting of the same open-source code.",
      },
    },
    {
      "@type": "Question",
      name: "Can NodeTool do more than image generation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. NodeTool works across image, video, audio, and text on one canvas, with editing tools built in — masks, inpaint, outpaint, relight, upscale, layers, and compositing. ComfyUI is centered on image generation.",
      },
    },
    {
      "@type": "Question",
      name: "How does NodeTool handle model pricing?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "With NodeTool, you bring your own API keys and pay each provider their list price. There are no credits, no markup, and no hand-picked model list. You can also run local models with Ollama, MLX, or llama.cpp in the desktop app.",
      },
    },
  ],
};

const rows: { label: string; comfyui: string | boolean; nodetool: string | boolean }[] = [
  {
    label: "Media types",
    comfyui: "Stable Diffusion images",
    nodetool: "Image, video, audio, text",
  },
  {
    label: "Model lineup",
    comfyui: "Stable Diffusion",
    nodetool: "Every major provider & media type",
  },
  { label: "Your own keys / provider billing", comfyui: false, nodetool: true },
  {
    label: "Editing tools (masks, inpaint, relight, layers)",
    comfyui: false,
    nodetool: true,
  },
  { label: "Local models", comfyui: true, nodetool: true },
  { label: "Desktop + browser", comfyui: false, nodetool: true },
  { label: "Open source", comfyui: true, nodetool: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true)
    return <Check className="mx-auto h-5 w-5 text-emerald-400" aria-label="Yes" />;
  if (value === false)
    return <Minus className="mx-auto h-5 w-5 text-slate-600" aria-label="No" />;
  return <span className="text-sm text-slate-300">{value}</span>;
}

export default function VsComfyUIPage() {
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
            NodeTool vs ComfyUI
          </span>
          <h1
            id="vs-title"
            className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
          >
            The open creative AI workspace, not just a Stable Diffusion editor.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            ComfyUI is a node editor for Stable Diffusion, built with an
            engineer-first UX. NodeTool is the studio around it: image, video,
            music, and words on one canvas, far more models, and the
            editing tools creatives reach for — called with your own keys at
            provider prices. Both are node-based and open source.
          </p>
        </section>

        {/* Comparison cards */}
        <section aria-label="At a glance" className="mx-auto mt-16 max-w-5xl px-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* ComfyUI */}
            <div className="relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 ring-1 ring-white/5 backdrop-blur-md">
              <h2 className="text-xl font-semibold text-white">ComfyUI</h2>
              <p className="mt-1 text-sm text-slate-400">
                Node editor for Stable Diffusion images
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {[
                  "Deep control over Stable Diffusion workflows",
                  "Engineer-first, graph-based UX",
                  "Local model focused",
                  "Open source community",
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
                The studio around the canvas
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {[
                  "Image, video, audio, and text on one canvas",
                  "Every major model from every major provider",
                  "Editing tools: masks, inpaint, relight, layers",
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
                  <th className="px-5 py-4 text-center font-semibold text-white">ComfyUI</th>
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
                    <td className="px-5 py-4 text-center"><Cell value={row.comfyui} /></td>
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
              One canvas for everything, not just images
            </h2>
            <p className="mt-4 leading-relaxed text-slate-300">
              If your work starts and ends with Stable Diffusion images, ComfyUI
              gives you fine-grained control. But most creative projects cross
              media — image into video, voice and music into a cut, words
              into everything. NodeTool keeps all of it on one node-based canvas
              with masks, inpaint, outpaint, relight, upscale, layers, and
              compositing built in. You call every major model with your own
              keys at provider prices, and run locally via Ollama, MLX, and
              llama.cpp.
            </p>
          </div>
        </section>

        {/* FAQ — shared rows from faqEntries.ts, pinned to the comparison surface */}
        <div className="mt-24">
          <FaqBlock surface="comparison" linkToStandalone />
        </div>

        {/* Closing CTA */}
        <section className="mx-auto my-24 max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Open, built for every medium, and yours.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Download Studio and build across image, video, audio, and text in one
            place.
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
