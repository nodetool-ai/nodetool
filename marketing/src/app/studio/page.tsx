"use client";
import { useGridParallax, usePrefersReducedMotion } from "../../lib/useGridParallax";
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Cpu,
  Shield,
  WifiOff,
  Code2,
  HardDrive,
  Zap,
  Github,
  Download,
  Layers,
  KeyRound,
} from "lucide-react";
import { SmartDownloadButton } from "../SmartDownloadButton";
import SiteHeader from "../../components/SiteHeader";
import HeroDemoPlayer from "../../components/HeroDemoPlayer";
import SiteFooter from "../../components/SiteFooter";

// The three-step story is the same one the landing page tells, so it is the
// same component — the two pages cannot drift on what NodeTool actually does.
const BuildRunDeploy = dynamic(
  () => import("../../components/BuildRunDeploy"),
  { ssr: true }
);
const ModelSupportSection = dynamic(
  () => import("../../components/ModelSupportSection"),
  { ssr: true }
);
const ModelManagerSection = dynamic(
  () => import("../../components/ModelManagerSection"),
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
    icon: WifiOff,
    title: "Works fully offline",
    body: "Once your local models are downloaded you can disconnect from the internet and keep working, whether you are travelling or on a machine with no network at all.",
  },
  {
    icon: Shield,
    title: "Your files never leave the device",
    body: "Projects, footage, prompts, and takes stay on your disk. Nothing is reported back to us, and nothing leaves the machine unless you call a remote provider on purpose.",
  },
  {
    icon: Cpu,
    title: "Run open weights locally",
    body: "Ollama, MLX for Apple Silicon, llama.cpp, and Hugging Face all work with the same building blocks. Pick any open model and pay no usage fees. When a cloud model is the better call, plug in your own API keys and pay the provider's price with no markup.",
  },
  {
    icon: Zap,
    title: "Use your GPU to the fullest",
    body: "NVIDIA graphics cards on Windows and Linux, Apple Silicon on macOS. Image, video, and audio work runs on your own hardware.",
  },
  {
    icon: HardDrive,
    title: "Own your model library",
    body: "The built-in model manager downloads and organizes model files and shares them across workflows, so you keep exactly the models you want.",
  },
  {
    icon: Code2,
    title: "The agent lives here too",
    body: "The chat agent drives every editor through the same tools you click, and the whole toolbelt speaks MCP — point Claude Desktop or Claude Code at Studio and they can build and run workflows on your machine.",
  },
];

const consPoints = [
  {
    title: "Hardware matters, if you run models locally",
    body: "Working through hosted providers needs no graphics card at all. Running open weights on your own machine does: for serious local work we suggest 16GB or more of RAM and at least 4GB of graphics memory.",
  },
  {
    title: "You manage updates",
    body: "When a new release comes out, you install it. Builds are signed and notarized for macOS and Windows, so updating stays simple.",
  },
  {
    title: "Disk space, if you download models",
    body: "The app installs and downloads nothing else on its own. Open weights are large, so if you want them: allow around 20GB for a small starter set, and considerably more for image and video models.",
  },
];

