"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Download,
  Play,
  FileText,
  Wand2,
  Sparkles,
  List,
  RefreshCw,
  SlidersHorizontal,
  Repeat,
  Image as ImageIcon,
  Check,
} from "lucide-react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import { SmartDownloadButton } from "../../SmartDownloadButton";
import MoviePosterGraph from "../../../components/MoviePosterGraph";

const posters = [
  { src: "/poster-singularity-1.png", caption: "“The end of time isn't the end.”" },
  { src: "/poster-singularity-2.png", caption: "“The end of limits. The beginning of everything.”" },
  { src: "/poster-singularity-3.png", caption: "“The future is not ours to control.”" },
  { src: "/poster-singularity-4.png", caption: "“The end of man is only the beginning.”" },
  { src: "/poster-singularity-5.png", caption: "“The future doesn't evolve. It accelerates.”" },
];

const steps = [
  {
    icon: FileText,
    title: "Set the brief",
    body: "Three text inputs hold the film's title, its genre, and the audience you're selling to. That's the entire creative input.",
    detail: "Singularity · Sci-Fi · AI Enthusiasts",
  },
  {
    icon: Wand2,
    title: "Write the strategy",
    body: "A Prompt node frames the brief and an agent returns a real creative strategy: positioning, audience insight, a core visual concept, and a color palette.",
    detail: "Positioning · audience insight · hex palette",
  },
  {
    icon: List,
    title: "Spin up concepts",
    body: "A list generator turns the strategy into a batch of distinct plot angles, so one run gives you a spread of directions, not a single guess.",
    detail: "Five plot concepts per run",
  },
  {
    icon: ImageIcon,
    title: "Render the key art",
    body: "Each concept is templated into a full theatrical poster prompt, then an image model renders it, title, tagline, billing block and all.",
    detail: "GPT Image-2 · 2K · authentic Hollywood layout",
  },
];

const tweaks = [
  {
    icon: RefreshCw,
    title: "Swap the image model",
    body: "GPT Image-2, Flux, Nano Banana, Ideogram. Change one node and the whole batch re-renders in a new look.",
  },
  {
    icon: SlidersHorizontal,
    title: "Shift the tone",
    body: "Change the genre or audience and the strategy, palette, and posters all follow, no manual re-briefing.",
  },
  {
    icon: Wand2,
    title: "Edit the poster recipe",
    body: "The poster Prompt node owns the composition, typography, and billing-block layout. Tune it once, every render obeys.",
  },
  {
    icon: Repeat,
    title: "Batch any title",
    body: "Drop in a new title and run it again. The workflow is the reusable part; the posters are just this run's output.",
  },
];

const models = [
  {
    name: "Gemini 3.1 Pro Preview",
    role: "Writes the strategy and plot concepts",
    provider: "Gemini",
  },
  {
    name: "GPT Image-2",
    role: "Renders the poster key art",
    provider: "kie",
  },
];

