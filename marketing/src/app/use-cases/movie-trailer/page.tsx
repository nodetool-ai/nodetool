"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Play,
  FileText,
  Sparkles,
  Image as ImageIcon,
  Film,
  RefreshCw,
  SlidersHorizontal,
  Wand2,
  Repeat,
  Check,
} from "lucide-react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import { SmartDownloadButton } from "../../SmartDownloadButton";
import MovieTrailerGraph from "../../../components/MovieTrailerGraph";

const shots = [
  { src: "/trailer-shot-1.png", caption: "Blown supercharger spits fire down the straight" },
  { src: "/trailer-shot-2.png", caption: "A raider hauls the war-rig in by the chain" },
  { src: "/trailer-shot-3.png", caption: "Tires tear through the canyon floor" },
  { src: "/trailer-shot-4.png", caption: "A lone rider guns it through the ruins" },
  { src: "/trailer-shot-5.png", caption: "Last repairs before the run" },
  { src: "/trailer-shot-6.png", caption: "The getaway car breaks loose across the flats" },
];

const steps = [
  {
    icon: FileText,
    title: "Start with one line",
    body: "Type the logline. Two more inputs set the visual style and the shot count, that's the entire brief.",
    detail: "A getaway driver outruns a collapsing bridge · gritty daylight · 6 shots",
  },
  {
    icon: Sparkles,
    title: "Treatment, then shots",
    body: "A Prompt frames the brief, a showrunner agent returns a teaser treatment, and a list generator breaks it into concrete, one-line shots.",
    detail: "Tone · beat arc · motifs · palette → 6 shots",
  },
  {
    icon: ImageIcon,
    title: "Render the key art",
    body: "Each shot is templated into a key-art prompt, then a text-to-image model renders it as a cinematic 16:9 frame.",
    detail: "2K · anamorphic framing · film grain · no on-screen text",
  },
  {
    icon: Film,
    title: "Animate and cut",
    body: "An image-to-video model animates every frame, then a Concat node stitches them into one finished trailer.",
    detail: "Image-to-Video · 720p · auto-concatenated",
  },
];

const tweaks = [
  {
    icon: RefreshCw,
    title: "Swap the video model",
    body: "Veo, Seedance, Kling, Runway. Change one node and the treatment, shots, and key art stay exactly the same.",
  },
  {
    icon: SlidersHorizontal,
    title: "Redirect the showrunner",
    body: "Rewrite the agent's system prompt for horror, comedy, or arthouse without touching the pipeline.",
  },
  {
    icon: Wand2,
    title: "Restyle every shot",
    body: "The visual-style input flows into each key-art prompt. Change one line and the whole trailer shifts mood.",
  },
  {
    icon: Repeat,
    title: "Re-run any story",
    body: "Drop in a new logline and run it again. The workflow is the reusable part, not this trailer.",
  },
];

const models = [
  {
    name: "Gemini 3.1 Pro Preview",
    role: "Writes the treatment and shot list",
    provider: "Gemini",
  },
  {
    name: "GPT Image-2",
    role: "Renders each shot's key art",
    provider: "kie",
  },
  {
    name: "Veo 3.1 Preview",
    role: "Animates the frames into video",
    provider: "Gemini",
  },
];

export default function MovieTrailerUseCase() {
  return (
    <main className="relative min-h-screen overflow-hidden text-white bg-[#040408]">
      {/* Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute top-[22%] -left-40 h-[520px] w-[520px] rounded-full bg-amber-600/20 blur-[140px]"
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-[30%] -right-40 h-[480px] w-[480px] rounded-full bg-rose-600/20 blur-[140px]"
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mt-8 max-w-3xl"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
                Use case
                <span className="text-amber-500/60">·</span>
                Film
              </div>
              <h1 className="mt-6 text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
                Movie Trailer Generator
              </h1>
              <p className="mt-6 text-lg md:text-xl text-slate-400 leading-relaxed">
                Type one logline and the canvas builds the teaser: a treatment,
                a shot list, key art for every beat — animated and cut into a
                finished trailer. No editor, no studio, one canvas you can
                re-run for any story.
              </p>
            </motion.div>

            {/* Hero video */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="relative mt-12"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-6 rounded-[2rem] opacity-70 blur-3xl"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(245,158,11,0.22), rgba(244,63,94,0.16) 45%, transparent 72%)",
                }}
              />
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-2 shadow-2xl backdrop-blur-sm">
                <video
                  src="/movie_trailer_example.mp4"
                  poster="/trailer-shot-1.png"
                  className="aspect-video w-full rounded-xl"
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                />
              </div>
            </motion.div>

            <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-8 py-3.5 text-sm font-semibold text-black shadow-[0_10px_30px_-10px_rgba(245,158,11,0.6)] transition-all hover:bg-amber-400"
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
                A handful of nodes do the work. One line becomes a treatment, the
                treatment becomes shots, the shots become a trailer.
              </p>
            </div>

            {/* Live graph — the real workflow, rendered from the node UI components */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
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
                    Movie Trailer Generator
                  </span>
                </div>
                <MovieTrailerGraph />
              </div>
            </motion.div>

            {/* Steps */}
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-sm"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-300">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-white">
                    <span className="mr-2 font-mono text-sm text-amber-400">
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

        {/* Six shots, one trailer */}
        <section className="relative py-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-12 max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                Six shots, one trailer
              </h2>
              <p className="mt-4 text-lg text-slate-400 leading-relaxed">
                Every beat is rendered as its own cinematic frame, then animated
                and cut together. Here is a single run, straight off the canvas.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {shots.map((shot, i) => (
                <motion.div
                  key={shot.src}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: (i % 3) * 0.05 }}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50"
                >
                  <Image
                    src={shot.src}
                    alt={shot.caption}
                    width={1672}
                    height={941}
                    className="aspect-video w-full object-cover"
                  />
                  <div className="flex items-center gap-2 border-t border-white/5 px-4 py-3 text-sm leading-relaxed text-slate-400">
                    <span className="font-mono text-xs text-amber-400">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {shot.caption}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* The assembled output */}
            <div className="mt-10 flex items-center gap-3 text-sm font-medium uppercase tracking-wide text-slate-400">
              <span className="h-px flex-1 bg-white/10" />
              <ArrowRight className="h-4 w-4 rotate-90 text-amber-400" />
              Cut into the trailer
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6 }}
              className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50"
            >
              <video
                src="/movie_trailer_example.mp4"
                poster="/trailer-shot-1.png"
                className="aspect-video w-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                controls
              />
              <div className="border-t border-white/5 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                Output · the assembled teaser
              </div>
            </motion.div>
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
                Nothing here is locked. Swap models, change the tone, or point it
                at a different story.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {tweaks.map((tweak, i) => (
                <motion.div
                  key={tweak.title}
                  initial={{ opacity: 0, y: 20 }}
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
                    not from us, and you can switch any of them for a better model
                    the day it ships.
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
              Cut your first trailer
            </h2>
            <p className="mt-4 text-lg text-slate-400 leading-relaxed">
              Free, open source, and yours to run. Download Studio, open this
              workflow, and build a teaser from one line today.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-8 py-3.5 text-sm font-semibold text-black shadow-[0_10px_30px_-10px_rgba(245,158,11,0.6)] transition-all hover:bg-amber-400"
              />
              <a
                href="/#use-cases"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0a0a14]/70 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:border-white/25 hover:bg-white/5"
              >
                More use cases
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
