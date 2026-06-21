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
  Wand2,
  Sparkles,
  Clapperboard,
  RefreshCw,
  SlidersHorizontal,
  Repeat,
  Check,
} from "lucide-react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import { SmartDownloadButton } from "../../SmartDownloadButton";
import WorkflowGraph from "../../../components/WorkflowGraph";

const steps = [
  {
    icon: FileText,
    title: "Feed in the campaign",
    body: "Three text inputs hold the brief, the target audience, and the key features. A product photo goes in alongside them as the hero shot.",
    detail:
      "Aurora Trail smart fitness watch · active millennials who hike · GPS, heart-rate, adaptive coaching, water resistance",
  },
  {
    icon: Wand2,
    title: "Assemble the prompt",
    body: "A Prompt node templates those inputs into a precise, rule-based request: one camera move, one subject action, lighting, color anchors, and hard constraints.",
    detail: "No on-screen text, no logos, no watermarks, no distorted anatomy",
  },
  {
    icon: Sparkles,
    title: "Direct the shot",
    body: "An agent turns the request into a concrete, cinematic prompt with framing, lens, and motion cues, the part most people get wrong by hand.",
    detail: "Gemini 3.1 Pro · 50mm macro push over the watch on a wet river rock at dawn",
  },
  {
    icon: Clapperboard,
    title: "Render the video",
    body: "A text-to-video model animates the product photo from the agent's prompt into a finished, launch-ready clip.",
    detail: "Veo 3.1 · 16:9 · 720p · 8 seconds · rendered in ~44s",
  },
];

const tweaks = [
  {
    icon: RefreshCw,
    title: "Swap the video model",
    body: "Veo, Seedance, Kling, Runway. Change one node, the rest of the graph stays exactly the same.",
  },
  {
    icon: SlidersHorizontal,
    title: "Retune the agent",
    body: "Rewrite the system prompt for a luxury, playful, or hyper-technical tone without touching the pipeline.",
  },
  {
    icon: Clapperboard,
    title: "Change the format",
    body: "Aspect ratio, resolution, and duration all live on the video node. Go vertical for social in one click.",
  },
  {
    icon: Repeat,
    title: "Reuse for any product",
    body: "Drop in a new photo and brief, run it again. The workflow is the reusable part, not the output.",
  },
];

const models = [
  {
    name: "Gemini 3.1 Pro Preview",
    role: "Writes the video prompt",
    provider: "Gemini",
  },
  {
    name: "Veo 3.1 Preview",
    role: "Renders the clip from the product photo",
    provider: "Gemini",
  },
];

export default function ProductLaunchVideoUseCase() {
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mt-8 max-w-3xl"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-300">
                Use case
                <span className="text-sky-500/60">·</span>
                Marketing
              </div>
              <h1 className="mt-6 text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
                AI Product Launch Video Generator
              </h1>
              <p className="mt-6 text-lg md:text-xl text-slate-400 leading-relaxed">
                Turn a campaign brief and a single product photo into a
                cinematic, launch-ready 16:9 video. No editor, no agency, one
                canvas you can re-run for every new product.
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
                    "radial-gradient(ellipse at center, rgba(56,189,248,0.22), rgba(139,92,246,0.16) 45%, transparent 72%)",
                }}
              />
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-2 shadow-2xl backdrop-blur-sm">
                <video
                  src="/product_video_example.mp4"
                  poster="/smartwatch.png"
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
                Four nodes do the work. Inputs become a prompt, the prompt
                becomes a shot, the shot becomes a video.
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
                    AI Product Launch Video Generator
                  </span>
                </div>
                <WorkflowGraph />
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

        {/* Input to output */}
        <section className="relative py-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-12 max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                One photo in, a launch clip out
              </h2>
              <p className="mt-4 text-lg text-slate-400 leading-relaxed">
                The whole pipeline runs from a single product render. Same
                graph, any product.
              </p>
            </div>

            <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto_1.4fr]">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
                <Image
                  src="/smartwatch.png"
                  alt="Input product photo of the smart watch"
                  width={1024}
                  height={768}
                  className="aspect-[4/3] w-full object-cover"
                />
                <div className="border-t border-white/5 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Input · product photo
                </div>
              </div>

              <div className="flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-slate-900/70 text-slate-300">
                  <ArrowRight className="h-5 w-5 rotate-90 lg:rotate-0" />
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
                <video
                  src="/product_video_example.mp4"
                  poster="/smartwatch.png"
                  className="aspect-video w-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
                <div className="border-t border-white/5 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Output · 8s cinematic spot
                </div>
              </div>
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
                Nothing here is locked. Swap models, change the tone, or point it
                at a different product.
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
              Build your launch video
            </h2>
            <p className="mt-4 text-lg text-slate-400 leading-relaxed">
              Free, open source, and yours to run. Download Studio, open this
              workflow, and ship your first spot today.
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
