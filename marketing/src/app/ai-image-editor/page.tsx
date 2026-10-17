import type { Metadata } from "next";
import { ArrowUpRight, Download } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import FaqSection from "../../components/FaqSection";
import JsonLd from "../../components/JsonLd";
import { SmartDownloadButton } from "../SmartDownloadButton";
import { breadcrumbSchema } from "@/lib/jsonld";
import {
  AGENT_TOOLS,
  CONSISTENCY_POINTS,
  IMAGE_DESCRIPTION,
  IMAGE_FAQ,
  IMAGE_LEAD,
  IMAGE_LIMITS,
  IMAGE_LINKS,
  IMAGE_TITLE,
  LAYER_FEATURES,
} from "@/data/imageEditorPage";
import PageUpdated from "@/components/PageUpdated";

export const metadata: Metadata = {
  title: IMAGE_TITLE,
  description: IMAGE_DESCRIPTION,
  alternates: { canonical: "/ai-image-editor" },
  openGraph: { title: IMAGE_TITLE, description: IMAGE_DESCRIPTION, url: "https://nodetool.ai/ai-image-editor", siteName: "NodeTool", type: "website", images: [{ url: "/surface-sketch-poster.webp", alt: "The NodeTool sketch editor with a layered image" }] },
  twitter: { card: "summary_large_image", title: IMAGE_TITLE, description: IMAGE_DESCRIPTION, images: ["/surface-sketch-poster.webp"] },
};

const sectionTitle = "max-w-sm text-3xl font-semibold tracking-tight md:text-4xl";
const bodyText = "leading-relaxed text-slate-300";
const inlineLink = "focus-ring rounded font-medium text-cyan-200 underline underline-offset-2 hover:text-cyan-100";

export default function AiImageEditorPage() {
  return (
    <>
      <SiteHeader />
      <main id="content" className="bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-7xl px-6 pb-24 pt-36 lg:px-8">
          <section className="mb-16 grid items-end gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="min-w-0">
              <p className="mb-5 text-base font-medium text-cyan-200">Open-source AI image editor</p>
              <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight md:text-7xl">Regenerate one layer. Keep the rest.</h1>
            </div>
            <div className="min-w-0 max-w-lg">
              <p className="text-lg leading-relaxed text-slate-300">{IMAGE_LEAD}</p>
              <div className="mt-7 flex flex-wrap items-center gap-5">
                <SmartDownloadButton icon={<Download className="h-4 w-4" aria-hidden="true" />} classNameOverride="focus-ring inline-flex items-center rounded-full bg-cyan-200 px-6 py-3 font-medium text-slate-950 hover:bg-cyan-100" />
                <a href="https://docs.nodetool.ai/sketch-editor" className="focus-ring rounded font-medium text-slate-100 hover:text-cyan-200">Read the Sketch Editor guide</a>
              </div>
            </div>
          </section>

          <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/surface-sketch-poster.webp" alt="The sketch editor with a layered image and the layer stack" width={1920} height={1080} loading="lazy" decoding="async" className="hidden h-auto w-full motion-reduce:block" />
            <video autoPlay muted loop playsInline preload="metadata" poster="/surface-sketch-poster.webp" aria-label="The sketch editor: a layer is generated and edited on its own" className="block h-auto w-full motion-reduce:hidden">
              <source src="/surface-sketch.webm" type='video/webm; codecs="vp9"' />
              <source src="/surface-sketch.mp4" type="video/mp4" />
            </video>
          </div>

          <section aria-labelledby="layers-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <h2 id="layers-title" className={sectionTitle}>Layers that know where they came from</h2>
              <p className={`mt-4 max-w-sm ${bodyText}`}>A generated layer keeps its model, prompt, and inputs, so it can be made again without touching the layers around it.</p>
            </div>
            <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {LAYER_FEATURES.map((feature) => (
                <li key={feature.title}>
                  <h3 className="text-xl font-medium">{feature.title}</h3>
                  <p className={`mt-2 ${bodyText}`}>{feature.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="consistency-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="consistency-title" className={sectionTitle}>The same product in every image</h2>
            <ul className="max-w-2xl list-disc space-y-3 pl-5 text-slate-300">
              {CONSISTENCY_POINTS.map((point) => <li key={point}>{point}</li>)}
            </ul>
          </section>

          <section aria-labelledby="agent-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <h2 id="agent-title" className={sectionTitle}>Let an agent edit the stack</h2>
              <p className={`mt-4 max-w-sm ${bodyText}`}>The built-in agent and coding agents use the same tools. Connect yours with the <a href="/mcp" className={inlineLink}>NodeTool MCP server</a>.</p>
            </div>
            <dl className="min-w-0 max-w-2xl space-y-5 break-words">
              {AGENT_TOOLS.map((tool) => (
                <div key={tool.name}>
                  <dt className="font-mono text-sm text-cyan-200">{tool.name}</dt>
                  <dd className={`mt-1 ${bodyText}`}>{tool.body}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="limits-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="limits-title" className={sectionTitle}>Good to know</h2>
            <ul className="max-w-2xl list-disc space-y-2 pl-5 text-slate-300">
              {IMAGE_LIMITS.map((limit) => <li key={limit}>{limit}</li>)}
            </ul>
          </section>

          <FaqSection items={IMAGE_FAQ} heading="Questions about AI image editing" className="mt-24 max-w-3xl" id="image-faq" />

          <nav aria-labelledby="image-links-title" className="mt-16 max-w-3xl">
            <h2 id="image-links-title" className="text-xl font-semibold">Read more</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {IMAGE_LINKS.map((link) => (
                <li key={link.href}><a href={link.href} className="focus-ring inline-flex items-center gap-1 rounded text-cyan-200 hover:text-cyan-100">{link.label}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a></li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mx-auto max-w-7xl px-6 pb-12 lg:px-8">
          <PageUpdated route="/ai-image-editor" className="text-sm text-slate-400" />
        </div>
        <JsonLd data={breadcrumbSchema([{ name: "AI image editor", url: "/ai-image-editor" }])} />
      </main>
      <SiteFooter />
    </>
  );
}