export default function MoviePosterUseCase() {
  return (
    <main className="relative min-h-screen overflow-hidden text-white bg-[#040408]">
      {/* Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute top-[22%] -left-40 h-[520px] w-[520px] rounded-full bg-sky-600/20 blur-[140px]"
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-[30%] -right-40 h-[480px] w-[480px] rounded-full bg-violet-600/20 blur-[140px]"
          animate={{ opacity: [0.45, 0.75, 0.45] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
            backgroundSize: "120px 120px",
          }}
        />
      </div>

      <SiteHeader />

      <div className="relative pt-28">
        {/* Hero */}
        <section className="relative pt-12 pb-16 lg:pt-16 lg:pb-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <a
              href="/#use-cases"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Use cases
            </a>

            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mt-8 max-w-3xl"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-300">
                Use case
                <span className="text-sky-500/60">·</span>
                Design
              </div>
              <h1 className="mt-6 text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
                Movie Poster Generator
              </h1>
              <p className="mt-6 text-lg md:text-xl text-slate-400 leading-relaxed">
                Type a title, a genre, and an audience. The canvas writes a real
                creative strategy and renders a batch of cinematic poster
                concepts, no designer, no brief deck, one canvas you can re-run
                for any film.
              </p>
            </motion.div>

            {/* Hero triptych */}
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="relative mt-12"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-6 rounded-[2rem] opacity-70 blur-3xl"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(56,189,248,0.22), rgba(139,92,246,0.16) 45%, transparent 72%)",
                }}
              />
              <div className="relative flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-5 sm:gap-4 sm:overflow-visible sm:pb-0">
                {posters.map((p) => (
                  <div
                    key={p.src}
                    className="w-40 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-900/60 shadow-2xl sm:w-auto"
                  >
                    <Image
                      src={p.src}
                      alt="AI-generated movie poster for the fictional film Singularity"
                      width={1024}
                      height={1536}
                      className="aspect-[2/3] w-full object-cover"
                      priority
                    />
                  </div>
                ))}
              </div>
            </motion.div>

            <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(56,189,248,0.6)] transition-all hover:bg-sky-400"
              />
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0a0a14]/70 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:border-white/25 hover:bg-white/5"
              >
                <Play className="h-4 w-4" />
                See how it works
              </a>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="relative scroll-mt-28 py-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-12 max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                How it works
              </h2>
              <p className="mt-4 text-lg text-slate-400 leading-relaxed">
                A handful of nodes do the work. A brief becomes a strategy, the
                strategy becomes concepts, the concepts become key art.
              </p>
            </div>

            {/* Live graph — the real workflow, rendered from the node UI components */}
            <motion.div
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6 }}
            >
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl backdrop-blur-sm">
                <div className="flex items-center gap-2 border-b border-white/5 bg-slate-900/80 px-4 py-3">
                  <div className="h-3 w-3 rounded-full bg-sky-500/40" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/40" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/40" />
                  <span className="ml-3 text-xs font-medium text-slate-400">
                    Workflow Editor
                  </span>
                  <span className="ml-auto hidden text-xs font-medium text-slate-500 sm:block">
                    Movie Posters
                  </span>
                </div>
                <MoviePosterGraph />
              </div>
            </motion.div>

            {/* Steps */}
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={false}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-sm"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-500/25 bg-sky-500/10 text-sky-300">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-white">
                    <span className="mr-2 font-mono text-sm text-sky-400">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {step.body}
                  </p>
                  <p className="mt-3 font-mono text-xs leading-relaxed text-slate-500">
                    {step.detail}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* One title, three audiences */}
        <section className="relative py-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-12 max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                One title. Five concepts.
              </h2>
              <p className="mt-4 text-lg text-slate-400 leading-relaxed">
                Same brief, a fresh strategy each run. Here is{" "}
                <em>Singularity</em> rendered as five poster concepts, straight
                off the canvas.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 lg:grid-cols-5">
              {posters.map((p) => (
                <motion.div
                  key={p.src}
                  initial={false}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5 }}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50"
                >
                  <Image
                    src={p.src}
                    alt={p.caption}
                    width={1024}
                    height={1536}
                    className="aspect-[2/3] w-full object-cover"
                  />
                  <div className="border-t border-white/5 px-4 py-3 text-sm leading-relaxed text-slate-400">
                    {p.caption}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Make it yours */}
        <section className="relative py-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-12 max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                Make it yours
              </h2>
              <p className="mt-4 text-lg text-slate-400 leading-relaxed">
                Nothing here is locked. Swap models, shift the tone, or point it
                at a different title.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {tweaks.map((tweak, i) => (
                <motion.div
                  key={tweak.title}
                  initial={false}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-sm transition-colors hover:border-white/20"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10 text-violet-300">
                    <tweak.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-white">
                    {tweak.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {tweak.body}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Models */}
        <section className="relative py-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-8 backdrop-blur-sm md:p-12">
              <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                    Models in this workflow
                  </h2>
                  <p className="mt-4 text-slate-400 leading-relaxed">
                    Called with your own keys. The bill comes from the provider,
                    not from us, and you can switch any of them for a better
                    model the day it ships.
                  </p>
                  <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300">
                    <Check className="h-4 w-4" />
                    Bring your own keys
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  {models.map((model) => (
                    <div
                      key={model.name}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/50 px-5 py-4"
                    >
                      <div>
                        <div className="font-semibold text-white">
                          {model.name}
                        </div>
                        <div className="mt-1 text-sm text-slate-400">
                          {model.role}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-md border border-white/10 bg-slate-900/70 px-2.5 py-1 text-xs font-medium text-slate-300">
                        {model.provider}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="relative py-24">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Design your poster set
            </h2>
            <p className="mt-4 text-lg text-slate-400 leading-relaxed">
              Free, open source, and yours to run. Download Studio, open this
              workflow, and render a campaign in minutes.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(56,189,248,0.6)] transition-all hover:bg-sky-400"
              />
              <a
                href="/#use-cases"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0a0a14]/70 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:border-white/25 hover:bg-white/5"
              >
                More use cases
                <ArrowLeft className="h-4 w-4 rotate-180" />
              </a>
            </div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
