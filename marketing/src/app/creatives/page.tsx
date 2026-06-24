"use client";
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  Sparkles,
  Play,
  Video,
  Music,
  Layers,
  Brush,
  Wand2,
  ArrowRight,
  Check,
  Download,
  Zap,
  Shield,
  Command,
  Monitor,
} from "lucide-react";
import CommunitySection from "../../components/CommunitySection";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import UseCasesShowcase from "../../components/UseCasesShowcase";

// Features for creative professionals
const creativeFeatures = [
  {
    title: "Visual Workflow Canvas",
    description:
      "Build complex creative pipelines by connecting nodes. See your entire process at a glance and iterate faster.",
    icon: Layers,
    image: "/screen_canvas.png",
    features: [
      "Infinite canvas",
      "Real-time execution graph",
      "Custom sub-graphs",
    ],
  },
  {
    title: "Image generation & editing",
    description:
      "Run Flux, Qwen-Image, Nano-Banana, Z-Image, gpt-image, and friends. Generate, mask, inpaint, outpaint, relight, and upscale — all on the canvas.",
    icon: Wand2,
    image: "/disaster_girl.mp4",
    features: ["Masks, inpaint, outpaint", "Multi-model support", "Batch processing"],
  },
  {
    title: "Video pipelines",
    description:
      "Wire Seedance, Kling, Veo, Runway, and Sora alongside your edit nodes. Generate, transform, and stitch — without exporting between tools.",
    icon: Video,
    image: "/sora.mp4",
    features: [
      "Frame-accurate edits",
      "Temporal smoothing",
      "Format transcoding",
    ],
  },
  {
    title: "Audio on the same surface",
    description:
      "Compose with Suno, generate voice with ElevenLabs, transcribe with Whisper. Same canvas, same nodes, no extra tabs.",
    icon: Music,
    image: "/suno.png",
    features: ["Stem separation", "Music generation", "Voice generation"],
  },
];

