import type { Metadata } from "next";
import { ArrowUpRight, Download } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import FaqSection from "../../components/FaqSection";
import JsonLd from "../../components/JsonLd";
import StoryboardTeaser from "../../components/storyboards/StoryboardTeaser";
import { SmartDownloadButton } from "../SmartDownloadButton";
import { breadcrumbSchema } from "@/lib/jsonld";
import {
  AGENT_TOOLS,
  EXPORT_ROWS,
  FLOW_STEPS,
  TIMELINE_FEATURES,
  VIDEO_DESCRIPTION,
  VIDEO_FAQ,
  VIDEO_LEAD,
  VIDEO_LIMITS,
  VIDEO_LIMITS_SUMMARY,
  VIDEO_LINKS,
  VIDEO_TITLE,
} from "@/data/videoEditorPage";
import PageUpdated from "@/components/PageUpdated";

export const metadata: Metadata = {
  title: VIDEO_TITLE,
  description: VIDEO_DESCRIPTION,
  alternates: { canonical: "/ai-video-editor" },
  openGraph: { title: VIDEO_TITLE, description: VIDEO_DESCRIPTION, url: "https://nodetool.ai/ai-video-editor", siteName: "NodeTool", type: "website", images: [{ url: "/surface-timeline-poster.webp", alt: "The NodeTool timeline with generated clips on several tracks" }] },
  twitter: { card: "summary_large_image", title: VIDEO_TITLE, description: VIDEO_DESCRIPTION, images: ["/surface-timeline-poster.webp"] },
};

const sectionTitle = "max-w-sm text-3xl font-semibold tracking-tight md:text-4xl";
const bodyText = "leading-relaxed text-slate-300";
const inlineLink = "focus-ring rounded font-medium text-cyan-200 underline underline-offset-2 hover:text-cyan-100";

export default function AiVideoEditorPage() {
  return (
    <>
      <SiteHeader />
      <main id="content" className="bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-7xl px-6 pb-16 pt-36 lg:px-8">
          <section className="mb-16 grid items-end gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div>
              <p className="mb-5 text-base font-medium text-cyan-200">Open-source AI video editor</p>
              <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight md:text-7xl">The agent makes the cut. You keep editing it.</h1>
            </div>
            <div className="max-w-lg">
              <p className="text-lg leading-relaxed text-slate-300">{VIDEO_LEAD}</p>
              <div className="mt-7 flex flex-wrap items-center gap-5">
                <SmartDownloadButton icon={<Download className="h-4 w-4" aria-hidden="true" />} classNameOverride="focus-ring inline-flex items-center rounded-full bg-cyan-200 px-6 py-3 font-medium text-slate-950 hover:bg-cyan-100" />
                <a href="/storyboards" className="focus-ring rounded font-medium text-slate-100 hover:text-cyan-200">Watch films made in NodeTool</a>
              </div>
            </div>
          </section>

          <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/surface-timeline-poster.webp" alt="The NodeTool timeline with generated clips on several tracks" width={1920} height={1080} loading="lazy" decoding="async" className="hidden h-auto w-full motion-reduce:block" />
            <video autoPlay muted loop playsInline preload="metadata" poster="/surface-timeline-poster.webp" aria-label="The timeline: clips are placed, trimmed, and played back" className="block h-auto w-full motion-reduce:hidden">
              <source src="/surface-timeline.webm" type='video/webm; codecs="vp9"' />
              <source src="/surface-timeline.mp4" type="video/mp4" />
            </video>
          </div>

          <section aria-labelledby="flow-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <h2 id="flow-title" className={sectionTitle}>From brief to finished cut</h2>
              <p className={`mt-4 max-w-sm ${bodyText}`}>Each step leaves a document you can open. The agent can run all of them, or you can take over at any step.</p>
            </div>
            <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {FLOW_STEPS.map((step) => (
                <li key={step.title}>
                  <h3 className="text-xl font-medium">{step.title}</h3>
                  <p className={`mt-2 ${bodyText}`}>{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="timeline-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="timeline-title" className={sectionTitle}>A real multi-track timeline</h2>
            <div className="min-w-0 max-w-2xl">
              <ul className="list-disc space-y-2 pl-5 text-slate-300">
                {TIMELINE_FEATURES.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <a href="https://docs.nodetool.ai/video-editor" className="focus-ring mt-6 inline-flex items-center gap-1 rounded font-medium text-cyan-200 hover:text-cyan-100">Read the Video Editor guide<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
            </div>
          </section>

          <section aria-labelledby="agent-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div>
              <h2 id="agent-title" className={sectionTitle}>Let Claude Code or Codex edit the video.</h2>
              <p className={`mt-4 max-w-sm ${bodyText}`}>The built-in agent and external agents use the same tools. Connect yours with the <a href="/mcp" className={inlineLink}>NodeTool MCP server</a>.</p>
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

          <section aria-labelledby="export-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="export-title" className={sectionTitle}>Export</h2>
            <dl className="max-w-2xl space-y-5">
              {EXPORT_ROWS.map((row) => (
                <div key={row.target}>
                  <dt className="text-lg font-medium">{row.target}</dt>
                  <dd className={`mt-1 ${bodyText}`}>{row.detail}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="limits-title" className="mt-24 grid gap-10 border-t border-slate-700 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="limits-title" className={sectionTitle}>What it does not do yet</h2>
            <div className="max-w-2xl">
              <ul className="list-disc space-y-2 pl-5 text-slate-300">
                {VIDEO_LIMITS.map((limit) => <li key={limit}>{limit}</li>)}
              </ul>
              <p className={`mt-5 ${bodyText}`}>{VIDEO_LIMITS_SUMMARY}</p>
            </div>
          </section>
        </div>

        <StoryboardTeaser
          slugs={["duel-in-the-wheat", "the-long-hallway", "mars-greenhouse", "the-interrogation"]}
          heading="Films made in NodeTool."
          body="Each page shows the finished film, then every shot with its camera and direction."
        />

        <div className="mx-auto max-w-7xl px-6 pb-24 lg:px-8">
          <FaqSection items={VIDEO_FAQ} heading="Questions about AI video editing" className="mt-16 max-w-3xl" id="video-faq" />

          <nav aria-labelledby="video-links-title" className="mt-16 max-w-3xl">
            <h2 id="video-links-title" className="text-xl font-semibold">Read more</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {VIDEO_LINKS.map((link) => (
                <li key={link.href}><a href={link.href} className="focus-ring inline-flex items-center gap-1 rounded text-cyan-200 hover:text-cyan-100">{link.label}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a></li>
              ))}
            </ul>
          </nav>

          <div className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t border-slate-700 pt-10">
            <p className="max-w-xl text-lg leading-relaxed text-slate-300">Studio is free and open source. Connect the video models you already pay for and keep every project editable.</p>
            <SmartDownloadButton classNameOverride="focus-ring inline-flex items-center rounded-full bg-slate-100 px-6 py-3 font-medium text-slate-950 hover:bg-slate-200" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-6 pb-12 lg:px-8">
          <PageUpdated route="/ai-video-editor" className="text-sm text-slate-400" />
        </div>
        <JsonLd data={breadcrumbSchema([{ name: "AI video editor", url: "/ai-video-editor" }])} />
      </main>
      <SiteFooter />
    </>
  );
}
