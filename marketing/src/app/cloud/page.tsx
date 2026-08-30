"use client";
import { useGridParallax, usePrefersReducedMotion } from "../../lib/useGridParallax";
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Cloud,
  Globe,
  Zap,
  Users,
  KeyRound,
  RefreshCcw,
  Github,
  ArrowRight,
} from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import HeroDemoPlayer from "../../components/HeroDemoPlayer";
import SiteFooter from "../../components/SiteFooter";
import CloudWaitlist from "../../components/CloudWaitlist";

const ProvidersSection = dynamic(
  () => import("../../components/ProvidersSection"),
  { ssr: true }
);
const FeaturesSection = dynamic(
  () => import("../../components/FeaturesSection"),
  { ssr: true }
);
const EditionsCompareSection = dynamic(
  () => import("../../components/EditionsCompareSection"),
  { ssr: true }
);
const CommunitySection = dynamic(
  () => import("../../components/CommunitySection"),
  { ssr: true }
);
const ContactSection = dynamic(
  () => import("../../components/ContactSection"),
  { ssr: true }
);

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

const proPoints = [
  {
    icon: Zap,
    title: "Start in 30 seconds",
    body: "Sign in and pitch the piece. Start from the agent, an existing workflow, or a blank canvas — no installer, no drivers, nothing beyond a browser tab.",
  },
  {
    icon: Globe,
    title: "Works on any device",
    body: "Build on a laptop, tweak from a tablet, monitor from your phone. Your workflows follow you across machines.",
  },
  {
    icon: Users,
    title: "Share what you build",
    body: "Export a workflow as a single portable bundle — the graph plus its assets — and anyone can import and run it. Deeper team features are part of the alpha roadmap.",
  },
  {
    icon: KeyRound,
    title: "Bring your own keys",
    body: "OpenAI, Anthropic, Gemini, Mistral, Groq, Replicate, FAL, ElevenLabs, and HuggingFace all bill your account directly, not ours. No token markups.",
  },
  {
    icon: RefreshCcw,
    title: "Always on the latest version",
    body: "We release Cloud updates continuously: new building blocks, new providers, and fixes, with nothing for you to install.",
  },
  {
    icon: Cloud,
    title: "No GPU required",
    body: "We run the servers and the storage, and demanding image and video work runs at the providers you choose.",
  },
];

const consPoints = [
  {
    title: "Alpha — still early",
    body: "Cloud is in active alpha. Expect changes that break things, rough edges, and occasional downtime. Uptime and support guarantees arrive with the full release.",
  },
  {
    title: "No local models",
    body: "Cloud cannot run Ollama or MLX models, because those need direct access to your hardware. Use Studio if you want open models running on your own machine.",
  },
  {
    title: "Needs an internet connection",
    body: "Cloud is a hosted app. If you need offline workflows, install Studio.",
  },
  {
    title: "Your data lives with us",
    body: "Workflows and files are stored encrypted on our servers. If your data must never leave your device, choose Studio, or host the same open-source code yourself.",
  },
];