// Workflow examples
export default function CreativesPage() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch("https://api.github.com/repos/nodetool-ai/nodetool")
      .then((r) => r.json())
      .then((j) => {
        if (typeof j.stargazers_count === "number") {
          setStars(j.stargazers_count);
        }
      })
      .catch(() => { });
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden text-white bg-[#040408]">
      {/* Background — left rose flare + right cyan flare, faint star field */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute top-[28%] -left-40 h-[520px] w-[520px] rounded-full bg-rose-600/25 blur-[140px]"
          animate={{ opacity: [0.55, 0.85, 0.55] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-[20%] -right-40 h-[480px] w-[480px] rounded-full bg-cyan-500/20 blur-[140px]"
          animate={{ opacity: [0.5, 0.8, 0.5] }}
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
        {/* Hero Section */}
        <section className="relative pt-16 pb-24 lg:pt-24 lg:pb-32 overflow-hidden">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-5xl text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="relative inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full border border-rose-500/30 bg-gradient-to-r from-rose-500/[0.08] via-amber-500/[0.05] to-cyan-500/[0.08] mb-10 shadow-[0_0_40px_-10px_rgba(244,63,94,0.35)]">
                  <Sparkles className="w-4 h-4 text-rose-400" />
                  <span className="text-sm font-medium text-white tracking-wide">
                    The open canvas for working creatives
                  </span>
                </div>

                <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.05] mb-10">
                  <span className="text-white">Think it.</span>{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-amber-300 via-emerald-300 to-cyan-400">
                    Generate it.
                  </span>
                  <br />
                  <span className="text-white/90 text-3xl md:text-5xl lg:text-6xl">
                    Image, music &amp; video in one studio.
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed">
                  Every model. Your keys. Your canvas. Wire Seedance, Kling, Veo, Runway,
                  Luma, Suno, Flux, and more on one open-source surface — no credit markup, no vendor lock-in.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
                  <a
                    href="https://github.com/nodetool-ai/nodetool/releases"
                    className="group relative inline-flex items-center gap-2.5 px-9 py-4 rounded-full bg-rose-500 text-white font-semibold transition-all shadow-[0_10px_30px_-10px_rgba(244,63,94,0.6)] hover:bg-rose-400 hover:shadow-[0_14px_40px_-10px_rgba(244,63,94,0.75)]"
                  >
                    <Download className="w-5 h-5" />
                    Download
                  </a>
                  <a
                    href="#features"
                    className="inline-flex items-center gap-2.5 px-9 py-4 rounded-full border border-white/15 bg-[#0a0a14]/70 backdrop-blur-sm text-white font-semibold hover:bg-white/5 hover:border-white/25 transition-all"
                  >
                    <Play className="w-5 h-5" />
                    See How It Works
                  </a>
                </div>

                <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-slate-300">
                  <li className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
                      <Command className="w-4 h-4 text-amber-300" />
                    </span>
                    Open Source
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                      <Shield className="w-4 h-4 text-emerald-300" />
                    </span>
                    Privacy-First
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
                      <Monitor className="w-4 h-4 text-cyan-300" />
                    </span>
                    macOS &middot; Windows &middot; Linux
                  </li>
                </ul>
              </motion.div>
            </div>

            {/* Hero Visual */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="mt-20 relative"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-[#050510] via-transparent to-transparent z-10 pointer-events-none" />
              <div className="relative rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl shadow-rose-500/10">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/80">
                  <div className="w-3 h-3 rounded-full bg-rose-500/50" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
                  <span className="ml-4 text-xs text-slate-400 font-medium">
                    Creative Workflow Canvas
                  </span>
                </div>
                <video
                  src="/demo.mp4"
                  className="w-full"
                  controls
                  playsInline
                />
              </div>
            </motion.div>
          </div>
        </section>

        {/* Use cases — real workflows with their own walkthrough pages */}
        <UseCasesShowcase />

        {/* Timeline Editor Section */}
        <section className="py-20 relative">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12 max-w-3xl mx-auto"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80 mb-3">
                Built-in video editor
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
                Generate AI video and audio straight onto the timeline.
              </h2>
              <p className="text-lg text-slate-400 leading-relaxed">
                Type a prompt at the playhead, pick a model, and the new clip drops onto
                the track — video and audio on one multi-track timeline. Trim, split, and
                arrange like any editor, then export a finished cut without ever leaving
                NodeTool.
              </p>
            </motion.div>

            <motion.figure
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <div className="relative rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur overflow-hidden shadow-2xl shadow-cyan-500/10">
                <Image
                  src="/creatives_timeline.png"
                  alt="NodeTool's built-in timeline editor: a preview player above a multi-track timeline with AI-generated video clips on three video tracks and an audio waveform, plus a 'Generate a video at the playhead' prompt bar with a model selector and an Export button"
                  width={2000}
                  height={1220}
                  className="w-full h-auto"
                  loading="lazy"
                />
              </div>
            </motion.figure>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  title: "Generate at the playhead",
                  description:
                    "Prompt a model and the resulting clip lands on the track right under the playhead — no import step.",
                  icon: Sparkles,
                },
                {
                  title: "Multi-track video & audio",
                  description:
                    "AI video and AI audio sit on the same timeline. Stack tracks, trim, split, and rearrange clips.",
                  icon: Layers,
                },
                {
                  title: "Export a finished cut",
                  description:
                    "Render the whole sequence to a single video — the edit happens where you generate, not in another app.",
                  icon: Download,
                },
              ].map((highlight, index) => (
                <motion.div
                  key={highlight.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="rounded-2xl border border-white/10 bg-[#0a0a14]/70 backdrop-blur-sm p-6"
                >
                  <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-4">
                    <highlight.icon className="w-6 h-6 text-amber-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {highlight.title}
                  </h3>
                  <p className="text-slate-400 leading-relaxed text-[0.95rem]">
                    {highlight.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Sketch Editor Section — sibling to the timeline editor */}
        <section className="py-20 relative">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12 max-w-3xl mx-auto"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-300/80 mb-3">
                Built-in sketch editor
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
                Paint and generate on the same canvas.
              </h2>
              <p className="text-lg text-slate-400 leading-relaxed">
                A full layer-based image editor lives inside Studio. Paint with real
                brushes, stack layers and blend modes, then prompt a model to create or
                refine any layer — and export a finished PNG without ever leaving the
                canvas.
              </p>
            </motion.div>

            <motion.figure
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <div className="relative rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur overflow-hidden shadow-2xl shadow-rose-500/10">
                <Image
                  src="/screen_sketch_editor.webp"
                  alt="NodeTool's built-in sketch editor: a layered canvas holding an AI-generated 'Kung Fu' movie poster, with a brush toolbar and brush settings across the top, a color picker and a layers panel with text-to-image layers on the right, and a 'Describe the image' generate bar with a Flux Schnell model selector and an Export PNG button"
                  width={2000}
                  height={1377}
                  className="w-full h-auto"
                  loading="lazy"
                />
              </div>
            </motion.figure>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  title: "A real brush engine",
                  description:
                    "Round, soft, airbrush, and spray brushes with size, opacity, hardness, and angle. Pick any color and paint straight onto the canvas.",
                  icon: Brush,
                },
                {
                  title: "Layers & blend modes",
                  description:
                    "Stack layers, set opacity and blend modes, reorder and mask — the same controls you reach for in a pro image editor.",
                  icon: Layers,
                },
                {
                  title: "Generate onto a layer",
                  description:
                    "Describe an image and it lands on its own layer. Mix hand-painted strokes with text-to-image and image-to-image right where you draw.",
                  icon: Sparkles,
                },
              ].map((highlight, index) => (
                <motion.div
                  key={highlight.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="rounded-2xl border border-white/10 bg-[#0a0a14]/70 backdrop-blur-sm p-6"
                >
                  <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-4">
                    <highlight.icon className="w-6 h-6 text-amber-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {highlight.title}
                  </h3>
                  <p className="text-slate-400 leading-relaxed text-[0.95rem]">
                    {highlight.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/20 to-transparent pointer-events-none" />

          <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <div className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-teal-500/10 border border-teal-500/20">
                <Zap className="w-8 h-8 text-amber-400" />
              </div>
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                One canvas for <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-cyan-400">
                  every modality
                </span>
              </h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                The same models the studios use — Seedance, Kling, Luma, Suno, Flux —
                wired into one node-based canvas, with masks, inpaint, outpaint,
                relight, upscale, and compositing built in.
              </p>
            </motion.div>

            <div className="space-y-24">
              {creativeFeatures.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.6 }}
                  className={`flex flex-col ${index % 2 === 0 ? "lg:flex-row" : "lg:flex-row-reverse"
                    } items-center gap-12`}
                >
                  <div className="flex-1">
                    <div className="w-14 h-14 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-6">
                      <feature.icon className="w-7 h-7 text-amber-400" />
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                      {feature.title}
                    </h3>
                    <p className="text-lg text-slate-400 leading-relaxed mb-6">
                      {feature.description}
                    </p>
                    <ul className="space-y-3">
                      {feature.features.map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-3 text-slate-300"
                        >
                          <Check className="w-5 h-5 text-emerald-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex-1 w-full">
                    <div className="relative rounded-xl border border-white/10 bg-slate-900/50 backdrop-blur overflow-hidden shadow-2xl">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/80">
                        <div className="w-3 h-3 rounded-full bg-rose-500/50" />
                        <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
                      </div>
                      {feature.image.endsWith(".mp4") ? (
                        <video
                          src={feature.image}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="w-full"
                        />
                      ) : (
                        <Image
                          src={feature.image}
                          alt={feature.title}
                          width={800}
                          height={500}
                          className="w-full"
                          loading="lazy"
                        />
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-24 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-950/20 to-transparent pointer-events-none" />

          <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                Why creatives{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                  choose NodeTool
                </span>
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  title: "Your work, your machine",
                  description:
                    "Studio runs on your computer. Your prompts, files, and outputs stay on your disk unless you choose to share them.",
                  icon: Shield,
                  color: "text-emerald-400",
                  bgColor: "bg-emerald-500/10",
                  borderColor: "border-emerald-500/20",
                },
                {
                  title: "No credits. No markup.",
                  description:
                    "Studio is free and open source under AGPL-3.0. Bring your own keys to every provider and pay providers directly.",
                  icon: Sparkles,
                  color: "text-amber-400",
                  bgColor: "bg-amber-500/10",
                  borderColor: "border-amber-500/20",
                },
                {
                  title: "Every model on one canvas",
                  description:
                    "Seedance, Kling, Veo, Runway, Luma, Suno, ElevenLabs, Flux, Ideogram, and more — switch the moment a better one ships.",
                  icon: Zap,
                  color: "text-amber-400",
                  bgColor: "bg-teal-500/10",
                  borderColor: "border-teal-500/20",
                },
              ].map((benefit, index) => (
                <motion.div
                  key={benefit.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="text-center"
                >
                  <div
                    className={`w-16 h-16 mx-auto rounded-2xl ${benefit.bgColor} border ${benefit.borderColor} flex items-center justify-center mb-6`}
                  >
                    <benefit.icon className={`w-8 h-8 ${benefit.color}`} />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-3">
                    {benefit.title}
                  </h3>
                  <p className="text-slate-400 leading-relaxed">
                    {benefit.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Community Section */}
        <CommunitySection id="community" variant="creatives" stars={stars} />

        {/* CTA Section */}
        <section className="py-24 relative">
          <div className="mx-auto max-w-4xl px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                Every model. Your keys. <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-amber-400 to-cyan-400">
                  Your canvas.
                </span>
              </h2>
              <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
                Download NodeTool, plug in the providers you already pay for,
                and start wiring your next piece on a canvas you actually own.
              </p>
              <a
                href="https://github.com/nodetool-ai/nodetool/releases"
                className="group inline-flex items-center gap-2 px-10 py-5 rounded-xl bg-gradient-to-r from-rose-500 to-teal-600 text-white text-lg font-semibold hover:from-rose-400 hover:to-teal-500 transition-all shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40"
              >
                <Download className="w-6 h-6" />
                Download NodeTool
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </motion.div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