export default function StudioPage() {
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
      {/* Background — warm amber/orange tones to differentiate from Cloud */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/*
          Static, not animated. These are 448px and 416px circles under
          `blur(64px)`; drifting them 10px on an infinite framer-motion loop
          made Safari re-rasterize both blurred layers every frame and held the
          whole page at ~4fps for as long as it stayed open, so a tap on the
          menu waited up to a frame and the panel took over a second to paint.
          Chrome composited the same animation and stayed at 60fps, which is
          why it went unnoticed. Measured with
          `marketing/tests/e2e/idle-animation.spec.ts`.
        */}
        <div
          className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-amber-500/20 blur-3xl"
          style={{
            WebkitMaskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
            maskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-48 right-8 h-[26rem] w-[26rem] rounded-full bg-orange-500/20 blur-3xl"
          style={{
            WebkitMaskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
            maskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
          }}
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
        <section aria-labelledby="studio-hero-title" className="pt-2 relative">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -top-32 left-1/3 h-[28rem] w-[28rem] rounded-full bg-amber-500/15 blur-[120px]" />
            <div className="absolute -bottom-40 right-0 h-[26rem] w-[26rem] rounded-full bg-orange-500/10 blur-[120px]" />
            <div className="absolute top-1/2 -right-20 h-[20rem] w-[20rem] rounded-full bg-rose-500/10 blur-[120px]" />
          </div>
          <div className={sectionContainer}>
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12 py-12 md:py-20">
              <div className="lg:col-span-5">
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
                  <Cpu className="h-3.5 w-3.5" />
                  Studio · Desktop · Open source
                </span>
                {/* Sized a step below the landing hero's 3.25rem cap: this
                    headline carries an extra clause, and at that cap it wrapped
                    to five lines in the 5/12 column and pushed the demo out of
                    line with the copy. text-balance is off for the same reason
                    — it broke the short first line to equalise against the
                    much longer second one. */}
                <h1
                  id="studio-hero-title"
                  className="mt-6 text-[clamp(2rem,7vw,2.75rem)] font-bold leading-[1.1] tracking-tight text-white lg:text-[clamp(2rem,3.1vw,2.75rem)]"
                >
                  You are the director.
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-300 pb-[0.12em]">
                    The agent is your crew — on your hardware.
                  </span>
                </h1>
                <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-xl">
                  Describe your idea. The agent writes the script, storyboards
                  every scene, generates the footage, and cuts the timeline —
                  all of it on your own machine, on open weights through Ollama
                  and MLX, or on your own API keys when a cloud model is the
                  right call.
                </p>
                <div className="mt-8 flex flex-col gap-3">
                  <SmartDownloadButton
                    icon={<Download className="h-5 w-5" />}
                    classNameOverride="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-900/40 transition-all hover:bg-amber-400 hover:shadow-amber-900/60"
                  />
                  <p className="text-xs text-slate-400">
                    Free · AGPL-3.0 · macOS, Windows, Linux · No account
                    required ·{" "}
                    <a
                      href="https://github.com/nodetool-ai/nodetool/releases/latest"
                      className="underline underline-offset-2 hover:text-slate-200"
                    >
                      All downloads
                    </a>
                  </p>
                </div>
                <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-300">
                  <li className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-fuchsia-400" />
                    Script, storyboard, sketch, timeline, 3D
                  </li>
                  <li className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
                    Your own API keys, no token markups
                  </li>
                  <li className="flex items-center gap-1.5">
                    <WifiOff className="h-3.5 w-3.5 text-amber-300" />
                    Runs offline, files stay on your disk
                  </li>
                </ul>
                <div className="mt-6 inline-flex items-center gap-2 text-sm text-slate-400">
                  <span>Prefer the browser?</span>
                  <a
                    href="/cloud"
                    className="text-blue-300 hover:text-blue-200 underline underline-offset-2 font-medium"
                  >
                    Try NodeTool Cloud →
                  </a>
                </div>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
                  Build with connected nodes instead of a single prompt. Read
                  the{" "}
                  <a
                    href="/node-based-ai"
                    className="font-medium text-amber-200 underline underline-offset-2 hover:text-amber-100"
                  >
                    visual node-based AI guide
                  </a>{" "}and start from an editable template.
                </p>
              </div>
              <div className="relative lg:col-span-7">
                <div
                  aria-hidden
                  className="absolute -inset-6 -z-10 rounded-[2rem] opacity-70 blur-3xl"
                  style={{
                    background:
                      "radial-gradient(60% 60% at 50% 0%, rgba(251,191,36,0.30), transparent 60%), radial-gradient(50% 60% at 100% 100%, rgba(244,114,182,0.22), transparent 60%), radial-gradient(50% 60% at 0% 100%, rgba(249,115,22,0.22), transparent 60%)",
                  }}
                />
                <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-1.5 shadow-2xl shadow-black/60 ring-1 ring-white/5 backdrop-blur">
                  <HeroDemoPlayer
                    alt="NodeTool Studio: one sentence becomes a storyboard, rendered stills and clips, a cut on the timeline, and a finished film — all on your own machine"
                    caption="Storyboard, rendered shots, a cut on the timeline, a finished film — all on your own machine. Open it full screen to read the panels."
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works — the same three-step model the landing page tells,
            so a visitor entering on /studio learns what NodeTool does before
            learning why it runs locally. */}
        <section
          id="how"
          aria-labelledby="studio-how-title"
          className="rhythm-section py-16 scroll-mt-24"
        >
          <div className={sectionContainer}>
            <header className="mb-10 max-w-3xl">
              <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
                <span className="h-px w-8 bg-amber-300/60" />
                How it works
              </div>
              <h2
                id="studio-how-title"
                className="text-3xl md:text-5xl font-bold tracking-tight text-white"
              >
                One film shouldn&apos;t take five separate apps.
              </h2>
              <p className="mt-4 text-lg text-slate-400 leading-relaxed max-w-2xl">
                Pitch it, let the agent run it, then direct the final cut — one
                desktop app, one editable project, and nothing leaving the
                machine unless you send it.
              </p>
            </header>
            <BuildRunDeploy />
          </div>
        </section>

        {/* Why Studio (Pros) */}
        <section
          id="why-local"
          aria-labelledby="why-studio-title"
          className="rhythm-section py-20 scroll-mt-24"
        >
          <div className={sectionContainer}>
            <header className="mb-12 max-w-3xl">
              <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
                <span className="h-px w-8 bg-amber-300/60" />
                Why run locally
              </div>
              <h2
                id="why-studio-title"
                className="text-3xl md:text-5xl font-bold tracking-tight text-white"
              >
                Privacy, speed, and no usage fees.
              </h2>
              <p className="mt-4 text-lg text-slate-400 leading-relaxed max-w-2xl">
                Everything Studio does, it can do without a network connection.
                Your prompts, your files, and your models all stay on your own
                hardware.
              </p>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px rounded-2xl overflow-hidden bg-white/5 ring-1 ring-white/5">
              {proPoints.map((p) => (
                <div
                  key={p.title}
                  className="group relative h-full flex flex-col p-7 bg-slate-950 hover:bg-slate-900/60 transition-colors"
                >
                  <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-amber-300">
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

        {/* Honest tradeoffs */}
        <section
          aria-labelledby="studio-tradeoffs-title"
          className="rhythm-section py-20"
        >
          <div className={sectionContainer}>
            <header className="mb-10 max-w-3xl">
              <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                <span className="h-px w-8 bg-slate-500/60" />
                Honest tradeoffs
              </div>
              <h2
                id="studio-tradeoffs-title"
                className="text-3xl md:text-4xl font-bold tracking-tight text-white"
              >
                What Studio asks of you.
              </h2>
              <p className="mt-4 text-base text-slate-400 leading-relaxed max-w-2xl">
                Running everything on your own machine means taking on a few jobs
                the cloud would otherwise handle. If any of these feel like too
                much,{" "}
                <a
                  href="/cloud"
                  className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                >
                  NodeTool Cloud
                </a>{" "}
                runs the same workflows in your browser.
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

        {/* Local model support */}
        <div id="models">
          <ModelSupportSection reducedMotion={reducedMotion} />
        </div>

        {/* Model manager */}
        <ModelManagerSection />

        {/* Everything else NodeTool does lives on the main and agents pages —
            this page stays on its one question: why run it locally? */}
        <section className="rhythm-section py-16">
          <div className={sectionContainer}>
            <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800/80 bg-slate-950/60 p-8 text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-white">
                The full workspace, running locally.
              </h2>
              <p className="mt-4 text-slate-400 leading-relaxed">
                Studio is not a lite edition. The canvas, the agent, and every
                editor — script, storyboard, sketch, timeline, 3D, and mini
                apps — ship in the desktop app, and the agent drives all of
                them through the same tools you click.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium">
                <a
                  href="/#surfaces"
                  className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  See every editor →
                </a>
                <a
                  href="/agents"
                  className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                >
                  How the agent uses it →
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Editions compare — Studio highlighted */}
        <EditionsCompareSection
          reducedMotion={reducedMotion}
          highlight="studio"
        />

        {/* Open source reassurance */}
        <section className="rhythm-section py-16">
          <div className={sectionContainer}>
            <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800/80 bg-slate-950/60 p-8 text-center">
              <Github className="mx-auto h-8 w-8 text-slate-300 mb-4" />
              <h2 className="text-2xl md:text-3xl font-bold text-white">
                100% open source. Always.
              </h2>
              <p className="mt-4 text-slate-400 leading-relaxed">
                Studio is released under AGPL-3.0. Every building block, every
                provider, and every line that runs it is on GitHub. Read it, copy
                it, or host it yourself. There is no separate paid version.
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

        {/* Community */}
        <CommunitySection stars={stars} />

        <div className="mx-auto my-16 h-px max-w-6xl bg-gradient-to-r from-transparent via-amber-800/20 to-transparent" />

        <ContactSection />
      </div>

      <SiteFooter />
    </main>
  );
}