export default function CloudPage() {
  const [stars, setStars] = useState<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const parallaxRef = useGridParallax();

  useEffect(() => {
    fetch("https://api.github.com/repos/nodetool-ai/nodetool")
      .then((r) => r.json())
      .then((j) => setStars(j.stargazers_count))
      .catch(() => {});
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      {/* Background — cool blue/cyan tones to differentiate from Studio */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl"
          style={{
            WebkitMaskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
            maskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
          }}
          animate={reducedMotion ? undefined : { y: [0, 10, 0] }}
          transition={
            reducedMotion
              ? undefined
              : { duration: 18, repeat: Infinity, ease: "easeInOut" }
          }
        />
        <motion.div
          className="pointer-events-none absolute -bottom-48 right-8 h-[26rem] w-[26rem] rounded-full bg-cyan-500/20 blur-3xl"
          style={{
            WebkitMaskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
            maskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
          }}
          animate={reducedMotion ? undefined : { x: [0, -12, 0], y: [0, 4, 0] }}
          transition={
            reducedMotion
              ? undefined
              : { duration: 22, repeat: Infinity, ease: "easeInOut" }
          }
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "rgba(0,0,0,0.7)" }}
        />
        <div
          ref={parallaxRef}
          aria-hidden="true"
          className="fixed inset-0 bg-grid-pattern"
        />
      </div>

      <SiteHeader />

      <div
        id="content"
        className="relative isolate overflow-hidden pt-24 sm:pt-36 md:pt-24"
      >
        {/* Hero */}
        <section aria-labelledby="cloud-hero-title" className="pt-2 relative">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -top-32 left-1/3 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-[120px]" />
            <div className="absolute -bottom-40 right-0 h-[26rem] w-[26rem] rounded-full bg-cyan-500/10 blur-[120px]" />
            <div className="absolute top-1/2 -right-20 h-[20rem] w-[20rem] rounded-full bg-fuchsia-500/10 blur-[120px]" />
          </div>
          <div className={sectionContainer}>
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12 py-12 md:py-20">
              <div className="lg:col-span-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-200">
                    <Cloud className="h-3.5 w-3.5" />
                    Cloud · Browser · Open source
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
                    Alpha — not generally available
                  </span>
                </div>
                {/* Sized a step below the landing hero's 3.25rem cap: this
                    headline carries an extra clause, and at that cap it wrapped
                    to five lines in the 5/12 column and pushed the demo out of
                    line with the copy. text-balance is off for the same reason
                    — it broke the short first line to equalise against the
                    much longer second one. */}
                <h1
                  id="cloud-hero-title"
                  className="mt-6 text-[clamp(2rem,7vw,2.75rem)] font-bold leading-[1.1] tracking-tight text-white lg:text-[clamp(2rem,3.1vw,2.75rem)]"
                >
                  You are the director.
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-cyan-300 pb-[0.12em]">
                    The agent is your crew — in your browser.
                  </span>
                </h1>
                <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-xl">
                  Describe your idea. The agent writes the script, storyboards
                  every scene, generates the footage, and cuts the timeline —
                  all of it in the hosted version of the same open-source
                  studio. Nothing to install, no hardware to set up, and your
                  own API keys for whichever providers you want to use.
                </p>
                <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-4 text-sm text-amber-100/90 max-w-xl">
                  <strong className="text-amber-200">Heads up:</strong> Cloud is
                  in <strong className="text-amber-200">alpha</strong> and not
                  yet generally available. Expect rough edges, breaking changes,
                  and occasional downtime while we make it solid. For real
                  work today, use{" "}
                  <a
                    href="/studio"
                    className="underline underline-offset-2 hover:text-amber-50"
                  >
                    NodeTool Studio
                  </a>{" "}
                  or self-host.
                </div>
                <div className="mt-8 flex flex-col gap-4">
                  <a
                    href="https://app.nodetool.ai"
                    className="inline-flex w-fit items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-blue-900/40 transition-all"
                  >
                    Try the Cloud alpha
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <p className="text-xs text-slate-400">
                    Alpha preview · AGPL-3.0 source · Your own keys for every
                    provider · Self-host any time
                  </p>
                  <div className="mt-5 max-w-md">
                    <p className="mb-2 text-sm text-slate-300">
                      Not ready yet? Get notified as Cloud opens up.
                    </p>
                    <CloudWaitlist />
                  </div>
                </div>
                <div className="mt-6 inline-flex items-center gap-2 text-sm text-slate-400">
                  <span>Want to run it locally instead?</span>
                  <a
                    href="/studio"
                    className="text-blue-300 hover:text-blue-200 underline underline-offset-2 font-medium"
                  >
                    Get NodeTool Studio →
                  </a>
                </div>
              </div>
              <div className="relative lg:col-span-7">
                <div
                  aria-hidden
                  className="absolute -inset-6 -z-10 rounded-[2rem] opacity-70 blur-3xl"
                  style={{
                    background:
                      "radial-gradient(60% 60% at 50% 0%, rgba(59,130,246,0.32), transparent 60%), radial-gradient(50% 60% at 100% 100%, rgba(34,211,238,0.22), transparent 60%), radial-gradient(50% 60% at 0% 100%, rgba(168,85,247,0.22), transparent 60%)",
                  }}
                />
                <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-1.5 shadow-2xl shadow-black/60 ring-1 ring-white/5 backdrop-blur">
                  <HeroDemoPlayer alt="NodeTool Cloud: one sentence becomes a storyboard, rendered stills and clips, a cut on the timeline, and a finished film — all in the browser" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why Cloud */}
        <section
          id="why-cloud"
          aria-labelledby="why-cloud-title"
          className="rhythm-section py-20 scroll-mt-24"
        >
          <div className={sectionContainer}>
            <header className="mb-12 max-w-3xl">
              <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300/80">
                <span className="h-px w-8 bg-blue-300/60" />
                Why use the hosted version
              </div>
              <h2
                id="why-cloud-title"
                className="text-3xl md:text-5xl font-bold tracking-tight text-white"
              >
                Zero setup. Anywhere. Always current.
              </h2>
              <p className="mt-4 text-lg text-slate-400 leading-relaxed max-w-2xl">
                Cloud takes away the install, the hardware, and the upgrades,
                while leaving you in control of your provider keys and your
                workflows.
              </p>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px rounded-2xl overflow-hidden bg-white/5 ring-1 ring-white/5">
              {proPoints.map((p) => (
                <div
                  key={p.title}
                  className="group relative h-full flex flex-col p-7 bg-slate-950 hover:bg-slate-900/60 transition-colors"
                >
                  <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-blue-300">
                    <p.icon className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <h3 className="mb-2 text-base font-semibold tracking-tight text-white">
                    {p.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-400">
                    {p.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BYOK strip */}
        <section className="rhythm-section py-12">
          <div className={sectionContainer}>
            <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/60 to-cyan-950/60 p-8 md:p-10">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-200">
                    <KeyRound className="h-3.5 w-3.5" />
                    Bring your own keys
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white">
                    You pay providers directly. We never add a markup.
                  </h2>
                  <p className="mt-3 text-slate-300 max-w-2xl">
                    Cloud connects to OpenAI, Anthropic, Gemini, Mistral, Groq,
                    Replicate, FAL, ElevenLabs, HuggingFace, and more, using the
                    keys you provide. No hidden fees and no resold credits.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Honest tradeoffs */}
        <section
          aria-labelledby="cloud-tradeoffs-title"
          className="rhythm-section py-20"
        >
          <div className={sectionContainer}>
            <header className="mb-10 max-w-3xl">
              <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                <span className="h-px w-8 bg-slate-500/60" />
                Honest tradeoffs
              </div>
              <h2
                id="cloud-tradeoffs-title"
                className="text-3xl md:text-4xl font-bold tracking-tight text-white"
              >
                What Cloud doesn&apos;t do.
              </h2>
              <p className="mt-4 text-base text-slate-400 leading-relaxed max-w-2xl">
                If any of these matter to you, install{" "}
                <a
                  href="/studio"
                  className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                >
                  NodeTool Studio
                </a>{" "}
                — same workflows, same nodes, running on your hardware.
              </p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {consPoints.map((c) => (
                <div
                  key={c.title}
                  className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-6"
                >
                  <h3 className="text-base font-semibold text-white mb-2">
                    {c.title}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {c.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Providers */}
        <div id="providers">
          <ProvidersSection reducedMotion={reducedMotion} />
        </div>

        {/* Generic features */}
        <FeaturesSection />

        {/* Editions compare — Cloud highlighted */}
        <EditionsCompareSection
          reducedMotion={reducedMotion}
          highlight="cloud"
        />

        {/* Open source reassurance */}
        <section className="rhythm-section py-16">
          <div className={sectionContainer}>
            <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800/80 bg-slate-950/60 p-8 text-center">
              <Github className="mx-auto h-8 w-8 text-slate-300 mb-4" />
              <h2 className="text-2xl md:text-3xl font-bold text-white">
                Cloud is just our hosting of open-source code.
              </h2>
              <p className="mt-4 text-slate-400 leading-relaxed">
                Every building block, every provider, and every line of code
                behind Cloud is on GitHub under AGPL-3.0. If you ever want to run
                it yourself, everything we run is yours to run too. There are no
                cloud-only features and nothing kept closed.
              </p>
              <a
                href="https://github.com/nodetool-ai/nodetool"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-slate-500 hover:bg-slate-800 transition-colors"
              >
                <Github className="h-4 w-4" />
                View source on GitHub
              </a>
            </div>
          </div>
        </section>

        <CommunitySection stars={stars} />

        <div className="mx-auto my-16 h-px max-w-6xl bg-gradient-to-r from-transparent via-blue-800/20 to-transparent" />

        <ContactSection />
      </div>

      <SiteFooter />
    </main>
  );
}
