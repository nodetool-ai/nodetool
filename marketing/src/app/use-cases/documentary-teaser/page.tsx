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
  Image as ImageIcon,
  Film,
  Clapperboard,
  RefreshCw,
  Users,
  Wand2,
  Scissors,
  Check,
} from "lucide-react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import FaqSection from "../../../components/FaqSection";
import { documentaryTeaserUseCase } from "../../../data/useCaseEntries";
import { SmartDownloadButton } from "../../SmartDownloadButton";

/**
 * The six shots of DEEP — Life Below the Light, exported from the storyboard
 * that made them. Each card carries the still, the action line that rendered
 * it, and the length of the clip it was animated into; the six clips in this
 * order are the teaser at the top of the page.
 */
const shots = [
  {
    src: "/deep-shot-1.jpg",
    title: "Surface at dusk",
    seconds: 4,
    prompt:
      "Aerial wide at dusk: lone research vessel on a glass-calm Pacific Ocean, a distant storm cell flashing on the horizon. Title card space in upper third.",
  },
  {
    src: "/deep-shot-2.jpg",
    title: "The descent",
    seconds: 4,
    prompt:
      "Underwater descent: a two-person submersible's headlights cutting through ink-black water, marine snow drifting upward past the porthole.",
  },
  {
    src: "/deep-shot-3.jpg",
    title: "First encounter",
    seconds: 5,
    prompt:
      "A slow drift through a field of bioluminescent jellyfish pulsing electric cyan against pure darkness, tentacles trailing like circuitry.",
  },
  {
    src: "/deep-shot-4.jpg",
    title: "The eye",
    seconds: 4,
    prompt:
      "Creature reveal: extreme close-up of a colossal squid's eye reflecting the submersible's floodlights, skin rippling with chromatophore waves.",
  },
  {
    src: "/deep-shot-5.jpg",
    title: "The vent city",
    seconds: 4,
    prompt:
      "A towering hydrothermal black smoker field, superheated water shimmering, dense swarms of white shrimp circling like snowflakes in reverse.",
  },
  {
    src: "/deep-shot-6.jpg",
    title: "The whale",
    seconds: 5,
    prompt:
      "Finale: a tiny freediver suspended in the void as an immense bioluminescent whale glides overhead, its photophore pattern glowing like a mapped galaxy.",
  },
];

/** One line, under every prompt above — the whole look of the film. */
const STYLE_BIBLE =
  "IMAX 70mm look, volumetric light shafts, deep teal-and-black palette with cyan and magenta bioluminescent accents, subtle film grain · 16:9";

/** Step text is shared with the page's HowTo schema — see data/useCaseEntries. */
const stepIcons = [FileText, Clapperboard, ImageIcon, Film];
const steps = documentaryTeaserUseCase.steps.map((step, i) => ({
  ...step,
  icon: stepIcons[i],
}));

const tweaks = [
  {
    icon: RefreshCw,
    title: "Swap the video model",
    body: "Veo, Seedance, Kling, Runway — pick a different one and render that shot again. The board, the stills, and every clip you already approved stay exactly as they are.",
  },
  {
    icon: Wand2,
    title: "Restyle the whole series",
    body: "The visual style you typed becomes the style bible behind every card. Change one line from IMAX documentary to handheld 16mm and the next pass boards it that way.",
  },
  {
    icon: Scissors,
    title: "Fix one shot, not the reel",
    body: '"Push in slower, more marine snow" revises that one clip and swaps it back into the card. Shot 2 changes, shots 1 and 3–6 never re-roll.',
  },
  {
    icon: Users,
    title: "Keep the subjects consistent",
    body: "The vessel, the submersible, the creatures, and the palette are saved as named entities. Name one in a shot and its description rides into that shot's prompt, so the same sub shows up on every dive.",
  },
];

const models = [
  {
    name: "A reasoning model",
    role: "Directs the board — the shot list, action, and camera notes",
    provider: "Gemini · Anthropic · OpenAI",
  },
  {
    name: "An image model",
    role: "Renders each card's still",
    provider: "GPT Image · Flux · Nano Banana",
  },
  {
    name: "A video model",
    role: "Animates approved stills into clips",
    provider: "Veo · Seedance · Kling",
  },
];

