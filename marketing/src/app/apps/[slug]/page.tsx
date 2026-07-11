import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  MousePointerClick,
  PencilLine,
  Sparkles,
  Workflow,
} from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { SmartDownloadButton } from "@/app/SmartDownloadButton";
import {
  miniAppEntries,
  relatedMiniApps,
  type MiniAppEntry,
} from "@/data/miniApps";

const BASE_URL = "https://nodetool.ai";

export const dynamicParams = false;

export function generateStaticParams() {
  return miniAppEntries.map((a) => ({ slug: a.slug }));
}

function getEntry(slug: string): MiniAppEntry | undefined {
  return miniAppEntries.find((a) => a.slug === slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = getEntry(slug);
  if (!entry) return {};
  const url = `${BASE_URL}${entry.route}`;
  return {
    title: entry.title,
    description: entry.description,
    alternates: { canonical: url },
    robots: entry.indexable ? undefined : { index: false, follow: true },
    openGraph: {
      title: entry.title,
      description: entry.description,
      url,
      type: "website",
      ...(entry.screenshot
        ? { images: [{ url: `${BASE_URL}${entry.screenshot}` }] }
        : {}),
    },
  };
}

const OUTPUT_LABEL: Record<string, string> = {
  text: "Text",
  image: "Images",
  audio: "Audio",
  video: "Video",
  data: "Structured data",
  progress: "Live progress",
};

export default async function MiniAppPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getEntry(slug);
  if (!entry) notFound();

  const related = relatedMiniApps(entry, miniAppEntries, 6);
  const tagline =
    entry.tagline ||
    entry.summary ||
    `${entry.name} is a ready-to-use AI mini app built with NodeTool.`;

  const steps = [
    {
      icon: <PencilLine className="h-5 w-5 text-sky-400" />,
      title: entry.inputs.length > 0 ? "Fill in a few fields" : "Nothing to configure",
      body:
        entry.inputs.length > 0
          ? `Plain-language inputs — ${entry.inputs
              .slice(0, 3)
              .map((i) => i.label.toLowerCase())
              .join(", ")}${entry.inputs.length > 3 ? ", …" : ""}. No settings, no jargon.`
          : "This app is one button. Sensible defaults are already wired into the workflow.",
    },
    {
      icon: <MousePointerClick className="h-5 w-5 text-sky-400" />,
      title: `Click “${entry.buttonLabel}”`,
      body: "The workflow runs behind the scenes — on your machine or with your own provider keys. You pay providers directly, or run local models for free.",
    },
    {
      icon: <Sparkles className="h-5 w-5 text-sky-400" />,
      title: "Watch results stream in",
      body:
        entry.outputs.length > 0
          ? `Results appear live in the app: ${entry.outputs
              .map((o) => o.label.toLowerCase())
              .slice(0, 4)
              .join(", ")}.`
          : "Results appear live in the app as the workflow streams them.",
    },
  ];

  const appLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: entry.name,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "macOS, Windows, Linux",
    description: tagline,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: `${BASE_URL}${entry.route}`,
    ...(entry.screenshot ? { screenshot: `${BASE_URL}${entry.screenshot}` } : {}),
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040408] text-white">
      <SiteHeader />
      <JsonLd data={appLd} />

      <div className="relative pt-28">
        {/* Hero */}
        <section className="relative pt-10 pb-10">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <a
              href="/apps"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              All mini apps
            </a>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-300">
              Mini App
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              {entry.heading}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
              {tagline}
            </p>
            <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(56,189,248,0.6)] transition-all hover:bg-sky-400"
              />
              <a
                href={entry.templateRoute}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0a0a14]/70 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:border-white/25 hover:bg-white/5"
              >
                <Workflow className="h-4 w-4" />
                See the workflow behind it
              </a>
            </div>
          </div>
        </section>

        {/* App screenshot */}
        {entry.screenshot && (
          <section className="relative pb-6">
            <div className="mx-auto max-w-5xl px-6 lg:px-8">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#16161c] shadow-[0_30px_100px_-20px_rgba(56,189,248,0.15)]">
                <Image
                  src={entry.screenshot}
                  alt={`${entry.name} — the mini app, ready to run`}
                  width={1960}
                  height={1400}
                  className="w-full"
                  priority
                />
              </div>
              <p className="mt-3 text-center text-xs text-slate-500">
                The actual app, as it opens in NodeTool — built with the visual
                App Builder, no code.
              </p>
            </div>
          </section>
        )}

        {/* In / Out */}
        <section className="relative py-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8">
                <h2 className="text-xl font-bold tracking-tight">
                  What you put in
                </h2>
                {entry.inputs.length > 0 ? (
                  <ul className="mt-5 space-y-3">
                    {entry.inputs.map((input) => (
                      <li
                        key={input.label}
                        className="flex items-center gap-3 text-slate-300"
                      >
                        <span className="rounded-md border border-white/10 bg-slate-950/60 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-slate-400">
                          {input.kind}
                        </span>
                        {input.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-5 text-slate-400">
                    Nothing — this one runs with a single click.
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8">
                <h2 className="text-xl font-bold tracking-tight">
                  What you get out
                </h2>
                <ul className="mt-5 space-y-3">
                  {entry.outputs.map((output) => (
                    <li
                      key={output.label}
                      className="flex items-center gap-3 text-slate-300"
                    >
                      <span className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-sky-300">
                        {OUTPUT_LABEL[output.kind] ?? output.kind}
                      </span>
                      {output.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="relative py-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="mb-8 text-2xl font-bold tracking-tight md:text-3xl">
              How it works
            </h2>
            <ol className="grid gap-5 md:grid-cols-3">
              {steps.map((step, i) => (
                <li
                  key={step.title}
                  className="rounded-2xl border border-white/10 bg-slate-900/40 p-6"
                >
                  <div className="flex items-center gap-3">
                    {step.icon}
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Step {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-3 font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Remix pitch */}
        <section className="relative py-12">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 to-transparent p-8 md:p-10">
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                It&apos;s an app until you want more
              </h2>
              <p className="mt-4 max-w-2xl leading-relaxed text-slate-300">
                Every mini app is a real NodeTool workflow underneath. Open the
                canvas to swap models, change prompts, or add steps — then
                publish your remix as a new app for your team.
              </p>
              <a
                href={entry.templateRoute}
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-sky-400 transition-colors hover:text-sky-300"
              >
                Explore the {entry.name} workflow
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>

        {/* Related */}
        {related.length > 0 && (
          <section className="relative py-12 pb-24">
            <div className="mx-auto max-w-6xl px-6 lg:px-8">
              <h2 className="mb-8 text-2xl font-bold tracking-tight md:text-3xl">
                More mini apps
              </h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((r) => (
                  <a
                    key={r.slug}
                    href={r.route}
                    className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 transition-all hover:border-sky-500/40"
                  >
                    {r.screenshot ? (
                      <div className="relative aspect-[16/10] overflow-hidden border-b border-white/5 bg-[#16161c]">
                        <Image
                          src={r.screenshot}
                          alt={`${r.name} mini app`}
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="object-cover object-top"
                        />
                      </div>
                    ) : null}
                    <div className="p-5">
                      <div className="font-semibold text-white">{r.heading}</div>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-400">
                        {r.tagline || r.summary}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