export default function DocumentaryTeaserUseCase() {
  return (
    <main className="relative min-h-screen overflow-hidden text-white bg-[#040408]">
      {/* Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute top-[22%] -left-40 h-[520px] w-[520px] rounded-full bg-cyan-600/20 blur-[140px]"
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-[30%] -right-40 h-[480px] w-[480px] rounded-full bg-indigo-600/20 blur-[140px]"
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
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-300">
                Use case
                <span className="text-cyan-500/60">·</span>
                Documentary
              </div>
              <h1 className="mt-6 text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
                Documentary Teaser Generator
              </h1>
              <p className="mt-6 text-lg md:text-xl text-slate-400 leading-relaxed">
                Describe the film in a sentence and the storyboard comes back
                readable: a card per shot, a still on every card. Approve the
                stills, animate those, and the clips land on a timeline you cut
                and export. The board below is one run — a deep-sea series
                teaser, surface to abyss in six shots.
              </p>
            </motion.div>

            {/* Hero video */}
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
                    "radial-gradient(ellipse at center, rgba(34,211,238,0.22), rgba(99,102,241,0.16) 45%, transparent 72%)",
                }}
              />
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-2 shadow-2xl backdrop-blur-sm">
                <video
                  src="/deep_teaser_example.mp4"
                  poster="/deep-shot-1-800.webp"
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
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-cyan-400 px-8 py-3.5 text-sm font-semibold text-black shadow-[0_10px_30px_-10px_rgba(34,211,238,0.6)] transition-all hover:bg-cyan-300"
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
                Four steps, all of them visible: a brief, a board, stills you
                approve, and a cut on the timeline.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={false}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-sm"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-300">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-white">
                    <span className="mr-2 font-mono text-sm text-cyan-400">
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

        {/* The board */}
        <section className="relative py-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-12 max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                Six cards on the board
              </h2>
              <p className="mt-4 text-lg text-slate-400 leading-relaxed">
                This is a single run of the board, straight out of NodeTool. Each
                card holds one beat, the prompt behind it, the still that prompt
                rendered, and the length of the clip it became. Re-roll a card
                you don&apos;t like — stills cost cents, and the rest of the
                board doesn&apos;t move.
              </p>
              <p className="mt-4 font-mono text-xs leading-relaxed text-slate-500">
                Style bible · {STYLE_BIBLE}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {shots.map((shot, i) => (
                <motion.div
                  key={shot.src}
                  initial={false}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: (i % 3) * 0.05 }}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5">
                    <span className="font-mono text-xs text-cyan-400">
                      Shot {String(i + 1).padStart(2, "0")}
                      <span className="ml-2 font-sans text-sm font-semibold text-white">
                        {shot.title}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                      <Check className="h-3 w-3" />
                      {shot.seconds}s clip
                    </span>
                  </div>
                  <Image
                    src={shot.src}
                    alt={shot.prompt}
                    width={1376}
                    height={768}
                    className="aspect-video w-full object-cover"
                  />
                  <div className="border-t border-white/5 px-4 py-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Prompt
                    </div>
                    <p className="mt-1.5 font-mono text-xs leading-relaxed text-slate-400">
                      {shot.prompt}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* The timeline */}
        <section className="relative py-20">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="mb-12 max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                Send the board to the timeline
              </h2>
              <p className="mt-4 text-lg text-slate-400 leading-relaxed">
                One click and the approved clips land on a track in shot order —
                here, 26 seconds of them. From there it&apos;s a normal edit:
                trim, reorder, lay narration and score under it, and export the
                cut.
              </p>
            </div>

            <div className="flex items-center gap-3 text-sm font-medium uppercase tracking-wide text-slate-400">
              <span className="h-px flex-1 bg-white/10" />
              <ArrowRight className="h-4 w-4 rotate-90 text-cyan-400" />
              Exported
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <motion.div
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6 }}
              className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50"
            >
              <video
                src="/deep_teaser_example.mp4"
                poster="/deep-shot-1-800.webp"
                className="aspect-video w-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                controls
              />
              <div className="border-t border-white/5 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                Output · DEEP — Life Below the Light, six shots, 26 seconds
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
                Nothing here is locked. Change the look, change the model,
                change one shot — the rest of the board stays where you left it.
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
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-300">
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
                    Three models, your pick
                  </h2>
                  <p className="mt-4 text-slate-400 leading-relaxed">
                    The board needs one model per job, and each is a dropdown.
                    They are called with your own keys — the bill comes from the
                    provider, not from us, and you can switch any of them for a
                    better model the day it ships.
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

        {/* Visible FAQ — and the FAQPage schema, from these same rows. */}
        <div className="relative py-8">
          <FaqSection
            items={documentaryTeaserUseCase.faq}
            className="mx-auto max-w-3xl px-6"
          />
        </div>

        {/* Closing CTA */}
        <section className="relative py-24">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Board your first dive
            </h2>
            <p className="mt-4 text-lg text-slate-400 leading-relaxed">
              Free, open source, and yours to run. Download Studio, open the
              storyboard, and board a teaser from one line today.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-full bg-cyan-400 px-8 py-3.5 text-sm font-semibold text-black shadow-[0_10px_30px_-10px_rgba(34,211,238,0.6)] transition-all hover:bg-cyan-300"
              />
              <a
                href="/use-cases/movie-trailer"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0a0a14]/70 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:border-white/25 hover:bg-white/5"
              >
                Build a movie trailer
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
